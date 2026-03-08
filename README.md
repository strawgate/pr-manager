# PR Manager

Browser-first, BYOK PR triage dashboard.

## Quick start

```bash
npm install
npm run dev
```

## Current MVP

- Vite + React + TypeScript SPA
- Feature-based app structure
- BYOK settings persisted in `sessionStorage`
- OpenRouter via Vercel AI SDK (`ai` + `@openrouter/ai-sdk-provider`)
- Unified PR state machine domain module
- Split data pipeline: GraphQL query -> mapper -> bucket classification
- GitHub GraphQL dashboard query across authored, review-requested, assigned PRs
- Quick `/ai` and `@copilot` comment actions per PR

## Notes

- GitHub browser calls omit `X-GitHub-Api-Version` to avoid CORS preflight rejection.
- This app does not include a backend; all API calls are direct from the browser.
