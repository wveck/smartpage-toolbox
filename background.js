/* File: background.js
 * Purpose: SmartPage Toolbox service worker handling screenshots, licensing, context menus, clipboard tracking, and storage orchestration.
 */

import { ensureDefaults, StorageAPI, logError } from './scripts/storage.js';
import {
  STORAGE_KEYS,
  BASE_FREE_CLIPBOARD_LIMIT,
  LICENSE_REVALIDATE_ALARM,
  LICENSE_REVALIDATE_INTERVAL_DAYS
} from './scripts/constants.js';
import { checkLicense, getStoreUrl } from './scripts/license.js';

const MENU_ID_HIGHLIGHT = 'smartpage_save_highlight';
const pendingScreenshots = new Map();

(async function init() {
  await ensureDefaults();
  await initContextMenus(true);
  await scheduleLicenseRevalidation();
})();

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await initContextMenus(true);
  await scheduleLicenseRevalidation();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_ID_HIGHLIGHT && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'highlight:capture' });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-side-panel') {
    await openSidePanel();
  }
  if (command === 'quick-screenshot') {
    await startScreenshotFlow({});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'clipboard:save':
        await handleClipboardSave(message.payload || {});
        break;
      case 'screenshot:request':
        await startScreenshotFlow(message);
        break;
      case 'screenshot:selection-complete':
        await processScreenshotSelection(sender.tab?.id, message.rect);
        break;
      case 'screenshot:selection-cancelled':
        if (sender.tab?.id) pendingScreenshots.delete(sender.tab.id);
        break;
      case 'screenshot:copy':
        await copyScreenshotById(message.id);
        break;
      case 'highlight:save':
        await saveHighlight(message.payload, sender.tab);
        break;
      case 'highlights:open':
        await openHighlight(message.entry);
        break;
      case 'darkmode:get-state':
        {
          const prefs = (await StorageAPI.get(STORAGE_KEYS.PREFS)) || {};
          const domain = message.domain || '*';
          const enabled = prefs.darkMode?.overrides?.[domain] ?? prefs.darkMode?.global ?? false;
          sendResponse({ enabled });
          return;
        }
      case 'license:force-check':
        {
          const license = await checkLicense({ force: true });
          sendResponse(license);
          return;
        }
      case 'developer:seed-sample':
        await seedSampleData();
        break;
      default:
        break;
    }
    sendResponse?.(true);
  })().catch(async (error) => {
    await logError('background:onMessage', error, { type: message?.type });
    sendResponse?.(false);
  });
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === LICENSE_REVALIDATE_ALARM) {
    await checkLicense({ force: false });
  }
});

async function initContextMenus(force) {
  if (force) {
    try {
      chrome.contextMenus.remove(MENU_ID_HIGHLIGHT);
    } catch (_) {
      /* no-op */
    }
  }
  chrome.contextMenus.create({
    id: MENU_ID_HIGHLIGHT,
    title: 'Save highlight to SmartPage',
    contexts: ['selection']
  });
}

async function scheduleLicenseRevalidation() {
  chrome.alarms.create(LICENSE_REVALIDATE_ALARM, {
    periodInMinutes: LICENSE_REVALIDATE_INTERVAL_DAYS * 24 * 60
  });
}

async function handleClipboardSave(payload) {
  const { text, url } = payload;
  if (!text) return;
  const { isPro } = await checkLicense({ force: false });
  const domain = safeDomain(url);
  const entry = {
    id: crypto.randomUUID(),
    text: text.slice(0, 2000),
    url,
    domain,
    timestamp: Date.now(),
    pinned: false
  };
  const list = (await StorageAPI.get(STORAGE_KEYS.CLIPBOARD)) || [];
  list.unshift(entry);
  const pinned = list.filter((item) => item.pinned);
  let regular = list.filter((item) => !item.pinned);
  if (!isPro && regular.length > BASE_FREE_CLIPBOARD_LIMIT) {
    regular = regular.slice(0, BASE_FREE_CLIPBOARD_LIMIT);
  }
  await StorageAPI.set({ [STORAGE_KEYS.CLIPBOARD]: [...pinned, ...regular] });
}

async function startScreenshotFlow({ note }) {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  pendingScreenshots.set(tab.id, { note: note || '' });
  await chrome.tabs.sendMessage(tab.id, { type: 'screenshot:start' }).catch(async (error) => {
    await logError('screenshot:start', error);
  });
}

async function processScreenshotSelection(tabId, rect) {
  if (!tabId || !rect) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const cropped = await cropImage(dataUrl, rect);
    await chrome.tabs.sendMessage(tabId, { type: 'clipboard:write-image', dataUrl: cropped });
    await saveScreenshotRecord(tab, cropped, rect);
    pendingScreenshots.delete(tabId);
  } catch (error) {
    await logError('screenshot:process', error, { rect });
  }
}

async function cropImage(dataUrl, rect) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = rect.dpr || 1;
  const canvas = new OffscreenCanvas(rect.width * scale, rect.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    bitmap,
    (rect.x + rect.scrollX) * scale,
    (rect.y + rect.scrollY) * scale,
    rect.width * scale,
    rect.height * scale,
    0,
    0,
    rect.width * scale,
    rect.height * scale
  );
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(croppedBlob);
}

async function saveScreenshotRecord(tab, imageData, rect) {
  const { isPro } = await checkLicense({ force: false });
  await StorageAPI.updateArray(STORAGE_KEYS.SCREENSHOTS, (list) => {
    list.unshift({
      id: crypto.randomUUID(),
      url: tab.url,
      title: tab.title,
      note: pendingScreenshots.get(tab.id)?.note || '',
      imageData,
      rect,
      timestamp: Date.now()
    });
    if (!isPro && list.length > BASE_FREE_CLIPBOARD_LIMIT) {
      list.length = BASE_FREE_CLIPBOARD_LIMIT;
    }
    return list;
  });
}

async function copyScreenshotById(id) {
  if (!id) return;
  const list = (await StorageAPI.get(STORAGE_KEYS.SCREENSHOTS)) || [];
  const entry = list.find((item) => item.id === id);
  if (!entry?.imageData) return;
  const tab = await getActiveTab();
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'clipboard:write-image', dataUrl: entry.imageData });
}

async function saveHighlight(payload, tab) {
  if (!payload?.text) return;
  await StorageAPI.appendArray(STORAGE_KEYS.HIGHLIGHTS, {
    id: crypto.randomUUID(),
    ...payload
  });
}

async function openHighlight(entry) {
  if (!entry?.url || !entry.text) return;
  const existing = await findTabByUrl(entry.url);
  const targetTab = existing || (await chrome.tabs.create({ url: entry.url }));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
  }
  const listener = function (tabId, info) {
    if (tabId === targetTab.id && info.status === 'complete') {
      chrome.tabs.sendMessage(tabId, { type: 'highlight:locate', text: entry.text });
      chrome.tabs.onUpdated.removeListener(listener);
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.sendMessage(targetTab.id, { type: 'highlight:locate', text: entry.text }).catch(() => {
    /* wait for onUpdated */
  });
}

async function openSidePanel() {
  try {
    const tab = await getActiveTab();
    if (!tab) return;
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: 'sidepanel.html',
        enabled: true
      });
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } else {
      chrome.action.openPopup();
    }
  } catch (error) {
    await logError('sidepanel:open', error);
  }
}

async function seedSampleData() {
  await StorageAPI.set({
    [STORAGE_KEYS.SCREENSHOTS]: [{
      id: crypto.randomUUID(),
      url: 'https://example.com',
      title: 'Example',
      note: 'Sample capture',
      imageData: '',
      rect: { width: 100, height: 100 },
      timestamp: Date.now()
    }],
    [STORAGE_KEYS.HIGHLIGHTS]: [{
      id: crypto.randomUUID(),
      text: 'Sample highlight text.',
      contextBefore: 'before',
      contextAfter: 'after',
      url: 'https://example.com',
      timestamp: Date.now()
    }],
    [STORAGE_KEYS.NOTES]: {
      'domain:example.com': [{
        id: crypto.randomUUID(),
        title: 'Welcome',
        text: 'Sample note for example.com',
        timestamp: Date.now()
      }]
    },
    [STORAGE_KEYS.CLIPBOARD]: [{
      id: crypto.randomUUID(),
      text: 'Sample clipboard entry',
      url: 'https://example.com',
      domain: 'example.com',
      timestamp: Date.now(),
      pinned: true
    }]
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function findTabByUrl(url) {
  const all = await chrome.tabs.query({});
  const target = normalizeUrl(url);
  return all.find((tab) => normalizeUrl(tab.url) === target) || null;
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function safeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

