# Архитектура SSH Multiplexer

## Бэкенд (модульный)

```
src/
├── server.js              — точка входа (40 строк), Express + Socket.IO
├── config/
│   └── ConfigService.js   — загрузка sshm.json
├── ssh/
│   ├── SshClient.js       — обёртка ssh2 клиента (85 строк, сложность 10)
│   └── SessionManager.js  — управление сессиями (65 строк)
├── socket/
│   └── SocketController.js — обработчики Socket.IO (94 строки, сложность 5)
└── utils/
    ├── connId.js          — генерация connId
    └── logger.js          — логирование
```

### Детали модулей

| Модуль | Экспорт | Ключевые методы |
|--------|---------|-----------------|
| `ConfigService.js` | `loadConfig(baseDir)` → service | `getPort()`, `getHost()`, `getTerminalDefaults()`, `getGroupNames()`, `getHostsByGroup(name)`, `findHostByConnId(id)` |
| `SshClient.js` | class `SshClient` | `connect()`, `write(data)`, `resize(cols, rows)`, `disconnect()` |
| `SessionManager.js` | class `SessionManager` | `createSession(socketId)`, `destroySession(socketId)`, `connect(socketId, connId, hostConfig, callbacks)`, `disconnect()`, `disconnectAll()`, `write()`, `broadcast()`, `resize()`, `destroyAll()` |
| `SocketController.js` | class `SocketController` | `initialize()`, private: `_onConnection()`, `_selectGroup()`, `_reconnect()`, `_connectSsh()`, `_disconnect()` |
| `connId.js` | `{ generateConnId, getDisplayHostString }` | Формат ConnId: `user@host:port` |
| `logger.js` | `{ info, warn, error }` | Тонкая обёртка над console |

### Поток данных

```
Браузер                         Сервер                          SSH-хосты
  │                              │                               │
  │──selectGroup──────────────► SocketController                 │
  │                              │──SessionManager.connect()──► SshClient.connect()
  │                              │                               │──ssh2 shell()
  │◄──term.create─────────────── │                               │
  │◄──term.shell.ready────────── │◄──cb.onReady()                │
  │◄──term.data(data)─────────── │◄──stream.on('data') ◄─────────┤
  │──term.input.specific────────► │──SshClient.write() ──────────►│
  │     (цикл по разблокированным)  │                               │
  │──term.resize────────────────► │──SshClient.resize() ─────────►│
  │                              │                               │
  │◄──term.close──────────────── │◄──cb.onClose() ◄──────────────┤
  │◄──term.error──────────────── │◄──cb.onError() ◄──────────────┤
```

### Socket.IO события

| Событие | Направление | Данные | Описание |
|---------|-------------|--------|----------|
| `selectGroup` | клиент→сервер | `groupName` | Подключиться ко всем хостам группы |
| `term.reconnect` | клиент→сервер | `connId` | Переподключить один терминал |
| `term.input.specific` | клиент→сервер | `connId, data` | Отправить данные в один терминал (также для broadcast — цикл по разблокированным) |
| `term.resize` | клиент→сервер | `connId, cols, rows` | Изменить размер PTY |
| `appConfig` | сервер→клиент | `{ terminalDefaults }` | Настройки xterm.js |
| `groups` | сервер→клиент | `string[]` | Доступные имена групп |
| `clearTerminals` | сервер→клиент | — | Удалить все элементы терминалов |
| `term.create` | сервер→клиент | `connId, displayHostString` | Создать обёртку терминала |
| `term.shell.ready` | сервер→клиент | `connId` | SSH shell готов, инициализировать xterm |
| `term.data` | сервер→клиент | `connId, data` | stdout данные из SSH |
| `term.close` | сервер→клиент | `connId, reason` | Соединение закрыто |
| `term.error` | сервер→клиент | `connId, errorMsg` | Ошибка соединения |
| `errorMsg` | сервер→клиент | `message` | Общая ошибка сервера |

## Фронтенд (ES модули)

```
src/public/
├── client.js              — точка входа (59 строк), инициализация
├── index.html             — главная страница с <template> для терминалов
├── style.css              — стили (тёмная тема, сетка, статусы)
├── fonts/                 — шрифты (Inter 400/700 + курсив)
└── modules/
    ├── state.js           — глобальное состояние + DOM-ссылки
    ├── render.js          — render-функции (terminals, controls, status)
    ├── terminal.js        — терминалы (создание, fit, fullscreen, lock)
    ├── input.js           — обработка клавиш/paste (212 строк, сложность 38)
    ├── socket.js          — обработчики Socket.IO
    └── ui.js              — DOM event listeners, help modal
```

### Модули

| Модуль | Ответственность |
|--------|-----------------|
| `state.js` | Экспортирует `state` (terminals, currentGroupName, terminalDefaults) и `dom` (кэш DOM-элементов) |
| `render.js` | `renderTerminals()`, `renderControls()`, `renderConnectionStatus()` — централизованное обновление UI |
| `terminal.js` | Создание/удаление терминалов, fit/resize, fullscreen, lock |
| `input.js` | Обработка клавиш и paste, генерация ANSI escape-последовательностей, маршрутизация broadcast/specific |
| `socket.js` | Все Socket.IO события, connection status |
| `ui.js` | Инициализация UI: кнопки, селекты, help modal |

### Конечный автомат терминала

```
connecting ──► ready (xterm инициализирован, принимает ввод)
     │              │
     │              ├──► closed (SSH-поток завершён)
     │              ├──► error (ошибка SSH-соединения)
     │              └──► connecting (переподключение)
     │
     ├──► error (соединение не удалось)
     └──► closed (отключение сервера)
```

Состояния хранятся в `state.terminals[connId]`: `isConnecting`, `isReady`, `hasError`, `isClosed`, `isLocked`. Каждое изменение вызывает `renderTerminals()` → переключение CSS-класса → визуальное обновление.

### Паттерн State → Render → UI

Функции мутируют `state`, затем вызывают соответствующий `render()`:
```js
function setTerminalLock(connId, isLocked) {
  state.terminals[connId].isLocked = isLocked;
  renderTerminals();
}
```

### Широковещательный vs индивидуальный ввод

| Режим | Триггер | Цель |
|-------|---------|------|
| **Индивидуальный** | Прямой xterm.js `onData` | Один терминал (`term.input.specific`) |
| **Broadcast** | Поле ввода команд | Цикл по всем разблокированным; если fullscreen активен — только fullscreen-терминал |

Заблокированные терминалы (`isLocked: true`) исключаются из broadcast. Визуально: бордер `--lock-color` + сниженная прозрачность.

### Обработка ввода (`input.js`)

Конвертирует нажатия клавиш в ANSI escape-последовательности:

- **Ctrl+A-Z** → управляющие коды `\x01`-`\x1a`
- **Alt+key** → последовательности `\x1b + key`
- **Функциональные клавиши** → `\x1bO[P-S]` (F1-F4), `\x1b[N~` (F5-F12)
- **Shift+F1-F10** → `\x1b[N+23~`
- **Навигация** → `\x1b[A` (вверх), `\x1b[B` (вниз) и т.д.
- **Спецсимволы** → `\x7f` (backspace), `\r` (enter), `\t` (tab)
- **Ctrl+стрелки** → `\x1b[1;5D` и т.д.

События paste отправляют сырой текст буфера обмена напрямую в терминалы.

### Раздача вендорных библиотек

Вендорные библиотеки раздаются из `node_modules/` через Express static routes (без bundler):
```
/vendor/socket.io    → node_modules/socket.io-client/dist
/vendor/xterm/css    → node_modules/@xterm/xterm/css
/vendor/xterm/lib    → node_modules/@xterm/xterm/lib
/vendor/xterm-addon-fit/lib → node_modules/@xterm/addon-fit/lib
```

## Ключевые детали реализации

- **Определение пути конфига**: `process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..')` — различает собранный бинарник и режим разработки
- **Формат ConnId**: `user@host:port` (например `root@192.168.1.1:22`)
- **Создание терминалов**: HTML `<template id="terminalTemplate">` + `document.importNode()` — без JS template-строк
- **Keepalive SshClient**: `keepaliveInterval: 15000`, `readyTimeout: 20000`, `tryKeyboard: true`
- **Debounce resize**: fit терминалов с задержкой 50мс (`fitTimeout`), ресайз окна 150мс (`resizeTimeout`)
- **Индикатор глобального ввода**: 200мс CSS-подсветка обёрток терминалов (класс `global-input-active`)
- **SSH-аутентификация**: только по паролю (без ключей), пароль в открытом виде в `sshm.json`
- **Graceful shutdown**: SIGINT → `sessions.destroyAll()` → `io.close()` → `server.close()` → exit, с принудительным таймаутом 5с
- **Fullscreen**: переключение CSS-класса на обёртке + `has-fullscreen-terminal` на контейнере, скрывает все non-fullscreen через `display: none`
- **Lock**: CSS-класс `locked-state` → `opacity: 0.7` + `border-color: var(--lock-color)` + тёмный фон
- **pkg сборка**: цели `node18-linux-x64` и `node18-win-x64`, сжатие Brotli, glob ассетов включает `src/public/**/*` и вендорные библиотеки

## Подключение

ES модули через `<script type="module" src="client.js">` (без bundler). Вендорные скрипты загружаются обычными `<script>` тегами перед модулем.
