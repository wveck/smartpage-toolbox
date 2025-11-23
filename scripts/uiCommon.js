/* File: scripts/uiCommon.js
 * Purpose: Shared UI logic for popup and side panel surfaces.
 */

import {
  STORAGE_KEYS,
  UI_SECTIONS,
  BASE_FREE_CLIPBOARD_LIMIT
} from './constants.js';
import {
  StorageAPI,
  ensureDefaults,
  logError,
  enforceClipboardLimit
} from './storage.js';
import {
  checkLicense,
  manualUnlock,
  getStoreUrl,
  setTestModeState
} from './license.js';

export async function initSmartPageUI({ rootSelector, surface }) {
  await ensureDefaults();
  const root = document.querySelector(rootSelector);
  if (!root) {
    console.error('SmartPage root missing');
    return;
  }

  const state = {
    activeSection: 'notes',
    isPro: false,
    license: null,
    domain: 'unknown',
    tabId: null,
    data: {},
    prefs: {},
    noteSearchQuery: '',
    surface
  };

  root.innerHTML = `
    <div class="sp-shell">
      <header class="sp-header">
        <div class="sp-brand">SmartPage Toolbox</div>
        <div class="sp-license-badge" aria-live="polite"></div>
      </header>
      <nav class="sp-nav" role="tablist"></nav>
      <main class="sp-content" tabindex="-1"></main>
      <div class="sp-toast" role="status" aria-live="assertive"></div>
      <div class="sp-modal hidden" role="dialog" aria-modal="true">
        <div class="sp-modal-card">
          <h3>Pro Feature</h3>
          <p class="sp-modal-message"></p>
          <div class="sp-modal-actions">
            <button class="sp-btn ghost" data-modal-action="close">Close</button>
            <button class="sp-btn primary" data-modal-action="store">Open Store</button>
          </div>
        </div>
      </div>
    </div>
  `;

  renderNav(root.querySelector('.sp-nav'), state);
  bindModal(root, state);

  chrome.storage.onChanged.addListener((changes) => {
    for (const key of Object.keys(changes)) {
      state.data[key] = changes[key].newValue;
    }
    refreshSection(root, state);
  });

  await hydrateState(state);
  await enforceClipboardLimit(state.isPro);
  await loadData(state);
  refreshLicenseBadge(root, state);
  refreshSection(root, state);
  bindGlobalActions(root, state);
}

function renderNav(nav, state) {
  nav.innerHTML = UI_SECTIONS.map((section) => `
    <button class="sp-nav-btn" role="tab" data-section="${section.id}" aria-label="${section.label}">
      <span>${section.icon}</span>
      <small>${section.label}</small>
    </button>
  `).join('');
  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('.sp-nav-btn');
    if (!btn) return;
    state.activeSection = btn.dataset.section;
    refreshSection(nav.closest('.sp-shell'), state);
  });
}

async function hydrateState(state) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  state.tabId = tab?.id || null;
  state.domain = tab?.url ? extractDomain(tab.url) : 'unknown';
  state.data = await StorageAPI.getAll();
  state.prefs = state.data[STORAGE_KEYS.PREFS] || {};
  state.license = await checkLicense({ force: false });
  if (state.prefs.testMode?.enabled) {
    state.license.isPro = Boolean(state.prefs.testMode.forcePro);
    state.license.source = 'test-mode';
  }
  state.isPro = Boolean(state.license.isPro);
}

async function loadData(state) {
  state.data = await StorageAPI.getAll();
}

function refreshLicenseBadge(root, state) {
  const badge = root.querySelector('.sp-license-badge');
  const label = state.isPro ? 'Pro unlocked' : 'Free tier';
  badge.textContent = label;
  badge.dataset.tier = state.isPro ? 'pro' : 'free';
}

function refreshSection(root, state) {
  if (!root.querySelector) {
    root = document.querySelector(root);
  }
  const content = root.querySelector('.sp-content');
  root.querySelectorAll('.sp-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === state.activeSection);
  });
  switch (state.activeSection) {
    case 'notes':
      renderNotes(content, state);
      break;
    case 'todo':
      renderTodo(content, state);
      break;
    case 'screenshots':
      renderScreens(content, state);
      break;
    case 'highlights':
      renderHighlights(content, state);
      break;
    case 'clipboard':
      renderClipboard(content, state);
      break;
    case 'darkmode':
      renderDarkMode(content, state);
      break;
    case 'settings':
      renderSettings(content, state);
      break;
    default:
      content.innerHTML = '<p>Select a tool.</p>';
  }
}

function renderNotes(container, state) {
  const byDomain = state.data[STORAGE_KEYS.NOTES] || {};
  const key = `domain:${state.domain}`;
  const notes = byDomain[key] || [];
  const allCount = Object.values(byDomain).reduce((acc, arr) => acc + arr.length, 0);
  const searchTerm = state.noteSearchQuery || '';
  const filtered = searchTerm
    ? notes.filter((note) => note.text.toLowerCase().includes(searchTerm.toLowerCase()))
    : notes;
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Notes for ${state.domain}</h2>
          <p>${notes.length} saved · ${allCount} total</p>
        </div>
        <div class="sp-inline-actions">
          <button class="sp-btn ghost" data-action="search-notes">Search All</button>
        </div>
      </header>
      <input class="sp-input" type="search" placeholder="Filter this domain" value="${sanitize(searchTerm)}" data-field="note-search" />
      <textarea class="sp-input" rows="3" placeholder="Write a note..." data-field="note-text"></textarea>
      <div class="sp-row">
        <input class="sp-input" type="text" placeholder="Optional title" data-field="note-title" />
        <button class="sp-btn primary" data-action="save-note">Save</button>
      </div>
      <div class="sp-note-list" role="list">
        ${filtered.map((note) => `
          <article class="sp-note-card" data-note-id="${note.id}">
            <div class="sp-note-meta">
              <strong>${sanitize(note.title || 'Untitled')}</strong>
              <time>${formatRelative(note.timestamp)}</time>
            </div>
            <p>${sanitize(note.text)}</p>
            <div class="sp-inline-actions">
              <button class="sp-link" data-action="edit-note">Edit</button>
              <button class="sp-link danger" data-action="delete-note">Delete</button>
            </div>
          </article>
        `).join('') || '<p class="sp-empty">No notes yet.</p>'}
      </div>
    </section>
  `;
  container.dataset.editId = '';
  container.querySelector('[data-field="note-search"]').addEventListener('input', (event) => {
    state.noteSearchQuery = event.target.value;
    refreshSection(container.closest('.sp-shell'), state);
  });
  container.querySelector('[data-action="save-note"]').addEventListener('click', async () => {
    await saveNote(container, state);
  });
  container.querySelector('[data-action="search-notes"]').addEventListener('click', () => {
    openSearchModal(state);
  });
  container.querySelectorAll('[data-action="delete-note"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-note-id]').dataset.noteId;
      await mutateNotes(state, key, (list) => list.filter((n) => n.id !== id));
      toast(state, 'Note deleted');
    });
  });
  container.querySelectorAll('[data-action="edit-note"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-note-id]');
      const id = card.dataset.noteId;
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      container.querySelector('[data-field="note-title"]').value = note.title || '';
      container.querySelector('[data-field="note-text"]').value = note.text || '';
      container.dataset.editId = id;
      container.querySelector('[data-action="save-note"]').textContent = 'Update';
    });
  });
}

async function saveNote(container, state) {
  const key = `domain:${state.domain}`;
  const title = container.querySelector('[data-field="note-title"]').value.trim();
  const text = container.querySelector('[data-field="note-text"]').value.trim();
  const editId = container.dataset.editId;
  if (!text) {
    toast(state, 'Note cannot be empty', 'error');
    return;
  }
  await mutateNotes(state, key, (list) => {
    if (editId) {
      return list.map((note) =>
        note.id === editId ? { ...note, title, text, timestamp: Date.now() } : note
      );
    }
    const note = {
      id: crypto.randomUUID(),
      title,
      text,
      timestamp: Date.now()
    };
    list.unshift(note);
    return list.slice(0, 200);
  });
  container.querySelector('[data-field="note-text"]').value = '';
  container.dataset.editId = '';
  container.querySelector('[data-action="save-note"]').textContent = 'Save';
  toast(state, 'Note saved');
}

async function mutateNotes(state, key, updater) {
  const notes = (state.data[STORAGE_KEYS.NOTES] || {});
  const list = notes[key] ? [...notes[key]] : [];
  const next = updater(list);
  notes[key] = next;
  await StorageAPI.set({ [STORAGE_KEYS.NOTES]: notes });
}

function renderTodo(container, state) {
  const todos = state.data[STORAGE_KEYS.TODO] || [];
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Quick Tasks</h2>
          <p>${todos.filter((t) => !t.done).length} open</p>
        </div>
      </header>
      <div class="sp-row">
        <input class="sp-input" type="text" placeholder="Add a task" data-field="todo-text" />
        <button class="sp-btn primary" data-action="add-todo">Add</button>
      </div>
      <ul class="sp-list" role="list">
        ${todos.map((todo) => `
          <li class="sp-list-item" data-todo-id="${todo.id}">
            <label>
              <input type="checkbox" ${todo.done ? 'checked' : ''} />
              <span>${sanitize(todo.text)}</span>
            </label>
            <button class="sp-link danger" data-action="delete-todo">Delete</button>
          </li>
        `).join('') || '<p class="sp-empty">No tasks.</p>'}
      </ul>
    </section>
  `;
  container.querySelector('[data-action="add-todo"]').addEventListener('click', async () => {
    const input = container.querySelector('[data-field="todo-text"]');
    const text = input.value.trim();
    if (!text) return;
    const list = [...todos];
    list.unshift({ id: crypto.randomUUID(), text, done: false, timestamp: Date.now() });
    await StorageAPI.set({ [STORAGE_KEYS.TODO]: list.slice(0, 200) });
    toast(state, 'Task added');
    input.value = '';
  });
  container.querySelectorAll('.sp-list-item input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', async () => {
      const id = input.closest('[data-todo-id]').dataset.todoId;
      const list = todos.map((t) => (t.id === id ? { ...t, done: input.checked } : t));
      await StorageAPI.set({ [STORAGE_KEYS.TODO]: list });
    });
  });
  container.querySelectorAll('[data-action="delete-todo"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-todo-id]').dataset.todoId;
      const list = todos.filter((t) => t.id !== id);
      await StorageAPI.set({ [STORAGE_KEYS.TODO]: list });
      toast(state, 'Task removed');
    });
  });
}

function renderScreens(container, state) {
  const list = state.data[STORAGE_KEYS.SCREENSHOTS] || [];
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Screenshots</h2>
          <p>${list.length} stored ${state.isPro ? '' : `(max ${BASE_FREE_CLIPBOARD_LIMIT})`}</p>
        </div>
        <button class="sp-btn primary" data-action="capture-screen">Capture</button>
      </header>
      <input class="sp-input" type="text" placeholder="Optional note before capture" data-field="shot-note" />
      <div class="sp-card-list">
        ${list.map((shot) => `
          <article class="sp-item" data-id="${shot.id}">
            <div>
              <strong>${sanitize(shot.note || 'Untitled screenshot')}</strong>
              <p>${sanitize(shot.url)}</p>
              <time>${formatRelative(shot.timestamp)}</time>
            </div>
            <div class="sp-inline-actions">
              <button class="sp-link" data-action="open-shot">Open Page</button>
              <button class="sp-link" data-action="copy-shot">Copy PNG</button>
            </div>
          </article>
        `).join('') || '<p class="sp-empty">No screenshots yet.</p>'}
      </div>
    </section>
  `;
  const noteField = container.querySelector('[data-field="shot-note"]');
  container.querySelector('[data-action="capture-screen"]').addEventListener('click', () => {
    const note = noteField.value.trim();
    startScreenshot(state, note);
    noteField.value = '';
  });
  container.querySelectorAll('[data-action="open-shot"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const entry = list.find((x) => x.id === id);
      if (entry?.url) chrome.tabs.create({ url: entry.url });
    });
  });
  container.querySelectorAll('[data-action="copy-shot"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      await chrome.runtime.sendMessage({ type: 'screenshot:copy', id });
      toast(state, 'Screenshot copied');
    });
  });
}

function renderHighlights(container, state) {
  const list = state.data[STORAGE_KEYS.HIGHLIGHTS] || [];
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Highlights</h2>
          <p>${list.length} saved snippets</p>
        </div>
        <button class="sp-btn primary" data-action="capture-highlight">Save Highlight</button>
      </header>
      <div class="sp-card-list">
        ${list.map((entry) => `
          <article class="sp-item" data-id="${entry.id}">
            <blockquote>${sanitize(entry.text)}</blockquote>
            <small>${sanitize(entry.url)}</small>
            <time>${formatRelative(entry.timestamp)}</time>
            <div class="sp-inline-actions">
              <button class="sp-link" data-action="open-highlight">Open</button>
              <button class="sp-link danger" data-action="delete-highlight">Delete</button>
            </div>
          </article>
        `).join('') || '<p class="sp-empty">No highlights saved.</p>'}
      </div>
    </section>
  `;
  container.querySelector('[data-action="capture-highlight"]').addEventListener('click', () => {
    startHighlightCapture(state);
  });
  container.querySelectorAll('[data-action="open-highlight"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const entry = list.find((x) => x.id === id);
      if (entry) {
        chrome.runtime.sendMessage({ type: 'highlights:open', entry });
      }
    });
  });
  container.querySelectorAll('[data-action="delete-highlight"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const next = list.filter((x) => x.id !== id);
      await StorageAPI.set({ [STORAGE_KEYS.HIGHLIGHTS]: next });
      toast(state, 'Highlight removed');
    });
  });
}

function renderClipboard(container, state) {
  const list = state.data[STORAGE_KEYS.CLIPBOARD] || [];
  const pinned = list.filter((item) => item.pinned);
  const others = list.filter((item) => !item.pinned);
  const display = [...pinned, ...others];
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Clipboard</h2>
          <p>${list.length} items ${state.isPro ? '' : `(max ${BASE_FREE_CLIPBOARD_LIMIT} unpinned)`}</p>
        </div>
        <div class="sp-inline-actions">
          <button class="sp-btn ghost" data-action="clear-clipboard">Clear</button>
        </div>
      </header>
      <ul class="sp-list clipboard" role="list">
        ${display.map((item) => `
          <li class="sp-list-item" data-id="${item.id}">
            <div>
              <p>${sanitize(item.text)}</p>
              <small>${item.pinned ? '📌 pinned · ' : ''}${item.domain || 'unknown'} · ${formatRelative(item.timestamp)}</small>
            </div>
            <div class="sp-inline-actions">
              <button class="sp-link" data-action="copy-item">Copy</button>
              <button class="sp-link" data-action="pin-item">${item.pinned ? 'Unpin' : 'Pin'}</button>
              <button class="sp-link danger" data-action="delete-item">Delete</button>
            </div>
          </li>
        `).join('') || '<p class="sp-empty">Clipboard history empty.</p>'}
      </ul>
    </section>
  `;
  container.querySelector('[data-action="clear-clipboard"]').addEventListener('click', async () => {
    if (confirm('Clear all clipboard history (including pinned)?')) {
      await StorageAPI.set({ [STORAGE_KEYS.CLIPBOARD]: [] });
      toast(state, 'Clipboard cleared');
    }
  });
  container.querySelectorAll('[data-action="copy-item"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const entry = list.find((x) => x.id === id);
      if (!entry) return;
      await navigator.clipboard.writeText(entry.text);
      toast(state, 'Copied to clipboard');
    });
  });
  container.querySelectorAll('[data-action="delete-item"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const next = list.filter((x) => x.id !== id);
      await StorageAPI.set({ [STORAGE_KEYS.CLIPBOARD]: next });
      toast(state, 'Removed');
    });
  });
  container.querySelectorAll('[data-action="pin-item"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const next = list.map((item) =>
        item.id === id ? { ...item, pinned: !item.pinned } : item
      );
      await StorageAPI.set({ [STORAGE_KEYS.CLIPBOARD]: next });
      toast(state, 'Pin updated');
    });
  });
}

function renderDarkMode(container, state) {
  const prefs = state.data[STORAGE_KEYS.PREFS] || {};
  const globalEnabled = prefs.darkMode?.global ?? false;
  const override = prefs.darkMode?.overrides?.[state.domain];
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Dark Mode</h2>
          <p>Toggle Smart overlay</p>
        </div>
      </header>
      <div class="sp-row">
        <label class="sp-toggle">
          <input type="checkbox" data-action="darkmode-global" ${globalEnabled ? 'checked' : ''}/>
          <span>Global Default</span>
        </label>
      </div>
      <div class="sp-row">
        <label class="sp-toggle">
          <input type="checkbox" data-action="darkmode-domain" ${override ? 'checked' : ''} ${state.isPro ? '' : 'disabled'}/>
          <span>${state.domain}</span>
        </label>
        ${state.isPro ? '' : '<small class="sp-hint">Pro required for per-domain override</small>'}
      </div>
      <div class="sp-row">
        <button class="sp-btn primary" data-action="apply-darkmode">Apply to page</button>
      </div>
    </section>
  `;
  container.querySelector('[data-action="darkmode-global"]').addEventListener('change', async (event) => {
    prefs.darkMode = prefs.darkMode || { global: false, overrides: {} };
    prefs.darkMode.global = event.target.checked;
    await StorageAPI.set({ [STORAGE_KEYS.PREFS]: prefs });
    toast(state, 'Global preference saved');
  });
  const domainToggle = container.querySelector('[data-action="darkmode-domain"]');
  if (domainToggle) {
    domainToggle.addEventListener('change', async (event) => {
      if (!state.isPro) {
        event.preventDefault();
        return requirePro(state, 'Per-domain dark mode overrides');
      }
      prefs.darkMode = prefs.darkMode || { global: false, overrides: {} };
      prefs.darkMode.overrides = prefs.darkMode.overrides || {};
      prefs.darkMode.overrides[state.domain] = event.target.checked;
      await StorageAPI.set({ [STORAGE_KEYS.PREFS]: prefs });
      toast(state, 'Domain preference saved');
    });
  }
  container.querySelector('[data-action="apply-darkmode"]').addEventListener('click', () => {
    applyDarkMode(state);
  });
}

function renderSettings(container, state) {
  const license = state.license || {};
  const prefs = state.data[STORAGE_KEYS.PREFS] || {};
  const errorLogs = state.data[STORAGE_KEYS.ERRORS] || [];
  container.innerHTML = `
    <section>
      <header class="sp-section-header">
        <div>
          <h2>Settings</h2>
          <p>Manage SmartPage Toolbox</p>
        </div>
      </header>
      <div class="sp-card">
        <h3>License</h3>
        <p>Status: <strong>${state.isPro ? 'Pro' : 'Free'}</strong> (${license.source || 'cache'})</p>
        <div class="sp-inline-actions">
          <button class="sp-btn ghost" data-action="check-license">Revalidate</button>
          <button class="sp-btn ghost" data-action="open-store">View Store</button>
        </div>
      </div>
      <div class="sp-card">
        <h3>Data</h3>
        <div class="sp-inline-actions">
          <button class="sp-btn ghost" data-action="export-data">Export JSON</button>
          <button class="sp-btn ghost" data-action="import-data">Import JSON</button>
          <button class="sp-btn danger" data-action="clear-data">Reset Storage</button>
        </div>
        <p class="sp-hint">${state.isPro ? 'Full backup unlocked.' : 'Import/export available for Pro users.'}</p>
      </div>
      <div class="sp-card">
        <h3>Privacy</h3>
        <p>All notes, highlights, clipboard entries, and screenshots stay on this device. SmartPage Toolbox never sends your content to remote servers. Only license validation requests the Chrome Web Store for purchase status.</p>
      </div>
      <div class="sp-card">
        <h3>Error Logs (${errorLogs.length})</h3>
        <pre class="sp-log">${sanitize(JSON.stringify(errorLogs.slice(-5), null, 2))}</pre>
        <button class="sp-btn ghost" data-action="clear-logs">Clear Logs</button>
      </div>
      <div class="sp-card">
        <label class="sp-toggle">
          <input type="checkbox" data-action="developer-mode" ${prefs.developerMode ? 'checked' : ''}/>
          <span>Developer Mode</span>
        </label>
      </div>
      ${prefs.developerMode ? renderDeveloperPanel(prefs, state) : ''}
    </section>
  `;
  container.querySelector('[data-action="check-license"]').addEventListener('click', async () => {
    const result = await chrome.runtime.sendMessage({ type: 'license:force-check' });
    state.isPro = result?.isPro;
    state.license = result;
    refreshLicenseBadge(container.closest('.sp-shell'), state);
    toast(state, 'License refreshed');
  });
  container.querySelector('[data-action="open-store"]').addEventListener('click', () => {
    chrome.tabs.create({ url: getStoreUrl() });
  });
  container.querySelector('[data-action="export-data"]').addEventListener('click', () => {
    if (!state.isPro) return requirePro(state, 'Exporting backups');
    exportData(state);
  });
  container.querySelector('[data-action="import-data"]').addEventListener('click', () => {
    if (!state.isPro) return requirePro(state, 'Importing backups');
    importData(state);
  });
  container.querySelector('[data-action="clear-data"]').addEventListener('click', async () => {
    if (!confirm('Reset all SmartPage data?')) return;
    await StorageAPI.clear();
    toast(state, 'Data cleared');
  });
  container.querySelector('[data-action="clear-logs"]').addEventListener('click', async () => {
    await StorageAPI.set({ [STORAGE_KEYS.ERRORS]: [] });
    toast(state, 'Logs cleared');
  });
  container.querySelector('[data-action="developer-mode"]').addEventListener('change', async (event) => {
    prefs.developerMode = event.target.checked;
    await StorageAPI.set({ [STORAGE_KEYS.PREFS]: prefs });
    toast(state, 'Developer mode updated');
  });
}

function renderDeveloperPanel(prefs, state) {
  return `
    <div class="sp-card dev">
      <h3>Developer Tools</h3>
      <label class="sp-toggle">
        <input type="checkbox" data-action="developer-test-mode" ${prefs.testMode?.enabled ? 'checked' : ''}/>
        <span>Test Mode (mock license)</span>
      </label>
      <label class="sp-toggle">
        <input type="checkbox" data-action="developer-force-pro" ${prefs.testMode?.forcePro ? 'checked' : ''}/>
        <span>Force Pro in Test Mode</span>
      </label>
      <div class="sp-row">
        <input class="sp-input" type="password" placeholder="Manual unlock token" data-field="manual-token"/>
        <button class="sp-btn ghost" data-action="manual-unlock">Unlock</button>
      </div>
      <div class="sp-inline-actions">
        <button class="sp-btn ghost" data-action="seed-sample">Seed Sample Data</button>
      </div>
    </div>
  `;
}

function bindGlobalActions(root, state) {
  root.addEventListener('change', async (event) => {
    const action = event.target.dataset.action;
    if (action === 'developer-test-mode' || action === 'developer-force-pro') {
      const testToggle = root.querySelector('[data-action="developer-test-mode"]');
      const forceToggle = root.querySelector('[data-action="developer-force-pro"]');
      if (!testToggle || !forceToggle) return;
      const prefs = state.data[STORAGE_KEYS.PREFS] || {};
      prefs.developerMode = true;
      prefs.testMode = prefs.testMode || {};
      prefs.testMode.enabled = testToggle.checked;
      prefs.testMode.forcePro = forceToggle.checked;
      await StorageAPI.set({ [STORAGE_KEYS.PREFS]: prefs });
      await setTestModeState(prefs.testMode);
      toast(state, 'Test mode updated');
    }
  });
  root.addEventListener('click', async (event) => {
    if (event.target.dataset.action === 'manual-unlock') {
      const token = root.querySelector('[data-field="manual-token"]').value;
      try {
        const cache = await manualUnlock(token);
        state.isPro = cache.isPro;
        toast(state, 'Manual unlock applied');
        refreshLicenseBadge(root, state);
      } catch (err) {
        toast(state, err.message || 'Unlock failed', 'error');
      }
    }
    if (event.target.dataset.action === 'seed-sample') {
      await chrome.runtime.sendMessage({ type: 'developer:seed-sample' });
      toast(state, 'Sample data seeded');
    }
  });
}

function bindModal(root, state) {
  const modal = root.querySelector('.sp-modal');
  modal.addEventListener('click', (event) => {
    if (event.target.dataset.modalAction === 'close' || event.target === modal) {
      modal.classList.add('hidden');
    }
    if (event.target.dataset.modalAction === 'store') {
      chrome.tabs.create({ url: getStoreUrl() });
      modal.classList.add('hidden');
    }
  });
  state.showModal = (message) => {
    modal.querySelector('.sp-modal-message').textContent = message;
    modal.classList.remove('hidden');
  };
}

function requirePro(state, feature) {
  const message = `${feature} is part of SmartPage Toolbox Pro. Purchase once on the Chrome Web Store to unlock it permanently.`;
  state.showModal?.(message);
}

async function startScreenshot(state, note) {
  await chrome.runtime.sendMessage({ type: 'screenshot:request', note });
}

async function startHighlightCapture(state) {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'highlight:capture' });
}

async function applyDarkMode(state) {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'darkmode:toggle' });
  toast(state, 'Dark mode applied');
}

async function exportData(state) {
  const data = await StorageAPI.getAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `smartpage-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast(state, 'Export started');
}

function importData(state) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      const keys = Object.keys(json);
      if (!confirm(`Import will overwrite: ${keys.join(', ')}. Continue?`)) return;
      await chrome.storage.local.set(json);
      toast(state, 'Import completed');
    } catch (error) {
      await logError('settings:import', error);
      toast(state, 'Import failed', 'error');
    }
  });
  input.click();
}

function openSearchModal(state) {
  const notes = state.data[STORAGE_KEYS.NOTES] || {};
  const query = prompt('Search notes across all domains:');
  if (!query) return;
  const matches = [];
  for (const [domainKey, list] of Object.entries(notes)) {
    list.forEach((note) => {
      if (note.text.toLowerCase().includes(query.toLowerCase())) {
        matches.push({ domainKey, note });
      }
    });
  }
  alert(matches.length ? matches.map((m) => `${m.domainKey}: ${m.note.text}`).join('\n\n') : 'No matches found.');
}

function toast(state, message, variant) {
  const root = document.querySelector('.sp-shell');
  const toastEl = root?.querySelector('.sp-toast');
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.dataset.variant = variant || 'info';
  toastEl.classList.add('visible');
  setTimeout(() => toastEl.classList.remove('visible'), 2500);
}

function sanitize(input) {
  if (!input) return '';
  return input.replace(/[<>&"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;'
  }[c]));
}

function formatRelative(timestamp) {
  if (!timestamp) return '';
  const delta = Date.now() - timestamp;
  if (delta < 60000) return 'just now';
  if (delta < 3600000) return `${Math.floor(delta / 60000)} min ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} h ago`;
  return `${new Date(timestamp).toLocaleString()}`;
}

function extractDomain(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

