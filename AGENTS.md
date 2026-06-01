# AGENTS.md

## Commands

- `npm run dev` — start with nodemon (auto-restart on file changes)
- `npm run server` — start with plain node
- `npm run build` — build standalone binaries via `@yao-pkg/pkg` (outputs to `dist/`)
- No test, lint, or typecheck scripts exist

## Architecture

Single-file backend (`server.js`) serving a vanilla JS frontend (`public/`).

- **server.js** — Express 5 + Socket.IO + ssh2. Handles config loading, static serving, SSH session management, and all Socket.IO events.
- **public/client.js** — Browser-side Socket.IO client, xterm.js terminal rendering, UI logic.
- **public/index.html** — Single page; terminal grid + group selector.
- **public/style.css** — Dark theme, grid layout, status indicators.
- **sshm.json** — Runtime config: port, host, terminal defaults, host groups with credentials. Loaded at startup.

## Key Details

- Config path resolution uses `process.pkg` to distinguish packaged binary vs dev mode (`server.js:10`).
- Vendor libs (xterm, socket.io-client) are served from `node_modules/` via Express static routes, not bundled.
- `sshm.json` contains plaintext passwords and is tracked by git. Never log or echo credential values.
- No `.env` or secrets management — all config lives in `sshm.json`.
- Server binds to `127.0.0.1:3333` by default (localhost only).
- SSH connections use password auth only (no key-based auth).
- `gendoc.sh` generates `project_list.md` (a code dump for external LLM context); output is gitignored.

## Coding Guidelines

### Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### Simplicity First

- No features beyond what was asked. No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken. Match existing style.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Every changed line should trace directly to the user's request.

### Goal-Driven Execution

- Transform tasks into verifiable goals with success criteria.
- For multi-step tasks, state a brief plan with verification at each step.
- Strong success criteria let you loop independently. Weak criteria require clarification first.

### Recalibrate Time Estimates

- Don't cut corners on something you can finish this session.
- "We don't have time to do it right" is usually wrong. "Later" rarely arrives.
- If the proper version genuinely takes days, say so — don't silently downgrade to a shortcut.
