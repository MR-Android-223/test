/* ============================================================
   Key Vault — script.js
   Full SPA logic: Firebase Auth/Firestore, CRUD, Security,
   PWA, UI interactions.
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────
   FIREBASE CONFIGURATION
   Replace with your own Firebase project config.
   ────────────────────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/* ──────────────────────────────────────────────────────────
   APP STATE
   ────────────────────────────────────────────────────────── */
const state = {
  user: null,               // Firebase user object
  accounts: [],             // Array of account objects
  folders: [],              // Array of folder name strings
  masterPasswordHash: null, // SHA-256 hash stored in Firestore
  appUnlocked: false,       // Whether master password gate is passed
  currentFolder: 'all',     // Active folder chip
  currentSort: 'newest',    // newest | oldest | az
  searchQuery: '',          // Live search string
  selectionMode: false,     // Multi-select mode
  selectedIds: new Set(),   // IDs selected in multi-select
  editingId: null,          // ID of account being edited (null = new)
  detailId: null,           // ID currently shown in detail modal
  contextId: null,          // ID targeted by context menu
  firestoreUnsub: null,     // Firestore real-time listener unsubscribe fn
  longPressTimer: null,
};

/* ──────────────────────────────────────────────────────────
   FIREBASE INIT
   ────────────────────────────────────────────────────────── */
let db, auth, googleProvider;

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db   = firebase.firestore();
    auth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();

    auth.onAuthStateChanged(onAuthStateChanged);
  } catch (e) {
    console.error('Firebase init failed:', e);
    showToast('Firebase not configured. Running in guest mode.', 'info');
    // Still allow app usage without cloud sync
    renderUI();
  }
}

/* ──────────────────────────────────────────────────────────
   AUTH STATE HANDLER
   ────────────────────────────────────────────────────────── */
function onAuthStateChanged(user) {
  state.user = user;

  if (user) {
    // Update UI with user info
    updateUserUI(user);
    setSyncStatus('syncing');
    // Subscribe to Firestore real-time updates
    subscribeToFirestore(user.uid);
  } else {
    updateUserUI(null);
    // Unsubscribe from Firestore
    if (state.firestoreUnsub) { state.firestoreUnsub(); state.firestoreUnsub = null; }
    state.accounts = [];
    state.folders = [];
    state.masterPasswordHash = null;
    setSyncStatus('offline');
    renderUI();
  }
}

function updateUserUI(user) {
  const avatar    = document.getElementById('userAvatar');
  const name      = document.getElementById('userName');
  const email     = document.getElementById('userEmail');
  const btnText   = document.getElementById('authBtnText');

  if (user) {
    avatar.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="${user.displayName}" referrerpolicy="no-referrer"/>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    name.textContent  = user.displayName || 'User';
    email.textContent = user.email || '';
    btnText.textContent = 'Sign Out';
  } else {
    avatar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    name.textContent  = 'Guest User';
    email.textContent = 'Sign in to sync';
    btnText.textContent = 'Sign in with Google';
  }
}

/* ──────────────────────────────────────────────────────────
   FIRESTORE — REAL-TIME LISTENER
   ────────────────────────────────────────────────────────── */
function subscribeToFirestore(uid) {
  const docRef = db.collection('vaults').doc(uid);

  state.firestoreUnsub = docRef.onSnapshot((snap) => {
    if (snap.exists) {
      const data = snap.data();
      state.accounts          = data.accounts || [];
      state.folders           = data.folders  || [];
      state.masterPasswordHash = data.masterPasswordHash || null;
    } else {
      // First time — create empty vault
      state.accounts          = [];
      state.folders           = [];
      state.masterPasswordHash = null;
      saveToFirestore();
    }
    setSyncStatus('synced');
    renderUI();
  }, (err) => {
    console.error('Firestore error:', err);
    setSyncStatus('error');
    showToast('Sync error: ' + err.message, 'error');
  });
}

/** Persist current state to Firestore (debounced internally) */
async function saveToFirestore() {
  if (!state.user) return;
  setSyncStatus('syncing');
  try {
    await db.collection('vaults').doc(state.user.uid).set({
      accounts: state.accounts,
      folders:  state.folders,
      masterPasswordHash: state.masterPasswordHash || null,
    });
    setSyncStatus('synced');
  } catch (e) {
    console.error('Save error:', e);
    setSyncStatus('error');
    showToast('Could not save: ' + e.message, 'error');
  }
}

/* ──────────────────────────────────────────────────────────
   SECURITY — SHA-256 HASHING
   ────────────────────────────────────────────────────────── */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyMasterPassword(input) {
  if (!state.masterPasswordHash) return true; // No master password set
  const hash = await sha256(input);
  return hash === state.masterPasswordHash;
}

/**
 * Show the master password prompt modal and resolve with true/false.
 */
function promptMasterPassword(title = 'Locked') {
  return new Promise((resolve) => {
    const modal  = document.getElementById('promptPasswordModal');
    const input  = document.getElementById('promptPasswordInput');
    const error  = document.getElementById('promptPasswordError');
    const okBtn  = document.getElementById('promptPasswordOkBtn');
    const cancel = document.getElementById('promptPasswordCancelBtn');
    const titleEl = document.getElementById('promptPasswordTitle');

    titleEl.textContent = title;
    input.value = '';
    error.textContent = '';
    showModal('promptPasswordModal');
    setTimeout(() => input.focus(), 300);

    const onOk = async () => {
      const ok = await verifyMasterPassword(input.value.trim());
      if (ok) {
        cleanup();
        hideModal('promptPasswordModal');
        resolve(true);
      } else {
        error.textContent = 'Incorrect password';
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 500);
      }
    };

    const onCancel = () => { cleanup(); hideModal('promptPasswordModal'); resolve(false); };
    const onKey    = (e) => { if (e.key === 'Enter') onOk(); };

    const cleanup = () => {
      okBtn.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    };

    okBtn.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}

/* ──────────────────────────────────────────────────────────
   RENDER UI
   ────────────────────────────────────────────────────────── */
function renderUI() {
  renderFolders();
  renderAccounts();
}

function renderFolders() {
  const bar = document.getElementById('foldersBar');
  bar.innerHTML = '';

  // All chip
  const all = createChip('All', 'all', state.currentFolder === 'all');
  bar.appendChild(all);

  // Dynamic folder chips
  state.folders.forEach(f => {
    const chip = createChip(f, f, state.currentFolder === f);
    // Long-press on folder chip to delete it
    addLongPress(chip, () => {
      confirmAction(`Delete folder "${f}"? Accounts inside will become unfoldered.`, async () => {
        state.folders = state.folders.filter(x => x !== f);
        // Remove folder from accounts in that folder
        state.accounts.forEach(a => { if (a.folder === f) a.folder = ''; });
        if (state.currentFolder === f) state.currentFolder = 'all';
        await saveToFirestore();
        renderUI();
        showToast(`Folder "${f}" deleted`, 'success');
      });
    });
    bar.appendChild(chip);
  });

  // Add folder chip
  const addChip = document.createElement('button');
  addChip.className = 'chip add-folder';
  addChip.textContent = '+ New Folder';
  addChip.addEventListener('click', openFolderModal);
  bar.appendChild(addChip);

  // Update folder <select> in account form
  updateFolderSelect();
}

function createChip(label, folderKey, active) {
  const chip = document.createElement('button');
  chip.className = 'chip' + (active ? ' active' : '');
  chip.textContent = label;
  chip.dataset.folder = folderKey;
  chip.addEventListener('click', () => {
    state.currentFolder = folderKey;
    renderUI();
  });
  return chip;
}

function updateFolderSelect() {
  const sel = document.getElementById('accountFolder');
  const current = sel.value;
  sel.innerHTML = '<option value="">No folder</option>';
  state.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  });
  sel.value = current;
}

function renderAccounts() {
  const grid  = document.getElementById('accountsGrid');
  const empty = document.getElementById('emptyState');

  // Filter
  let list = [...state.accounts];

  if (state.currentFolder !== 'all') {
    list = list.filter(a => a.folder === state.currentFolder);
  }

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.username && a.username.toLowerCase().includes(q))
    );
  }

  // Sort
  if (state.currentSort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt);
  else if (state.currentSort === 'oldest') list.sort((a, b) => a.createdAt - b.createdAt);
  else if (state.currentSort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));

  grid.innerHTML = '';

  if (list.length === 0) {
    empty.hidden = false;
  } else {
    empty.hidden = true;
    list.forEach(account => {
      grid.appendChild(createAccountCard(account));
    });
  }
}

function createAccountCard(account) {
  const card = document.createElement('div');
  card.className = 'account-card' + (state.selectedIds.has(account.id) ? ' selected' : '');
  card.dataset.id = account.id;

  // Favicon
  const faviconEl = buildFaviconEl(account.url, account.title);

  // Lock badge
  const lockBadge = account.locked
    ? `<div class="lock-badge" title="Locked">
         <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
       </div>`
    : '';

  card.innerHTML = `
    <div class="card-top">
      ${faviconEl.outerHTML}
      <div class="card-badges">
        ${lockBadge}
        <div class="select-check">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
    </div>
    <div class="card-title">${escapeHtml(account.title)}</div>
    <div class="card-username">${escapeHtml(account.username || '—')}</div>
  `;

  // Click handler
  card.addEventListener('click', (e) => {
    if (state.selectionMode) {
      toggleSelectCard(account.id);
      return;
    }
    openAccountDetail(account.id);
  });

  // Context menu (right-click desktop)
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, account.id);
  });

  // Long press (mobile)
  addLongPress(card, (e) => {
    if (!state.selectionMode) {
      enterSelectionMode();
      toggleSelectCard(account.id);
    } else {
      openContextMenu(e.clientX || 100, e.clientY || 200, account.id);
    }
  });

  return card;
}

/** Build a favicon element from a URL, fall back to initial letter */
function buildFaviconEl(url, title) {
  const el = document.createElement('div');
  el.className = 'card-favicon';

  if (url) {
    try {
      const hostname = new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
      const img = document.createElement('img');
      img.src = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
      img.alt = title;
      img.onerror = () => {
        img.remove();
        el.textContent = (title || '?')[0].toUpperCase();
      };
      el.appendChild(img);
    } catch (_) {
      el.textContent = (title || '?')[0].toUpperCase();
    }
  } else {
    el.textContent = (title || '?')[0].toUpperCase();
  }
  return el;
}

/* ──────────────────────────────────────────────────────────
   ACCOUNT CRUD
   ────────────────────────────────────────────────────────── */
function openAddAccount() {
  state.editingId = null;
  document.getElementById('accountModalTitle').textContent = 'New Account';
  document.getElementById('accountTitle').value    = '';
  document.getElementById('accountUsername').value = '';
  document.getElementById('accountPassword').value = '';
  document.getElementById('accountUrl').value      = '';
  document.getElementById('accountNotes').value    = '';
  document.getElementById('accountFolder').value   = '';
  document.getElementById('accountLocked').checked = false;
  document.getElementById('accountFormError').textContent = '';
  document.getElementById('passwordStrength').hidden = true;
  showModal('accountModal');
}

async function openEditAccount(id) {
  const account = state.accounts.find(a => a.id === id);
  if (!account) return;

  // If locked, require master password
  if (account.locked) {
    if (!state.masterPasswordHash) {
      showToast('Set a master password first to lock accounts.', 'info');
      return;
    }
    const ok = await promptMasterPassword('Edit Locked Account');
    if (!ok) return;
  }

  state.editingId = id;
  document.getElementById('accountModalTitle').textContent = 'Edit Account';
  document.getElementById('accountTitle').value    = account.title    || '';
  document.getElementById('accountUsername').value = account.username || '';
  document.getElementById('accountPassword').value = account.password || '';
  document.getElementById('accountUrl').value      = account.url      || '';
  document.getElementById('accountNotes').value    = account.notes    || '';
  document.getElementById('accountFolder').value   = account.folder   || '';
  document.getElementById('accountLocked').checked = account.locked   || false;
  document.getElementById('accountFormError').textContent = '';
  updatePasswordStrength(account.password || '');
  showModal('accountModal');
}

async function saveAccount() {
  const title    = document.getElementById('accountTitle').value.trim();
  const username = document.getElementById('accountUsername').value.trim();
  const password = document.getElementById('accountPassword').value;
  const url      = document.getElementById('accountUrl').value.trim();
  const notes    = document.getElementById('accountNotes').value.trim();
  const folder   = document.getElementById('accountFolder').value;
  const locked   = document.getElementById('accountLocked').checked;
  const errEl    = document.getElementById('accountFormError');

  if (!title) { errEl.textContent = 'Title is required'; return; }

  // If locking an account, ensure master password is set
  if (locked && !state.masterPasswordHash) {
    errEl.textContent = 'Set a master password first before locking accounts.';
    return;
  }

  errEl.textContent = '';

  if (state.editingId) {
    // Update existing
    const idx = state.accounts.findIndex(a => a.id === state.editingId);
    if (idx > -1) {
      state.accounts[idx] = {
        ...state.accounts[idx],
        title, username, password, url, notes, folder, locked,
        updatedAt: Date.now()
      };
    }
  } else {
    // New account
    state.accounts.unshift({
      id:        generateId(),
      title, username, password, url, notes, folder, locked,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  hideModal('accountModal');
  await saveToFirestore();
  showToast(state.editingId ? 'Account updated!' : 'Account added!', 'success');
  state.editingId = null;
  renderUI();
}

async function deleteAccount(id) {
  const account = state.accounts.find(a => a.id === id);
  if (!account) return;

  if (account.locked) {
    const ok = await promptMasterPassword('Delete Locked Account');
    if (!ok) return;
  }

  confirmAction(`Delete "${escapeHtml(account.title)}" permanently?`, async () => {
    state.accounts = state.accounts.filter(a => a.id !== id);
    await saveToFirestore();
    showToast('Account deleted', 'success');
    renderUI();
    hideModal('accountDetailModal');
  });
}

/* ──────────────────────────────────────────────────────────
   ACCOUNT DETAIL VIEW
   ────────────────────────────────────────────────────────── */
async function openAccountDetail(id) {
  const account = state.accounts.find(a => a.id === id);
  if (!account) return;

  // Locked accounts require master password to view
  if (account.locked) {
    if (!state.masterPasswordHash) return;
    const ok = await promptMasterPassword('View Locked Account');
    if (!ok) return;
  }

  state.detailId = id;
  populateDetailModal(account);
  showModal('accountDetailModal');
}

function populateDetailModal(account) {
  document.getElementById('detailTitle').textContent = account.title;

  // Favicon
  const faviconEl = buildFaviconEl(account.url, account.title);
  const detailFavicon = document.getElementById('detailFavicon');
  detailFavicon.innerHTML = '';
  detailFavicon.appendChild(faviconEl);

  // Folder badge
  const badge = document.getElementById('detailFolderBadge');
  badge.textContent = account.folder || '';
  badge.hidden = !account.folder;

  // Username
  const unWrap = document.getElementById('detailUsernameWrap');
  if (account.username) {
    document.getElementById('detailUsername').textContent = account.username;
    unWrap.hidden = false;
  } else {
    unWrap.hidden = true;
  }

  // Password (masked by default)
  document.getElementById('detailPassword').textContent = '••••••••••';
  document.getElementById('detailPassword').dataset.real = account.password || '';
  document.getElementById('detailPassword').classList.add('masked');

  // Eye icon reset
  const eyeOpen   = document.querySelector('#toggleDetailPassword .eye-open');
  const eyeClosed = document.querySelector('#toggleDetailPassword .eye-closed');
  eyeOpen.hidden   = false;
  eyeClosed.hidden = true;

  // URL
  const urlWrap = document.getElementById('detailUrlWrap');
  if (account.url) {
    const urlEl = document.getElementById('detailUrl');
    urlEl.href = account.url.startsWith('http') ? account.url : 'https://' + account.url;
    urlEl.textContent = account.url;
    urlWrap.hidden = false;
  } else {
    urlWrap.hidden = true;
  }

  // Notes
  const notesWrap = document.getElementById('detailNotesWrap');
  if (account.notes) {
    document.getElementById('detailNotes').textContent = account.notes;
    notesWrap.hidden = false;
  } else {
    notesWrap.hidden = true;
  }
}

/* ──────────────────────────────────────────────────────────
   CONTEXT MENU
   ────────────────────────────────────────────────────────── */
function openContextMenu(x, y, id) {
  state.contextId = id;
  const account = state.accounts.find(a => a.id === id);
  const menu = document.getElementById('contextMenu');

  // Update lock/unlock label
  const lockLabel = document.querySelector('#ctxToggleLock span');
  lockLabel.textContent = account.locked ? 'Unlock' : 'Lock';

  menu.hidden = false;

  // Position — ensure it stays in viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  menu.style.left = (x + 180 > vw ? x - 180 : x) + 'px';
  menu.style.top  = (y + 220 > vh ? y - 220 : y) + 'px';
}

function closeContextMenu() {
  const menu = document.getElementById('contextMenu');
  menu.hidden = true;
  state.contextId = null;
}

/* ──────────────────────────────────────────────────────────
   MULTI-SELECT
   ────────────────────────────────────────────────────────── */
function enterSelectionMode() {
  state.selectionMode = true;
  state.selectedIds.clear();
  document.getElementById('accountsGrid').classList.add('selection-mode');
  document.getElementById('selectionBar').hidden = false;
  document.getElementById('selectedCount').textContent = '0 selected';
}

function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedIds.clear();
  document.getElementById('accountsGrid').classList.remove('selection-mode');
  document.getElementById('selectionBar').hidden = true;
  renderAccounts();
}

function toggleSelectCard(id) {
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
  document.getElementById('selectedCount').textContent = `${state.selectedIds.size} selected`;
  // Update card visual
  const card = document.querySelector(`.account-card[data-id="${id}"]`);
  if (card) card.classList.toggle('selected', state.selectedIds.has(id));
}

async function deleteSelected() {
  if (state.selectedIds.size === 0) { showToast('No accounts selected', 'info'); return; }
  confirmAction(`Delete ${state.selectedIds.size} account(s) permanently?`, async () => {
    state.accounts = state.accounts.filter(a => !state.selectedIds.has(a.id));
    await saveToFirestore();
    showToast(`${state.selectedIds.size} accounts deleted`, 'success');
    exitSelectionMode();
  });
}

async function moveSelected(folder) {
  state.accounts.forEach(a => {
    if (state.selectedIds.has(a.id)) a.folder = folder;
  });
  await saveToFirestore();
  showToast(`Moved ${state.selectedIds.size} accounts to "${folder || 'No folder'}"`, 'success');
  exitSelectionMode();
}

/* ──────────────────────────────────────────────────────────
   FOLDER MODAL
   ────────────────────────────────────────────────────────── */
function openFolderModal() {
  document.getElementById('folderNameInput').value = '';
  document.getElementById('folderError').textContent = '';
  showModal('folderModal');
  setTimeout(() => document.getElementById('folderNameInput').focus(), 300);
}

async function saveFolder() {
  const name = document.getElementById('folderNameInput').value.trim();
  const err  = document.getElementById('folderError');
  if (!name) { err.textContent = 'Folder name required'; return; }
  if (state.folders.includes(name)) { err.textContent = 'Folder already exists'; return; }
  err.textContent = '';
  state.folders.push(name);
  await saveToFirestore();
  hideModal('folderModal');
  showToast(`Folder "${name}" created`, 'success');
  renderUI();
}

/* ──────────────────────────────────────────────────────────
   MASTER PASSWORD MANAGEMENT
   ────────────────────────────────────────────────────────── */
function openMasterPasswordModal() {
  const hasMaster = !!state.masterPasswordHash;
  document.getElementById('masterPasswordModalTitle').textContent = hasMaster ? 'Change Master Password' : 'Set Master Password';
  document.getElementById('masterPasswordModalSub').textContent   = hasMaster ? 'Enter current password and set a new one' : 'Protect your vault with a master password';
  document.getElementById('currentPasswordGroup').hidden = !hasMaster;
  document.getElementById('removeMasterPasswordBtn').hidden = !hasMaster;
  document.getElementById('currentMasterInput').value  = '';
  document.getElementById('newMasterInput').value      = '';
  document.getElementById('confirmMasterInput').value  = '';
  document.getElementById('masterPasswordError').textContent = '';
  document.getElementById('currentMasterError').textContent  = '';
  closeSideMenu();
  showModal('masterPasswordModal');
}

async function saveMasterPassword() {
  const hasMaster = !!state.masterPasswordHash;
  const current   = document.getElementById('currentMasterInput').value;
  const newPass   = document.getElementById('newMasterInput').value;
  const confirm   = document.getElementById('confirmMasterInput').value;
  const err       = document.getElementById('masterPasswordError');
  const curErr    = document.getElementById('currentMasterError');

  err.textContent    = '';
  curErr.textContent = '';

  if (hasMaster) {
    const ok = await verifyMasterPassword(current);
    if (!ok) { curErr.textContent = 'Incorrect current password'; return; }
  }

  if (newPass.length < 4) { err.textContent = 'Password must be at least 4 characters'; return; }
  if (newPass !== confirm)  { err.textContent = 'Passwords do not match'; return; }

  state.masterPasswordHash = await sha256(newPass);
  await saveToFirestore();
  hideModal('masterPasswordModal');
  showToast('Master password saved!', 'success');
}

async function removeMasterPassword() {
  const current = document.getElementById('currentMasterInput').value;
  const curErr  = document.getElementById('currentMasterError');

  const ok = await verifyMasterPassword(current);
  if (!ok) { curErr.textContent = 'Incorrect current password'; return; }

  confirmAction('Remove master password? All locked accounts will become unlocked.', async () => {
    state.masterPasswordHash = null;
    // Unlock all accounts
    state.accounts.forEach(a => { a.locked = false; });
    await saveToFirestore();
    hideModal('masterPasswordModal');
    showToast('Master password removed', 'success');
    renderUI();
  });
}

/* ──────────────────────────────────────────────────────────
   APP LOCK GATE
   ────────────────────────────────────────────────────────── */
function checkAppLock() {
  if (state.masterPasswordHash && !state.appUnlocked) {
    document.getElementById('masterPasswordGate').hidden = false;
    document.getElementById('gatePasswordInput').value  = '';
    document.getElementById('gatePasswordError').textContent = '';
    setTimeout(() => document.getElementById('gatePasswordInput').focus(), 300);
  }
}

async function unlockApp() {
  const input = document.getElementById('gatePasswordInput').value;
  const err   = document.getElementById('gatePasswordError');
  const ok    = await verifyMasterPassword(input);
  if (ok) {
    state.appUnlocked = true;
    document.getElementById('masterPasswordGate').hidden = true;
  } else {
    err.textContent = 'Incorrect password';
    document.getElementById('gatePasswordInput').classList.add('shake');
    setTimeout(() => document.getElementById('gatePasswordInput').classList.remove('shake'), 500);
  }
}

/* ──────────────────────────────────────────────────────────
   DATA EXPORT / IMPORT
   ────────────────────────────────────────────────────────── */
async function exportData() {
  // Require master password for export
  if (state.masterPasswordHash) {
    const ok = await promptMasterPassword('Confirm Export');
    if (!ok) return;
  }

  const payload = {
    exported:  new Date().toISOString(),
    version:   1,
    accounts:  state.accounts,
    folders:   state.folders,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `keyvault-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  closeSideMenu();
  showToast('Data exported!', 'success');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      if (!Array.isArray(data.accounts)) throw new Error('Invalid file format');

      confirmAction(`Import ${data.accounts.length} accounts? This will MERGE with existing data.`, async () => {
        // Merge — avoid duplicate IDs
        const existingIds = new Set(state.accounts.map(a => a.id));
        const newAccounts = data.accounts.filter(a => !existingIds.has(a.id));
        state.accounts = [...state.accounts, ...newAccounts];

        // Merge folders
        const folderSet = new Set(state.folders);
        (data.folders || []).forEach(f => folderSet.add(f));
        state.folders = Array.from(folderSet);

        await saveToFirestore();
        showToast(`Imported ${newAccounts.length} accounts`, 'success');
        renderUI();
      });
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  closeSideMenu();
}

async function deleteAllData() {
  if (state.masterPasswordHash) {
    const ok = await promptMasterPassword('Confirm Delete All');
    if (!ok) return;
  }

  confirmAction('⚠️ DELETE ALL DATA permanently? This cannot be undone!', async () => {
    state.accounts = [];
    state.folders  = [];
    await saveToFirestore();
    showToast('All data deleted', 'success');
    closeSideMenu();
    renderUI();
  }, 'Delete Everything');
}

/* ──────────────────────────────────────────────────────────
   CONFIRM DIALOG
   ────────────────────────────────────────────────────────── */
function confirmAction(message, onConfirm, confirmLabel = 'Delete') {
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOkBtn').textContent   = confirmLabel;
  showModal('confirmModal');

  const okBtn = document.getElementById('confirmOkBtn');
  const cancelBtn = document.getElementById('confirmCancelBtn');

  const cleanup = () => {
    okBtn.removeEventListener('click', onOk);
    cancelBtn.removeEventListener('click', onCancel);
  };

  const onOk = () => { cleanup(); hideModal('confirmModal'); onConfirm(); };
  const onCancel = () => { cleanup(); hideModal('confirmModal'); };

  // Remove previous listeners by cloning
  const newOk = okBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  okBtn.parentNode.replaceChild(newOk, okBtn);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

  newOk.textContent = confirmLabel;
  newOk.addEventListener('click', () => { hideModal('confirmModal'); onConfirm(); });
  newCancel.addEventListener('click', () => hideModal('confirmModal'));
}

/* ──────────────────────────────────────────────────────────
   MODAL HELPERS
   ────────────────────────────────────────────────────────── */
function showModal(id) {
  const el = document.getElementById(id);
  el.hidden = false;
  // Trap focus
  setTimeout(() => {
    const focusable = el.querySelectorAll('input, button, select, textarea, a');
    if (focusable.length) focusable[0].focus();
  }, 100);
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = true;
}

/* ──────────────────────────────────────────────────────────
   SIDE MENU
   ────────────────────────────────────────────────────────── */
function openSideMenu() {
  document.getElementById('sideMenu').classList.add('open');
  document.getElementById('sideMenuOverlay').classList.add('active');
}

function closeSideMenu() {
  document.getElementById('sideMenu').classList.remove('open');
  document.getElementById('sideMenuOverlay').classList.remove('active');
}

/* ──────────────────────────────────────────────────────────
   THEME
   ────────────────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('kv-theme') || 'dark';
  document.documentElement.dataset.theme = saved;
}

function toggleTheme() {
  const html  = document.documentElement;
  const theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = theme;
  localStorage.setItem('kv-theme', theme);
}

/* ──────────────────────────────────────────────────────────
   SYNC STATUS
   ────────────────────────────────────────────────────────── */
function setSyncStatus(status) {
  // status: synced | syncing | error | offline
  const dot = document.getElementById('syncDot');
  dot.className = 'sync-dot ' + status;
  const indicator = document.getElementById('syncIndicator');
  const labels = { synced: 'Synced', syncing: 'Syncing…', error: 'Sync error', offline: 'Offline' };
  indicator.title = labels[status] || '';
}

/* ──────────────────────────────────────────────────────────
   TOAST NOTIFICATIONS
   ────────────────────────────────────────────────────────── */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✓', error: '✕', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ──────────────────────────────────────────────────────────
   PASSWORD UTILITIES
   ────────────────────────────────────────────────────────── */
function generatePassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  const arr   = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, v => chars[v % chars.length]).join('');
}

function updatePasswordStrength(password) {
  const wrap   = document.getElementById('passwordStrength');
  const fill   = document.getElementById('strengthFill');
  const label  = document.getElementById('strengthLabel');

  if (!password) { wrap.hidden = true; return; }
  wrap.hidden = false;

  let score = 0;
  if (password.length >= 8)  score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { pct: '20%', color: '#ef4444', text: 'Very Weak' },
    { pct: '40%', color: '#f97316', text: 'Weak' },
    { pct: '60%', color: '#eab308', text: 'Fair' },
    { pct: '80%', color: '#84cc16', text: 'Strong' },
    { pct: '100%', color: '#22c55e', text: 'Very Strong' },
  ];
  const lvl = levels[Math.min(score, 4)];
  fill.style.width      = lvl.pct;
  fill.style.background = lvl.color;
  label.textContent     = lvl.text;
  label.style.color     = lvl.color;
}

/* ──────────────────────────────────────────────────────────
   LONG PRESS
   ────────────────────────────────────────────────────────── */
function addLongPress(el, callback, ms = 600) {
  let timer = null;
  let moved = false;

  const start = (e) => {
    moved = false;
    timer = setTimeout(() => {
      if (!moved) {
        callback(e);
      }
    }, ms);
  };

  const clear = () => { clearTimeout(timer); timer = null; };
  const move  = () => { moved = true; clear(); };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend',   clear);
  el.addEventListener('touchmove',  move, { passive: true });
  el.addEventListener('mousedown',  start);
  el.addEventListener('mouseup',    clear);
  el.addEventListener('mousemove',  move);
}

/* ──────────────────────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────────────────────── */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

/* ──────────────────────────────────────────────────────────
   PWA — SERVICE WORKER REGISTRATION
   ────────────────────────────────────────────────────────── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered', reg.scope))
      .catch(err => console.warn('[SW] Registration failed', err));
  }
}

/* ──────────────────────────────────────────────────────────
   EVENT LISTENERS — WIRE UP ALL INTERACTIVE ELEMENTS
   ────────────────────────────────────────────────────────── */
function bindEvents() {

  /* ── Header ── */
  document.getElementById('hamburgerBtn').addEventListener('click', openSideMenu);
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  /* ── Side Menu ── */
  document.getElementById('sideMenuOverlay').addEventListener('click', closeSideMenu);

  document.getElementById('googleSignInBtn').addEventListener('click', async () => {
    if (state.user) {
      // Sign out
      await auth.signOut();
      closeSideMenu();
      showToast('Signed out', 'info');
    } else {
      try {
        await auth.signInWithPopup(googleProvider);
        closeSideMenu();
        showToast('Signed in!', 'success');
      } catch (e) {
        showToast('Sign-in failed: ' + e.message, 'error');
      }
    }
  });

  document.getElementById('masterPasswordMenuBtn').addEventListener('click', openMasterPasswordModal);

  document.getElementById('exportDataBtn').addEventListener('click', exportData);

  document.getElementById('importDataBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
    closeSideMenu();
  });

  document.getElementById('importFileInput').addEventListener('change', (e) => {
    importData(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('deleteAllDataBtn').addEventListener('click', () => {
    closeSideMenu();
    deleteAllData();
  });

  /* ── Master Password Gate ── */
  document.getElementById('gateUnlockBtn').addEventListener('click', unlockApp);
  document.getElementById('gatePasswordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') unlockApp();
  });

  /* ── Master Password Modal ── */
  document.getElementById('closeMasterPasswordModal').addEventListener('click', () => hideModal('masterPasswordModal'));
  document.getElementById('saveMasterPasswordBtn').addEventListener('click', saveMasterPassword);
  document.getElementById('removeMasterPasswordBtn').addEventListener('click', removeMasterPassword);

  /* ── FAB ── */
  document.getElementById('fabBtn').addEventListener('click', openAddAccount);

  /* ── Account Modal ── */
  document.getElementById('closeAccountModal').addEventListener('click', () => hideModal('accountModal'));
  document.getElementById('saveAccountBtn').addEventListener('click', saveAccount);

  document.getElementById('togglePasswordVisibility').addEventListener('click', () => {
    const input  = document.getElementById('accountPassword');
    const eyeOpen   = document.querySelector('#togglePasswordVisibility .eye-open');
    const eyeClosed = document.querySelector('#togglePasswordVisibility .eye-closed');
    const show = input.type === 'password';
    input.type       = show ? 'text' : 'password';
    eyeOpen.hidden   = show;
    eyeClosed.hidden = !show;
  });

  document.getElementById('generatePasswordBtn').addEventListener('click', () => {
    const pw = generatePassword();
    document.getElementById('accountPassword').value = pw;
    document.getElementById('accountPassword').type  = 'text';
    updatePasswordStrength(pw);
    document.querySelector('#togglePasswordVisibility .eye-open').hidden   = true;
    document.querySelector('#togglePasswordVisibility .eye-closed').hidden = false;
    showToast('Strong password generated!', 'success');
  });

  document.getElementById('accountPassword').addEventListener('input', (e) => {
    updatePasswordStrength(e.target.value);
  });

  /* ── Account Detail Modal ── */
  document.getElementById('closeAccountDetailModal').addEventListener('click', () => hideModal('accountDetailModal'));

  document.getElementById('toggleDetailPassword').addEventListener('click', () => {
    const span      = document.getElementById('detailPassword');
    const eyeOpen   = document.querySelector('#toggleDetailPassword .eye-open');
    const eyeClosed = document.querySelector('#toggleDetailPassword .eye-closed');
    const showing   = !span.classList.contains('masked');
    if (showing) {
      span.textContent = '••••••••••';
      span.classList.add('masked');
      eyeOpen.hidden   = false;
      eyeClosed.hidden = true;
    } else {
      span.textContent = span.dataset.real;
      span.classList.remove('masked');
      eyeOpen.hidden   = true;
      eyeClosed.hidden = false;
    }
  });

  document.getElementById('copyDetailPassword').addEventListener('click', async () => {
    const span = document.getElementById('detailPassword');
    const pw   = span.dataset.real;
    if (!pw) { showToast('No password to copy', 'info'); return; }
    const ok = await copyToClipboard(pw);
    if (ok) {
      const btn = document.getElementById('copyDetailPassword');
      btn.classList.add('copied');
      showToast('Password copied!', 'success');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    }
  });

  // Copy username via delegation
  document.getElementById('accountDetailModal').addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-btn[data-target]');
    if (!copyBtn) return;
    const targetId = copyBtn.dataset.target;
    const text = document.getElementById(targetId)?.textContent;
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) {
      copyBtn.classList.add('copied');
      showToast('Copied!', 'success');
      setTimeout(() => copyBtn.classList.remove('copied'), 1500);
    }
  });

  document.getElementById('editFromDetailBtn').addEventListener('click', () => {
    hideModal('accountDetailModal');
    openEditAccount(state.detailId);
  });

  document.getElementById('deleteFromDetailBtn').addEventListener('click', () => {
    hideModal('accountDetailModal');
    deleteAccount(state.detailId);
  });

  /* ── Folder Modal ── */
  document.getElementById('closeFolderModal').addEventListener('click', () => hideModal('folderModal'));
  document.getElementById('saveFolderBtn').addEventListener('click', saveFolder);
  document.getElementById('folderNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveFolder();
  });

  /* ── Move Folder Modal ── */
  document.getElementById('closeMoveFolderModal').addEventListener('click', () => hideModal('moveFolderModal'));

  /* ── Search ── */
  document.getElementById('searchInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    document.getElementById('searchClear').hidden = !state.searchQuery;
    renderAccounts();
  });

  document.getElementById('searchClear').addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    state.searchQuery = '';
    document.getElementById('searchClear').hidden = true;
    renderAccounts();
  });

  /* ── Sort ── */
  document.getElementById('sortBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('sortDropdown');
    dd.hidden = !dd.hidden;
  });

  document.querySelectorAll('.sort-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentSort = btn.dataset.sort;
      document.getElementById('sortDropdown').hidden = true;
      renderAccounts();
    });
  });

  /* ── Selection Mode ── */
  document.getElementById('selectModeBtn').addEventListener('click', () => {
    if (state.selectionMode) { exitSelectionMode(); return; }
    enterSelectionMode();
  });

  document.getElementById('cancelSelectBtn').addEventListener('click', exitSelectionMode);

  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelected);

  document.getElementById('moveSelectedBtn').addEventListener('click', () => {
    if (state.selectedIds.size === 0) { showToast('No accounts selected', 'info'); return; }
    openMoveFolderModal();
  });

  /* ── Context Menu ── */
  document.getElementById('ctxCopyUser').addEventListener('click', async () => {
    const a = state.accounts.find(x => x.id === state.contextId);
    if (!a?.username) { showToast('No username to copy', 'info'); closeContextMenu(); return; }
    await copyToClipboard(a.username);
    showToast('Username copied!', 'success');
    closeContextMenu();
  });

  document.getElementById('ctxCopyPass').addEventListener('click', async () => {
    const a = state.accounts.find(x => x.id === state.contextId);
    if (!a?.password) { showToast('No password to copy', 'info'); closeContextMenu(); return; }
    // If locked, require master password
    if (a.locked) {
      closeContextMenu();
      const ok = await promptMasterPassword('Copy Password');
      if (!ok) return;
    }
    await copyToClipboard(a.password);
    showToast('Password copied!', 'success');
    closeContextMenu();
  });

  document.getElementById('ctxEdit').addEventListener('click', () => {
    const id = state.contextId;
    closeContextMenu();
    openEditAccount(id);
  });

  document.getElementById('ctxToggleLock').addEventListener('click', async () => {
    const id = state.contextId;
    closeContextMenu();
    const account = state.accounts.find(a => a.id === id);
    if (!account) return;

    if (!state.masterPasswordHash) {
      showToast('Set a master password first.', 'info');
      return;
    }

    if (account.locked) {
      // Unlocking requires master password
      const ok = await promptMasterPassword('Unlock Account');
      if (!ok) return;
      account.locked = false;
      showToast('Account unlocked', 'success');
    } else {
      account.locked = true;
      showToast('Account locked', 'success');
    }

    await saveToFirestore();
    renderAccounts();
  });

  document.getElementById('ctxDelete').addEventListener('click', () => {
    const id = state.contextId;
    closeContextMenu();
    deleteAccount(id);
  });

  /* ── Close context menu on outside click ── */
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('contextMenu');
    if (!menu.hidden && !menu.contains(e.target)) {
      closeContextMenu();
    }
    // Close sort dropdown
    const dd = document.getElementById('sortDropdown');
    if (!dd.hidden && !dd.contains(e.target) && !document.getElementById('sortBtn').contains(e.target)) {
      dd.hidden = true;
    }
  });

  /* ── Close modals on overlay click ── */
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      // Only close if clicking the overlay itself (not its content)
      if (e.target === overlay) {
        const id = overlay.id;
        // Don't close the master password gate by clicking outside
        if (id !== 'masterPasswordGate' && id !== 'promptPasswordModal') {
          hideModal(id);
        }
      }
    });
  });

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeContextMenu();
      document.getElementById('sortDropdown').hidden = true;
      // Close topmost modal
      const modals = ['accountModal', 'accountDetailModal', 'masterPasswordModal', 'folderModal', 'moveFolderModal', 'confirmModal', 'promptPasswordModal'];
      for (const id of modals.reverse()) {
        const el = document.getElementById(id);
        if (!el.hidden) { hideModal(id); break; }
      }
    }
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }
  });
}

/* ──────────────────────────────────────────────────────────
   MOVE FOLDER MODAL
   ────────────────────────────────────────────────────────── */
function openMoveFolderModal() {
  const list = document.getElementById('moveFolderList');
  list.innerHTML = '';

  // "No folder" option
  const noFolder = document.createElement('button');
  noFolder.className = 'move-folder-option';
  noFolder.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> No Folder`;
  noFolder.addEventListener('click', async () => {
    await moveSelected('');
    hideModal('moveFolderModal');
  });
  list.appendChild(noFolder);

  state.folders.forEach(f => {
    const btn = document.createElement('button');
    btn.className = 'move-folder-option';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> ${escapeHtml(f)}`;
    btn.addEventListener('click', async () => {
      await moveSelected(f);
      hideModal('moveFolderModal');
    });
    list.appendChild(btn);
  });

  showModal('moveFolderModal');
}

/* ──────────────────────────────────────────────────────────
   APP INIT
   ────────────────────────────────────────────────────────── */
function init() {
  initTheme();
  registerServiceWorker();
  bindEvents();
  initFirebase();

  // Show gate once master password status is known (handled in Firestore callback)
  // For initial offline load, just render empty
  renderUI();

  // Show app lock gate after a short delay (waits for Firestore to load)
  setTimeout(() => {
    if (state.masterPasswordHash && !state.appUnlocked) {
      checkAppLock();
    }
  }, 1000);
}

// Kick off when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
