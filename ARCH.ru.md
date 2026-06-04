# Архитектура SSH Multiplexer

## Бэкенд (модульный)

```
src/
├── server.js              — точка входа, Express + Socket.IO
├── config/
│   └── ConfigService.js   — загрузка sshm.json
├── ssh/
│   ├── SshClient.js       — ssh2 клиент
│   └── SessionManager.js  — управление сессиями
├── socket/
│   └── SocketController.js — обработчики Socket.IO
└── utils/
    ├── connId.js          — генерация connId
    └── logger.js          — логирование
```

## Фронтенд (ES модули)

```
src/public/
├── client.js              — точка входа (59 строк), инициализация
├── index.html             — главная страница
├── style.css              — стили (тёмная тема, сетка, статусы)
├── fonts/                 — шрифты (Fira Code)
└── modules/
    ├── state.js           — глобальное состояние + DOM-ссылки
    ├── render.js          — render-функции (terminals, controls, status)
    ├── terminal.js        — терминалы (создание, fit, fullscreen)
    ├── input.js           — keyboard/paste handling
    ├── socket.js          — Socket.IO обработчики
    └── ui.js              — DOM event listeners, help modal
```

### Модули

| Модуль | Ответственность |
|--------|-----------------|
| `state.js` | Экспортирует `state` (terminals, currentGroupName, terminalDefaults) и `dom` (кэш DOM-элементов) |
| `render.js` | `renderTerminals()`, `renderControls()`, `renderConnectionStatus()` — централизованное обновление UI |
| `terminal.js` | Создание/удаление терминалов, fit/resize, fullscreen, lock |
| `input.js` | Обработка клавиш и paste, отправка данных в терминалы |
| `socket.js` | Все Socket.IO события, connection status |
| `ui.js` | Инициализация UI: кнопки, селекты, help modal |

### Паттерн state → render → UI

Функции мутируют `state`, затем вызывают соответствующий `render()`:
```js
function setTerminalLock(connId, isLocked) {
  state.terminals[connId].isLocked = isLocked;
  renderTerminals();
}
```

### Подключение

ES модули через `<script type="module" src="client.js">` (без bundler).
