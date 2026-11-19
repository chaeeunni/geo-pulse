# Repository Guidelines

## Project Structure

- [PRD.md](PRD.md) defines GEO Pulse workflows, terminology, and acceptance criteria. [DESIGN-mercury.md](DESIGN-mercury.md) supplies visual references.
- `app/` holds Nuxt pages, layouts, Vue components, and styles. Public pages are `/` and `/pricing`. The workspace and its public sample share `/app`.
- `shared/` contains workspace validation, KPI formulas, and demo fixtures. Nitro routes and service adapters live in `server/`. Database migrations live in `supabase/migrations/` and regression tests in `tests/`.

## Development

Use Node.js 22.12+ or 24 LTS and npm. Run `npm ci` to install from the lockfile, `npm run dev` for local development, and `npm run build` for the deployable server bundle. Use `npm run preview` to run that bundle locally. The public sample works without service credentials. See [README.md](README.md) for Supabase, Gemini, Groble, and Vercel configuration.

Use two spaces in TypeScript and Vue. Use PascalCase for components and camelCase for functions and variables. Keep workspace rules in shared TypeScript and enforce authenticated actions in Nitro. Match existing Korean terminology when editing UI copy and PRD requirements. Keep keys on the server and use separate preview and production configurations.

## Testing

Run `npm run typecheck` and `npm test` before submitting. Vitest files use `*.test.ts`. Update the relevant test when changing KPI denominators, diagnosis and verification matching, or payment validation. Use the PRD’s completion criteria to exercise the full workflow in a browser. Verify real OAuth, grounding, and signed webhooks with preview service credentials.

## Commits and Pull Requests

Use short imperative subjects such as `Preserve the published baseline on retry`. In pull requests, cite the affected PRD section, link the issue if available, and report how you verified the change. Include screenshots for visual changes.
