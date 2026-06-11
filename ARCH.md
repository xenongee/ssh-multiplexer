# SSH Multiplexer Architecture

## Backend (modular)

```
src/
├── server.js              — entry point (40 lines), Express + Socket.IO
├── config/
│   └── ConfigService.js   — load sshm.json
├── ssh/
│   ├── SshClient.js       — ssh2 client wrapper (85 lines, complexity 10)
│   └── SessionManager.js  — session management (65 lines)
├── socket/
│   └── SocketController.js — Socket.IO handlers (94 lines, complexity 5)
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
| `SocketController.js` | class `SocketController` | `initialize()`, private: `_onConnection()`, `_selectGroup()`, `_reconnect()`, `_connectSsh()`, `_disconnect()` |
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
  │     (loops per unlocked)     │                               │
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
| `term.input.specific` | client→server | `connId, data` | Send data to one terminal (also used for broadcast — loop over unlocked terminals) |
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
    ├── socket.js          — Socket.IO handlers
    └── ui.js              — DOM event listeners, help modal
```

### Modules

| Module | Responsibility |
|--------|-----------------|
| `state.js` | Exports `state` (terminals, currentGroupName, terminalDefaults) and `dom` (DOM element cache) |
| `render.js` | `renderTerminals()`, `renderControls()`, `renderConnectionStatus()` — centralized UI updates |
| `terminal.js` | Create/remove terminals, fit/resize, fullscreen, lock |
| `input.js` | Keyboard and paste handling, ANSI escape sequence generation, broadcast/specific routing |
| `socket.js` | All Socket.IO events, connection status |
| `ui.js` | UI initialization: buttons, selects, help modal |

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

| Mode | Trigger | Target |
|------|---------|--------|
| **Specific** | Direct xterm.js `onData` | Single terminal (`term.input.specific`) |
| **Broadcast** | Command input field | Loop over all unlocked terminals; if fullscreen is active — only the fullscreen terminal |

Locked terminals (`isLocked: true`) are excluded from broadcast. Visual indicator: `--lock-color` border + reduced opacity.

### Input handling (`input.js`)

Converts keystrokes to ANSI escape sequences:

- **Ctrl+A-Z** → control codes `\x01`-`\x1a`
- **Alt+key** → `\x1b + key` sequences
- **Function keys** → `\x1bO[P-S]` (F1-F4), `\x1b[N~` (F5-F12)
- **Shift+F1-F10** → `\x1b[N+23~`
- **Navigation** → `\x1b[A` (up), `\x1b[B` (down), etc.
- **Special** → `\x7f` (backspace), `\r` (enter), `\t` (tab)
- **Ctrl+arrows** → `\x1b[1;5D` etc.

Paste events send raw clipboard text directly to terminals.

### Vendor serving

Vendor libraries are served from `node_modules/` via Express static routes (not bundled):
```
/vendor/socket.io    → node_modules/socket.io-client/dist
/vendor/xterm/css    → node_modules/@xterm/xterm/css
/vendor/xterm/lib    → node_modules/@xterm/xterm/lib
/vendor/xterm-addon-fit/lib → node_modules/@xterm/addon-fit/lib
```

## Key implementation details

- **Config path resolution**: `process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..')` — distinguishes packaged binary vs dev mode
- **ConnId format**: `user@host:port` (e.g. `root@192.168.1.1:22`)
- **Terminal creation**: HTML `<template id="terminalTemplate">` + `document.importNode()` — no JS template strings
- **SshClient keepalive**: `keepaliveInterval: 15000`, `readyTimeout: 20000`, `tryKeyboard: true`
- **Resize debouncing**: fit terminals debounced at 50ms (`fitTimeout`), window resize at 150ms (`resizeTimeout`)
- **Global input activity indicator**: 200ms CSS glow on terminal wrappers (`global-input-active` class)
- **SSH auth**: password-only (no key-based auth), plaintext in `sshm.json`
- **Graceful shutdown**: SIGINT → `sessions.destroyAll()` → `io.close()` → `server.close()` → exit, with 5s forced timeout
- **Fullscreen**: CSS class toggle on wrapper + `has-fullscreen-terminal` on container, hides all non-fullscreen terminals via `display: none`
- **Lock**: CSS class `locked-state` → `opacity: 0.7` + `border-color: var(--lock-color)` + darker background
- **pkg build**: targets `node18-linux-x64` and `node18-win-x64`, Brotli compression, assets glob includes `src/public/**/*` and vendor libs

## Loading

ES modules via `<script type="module" src="client.js">` (no bundler). Vendor scripts loaded as regular `<script>` tags before the module.
