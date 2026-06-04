import { state, dom } from "./state.js";
import {
  createTerminalElement,
  displayTerminalMessage,
  setTerminalState,
  fitTerminal,
  fitRelevantTerminalsDebounced,
  setTerminalMinWidth,
  clearAllTerminals,
} from "./terminal.js";
import { updateGlobalControlsState } from "./ui.js";

export function initSocket(socket) {
  socket.on("connect", () => {
    console.log("Connected to server.");
    setConnectionStatus("");
    dom.groupSelect.disabled = false;
    updateGlobalControlsState();
    if (state.currentGroupName) {
      console.log(`Re-selecting group after connection: ${state.currentGroupName}`);
      socket.emit("selectGroup", state.currentGroupName);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`Disconnected: ${reason}`);
    dom.groupSelect.disabled = true;
    dom.commandInput.disabled = true;
    dom.reconnectGroupBtn.disabled = true;
    clearAllTerminals();
    updateGlobalControlsState();
    setConnectionStatus(
      `Disconnected (${reason}). Reconnecting...`,
      "reconnecting",
    );
  });

  socket.on("connect_error", (err) => {
    console.error("Connection Error:", err.message);
    clearAllTerminals();
    setConnectionStatus(
      `Connection failed: ${err.message}. Check server/refresh.`,
      "error",
    );
    document.title = "Error - SSH Multiplexer";
    dom.groupSelect.disabled = true;
    dom.commandInput.disabled = true;
    dom.reconnectGroupBtn.disabled = true;
    updateGlobalControlsState();
  });

  socket.on("appConfig", (config) => {
    state.terminalDefaults = {
      ...state.terminalDefaults,
      ...(config.terminalDefaults || {}),
    };
    console.log("Using terminal defaults:", state.terminalDefaults);
    dom.termWidthInput.value = state.terminalDefaults.minWidth;
    setTerminalMinWidth(state.terminalDefaults.minWidth, socket);
  });

  socket.on("groups", (groupNames) => {
    const currentVal = dom.groupSelect.value || state.currentGroupName;
    dom.groupSelect.innerHTML = '<option value="">-- Select Group --</option>';
    groupNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === currentVal;
      dom.groupSelect.appendChild(option);
    });
    dom.groupSelect.disabled = false;
    updateGlobalControlsState();
  });

  socket.on("clearTerminals", () => {
    clearAllTerminals();
    updateGlobalControlsState();
  });

  socket.on("term.create", (connId, displayHostString) => {
    let termInfo = state.terminals[connId];
    if (termInfo) {
      termInfo.term?.dispose();
      termInfo.term = null;
      termInfo.fitAddon = null;
      if (termInfo.outputDiv) termInfo.outputDiv.innerHTML = "";
      displayTerminalMessage(termInfo, "connecting", "Connecting...");
    } else {
      const { wrapper, outputDiv, reconnectButton } = createTerminalElement(
        connId,
        displayHostString,
      );
      termInfo = {
        element: wrapper,
        outputDiv: outputDiv,
        reconnectBtn: reconnectButton,
        connId: connId,
        displayHostString: displayHostString,
        term: null,
        fitAddon: null,
        isConnecting: true,
        isReady: false,
        hasError: false,
        isClosed: false,
        isLocked: false,
      };
      state.terminals[connId] = termInfo;
    }
    setTerminalState(termInfo, {
      isConnecting: true,
      isReady: false,
      hasError: false,
      isClosed: false,
    });
    updateGlobalControlsState();
    fitRelevantTerminalsDebounced(socket);
  });

  socket.on("term.shell.ready", (connId) => {
    const termInfo = state.terminals[connId];
    if (!termInfo || termInfo.term || termInfo.hasError || termInfo.isClosed) {
      console.warn(
        `[${connId}] Received shell.ready but state is invalid. Ignoring.`,
      );
      return;
    }
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 1000,
      cursorInactiveStyle: "block",
      fontFamily: state.terminalDefaults.fontFamily,
      fontSize: state.terminalDefaults.fontSize,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#cccccc",
        selectionBackground: "#555555",
      },
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    termInfo.outputDiv.innerHTML = "";
    try {
      term.open(termInfo.outputDiv);
    } catch (e) {
      console.error(`Error opening terminal ${connId}:`, e);
      displayTerminalMessage(termInfo, "error", "Xterm open error");
      setTerminalState(termInfo, { isConnecting: false, hasError: true });
      updateGlobalControlsState();
      return;
    }
    termInfo.term = term;
    termInfo.fitAddon = fitAddon;
    setTerminalState(termInfo, {
      isConnecting: false,
      isReady: true,
      hasError: false,
      isClosed: false,
    });
    fitTerminal(termInfo, socket);

    requestAnimationFrame(() => {
      term.focus();
      dom.commandInput.focus();
      term.blur();
      if (term.options.cursorInactiveStyle !== "block") {
        term.options.cursorInactiveStyle = "block";
      }
    });

    term.onData((data) => {
      if (termInfo.isReady && !termInfo.isClosed && !termInfo.hasError) {
        socket.emit("term.input.specific", connId, data);
      }
    });
    term.textarea?.addEventListener("keydown", (e) => e.stopPropagation());
    updateGlobalControlsState();
  });

  socket.on("term.data", (connId, data) => {
    const termInfo = state.terminals[connId];
    if (
      termInfo?.term &&
      (termInfo.isReady || termInfo.isConnecting) &&
      !termInfo.isClosed
    ) {
      termInfo.term.write(data);
      termInfo.term.scrollToBottom();
    }
  });

  socket.on("term.close", (connId, message) => {
    const termInfo = state.terminals[connId];
    if (!termInfo || termInfo.isClosed) return;
    console.log(`Terminal closed: ${connId} - ${message}`);
    displayTerminalMessage(termInfo, "closed", message || "Connection closed");
    setTerminalState(termInfo, {
      isConnecting: false,
      isReady: false,
      isClosed: true,
    });
    updateGlobalControlsState();
  });

  socket.on("term.error", (connId, errorMsg) => {
    const termInfo = state.terminals[connId];
    if (!termInfo || termInfo.isClosed || termInfo.hasError) return;
    console.error(`Terminal error: ${connId} - ${errorMsg}`);
    displayTerminalMessage(termInfo, "error", errorMsg || "Unknown error");
    setTerminalState(termInfo, {
      isConnecting: false,
      isReady: false,
      hasError: true,
    });
    updateGlobalControlsState();
  });

  socket.on("errorMsg", (message) => {
    console.error("Server Error:", message);
    alert(`Server Error: ${message}`);
  });
}

export function setConnectionStatus(text, type = "info") {
  if (!dom.connectionStatus) return;
  dom.connectionStatus.textContent = text;
  dom.connectionStatus.className = "status-bar";
  if (text) {
    dom.connectionStatus.classList.add("visible");
    if (type === "error") dom.connectionStatus.classList.add("error");
    if (type === "reconnecting") dom.connectionStatus.classList.add("reconnecting");
  }
}
