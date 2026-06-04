export const state = {
  terminals: {},
  currentGroupName: "",
  terminalDefaults: {
    fontFamily: "monospace",
    fontSize: 12,
    minWidth: 400,
  },
  resizeTimeout: null,
  fitTimeout: null,
  globalInputActivityTimeout: null,
};

export const dom = {};

export function initDom() {
  dom.groupSelect = document.getElementById("groupSelect");
  dom.reconnectGroupBtn = document.getElementById("reconnectGroupBtn");
  dom.invertLocksBtn = document.getElementById("invertLocksBtn");
  dom.unlockAllBtn = document.getElementById("unlockAllBtn");
  dom.commandInput = document.getElementById("commandInput");
  dom.terminalsContainer = document.getElementById("terminalsContainer");
  dom.termWidthInput = document.getElementById("termWidthInput");
  dom.connectionStatus = document.getElementById("connectionStatus");
  dom.terminalTemplate = document.getElementById("terminalTemplate");
}
