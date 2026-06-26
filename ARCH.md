# SSH Multiplexer Architecture

## Backend (modular)

```
src/
├── server.js              — entry point (40 lines), Express + Socket.IO
├── config/
│   └── ConfigService.js   — load sshm.json
├── ssh/
│   ├── SshClient.js       — ssh2 client wrapper (85 lines)
│   └── SessionManager.js  — session management (65 lines)
├── socket/
│   └── SocketController.js — Socket.IO handlers (94 lines)
└── utils/
    ├── connId.js          — generate connId
    └── logger.js          — logging
```

### Module details

| Module | Exports | Key methods |
|--------|---------|-------------|
| `ConfigService.js` | `loadConfig(baseDir)` → service | `getPort()`, `getHost()`, `getTerminalDefaults()`, `getGroupNames()`, `getHostsByGroup(name)`, `findHostByConnId(id)` |
| `SshClient.js` | class `SshClient` | `connect()`, `write(data)`, `resize(cols, rows)`, `disconnect()` |
| `SessionManager.js` | class `SessionManager` | `createSession(socketId)`, `destroySession(socketId)`, `connect(socketId, connId, hostConfig, callbacks)`, `disconnect()`, `disconnectAll()`, `write()`, `broadcast()`, `resize()`, `destroyAll()` |
| `SocketController.js` | class `SocketController` | `initialize()`, private: `_onConnection()`, `_selectGroup()`, `_reconnect()`, `_connectSsh()`, `_disconnect()` (called for both `disconnect` and `error` socket events) |
| `connId.js` | `{ generateConnId, getDisplayHostString }` | ConnId format: `user@host:port` |
| `logger.js` | `{ info, warn, error }` | Thin wrapper over console |

### Data flow

```
Browser                        Server                         SSH Hosts
  │                              │                               │
  │──selectGroup──────────────► SocketController                 │
  │                              │──SessionManager.connect()──► SshClient.connect()
  │                              │                               │──ssh2 shell()
  │◄──term.create─────────────── │                               │
  │◄──term.shell.ready────────── │◄──cb.onReady()                │
  │◄──term.data(data)─────────── │◄──stream.on('data') ◄─────────┤
  │──term.input.specific───────► │──SshClient.write() ──────────►│
  │──term.input.broadcast.key──► │──SessionManager.broadcast()──►│
  │──term.resize───────────────► │──SshClient.resize() ─────────►│
  │                              │                               │
  │◄──term.close──────────────── │◄──cb.onClose() ◄──────────────┤
  │◄──term.error──────────────── │◄──cb.onError() ◄──────────────┤
```

### Socket.IO events

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `selectGroup` | client→server | `groupName` | Connect to all hosts in group |
| `term.reconnect` | client→server | `connId` | Reconnect single terminal |
| `term.input.specific` | client→server | `connId, data` | Send data to one specific terminal |
| `term.input.broadcast.key` | client→server | `data` | Send data to all connections in session |
| `term.resize` | client→server | `connId, cols, rows` | Resize PTY |
| `appConfig` | server→client | `{ terminalDefaults }` | xterm.js settings |
| `groups` | server→client | `string[]` | Available group names |
| `clearTerminals` | server→client | — | Remove all terminal elements |
| `term.create` | server→client | `connId, displayHostString` | Create terminal wrapper |
| `term.shell.ready` | server→client | `connId` | SSH shell ready, init xterm |
| `term.data` | server→client | `connId, data` | stdout data from SSH |
| `term.close` | server→client | `connId, reason` | Connection closed |
| `term.error` | server→client | `connId, errorMsg` | Connection error |
| `errorMsg` | server→client | `message` | General server error |

## Frontend (ES modules)

```
src/public/
├── client.js              — entry point (59 lines), initialization
├── index.html             — main page with <template> for terminals
├── style.css              — styles (dark theme, grid, statuses)
├── fonts/                 — fonts (Inter 400/700 + italics)
└── modules/
    ├── state.js           — global state + DOM references
    ├── render.js          — render functions (terminals, controls, status)
    ├── terminal.js        — terminals (create, fit, fullscreen, lock)
    ├── input.js           — keyboard/paste handling (212 lines, complexity 38)
    ├── socket.js          — Socket.IO event handlers (217 lines)
    └── ui.js              — DOM event listeners, help modal (178 lines)
```

### Modules

| Module | Responsibility |
|--------|-----------------|
| `state.js` | Exports `state` (terminals, currentGroupName, terminalDefaults, timeouts) and `dom` (DOM element cache). Shared mutable state imported by all modules. |
| `render.js` | `renderTerminals()` — CSS class toggles + lock emoji + cursor blink; `renderControls()` — enables/disables input/buttons based on group/terminal state; `renderConnectionStatus()` — status bar with info/error/reconnecting classes. |
| `terminal.js` | `createTerminalElement()` — clones `<template>`, returns wrapper/outputDiv/reconnectBtn; `displayTerminalMessage()` — status text via xterm `writeln` (ANSI) or HTML `<p>`; `setTerminalState()` — update flags + re-render; `setTerminalLock()` — toggle lock + re-render; `fitTerminal()` — fit addon + emit resize; `fitRelevantTerminalsDebounced()` — 50ms debounce, fullscreen-aware; `setTerminalMinWidth()` — CSS var + re-fit; `clearAllTerminals()` — dispose xterm, clear DOM, exit fullscreen; `exitFullscreen()` — remove CSS classes; `getFullscreenTermInfo()` — return active fullscreen termInfo or null. |
| `input.js` | `sendDataToTerminals()` — routes to fullscreen or loops all unlocked; `showGlobalInputActivity()` — 200ms CSS glow (suppressed in fullscreen); `handleCommandKeydown()` — ANSI sequence generator for all keys; `handleCommandPaste()` — clipboard → all unlocked terminals. |
| `socket.js` | `initSocket()` — registers all server→client event handlers: `connect` (re-select group), `disconnect`, `connect_error`, `appConfig`, `groups`, `clearTerminals`, `term.create`, `term.shell.ready` (creates xterm + FitAddon + onData), `term.data`, `term.close`, `term.error`, `errorMsg`. |
| `ui.js` | `initUI()` — wires: group select change, reconnect group btn, term width input (change/input/wheel), invert locks btn, unlock all btn, delegated click on terminals container (lock/reconnect/expand), window resize (150ms debounce); `initHelpModal()` — help button + Escape to close + click-outside. |

### Terminal state machine

```
connecting ──► ready (xterm initialized, accepting input)
     │              │
     │              ├──► closed (SSH stream ended)
     │              ├──► error (SSH connection error)
     │              └──► connecting (reconnect)
     │
     ├──► error (connection failed)
     └──► closed (server disconnect)
```

States are tracked per `state.terminals[connId]`: `isConnecting`, `isReady`, `hasError`, `isClosed`, `isLocked`. Each state change calls `renderTerminals()` → CSS class toggle → visual update.

### State → Render → UI Pattern

Functions mutate `state`, then call the corresponding `render()`:
```js
function setTerminalLock(connId, isLocked) {
  state.terminals[connId].isLocked = isLocked;
  renderTerminals();
}
```

### Broadcast vs specific input

| Mode | Trigger | Socket event | Target |
|------|---------|-------------|--------|
| **Terminal-local** | Direct xterm.js `onData` callback | `term.input.specific` | Single terminal |
| **Command input broadcast** | `commandInput` keydown/paste | `term.input.specific` (client-side loop per unlocked terminal) | All unlocked ready terminals |
| **Fullscreen broadcast** | `commandInput` in fullscreen mode | `term.input.specific` | Only the fullscreen terminal |
| **Server-side broadcast** | `term.input.broadcast.key` | Single event → all connections | All connections in session |

Locked terminals (`isLocked: true`) are excluded from broadcast. Visual indicator: `--lock-color` border + reduced opacity.

### Input handling (`input.js`)

Converts keystrokes to ANSI escape sequences:

- **Ctrl+A-Z** → control codes `\x01`-`\x1a`
- **Ctrl+arrows** → `\x1b[1;5D` etc.
- **Ctrl+Backspace** → `\x17`, **Ctrl+Space** → `\x00`, **Ctrl+[** → `\x1b`, **Ctrl+\\** → `\x1c`, **Ctrl+]** → `\x1d`, **Ctrl+^** → `\x1e`, **Ctrl+_** → `\x1f`
- **Alt+key** → `\x1b + key` sequences
- **Alt+W** → `\x17`, **Alt+Backspace** → `\x1b\x7f`
- **Function keys** → `\x1bO[P-S]` (F1-F4), `\x1b[N~` (F5-F12)
- **Shift+F1-F10** → `\x1b[N~` (N = 23-32), **Shift+F11-F12** → `\x1b[23;2~` / `\x1b[24;2~`
- **Navigation** → `\x1b[A` (up), `\x1b[B` (down), etc.
- **Special** → `\x7f` (backspace), `\r` (enter), `\t` (tab)
- **Shift+Tab** → `\x1b[Z`
- **Home/End/PgUp/PgDn/Del/Ins/Esc** → standard xterm sequences

Paste events send raw clipboard text directly to all unlocked terminals.

Global shortcuts:
- **Alt+X** — focus `commandInput` (document-level capture phase handler)
- **Alt+W** — delete word back (handled via ANSI sequence `\x17`)
- **Ctrl+U** — delete to line start (handled via ANSI sequence `\x15`)
- **Ctrl+K** — delete to line end (handled via ANSI sequence `\x0b`)

### Vendor serving

Vendor libraries are served from `node_modules/` via Express static routes (not bundled):
```
/vendor/socket.io    → node_modules/socket.io-client/dist
/vendor/xterm/css    → node_modules/@xterm/xterm/css
/vendor/xterm/lib    → node_modules/@xterm/xterm/lib
/vendor/xterm-addon-fit/lib → node_modules/@xterm/addon-fit/lib
```

### API endpoints

| Endpoint | Method | Response | Description |
|----------|--------|----------|-------------|
| `/api/version` | GET | `{ version: "v1.1.3" }` | Server version (from package.json) |
| `/` | GET | index.html | SPA entry point |
| `/client.js` | GET | ES module | Frontend entry module |

## Key implementation details

- **Config path resolution**: `process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..')` — distinguishes packaged binary vs dev mode
- **ConnId format**: `user@host:port` (e.g. `root@192.168.1.1:22`)
- **Display string**: host config `label` if set, otherwise `user@host`
- **Terminal creation**: HTML `<template id="terminalTemplate">` + `document.importNode()` — no JS template strings
- **SshClient keepalive**: `keepaliveInterval: 15000`, `readyTimeout: 20000`, `tryKeyboard: true`
- **xterm config**: cursorBlink, convertEol, scrollback: 1000, allowProposedApi, dark theme colors
- **Resize debouncing**: fit terminals debounced at 50ms (`fitTimeout`), window resize at 150ms (`resizeTimeout`)
- **Global input activity indicator**: 200ms CSS glow on terminal wrappers (`global-input-active` class), suppressed in fullscreen
- **SSH auth**: password-only (no key-based auth), plaintext in `sshm.json`
- **Graceful shutdown**: SIGINT → `sessions.destroyAll()` → `io.close()` → `server.close()` → exit, with 5s forced timeout
- **Fullscreen**: CSS class toggle on wrapper + `has-fullscreen-terminal` on container + `terminal-fullscreen-active` on body, hides non-fullscreen terminals via `display: none`
- **Lock**: CSS class `locked-state` → `opacity: 0.7` + `border-color: var(--lock-color)` + darker background; lock button emoji toggles 🔒/🔓
- **Terminal header buttons**: lock (🔒/🔓), reconnect (↻), expand/collapse (▣/▢)
- **pkg build**: targets `node18-linux-x64` and `node18-win-x64`, Brotli compression, assets glob includes `src/public/**/*` and vendor libs
- **Reconnection logic**: On Socket.IO reconnect, if a group was previously selected, it re-emits `selectGroup` automatically
- **Tab close guard**: `beforeunload` handler shows confirmation dialog before closing/navigating away
- **Min width control**: number input + mouse wheel (step 10, range 200-2000), updates CSS `--terminal-min-width` variable
- **Help modal**: Escape key closes, click-outside closes, shows Alt+X, Alt+W, Ctrl+U, Ctrl+K shortcuts
- **Error states**: `connect_error` handler clears terminals + shows error status; `errorMsg` server event shows `alert()`
- **Config defaults**: `app_port: 3333`, `app_host: "127.0.0.1"`, terminal defaults `{ fontFamily: "monospace", fontSize: 11, minWidth: 400 }`

## Loading

ES modules via `<script type="module" src="client.js">` (no bundler). Vendor scripts loaded as regular `<script>` tags before the module.

`client.js` initialization order (`DOMContentLoaded`):
1. `initDom()` — cache all DOM references
2. Inject dynamic CSS (`--terminal-min-width`)
3. Create Socket.IO client (`io()`)
4. `initSocket(socket)` — register all event handlers
5. `initUI(socket)` — wire all user interactions
6. Wire `commandInput` keydown/paste handlers
7. Fetch `/api/version` → update `#appVersion`
8. Render initial controls state
