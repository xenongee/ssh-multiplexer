# SSH Multiplexer Architecture

## Backend (modular)

```
src/
├── server.js              — entry point, Express + Socket.IO
├── config/
│   └── ConfigService.js   — load sshm.json
├── ssh/
│   ├── SshClient.js       — ssh2 client
│   └── SessionManager.js  — session management
├── socket/
│   └── SocketController.js — Socket.IO handlers
└── utils/
    ├── connId.js          — generate connId
    └── logger.js          — logging
```

## Frontend (ES modules)

```
src/public/
├── client.js              — entry point (59 lines), initialization
├── index.html             — main page
├── style.css              — styles (dark theme, grid, statuses)
├── fonts/                 — fonts (Fira Code)
└── modules/
    ├── state.js           — global state + DOM references
    ├── render.js          — render functions (terminals, controls, status)
    ├── terminal.js        — terminals (create, fit, fullscreen)
    ├── input.js           — keyboard/paste handling
    ├── socket.js          — Socket.IO handlers
    └── ui.js              — DOM event listeners, help modal
```

### Modules

| Module | Responsibility |
|--------|-----------------|
| `state.js` | Exports `state` (terminals, currentGroupName, terminalDefaults) and `dom` (DOM element cache) |
| `render.js` | `renderTerminals()`, `renderControls()`, `renderConnectionStatus()` — centralized UI updates |
| `terminal.js` | Create/remove terminals, fit/resize, fullscreen, lock |
| `input.js` | Keyboard and paste handling, send data to terminals |
| `socket.js` | All Socket.IO events, connection status |
| `ui.js` | UI initialization: buttons, selects, help modal |

### State → Render → UI Pattern

Functions mutate `state`, then call the corresponding `render()`:
```js
function setTerminalLock(connId, isLocked) {
  state.terminals[connId].isLocked = isLocked;
  renderTerminals();
}
```

### Loading

ES modules via `<script type="module" src="client.js">` (no bundler).
