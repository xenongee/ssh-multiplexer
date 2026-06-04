import { state, dom } from "./state.js";
import {
  setTerminalLock,
  displayTerminalMessage,
  setTerminalState,
  fitTerminal,
  fitRelevantTerminalsDebounced,
  exitFullscreen,
} from "./terminal.js";
import { renderTerminals, renderControls, renderConnectionStatus } from "./render.js";

export function initUI(socket) {
  dom.groupSelect.addEventListener("change", () => {
    state.currentGroupName = dom.groupSelect.value;
    dom.commandInput.value = "";
    exitFullscreen();
    const expandBtns = dom.terminalsContainer.querySelectorAll(".expand-btn");
    expandBtns.forEach((btn) => {
      btn.textContent = "▣";
      btn.title = "Expand";
    });
    if (state.currentGroupName) {
      socket.emit("selectGroup", state.currentGroupName);
    } else {
      Object.values(state.terminals).forEach((termInfo) => termInfo.term?.dispose());
      dom.terminalsContainer.innerHTML = "";
      state.terminals = {};
    }
    renderControls();
  });

  dom.reconnectGroupBtn.addEventListener("click", () => {
    if (state.currentGroupName) {
      console.log(`Reconnecting group: ${state.currentGroupName}`);
      dom.commandInput.value = "";
      socket.emit("selectGroup", state.currentGroupName);
      renderControls();
    }
  });

  dom.termWidthInput.addEventListener("change", (event) => {
    const widthPx = `${Math.max(200, parseInt(event.target.value, 10) || 400)}px`;
    dom.terminalsContainer.style.setProperty("--terminal-min-width", widthPx);
    fitRelevantTerminalsDebounced(socket);
  });

  dom.termWidthInput.addEventListener("input", (event) => {
    const widthPx = `${Math.max(200, parseInt(event.target.value, 10) || 400)}px`;
    dom.terminalsContainer.style.setProperty("--terminal-min-width", widthPx);
    fitRelevantTerminalsDebounced(socket);
  });

  dom.invertLocksBtn.addEventListener("click", () => {
    Object.keys(state.terminals).forEach((connId) => {
      setTerminalLock(connId, !state.terminals[connId].isLocked);
    });
  });

  dom.unlockAllBtn.addEventListener("click", () => {
    Object.keys(state.terminals).forEach((connId) => {
      setTerminalLock(connId, false);
    });
  });

  dom.terminalsContainer.addEventListener("click", (event) => {
    const lockBtn = event.target.closest(".lock-btn");
    const reconnectBtn = event.target.closest(".reconnect-btn");
    const expandBtn = event.target.closest(".expand-btn");
    if (lockBtn) {
      const wrapper = lockBtn.closest(".terminal-wrapper");
      if (!wrapper) return;
      const connId = wrapper.dataset.connId;
      const termInfo = state.terminals[connId];
      if (!termInfo) return;
      setTerminalLock(connId, !termInfo.isLocked);
    } else if (reconnectBtn) {
      const wrapper = reconnectBtn.closest(".terminal-wrapper");
      if (!wrapper || reconnectBtn.disabled) return;
      const connId = wrapper.dataset.connId;
      const termInfo = state.terminals[connId];
      if (termInfo) {
        console.log(`Reconnect requested for: ${connId}`);
        if (termInfo.term) termInfo.term.clear();
        else if (termInfo.outputDiv) termInfo.outputDiv.innerHTML = "";
        displayTerminalMessage(termInfo, "reconnecting", "Reconnecting...");
        setTerminalState(connId, {
          isConnecting: true,
          isReady: false,
          hasError: false,
          isClosed: false,
        });
        socket.emit("term.reconnect", connId);
      }
    } else if (expandBtn) {
      const wrapper = expandBtn.closest(".terminal-wrapper");
      if (!wrapper) return;
      const connId = wrapper.dataset.connId;
      const termInfo = state.terminals[connId];
      if (!termInfo) return;
      const isNowFullscreen = wrapper.classList.toggle("fullscreen");
      dom.terminalsContainer.classList.toggle(
        "has-fullscreen-terminal",
        isNowFullscreen,
      );
      document.body.classList.toggle(
        "terminal-fullscreen-active",
        isNowFullscreen,
      );
      expandBtn.textContent = isNowFullscreen ? "▢" : "▣";
      expandBtn.title = isNowFullscreen ? "Collapse" : "Expand";
      setTimeout(() => {
        if (isNowFullscreen) {
          if (termInfo.term) {
            fitTerminal(termInfo, socket);
            termInfo.term.focus();
          }
        } else {
          fitRelevantTerminalsDebounced(socket);
        }
      }, 50);
      renderControls();
    } else {
      const wrapper = event.target.closest(".terminal-wrapper");
      if (wrapper?.classList.contains("fullscreen")) {
        state.terminals[wrapper.dataset.connId]?.term?.focus();
      }
    }
  });

  window.addEventListener("resize", () => {
    clearTimeout(state.resizeTimeout);
    state.resizeTimeout = setTimeout(() => fitRelevantTerminalsDebounced(socket), 150);
  });

  dom.termWidthInput.addEventListener("wheel", (event) => {
    event.preventDefault();
    const currentValue = parseInt(dom.termWidthInput.value, 10);
    const step = parseInt(dom.termWidthInput.step, 10) || 10;
    const min = parseInt(dom.termWidthInput.min, 10);
    const max = parseInt(dom.termWidthInput.max, 10);
    let newValue;
    if (event.deltaY < 0) {
      newValue = currentValue + step;
    } else {
      newValue = currentValue - step;
    }
    newValue = Math.max(min, Math.min(max, newValue));
    dom.termWidthInput.value = newValue;
    dom.termWidthInput.dispatchEvent(new Event("input", { bubbles: true }));
  });

  initHelpModal();
}

function initHelpModal() {
  const helpBtn = document.getElementById("helpBtn");
  const helpModal = document.getElementById("helpModal");
  const modalClose = helpModal?.querySelector(".modal-close");

  function openHelpModal() {
    helpModal?.classList.add("visible");
  }

  function closeHelpModal() {
    helpModal?.classList.remove("visible");
  }

  helpBtn?.addEventListener("click", openHelpModal);
  modalClose?.addEventListener("click", closeHelpModal);
  helpModal?.addEventListener("click", (e) => {
    if (e.target === helpModal) closeHelpModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && helpModal?.classList.contains("visible")) {
      closeHelpModal();
    }
  });
}
