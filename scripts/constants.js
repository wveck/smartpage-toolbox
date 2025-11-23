/* File: scripts/constants.js
 * Purpose: Central location for immutable values, feature flags, and schema defaults.
 */

export const STORAGE_KEYS = {
  SCREENSHOTS: 'screenshots',
  HIGHLIGHTS: 'highlights',
  NOTES: 'notes',
  CLIPBOARD: 'clipboard',
  TODO: 'todos',
  PREFS: 'preferences',
  LICENSE: 'licenseCache',
  ERRORS: 'errorLogs'
};

export const LICENSE_REVALIDATE_ALARM = 'smartpage_license_revalidate';
export const LICENSE_REVALIDATE_INTERVAL_DAYS = 7;

export const DEFAULT_PREFERENCES = {
  darkMode: {
    global: false,
    overrides: {}
  },
  developerMode: false,
  testMode: {
    enabled: false,
    forcePro: false
  }
};

export const DEFAULT_STORAGE = {
  [STORAGE_KEYS.SCREENSHOTS]: [],
  [STORAGE_KEYS.HIGHLIGHTS]: [],
  [STORAGE_KEYS.NOTES]: {},
  [STORAGE_KEYS.CLIPBOARD]: [],
  [STORAGE_KEYS.TODO]: [],
  [STORAGE_KEYS.PREFS]: DEFAULT_PREFERENCES,
  [STORAGE_KEYS.LICENSE]: {
    lastChecked: 0,
    isPro: false,
    source: 'unknown'
  },
  [STORAGE_KEYS.ERRORS]: []
};

export const MAX_ERROR_LOGS = 200;
export const BASE_FREE_CLIPBOARD_LIMIT = 20;

export const UI_SECTIONS = [
  { id: 'notes', icon: '🗒', label: 'Notes' },
  { id: 'todo', icon: '✅', label: 'To Do' },
  { id: 'screenshots', icon: '📸', label: 'Screens' },
  { id: 'highlights', icon: '📌', label: 'Highlights' },
  { id: 'clipboard', icon: '📋', label: 'Clipboard' },
  { id: 'darkmode', icon: '🌙', label: 'Dark Mode' },
  { id: 'settings', icon: '⚙️', label: 'Settings' }
];

