"use strict";

import { state, dom, initDom } from "./services/state.js";
import { setTerminalMinWidth } from "./services/terminal.js";
import { handleCommandKeydown, handleCommandPaste } from "./services/input.js";
import { initSocket, setConnectionStatus } from "./services/socket.js";
import { updateGlobalControlsState, initUI } from "./services/ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initDom();

  const styleSheet = document.createElement("style");
  styleSheet.innerText = `#commandInput.inactive-broadcast { background-color: #4a4a4a; color: #999; font-style: italic; }
    .terminal-wrapper.locked-state { opacity: 0.7; border-color: var(--lock-color); }
    .terminal-wrapper.locked-state .terminal-output { background: #3a3020; }`;
  document.head.appendChild(styleSheet);

  const socket = io({ reconnectionAttempts: 5, reconnectionDelay: 2000 });

  initSocket(socket);
  initUI(socket);

  dom.commandInput.addEventListener("keydown", (event) => {
    handleCommandKeydown(event, socket);
  });

  dom.commandInput.addEventListener("paste", (event) => {
    handleCommandPaste(event, socket);
  });

  fetch("/api/version")
    .then((r) => r.json())
    .then((d) => {
      const el = document.getElementById("appVersion");
      if (el) el.textContent = d.version;
    })
    .catch(() => {});

  setConnectionStatus("Connecting to server...", "info");
  updateGlobalControlsState();

  window.addEventListener("beforeunload", (e) => {
    e.preventDefault();
    e.returnValue = "";
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && e.key.toLowerCase() === "x" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dom.commandInput.focus();
        dom.commandInput.select();
      }
    },
    { capture: true },
  );
});
