/* File: content/contentScript.js
 * Purpose: In-page helpers for screenshots, highlights, clipboard capture, and dark mode overlay.
 */

const overlayState = {
  active: false,
  start: null,
  rect: null,
  dom: null
};

const darkMode = {
  enabled: false,
  styleEl: null
};

init();

function init() {
  document.addEventListener('copy', handleCopyEvent, true);
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  syncDarkMode();
}

async function handleRuntimeMessage(message, sender, sendResponse) {
  switch (message?.type) {
    case 'screenshot:start':
      startSelection();
      break;
    case 'clipboard:write-image':
      await writeImageToClipboard(message.dataUrl);
      break;
    case 'highlight:capture':
      await captureHighlight();
      break;
    case 'highlight:locate':
      highlightTextOnPage(message.text);
      break;
    case 'darkmode:toggle':
      toggleDarkMode();
      break;
    case 'darkmode:state':
      setDarkMode(Boolean(message.enabled));
      break;
    default:
      break;
  }
  sendResponse?.(true);
  return true;
}

function startSelection() {
  if (overlayState.active) return;
  overlayState.active = true;
  overlayState.dom = document.createElement('div');
  overlayState.dom.className = 'smartpage-selection-overlay';
  overlayState.dom.innerHTML = `<style>
    .smartpage-selection-overlay {
      position: fixed;
      inset: 0;
      cursor: crosshair;
      background: rgba(0,0,0,0.05);
      z-index: 2147483647;
    }
    .smartpage-selection-overlay .box {
      position: absolute;
      border: 2px solid #4da1ff;
      background: rgba(77,161,255,0.2);
      pointer-events: none;
    }
  </style><div class="box" hidden></div>`;
  document.documentElement.appendChild(overlayState.dom);
  const box = overlayState.dom.querySelector('.box');
  const startDrag = (event) => {
    event.preventDefault();
    overlayState.start = { x: event.clientX, y: event.clientY };
    box.hidden = false;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag, { once: true });
  };
  const onDrag = (event) => {
    const rect = normalizeRect(overlayState.start, { x: event.clientX, y: event.clientY });
    overlayState.rect = rect;
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  };
  const endDrag = () => {
    document.removeEventListener('mousemove', onDrag);
    overlayState.dom.removeEventListener('mousedown', startDrag);
    overlayState.dom.remove();
    overlayState.active = false;
    if (overlayState.rect && overlayState.rect.width > 5 && overlayState.rect.height > 5) {
      chrome.runtime.sendMessage({
        type: 'screenshot:selection-complete',
        rect: {
          ...overlayState.rect,
          dpr: window.devicePixelRatio,
          scrollX: window.scrollX,
          scrollY: window.scrollY
        }
      });
    } else {
      chrome.runtime.sendMessage({ type: 'screenshot:selection-cancelled' });
    }
    overlayState.rect = null;
  };
  overlayState.dom.addEventListener('mousedown', startDrag);
}

function normalizeRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

async function writeImageToClipboard(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  } catch (error) {
    console.error('SmartPage copy failed', error);
  }
}

async function captureHighlight() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    alert('Select text on the page first.');
    return;
  }
  const text = selection.toString().trim();
  if (!text) {
    alert('Selection empty.');
    return;
  }
  const range = selection.getRangeAt(0);
  const context = extractContext(range);
  chrome.runtime.sendMessage({
    type: 'highlight:save',
    payload: {
      text,
      contextBefore: context.before,
      contextAfter: context.after,
      url: location.href,
      timestamp: Date.now()
    }
  });
}

function extractContext(range) {
  const nodeText = range.startContainer.textContent || '';
  const offset = range.startOffset;
  const before = nodeText.slice(Math.max(0, offset - 30), offset);
  const afterText = range.endContainer.textContent || '';
  const after = afterText.slice(range.endOffset, range.endOffset + 30);
  return { before, after };
}

function highlightTextOnPage(text) {
  if (!text) return;
  const found = window.find(text, false, false, true, false, true, false);
  if (!found) return;
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const marker = document.createElement('mark');
  marker.textContent = range.toString();
  range.deleteContents();
  range.insertNode(marker);
  marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => marker.remove(), 4000);
}

function handleCopyEvent(event) {
  const text = event.clipboardData?.getData('text/plain') || window.getSelection().toString();
  if (!text) return;
  chrome.runtime.sendMessage({
    type: 'clipboard:save',
    payload: {
      text,
      url: location.href
    }
  });
}

function syncDarkMode() {
  const domain = location.hostname.replace(/^www\./, '');
  chrome.runtime.sendMessage({ type: 'darkmode:get-state', domain }, (response) => {
    if (response) setDarkMode(Boolean(response.enabled));
  });
}

function toggleDarkMode() {
  setDarkMode(!darkMode.enabled);
}

function setDarkMode(enabled) {
  darkMode.enabled = enabled;
  if (enabled && !darkMode.styleEl) {
    darkMode.styleEl = document.createElement('style');
    darkMode.styleEl.dataset.smartpageDark = 'true';
    darkMode.styleEl.textContent = `
      :root {
        color-scheme: dark;
      }
      html.smartpage-dark {
        filter: invert(1) hue-rotate(180deg);
        background: #0c0c0c !important;
      }
      html.smartpage-dark img,
      html.smartpage-dark video {
        filter: invert(1) hue-rotate(180deg);
      }
    `;
    document.documentElement.appendChild(darkMode.styleEl);
  }
  document.documentElement.classList.toggle('smartpage-dark', enabled);
  if (!enabled && darkMode.styleEl) {
    darkMode.styleEl.remove();
    darkMode.styleEl = null;
  }
}

