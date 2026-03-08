# Browser SPA architecture plan: six critical decisions resolved

**Both GitHub and Anthropic APIs support direct browser CORS calls, making a pure client-side TypeScript SPA fully viable for a BYOK developer tool.** The GitHub API has supported CORS since its early days with `Access-Control-Allow-Origin: *`, while Anthropic added browser support in August 2024 via an explicit opt-in header. Combined with the mature Vite + React + TypeScript stack and modern tooling like Biome and Vitest, you can build a zero-backend SPA that calls both APIs directly from the browser. The main architectural constraints are: OAuth token exchange for GitHub requires a backend (or user-provided PATs), neither CLI tool supports deep linking from browsers, and localStorage-stored keys require strong XSS defenses.

---

## 1. GitHub REST API allows full CORS with one critical caveat

The GitHub API at `api.github.com` returns **`Access-Control-Allow-Origin: *`** on all responses, enabling cross-origin requests from any browser origin. Preflight responses explicitly allow the `Authorization` header alongside `Content-Type`, `If-Match`, `If-Modified-Since`, `If-None-Match`, `If-Unmodified-Since`, and `X-Requested-With`. The preflight cache duration is **86,400 seconds** (24 hours), and all standard REST methods (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`) are permitted.

Using a PAT with `Authorization: Bearer ghp_xxxxx` from a browser SPA works technically — the header passes CORS validation and authenticates at **5,000 requests/hour** (vs 60/hour unauthenticated). There is no rate limit difference between browser and server requests; limits are determined purely by authentication status.

**The critical caveat**: the `X-GitHub-Api-Version` header is **not** included in `Access-Control-Allow-Headers`. Sending it from a browser triggers a CORS preflight failure. Simply omit this header in browser requests — the API defaults to the latest stable version. Additionally, some endpoints that redirect to `codeload.github.com` (like archive downloads) fail CORS because that subdomain lacks CORS headers.

For authentication, **GitHub's OAuth token exchange endpoint does not support CORS**. The `/login/oauth/access_token` endpoint explicitly blocks cross-origin requests, meaning you cannot complete an OAuth Authorization Code flow purely in the browser. Your options are:

- **User-provided PAT (simplest for BYOK)**: User pastes a fine-grained PAT into your app. Works immediately via CORS. Scope it minimally with fine-grained tokens.
- **OAuth with backend proxy**: Use the Authorization Code flow but exchange the code server-side via a small edge function (Cloudflare Worker, Vercel Function).
- **GitHub App with backend**: The most secure option, supporting expiring tokens and fine-grained repository permissions, but requires server infrastructure for token exchange.

For a BYOK architecture where users supply their own credentials, the PAT approach is the pragmatic choice. GitHub recommends treating tokens like passwords and warns that any XSS vulnerability could expose tokens stored in browser-accessible storage.

---

## 2. Anthropic API supports browser CORS with an explicit opt-in header

Since August 2024, `api.anthropic.com` supports direct browser calls via an **explicit opt-in header**: `anthropic-dangerous-direct-browser-access: true`. Without this header, CORS requests receive an `authentication_error` response. The intentionally alarming header name signals that the developer acknowledges the security implications of exposing API keys client-side.

A complete browser fetch call requires four headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `x-api-key` | `sk-ant-...` | Authentication |
| `anthropic-version` | `2023-06-01` | API version |
| `content-type` | `application/json` | Request format |
| `anthropic-dangerous-direct-browser-access` | `true` | CORS opt-in |

The official TypeScript SDK (`@anthropic-ai/sdk`) wraps this cleanly with a `dangerouslyAllowBrowser: true` constructor option that automatically injects the CORS header:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: userProvidedKey,
  dangerouslyAllowBrowser: true,
});

const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});
```

**BYOK is the primary recommended use case** for browser access. Anthropic's acknowledged valid scenarios include internal tools, BYOK apps where users supply their own key, and developer/tinkering tools. The pattern is straightforward: user enters their API key in a settings UI, the app stores it in `localStorage`, and all requests go directly from the browser to `api.anthropic.com` — no proxy server needed.

One organizational caveat: some Anthropic organizations have CORS disabled at the org level and must contact support to enable it, though most orgs have access by default.

---

## 3. The 2025 TypeScript SPA stack has clear winners in every category

The ecosystem has consolidated significantly. Here are the recommended choices with their rationale:

**Vite + React + TypeScript** remains the undisputed foundation. Vite 7 is the current stable release with **31 million weekly npm downloads**, having surpassed Webpack for the first time in July 2025. Vite 8 (beta, December 2025) introduces Rolldown as the unified bundler — Linear reported production build times dropping from **46 seconds to 6 seconds**. No competitor comes close: Turbopack is Next.js-only, Rspack targets Webpack migration, and Farm is too early-stage.

**Bun** is production-ready as a **Node.js replacement for running Vite and managing packages**. With 7 million monthly downloads and Anthropic's acquisition of the project in late 2025, it has strong backing. Use `bun install` (10–30× faster than npm) and `bunx --bun vite` for dev/build. Don't use Bun's own bundler for frontend — it lacks Vite's HMR maturity and plugin ecosystem. About 5% of Node.js APIs remain unimplemented, but this rarely affects Vite-based workflows.

**Biome** (the Rust-based successor to Rome) is the recommended choice for new projects, replacing both ESLint and Prettier with a single tool. It's **15–25× faster** than ESLint for linting and handles formatting with 97% Prettier compatibility. A single `biome.json` replaces multiple config files. The main limitation is a smaller plugin ecosystem — no GraphQL, YAML, or Vue SFC support yet. For projects needing niche ESLint plugins, use ESLint 9's flat config format. Keep **Oxlint** on your radar as an emerging 50× faster alternative for pure linting.

**Vitest** is the standard testing framework for Vite projects with a **98% retention rate** in the State of JS 2024 survey. It's 10–20× faster than Jest in watch mode and shares Vite's config/plugins. Vitest 4.0 graduated Browser Mode from experimental to stable, enabling tests against real browser APIs instead of jsdom. Jest 30's ESM support remains experimental, making it relevant only for React Native projects.

**TanStack Query v5** handles server/async state (caching, refetching, pagination, optimistic updates) while **Zustand** (~1KB) handles client UI state. This separation eliminates 80–90% of what Redux previously managed. SWR is a lighter alternative for simple cases, and Jotai offers fine-grained atomic state for complex UIs like form builders or editors.

**shadcn/ui** is the momentum leader for UI components — it copies component source code into your project (built on Radix primitives + Tailwind CSS), giving you full ownership with no version lock-in. Choose **MUI** only when you need advanced data components (DataGrid, Charts) or Material Design compliance. **Mantine** is a strong middle-ground alternative offering comprehensive components with modern DX.

| Category | Primary pick | Runner-up |
|----------|-------------|-----------|
| Build tool | Vite 7 (→ 8 when stable) | Rsbuild (Webpack migration) |
| Runtime | Bun | Node.js 22 |
| Framework | React 19 + TypeScript | SolidJS |
| Routing | TanStack Router (type-safe) | React Router v7 |
| Server state | TanStack Query v5 | SWR |
| Client state | Zustand | Jotai |
| Lint/format | Biome | ESLint 9 flat config + Prettier |
| Testing | Vitest + React Testing Library | Playwright (E2E) |
| Components | shadcn/ui + Tailwind CSS v4 | MUI or Mantine |

---

## 4. CLI deep linking from browsers requires creative workarounds

**Neither `gh copilot` nor `claude` CLI register custom URI scheme handlers.** There is no `gh://` or `claude://` protocol. Both tools are purely terminal-based, with browser interactions flowing only in one direction: CLI → browser (for OAuth authentication), never browser → CLI.

**VS Code and Cursor do support URI schemes.** `vscode://file/{path}:line:column` opens files, and `vscode://vscode.git/clone?url={repo}` triggers git clones. Cursor extends this with `cursor://anysphere.cursor-deeplink/mcp/install?name={name}&config={base64}` for one-click MCP server installation — a production example of web-to-editor deep linking. However, neither `vscode://` nor `cursor://` can execute arbitrary terminal commands or invoke Copilot/Claude features directly.

**iTerm2 on macOS** is the one terminal emulator with deep link support: `iterm2:///command?c={url-encoded-command}` opens a new session and runs the command (with a confirmation dialog). This is macOS-only and requires iTerm2 specifically.

The recommended UX patterns, ranked by implementation complexity:

**Tier 1 — Clipboard + instructions (works everywhere, no setup):** Display the constructed CLI command in a styled code block with a one-click copy button using `navigator.clipboard.writeText()`. Show a clear "Paste in your terminal" instruction. This is how Homebrew, Docker Hub, npm, and Claude Code's own install page handle it. For maximum utility, construct context-rich commands: `claude -p "Review PR #123 for security issues" --output-format json`.

**Tier 2 — VS Code/Cursor extension:** Build a lightweight extension that registers a URI handler (`vscode://your-extension/run-cli?tool=claude&prompt=...`), opens an integrated terminal, and executes the command. Requires users to install your extension.

**Tier 3 — Local WebSocket bridge:** Run a small local server (e.g., on `localhost:19876`) that accepts commands from the browser via WebSocket and spawns `claude -p` or `copilot -p` processes, streaming output back. Powerful but requires a background process.

**Tier 4 — Browser extension + native messaging (1Password model):** The most secure approach. A browser extension communicates with a native messaging host binary via stdio (not HTTP), which invokes CLI tools. No open network ports, cryptographically verified by the browser. Highest development effort.

Both CLI tools accept rich programmatic input via `-p` (print/headless) mode: `claude -p "prompt" --output-format json --allowedTools "Read,Write"` and `copilot -p "prompt" --allow-all-tools --autopilot`. This makes clipboard-based invocation practical — the web app constructs a fully parameterized command string.

---

## 5. GitHub GraphQL fetches all open PRs efficiently with aliased search queries

The most efficient approach uses GitHub's `search` connection with **GraphQL aliases** to combine three searches (authored, review-requested, assigned) into a **single API call**. A critical detail: when searching PRs through the `search` connection, you must use `type: ISSUE` (not `PULL_REQUEST`), with `is:pr` in the search query string.

```graphql
query PRDashboard($first: Int = 50) {
  authored: search(
    query: "is:pr is:open author:@me archived:false sort:updated-desc"
    type: ISSUE, first: $first
  ) { ...SearchResult }
  reviewRequested: search(
    query: "is:pr is:open review-requested:@me archived:false sort:updated-desc"
    type: ISSUE, first: $first
  ) { ...SearchResult }
  assigned: search(
    query: "is:pr is:open assignee:@me archived:false sort:updated-desc"
    type: ISSUE, first: $first
  ) { ...SearchResult }
  rateLimit { cost remaining resetAt }
}

fragment SearchResult on SearchResultItemConnection {
  issueCount
  pageInfo { hasNextPage endCursor }
  nodes {
    ... on PullRequest {
      number title url isDraft createdAt updatedAt
      author { login avatarUrl }
      repository { nameWithOwner isPrivate isFork }
      additions deletions changedFiles mergeable
      reviewDecision
      labels(first: 10) { nodes { name color } }
      reviewRequests(first: 10) {
        nodes { requestedReviewer { ... on User { login } ... on Team { name } } }
      }
      latestReviews(first: 10) {
        nodes { author { login } state submittedAt }
      }
      comments(last: 3) { totalCount nodes { author { login } body createdAt } }
      commits(last: 1) {
        nodes { commit { statusCheckRollup {
          state
          contexts(first: 25) {
            checkRunCountsByState { state count }
          }
        }}}
      }
    }
  }
}
```

The `@me` alias automatically resolves to the authenticated user. This query returns **review status** (`reviewDecision`: APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED), **CI status** (via `statusCheckRollup.state`: SUCCESS, FAILURE, PENDING), **labels**, **comments** with content, **requested reviewers** (users and teams), **mergeable status**, **draft status**, and **diff size** (additions, deletions, changedFiles).

For rate limits, the GraphQL API provides **5,000 points/hour** for authenticated users. A typical dashboard query combining three aliased searches at `first: 50` costs approximately **1–3 points** — verified by including `rateLimit { cost }` in the query. Key optimization: use `checkRunCountsByState` instead of listing individual check runs (this is the pattern GitHub's own CLI uses internally). The search endpoint returns a **maximum of 1,000 results** per query, which is rarely a constraint for open PRs.

Paginate with cursor-based pagination: check `pageInfo.hasNextPage`, then use `pageInfo.endCursor` as the `after` variable in subsequent requests per alias.

---

## 6. Feature-based folder structure with strict security boundaries

The consensus project structure for a Vite + React + TypeScript SPA follows the **Bulletproof React pattern** (34.6k GitHub stars) — organizing by business feature rather than file type:

```
src/
├── app/                    # App shell: router, providers, root component
│   ├── routes/             # Page components (lazy-loaded)
│   ├── provider.tsx        # Global providers (QueryClient, Theme)
│   └── router.tsx          # Route definitions
├── components/             # Shared UI (Button, Modal, Layout)
│   └── ui/                 # shadcn/ui primitives
├── config/                 # Validated env vars, constants
├── features/               # ← Core: self-contained feature modules
│   ├── auth/
│   │   ├── api/            # TanStack Query hooks for auth endpoints
│   │   ├── components/     # Feature-scoped components
│   │   ├── hooks/          # Feature-scoped hooks
│   │   ├── stores/         # Zustand stores for this feature
│   │   └── types/          # Feature-scoped TypeScript types
│   ├── dashboard/
│   └── settings/
├── hooks/                  # Shared hooks (useDebounce, useLocalStorage)
├── lib/                    # Pre-configured libraries (API client, query client)
├── stores/                 # Global Zustand stores
├── types/                  # Shared TypeScript types
└── utils/                  # Shared utilities
```

The critical rule: **unidirectional dependency flow** — `shared → features → app`. Features cannot import from `app/` or from other features. Compose features at the route/page level. Enforce this with ESLint's `import/no-restricted-paths` rule.

**Avoid barrel files** (`index.ts` re-exports) in Vite projects. Bulletproof React updated its guidance in 2025: barrel files prevent effective tree-shaking and slow down HMR. Import directly from source files: `import { UserProfile } from '@/features/auth/components/user-profile'` instead of `from '@/features/auth'`.

For path aliases, configure `@/*` in both `tsconfig.app.json` (`"paths": { "@/*": ["./src/*"] }`) and `vite.config.ts` (`resolve.alias`), or use the `vite-tsconfig-paths` plugin to auto-sync them.

Key TypeScript settings: `"strict": true`, `"moduleResolution": "bundler"` (designed for Vite), `"isolatedModules": true` (required by Vite/esbuild), `"noEmit": true` (Vite handles bundling), and `"target": "ES2020"`.

For **BYOK API key security**, the threat model is different from developer-embedded secrets — the user is storing *their own* key. Best practices for this scenario:

- **Use `sessionStorage`** over `localStorage` when persistence across sessions isn't needed (auto-clears on tab close)
- **Encrypt at rest** with the Web Crypto API: derive a key from a user passphrase via PBKDF2, then encrypt with AES-GCM. This protects against casual inspection but not determined XSS attacks
- **Deploy strict Content Security Policy**: `script-src 'self'`, whitelist only necessary `connect-src` domains (`api.github.com`, `api.anthropic.com`), and set `object-src 'none'`
- **Minimize third-party scripts** — every dependency is potential XSS attack surface
- **Never use `dangerouslySetInnerHTML`** — React auto-escapes by default
- **Provide a clear "Delete my keys" button** and document that keys are stored locally

A single SPA generally **does not need monorepo tooling**. The feature-based structure within `src/` provides sufficient modularity. Use pnpm as the package manager (strict dependency resolution, fast installs) with a flat project structure. Add workspaces only when you actually extract shared packages or add additional apps.

---

## Conclusion

This architecture is fully viable as a **zero-backend, pure client-side SPA**. Both GitHub and Anthropic APIs support authenticated CORS requests directly from the browser, with GitHub providing `Access-Control-Allow-Origin: *` and Anthropic requiring the `anthropic-dangerous-direct-browser-access: true` opt-in header. The BYOK pattern — where users provide their own API keys stored in encrypted `localStorage` — is explicitly supported by both providers and eliminates proxy server infrastructure entirely.

The technology stack has unusually clear consensus in 2025: Vite 7 + React 19 + TypeScript with Bun as runtime, Biome for linting/formatting, Vitest for testing, TanStack Query + Zustand for state, and shadcn/ui for components. The one area requiring creative UX design is CLI integration — clipboard-based command construction with one-click copy is the pragmatic baseline, with VS Code extension URI handlers as an upgrade path.

The most underappreciated finding: GitHub's GraphQL `search` connection with aliases enables fetching all of a user's open PRs (authored, reviewing, assigned) across every repo in a **single API call costing 1–3 rate limit points**, returning review decisions, CI status, labels, and comments. This makes a rich PR dashboard trivially efficient to build and keep updated.