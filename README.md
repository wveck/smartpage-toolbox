# SmartPage Toolbox

Offline productivity Chrome extension combining screenshots, highlights, domain notes, clipboard history, and page dark mode overlays.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-blue)](https://chrome.google.com/webstore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 📸 **Screenshots**: Capture rectangular areas and copy to clipboard
- 📌 **Highlights**: Save text selections with context
- 🗒️ **Domain Notes**: Organize notes by website domain
- 📋 **Clipboard History**: Track and pin clipboard entries
- 🌙 **Dark Mode**: Apply dark overlays to any website
- 🔒 **Privacy First**: All data stored locally, never sent to servers
- 💎 **Pro Features**: One-time purchase unlocks unlimited history and advanced features

## Privacy Policy

[View Privacy Policy](https://wveck.github.io/smartpage-toolbox/PRIVACY_POLICY.html)

## Installation

### From Chrome Web Store
1. Visit the [Chrome Web Store listing](https://chrome.google.com/webstore) (coming soon)
2. Click "Add to Chrome"

### Development/Unpacked

## Development Setup

1. Open Chrome → go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `SmartPage Toolbox` folder.
4. The popup (browser action) is available from the toolbar icon; open the side panel from the toolbar menu or via the shortcut defined in `manifest.json`.

## Packaging for the Chrome Web Store

1. Increment the `version` in `manifest.json`.
2. Run a quick validation (`chrome://extensions` → **Pack extension...**) or zip manually:
   ```powershell
   cd "C:\Users\Asus\Desktop\SmartPage Toolbox"
   Compress-Archive -Path * -DestinationPath smartpage-toolbox.zip -Force
   ```
3. Upload the zip to the Chrome Web Store Developer Dashboard and follow the submission flow. Prepare release notes summarising the version changes.

## Chrome Web Store Licensing

- Insert your published extension ID inside `scripts/license.js` (`EXTENSION_ID` constant) and anywhere else it is referenced (README, store URL).
- Enable the licensing API in the Chrome Web Store dashboard (Monetize → Licensing). Documentation: <https://developer.chrome.com/docs/webstore/one-time-payments/>.
- The background service worker fetches `https://www.googleapis.com/chromewebstore/v1.1/userlicenses/<EXTENSION_ID>` using OAuth via `chrome.identity`.
- License results are cached for seven days (`LICENSE_REVALIDATE_INTERVAL_DAYS`). Users can force a refresh from **Settings → License → Revalidate**.

## Manual Unlock & Test Mode

- In **Settings → Developer Mode**, toggle Developer Mode to reveal manual unlock/testing helpers.
- Manual unlock token default: `SMARTPAGE-DEV-UNLOCK`. Update `MANUAL_UNLOCK_TOKEN` before distributing builds.
- Test Mode lets you simulate Pro/Free states and seed sample data. Use this for QA only; keep disabled for production builds.
- To test manual unlock: enable Developer Mode inside the extension UI, enter the token, and click **Unlock**. The UI badge should switch to “Pro unlocked”.

## Import / Export

- Export creates a timestamped JSON containing the entire `chrome.storage.local`.
- Import prompts for confirmation with the keys that will be overwritten.
- These features are gated behind the Pro license (one-time purchase).

## Shortcuts

- `Ctrl+Shift+Y` → Toggle SmartPage side panel.
- `Ctrl+Shift+S` → Quick screenshot capture.
- Users can change shortcuts via `chrome://extensions/shortcuts`.

## Permissions Explained

- `storage`: Persist notes, highlights, settings, clipboard, screenshots, and logs.
- `activeTab`: Capture screenshots, access domain info, and run per-tab scripts on demand.
- `scripting`: Inject selection overlays and dark mode CSS.
- `tabs`: Read tab URLs/titles for metadata and highlight navigation.
- `clipboardWrite`: Copy screenshots and saved items back to the clipboard.
- `contextMenus`: Provide the “Save highlight” context command.
- `identity`: Retrieve OAuth tokens for the Chrome Web Store Licensing API.
- `alarms`: Revalidate licensing status on a schedule.
- `host_permissions: <all_urls>`: Needed for highlights, clipboard hooks, and dark-mode overlays on any site (data stays local).

## Icons

- Placeholder icons (`assets/icons/icon16.png`, `icon48.png`, `icon128.png`) are simple SP monograms. Replace them with production-grade assets before publishing.

## Store Listing Copy

**Short description (132 chars max):**
> SmartPage Toolbox boosts your browsing with offline notes, highlights, screenshots, clipboard history, and one-click dark mode.

**Long description:**
> SmartPage Toolbox is a privacy-first productivity companion for Chrome. Capture precise screenshots, save in-page highlights with context, keep domain-linked notes, review clipboard history, and apply a clean dark overlay to any website—even offline. SmartPage stores everything locally using chrome.storage and never sends your data to external servers. A one-time Chrome Web Store purchase unlocks unlimited history, per-domain dark mode overrides, advanced backups, and developer utilities. Includes manual test unlock, built-in privacy notice, import/export, Workspaces-friendly UI, and keyboard shortcuts for instant access. Upgrade once to keep your browsing data organised forever.

