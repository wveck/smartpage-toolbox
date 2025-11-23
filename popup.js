/* File: popup.js
 * Purpose: Entry point for popup surface.
 */
import { initSmartPageUI } from './scripts/uiCommon.js';

document.addEventListener('DOMContentLoaded', () => {
  initSmartPageUI({ rootSelector: '#app', surface: 'popup' });
});

