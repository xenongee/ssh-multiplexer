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

<!-- BEGIN BEADS INTEGRATION v:1 profile:full hash:0a1bbe8a -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Dolt-powered version control with native sync
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

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

### Quality
- Use `--acceptance` and `--design` fields when creating issues
- Use `--validate` to check description completeness

### Lifecycle
- `bd defer <id>` / `bd supersede <id>` for issue management
- `bd stale` / `bd orphans` / `bd lint` for hygiene
- `bd human <id>` to flag for human decisions
- `bd formula list` / `bd mol pour <name>` for structured workflows

### Auto-Sync

bd automatically syncs via Dolt:

- Each write auto-commits to Dolt history
- No manual export/import needed!

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Session Completion

**When ending a work session**, complete ALL steps below.

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Hand off** - Provide context for next session

**IMPORTANT**: Commit and push are ONLY done by the user after verification. Never auto-commit or auto-push.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) in English:

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code restructuring
- `chore:` — maintenance, version bumps, etc.
- `docs:` — documentation

Format: `<type>: <short description in English>`

<!-- END BEADS INTEGRATION -->
