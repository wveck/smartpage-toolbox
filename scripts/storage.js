/* File: scripts/storage.js
 * Purpose: Wrapper helpers around chrome.storage for SmartPage Toolbox.
 */

import {
  DEFAULT_STORAGE,
  STORAGE_KEYS,
  MAX_ERROR_LOGS,
  BASE_FREE_CLIPBOARD_LIMIT
} from './constants.js';

/** Ensures all default keys exist without overwriting data. */
export async function ensureDefaults() {
  const current = await chrome.storage.local.get(null);
  const updates = {};
  for (const [key, value] of Object.entries(DEFAULT_STORAGE)) {
    if (!(key in current)) {
      updates[key] = value;
    }
  }
  if (Object.keys(updates).length) {
    await chrome.storage.local.set(updates);
  }
}

export const StorageAPI = {
  async get(key) {
    const result = await chrome.storage.local.get([key]);
    return result[key];
  },
  async set(updates) {
    await chrome.storage.local.set(updates);
  },
  async getAll() {
    return chrome.storage.local.get(null);
  },
  async clear() {
    await chrome.storage.local.clear();
    await ensureDefaults();
  },
  async getPreferences() {
    return StorageAPI.get(STORAGE_KEYS.PREFS);
  },
  async setPreferences(prefs) {
    await StorageAPI.set({ [STORAGE_KEYS.PREFS]: prefs });
  },
  async appendArray(key, entry, { limit } = {}) {
    const list = (await StorageAPI.get(key)) || [];
    list.unshift(entry);
    if (limit && list.length > limit) {
      list.length = limit;
    }
    await StorageAPI.set({ [key]: list });
    return list;
  },
  async updateArray(key, updater) {
    const list = (await StorageAPI.get(key)) || [];
    const next = updater(list.slice());
    await StorageAPI.set({ [key]: next });
    return next;
  }
};

/** Writes an error entry to storage with rolling limit. */
export async function logError(scope, error, context = {}) {
  const timestamp = new Date().toISOString();
  const message = typeof error === 'string' ? error : error?.message || 'Unknown error';
  const entry = { scope, message, context, timestamp };
  const list = ((await StorageAPI.get(STORAGE_KEYS.ERRORS)) || []).slice(-MAX_ERROR_LOGS + 1);
  list.push(entry);
  await StorageAPI.set({ [STORAGE_KEYS.ERRORS]: list });
  console.error('[SmartPage]', scope, message, context);
  return entry;
}

/** Utility to trim clipboard entries based on license tier. */
export async function enforceClipboardLimit(isPro) {
  const limit = isPro ? null : BASE_FREE_CLIPBOARD_LIMIT;
  if (!limit) return;
  await StorageAPI.updateArray(STORAGE_KEYS.CLIPBOARD, (items) => items.slice(0, limit));
}

