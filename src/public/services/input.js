import { state, dom } from "./state.js";
import { getFullscreenTermInfo } from "./terminal.js";

export function sendDataToTerminals(data, socket) {
  if (!data) return;
  const fullscreenTermInfo = getFullscreenTermInfo();
  if (fullscreenTermInfo) {
    const t = fullscreenTermInfo;
    if (t.isReady && !t.isClosed && !t.hasError && !t.isLocked) {
      socket.emit("term.input.specific", t.connId, data);
    }
  } else {
    Object.entries(state.terminals).forEach(([connId, t]) => {
      if (t.isReady && !t.isClosed && !t.hasError && !t.isLocked) {
        socket.emit("term.input.specific", connId, data);
      }
    });
  }
}

export function showGlobalInputActivity() {
  if (!dom.terminalsContainer.classList.contains("has-fullscreen-terminal")) {
    dom.terminalsContainer.classList.add("global-input-active");
    clearTimeout(state.globalInputActivityTimeout);
    state.globalInputActivityTimeout = setTimeout(() => {
      dom.terminalsContainer.classList.remove("global-input-active");
    }, 200);
  }
}

export function handleCommandKeydown(event, socket) {
  if (dom.commandInput.disabled) return;
  const { key, ctrlKey, altKey, shiftKey, metaKey } = event;
  let sequence = null;
  let requiresActivityIndicator = false;
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  const isModifierOnly = [
    "Control",
    "Shift",
    "Alt",
    "Meta",
    "CapsLock",
    "NumLock",
    "ScrollLock",
  ].includes(key);
  if (isModifierOnly) return;

  event.preventDefault();

  if (altKey && key.toLowerCase() === "w") {
    requiresActivityIndicator = true;
    sequence = "\x17";
  } else if (altKey || (isMac && metaKey)) {
    requiresActivityIndicator = true;
    if (key.length === 1 && key !== " ") {
      sequence = "\x1b" + key;
    } else if (key === "Backspace") {
      sequence = "\x1b\x7f";
    }
  } else if (ctrlKey && !altKey && !metaKey) {
    requiresActivityIndicator = true;
    if (
      key.length === 1 &&
      key.toLowerCase() >= "a" &&
      key.toLowerCase() <= "z"
    ) {
      sequence = String.fromCharCode(
        key.toLowerCase().charCodeAt(0) - "a".charCodeAt(0) + 1,
      );
    } else if (key === "Backspace") {
      sequence = "\x17";
    } else if (key === " ") {
      sequence = "\x00";
    } else if (key === "[") {
      sequence = "\x1b";
    } else if (key === "\\") {
      sequence = "\x1c";
    } else if (key === "]") {
      sequence = "\x1d";
    } else if (key === "^" || key === "6") {
      sequence = "\x1e";
    } else if (key === "_" || key === "-") {
      sequence = "\x1f";
    } else if (key === "ArrowLeft") {
      sequence = "\x1b[1;5D";
    } else if (key === "ArrowRight") {
      sequence = "\x1b[1;5C";
    } else if (key === "ArrowUp") {
      sequence = "\x1b[1;5A";
    } else if (key === "ArrowDown") {
      sequence = "\x1b[1;5B";
    }
  } else if (
    key.startsWith("F") &&
    key.length > 1 &&
    !ctrlKey &&
    !altKey &&
    !metaKey &&
    !shiftKey
  ) {
    requiresActivityIndicator = true;
    const fNumber = parseInt(key.substring(1), 10);
    if (!isNaN(fNumber) && fNumber >= 1 && fNumber <= 12) {
      if (fNumber <= 4)
        sequence = `\x1bO${String.fromCharCode("P".charCodeAt(0) + fNumber - 1)}`;
      else sequence = `\x1b[${fNumber + 11}~`;
    }
  } else if (
    key.startsWith("F") &&
    key.length > 1 &&
    shiftKey &&
    !ctrlKey &&
    !altKey &&
    !metaKey
  ) {
    requiresActivityIndicator = true;
    const fNumber = parseInt(key.substring(1), 10);
    if (!isNaN(fNumber) && fNumber >= 1 && fNumber <= 10) {
      sequence = `\x1b[${fNumber + 22}~`;
    } else if (fNumber === 11) {
      sequence = `\x1b[23;2~`;
    } else if (fNumber === 12) {
      sequence = `\x1b[24;2~`;
    }
  } else if (!ctrlKey && !altKey && !metaKey) {
    switch (key) {
      case "Enter":
        sequence = "\r";
        break;
      case "Tab":
        sequence = shiftKey ? "\x1b[Z" : "\t";
        requiresActivityIndicator = true;
        break;
      case "Backspace":
        sequence = "\x7f";
        requiresActivityIndicator = true;
        break;
      case "Delete":
        sequence = "\x1b[3~";
        requiresActivityIndicator = true;
        break;
      case "ArrowUp":
        sequence = "\x1b[A";
        requiresActivityIndicator = true;
        break;
      case "ArrowDown":
        sequence = "\x1b[B";
        requiresActivityIndicator = true;
        break;
      case "ArrowRight":
        sequence = "\x1b[C";
        requiresActivityIndicator = true;
        break;
      case "ArrowLeft":
        sequence = "\x1b[D";
        requiresActivityIndicator = true;
        break;
      case "Home":
        sequence = "\x1b[H";
        requiresActivityIndicator = true;
        break;
      case "End":
        sequence = "\x1b[F";
        requiresActivityIndicator = true;
        break;
      case "PageUp":
        sequence = "\x1b[5~";
        requiresActivityIndicator = true;
        break;
      case "PageDown":
        sequence = "\x1b[6~";
        requiresActivityIndicator = true;
        break;
      case "Escape":
        sequence = "\x1b";
        requiresActivityIndicator = true;
        break;
      case "Insert":
        sequence = "\x1b[2~";
        requiresActivityIndicator = true;
        break;
      default:
        if (key.length === 1) {
          sequence = key;
        }
        break;
    }
  }

  if (sequence !== null) {
    sendDataToTerminals(sequence, socket);
    if (requiresActivityIndicator) {
      showGlobalInputActivity();
    }
    dom.commandInput.value = "";
  } else {
    console.log(`Prevented default for unhandled key combination: ${key}`);
    dom.commandInput.value = "";
  }
}

export function handleCommandPaste(event, socket) {
  if (dom.commandInput.disabled) return;
  event.preventDefault();
  const pastedData = event.clipboardData?.getData("text/plain");
  if (pastedData) {
    sendDataToTerminals(pastedData, socket);
    showGlobalInputActivity();
    dom.commandInput.value = "";
  }
}
