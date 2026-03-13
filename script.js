/**
 * ═══════════════════════════════════════════════════════════
 *  خزنة أسراري — Main Application Script
 *  Firebase + CryptoJS AES Encrypted Password Manager
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

// ─── Wait for Firebase to load ───────────────────────────
if (window.Firebase) {
  initApp();
} else {
  window.addEventListener('firebase-ready', initApp);
}

function initApp() {
  /* ════════════════════════════════════════════════════════
     1. FIREBASE CONFIGURATION & INIT
  ════════════════════════════════════════════════════════ */
  const firebaseConfig = {
    apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
    authDomain: "malaboushi.firebaseapp.com",
    projectId: "malaboushi",
    storageBucket: "malaboushi.firebasestorage.app",
    messagingSenderId: "110336819350",
    appId: "1:110336819350:web:2b1b0488e72b811f0602b7",
    measurementId: "G-94ZT4TQYZY"
  };

  const {
    initializeApp, getAuth, GoogleAuthProvider, signInWithPopup, signOut,
    onAuthStateChanged, getFirestore, collection, doc, setDoc,
    onSnapshot, deleteDoc, writeBatch, updateDoc, getDoc
  } = window.Firebase;

  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);

  /* ════════════════════════════════════════════════════════
     2. APP STATE
  ════════════════════════════════════════════════════════ */
  let currentUser = null;
  let encKey = '';
  let allItems = [];           // raw decrypted items
  let folders = [];            // array of {id, name}
  let currentFolder = 'all';   // 'all' or folder id
  let searchQuery = '';
  let selectionMode = false;
  let selectedIds = new Set();
  let firestoreUnsub = null;
  let actionTargetId = null;   // item id for action sheet
  let longPressTimer = null;
  let pinBuffer = '';
  let renameFolderTarget = null;
  let moveTargetIds = [];

  /* ════════════════════════════════════════════════════════
     3. DOM REFS
  ════════════════════════════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const splash = $('splash-screen');
  const lockScreen = $('lock-screen');
  const loginScreen = $('login-screen');
  const appEl = $('app');
  const vaultList = $('vault-list');
  const emptyState = $('empty-state');
  const folderTabsEl = $('folder-tabs');
  const searchBarWrap = $('search-bar-wrap');
  const searchInput = $('search-input');
  const searchClear = $('search-clear');
  const selectionBar = $('selection-bar');
  const selectionCount = $('selection-count');
  const syncIndicator = $('sync-indicator');
  const toastContainer = $('toast-container');
  const userAvatar = $('user-avatar');
  const drawerAvatar = $('drawer-avatar');
  const drawerName = $('drawer-name');
  const drawerEmail = $('drawer-email');

  /* ════════════════════════════════════════════════════════
     4. CRYPTO HELPERS
  ════════════════════════════════════════════════════════ */
  function encrypt(text) {
    if (!encKey || !text) return text;
    return CryptoJS.AES.encrypt(text, encKey).toString();
  }

  function decrypt(cipherText) {
    if (!encKey || !cipherText) return cipherText;
    try {
      const bytes = CryptoJS.AES.decrypt(cipherText, encKey);
      const dec = bytes.toString(CryptoJS.enc.Utf8);
      return dec || cipherText; // fallback if decryption fails
    } catch { return cipherText; }
  }

  function getEncKey() {
    return localStorage.getItem('vault_enc_key') || 'default-khazna-key-2024';
  }
  function saveEncKey(k) { localStorage.setItem('vault_enc_key', k); }

  /* ════════════════════════════════════════════════════════
     5. TOAST NOTIFICATIONS
  ════════════════════════════════════════════════════════ */
  function toast(msg, type = 'info', duration = 3000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove());
    }, duration);
  }

  /* ════════════════════════════════════════════════════════
     6. THEME MANAGEMENT
  ════════════════════════════════════════════════════════ */
  function applyTheme(theme) {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    $('sun-icon') && $('sun-icon').classList.toggle('hidden', theme === 'dark');
    // Update moon/sun icon
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    if (sunIcon) sunIcon.classList.toggle('hidden', theme === 'dark');
    if (moonIcon) moonIcon.classList.toggle('hidden', theme === 'light');
  }

  const savedTheme = localStorage.getItem('vault_theme') || 'light';
  applyTheme(savedTheme);

  $('theme-btn').addEventListener('click', () => {
    const cur = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('vault_theme', next);
    applyTheme(next);
  });

  /* ════════════════════════════════════════════════════════
     7. PIN LOCK SYSTEM
  ════════════════════════════════════════════════════════ */
  function getPIN() { return localStorage.getItem('vault_pin'); }
  function setPIN(p) { localStorage.setItem('vault_pin', p); }

  function showLockScreen() {
    if (!getPIN()) return false; // no PIN set, skip
    lockScreen.classList.remove('hidden');
    pinBuffer = '';
    updatePinDots();
    return true;
  }

  function hideLockScreen() { lockScreen.classList.add('hidden'); }

  function updatePinDots() {
    for (let i = 1; i <= 4; i++) {
      const dot = $(`d${i}`);
      dot.classList.toggle('filled', i <= pinBuffer.length);
      dot.classList.remove('error');
    }
  }

  function pinError() {
    for (let i = 1; i <= 4; i++) {
      $(`d${i}`).classList.add('error');
    }
    pinBuffer = '';
    $('lock-msg').textContent = 'رمز PIN غير صحيح، حاول مجدداً';
    setTimeout(() => {
      updatePinDots();
      $('lock-msg').textContent = 'أدخل رمز PIN للمتابعة';
    }, 1000);
  }

  document.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key === 'clear') { pinBuffer = ''; }
      else if (key === 'del') { pinBuffer = pinBuffer.slice(0, -1); }
      else if (pinBuffer.length < 4) { pinBuffer += key; }
      updatePinDots();
      if (pinBuffer.length === 4) {
        if (pinBuffer === getPIN()) {
          hideLockScreen();
          pinBuffer = '';
        } else { pinError(); }
      }
    });
  });

  /* ════════════════════════════════════════════════════════
     8. SPLASH & AUTH FLOW
  ════════════════════════════════════════════════════════ */
  // Hide splash after delay
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.classList.add('hidden'), 500);
  }, 1800);

  // Google Login
  $('google-login-btn').addEventListener('click', async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      toast('فشل تسجيل الدخول: ' + err.message, 'error');
    }
  });

  // Auth State
  onAuthStateChanged(auth, async user => {
    if (user) {
      currentUser = user;
      encKey = getEncKey();
      loginScreen.classList.add('hidden');
      // Show lock screen if PIN is set
      const pinShowing = showLockScreen();
      if (!pinShowing) appEl.classList.remove('hidden');
      // Update avatar & drawer
      if (user.photoURL) {
        userAvatar.src = user.photoURL;
        drawerAvatar.src = user.photoURL;
      }
      drawerName.textContent = user.displayName || 'مستخدم';
      drawerEmail.textContent = user.email || '';
      // Load data from Firestore
      loadFolders();
      subscribeToVault();
    } else {
      currentUser = null;
      appEl.classList.add('hidden');
      loginScreen.classList.remove('hidden');
      lockScreen.classList.add('hidden');
      if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
      allItems = [];
      renderItems();
    }
  });

  // Reveal app after PIN unlock
  const origHideLock = hideLockScreen;
  hideLockScreen = function() {
    lockScreen.classList.add('hidden');
    appEl.classList.remove('hidden');
  };

  /* ════════════════════════════════════════════════════════
     9. FIRESTORE DATA LAYER
  ════════════════════════════════════════════════════════ */

  // --- Folders ---
  function folderDocRef() {
    return doc(db, 'users', currentUser.uid, 'meta', 'folders');
  }

  async function loadFolders() {
    try {
      const snap = await getDoc ? null : null; // dynamic import already done
      // Use onSnapshot for real-time
      onSnapshot(folderDocRef(), snap => {
        if (snap.exists()) {
          folders = snap.data().list || [];
        } else {
          folders = [
            { id: 'general', name: 'عام' },
            { id: 'social', name: 'تواصل اجتماعي' },
            { id: 'work', name: 'عمل' },
            { id: 'banking', name: 'بنوك' }
          ];
          saveFolders();
        }
        renderFolderTabs();
        renderFolderSelects();
      });
    } catch (err) {
      console.error('Error loading folders:', err);
    }
  }

  async function saveFolders() {
    if (!currentUser) return;
    try {
      await setDoc(folderDocRef(), { list: folders });
    } catch (err) { console.error('Save folders error:', err); }
  }

  // --- Vault Items ---
  function vaultCollRef() {
    return collection(db, 'users', currentUser.uid, 'vault');
  }

  function subscribeToVault() {
    if (firestoreUnsub) firestoreUnsub();
    showSync(true);
    firestoreUnsub = onSnapshot(vaultCollRef(), snap => {
      allItems = snap.docs.map(d => {
        const raw = d.data();
        return {
          id: d.id,
          title: decrypt(raw.title || ''),
          email: decrypt(raw.email || ''),
          password: decrypt(raw.password || ''),
          notes: decrypt(raw.notes || ''),
          folder: raw.folder || 'general',
          order: raw.order || 0,
          createdAt: raw.createdAt || Date.now()
        };
      });
      allItems.sort((a, b) => a.order - b.order);
      renderItems();
      showSync(false);
    }, err => {
      console.error('Firestore error:', err);
      showSync(false);
      toast('خطأ في تحميل البيانات', 'error');
    });
  }

  async function saveItem(item) {
    if (!currentUser) return;
    showSync(true);
    try {
      const docRef = doc(db, 'users', currentUser.uid, 'vault', item.id);
      await setDoc(docRef, {
        title: encrypt(item.title),
        email: encrypt(item.email),
        password: encrypt(item.password),
        notes: encrypt(item.notes),
        folder: item.folder,
        order: item.order,
        createdAt: item.createdAt || Date.now()
      });
    } catch (err) {
      toast('خطأ في الحفظ: ' + err.message, 'error');
    }
    showSync(false);
  }

  async function deleteItem(id) {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'vault', id));
      toast('تم الحذف بنجاح', 'success');
    } catch (err) {
      toast('خطأ في الحذف', 'error');
    }
  }

  async function deleteItems(ids) {
    if (!currentUser || !ids.length) return;
    showSync(true);
    try {
      const batch = writeBatch(db);
      ids.forEach(id => batch.delete(doc(db, 'users', currentUser.uid, 'vault', id)));
      await batch.commit();
      toast(`تم حذف ${ids.length} عناصر`, 'success');
    } catch (err) { toast('خطأ في الحذف الجماعي', 'error'); }
    showSync(false);
  }

  function showSync(show) {
    syncIndicator.classList.toggle('hidden', !show);
  }

  /* ════════════════════════════════════════════════════════
     10. FOLDERS UI
  ════════════════════════════════════════════════════════ */
  function renderFolderTabs() {
    folderTabsEl.innerHTML = '';
    // All tab
    const allTab = document.createElement('button');
    allTab.className = 'folder-tab' + (currentFolder === 'all' ? ' active' : '');
    allTab.textContent = 'الكل';
    allTab.addEventListener('click', () => { currentFolder = 'all'; renderFolderTabs(); renderItems(); });
    folderTabsEl.appendChild(allTab);

    folders.forEach(f => {
      const tab = document.createElement('button');
      tab.className = 'folder-tab' + (currentFolder === f.id ? ' active' : '');
      tab.textContent = f.name;
      tab.dataset.folderId = f.id;
      // Long press to rename
      tab.addEventListener('mousedown', () => longPressStart(f));
      tab.addEventListener('touchstart', () => longPressStart(f), { passive: true });
      tab.addEventListener('mouseup', longPressEnd);
      tab.addEventListener('touchend', longPressEnd);
      tab.addEventListener('click', () => { currentFolder = f.id; renderFolderTabs(); renderItems(); });
      folderTabsEl.appendChild(tab);
    });
  }

  function longPressStart(folder) {
    longPressTimer = setTimeout(() => {
      renameFolderTarget = folder;
      $('rename-folder-input').value = folder.name;
      $('rename-folder-modal-overlay').classList.remove('hidden');
    }, 700);
  }
  function longPressEnd() { clearTimeout(longPressTimer); }

  function renderFolderSelects() {
    // For Add/Edit modal
    const sel = $('f-folder');
    if (!sel) return;
    sel.innerHTML = folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  }

  $('add-folder-btn').addEventListener('click', () => {
    const name = prompt('اسم المجلد الجديد:');
    if (name && name.trim()) {
      const id = 'f_' + Date.now();
      folders.push({ id, name: name.trim() });
      saveFolders();
    }
  });

  // Rename Folder
  $('rename-folder-save').addEventListener('click', () => {
    const newName = $('rename-folder-input').value.trim();
    if (!newName || !renameFolderTarget) return;
    const idx = folders.findIndex(f => f.id === renameFolderTarget.id);
    if (idx >= 0) { folders[idx].name = newName; saveFolders(); }
    $('rename-folder-modal-overlay').classList.add('hidden');
    renameFolderTarget = null;
  });
  ['rename-folder-close','rename-folder-cancel'].forEach(id => {
    $(id).addEventListener('click', () => {
      $('rename-folder-modal-overlay').classList.add('hidden');
      renameFolderTarget = null;
    });
  });

  /* ════════════════════════════════════════════════════════
     11. VAULT RENDER
  ════════════════════════════════════════════════════════ */
  const AV_COLORS = ['av-purple','av-blue','av-green','av-red','av-orange','av-pink','av-teal','av-yellow'];
  function avatarColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
    return AV_COLORS[Math.abs(h) % AV_COLORS.length];
  }

  function getFilteredItems() {
    let items = allItems;
    if (currentFolder !== 'all') items = items.filter(i => i.folder === currentFolder);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.title.toLowerCase().includes(q) || i.email.toLowerCase().includes(q));
    }
    return items;
  }

  function renderItems() {
    const items = getFilteredItems();
    vaultList.innerHTML = '';
    emptyState.classList.toggle('hidden', items.length > 0);

    items.forEach((item, idx) => {
      const el = createItemEl(item, idx);
      vaultList.appendChild(el);
    });
  }

  function createItemEl(item, idx) {
    const el = document.createElement('div');
    el.className = 'vault-item';
    el.dataset.id = item.id;
    if (selectedIds.has(item.id)) el.classList.add('selected');
    el.style.animationDelay = `${idx * 40}ms`;
    el.draggable = true;

    const initials = item.title ? item.title.charAt(0).toUpperCase() : '?';
    const color = avatarColor(item.title || '');

    el.innerHTML = `
      <div class="item-checkbox"></div>
      <div class="item-avatar ${color}">${initials}</div>
      <div class="item-info">
        <div class="item-title">${escHtml(item.title)}</div>
        ${item.email ? `<div class="item-email">${escHtml(item.email)}</div>` : ''}
        <div class="item-password-row">
          <span class="item-password" data-id="${item.id}">••••••••</span>
          <button class="item-toggle-pass" data-id="${item.id}" title="عرض كلمة المرور">
            <svg class="eye-show" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <button class="item-more-btn" data-id="${item.id}" title="خيارات">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>`;

    // Toggle password visibility
    el.querySelector('.item-toggle-pass').addEventListener('click', e => {
      e.stopPropagation();
      const passEl = el.querySelector('.item-password');
      const showing = passEl.dataset.showing === 'true';
      passEl.textContent = showing ? '••••••••' : item.password;
      passEl.dataset.showing = showing ? 'false' : 'true';
    });

    // More button
    el.querySelector('.item-more-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (selectionMode) { toggleSelection(item.id, el); return; }
      openActionSheet(item);
    });

    // Click (select in selection mode or toggle password)
    el.addEventListener('click', () => {
      if (selectionMode) { toggleSelection(item.id, el); return; }
    });

    // Long press to enter selection mode
    let lp;
    el.addEventListener('mousedown', () => { lp = setTimeout(() => enterSelectionMode(item.id, el), 600); });
    el.addEventListener('touchstart', () => { lp = setTimeout(() => enterSelectionMode(item.id, el), 600); }, { passive: true });
    el.addEventListener('mouseup', () => clearTimeout(lp));
    el.addEventListener('touchend', () => clearTimeout(lp));

    // Drag & Drop
    el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', item.id); el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drag-over');
      const draggedId = e.dataTransfer.getData('text/plain');
      reorderItems(draggedId, item.id);
    });

    return el;
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  async function reorderItems(fromId, toId) {
    const filtered = getFilteredItems();
    const fromIdx = filtered.findIndex(i => i.id === fromId);
    const toIdx = filtered.findIndex(i => i.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    // Swap in allItems
    const fromItem = allItems.find(i => i.id === fromId);
    const toItem = allItems.find(i => i.id === toId);
    if (!fromItem || !toItem) return;
    const tempOrder = fromItem.order;
    fromItem.order = toItem.order;
    toItem.order = tempOrder;
    // Re-render optimistically
    allItems.sort((a, b) => a.order - b.order);
    renderItems();
    // Persist
    showSync(true);
    try {
      const batch = writeBatch(db);
      [fromItem, toItem].forEach(item => {
        batch.update(doc(db, 'users', currentUser.uid, 'vault', item.id), { order: item.order });
      });
      await batch.commit();
    } catch { toast('خطأ في إعادة الترتيب', 'error'); }
    showSync(false);
  }

  /* ════════════════════════════════════════════════════════
     12. SELECTION MODE
  ════════════════════════════════════════════════════════ */
  function enterSelectionMode(id, el) {
    selectionMode = true;
    vaultList.classList.add('selection-mode');
    selectedIds.clear();
    selectedIds.add(id);
    el.classList.add('selected');
    updateSelectionBar();
    selectionBar.classList.remove('hidden');
  }

  function exitSelectionMode() {
    selectionMode = false;
    selectedIds.clear();
    vaultList.classList.remove('selection-mode');
    selectionBar.classList.add('hidden');
    renderItems();
  }

  function toggleSelection(id, el) {
    if (selectedIds.has(id)) { selectedIds.delete(id); el.classList.remove('selected'); }
    else { selectedIds.add(id); el.classList.add('selected'); }
    updateSelectionBar();
    if (selectedIds.size === 0) exitSelectionMode();
  }

  function updateSelectionBar() {
    selectionCount.textContent = `${selectedIds.size} محدد`;
  }

  $('sel-cancel-btn').addEventListener('click', exitSelectionMode);

  $('sel-delete-btn').addEventListener('click', () => {
    if (!selectedIds.size) return;
    if (confirm(`حذف ${selectedIds.size} عنصر؟`)) {
      deleteItems([...selectedIds]);
      exitSelectionMode();
    }
  });

  $('sel-move-btn').addEventListener('click', () => {
    if (!selectedIds.size) return;
    moveTargetIds = [...selectedIds];
    openMoveModal();
  });

  /* ════════════════════════════════════════════════════════
     13. SEARCH
  ════════════════════════════════════════════════════════ */
  $('search-toggle-btn').addEventListener('click', () => {
    searchBarWrap.classList.toggle('hidden');
    if (!searchBarWrap.classList.contains('hidden')) searchInput.focus();
  });

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    searchClear.classList.toggle('hidden', !searchQuery);
    renderItems();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = ''; searchQuery = '';
    searchClear.classList.add('hidden');
    renderItems();
    searchInput.focus();
  });

  /* ════════════════════════════════════════════════════════
     14. ADD / EDIT ACCOUNT MODAL
  ════════════════════════════════════════════════════════ */
  let editingItemId = null;

  $('fab-btn').addEventListener('click', () => openAccountModal());

  function openAccountModal(item = null) {
    editingItemId = item ? item.id : null;
    $('modal-title').textContent = item ? 'تعديل الحساب' : 'إضافة حساب جديد';
    $('f-title').value = item ? item.title : '';
    $('f-email').value = item ? item.email : '';
    $('f-password').value = item ? item.password : '';
    $('f-notes').value = item ? item.notes : '';
    renderFolderSelects();
    if (item) $('f-folder').value = item.folder;
    $('strength-fill').className = 'strength-fill';
    $('strength-label').textContent = '';
    $('account-modal-overlay').classList.remove('hidden');
    setTimeout(() => $('f-title').focus(), 100);
  }

  function closeAccountModal() {
    $('account-modal-overlay').classList.add('hidden');
    editingItemId = null;
  }

  $('account-modal-close').addEventListener('click', closeAccountModal);
  $('account-modal-cancel').addEventListener('click', closeAccountModal);
  $('account-modal-overlay').addEventListener('click', e => { if (e.target === $('account-modal-overlay')) closeAccountModal(); });

  // Password visibility toggle in form
  $('f-toggle-vis').addEventListener('click', () => {
    const inp = $('f-password');
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    document.querySelector('#f-toggle-vis .eye-show').classList.toggle('hidden', !showing);
    document.querySelector('#f-toggle-vis .eye-hide').classList.toggle('hidden', showing);
  });

  // Password strength
  $('f-password').addEventListener('input', () => {
    updateStrengthMeter($('f-password').value);
  });

  function updateStrengthMeter(pw) {
    const fill = $('strength-fill');
    const label = $('strength-label');
    if (!pw) { fill.className = 'strength-fill'; label.textContent = ''; return; }
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = ['', 'ضعيفة جداً', 'ضعيفة', 'متوسطة', 'قوية'];
    const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
    fill.className = `strength-fill s${score}`;
    label.textContent = levels[score] || '';
    label.style.color = colors[score] || '';
  }

  // Save account
  $('account-modal-save').addEventListener('click', async () => {
    const title = $('f-title').value.trim();
    const password = $('f-password').value.trim();
    if (!title) { toast('يرجى إدخال اسم الخدمة', 'warning'); return; }
    if (!password) { toast('يرجى إدخال كلمة المرور', 'warning'); return; }

    const item = {
      id: editingItemId || ('item_' + Date.now() + '_' + Math.random().toString(36).substr(2,6)),
      title,
      email: $('f-email').value.trim(),
      password,
      notes: $('f-notes').value.trim(),
      folder: $('f-folder').value || (folders[0] && folders[0].id) || 'general',
      order: editingItemId ? (allItems.find(i => i.id === editingItemId)?.order || 0) : allItems.length,
      createdAt: editingItemId ? (allItems.find(i => i.id === editingItemId)?.createdAt || Date.now()) : Date.now()
    };

    await saveItem(item);
    closeAccountModal();
    toast(editingItemId ? 'تم التعديل بنجاح' : 'تم الإضافة بنجاح', 'success');
  });

  /* ════════════════════════════════════════════════════════
     15. ACTION SHEET (Context Menu)
  ════════════════════════════════════════════════════════ */
  function openActionSheet(item) {
    actionTargetId = item.id;
    $('action-sheet-title').textContent = item.title;
    $('action-modal-overlay').classList.remove('hidden');
  }

  function closeActionSheet() { $('action-modal-overlay').classList.add('hidden'); actionTargetId = null; }
  $('action-modal-close').addEventListener('click', closeActionSheet);
  $('action-modal-overlay').addEventListener('click', e => { if (e.target === $('action-modal-overlay')) closeActionSheet(); });

  $('act-copy-user').addEventListener('click', () => {
    const item = allItems.find(i => i.id === actionTargetId);
    if (item) { copyToClipboard(item.email || item.title); toast('تم النسخ!', 'success'); }
    closeActionSheet();
  });

  $('act-copy-pass').addEventListener('click', () => {
    const item = allItems.find(i => i.id === actionTargetId);
    if (item) { copyToClipboard(item.password); toast('تم نسخ كلمة المرور!', 'success'); }
    closeActionSheet();
  });

  $('act-edit').addEventListener('click', () => {
    const item = allItems.find(i => i.id === actionTargetId);
    closeActionSheet();
    if (item) openAccountModal(item);
  });

  $('act-delete').addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من حذف هذا الحساب؟')) {
      await deleteItem(actionTargetId);
    }
    closeActionSheet();
  });

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { /* fallback */ const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  }

  /* ════════════════════════════════════════════════════════
     16. MOVE TO FOLDER MODAL
  ════════════════════════════════════════════════════════ */
  function openMoveModal() {
    const list = $('folder-select-list');
    list.innerHTML = folders.map(f => `<button class="folder-select-item" data-fid="${f.id}">${f.name}</button>`).join('');
    list.querySelectorAll('.folder-select-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const folderId = btn.dataset.fid;
        showSync(true);
        try {
          const batch = writeBatch(db);
          moveTargetIds.forEach(id => {
            batch.update(doc(db, 'users', currentUser.uid, 'vault', id), { folder: folderId });
          });
          await batch.commit();
          toast('تم النقل بنجاح', 'success');
        } catch { toast('خطأ في النقل', 'error'); }
        showSync(false);
        $('move-modal-overlay').classList.add('hidden');
        exitSelectionMode();
      });
    });
    $('move-modal-overlay').classList.remove('hidden');
  }

  ['move-modal-close','move-modal-cancel'].forEach(id => {
    $(id).addEventListener('click', () => $('move-modal-overlay').classList.add('hidden'));
  });
  $('move-modal-overlay').addEventListener('click', e => { if (e.target === $('move-modal-overlay')) $('move-modal-overlay').classList.add('hidden'); });

  /* ════════════════════════════════════════════════════════
     17. SIDE DRAWER
  ════════════════════════════════════════════════════════ */
  function openDrawer() {
    $('side-drawer').classList.remove('hidden');
    $('drawer-overlay').classList.remove('hidden');
  }

  function closeDrawer() {
    $('side-drawer').classList.add('closing');
    setTimeout(() => {
      $('side-drawer').classList.add('hidden');
      $('side-drawer').classList.remove('closing');
      $('drawer-overlay').classList.add('hidden');
    }, 250);
  }

  $('menu-btn').addEventListener('click', openDrawer);
  $('drawer-overlay').addEventListener('click', closeDrawer);

  // Logout
  $('dm-logout').addEventListener('click', async () => {
    closeDrawer();
    if (confirm('هل تريد تسجيل الخروج؟')) {
      await signOut(auth);
      toast('تم تسجيل الخروج', 'info');
    }
  });

  // Set PIN
  $('dm-setpin').addEventListener('click', () => {
    closeDrawer();
    $('pin-modal-overlay').classList.remove('hidden');
  });

  // Change Encryption Key
  $('dm-changekey').addEventListener('click', () => {
    closeDrawer();
    $('enc-key').value = getEncKey();
    $('key-modal-overlay').classList.remove('hidden');
  });

  /* ════════════════════════════════════════════════════════
     18. SET PIN MODAL
  ════════════════════════════════════════════════════════ */
  $('pin-modal-close').addEventListener('click', () => $('pin-modal-overlay').classList.add('hidden'));
  $('pin-modal-cancel').addEventListener('click', () => $('pin-modal-overlay').classList.add('hidden'));
  $('pin-modal-overlay').addEventListener('click', e => { if (e.target === $('pin-modal-overlay')) $('pin-modal-overlay').classList.add('hidden'); });

  $('pin-modal-save').addEventListener('click', () => {
    const newPin = $('new-pin').value;
    const confirmPin = $('confirm-pin').value;
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { toast('يجب أن يكون الرمز 4 أرقام', 'warning'); return; }
    if (newPin !== confirmPin) { toast('الرمزان غير متطابقان', 'warning'); return; }
    setPIN(newPin);
    $('pin-modal-overlay').classList.add('hidden');
    $('new-pin').value = ''; $('confirm-pin').value = '';
    toast('تم تعيين رمز PIN بنجاح', 'success');
  });

  /* ════════════════════════════════════════════════════════
     19. ENCRYPTION KEY MODAL
  ════════════════════════════════════════════════════════ */
  $('key-modal-close').addEventListener('click', () => $('key-modal-overlay').classList.add('hidden'));
  $('key-modal-cancel').addEventListener('click', () => $('key-modal-overlay').classList.add('hidden'));

  $('key-modal-save').addEventListener('click', () => {
    const k = $('enc-key').value.trim();
    if (!k) { toast('المفتاح لا يمكن أن يكون فارغاً', 'warning'); return; }
    saveEncKey(k);
    encKey = k;
    $('key-modal-overlay').classList.add('hidden');
    toast('تم حفظ مفتاح التشفير. ستُعاد مزامنة البيانات.', 'success');
    subscribeToVault();
  });

  /* ════════════════════════════════════════════════════════
     20. EXPORT / IMPORT / BACKUP
  ════════════════════════════════════════════════════════ */

  // Export JSON
  $('dm-export').addEventListener('click', () => {
    closeDrawer();
    const data = { version: 1, exported: new Date().toISOString(), items: allItems, folders };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `khazna_backup_${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast('تم تصدير البيانات بنجاح', 'success');
  });

  // Import JSON
  $('dm-import').addEventListener('click', () => {
    closeDrawer();
    $('import-file-input').click();
  });

  $('import-file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.items) { toast('ملف غير صالح', 'error'); return; }
      if (!confirm(`استيراد ${data.items.length} حساب؟ سيتم إضافتها إلى الحسابات الحالية.`)) return;
      showSync(true);
      const batch = writeBatch(db);
      data.items.forEach(item => {
        const id = 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
        const docRef = doc(db, 'users', currentUser.uid, 'vault', id);
        batch.set(docRef, {
          title: encrypt(item.title), email: encrypt(item.email),
          password: encrypt(item.password), notes: encrypt(item.notes || ''),
          folder: item.folder || 'general', order: item.order || 0, createdAt: Date.now()
        });
      });
      await batch.commit();
      toast(`تم استيراد ${data.items.length} حساب بنجاح`, 'success');
    } catch (err) { toast('خطأ في الاستيراد: ' + err.message, 'error'); }
    showSync(false);
    e.target.value = '';
  });

  // Backup as Text
  $('dm-backup').addEventListener('click', () => {
    closeDrawer();
    const data = { v: 1, items: allItems, folders };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    $('backup-text').value = encoded;
    $('backup-modal-overlay').classList.remove('hidden');
  });

  ['backup-modal-close','backup-modal-close2'].forEach(id => {
    $(id).addEventListener('click', () => $('backup-modal-overlay').classList.add('hidden'));
  });

  $('backup-copy-btn').addEventListener('click', () => {
    copyToClipboard($('backup-text').value);
    toast('تم نسخ الكود!', 'success');
  });

  // Share via Text (Kodular / AppInventor)
  $('dm-share').addEventListener('click', () => {
    closeDrawer();
    const data = JSON.stringify({ v: 1, items: allItems });
    if (navigator.share) {
      navigator.share({ title: 'خزنة أسراري - نسخة احتياطية', text: data })
        .then(() => toast('تمت المشاركة', 'success'))
        .catch(() => { copyToClipboard(data); toast('تم النسخ للحافظة', 'info'); });
    } else {
      copyToClipboard(data);
      toast('تم نسخ البيانات للحافظة', 'info');
    }
  });

  /* ════════════════════════════════════════════════════════
     21. PWA SERVICE WORKER
  ════════════════════════════════════════════════════════ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('SW registered'))
        .catch(err => console.warn('SW failed:', err));
    });
  }

  console.log('🔐 خزنة أسراري — Initialized');
}