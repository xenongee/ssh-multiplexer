'use strict';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const groupSelect = document.getElementById('groupSelect');
    const reconnectGroupBtn = document.getElementById('reconnectGroupBtn');
    const invertLocksBtn = document.getElementById('invertLocksBtn');
    const unlockAllBtn = document.getElementById('unlockAllBtn');
    const commandInput = document.getElementById('commandInput');
    const terminalsContainer = document.getElementById('terminalsContainer');
    const termWidthInput = document.getElementById('termWidthInput');
    const connectionStatus = document.getElementById('connectionStatus');
    const terminalTemplate = document.getElementById('terminalTemplate');

    // --- State ---
    const socket = io({ reconnectionAttempts: 5, reconnectionDelay: 2000 });
    let terminals = {};
    let currentGroupName = "";
    let terminalDefaults = { fontFamily: "monospace", fontSize: 12, minWidth: 400 };
    let resizeTimeout;
    let fitTimeout;
    let globalInputActivityTimeout = null;

    // --- Initial Setup ---
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `#commandInput.inactive-broadcast { background-color: #4a4a4a; color: #999; font-style: italic; }
    .terminal-wrapper.locked-state { opacity: 0.7; border-color: var(--lock-color); }
    .terminal-wrapper.locked-state .terminal-output { background: #3a3020; }`;
    document.head.appendChild(styleSheet);

    // --- Helper Functions (FIXED: All function bodies are restored) ---
    function createTerminalElement(connId, displayHostString) {
        const templateContent = document.importNode(terminalTemplate.content, true);
        const wrapper = templateContent.querySelector('.terminal-wrapper');
        const title = templateContent.querySelector('.terminal-title');
        const reconnectButton = templateContent.querySelector('.reconnect-btn');
        const outputDiv = templateContent.querySelector('.terminal-output');
        wrapper.dataset.connId = connId;
        title.textContent = displayHostString;
        title.title = connId; // Show full connId on hover
        terminalsContainer.appendChild(wrapper);
        return { wrapper, outputDiv, reconnectButton };
    }

    function displayTerminalMessage(termInfo, type, message) {
        if (!termInfo) return;
        let className = '';
        let prefix = '';
        let ansiColor = '';
        switch (type) {
            case 'connecting': className = 'connecting-message'; break;
            case 'reconnecting': className = 'reconnecting-message'; break;
            case 'error':
                className = 'error-message'; prefix = '[--- ERROR: '; ansiColor = '\x1b[31m'; break; // Red
            case 'closed':
                className = 'closed-message'; prefix = '[--- '; ansiColor = '\x1b[33m'; break; // Yellow
            default: className = 'status-message'; break;
        }
        const fullMessage = `${prefix}${message}${type === 'error' || type === 'closed' ? ' ---]' : ''}`;
        if (termInfo.term) {
            termInfo.term.writeln(`\r\n${ansiColor}${fullMessage}\x1b[0m`);
        } else if (termInfo.outputDiv) {
            termInfo.outputDiv.innerHTML = `<p class="${className}">${message}</p>`;
        }
    }

    function setTerminalState(termInfo, { isConnecting = false, isReady = false, hasError = false, isClosed = false }) {
        if (!termInfo) return;
        const changed = termInfo.isConnecting !== isConnecting || termInfo.isReady !== isReady || termInfo.hasError !== hasError || termInfo.isClosed !== isClosed;
        if (!changed) return;
        termInfo.isConnecting = isConnecting; termInfo.isReady = isReady; termInfo.hasError = hasError; termInfo.isClosed = isClosed;
        termInfo.element.classList.toggle('connecting-state', isConnecting);
        termInfo.element.classList.toggle('reconnecting-state', isConnecting);
        termInfo.element.classList.toggle('error-state', hasError);
        termInfo.element.classList.toggle('closed-state', isClosed);
        termInfo.reconnectBtn.disabled = isConnecting;
        if (termInfo.term) {
            termInfo.term.options.disableStdin = !isReady || hasError || isClosed;
            termInfo.term.options.cursorBlink = isReady && !hasError && !isClosed;
        }
    }

    function setTerminalLockUI(termInfo) {
        if (!termInfo) return;
        const lockBtn = termInfo.element.querySelector('.lock-btn');
        if (lockBtn) {
            lockBtn.textContent = termInfo.isLocked ? '🔒' : '🔓';
            lockBtn.title = termInfo.isLocked ? 'Unlock from broadcast input' : 'Lock from broadcast input';
        }
        termInfo.element.classList.toggle('locked-state', termInfo.isLocked);
    }

    function fitTerminal(termInfo) {
        if (!termInfo?.term?.element || !termInfo.fitAddon) return;
        try {
            termInfo.fitAddon.fit();
            if (termInfo.term.cols && termInfo.term.rows) {
                socket.emit('term.resize', termInfo.connId, termInfo.term.cols, termInfo.term.rows);
            }
        } catch (e) { console.warn(`Fit error for ${termInfo.connId}:`, e.message); }
    }

    function fitRelevantTerminalsDebounced() {
        clearTimeout(fitTimeout);
        fitTimeout = setTimeout(() => {
            const fullscreenWrapper = terminalsContainer.querySelector('.terminal-wrapper.fullscreen');
            if (fullscreenWrapper) {
                const connId = fullscreenWrapper.dataset.connId;
                if (terminals[connId]?.term) fitTerminal(terminals[connId]);
            } else {
                Object.values(terminals).forEach(termInfo => { if (termInfo.term) fitTerminal(termInfo); });
            }
        }, 50);
    }

    function setTerminalMinWidth(width) {
        const safeWidth = Math.max(200, parseInt(width, 10) || 400);
        terminalsContainer.style.setProperty('--terminal-min-width', `${safeWidth}px`);
        if (document.activeElement !== termWidthInput) termWidthInput.value = safeWidth;
        fitRelevantTerminalsDebounced();
    }

    function updateGlobalControlsState() {
        const groupSelected = groupSelect.value !== '';
        reconnectGroupBtn.disabled = !groupSelected;
        const canReceiveInput = Object.values(terminals).some(t => t.isReady && !t.isClosed && !t.hasError);
        commandInput.disabled = !groupSelected || !canReceiveInput;
        commandInput.placeholder = !groupSelected ? 'Select group first' : (!canReceiveInput ? 'Waiting for connections...' : 'Input for active terminals');
        commandInput.classList.remove('inactive-broadcast');
        const hasTerminals = Object.values(terminals).length > 0;
        invertLocksBtn.disabled = !hasTerminals;
        unlockAllBtn.disabled = !hasTerminals;
    }

    function clearAllTerminals() {
        Object.values(terminals).forEach(termInfo => termInfo.term?.dispose());
        terminalsContainer.innerHTML = '';
        terminals = {};
        terminalsContainer.classList.remove('has-fullscreen-terminal');
        document.body.classList.remove('terminal-fullscreen-active');
        updateGlobalControlsState();
    }

    function sendDataToTerminals(data) {
        if (!data) return;
        const fullscreenWrapper = terminalsContainer.querySelector('.terminal-wrapper.fullscreen');
        if (fullscreenWrapper) {
            const connId = fullscreenWrapper.dataset.connId;
            const termInfo = terminals[connId];
            if (termInfo?.isReady && !termInfo.isClosed && !termInfo.hasError && !termInfo.isLocked) {
                socket.emit('term.input.specific', connId, data);
            }
        } else {
            Object.entries(terminals).forEach(([connId, t]) => {
                if (t.isReady && !t.isClosed && !t.hasError && !t.isLocked) {
                    socket.emit('term.input.specific', connId, data);
                }
            });
        }
    }

    function showGlobalInputActivity() {
        if (!terminalsContainer.classList.contains('has-fullscreen-terminal')) {
            terminalsContainer.classList.add('global-input-active');
            clearTimeout(globalInputActivityTimeout);
            globalInputActivityTimeout = setTimeout(() => {
                terminalsContainer.classList.remove('global-input-active');
            }, 200);
        }
    }

    function setConnectionStatus(text, type = 'info') {
        if (!connectionStatus) return;
        connectionStatus.textContent = text;
        connectionStatus.className = 'status-bar';
        if (text) {
            connectionStatus.classList.add('visible');
            if (type === 'error') connectionStatus.classList.add('error');
            if (type === 'reconnecting') connectionStatus.classList.add('reconnecting');
        }
    }

    // --- Socket Event Handlers ---
    socket.on('connect', () => {
        console.log('Connected to server.');
        setConnectionStatus('');
        groupSelect.disabled = false;
        updateGlobalControlsState();
        if (currentGroupName) {
            console.log(`Re-selecting group after connection: ${currentGroupName}`);
            socket.emit('selectGroup', currentGroupName);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`Disconnected: ${reason}`);
        groupSelect.disabled = true; commandInput.disabled = true; reconnectGroupBtn.disabled = true;
        clearAllTerminals();
        setConnectionStatus(`Disconnected (${reason}). Reconnecting...`, 'reconnecting');
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        clearAllTerminals();
        setConnectionStatus(`Connection failed: ${err.message}. Check server/refresh.`, 'error');
        document.title = "Error - SSH Multiplexer";
        groupSelect.disabled = true; commandInput.disabled = true; reconnectGroupBtn.disabled = true;
    });

    socket.on('appConfig', (config) => {
        terminalDefaults = { ...terminalDefaults, ...(config.terminalDefaults || {}) };
        console.log("Using terminal defaults:", terminalDefaults);
        termWidthInput.value = terminalDefaults.minWidth;
        setTerminalMinWidth(terminalDefaults.minWidth);
    });

    socket.on('groups', (groupNames) => {
        const currentVal = groupSelect.value || currentGroupName;
        groupSelect.innerHTML = '<option value="">-- Select --</option>';
        groupNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name; option.textContent = name; option.selected = (name === currentVal);
            groupSelect.appendChild(option);
        });
        groupSelect.disabled = false;
        updateGlobalControlsState();
    });

    socket.on('clearTerminals', clearAllTerminals);

    socket.on('term.create', (connId, displayHostString) => {
        let termInfo = terminals[connId];
        if (termInfo) {
            termInfo.term?.dispose();
            termInfo.term = null; termInfo.fitAddon = null;
            if (termInfo.outputDiv) termInfo.outputDiv.innerHTML = '';
            displayTerminalMessage(termInfo, 'connecting', 'Connecting...');
        } else {
            const { wrapper, outputDiv, reconnectButton } = createTerminalElement(connId, displayHostString);
            termInfo = {
                element: wrapper, outputDiv: outputDiv, reconnectBtn: reconnectButton,
                connId: connId, displayHostString: displayHostString,
                term: null, fitAddon: null,
isConnecting: true, isReady: false, hasError: false, isClosed: false, isLocked: false
            };
            terminals[connId] = termInfo;
        }
        setTerminalState(termInfo, { isConnecting: true, isReady: false, hasError: false, isClosed: false });
        updateGlobalControlsState();
        fitRelevantTerminalsDebounced();
    });

    socket.on('term.shell.ready', (connId) => {
        const termInfo = terminals[connId];
        if (!termInfo || termInfo.term || termInfo.hasError || termInfo.isClosed) {
            console.warn(`[${connId}] Received shell.ready but state is invalid. Ignoring.`);
            return;
        }
        const term = new Terminal({
            cursorBlink: true, convertEol: true, scrollback: 1000, cursorInactiveStyle: 'block',
            fontFamily: terminalDefaults.fontFamily, fontSize: terminalDefaults.fontSize,
            theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#cccccc', selectionBackground: '#555555' },
            allowProposedApi: true,
        });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        termInfo.outputDiv.innerHTML = '';
        try {
            term.open(termInfo.outputDiv);
        } catch (e) {
            console.error(`Error opening terminal ${connId}:`, e);
            displayTerminalMessage(termInfo, 'error', 'Xterm open error');
            setTerminalState(termInfo, { isConnecting: false, hasError: true });
            updateGlobalControlsState();
            return;
        }
        termInfo.term = term; termInfo.fitAddon = fitAddon;
        setTerminalState(termInfo, { isConnecting: false, isReady: true, hasError: false, isClosed: false });
        fitTerminal(termInfo);

        requestAnimationFrame(() => {
             term.focus();
             commandInput.focus();
             term.blur();
             if (term.options.cursorInactiveStyle !== 'block') {
                 term.options.cursorInactiveStyle = 'block';
             }
        });

        term.onData(data => {
            if (termInfo.isReady && !termInfo.isClosed && !termInfo.hasError) {
                socket.emit('term.input.specific', connId, data);
            }
        });
        term.textarea?.addEventListener('keydown', e => e.stopPropagation());
        updateGlobalControlsState();
    });

    socket.on('term.data', (connId, data) => {
        const termInfo = terminals[connId];
        if (termInfo?.term && (termInfo.isReady || termInfo.isConnecting) && !termInfo.isClosed) {
            termInfo.term.write(data);
            termInfo.term.scrollToBottom();
        }
    });

    socket.on('term.close', (connId, message) => {
        const termInfo = terminals[connId];
        if (!termInfo || termInfo.isClosed) return;
        console.log(`Terminal closed: ${connId} - ${message}`);
        displayTerminalMessage(termInfo, 'closed', message || 'Connection closed');
        setTerminalState(termInfo, { isConnecting: false, isReady: false, isClosed: true });
        updateGlobalControlsState();
    });

    socket.on('term.error', (connId, errorMsg) => {
        const termInfo = terminals[connId];
        if (!termInfo || termInfo.isClosed || termInfo.hasError) return;
        console.error(`Terminal error: ${connId} - ${errorMsg}`);
        displayTerminalMessage(termInfo, 'error', errorMsg || 'Unknown error');
        setTerminalState(termInfo, { isConnecting: false, isReady: false, hasError: true });
        updateGlobalControlsState();
    });

    socket.on('errorMsg', (message) => {
        console.error('Server Error:', message);
        alert(`Server Error: ${message}`);
    });

    // --- DOM Event Listeners ---
    groupSelect.addEventListener('change', () => {
        currentGroupName = groupSelect.value;
        commandInput.value = '';
        const fullscreenWrapper = terminalsContainer.querySelector('.terminal-wrapper.fullscreen');
        if (fullscreenWrapper) {
            fullscreenWrapper.classList.remove('fullscreen');
            terminalsContainer.classList.remove('has-fullscreen-terminal');
            document.body.classList.remove('terminal-fullscreen-active');
            const expandBtn = fullscreenWrapper.querySelector('.expand-btn');
            if (expandBtn) { expandBtn.textContent = '▣'; expandBtn.title = 'Expand'; }
        }
        if (currentGroupName) {
            socket.emit('selectGroup', currentGroupName);
        } else {
            clearAllTerminals();
        }
        updateGlobalControlsState();
    });

    reconnectGroupBtn.addEventListener('click', () => {
        if (currentGroupName) {
            console.log(`Reconnecting group: ${currentGroupName}`);
            commandInput.value = '';
            socket.emit('selectGroup', currentGroupName);
            updateGlobalControlsState();
        }
    });

    termWidthInput.addEventListener('change', (event) => setTerminalMinWidth(event.target.value));
    termWidthInput.addEventListener('input', (event) => {
        const widthPx = `${Math.max(200, parseInt(event.target.value, 10) || 400)}px`;
        terminalsContainer.style.setProperty('--terminal-min-width', widthPx);
        fitRelevantTerminalsDebounced();
    });

    invertLocksBtn.addEventListener('click', () => {
        Object.values(terminals).forEach(t => {
            t.isLocked = !t.isLocked;
            setTerminalLockUI(t);
        });
    });

    unlockAllBtn.addEventListener('click', () => {
        Object.values(terminals).forEach(t => {
            t.isLocked = false;
            setTerminalLockUI(t);
        });
    });

    // --- Input Handling (Keyboard) ---
    commandInput.addEventListener('keydown', (event) => {
        if (commandInput.disabled) return;
        const { key, ctrlKey, altKey, shiftKey, metaKey } = event;
        let sequence = null;
        let requiresActivityIndicator = false;
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock'].includes(key);
        if (isModifierOnly) return;

        event.preventDefault();

        if (altKey && key.toLowerCase() === 'w') {
            requiresActivityIndicator = true;
            sequence = '\x17';
        } else if (altKey || (isMac && metaKey)) {
            requiresActivityIndicator = true;
            if (key.length === 1 && key !== ' ') { sequence = '\x1b' + key; }
            else if (key === 'Backspace') { sequence = '\x1b\x7f'; }
        } else if (ctrlKey && !altKey && !metaKey) {
            requiresActivityIndicator = true;
            if (key.length === 1 && key.toLowerCase() >= 'a' && key.toLowerCase() <= 'z') {
                sequence = String.fromCharCode(key.toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0) + 1);
            } else if (key === 'Backspace') { sequence = '\x17'; }
            else if (key === ' ') { sequence = '\x00'; }
            else if (key === '[') { sequence = '\x1b'; }
            else if (key === '\\') { sequence = '\x1c'; }
            else if (key === ']') { sequence = '\x1d'; }
            else if (key === '^' || key === '6') { sequence = '\x1e'; }
            else if (key === '_' || key === '-') { sequence = '\x1f'; }
            else if (key === 'ArrowLeft') { sequence = '\x1b[1;5D'; }
            else if (key === 'ArrowRight') { sequence = '\x1b[1;5C'; }
            else if (key === 'ArrowUp') { sequence = '\x1b[1;5A'; }
            else if (key === 'ArrowDown') { sequence = '\x1b[1;5B'; }
        } else if (key.startsWith('F') && key.length > 1 && !ctrlKey && !altKey && !metaKey && !shiftKey) {
            requiresActivityIndicator = true;
            const fNumber = parseInt(key.substring(1), 10);
            if (!isNaN(fNumber) && fNumber >= 1 && fNumber <= 12) {
                if (fNumber <= 4) sequence = `\x1bO${String.fromCharCode('P'.charCodeAt(0) + fNumber - 1)}`;
                else sequence = `\x1b[${fNumber + 11}~`;
            }
        } else if (key.startsWith('F') && key.length > 1 && shiftKey && !ctrlKey && !altKey && !metaKey) {
            requiresActivityIndicator = true;
            const fNumber = parseInt(key.substring(1), 10);
            if (!isNaN(fNumber) && fNumber >= 1 && fNumber <= 10) {
                sequence = `\x1b[${fNumber + 22}~`;
            } else if (fNumber === 11) { sequence = `\x1b[23;2~`; }
            else if (fNumber === 12) { sequence = `\x1b[24;2~`; }
        } else if (!ctrlKey && !altKey && !metaKey) {
            switch (key) {
                case 'Enter': sequence = '\r'; break;
                case 'Tab': sequence = shiftKey ? '\x1b[Z' : '\t'; requiresActivityIndicator = true; break;
                case 'Backspace': sequence = '\x7f'; requiresActivityIndicator = true; break;
                case 'Delete': sequence = '\x1b[3~'; requiresActivityIndicator = true; break;
                case 'ArrowUp': sequence = '\x1b[A'; requiresActivityIndicator = true; break;
                case 'ArrowDown': sequence = '\x1b[B'; requiresActivityIndicator = true; break;
                case 'ArrowRight': sequence = '\x1b[C'; requiresActivityIndicator = true; break;
                case 'ArrowLeft': sequence = '\x1b[D'; requiresActivityIndicator = true; break;
                case 'Home': sequence = '\x1b[H'; requiresActivityIndicator = true; break;
                case 'End': sequence = '\x1b[F'; requiresActivityIndicator = true; break;
                case 'PageUp': sequence = '\x1b[5~'; requiresActivityIndicator = true; break;
                case 'PageDown': sequence = '\x1b[6~'; requiresActivityIndicator = true; break;
                case 'Escape': sequence = '\x1b'; requiresActivityIndicator = true; break;
                case 'Insert': sequence = '\x1b[2~'; requiresActivityIndicator = true; break;
                default:
                    if (key.length === 1) { sequence = key; }
                    break;
            }
        }

        if (sequence !== null) {
            sendDataToTerminals(sequence);
            if (requiresActivityIndicator) {
                showGlobalInputActivity();
            }
            commandInput.value = '';
        } else {
            console.log(`Prevented default for unhandled key combination: ${key}`);
            commandInput.value = '';
        }
    });

    commandInput.addEventListener('paste', (event) => {
        if (commandInput.disabled) return;
        event.preventDefault();
        const pastedData = event.clipboardData?.getData('text/plain');
        if (pastedData) {
            sendDataToTerminals(pastedData);
            showGlobalInputActivity();
            commandInput.value = '';
        }
    });

    terminalsContainer.addEventListener('click', (event) => {
        const lockBtn = event.target.closest('.lock-btn');
        const reconnectBtn = event.target.closest('.reconnect-btn');
        const expandBtn = event.target.closest('.expand-btn');
        if (lockBtn) {
            const wrapper = lockBtn.closest('.terminal-wrapper');
            if (!wrapper) return;
            const connId = wrapper.dataset.connId;
            const termInfo = terminals[connId];
            if (!termInfo) return;
            termInfo.isLocked = !termInfo.isLocked;
            setTerminalLockUI(termInfo);
        } else if (reconnectBtn) {
            const wrapper = reconnectBtn.closest('.terminal-wrapper');
            if (!wrapper || reconnectBtn.disabled) return;
            const connId = wrapper.dataset.connId;
            const termInfo = terminals[connId];
            if (termInfo) {
                console.log(`Reconnect requested for: ${connId}`);
                if (termInfo.term) termInfo.term.clear(); else if (termInfo.outputDiv) termInfo.outputDiv.innerHTML = '';
                displayTerminalMessage(termInfo, 'reconnecting', 'Reconnecting...');
                setTerminalState(termInfo, { isConnecting: true, isReady: false, hasError: false, isClosed: false });
                updateGlobalControlsState();
                socket.emit('term.reconnect', connId);
            }
        } else if (expandBtn) {
            const wrapper = expandBtn.closest('.terminal-wrapper');
            if (!wrapper) return;
            const connId = wrapper.dataset.connId;
            const termInfo = terminals[connId];
            if (!termInfo) return;
            const isNowFullscreen = wrapper.classList.toggle('fullscreen');
            terminalsContainer.classList.toggle('has-fullscreen-terminal', isNowFullscreen);
            document.body.classList.toggle('terminal-fullscreen-active', isNowFullscreen);
            expandBtn.textContent = isNowFullscreen ? '▢' : '▣';
            expandBtn.title = isNowFullscreen ? 'Collapse' : 'Expand';
            setTimeout(() => {
                if (isNowFullscreen) {
                    if (termInfo.term) { fitTerminal(termInfo); termInfo.term.focus(); }
                } else { fitRelevantTerminalsDebounced(); }
            }, 50);
            updateGlobalControlsState();
        } else {
            const wrapper = event.target.closest('.terminal-wrapper');
            if (wrapper?.classList.contains('fullscreen')) {
                terminals[wrapper.dataset.connId]?.term?.focus();
            }
        }
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(fitRelevantTerminalsDebounced, 150);
    });

    // ADDED: Allow adjusting the min-width input with the mouse wheel
    termWidthInput.addEventListener('wheel', (event) => {
        // Prevent the browser's default behavior (like scrolling the page)
        event.preventDefault();

        // Get current values and attributes, parsing them as numbers
        const currentValue = parseInt(termWidthInput.value, 10);
        const step = parseInt(termWidthInput.step, 10) || 10;
        const min = parseInt(termWidthInput.min, 10);
        const max = parseInt(termWidthInput.max, 10);

        let newValue;

        // Determine the new value based on scroll direction
        if (event.deltaY < 0) {
            // Scrolling up -> increase value
            newValue = currentValue + step;
        } else {
            // Scrolling down -> decrease value
            newValue = currentValue - step;
        }

        // Clamp the new value to stay within the min/max limits
        newValue = Math.max(min, Math.min(max, newValue));

        // Update the input's value on the screen
        termWidthInput.value = newValue;

        // Programmatically trigger the 'input' event to apply the changes live.
        // This will reuse the existing logic for resizing terminals.
        termWidthInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // --- Initial State ---
    fetch('/api/version').then(r => r.json()).then(d => {
        const el = document.getElementById('appVersion');
        if (el) el.textContent = d.version;
    }).catch(() => {});

    setConnectionStatus('Connecting to server...', 'info');
    updateGlobalControlsState();

    window.addEventListener('beforeunload', (e) => {
        e.preventDefault();
        e.returnValue = '';
    });

    // Alt+X focuses commandInput
    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            commandInput.focus();
            commandInput.select();
        }
    }, { capture: true });
});
