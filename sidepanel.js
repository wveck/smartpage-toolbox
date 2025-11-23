/* File: sidepanel.js
 * Purpose: Entry point for side panel surface with slight animation hook.
 */
import { initSmartPageUI } from './scripts/uiCommon.js';

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('sp-sidepanel-enter');
  initSmartPageUI({ rootSelector: '#app', surface: 'sidepanel' });
});

