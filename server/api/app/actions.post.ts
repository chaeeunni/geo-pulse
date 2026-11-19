import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { actionSchema, aiInput, applyAi, change, DomainError, idSchema, type AiInput, type AiResult } from '../../../shared/workspace'

export default defineEventHandler(async event => {
  requireOrigin(event)
  const { user } = await requireUser(event)
  const { workspaceId, action } = await readValidatedBody(event, z.object({ workspaceId: idSchema, action: actionSchema }).parse)
  const now = new Date().toISOString()

  try {
    if (!('requestId' in action)) {
      const id = randomUUID()
      const workspace = await updateWorkspace(event, user.id, workspaceId, entry => change(entry.data, action, id, now))
      return { workspace, error: null }
    }

    const workspace = await loadWorkspace(event, user.id, workspaceId)
    const input = aiInput(workspace.data, action)
    const settings = geminiSettings(event)
    const db = serviceClient(event)
    const { data: claim, error: claimError } = await db.rpc('claim_ai_job', {
      p_id: action.requestId, p_owner: user.id, p_workspace: workspaceId,
      p_action: action, p_input: input, p_model: settings.model,
    })
    if (claimError) throw new DomainError('AI 작업을 시작할 수 없습니다.', 502)
    if (claim.status === 'no_credit') throw new DomainError('유효한 이용권과 남은 AI 실행 횟수가 필요합니다.', 402)
    if (claim.status === 'busy' || claim.status === 'conflict') {
      throw new DomainError('이 작업이 진행 중이거나 다른 요청에 사용되었습니다.', 409)
    }

    let result = claim.result as AiResult | null
    let failure = claim.error as string | null
    const savedInput = claim.input as AiInput
    if (claim.status === 'claimed') {
      try {
        result = await requestGemini(settings, workspace.brand, action, savedInput, claim.started_at)
      } catch (error) {
        failure = error instanceof DomainError ? error.message : 'AI 응답 시간이 초과됐거나 연결할 수 없습니다.'
        if (action.type !== 'generate') {
          result = { run: {
            id: action.requestId, question: savedInput.question, at: claim.started_at,
            model: settings.model, language: 'ko', search: true, promptVersion: 1,
            kind: action.type === 'verify' ? 'verification' : 'diagnosis', status: 'error',
            answer: '', citations: [], observations: [], format: '스펙 FAQ', evidence: '', error: failure,
          } }
        }
      }
      const { error: finishError } = await db.rpc('finish_ai_job', {
        p_id: action.requestId, p_owner: user.id, p_result: result, p_error: failure,
      })
      if (finishError) throw new DomainError('AI 결과를 저장할 수 없습니다. 진행 중인 작업을 확인해 주세요.', 502)
    }

    if (!result) return { workspace: { id: workspace.id, brand: workspace.brand, data: workspace.data }, error: failure }
    const updated = await updateWorkspace(event, user.id, workspaceId, entry => applyAi(entry.data, action, savedInput, result!))
    return { workspace: updated, error: failure }
  } catch (error) {
    return handleDomain(error)
  }
})
