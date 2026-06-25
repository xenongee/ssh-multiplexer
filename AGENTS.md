# AGENTS.md

## Commands

- `npm run dev` — start with nodemon (auto-restart on file changes)
- `npm run server` — start with plain node
- `npm run build` — build standalone binaries via `@yao-pkg/pkg` (outputs to `dist/`) - DON'T RUN THIS
- No test, lint, or typecheck scripts exist

## Architecture

See [ARCH.md](ARCH.md) for full architecture: data flow, Socket.IO events, terminal state machine, module details, and implementation notes.

## Security Notes


- No `.env` or secrets management — all config lives in `sshm.json`.
- Server binds to `127.0.0.1:3333` by default (localhost only).
- SSH connections use password auth only (no key-based auth).

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

### User Workflow Pipeline

**CRITICAL**: The following workflow must be followed for ALL tasks:

1. **Create task** in bd
2. **Execute** the task (implement code)
3. **User verifies** the result (manual testing or code review)
4. **Close task** after user approval

**Commit and push rules:**
- NEVER commit or push without explicit user approval
- Changes remain unstaged until user says to commit
- Commit and push are ONLY done by the user
- Do NOT auto-commit or auto-push — even after task completion
