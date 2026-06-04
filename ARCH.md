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

## Фронтенд (монолитный, требует рефакторинга)

**Файл:** `src/public/client.js` — 584 строки, 12 функций, 0 классов

### Метрики
- Cyclomatic complexity: 88 (высокая)
- Avg function lines: 42.67
- classList.toggle: 21 вызов
- Socket events: 20+ обработчиков
- DOM events: 10+ listeners

### Функции (по строкам)
| Функция | Строка | Назначение |
|---------|--------|------------|
| createTerminalElement | 32 | Создание DOM элемента терминала |
| displayTerminalMessage | 45 | Вывод сообщений (connecting/error/closed) |
| setTerminalState | 67 | Переключение состояний (4x classList.toggle) |
| setTerminalLockUI | 83 | UI блокировки терминала |
| fitTerminal | 93 | Подгонка размера терминала |
| fitRelevantTerminalsDebounced | 103 | Debounced fit с fullscreen check |
| setTerminalMinWidth | 116 | Установка мин. ширины |
| updateGlobalControlsState | 123 | Обновление UI контролов |
| clearAllTerminals | 135 | Очистка всех терминалов |
| sendDataToTerminals | 144 | Отправка данных (fullscreen check) |
| showGlobalInputActivity | 162 | Индикатор активности (fullscreen check) |
| setConnectionStatus | 172 | Статус подключения |

### Повторяющиеся паттерны (вынести в модули)
1. **Fullscreen check** — 3 места: строки 106, 146, 163
2. **Fullscreen exit** — дубли: clearAllTerminals (139-140), groupSelect change (336-340)
3. **classList.toggle** — 21 вызов, 7 подряд в setTerminalState (72-75)
4. **Socket events** — 20+ socket.on() обработчиков (строки 184-328)
5. **DOM events** — 10+ addEventListener (строки 331-560)
6. **Keyboard sequences** — таблица маппинга клавиш (строки 381-461)

### План рефакторинга
```
src/public/services/
├── TerminalService.js  — создание, состояние, fit/resize, fullscreen
├── InputService.js     — keyboard/paste, sequence mapping
├── SocketService.js    — connection, event registration
└── UIController.js     — global controls, status bar
```

Подключение через `<script>` теги в index.html (без bundler).

### Глобальное состояние
- `terminals` — объект с termInfo по connId
- `currentGroupName` — выбранная группа
- `terminalDefaults` — настройки терминала (fontFamily, fontSize, minWidth)
- `socket` — Socket.IO клиент

### HTML структура (index.html)
```
footer
├── div (appTitle)
│   ├── h1#appTitle
│   └── small#appSubtitle
├── div.commandInput
│   └── input#commandInput
└── div.controls
    ├── groupSelect + reconnectGroupBtn
    ├── invertLocksBtn + unlockAllBtn
    └── termWidthInput
```
