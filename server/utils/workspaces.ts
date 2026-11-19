import type { H3Event } from 'h3'
import { DomainError, type Workspace } from '../../shared/workspace'

type WorkspaceRow = { id: string; brand: Workspace['brand']; data: Workspace['data']; revision: number }

export async function loadWorkspace(event: H3Event, owner: string, workspaceId: string) {
  const { data, error } = await serviceClient(event).from('workspaces').select('id, brand, data, revision')
    .eq('owner_id', owner).eq('id', workspaceId).maybeSingle<WorkspaceRow>()
  if (error) throw createError({ statusCode: 502, statusMessage: 'Workspace read failed' })
  if (!data) throw new DomainError('워크스페이스를 찾을 수 없습니다.', 404)
  return data
}
export async function updateWorkspace(event: H3Event, owner: string, workspaceId: string, change: (workspace: Workspace) => void) {
  const db = serviceClient(event)
  for (let attempt = 0; attempt < 5; attempt++) {
    const workspace = await loadWorkspace(event, owner, workspaceId)
    change(workspace)
    const { data, error } = await db.from('workspaces').update({ data: workspace.data, revision: workspace.revision + 1 })
      .eq('id', workspaceId).eq('owner_id', owner).eq('revision', workspace.revision).select('id').maybeSingle()
    if (error) throw createError({ statusCode: 502, statusMessage: 'Workspace update failed' })
    if (data) return { id: workspace.id, brand: workspace.brand, data: workspace.data }
  }
  throw new DomainError('다른 변경이 저장되고 있습니다. 다시 시도해 주세요.', 409)
}
