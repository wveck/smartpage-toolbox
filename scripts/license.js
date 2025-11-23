/* File: scripts/license.js
 * Purpose: Handle Chrome Web Store license validation, caching, and manual overrides.
 */

import {
  STORAGE_KEYS,
  LICENSE_REVALIDATE_INTERVAL_DAYS
} from './constants.js';
import { StorageAPI, logError } from './storage.js';

// TODO: Replace with your published Chrome Web Store extension ID.
const EXTENSION_ID = 'YOUR_EXTENSION_ID_HERE';
// TODO: Change the manual unlock token before release.
const MANUAL_UNLOCK_TOKEN = 'SMARTPAGE-DEV-UNLOCK';

export async function checkLicense({ force = false } = {}) {
  const cache = (await StorageAPI.get(STORAGE_KEYS.LICENSE)) || {
    lastChecked: 0,
    isPro: false,
    source: 'unknown'
  };
  const now = Date.now();
  const intervalMs = LICENSE_REVALIDATE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

  if (!force && now - cache.lastChecked < intervalMs && cache.source !== 'unknown') {
    return cache;
  }

  let result = cache;
  try {
    result = await fetchLicenseFromStore();
  } catch (error) {
    await logError('license:fetch', error);
  }

  const next = {
    ...result,
    lastChecked: Date.now()
  };
  await StorageAPI.set({ [STORAGE_KEYS.LICENSE]: next });
  return next;
}

async function fetchLicenseFromStore() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, async (token) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      try {
        const res = await fetch(`https://www.googleapis.com/chromewebstore/v1.1/userlicenses/${EXTENSION_ID}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!res.ok) throw new Error(`License HTTP ${res.status}`);
        const data = await res.json();
        const isActive = data.result && data.accessLevel === 'FULL';
        resolve({
          isPro: Boolean(isActive),
          source: 'store',
          licensePayload: {
            accessLevel: data.accessLevel,
            expiryTime: data.expiryTime || null
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export function getStoreUrl() {
  return `https://chrome.google.com/webstore/detail/${EXTENSION_ID}`;
}

export async function manualUnlock(token) {
  if (token?.trim() === MANUAL_UNLOCK_TOKEN) {
    const cache = {
      isPro: true,
      source: 'manual',
      lastChecked: Date.now(),
      manualOverride: true
    };
    await StorageAPI.set({ [STORAGE_KEYS.LICENSE]: cache });
    return cache;
  }
  throw new Error('Invalid unlock token.');
}

export async function setTestModeState({ enabled, forcePro }) {
  const prefs = (await StorageAPI.get(STORAGE_KEYS.PREFS)) || {};
  prefs.testMode = { enabled, forcePro };
  await StorageAPI.set({ [STORAGE_KEYS.PREFS]: prefs });
  const cache = {
    isPro: Boolean(forcePro),
    source: enabled ? 'test-mode' : 'cache',
    lastChecked: Date.now()
  };
  if (enabled) {
    await StorageAPI.set({ [STORAGE_KEYS.LICENSE]: cache });
  }
  return cache;
}

