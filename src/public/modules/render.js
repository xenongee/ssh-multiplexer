import { state, dom } from "./state.js";

export function renderTerminals() {
  Object.entries(state.terminals).forEach(([connId, termInfo]) => {
    if (!termInfo.element) return;

    termInfo.element.classList.toggle("connecting-state", termInfo.isConnecting);
    termInfo.element.classList.toggle("reconnecting-state", termInfo.isConnecting);
    termInfo.element.classList.toggle("error-state", termInfo.hasError);
    termInfo.element.classList.toggle("closed-state", termInfo.isClosed);
    termInfo.element.classList.toggle("locked-state", termInfo.isLocked);

    termInfo.reconnectBtn.disabled = termInfo.isConnecting;

    const lockBtn = termInfo.element.querySelector(".lock-btn");
    if (lockBtn) {
      lockBtn.textContent = termInfo.isLocked ? "🔒" : "🔓";
      lockBtn.title = termInfo.isLocked
        ? "Unlock from broadcast input"
        : "Lock from broadcast input";
    }

    if (termInfo.term) {
      termInfo.term.options.disableStdin = !termInfo.isReady || termInfo.hasError || termInfo.isClosed;
      termInfo.term.options.cursorBlink = termInfo.isReady && !termInfo.hasError && !termInfo.isClosed;
    }
  });
}

export function renderControls() {
  const groupSelected = dom.groupSelect.value !== "";
  dom.reconnectGroupBtn.disabled = !groupSelected;

  const canReceiveInput = Object.values(state.terminals).some(
    (t) => t.isReady && !t.isClosed && !t.hasError,
  );

  dom.commandInput.disabled = !groupSelected || !canReceiveInput;
  dom.commandInput.placeholder = !groupSelected
    ? "Select group first"
    : !canReceiveInput
      ? "Waiting for connections..."
      : "Input for active terminals";

  dom.commandInput.classList.remove("inactive-broadcast");

  const hasTerminals = Object.values(state.terminals).length > 0;
  dom.invertLocksBtn.disabled = !hasTerminals;
  dom.unlockAllBtn.disabled = !hasTerminals;
}

export function renderConnectionStatus(text, type = "info") {
  if (!dom.connectionStatus) return;

  dom.connectionStatus.textContent = text;
  dom.connectionStatus.className = "status-bar";

  if (text) {
    dom.connectionStatus.classList.add("visible");
    if (type === "error") dom.connectionStatus.classList.add("error");
    if (type === "reconnecting") dom.connectionStatus.classList.add("reconnecting");
  }
}
