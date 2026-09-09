"use strict";

import { dom, initDom } from "./modules/state.js";
import { handleCommandKeydown, handleCommandPaste } from "./modules/input.js";
import { initSocket } from "./modules/socket.js";
import { initUI } from "./modules/ui.js";
import { renderControls, renderConnectionStatus } from "./modules/render.js";

document.addEventListener("DOMContentLoaded", () => {
  initDom();

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

  renderConnectionStatus("Connecting to server...", "info");
  renderControls();

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
