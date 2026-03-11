const firebaseConfig = {
  apiKey: "AIzaSyBB_U4C880PW4GxZd8FALv8yBSiP2mNeBY",
  authDomain: "malaboushi.firebaseapp.com",
  projectId: "malaboushi",
  storageBucket: "malaboushi.firebasestorage.app",
  messagingSenderId: "110336819350",
  appId: "1:110336819350:web:2b1b0488e72b811f0602b7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

document.addEventListener('DOMContentLoaded', function() {
  
  let exchangeRate = 89000; 
  let activeCurrency = 'lbp';
  let data = [];
  
  const authContainer = document.getElementById('auth-container');
  const appContainer = document.getElementById('container');
  const authMsg = document.getElementById('auth-message');
  
  const loginBtn = document.getElementById('login-btn');
  const signupBtn = document.getElementById('signup-btn');
  const logoutBtn = document.getElementById('logout-btn');
  
  const personsContainer = document.getElementById('persons-container');
  const lbpDisplay = document.getElementById('lbp-display');
  const usdDisplay = document.getElementById('usd-display');
  const lbpSection = document.getElementById('lbp-section');
  const usdSection = document.getElementById('usd-section');
  const keypadContainer = document.querySelector('.keypad');
  const okBtn = document.getElementById('ok-btn');
  const overlay = document.getElementById('overlay');
  const overlayContent = document.getElementById('overlay-content');
  const addPersonBtn = document.getElementById('add-person-btn');
  const archiveBtn = document.getElementById('archive-btn');
  const moreOptionsBtn = document.getElementById('more-options-btn');
  const moreOptionsDropdown = document.getElementById('more-options-dropdown');
  const clearAllDataBtn = document.getElementById('clear-all-data-btn');
  const exportDataBtn = document.getElementById('export-data-btn');
  const importDataBtn = document.getElementById('import-data-btn');
  const changeRateBtn = document.getElementById('change-rate-btn');

  const dialogOverlay = document.getElementById('dialog-overlay');
  const dialogTitle = document.getElementById('dialog-title');
  const dialogMessage = document.getElementById('dialog-message');
  const dialogInput = document.getElementById('dialog-input');
  const dialogTextarea = document.getElementById('dialog-textarea');
  const dialogConfirmBtn = document.getElementById('dialog-confirm');
  const dialogCancelBtn = document.getElementById('dialog-cancel');

  auth.onAuthStateChanged(async user => {
    if (user && user.emailVerified) {
      authContainer.classList.add('hidden');
      appContainer.classList.remove('hidden');
      await loadCloudData(user.uid);
    } else {
      authContainer.classList.remove('hidden');
      appContainer.classList.add('hidden');
    }
  });

  signupBtn.addEventListener('click', () => {
    const e = document.getElementById('auth-email').value;
    const p = document.getElementById('auth-password').value;
    authMsg.style.color = 'var(--text-color)';
    authMsg.innerText = 'جاري الإنشاء...';
    
    auth.createUserWithEmailAndPassword(e, p)
    .then((userCredential) => {
        userCredential.user.sendEmailVerification()
        .then(() => {
            authMsg.style.color = 'var(--success-color)';
            authMsg.innerText = "تم إنشاء حساب جديد! يرجى الذهاب إلى إيميلك والضغط على رابط التحقق، ثم ارجع وسجل دخول.";
            auth.signOut();
        });
    })
    .catch(err => {
        authMsg.style.color = 'var(--danger-color)';
        authMsg.innerText = "خطأ: " + err.message;
    });
  });

  loginBtn.addEventListener('click', () => {
    const e = document.getElementById('auth-email').value;
    const p = document.getElementById('auth-password').value;
    authMsg.style.color = 'var(--text-color)';
    authMsg.innerText = 'جاري الدخول...';
    
    auth.signInWithEmailAndPassword(e, p)
    .then((userCredential) => {
        if (!userCredential.user.emailVerified) {
            authMsg.style.color = 'var(--danger-color)';
            authMsg.innerText = "لا يمكنك الدخول! يرجى تأكيد حسابك من الرابط الذي أرسلناه إلى إيميلك.";
            auth.signOut();
        } else {
            authMsg.innerText = "";
        }
    })
    .catch(err => {
        authMsg.style.color = 'var(--danger-color)';
        authMsg.innerText = "خطأ: " + err.message;
    });
  });

  logoutBtn.addEventListener('click', () => {
    auth.signOut();
  });

  async function loadCloudData(uid) {
    try {
      const doc = await db.collection('user_debts').doc(uid).get();
      if (doc.exists) {
        const dbData = doc.data();
        data = dbData.debts || [{ name: 'زبون عام', records: [] }];
        exchangeRate = dbData.exchangeRate || 89000;
      } else {
        data = [{ name: 'زبون عام', records: [] }];
        exchangeRate = 89000;
        await saveCloudData();
      }
      renderPersons();
      renderKeypad();
    } catch (e) {
      console.error(e);
    }
  }

  async function saveCloudData() {
    const user = auth.currentUser;
    if (user && user.emailVerified) {
      await db.collection('user_debts').doc(user.uid).set({
        debts: data,
        exchangeRate: exchangeRate
      });
    }
  }

  function showCustomDialog(type, title, message, defaultValue = '') {
    return new Promise((resolve) => {
      dialogTitle.textContent = title;
      dialogMessage.textContent = message;
      
      dialogInput.style.display = 'none';
      dialogTextarea.style.display = 'none';
      dialogCancelBtn.style.display = 'none';
      dialogInput.value = '';
      dialogTextarea.value = '';
      
      if (type === 'alert') {
        dialogConfirmBtn.textContent = 'موافق';
        dialogConfirmBtn.className = 'dialog-btn btn-primary';
      } 
      else if (type === 'confirm') {
        dialogConfirmBtn.textContent = 'نعم';
        dialogConfirmBtn.className = 'dialog-btn btn-danger';
        dialogCancelBtn.style.display = 'block';
        dialogCancelBtn.textContent = 'لا';
      } 
      else if (type === 'prompt') {
        dialogConfirmBtn.textContent = 'موافق';
        dialogConfirmBtn.className = 'dialog-btn btn-primary';
        dialogCancelBtn.style.display = 'block';
        dialogCancelBtn.textContent = 'إلغاء';
        dialogInput.style.display = 'block';
        dialogInput.value = defaultValue;
        setTimeout(() => dialogInput.focus(), 100);
      }
      else if (type === 'prompt-area') {
         dialogConfirmBtn.textContent = 'نسخ / موافق';
         dialogConfirmBtn.className = 'dialog-btn btn-primary';
         dialogCancelBtn.style.display = 'block';
         dialogCancelBtn.textContent = 'إغلاق';
         dialogTextarea.style.display = 'block';
         dialogTextarea.value = defaultValue;
      }

      dialogOverlay.classList.add('show');

      const handleConfirm = () => {
        cleanup();
        if (type === 'prompt') resolve(dialogInput.value);
        else if (type === 'prompt-area') resolve(dialogTextarea.value);
        else resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      function cleanup() {
        dialogConfirmBtn.removeEventListener('click', handleConfirm);
        dialogCancelBtn.removeEventListener('click', handleCancel);
        dialogOverlay.classList.remove('show');
      }

      dialogConfirmBtn.addEventListener('click', handleConfirm);
      dialogCancelBtn.addEventListener('click', handleCancel);
    });
  }

  async function myAlert(msg, title = 'تنبيه') { await showCustomDialog('alert', title, msg); }
  async function myConfirm(msg, title = 'تأكيد') { return await showCustomDialog('confirm', title, msg); }
  async function myPrompt(msg, title = 'إدخال', def = '') { return await showCustomDialog('prompt', title, msg, def); }

  function renderPersons() {
    personsContainer.innerHTML = '';
    data.forEach((person) => {
      const btn = document.createElement('button');
      btn.className = 'person-btn';
      btn.textContent = person.name;
      personsContainer.appendChild(btn);
    });
  }

  function renderKeypad() {
    const rows = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0', '00', '000'], ['-', 'C']];
    keypadContainer.innerHTML = '';
    rows.forEach(row => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'keypad-row';
      row.forEach(key => {
        const btn = document.createElement('button');
        if(key === 'C') {
           btn.textContent = 'C';
           btn.style.color = 'var(--danger-color)';
           btn.style.fontWeight = 'bold';
        } else if(key === '-') {
           btn.textContent = '-';
           btn.style.fontSize = '1.8rem'; 
           btn.style.paddingBottom = '5px';
        } else {
           btn.textContent = key;
        }
        btn.addEventListener('click', () => handleKeypadPress(key));
        rowDiv.appendChild(btn);
      });
      keypadContainer.appendChild(rowDiv);
    });
  }

  function handleKeypadPress(key) {
    const targetEl = activeCurrency === 'lbp' ? lbpDisplay : usdDisplay;
    let value = targetEl.textContent;

    if (key === 'C') {
      lbpDisplay.textContent = '0';
      usdDisplay.textContent = '0';
      return;
    }

    if (key === '-') {
      if (value === '0') {
         targetEl.textContent = '-';
      } else if (value === '-') {
         targetEl.textContent = '0';
      } else if (value.includes('-')) {
         targetEl.textContent = value.replace('-', '');
      } else {
         targetEl.textContent = '-' + value;
      }
      return;
    }

    if (key === '00' || key === '000') {
      if (value === '0') value = '0';
      else if (value === '-') value = '-';
      else value += key;
    } else {
      if (value === '0') value = key;
      else if (value === '-') value = '-' + key;
      else value += key;
    }

    targetEl.textContent = value === '' ? '0' : value;
  }

  lbpSection.addEventListener('click', () => {
    activeCurrency = 'lbp';
    lbpSection.classList.add('active');
    usdSection.classList.remove('active');
  });
  usdSection.addEventListener('click', () => {
    activeCurrency = 'usd';
    usdSection.classList.add('active');
    lbpSection.classList.remove('active');
  });
  lbpSection.classList.add('active');

  okBtn.addEventListener('click', async () => {
    const lbp = parseFloat(lbpDisplay.textContent) || 0;
    const usd = parseFloat(usdDisplay.textContent) || 0;
    
    if (lbp === 0 && usd === 0) {
      await myAlert('الرجاء إدخال مبلغ صحيح.');
      return;
    }
    showPersonSelection(lbp, usd);
  });
  
  function showPersonSelection(lbp, usd) {
    overlayContent.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = 'اختر الزبون';
    overlayContent.appendChild(title);
    
    const list = document.createElement('div');
    list.className = 'overlay-list';
    data.forEach((person) => {
      const btn = document.createElement('button');
      btn.className = 'person-btn';
      btn.textContent = person.name;
      btn.addEventListener('click', () => {
        person.records.push({ lbp, usd, date: new Date().toISOString(), note: '' });
        saveCloudData();
        lbpDisplay.textContent = '0';
        usdDisplay.textContent = '0';
        hideOverlay();
      });
      list.appendChild(btn);
    });
    overlayContent.appendChild(list);
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'close-btn';
    cancelBtn.textContent = 'إلغاء';
    cancelBtn.addEventListener('click', hideOverlay);
    overlayContent.appendChild(cancelBtn);
    
    showOverlay();
  }

  function showPersonDetails(index, allowDelete) {
    const person = data[index];
    overlayContent.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = person.name;
    overlayContent.appendChild(title);
    
    if (person.records.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.textContent = 'لا توجد عمليات مسجلة.';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = '#64748b';
      emptyMsg.style.padding = '15px';
      overlayContent.appendChild(emptyMsg);
    } else {
      const currentRecords = [...person.records]; 
      currentRecords.forEach((rec) => {
        const div = document.createElement('div');
        div.className = 'record-item' + (allowDelete ? ' deletable' : '');
        const dateObj = new Date(rec.date);
        const dateStr = dateObj.toLocaleDateString('ar-EG');
        const timeStr = dateObj.toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'});
        
        const lbpVal = rec.lbp.toLocaleString('en-US');
        const usdVal = rec.usd.toLocaleString('en-US');
        
        const lbpColor = rec.lbp < 0 ? 'var(--danger-color)' : 'var(--text-color)';
        const usdColor = rec.usd < 0 ? 'var(--danger-color)' : 'var(--text-color)';

        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
              <span><strong>ليرة:</strong> <span class="record-value" style="color:${lbpColor}">${lbpVal}</span></span>
              <span><strong>دولار:</strong> <span class="record-value" style="color:${usdColor}">${usdVal}</span></span>
          </div>
          <div style="color:#94a3b8; font-size:0.8rem; margin-bottom:5px;">${dateStr} - ${timeStr}</div>
          ${rec.note ? `<div style="background:#f1f5f9; padding:5px; border-radius:5px; font-size:0.85rem;">📝 ${rec.note}</div>` : ''}
        `;
        
        const noteBtn = document.createElement('button');
        noteBtn.textContent = rec.note ? 'تعديل الملاحظة' : '+ إضافة ملاحظة';
        noteBtn.className = 'note-btn';
        noteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const newNote = await myPrompt('أدخل الملاحظة', 'ملاحظة', rec.note || '');
          if (newNote !== null) {
            rec.note = newNote.trim();
            saveCloudData();
            showPersonDetails(index, allowDelete);
          }
        });
        div.appendChild(noteBtn);
        
        if (allowDelete) {
          div.addEventListener('click', async (e) => {
             if(e.target === noteBtn) return; 
            if (await myConfirm('هل تريد حذف هذا السجل نهائياً؟')) {
              const originalIndex = person.records.findIndex(r => r.date === rec.date && r.lbp === rec.lbp && r.usd === rec.usd);
              if (originalIndex !== -1) { 
                person.records.splice(originalIndex, 1);
                saveCloudData();
                showPersonDetails(index, allowDelete);
              }
            }
          });
        }
        overlayContent.appendChild(div);
      });

      const totalsDiv = document.createElement('div');
      totalsDiv.className = 'totals';
      const totals = computeTotals(person.records);
      totalsDiv.innerHTML = `
        <div>المجموع (ليرة): <span class="number">${totals.lbpTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
        <div>المجموع (دولار): <span class="number">${totals.usdTotal.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></div>
      `;
      overlayContent.appendChild(totalsDiv);
    }
    
    if (person.records.length > 0) {
      const delAllBtn = document.createElement('button');
      delAllBtn.className = 'delete-all-btn';
      delAllBtn.textContent = 'حذف جميع الفواتير';
      delAllBtn.addEventListener('click', async function() {
        if (await myConfirm('تحذير: سيتم تصفير حساب هذا الزبون بالكامل.')) {
          person.records = [];
          saveCloudData();
          showPersonDetails(index, allowDelete);
        }
      });
      overlayContent.appendChild(delAllBtn);
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = 'رجوع';
    closeBtn.addEventListener('click', hideOverlay);
    overlayContent.appendChild(closeBtn);
    showOverlay();
  }

  function computeTotals(records) {
    let totalLBP = 0;
    let totalUSD = 0;
    records.forEach(rec => {
      totalLBP += rec.lbp;
      totalUSD += rec.usd;
    });
    const lbpTotal = totalLBP + totalUSD * exchangeRate;
    const usdTotal = totalUSD + totalLBP / exchangeRate;
    return { lbpTotal, usdTotal };
  }

  function showOverlay() { overlay.classList.add('show'); }
  function hideOverlay() { overlay.classList.remove('show'); }
  
  changeRateBtn.addEventListener('click', async () => {
      moreOptionsDropdown.classList.remove('show');
      const newRateStr = await myPrompt('أدخل سعر الصرف الجديد (ليرة/$)', 'تغيير الصرف', exchangeRate);
      if (newRateStr !== null && newRateStr.trim() !== "") {
          const newRate = parseFloat(newRateStr);
          if (!isNaN(newRate) && newRate > 0) {
              exchangeRate = newRate;
              saveCloudData();
              await myAlert(`تم تحديث السعر: ${newRate.toLocaleString('en-US')}`);
          } else {
              await myAlert('الرقم غير صحيح.');
          }
      }
  });

  moreOptionsBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 
    moreOptionsDropdown.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!moreOptionsBtn.contains(e.target) && !moreOptionsDropdown.contains(e.target)) {
      moreOptionsDropdown.classList.remove('show');
    }
  });
  
  clearAllDataBtn.addEventListener('click', async () => {
    moreOptionsDropdown.classList.remove('show');
    const confirm1 = await myConfirm('هل أنت متأكد؟ سيتم حذف جميع البيانات!', 'حذف شامل');
    if (confirm1) {
      const confirm2 = await myConfirm('هذا الإجراء لا رجعة فيه. استمرار؟', 'تأكيد نهائي');
      if (confirm2) {
          data = [{ name: 'زبون عام', records: [] }];
          saveCloudData();
          renderPersons();
          hideOverlay();
          await myAlert('تمت إعادة ضبط التطبيق بنجاح.');
      }
    }
  });
  
  exportDataBtn.addEventListener('click', async () => {
    moreOptionsDropdown.classList.remove('show');
    const dataJson = JSON.stringify(data, null, 2);
    await showCustomDialog('prompt-area', 'نسخ البيانات', 'انسخ الكود التالي يدوياً:', dataJson);
  });
  
  importDataBtn.addEventListener('click', async () => {
    moreOptionsDropdown.classList.remove('show');
    const input = await showCustomDialog('prompt-area', 'استيراد البيانات', 'الصق كود البيانات هنا:');
    if (input) {
      try {
        const importedData = JSON.parse(input);
        if (Array.isArray(importedData)) {
          if (await myConfirm('سيتم استبدال البيانات الحالية بالبيانات الجديدة. موافق؟')) {
            data = importedData;
            saveCloudData();
            renderPersons();
            await myAlert('تم الاستيراد بنجاح.');
          }
        } else {
          await myAlert('البيانات غير صالحة.');
        }
      } catch (e) {
        await myAlert('خطأ في قراءة البيانات. تأكد من التنسيق.');
      }
    }
  });

  function showArchiveList() {
    let isSelectionMode = false;
    let selectedIndices = new Set(); 

    overlayContent.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = 'قائمة الزبائن';
    overlayContent.appendChild(title);

    const topControls = document.createElement('div');
    topControls.style.display = 'flex';
    topControls.style.gap = '10px';
    topControls.style.marginBottom = '15px';

    const selectionToggleBtn = document.createElement('button');
    selectionToggleBtn.textContent = '✓ تحديد';
    selectionToggleBtn.style.flex = '1';
    selectionToggleBtn.style.borderRadius = '10px';
    selectionToggleBtn.style.backgroundColor = '#f1f5f9';
    selectionToggleBtn.style.color = 'var(--text-color)';
    selectionToggleBtn.style.padding = '10px';

    const addNewInArchiveBtn = document.createElement('button');
    addNewInArchiveBtn.textContent = '+ زبون جديد';
    addNewInArchiveBtn.style.flex = '1';
    addNewInArchiveBtn.style.borderRadius = '10px';
    addNewInArchiveBtn.style.backgroundColor = 'var(--primary-color)';
    addNewInArchiveBtn.style.color = '#fff';
    addNewInArchiveBtn.style.padding = '10px';
    
    addNewInArchiveBtn.addEventListener('click', async () => {
      const name = await myPrompt('اسم الزبون الجديد', 'إضافة');
      if (name && name.trim()) {
        data.push({ name: name.trim(), records: [] });
        saveCloudData();
        renderArchiveButtons();
        renderPersons();
      }
    });

    topControls.appendChild(selectionToggleBtn);
    topControls.appendChild(addNewInArchiveBtn);
    overlayContent.appendChild(topControls);

    const selectControlsDiv = document.createElement('div');
    selectControlsDiv.className = 'select-controls';
    selectControlsDiv.style.display = 'none';
      
    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'الكل';
    selectAllBtn.style.backgroundColor = '#e2e8f0';
    selectAllBtn.addEventListener('click', () => {
        data.forEach((_, index) => selectedIndices.add(index));
        renderArchiveButtons();
    });
      
    const selectNoneBtn = document.createElement('button');
    selectNoneBtn.textContent = 'إلغاء';
    selectNoneBtn.style.backgroundColor = '#e2e8f0';
    selectNoneBtn.addEventListener('click', () => {
        selectedIndices.clear();
        renderArchiveButtons();
    });

    selectControlsDiv.appendChild(selectAllBtn);
    selectControlsDiv.appendChild(selectNoneBtn);
    overlayContent.appendChild(selectControlsDiv);

    const deleteSelectedBtn = document.createElement('button');
    deleteSelectedBtn.textContent = 'حذف المحدد 🗑️'; 
    deleteSelectedBtn.style.display = 'none';
    deleteSelectedBtn.className = 'delete-all-btn';
    deleteSelectedBtn.style.marginBottom = '15px';
      
    deleteSelectedBtn.addEventListener('click', async () => {
        if (selectedIndices.size === 0) return;
        const indicesToDelete = Array.from(selectedIndices).filter(index => {
            return !(data.length === 1); 
        }).sort((a, b) => b - a); 

        if (indicesToDelete.length > 0) {
            if (await myConfirm(`هل أنت متأكد من حذف ${indicesToDelete.length} زبون؟`)) {
                indicesToDelete.forEach(index => {
                    data.splice(index, 1);
                });
                saveCloudData();
                renderPersons();
                isSelectionMode = false;
                selectedIndices.clear();
                resetSelectionUI();
                renderArchiveButtons();
            }
        } else {
             await myAlert('لا يمكن حذف الزبون الأخير.');
        }
    });
    overlayContent.appendChild(deleteSelectedBtn);

    function resetSelectionUI() {
        selectionToggleBtn.textContent = '✓ تحديد';
        selectionToggleBtn.style.backgroundColor = '#f1f5f9';
        selectionToggleBtn.style.color = 'var(--text-color)';
        selectControlsDiv.style.display = 'none';
        deleteSelectedBtn.style.display = 'none';
        addNewInArchiveBtn.style.display = 'block';
    }

    selectionToggleBtn.addEventListener('click', () => {
        isSelectionMode = !isSelectionMode;
        selectedIndices.clear();
        if (isSelectionMode) {
            selectionToggleBtn.textContent = 'تم';
            selectionToggleBtn.style.backgroundColor = 'var(--primary-color)';
            selectionToggleBtn.style.color = '#fff';
            selectControlsDiv.style.display = 'flex';
            deleteSelectedBtn.style.display = 'block';
            addNewInArchiveBtn.style.display = 'none';
        } else {
            resetSelectionUI();
        }
        renderArchiveButtons();
    });

    const list = document.createElement('div');
    list.className = 'overlay-list';
    overlayContent.appendChild(list);

    function renderArchiveButtons() {
        list.innerHTML = '';
        data.forEach((person, index) => {
            const btn = document.createElement('button');
            btn.textContent = person.name;
            btn.className = 'person-btn'; 
            if (isSelectionMode) {
                if (selectedIndices.has(index)) {
                    btn.classList.add('selected');
                    btn.innerHTML = `✅ ${person.name}`;
                } else {
                    btn.classList.remove('selected');
                    btn.innerHTML = `⬜ ${person.name}`;
                }
            } else {
                btn.classList.remove('selected');
            }

            btn.addEventListener('click', function(e) {
                if (isSelectionMode) {
                    e.stopPropagation();
                    if (selectedIndices.has(index)) selectedIndices.delete(index);
                    else selectedIndices.add(index);
                    renderArchiveButtons();
                } else {
                    showPersonDetails(index, true); 
                }
            });
            
            let pressTimer;
            const startPress = () => {
                 if (isSelectionMode || data.length <= 1) return;
                 pressTimer = setTimeout(async () => {
                    if (await myConfirm('حذف الزبون "' + person.name + '"؟')) {
                        data.splice(index, 1);
                        saveCloudData();
                        renderPersons();
                        renderArchiveButtons();
                    } 
                }, 800); 
            };
            const endPress = () => clearTimeout(pressTimer);

            btn.addEventListener('mousedown', startPress);
            btn.addEventListener('mouseup', endPress);
            btn.addEventListener('mouseleave', endPress);
            btn.addEventListener('touchstart', startPress, {passive: true});
            btn.addEventListener('touchend', endPress);

            list.appendChild(btn);
        });
    }
      
    renderArchiveButtons();
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = 'إغلاق';
    closeBtn.addEventListener('click', hideOverlay);
    overlayContent.appendChild(closeBtn);
    showOverlay();
  }

  archiveBtn.addEventListener('click', showArchiveList);
  
  addPersonBtn.addEventListener('click', async () => {
    const name = await myPrompt('أدخل اسم الزبون الجديد', 'زبون جديد');
    if (name && name.trim()) {
      data.push({ name: name.trim(), records: [] });
      saveCloudData();
      renderPersons();
    }
  });

});