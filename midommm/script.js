const defaultData = { col1: [], col2: [], col3: [], col4: [] };
let itemData = JSON.parse(localStorage.getItem('itemData')) || defaultData;
let savedBills = JSON.parse(localStorage.getItem('savedBills')) || [];
let customers = JSON.parse(localStorage.getItem('customers')) || [];
let rate = parseFloat(localStorage.getItem('exchangeRate')) || 89000;
let settingsPassword = localStorage.getItem('settingsPassword');

let total = 0;
let enteredNum = '';
let customPriceMode = false;
let receiptData = {};
let sortMode = false;
let sortFirstSelection = null;
let currentEditCol = null;
let currentEditIndex = null;
let selectedColForAdd = 'col1';
let customerNote = "";

let selectedCustomerForBill = null;
let currentViewedBillIndex = null;
let currentStatementCustomer = null;
let isAddingDebtTransaction = false;

// متغيرات التحديد المتعدد
let selectionMode = { bill: false, customer: false };
let selectedItems = { bill: new Set(), customer: new Set() };

const getEl = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');
function vibrate(el){ if(navigator.vibrate) navigator.vibrate(50); if(el) { el.style.transform='scale(0.95)'; setTimeout(()=>el.style.transform='scale(1)', 100); } }

function showToast(msg) {
    const t = getEl('toast-notification');
    t.innerHTML = msg;
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); }, 2000);
}

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Enter') {
            e.preventDefault();
            const activeModal = document.querySelector('.custom-modal[style*="flex"]');
            if (activeModal) {
                const submitBtn = activeModal.querySelector('.btn-add') || activeModal.querySelector('.btn-close');
                if (submitBtn) submitBtn.click();
            }
        }
        return; 
    }
    if (e.key >= '0' && e.key <= '9') { press(e.key); } 
    else if (e.key === 'Backspace' || e.key === 'Delete') { clearInput(); } 
    else if (e.key === 'Escape') { closeAllModals(); } 
    else if (e.key === 'Enter' || e.key === '+') { const anyModalOpen = document.querySelector('.custom-modal[style*="flex"]'); if (!anyModalOpen) openPay(); } 
    else if (e.key.toLowerCase() === 's') { saveBill(); } 
    else if (e.key.toLowerCase() === 'c') { openCustomerSelectModal(); }
});

// ========================
// 👥 نظام الزبائن 
// ========================

function openCustomerSelectModal() { 
    closeAllModals(); // تم الإصلاح هنا
    selectionMode.customer = false; 
    selectedItems.customer.clear();
    renderCustomerList('select'); 
    showModal('customer-select-modal'); 
}

function openDebtManagement() { 
    closeAllModals();
    checkSettingsPassword(() => {
        selectionMode.customer = false;
        selectedItems.customer.clear();
        renderCustomerList('manage'); 
        showModal('debt-manage-modal');
    });
}

function backToDebtManager() { closeAllModals(); renderCustomerList('manage'); showModal('debt-manage-modal'); } 

function renderCustomerList(mode) {
    const listId = mode === 'select' ? 'customer-select-list' : 'debt-customer-list';
    const listEl = getEl(listId);
    listEl.innerHTML = '';
    
    // إخفاء/إظهار أزرار التحديد في وضع الإدارة
    if(mode === 'manage') {
        getEl('btn-cust-select-mode').style.display = selectionMode.customer ? 'none' : 'flex';
        getEl('cust-selection-bar').style.display = selectionMode.customer ? 'grid' : 'none';
        getEl('btn-add-cust-manage').style.display = selectionMode.customer ? 'none' : 'flex';
        listEl.className = selectionMode.customer ? 'showing-checks' : '';
    }

    if (customers.length === 0) { listEl.innerHTML = '<div style="text-align:center;color:#777;padding:10px;">لا يوجد زبائن</div>'; return; }

    customers.forEach(name => {
        const div = document.createElement('div');
        div.className = 'customer-row';
        
        let html = '';
        if (mode === 'manage') {
            const isSel = selectedItems.customer.has(name);
            html += `<input type="checkbox" class="chk-select" ${isSel?'checked':''} onchange="toggleItemSelection('customer', '${name}', this)">`;
        }

        if (mode === 'select') {
            div.innerHTML = `<span>${name}</span>`;
            div.onclick = () => selectCustomerForBill(name);
        } else {
            const debt = savedBills.filter(b => b.customName === name).reduce((sum, b) => sum + b.total, 0);
            html += `<div style="flex:1"><span>${name}</span> <span style="font-size:11px;color:${debt>=0?'#c62828':'#2e7d32'};font-weight:bold">${fmt(debt)} L.L.</span></div>`;
            div.innerHTML = html;
            setupCustomerInteraction(div, name);
        }
        listEl.appendChild(div);
    });
}

async function addNewCustomer(isFromMain) {
    const name = await promptModal("اسم الزبون الجديد:", false);
    if (name && name.trim() !== "") {
        if (!customers.includes(name.trim())) {
            customers.push(name.trim());
            localStorage.setItem('customers', JSON.stringify(customers));
            showToast("✅ تم إضافة الزبون");
            if (isFromMain) renderCustomerList('select'); else renderCustomerList('manage');
        } else { alertModal("الاسم موجود مسبقاً!"); }
    }
}

function selectCustomerForBill(name) {
    selectedCustomerForBill = name;
    getEl('current-customer-name').textContent = name;
    getEl('customer-display').style.display = 'block';
    closeAllModals(); 
    showToast(`👤 تم تحديد: ${name}`);
}

function setupCustomerInteraction(element, name) {
    let timer; let startX, startY; let isScrolling = false; let isLongPress = false;
    element.addEventListener('mousedown', (e) => { 
        if(selectionMode.customer || e.target.type === 'checkbox') return;
        timer = setTimeout(() => { isLongPress = true; confirmDeleteCustomer(name); }, 600); 
    });
    element.addEventListener('mouseup', (e) => { 
        clearTimeout(timer); 
        if(selectionMode.customer || e.target.type === 'checkbox') return;
        if(!isLongPress) openCustomerStatement(name); 
        isLongPress = false; 
    });
    element.addEventListener('touchstart', (e) => {
        if(selectionMode.customer || e.target.type === 'checkbox') return;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; isScrolling = false; isLongPress = false;
        timer = setTimeout(() => { if (!isScrolling) { isLongPress = true; if(navigator.vibrate) navigator.vibrate(70); confirmDeleteCustomer(name); } }, 600);
    }, {passive: true});
    element.addEventListener('touchmove', (e) => { if (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10) { isScrolling = true; clearTimeout(timer); } }, {passive: true});
    element.addEventListener('touchend', (e) => { 
        clearTimeout(timer); 
        if(selectionMode.customer || e.target.type === 'checkbox') return;
        if (!isScrolling && !isLongPress) openCustomerStatement(name); 
    });
}

async function confirmDeleteCustomer(name) {
    if (await confirmModal(`حذف الزبون "${name}" نهائياً؟`)) {
        customers = customers.filter(c => c !== name);
        localStorage.setItem('customers', JSON.stringify(customers));
        renderCustomerList('manage'); // إعادة رسم القائمة دون إغلاق المودال
    }
}

function openCustomerStatement(name) {
    currentStatementCustomer = name;
    const bills = savedBills.filter(b => b.customName === name);
    const totalLBP = bills.reduce((sum, b) => sum + b.total, 0);
    const totalUSD = totalLBP / rate;
    const color = totalLBP >= 0 ? '#c62828' : '#2e7d32';

    getEl('statement-title').textContent = `كشف حساب: ${name}`;
    getEl('statement-summary').innerHTML = `
        <div style="display:flex; justify-content:space-around; width:100%;">
            <div style="text-align:center;">
                <div style="font-size:12px; color:#555;">المجموع (L.L.)</div>
                <div style="font-weight:900; color:${color}; font-size:18px;">${fmt(totalLBP)}</div>
            </div>
            <div style="text-align:center;">
                <div style="font-size:12px; color:#555;">المجموع ($)</div>
                <div style="font-weight:900; color:${color}; font-size:18px;">$${totalUSD.toFixed(2)}</div>
            </div>
        </div>
    `;
    const list = getEl('statement-bills-list');
    list.innerHTML = '';
    if (bills.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:20px">الحساب صافي</div>';
    } else {
        bills.reverse().forEach(bill => {
            const div = document.createElement('div');
            div.style.borderBottom = '1px solid #ddd'; div.style.marginBottom = '5px'; div.style.paddingBottom = '5px';
            const isPayment = bill.total < 0; 
            const isCashDebt = bill.note === "دين نقدي (كاش)";
            let itemColor = isPayment ? '#2e7d32' : (isCashDebt ? '#c62828' : '#333');

            let html = `<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:12px;margin-bottom:3px;"><span>${bill.time.split(',')[0]}</span><span style="color:${itemColor}">${fmt(bill.total)}</span></div>`;
            const items = Array.isArray(bill.items) ? bill.items : Object.values(bill.items);
            items.forEach(item => {
                html += `<div class="mini-bill-item"><span style="color:${itemColor};font-weight:${(isPayment||isCashDebt)?'bold':'normal'}">- ${item.name}</span><span>${item.count > 1 ? item.count + 'x' : ''} ${fmt(item.price)}</span></div>`;
            });
            div.innerHTML = html;
            list.appendChild(div);
        });
    }
    closeAllModals();
    showModal('customer-statement-modal');
}

function openPaymentModal(isDebt) {
    isAddingDebtTransaction = isDebt;
    closeAllModals(); 
    getEl('payment-amount').value = '';
    getEl('payment-modal-title').textContent = isDebt ? "تسجيل دين نقدي (كاش)" : "استلام دفعة من الحساب";
    showModal('payment-modal');
    setTimeout(() => getEl('payment-amount').focus(), 100);
}

function confirmTransaction(currency) {
    if (!currentStatementCustomer) return;
    const val = parseFloat(getEl('payment-amount').value);
    if (isNaN(val) || val <= 0) return alertModal("المبلغ غير صحيح");

    let amountLBP = 0, noteText = "", finalTotal = 0, billNote = "";
    if (currency === 'USD') { amountLBP = val * rate; } else { amountLBP = val; }

    if (isAddingDebtTransaction) {
        finalTotal = amountLBP; 
        billNote = "دين نقدي (كاش)";
        noteText = `💸 سحب كاش (${currency === 'USD' ? '$' + val : fmt(val) + ' L.L.'})`;
    } else {
        finalTotal = -amountLBP;
        billNote = "دفعة حساب";
        noteText = `✅ دفعة نقدية (${currency === 'USD' ? '$' + val : fmt(val) + ' L.L.'})`;
    }
    const transactionBill = {
        time: new Date().toLocaleString('ar-LB'),
        total: finalTotal,
        note: billNote,
        customName: currentStatementCustomer,
        items: [{ name: noteText, price: finalTotal, count: 1, unitPrice: finalTotal }]
    };
    savedBills.push(transactionBill);
    localStorage.setItem('savedBills', JSON.stringify(savedBills));
    showToast(isAddingDebtTransaction ? "تم تسجيل الدين" : "تم تسجيل الدفعة");
    closeAllModals();
    openCustomerStatement(currentStatementCustomer);
}

async function clearCustomerDebt() {
    if (!currentStatementCustomer) return;
    if (await confirmModal(`تصفية حساب "${currentStatementCustomer}"؟`)) {
        savedBills = savedBills.filter(b => b.customName !== currentStatementCustomer);
        localStorage.setItem('savedBills', JSON.stringify(savedBills));
        showToast("✅ تم تصفية الحساب");
        openCustomerStatement(currentStatementCustomer);
    }
}

// ========================
// الفواتير والتقارير
// ========================

function openSavedBills() { 
    checkSettingsPassword(() => { 
        selectionMode.bill = false;
        selectedItems.bill.clear();
        renderBillsList(); 
        showModal('bills-modal'); 
    }); 
}

function renderBillsList() {
    const list = getEl('saved-bills-list'); list.innerHTML = '';
    
    // إظهار عناصر التحديد إذا كان الوضع مفعل
    getEl('btn-bill-select-mode').style.display = selectionMode.bill ? 'none' : 'flex';
    getEl('bill-selection-bar').style.display = selectionMode.bill ? 'grid' : 'none';
    list.className = selectionMode.bill ? 'showing-checks' : '';

    if (savedBills.length === 0) { list.innerHTML = '<div style="text-align:center; padding:20px; color:#777;">السجل فارغ</div>'; return; }
    
    // Reverse for display but keep original index logic
    [...savedBills].reverse().forEach((bill, reversedIndex) => {
        const originalIndex = savedBills.length - 1 - reversedIndex;
        const div = document.createElement('div'); div.className = 'bill-row';
        
        const isPay = bill.total < 0; 
        const isDebt = bill.note === "دين نقدي (كاش)";
        
        let htmlContent = '';
        if(selectionMode.bill) {
             const isSel = selectedItems.bill.has(originalIndex);
             htmlContent += `<input type="checkbox" class="chk-select" ${isSel?'checked':''} onchange="toggleItemSelection('bill', ${originalIndex}, this)">`;
        }
        
        htmlContent += `<div style="flex:1"><div style="display:flex; justify-content:space-between; align-items:center; pointer-events: none;"><span style="font-weight:bold; color:#333;">#${savedBills.length - reversedIndex}</span><span style="font-size:12px; color:#666;">${bill.time.split(',')[1] || bill.time}</span></div>`;
        if (bill.customName) { htmlContent += `<div class="bill-note" style="pointer-events: none; background:${isPay?'#2e7d32':(isDebt?'#c62828':'#1976d2')}">👤 ${bill.customName}</div>`; } 
        else if (bill.note) { htmlContent += `<div style="font-size:11px; color:#1976d2; margin-top:2px; pointer-events: none;">📝 ${bill.note}</div>`; }
        htmlContent += `<div style="text-align:left; font-weight:900; color:${isPay?'#2e7d32':(isDebt?'#c62828':'#bf360c')}; margin-top:5px; pointer-events: none;">${fmt(bill.total)} L.L.</div></div>`;
        
        div.innerHTML = htmlContent; 
        setupBillInteraction(div, originalIndex); 
        list.appendChild(div);
    });
    
    // زر مسح الكل فقط إذا لم يكن هناك تحديد
    if(!selectionMode.bill) {
        const clearBtn = document.createElement('button'); clearBtn.className = 'btn-clear-history'; clearBtn.innerHTML = '🗑️ مسح السجل بالكامل (عام)'; clearBtn.onclick = clearAllHistory; list.appendChild(clearBtn);
    }
}

function setupBillInteraction(element, index) {
    let timer; let startX, startY; let isScrolling = false; let isLongPress = false;
    element.addEventListener('mousedown', (e) => { 
        if(selectionMode.bill || e.target.type === 'checkbox') return;
        timer = setTimeout(() => { isLongPress = true; confirmDeleteBill(index); }, 600); 
    });
    element.addEventListener('mouseup', (e) => { 
        clearTimeout(timer); 
        if(selectionMode.bill || e.target.type === 'checkbox') return;
        if (!isLongPress) showBillDetails(index); 
        isLongPress = false; 
    });
    element.addEventListener('touchstart', (e) => { 
        if(selectionMode.bill || e.target.type === 'checkbox') return;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; isScrolling = false; isLongPress = false; 
        timer = setTimeout(() => { if (!isScrolling) { isLongPress = true; if(navigator.vibrate) navigator.vibrate(70); confirmDeleteBill(index); } }, 600); 
    }, {passive: true});
    element.addEventListener('touchmove', (e) => { if (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10) { isScrolling = true; clearTimeout(timer); } }, {passive: true});
    element.addEventListener('touchend', (e) => { 
        clearTimeout(timer); 
        if(selectionMode.bill || e.target.type === 'checkbox') return;
        if (!isScrolling && !isLongPress) showBillDetails(index); 
    });
}

// ----------------- دوال التحديد المتعدد -----------------
function toggleSelectionMode(type) {
    selectionMode[type] = !selectionMode[type];
    selectedItems[type].clear();
    if(type === 'bill') renderBillsList();
    else renderCustomerList('manage');
}

function toggleItemSelection(type, id, checkbox) {
    if(checkbox.checked) selectedItems[type].add(id);
    else selectedItems[type].delete(id);
}

function selectAllItems(type) {
    if(type === 'bill') {
        savedBills.forEach((_, idx) => selectedItems.bill.add(idx));
        renderBillsList();
    } else {
        customers.forEach(name => selectedItems.customer.add(name));
        renderCustomerList('manage');
    }
}

async function deleteSelectedItems(type) {
    if(selectedItems[type].size === 0) return showToast("لم يتم تحديد شيء");
    
    if(await confirmModal(`هل أنت متأكد من حذف ${selectedItems[type].size} عنصر؟`)) {
        if(type === 'bill') {
            // حذف الفواتير (نحذف من الأكبر للأصغر للحفاظ على الاندكس)
            const ids = Array.from(selectedItems[type]).sort((a,b)=>b-a);
            ids.forEach(idx => savedBills.splice(idx, 1));
            localStorage.setItem('savedBills', JSON.stringify(savedBills));
            selectedItems.bill.clear();
            renderBillsList(); // إعادة رسم دون إغلاق
        } else {
            // حذف الزبائن
            const namesToDelete = Array.from(selectedItems.customer);
            customers = customers.filter(c => !namesToDelete.includes(c));
            localStorage.setItem('customers', JSON.stringify(customers));
            selectedItems.customer.clear();
            renderCustomerList('manage'); // إعادة رسم دون إغلاق
        }
        showToast("✅ تم الحذف");
    }
}
// --------------------------------------------------------

async function confirmDeleteBill(index) { 
    if (await confirmModal("حذف هذه الفاتورة؟")) { 
        savedBills.splice(index, 1); 
        localStorage.setItem('savedBills', JSON.stringify(savedBills)); 
        renderBillsList(); // إعادة رسم دون إغلاق
    } 
}

function showBillDetails(index) {
    currentViewedBillIndex = index; const bill = savedBills[index]; getEl('detail-total').textContent = fmt(bill.total) + ' L.L.'; getEl('detail-date').textContent = bill.time;
    const container = getEl('bill-items-container'); container.innerHTML = '';
    let itemsHtml = '<table style="width:100%; font-size:12px; border-collapse:collapse;"><tr style="background:#eee; text-align:right;"><th style="padding:4px;">الصنف</th><th style="padding:4px;">العدد</th><th style="padding:4px;">السعر</th></tr>';
    const itemsList = Array.isArray(bill.items) ? bill.items : Object.values(bill.items);
    itemsList.forEach(item => { itemsHtml += `<tr style="border-bottom:1px solid #eee;"><td style="padding:6px; font-weight:bold;">${item.name}</td><td style="padding:6px; color:#bf360c;">${item.count}</td><td style="padding:6px;">${fmt(item.price)}</td></tr>`; });
    itemsHtml += '</table>'; container.innerHTML = itemsHtml; closeAllModals(); showModal('bill-details-modal');
}

async function clearAllHistory() { 
    if (await confirmModal("⚠️ مسح سجل الفواتير العامة؟<br><small>ملاحظة: الديون لن تُحذف.</small>")) { 
        savedBills = savedBills.filter(b => b.customName && b.customName.trim() !== "");
        localStorage.setItem('savedBills', JSON.stringify(savedBills)); 
        showToast("✅ تم مسح السجل العام");
        renderBillsList(); 
    } 
}

async function clearDailyReport() {
    if (await confirmModal("⚠️ تصفير العداد (شيفت جديد)؟")) {
        const today = new Date().toLocaleDateString('ar-LB');
        const standardDate = new Date().toLocaleDateString();
        savedBills = savedBills.filter(b => {
            const isToday = b.time.includes(today) || b.time.includes(standardDate);
            const hasCustomer = b.customName && b.customName !== "";
            return !isToday || hasCustomer;
        });
        localStorage.setItem('savedBills', JSON.stringify(savedBills));
        showToast("✅ تم تصفير العداد وبدء شيفت جديد");
        closeAllModals();
    }
}

// ========================
// الوظائف الأساسية
// ========================

function renderItems() { ['col1','col2','col3','col4'].forEach(colKey => { const colEl = getEl(colKey); colEl.innerHTML = ''; itemData[colKey].forEach((item, index) => { const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = item.name; if(item.price === 0 && item.name === "") { btn.style.opacity = "0.5"; btn.style.borderStyle = "dashed"; btn.textContent = ""; } if (item.color) btn.style.borderLeftColor = item.color; setupSmartButton(btn, colKey, index, item); colEl.appendChild(btn); }); }); getEl('rate-display').textContent = `سعر الصرف: ${fmt(rate)}`; }

function setupSmartButton(btn, colKey, index, item) {
    let timer; let startX, startY; let isScrolling = false; let isLongPress = false;
    btn.addEventListener('mousedown', () => { timer = setTimeout(async () => { isLongPress = true; if(!sortMode) await checkSettingsPassword(() => openEditModal(colKey, index)); }, 600); });
    btn.addEventListener('mouseup', () => { clearTimeout(timer); if (!isLongPress) { if (sortMode) handleSortSelection(colKey, index, btn); else add(item.name, item.price); } isLongPress = false; });
    btn.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; isScrolling = false; isLongPress = false; vibrate(btn);
        timer = setTimeout(async () => { if (!isScrolling) { isLongPress = true; if(!sortMode) await checkSettingsPassword(() => openEditModal(colKey, index)); } }, 600);
    }, {passive: true});
    btn.addEventListener('touchmove', (e) => { const moveX = Math.abs(e.touches[0].clientX - startX); const moveY = Math.abs(e.touches[0].clientY - startY); if (moveX > 10 || moveY > 10) { isScrolling = true; clearTimeout(timer); } }, {passive: true});
    btn.addEventListener('touchend', (e) => { clearTimeout(timer); if (isScrolling) return; if (isLongPress) return; e.preventDefault(); if (sortMode) handleSortSelection(colKey, index, btn); else add(item.name, item.price); });
}

function press(num) { vibrate(event.target); if(enteredNum === '0') enteredNum = ''; enteredNum += num; updateInputDisplay(); }
function updateInputDisplay() { getEl('input-box').textContent = enteredNum || '0'; }
function clearInput() { enteredNum = ''; customPriceMode = false; getEl('input-box').style.background = '#fff'; getEl('input-box').style.borderColor = '#e0e0e0'; updateInputDisplay(); }
function activatePrice() { vibrate(event.target); customPriceMode = true; getEl('input-box').style.background = '#fff9c4'; getEl('input-box').style.borderColor = '#fbc02d'; updateInputDisplay(); }
function add(name, defaultPrice) { let finalPrice = defaultPrice; let qty = 1; if (customPriceMode) { if (enteredNum && enteredNum !== '0') finalPrice = parseFloat(enteredNum); } else { if (enteredNum && enteredNum !== '0') qty = parseFloat(enteredNum); } total += (finalPrice * qty); const isCustom = (finalPrice !== defaultPrice); const key = name + (isCustom ? '_' + Date.now() : ''); if(!receiptData[key]) receiptData[key] = {name:name, price:0, count:0, unitPrice: finalPrice}; receiptData[key].price += (finalPrice * qty); receiptData[key].count += qty; enteredNum = ''; customPriceMode = false; getEl('input-box').style.background = '#fff'; getEl('input-box').style.borderColor = '#e0e0e0'; updateInputDisplay(); updateTotal(); renderReceipt(); }
function updateTotal() { getEl('total-lbp').textContent = `المجموع: ${fmt(total)}`; getEl('total-usd').textContent = `$${(total/rate).toFixed(2)}`; const count = Object.values(receiptData).reduce((a,b)=>a+b.count,0); getEl('total-items').textContent = `عدد الأصناف: ${count}`; }
function toggleReceipt() { const box = getEl('receipt'); box.classList.toggle('show'); renderReceipt(); }

function renderReceipt() { const box = getEl('receipt'); let html = `<div style="text-align:center;border-bottom:1px solid #eee;padding-bottom:5px;font-weight:bold;margin-bottom:5px;">قائمة الطلبات</div><div id="receipt-items-list" style="flex:1;overflow-y:auto;margin-bottom:10px;">`; for(const [key, item] of Object.entries(receiptData)) { html += `<div style="padding:6px 0; border-bottom:1px dashed #eee; display:flex; justify-content:space-between; font-size:11px; cursor:pointer;" onclick="removeItem('${key}', ${item.price})"><div><span>${item.name}</span>${item.count > 1 ? `<span style="color:#c62828;font-weight:bold">x${item.count}</span>` : ''}<div style="font-size:9px;color:#777">${fmt(item.unitPrice)}</div></div><span style="font-weight:bold">${fmt(item.price)}</span></div>`; } html += `</div>`; if(box.classList.contains('show')) { html += `<div style="border-top:2px solid #333; padding-top:8px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;"><span style="font-weight:900; font-size:14px;">المجموع:</span><span style="font-weight:900; font-size:15px; color:#bf360c">${fmt(total)}</span></div><div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-size:12px; color:#555;">بالدولار:</span><span style="font-weight:bold; font-size:14px; color:#2e7d32; font-family:sans-serif;">$${(total/rate).toFixed(2)}</span></div></div><div style="font-size:10px; margin-top:10px; font-weight:bold;">ملاحظة:</div><input type="text" value="${customerNote}" oninput="customerNote=this.value" placeholder="اكتب هنا..." style="width:100%; border:1px solid #ccc; padding:4px; font-size:12px; margin-top:2px; border-radius:4px;">`; } box.innerHTML = html; const list = document.getElementById('receipt-items-list'); if(list) list.scrollTop = list.scrollHeight; }
async function removeItem(key, price) { if(await confirmModal("حذف هذا الصنف؟")) { total -= price; delete receiptData[key]; updateTotal(); renderReceipt(); } }
async function saveBill() {
    if(total===0) return alertModal("الفاتورة فارغة");
    let finalName = selectedCustomerForBill;
    savedBills.push({ time: new Date().toLocaleString('ar-LB'), total: total, note: customerNote, customName: finalName, items: JSON.parse(JSON.stringify(receiptData)) });
    localStorage.setItem('savedBills', JSON.stringify(savedBills));
    reset(); 
    showToast(`✅ تم الحفظ باسم: ${finalName || 'عام'}`);
}
function reset() { vibrate(event.target); total = 0; receiptData = {}; customerNote = ""; selectedCustomerForBill = null; getEl('customer-display').style.display = 'none'; clearInput(); updateTotal(); getEl('receipt').innerHTML=''; getEl('receipt').classList.remove('show'); }

// ========================
// الدفع المطور (4 خيارات)
// ========================

function openPay() { 
    if(total===0) return alertModal("لا يوجد طلبات!"); 
    // تصفير الخانات
    getEl('pay-usd').value=''; 
    getEl('pay-lbp').value=''; 
    getEl('returned-usd').value=''; 
    getEl('returned-lbp').value=''; 
    calcPay(); 
    showModal('pay-box-modal'); 
    
    // فتح الكيبورد تلقائياً على أول مربع
    setTimeout(() => { getEl('pay-usd').focus(); }, 100);
}

function calcPay() { 
    const pUsd = Number(getEl('pay-usd').value)||0; 
    const pLbp = Number(getEl('pay-lbp').value)||0; 
    const rUsd = Number(getEl('returned-usd').value)||0; 
    const rLbp = Number(getEl('returned-lbp').value)||0; 
    
    // المبلغ الذي أعطاه الزبون بالليرة
    const totalGiven = (pUsd * rate) + pLbp;
    // المبلغ الذي أرجعه الكاشير بالليرة
    const totalReturned = (rUsd * rate) + rLbp;
    
    // الصافي الذي دخل الصندوق
    const netPaid = totalGiven - totalReturned;
    
    // الفرق بين قيمة الفاتورة والصافي
    // اذا موجب: يعني الزبون لسه عليه مصاري
    // اذا سالب: يعني الزبون دفع زيادة (باقي له)
    // اذا صفر: خالص
    const diff = total - netPaid;
    
    const statusEl = getEl('pay-status-msg');
    const displayEl = getEl('pay-balance-display');
    
    if (Math.abs(diff) < 500) { // هامش صغير جداً يعتبر خالص
        statusEl.textContent = "✅ خالص (Balanced)";
        statusEl.style.color = "#2e7d32";
        displayEl.value = "0 L.L.";
        displayEl.style.background = "#e8f5e9";
        displayEl.style.color = "#2e7d32";
    } else if (diff > 0) {
        // الزبون لسه عليه
        statusEl.textContent = "⚠️ باقي عليه (Remaining):";
        statusEl.style.color = "#c62828";
        displayEl.value = fmt(Math.ceil(diff/500)*500) + " L.L.";
        displayEl.style.background = "#ffebee";
        displayEl.style.color = "#c62828";
    } else {
        // الزبون له باقي
        statusEl.textContent = "💰 باقي للزبون (Change Due):";
        statusEl.style.color = "#1565c0";
        displayEl.value = fmt(Math.abs(Math.round(diff/500)*500)) + " L.L.";
        displayEl.style.background = "#e3f2fd";
        displayEl.style.color = "#1565c0";
    }
}

// ========================
// الإعدادات وغيرها
// ========================

function openSettings() { checkSettingsPassword(() => { updatePassBtn(); showModal('settings-modal'); }); }
async function checkSettingsPassword(callback) { if(!settingsPassword) return callback(); const p = await promptModal("🔒 كلمة المرور:", true); if(p === settingsPassword) callback(); else if(p !== null) alertModal("❌ كلمة المرور خاطئة"); }
async function managePassword() { closeAllModals(); if(settingsPassword) { const p = await promptModal("كلمة المرور الحالية:", true); if(p === settingsPassword) { localStorage.removeItem('settingsPassword'); settingsPassword = null; await alertModal("✅ تم إلغاء الحماية"); openSettings(); } else if(p !== null) { await alertModal("❌ خطأ"); openSettings(); } } else { const newP = await promptModal("كلمة مرور جديدة:", true); if(newP) { localStorage.setItem('settingsPassword', newP); settingsPassword = newP; await alertModal("✅ تمت الحماية"); openSettings(); } } }
function updatePassBtn() { const btn = getEl('pass-btn'); if(settingsPassword) { btn.innerHTML = '<span class="icon">🔓</span> إلغاء كلمة المرور'; btn.style.background = '#ffebee'; btn.style.color = '#c62828'; btn.style.borderColor = '#ffcdd2'; } else { btn.innerHTML = '<span class="icon">🔒</span> حماية الإعدادات'; btn.style.background = '#e3f2fd'; btn.style.color = '#0d47a1'; btn.style.borderColor = '#bbdefb'; } }
function openAddItemModal() { closeAllModals(); getEl('new-item-name').value = ''; getEl('new-item-price').value = ''; selectCol('col1'); showModal('add-item-modal'); }
function selectCol(col) { selectedColForAdd = col; ['col1','col2','col3','col4'].forEach(c => { getEl('btn-'+c).style.background = (c===col) ? '#c8e6c9' : '#fff'; }); }
function confirmAddItem() { const name = getEl('new-item-name').value.trim(); const price = Number(getEl('new-item-price').value); if(!name) return alertModal("الاسم مطلوب!"); itemData[selectedColForAdd].push({name, price}); saveData(); closeAllModals(); alertModal("✅ تم إضافة الصنف"); }
function toggleSortMode() { closeAllModals(); sortMode = !sortMode; sortFirstSelection = null; getEl('sort-indicator').style.display = sortMode ? 'flex' : 'none'; if(sortMode) renderItems(); }
function handleSortSelection(col, index, btn) { vibrate(btn); if (!sortFirstSelection) { sortFirstSelection = {col, index}; btn.classList.add('sorting-selected'); } else { const s1 = sortFirstSelection; const temp = itemData[s1.col][s1.index]; itemData[s1.col][s1.index] = itemData[col][index]; itemData[col][index] = temp; sortFirstSelection = null; saveData(); } }
function openEditModal(col, idx) { currentEditCol = col; currentEditIndex = idx; const item = itemData[col][idx]; getEl('edit-name').value = item.name; getEl('edit-price').value = item.price; closeAllModals(); showModal('edit-modal'); }
function saveItemEdit() { const name = getEl('edit-name').value; const price = Number(getEl('edit-price').value); if(!name) return; itemData[currentEditCol][currentEditIndex] = { ...itemData[currentEditCol][currentEditIndex], name, price }; saveData(); closeAllModals(); }
async function deleteItem() { if(await confirmModal("حذف الصنف نهائياً؟")) { itemData[currentEditCol].splice(currentEditIndex, 1); saveData(); closeAllModals(); } }
async function changeExchangeRate() { closeAllModals(); const val = await promptModal(`السعر الحالي: ${fmt(rate)}`, false); if(val && !isNaN(val)) { rate = parseFloat(val); localStorage.setItem('exchangeRate', rate); renderItems(); updateTotal(); } }
function showDailyReport() { closeAllModals(); openDailyReportModal(); }
function openDailyReportModal() {
    const today = new Date().toLocaleDateString('ar-LB');
    const dayBills = savedBills.filter(b => b.time.includes(today) || b.time.includes(new Date().toLocaleDateString()));
    const totalCash = dayBills.reduce((a,b)=>a+b.total,0);
    const content = `<div style="text-align:center; padding:10px;"><div style="font-size:14px; color:#555; margin-bottom:5px;">التاريخ: ${today}</div><div style="font-size:16px; font-weight:bold; margin-bottom:15px;">عدد العمليات: ${dayBills.length}</div><div style="font-size:24px; font-weight:900; color:#2e7d32; margin-bottom:5px;">${fmt(totalCash)} L.L.</div><div style="font-size:14px; color:#555;">($${(totalCash/rate).toFixed(2)})</div></div>`;
    getEl('daily-report-content').innerHTML = content;
    showModal('daily-report-modal');
}
async function renameCurrentBill() { if (currentViewedBillIndex === null) return; const newName = await promptModal("اسم الفاتورة / الزبون:", false); if (newName !== null) { savedBills[currentViewedBillIndex].customName = newName; localStorage.setItem('savedBills', JSON.stringify(savedBills)); alertModal("✅ تم تعديل الاسم"); renderBillsList(); } }

function exportDataAndCopy() { getEl('json-area').value = JSON.stringify(itemData); closeAllModals(); showModal('json-modal'); }
function doCopy() { getEl('json-area').select(); document.execCommand('copy'); alertModal("تم النسخ!"); }
async function openJsonImport() { closeAllModals(); const data = await promptModal("الصق الكود هنا:"); if(data) { try { itemData = JSON.parse(data); saveData(); alertModal("تم الاسترجاع!"); } catch(e) { alertModal("كود خاطئ"); } } }
async function clearAllData() { if(await confirmModal("حذف كل شيء؟")) { localStorage.clear(); location.reload(); } }
function saveData() { localStorage.setItem('itemData', JSON.stringify(itemData)); renderItems(); }
function showModal(id) { getEl(id).style.display='flex'; }
function closeAllModals() { document.querySelectorAll('.custom-modal').forEach(e => e.style.display='none'); }
function alertModal(msg) { getEl('alert-msg').innerHTML = msg; showModal('custom-alert'); return new Promise(r => getEl('alert-ok').onclick = () => { closeAllModals(); r(); }); }
function confirmModal(msg) { getEl('confirm-msg').innerHTML = msg; showModal('custom-confirm'); return new Promise(r => { getEl('confirm-yes').onclick = () => { closeAllModals(); r(true); }; getEl('confirm-no').onclick = () => { closeAllModals(); r(false); }; }); }
function promptModal(msg, isPass) { getEl('prompt-msg').innerHTML = msg; const inp = getEl('prompt-input'); inp.value=''; inp.type=isPass?'password':'text'; showModal('custom-prompt'); inp.focus(); return new Promise(r => { getEl('prompt-ok').onclick = () => { closeAllModals(); r(inp.value); }; getEl('prompt-cancel').onclick = () => { closeAllModals(); r(null); }; }); }

window.onload = renderItems;