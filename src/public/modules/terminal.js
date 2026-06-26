import { state, dom } from "./state.js";
import { renderTerminals, renderControls } from "./render.js";

export function createTerminalElement(connId, displayHostString) {
  const templateContent = document.importNode(dom.terminalTemplate.content, true);
  const wrapper = templateContent.querySelector(".terminal-wrapper");
  const title = templateContent.querySelector(".terminal-title");
  const reconnectButton = templateContent.querySelector(".reconnect-btn");
  const outputDiv = templateContent.querySelector(".terminal-output");
  wrapper.dataset.connId = connId;
  title.textContent = displayHostString;
  title.title = connId;
  dom.terminalsContainer.appendChild(wrapper);
  return { wrapper, outputDiv, reconnectButton };
}

export function displayTerminalMessage(termInfo, type, message) {
  if (!termInfo) return;
  let className = "";
  let prefix = "";
  let ansiColor = "";
  switch (type) {
    case "connecting":
      className = "connecting-message";
      break;
    case "reconnecting":
      className = "reconnecting-message";
      break;
    case "error":
      className = "error-message";
      prefix = "[--- ERROR: ";
      ansiColor = "\x1b[31m";
      break;
    case "closed":
      className = "closed-message";
      prefix = "[--- ";
      ansiColor = "\x1b[33m";
      break;
    default:
      className = "status-message";
  }
  const fullMessage = `${prefix}${message}${type === "error" || type === "closed" ? " ---]" : ""}`;
  if (termInfo.term) {
    termInfo.term.writeln(`\r\n${ansiColor}${fullMessage}\x1b[0m`);
  } else if (termInfo.outputDiv) {
    termInfo.outputDiv.innerHTML = `<p class="${className}">${message}</p>`;
  }
}

export function setTerminalState(
  connId,
  {
    isConnecting = false,
    isReady = false,
    hasError = false,
    isClosed = false,
  },
) {
  const termInfo = state.terminals[connId];
  if (!termInfo) return;
  const changed =
    termInfo.isConnecting !== isConnecting ||
    termInfo.isReady !== isReady ||
    termInfo.hasError !== hasError ||
    termInfo.isClosed !== isClosed;
  if (!changed) return;
  termInfo.isConnecting = isConnecting;
  termInfo.isReady = isReady;
  termInfo.hasError = hasError;
  termInfo.isClosed = isClosed;
  renderTerminals();
  renderControls();
}

export function isTerminalActive(termInfo) {
  return !!termInfo && termInfo.isReady && !termInfo.isClosed && !termInfo.hasError;
}

export function setTerminalLock(connId, isLocked) {
  const termInfo = state.terminals[connId];
  if (!termInfo) return;
  termInfo.isLocked = isLocked;
  renderTerminals();
}

export function fitTerminal(termInfo, socket) {
  if (!termInfo?.term?.element || !termInfo.fitAddon) return;
  try {
    termInfo.fitAddon.fit();
    if (termInfo.term.cols && termInfo.term.rows) {
      socket.emit("term.resize", termInfo.connId, termInfo.term.cols, termInfo.term.rows);
    }
  } catch (e) {
    console.warn(`Fit error for ${termInfo.connId}:`, e.message);
  }
}

export function fitRelevantTerminalsDebounced(socket) {
  clearTimeout(state.fitTimeout);
  state.fitTimeout = setTimeout(() => {
    const fullscreenWrapper = dom.terminalsContainer.querySelector(
      ".terminal-wrapper.fullscreen",
    );
    if (fullscreenWrapper) {
      const connId = fullscreenWrapper.dataset.connId;
      if (state.terminals[connId]?.term) fitTerminal(state.terminals[connId], socket);
    } else {
      Object.values(state.terminals).forEach((termInfo) => {
        if (termInfo.term) fitTerminal(termInfo, socket);
      });
    }
  }, 50);
}

export function setTerminalMinWidth(width, socket) {
  const safeWidth = Math.max(200, parseInt(width, 10) || 400);
  dom.terminalsContainer.style.setProperty(
    "--terminal-min-width",
    `${safeWidth}px`,
  );
  if (document.activeElement !== dom.termWidthInput)
    dom.termWidthInput.value = safeWidth;
  fitRelevantTerminalsDebounced(socket);
}

export function clearAllTerminals() {
  Object.values(state.terminals).forEach((termInfo) => termInfo.term?.dispose());
  dom.terminalsContainer.innerHTML = "";
  state.terminals = {};
  exitFullscreen();
  renderControls();
}

export function exitFullscreen() {
  dom.terminalsContainer.classList.remove("has-fullscreen-terminal");
  document.body.classList.remove("terminal-fullscreen-active");
}

export function getFullscreenTermInfo() {
  const fullscreenWrapper = dom.terminalsContainer.querySelector(
    ".terminal-wrapper.fullscreen",
  );
  if (fullscreenWrapper) {
    return state.terminals[fullscreenWrapper.dataset.connId];
  }
  return null;
}
