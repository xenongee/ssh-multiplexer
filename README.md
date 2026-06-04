# SSH Multiplexer

Web application for simultaneous management of multiple SSH sessions through a browser. Select server groups and connect to all hosts in a group at once — terminals are displayed in an adaptive grid on a single page. Supports broadcast input (one command to all terminals) and individual input to each terminal.

## Features

- **Group connection** — servers are organized into groups; selecting a group opens terminals for all hosts in the group
- **Broadcast command input** — input in the "Input" field is sent simultaneously to all connected terminals
- **Individual input** — each terminal accepts input independently (click on terminal to focus)
- **Reconnect** — reconnect individual host or entire group
- **Fullscreen** — each terminal can be expanded to full screen
- **Terminal lock** — lock individual terminal (visually highlighted with `--lock-color`)
- **Adaptive grid** — minimum terminal width is dynamically adjustable
- **Status notifications** — status bar with connection/error/reconnection indicators
- **Dynamic version** — application version loaded via `/api/version`
- **Binary build** — standalone executables built via `@yao-pkg/pkg` for Linux and Windows

## Keyboard Shortcuts

| Combination | Context | Action |
|---|---|---|
| `Alt+X` | Global | Focus on command input field |
| `Alt+W` | Terminal | Delete word (`\x17`, delete word) |
| `Alt+D` | Terminal | Delete from cursor to end of line (`\x04`) |
| `Alt+K` | Terminal | Delete from cursor to end of line (`\x0b`) |
| `Alt+U` | Terminal | Delete from beginning of line to cursor (`\x15`) |
| `Ctrl+Backspace` | Terminal | Delete word (sends `\x17`) |
| `beforeunload` | Global | Warning when closing tab |

## Configuration (`sshm.json`)

Runtime configuration in JSON format. Loaded at server startup. Full schema:

```json
{
  "app_port": 3333,                    // optional, default 3333
  "app_host": "127.0.0.1",             // optional, default 127.0.0.1
  "terminal_defaults": {               // optional, xterm.js props
    "fontFamily": "'Fira Code', monospace",
    "fontSize": 11,
    "minWidth": 600
  },
  "groups": [
    {
      "group": "Name",                  // unique group name
      "hosts": [
        {
          "label": "PC-01",            // display name in terminal
          "user": "root",
          "host": "192.168.1.1",
          "port": 22,                  // optional, default 22
          "password": "secret"         // plaintext (see Security)
        }
      ]
    }
  ]
}
```

## Project Structure

```
ssh-multiplexer/
├── src/
│   ├── server.js                # Entry point (Express + Socket.IO, ~50 lines)
│   ├── config/
│   │   └── ConfigService.js     # Load and validate sshm.json
│   ├── ssh/
│   │   ├── SshClient.js         # Wrapper over ssh2.Client (no socket.io)
│   │   └── SessionManager.js    # SSH session management (no socket.io)
│   ├── socket/
│   │   └── SocketController.js  # Socket.IO event handlers (no ssh2)
│   ├── utils/
│   │   ├── connId.js            # Generate unique connection IDs
│   │   └── logger.js            # Logging
│   └── public/                  # Frontend (ES modules)
│       ├── client.js            # Entry point (initialization)
│       ├── index.html           # Main page
│       ├── style.css            # Styles (dark theme, grid, statuses)
│       └── modules/
│           ├── state.js         # Global state + DOM references
│           ├── render.js        # Render functions (terminals, controls, status)
│           ├── terminal.js      # Terminals (create, fit, fullscreen)
│           ├── input.js         # Keyboard/paste handling
│           ├── socket.js        # Socket.IO handlers
│           └── ui.js            # DOM event listeners, help modal
├── package.json                 # Dependencies, scripts, pkg configuration
├── sshm.json                    # Application config (host groups, port, terminal)
├── gendoc.sh                    # Script to generate project_list.md
├── .gitignore
└── dist/                        # Built binaries (npm run build)
    ├── ssh-multiplexer-linux     # Linux x64 executable
    ├── ssh-multiplexer-win.exe   # Windows x64 executable
    └── sshm.json                 # Config copy for dist
```

## Architecture

### Server

Server is divided into independent modules:

| Module | Responsibility |
|---|---|
| `ConfigService` | Load, validate and merge `sshm.json` |
| `SshClient` | Wrapper over `ssh2.Client`, manage single SSH connection |
| `SessionManager` | Session collection, reconnect, lifecycle (no socket.io) |
| `SocketController` | All Socket.IO events, UI logic (no ssh2) |
| `server.js` | Entry point, initialization and module wiring |

### Frontend

Client side uses ES modules (no bundler):

| Module | Responsibility |
|---|---|
| `state.js` | Global state (`terminals`, `currentGroupName`) + DOM references |
| `render.js` | Centralized render functions: `renderTerminals()`, `renderControls()`, `renderConnectionStatus()` |
| `terminal.js` | Create/remove terminals, fit/resize, fullscreen, lock |
| `input.js` | Keyboard and paste handling, send data to terminals |
| `socket.js` | All Socket.IO events, connection status |
| `ui.js` | UI initialization: buttons, selects, help modal |
| `client.js` | Entry point, initialization and module wiring |

Pattern: functions mutate `state` → call `render()` → UI updates.

### Data Flow

1. **On startup** `server.js` reads `sshm.json` via `ConfigService`, starts HTTP server on `127.0.0.1:3333`
2. **Browser** connects via Socket.IO, receives group list and terminal settings
3. **On group selection** `SocketController` delegates to `SessionManager`, which creates `SshClient` for each host
4. **Data** from SSH stream is forwarded to browser via Socket.IO (`term.data`), input from browser goes back to SSH stream (`term.input.specific` / `term.input.broadcast.key`)
5. **Broadcast input** — sends keystroke to all active terminals simultaneously

## Running

```bash
# Development
npm run dev

# Production
npm run server

# Build binaries
npm run build
```
