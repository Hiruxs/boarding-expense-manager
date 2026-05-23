import {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy
} from './firebase-config.js';

let allMembers = [];
let editingExpenseId = null; // null = adding new, otherwise editing this expense
let allCategories = [];
let currentUser = null; // { name, username }

// ============================================================
// AUTHENTICATION
// ============================================================
function checkAuth() {
  const stored = localStorage.getItem('boardingUser') || sessionStorage.getItem('boardingUser');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      showApp();
      return true;
    } catch (e) {
      localStorage.removeItem('boardingUser');
      sessionStorage.removeItem('boardingUser');
    }
  }
  return false;
}

function showApp() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('userApp').classList.remove('hidden');
  document.getElementById('welcomeName').textContent = currentUser.name;
  loadMembers();
  loadCategories();
  loadDashboard();
}

document.getElementById('userLoginBtn').addEventListener('click', login);
document.getElementById('userPassword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') login();
});
document.getElementById('userUsername').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('userPassword').focus();
});

async function login() {
  const username = document.getElementById('userUsername').value.trim().toLowerCase();
  const password = document.getElementById('userPassword').value.trim();
  const stayLogged = document.getElementById('staySignedIn').checked;
  const errEl = document.getElementById('userLoginError');

  if (!username || !password) {
    errEl.textContent = 'Please enter username and password';
    return;
  }

  errEl.textContent = 'Checking...';

  try {
    const snapshot = await getDocs(collection(db, 'members'));
    const member = snapshot.docs.find(d => {
      const data = d.data();
      return (data.username || '').toLowerCase() === username && data.password === password;
    });

    if (!member) {
      errEl.textContent = '❌ Invalid username or password';
      return;
    }

    const data = member.data();
    currentUser = { name: data.name, username: data.username };

    if (stayLogged) {
      localStorage.setItem('boardingUser', JSON.stringify(currentUser));
    } else {
      sessionStorage.setItem('boardingUser', JSON.stringify(currentUser));
    }

    showApp();
  } catch (err) {
    errEl.textContent = 'Error: ' + err.message;
  }
}

document.getElementById('userLogoutBtn').addEventListener('click', () => {
  localStorage.removeItem('boardingUser');
  sessionStorage.removeItem('boardingUser');
  currentUser = null;
  location.reload();
});

// ============================================================
// VIEW TOGGLE (Dashboard <-> Form)
// ============================================================
document.getElementById('openFormBtn').addEventListener('click', () => {
  editingExpenseId = null; // fresh add, not edit
  document.getElementById('formTitle').textContent = 'Add New Expense';
  document.getElementById('submitBtn').textContent = '💾 Save Expense';
  // Hide ALL views (dashboard AND history) before showing the form
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('historyView').classList.add('hidden');
  document.getElementById('formView').classList.remove('hidden');
  resetForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('closeFormBtn').addEventListener('click', () => {
  showDashboard();
});

function showDashboard() {
  document.getElementById('formView').classList.add('hidden');
  document.getElementById('historyView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  // Reset the view tabs so Dashboard is marked active
  document.querySelectorAll('.user-tabs .utab').forEach(t => {
    t.classList.toggle('active', t.dataset.utab === 'dashboard');
  });
  loadDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Open the form pre-filled to EDIT an existing expense
function openEditForm(expense) {
  editingExpenseId = expense.id;

  // Hide other views, show form
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('historyView').classList.add('hidden');
  document.getElementById('formView').classList.remove('hidden');

  // Switch form to edit mode
  document.getElementById('formTitle').textContent = '✏️ Edit Expense';
  document.getElementById('submitBtn').textContent = '💾 Update Expense';

  // Pre-fill fields
  document.getElementById('payerSelect').value = expense.payer;
  document.getElementById('description').value = expense.description;
  document.getElementById('amount').value = expense.amount;

  // Category
  const catSelect = document.getElementById('categorySelect');
  const catOption = Array.from(catSelect.options).find(o => o.value === (expense.category || 'Other'));
  catSelect.value = catOption ? (expense.category || 'Other') : 'Other';

  // Date
  document.getElementById('expenseDate').value = expense.expenseDate
    || (expense.createdAt ? expense.createdAt.split('T')[0] : getTodayLocal());

  // Checkboxes — tick the members in sharedWith
  document.querySelectorAll('#membersCheckboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = (expense.sharedWith || []).includes(cb.value);
  });

  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
// LOAD MEMBERS
// ============================================================
async function loadMembers() {
  try {
    const snapshot = await getDocs(collection(db, 'members'));
    allMembers = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));

    if (allMembers.length === 0) {
      document.getElementById('dashboardView').innerHTML = `
        <div class="card-form">
          <h2>⚠️ No members yet</h2>
          <p>Ask the admin to add members first.</p>
          <a href="index.html" class="btn-primary">Back to Home</a>
        </div>
      `;
      document.getElementById('openFormBtn').style.display = 'none';
      return;
    }

    buildFormFields();
  } catch (err) {
    alert('Error loading members: ' + err.message);
  }
}

function buildFormFields() {
  const payerSelect = document.getElementById('payerSelect');
  payerSelect.innerHTML = '<option value="">-- Select payer --</option>';
  allMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.name;
    opt.textContent = m.name;
    if (m.name === currentUser.name) opt.selected = true;
    payerSelect.appendChild(opt);
  });

  const checkboxContainer = document.getElementById('membersCheckboxes');
  checkboxContainer.innerHTML = '';
  allMembers.forEach(m => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const isCurrentUser = m.name === currentUser.name;
    label.innerHTML = `
      <input type="checkbox" value="${escapeAttr(m.name)}" ${isCurrentUser ? 'checked' : ''} />
      <span>${escapeHtml(m.name)}${isCurrentUser ? ' (you)' : ''}</span>
    `;
    checkboxContainer.appendChild(label);
  });

  document.getElementById('payerSelect').addEventListener('change', updatePreview);
  document.getElementById('amount').addEventListener('input', updatePreview);
  checkboxContainer.querySelectorAll('input[type="checkbox"]')
    .forEach(cb => cb.addEventListener('change', updatePreview));
}

// ============================================================
// LOAD CATEGORIES (populate dropdown)
// ============================================================
async function loadCategories() {
  try {
    const snapshot = await getDocs(collection(db, 'categories'));
    allCategories = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        // "Other" always last
        if (a.name === 'Other') return 1;
        if (b.name === 'Other') return -1;
        return a.name.localeCompare(b.name);
      });

    // If no categories exist yet, fall back to "Other" only
    if (allCategories.length === 0) {
      allCategories = [{ id: 'fallback', name: 'Other', icon: '📦' }];
    }

    const select = document.getElementById('categorySelect');
    select.innerHTML = '';
    allCategories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name;
      opt.dataset.icon = cat.icon || '🏷️';
      opt.textContent = `${cat.icon || '🏷️'}  ${cat.name}`;
      if (cat.name === 'Other') opt.selected = true; // Default
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

function getCategoryIcon(name) {
  const cat = allCategories.find(c => c.name === name);
  return cat ? (cat.icon || '🏷️') : '📦';
}

function resetForm() {
  document.getElementById('description').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('payerSelect').value = currentUser.name;
  // Set date to today (local timezone)
  document.getElementById('expenseDate').value = getTodayLocal();
  // Reset category to "Other" (default)
  const catSelect = document.getElementById('categorySelect');
  const otherOption = Array.from(catSelect.options).find(o => o.value === 'Other');
  if (otherOption) catSelect.value = 'Other';
  document.querySelectorAll('#membersCheckboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = (cb.value === currentUser.name);
  });
  document.getElementById('preview').classList.add('hidden');
  document.getElementById('message').textContent = '';
  document.getElementById('message').className = 'message';
}

// Returns today's date as YYYY-MM-DD in local timezone (for <input type="date">)
function getTodayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().split('T')[0];
}

// ============================================================
// DASHBOARD: Calculate balance & breakdown
// ============================================================
async function loadDashboard() {
  const balanceLabel = document.getElementById('balanceLabel');
  const balanceAmount = document.getElementById('balanceAmount');
  const balanceSub = document.getElementById('balanceSub');
  const balanceHero = document.getElementById('balanceHero');
  const breakdownList = document.getElementById('breakdownList');
  const pendingBox = document.getElementById('pendingConfirmations');

  balanceLabel.textContent = 'Loading...';
  balanceAmount.textContent = '';
  balanceSub.textContent = '';
  breakdownList.innerHTML = '<p class="loading">Calculating...</p>';
  pendingBox.classList.add('hidden');
  pendingBox.innerHTML = '';

  try {
    const [expensesSnap, settlementsSnap, pendingSnap] = await Promise.all([
      getDocs(collection(db, 'expenses')),
      getDocs(collection(db, 'settlements')),
      getDocs(collection(db, 'pendingSettlements'))
    ]);

    const me = currentUser.name;
    const debts = {};

    // Process expenses → build debts
    expensesSnap.forEach(docSnap => {
      const e = docSnap.data();
      const payer = e.payer;
      const amount = parseFloat(e.amount);
      const shared = e.sharedWith || [];
      if (shared.length === 0) return;
      const sharePerPerson = amount / shared.length;

      shared.forEach(person => {
        if (person !== payer) {
          if (!debts[person]) debts[person] = {};
          if (!debts[person][payer]) debts[person][payer] = 0;
          debts[person][payer] += sharePerPerson;
        }
      });
    });

    // Apply confirmed settlements
    settlementsSnap.forEach(docSnap => {
      const s = docSnap.data();
      const from = s.from;
      const to = s.to;
      const amount = parseFloat(s.amount);
      if (debts[from] && debts[from][to]) {
        debts[from][to] -= amount;
        if (debts[from][to] <= 0.01) delete debts[from][to];
      }
    });

    // Process pending settlements
    // pendingByDebtor[from][to] = { id, amount } — I claimed I paid this
    // pendingByCreditor[to][from] = { id, amount } — Someone claims they paid me
    const pendingByDebtor = {};
    const pendingByCreditor = {};

    pendingSnap.forEach(docSnap => {
      const p = docSnap.data();
      const id = docSnap.id;
      const from = p.from;
      const to = p.to;
      const amount = parseFloat(p.amount);

      if (!pendingByDebtor[from]) pendingByDebtor[from] = {};
      pendingByDebtor[from][to] = { id, amount, isPartial: !!p.isPartial };

      if (!pendingByCreditor[to]) pendingByCreditor[to] = {};
      pendingByCreditor[to][from] = { id, amount, isPartial: !!p.isPartial };

      // Pending payments visually reduce the debt
      if (debts[from] && debts[from][to]) {
        debts[from][to] -= amount;
        if (debts[from][to] <= 0.01) delete debts[from][to];
      }
    });

    // Build breakdown for current user
    const userBreakdown = [];
    const processedPairs = new Set();
    const others = new Set();

    for (const debtor in debts) {
      if (debtor === me) Object.keys(debts[debtor]).forEach(c => others.add(c));
      for (const creditor in debts[debtor]) {
        if (creditor === me) others.add(debtor);
      }
    }

    others.forEach(other => {
      const key = [me, other].sort().join('|');
      if (processedPairs.has(key)) return;
      processedPairs.add(key);

      const iOwe = (debts[me] && debts[me][other]) || 0;
      const owesMe = (debts[other] && debts[other][me]) || 0;
      const net = owesMe - iOwe;

      if (Math.abs(net) < 0.01) return;
      if (net > 0) {
        userBreakdown.push({ other, type: 'owes_you', amount: net });
      } else {
        userBreakdown.push({ other, type: 'you_owe', amount: -net });
      }
    });

    // Add "waiting" entries for MY pending claims (I claimed I paid someone)
    const myPendingClaims = pendingByDebtor[me] || {};
    Object.entries(myPendingClaims).forEach(([creditor, info]) => {
      userBreakdown.push({
        other: creditor,
        type: 'waiting',
        amount: info.amount,
        pendingId: info.id,
        isPartial: info.isPartial
      });
    });

    // Net total — only count confirmed debts (NOT pending/waiting)
    let netTotal = 0;
    userBreakdown.forEach(b => {
      if (b.type === 'owes_you') netTotal += b.amount;
      else if (b.type === 'you_owe') netTotal -= b.amount;
    });

    // Render hero card
    balanceHero.className = 'balance-hero';
    if (Math.abs(netTotal) < 0.01) {
      balanceHero.classList.add('settled');
      balanceLabel.textContent = '🎉 All Settled!';
      balanceAmount.textContent = 'Rs. 0.00';
      balanceSub.textContent = 'You don\'t owe anyone, and no one owes you.';
    } else if (netTotal > 0) {
      balanceHero.classList.add('positive');
      balanceLabel.textContent = '💚 You should get back';
      balanceAmount.textContent = `Rs. ${netTotal.toFixed(2)}`;
      balanceSub.textContent = `From ${userBreakdown.filter(b => b.type === 'owes_you').length} people`;
    } else {
      balanceHero.classList.add('negative');
      balanceLabel.textContent = '💸 You should pay';
      balanceAmount.textContent = `Rs. ${Math.abs(netTotal).toFixed(2)}`;
      balanceSub.textContent = `To ${userBreakdown.filter(b => b.type === 'you_owe').length} people`;
    }

    // ============ RENDER INCOMING PENDING CONFIRMATIONS ============
    const incomingPending = pendingByCreditor[me] || {};
    const incomingEntries = Object.entries(incomingPending);

    if (incomingEntries.length > 0) {
      pendingBox.classList.remove('hidden');
      pendingBox.innerHTML = '<h3 class="pending-title">📩 Pending Confirmations</h3>';

      incomingEntries.forEach(([debtor, info]) => {
        const card = document.createElement('div');
        card.className = 'pending-card';
        card.innerHTML = `
          <div class="pending-text">
            <strong>${escapeHtml(debtor)}</strong> says they paid you
            <span class="pending-amount">Rs. ${info.amount.toFixed(2)}</span>
          </div>
          <div class="pending-actions">
            <button class="btn-confirm">✓ Confirm Received</button>
            <button class="btn-reject">✕ Reject</button>
          </div>
        `;
        card.querySelector('.btn-confirm').addEventListener('click', () =>
          confirmReceived(info.id, debtor, me, info.amount));
        card.querySelector('.btn-reject').addEventListener('click', () =>
          rejectPayment(info.id, debtor, info.amount));
        pendingBox.appendChild(card);
      });
    }

    // ============ RENDER BREAKDOWN ============
    if (userBreakdown.length === 0) {
      breakdownList.innerHTML = '<p class="empty">No pending settlements 🎉</p>';
    } else {
      breakdownList.innerHTML = '';

      // Sort: waiting first, then you_owe, then owes_you
      const order = { 'waiting': 0, 'you_owe': 1, 'owes_you': 2 };
      userBreakdown.sort((a, b) => {
        if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
        return b.amount - a.amount;
      });

      userBreakdown.forEach(b => {
        const row = document.createElement('div');

        if (b.type === 'waiting') {
          row.className = 'breakdown-row waiting';
          const partialTag = b.isPartial
            ? '<span class="partial-tag">partial</span>'
            : '';
          row.innerHTML = `
            <span class="bd-icon">⏳</span>
            <span class="bd-text">Paid <strong>${escapeHtml(b.other)}</strong> · awaiting confirm ${partialTag}</span>
            <span class="bd-amount">Rs. ${b.amount.toFixed(2)}</span>
            <button class="btn-cancel-pay">Cancel</button>
          `;
          row.querySelector('.btn-cancel-pay').addEventListener('click', () =>
            cancelPendingPayment(b.pendingId, b.other, b.amount));
        } else if (b.type === 'you_owe') {
          row.className = 'breakdown-row owe';
          // Is there a pending partial payment to this same person? Then this is the remaining.
          const hasPending = (pendingByDebtor[me] && pendingByDebtor[me][b.other]);
          const label = hasPending
            ? `Still to pay <strong>${escapeHtml(b.other)}</strong>`
            : `You owe <strong>${escapeHtml(b.other)}</strong>`;
          row.innerHTML = `
            <span class="bd-icon">💸</span>
            <span class="bd-text">${label}</span>
            <span class="bd-amount">Rs. ${b.amount.toFixed(2)}</span>
            <button class="btn-mark-paid">✓ Mark as Paid</button>
          `;
          row.querySelector('.btn-mark-paid').addEventListener('click', () =>
            markAsPaid(b.other, b.amount));
        } else {
          row.className = 'breakdown-row owed';
          row.innerHTML = `
            <span class="bd-icon">💰</span>
            <span class="bd-text"><strong>${escapeHtml(b.other)}</strong> owes you</span>
            <span class="bd-amount">Rs. ${b.amount.toFixed(2)}</span>
          `;
        }
        breakdownList.appendChild(row);
      });
    }

    loadRecent();
    loadCategoryBreakdown();

  } catch (err) {
    breakdownList.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

// ============================================================
// SETTLEMENT ACTIONS (debtor side)
// ============================================================

// Debtor clicks "Mark as Paid" → creates pending claim
async function markAsPaid(creditor, suggestedAmount) {
  const input = prompt(
    `You owe ${creditor} Rs. ${suggestedAmount.toFixed(2)}.\n\n` +
    `How much did you pay?\n` +
    `• Enter the full amount to settle completely\n` +
    `• Enter a smaller amount for a partial payment (the rest stays as "to pay")`,
    suggestedAmount.toFixed(2)
  );
  if (input === null) return;

  const amount = parseFloat(input);
  if (isNaN(amount) || amount <= 0) {
    return alert('Invalid amount. Please enter a number greater than 0.');
  }
  if (amount > suggestedAmount + 0.01) {
    if (!confirm(`You're claiming Rs. ${amount.toFixed(2)} but you only owe Rs. ${suggestedAmount.toFixed(2)}.\nContinue anyway?`)) return;
  }

  const remaining = Math.max(0, suggestedAmount - amount);
  const isPartial = remaining > 0.01;

  // Build a clear confirmation message
  let confirmMsg = `Confirm payment to ${creditor}:\n\n`;
  confirmMsg += `💸 Paying now: Rs. ${amount.toFixed(2)}\n`;
  if (isPartial) {
    confirmMsg += `⏳ Remaining to pay: Rs. ${remaining.toFixed(2)}\n\n`;
    confirmMsg += `${creditor} will confirm the Rs. ${amount.toFixed(2)}. The remaining Rs. ${remaining.toFixed(2)} will stay on your dashboard as still owed.`;
  } else {
    confirmMsg += `✅ This fully settles your debt to ${creditor}.`;
  }

  if (!confirm(confirmMsg)) return;

  try {
    await addDoc(collection(db, 'pendingSettlements'), {
      from: currentUser.name,
      to: creditor,
      amount: amount,
      claimedAt: new Date().toISOString(),
      status: 'pending',
      isPartial: isPartial,
      remainingAtClaim: remaining
    });

    if (isPartial) {
      alert(`✅ Partial payment marked.\n\nPaid: Rs. ${amount.toFixed(2)}\nStill to pay: Rs. ${remaining.toFixed(2)}\n\n${creditor} will confirm the amount you paid.`);
    } else {
      alert(`✅ Full payment marked.\n${creditor} will be asked to confirm receipt of Rs. ${amount.toFixed(2)}.`);
    }
    loadDashboard();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Debtor cancels their pending claim
async function cancelPendingPayment(pendingId, creditor, amount) {
  if (!confirm(`Cancel your payment claim of Rs. ${amount.toFixed(2)} to ${creditor}?\n\nThe debt will reappear on your dashboard.`)) return;
  try {
    await deleteDoc(doc(db, 'pendingSettlements', pendingId));
    loadDashboard();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// SETTLEMENT ACTIONS (creditor side)
// ============================================================

async function confirmReceived(pendingId, from, to, amount) {
  if (!confirm(`Confirm: You received Rs. ${amount.toFixed(2)} from ${from}?`)) return;

  try {
    // 1. Create permanent settlement record
    await addDoc(collection(db, 'settlements'), {
      from: from,
      to: to,
      amount: amount,
      settledAt: new Date().toISOString(),
      type: 'individual',
      confirmedBy: currentUser.username
    });
    // 2. Remove pending claim
    await deleteDoc(doc(db, 'pendingSettlements', pendingId));
    alert('✅ Payment confirmed and recorded!');
    loadDashboard();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rejectPayment(pendingId, from, amount) {
  if (!confirm(`Reject ${from}'s claim of Rs. ${amount.toFixed(2)}?\n\nThe debt will reappear on their dashboard.`)) return;
  try {
    await deleteDoc(doc(db, 'pendingSettlements', pendingId));
    alert(`❌ Payment claim rejected. ${from} will see the debt again.`);
    loadDashboard();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// LIVE PREVIEW
// ============================================================
function updatePreview() {
  const payer = document.getElementById('payerSelect').value;
  const amount = parseFloat(document.getElementById('amount').value);
  const selected = getSelectedMembers();
  const preview = document.getElementById('preview');
  const previewContent = document.getElementById('previewContent');

  if (!payer || !amount || amount <= 0 || selected.length === 0) {
    preview.classList.add('hidden');
    return;
  }

  const share = amount / selected.length;
  const others = selected.filter(s => s !== payer);

  let html = `
    <div class="preview-row">
      <span>💵 Total:</span>
      <strong>Rs. ${amount.toFixed(2)}</strong>
    </div>
    <div class="preview-row">
      <span>👥 Split among:</span>
      <strong>${selected.length} people</strong>
    </div>
    <div class="preview-row">
      <span>📊 Each person's share:</span>
      <strong>Rs. ${share.toFixed(2)}</strong>
    </div>
  `;

  if (others.length > 0 && selected.includes(payer)) {
    html += `
      <div class="preview-divider"></div>
      <p class="preview-note">✅ ${escapeHtml(payer)} (payer) owes nothing more.</p>
      <p class="preview-note">The following will owe ${escapeHtml(payer)}:</p>
      <ul class="preview-debts">
        ${others.map(o => `<li><strong>${escapeHtml(o)}</strong> owes Rs. ${share.toFixed(2)}</li>`).join('')}
      </ul>
    `;
  } else if (!selected.includes(payer)) {
    html += `
      <div class="preview-divider"></div>
      <p class="preview-note">⚠️ Payer (${escapeHtml(payer)}) is not in the split.</p>
      <p class="preview-note">All selected members owe ${escapeHtml(payer)}:</p>
      <ul class="preview-debts">
        ${selected.map(o => `<li><strong>${escapeHtml(o)}</strong> owes Rs. ${share.toFixed(2)}</li>`).join('')}
      </ul>
    `;
  }

  previewContent.innerHTML = html;
  preview.classList.remove('hidden');
}

function getSelectedMembers() {
  return Array.from(
    document.querySelectorAll('#membersCheckboxes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}

// ============================================================
// SUBMIT EXPENSE
// ============================================================
document.getElementById('submitBtn').addEventListener('click', async () => {
  const payer = document.getElementById('payerSelect').value;
  const description = document.getElementById('description').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const sharedWith = getSelectedMembers();
  const category = document.getElementById('categorySelect').value || 'Other';
  const categoryIcon = getCategoryIcon(category);
  const dateValue = document.getElementById('expenseDate').value;

  if (!payer) return showMsg('Please select who paid', 'error');
  if (!description) return showMsg('Please enter a description', 'error');
  if (!category) return showMsg('Please select a category', 'error');
  if (!amount || amount <= 0) return showMsg('Please enter a valid amount', 'error');
  if (!dateValue) return showMsg('Please select a date', 'error');
  if (sharedWith.length === 0) return showMsg('Please tick at least one member to split with', 'error');

  // Build the expense date. Combine chosen date with current time so multiple
  // expenses on the same day still sort in the order they were entered.
  const now = new Date();
  const chosen = new Date(dateValue + 'T00:00:00');
  chosen.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const expenseDateISO = chosen.toISOString();

  try {
    document.getElementById('submitBtn').disabled = true;
    showMsg(editingExpenseId ? 'Updating...' : 'Saving...', 'info');

    if (editingExpenseId) {
      // UPDATE existing expense
      await updateDoc(doc(db, 'expenses', editingExpenseId), {
        payer: payer,
        description: description,
        amount: amount,
        sharedWith: sharedWith,
        category: category,
        categoryIcon: categoryIcon,
        expenseDate: dateValue,
        createdAt: expenseDateISO,
        editedAt: now.toISOString()
      });
      showMsg('✅ Expense updated! Returning to dashboard...', 'success');
    } else {
      // ADD new expense
      await addDoc(collection(db, 'expenses'), {
        payer: payer,
        description: description,
        amount: amount,
        sharedWith: sharedWith,
        category: category,
        categoryIcon: categoryIcon,
        addedBy: currentUser.username,
        expenseDate: dateValue,
        createdAt: expenseDateISO,
        submittedAt: now.toISOString()
      });
      showMsg('✅ Expense saved! Returning to dashboard...', 'success');
    }

    editingExpenseId = null;
    setTimeout(() => showDashboard(), 1000);
  } catch (err) {
    showMsg('Error: ' + err.message, 'error');
  } finally {
    document.getElementById('submitBtn').disabled = false;
  }
});

function showMsg(text, type) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.className = 'message ' + type;
}

// ============================================================
// MY RECENT EXPENSES
// ============================================================
async function loadRecent() {
  const list = document.getElementById('recentList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const myExpenses = snapshot.docs.filter(d => d.data().payer === currentUser.name);

    if (myExpenses.length === 0) {
      list.innerHTML = '<p class="empty">You haven\'t added any expenses yet. Tap ➕ Add to get started!</p>';
      return;
    }

    list.innerHTML = '';
    let count = 0;
    myExpenses.forEach(docSnap => {
      if (count >= 5) return;
      count++;
      const e = docSnap.data();
      const date = formatExpenseDate(e);
      const share = (e.amount / e.sharedWith.length).toFixed(2);
      const categoryBadge = e.category
        ? `<span class="category-badge"><span>${escapeHtml(e.categoryIcon || '🏷️')}</span> ${escapeHtml(e.category)}</span>`
        : `<span class="category-badge uncategorized">📦 Uncategorized</span>`;

      const item = document.createElement('div');
      item.className = 'expense-card';
      item.innerHTML = `
        <div class="expense-header">
          <strong>${escapeHtml(e.description)}</strong>
          <span class="amount">Rs. ${e.amount.toFixed(2)}</span>
        </div>
        <div class="expense-meta">
          ${categoryBadge}
          <span>📅 ${date}</span>
        </div>
        <div class="expense-shares">
          <span class="shares-label">Each share: Rs. ${share} (${e.sharedWith.length} people)</span>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

// ============================================================
// UTILS
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return String(text).replace(/"/g, '&quot;');
}

// Format an expense's date for display. Prefers the user-chosen expenseDate
// (YYYY-MM-DD), falling back to createdAt for older records.
function formatExpenseDate(e) {
  if (e.expenseDate) {
    const d = new Date(e.expenseDate + 'T00:00:00');
    return d.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Date(e.createdAt).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================
// CATEGORY BREAKDOWN (current month, where current user is involved)
// ============================================================
async function loadCategoryBreakdown() {
  const list = document.getElementById('categoryBreakdown');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const snapshot = await getDocs(collection(db, 'expenses'));
    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + (now.getMonth() + 1);

    // Filter: current month + user is involved (payer or in sharedWith)
    const me = currentUser.name;
    const myExpensesThisMonth = snapshot.docs
      .map(d => d.data())
      .filter(e => {
        const date = new Date(e.createdAt);
        const expenseMonth = date.getFullYear() + '-' + (date.getMonth() + 1);
        const isMyMonth = expenseMonth === currentMonth;
        const isInvolved = e.payer === me || (e.sharedWith || []).includes(me);
        return isMyMonth && isInvolved;
      });

    if (myExpensesThisMonth.length === 0) {
      list.innerHTML = '<p class="empty">No expenses for you this month yet.</p>';
      return;
    }

    // Group by category and compute MY share for each
    const byCategory = {};
    let totalMyShare = 0;

    myExpensesThisMonth.forEach(e => {
      const cat = e.category || 'Uncategorized';
      const icon = e.categoryIcon || '📦';
      const shared = e.sharedWith || [];
      const myShare = shared.includes(me) ? (parseFloat(e.amount) / shared.length) : 0;

      if (!byCategory[cat]) byCategory[cat] = { icon, total: 0, count: 0 };
      byCategory[cat].total += myShare;
      byCategory[cat].count += 1;
      totalMyShare += myShare;
    });

    // Sort by total descending
    const sorted = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);

    list.innerHTML = '';
    sorted.forEach(([cat, info]) => {
      const percent = totalMyShare > 0 ? (info.total / totalMyShare * 100) : 0;

      const row = document.createElement('div');
      row.className = 'cat-bar-row';
      row.innerHTML = `
        <div class="cat-bar-header">
          <span class="cat-bar-name">${escapeHtml(info.icon)} ${escapeHtml(cat)}</span>
          <span class="cat-bar-amount">Rs. ${info.total.toFixed(2)}</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${percent.toFixed(1)}%"></div>
        </div>
        <div class="cat-bar-meta">${info.count} expense${info.count > 1 ? 's' : ''} · ${percent.toFixed(1)}%</div>
      `;
      list.appendChild(row);
    });

    // Total at top
    const totalRow = document.createElement('div');
    totalRow.className = 'cat-total';
    totalRow.innerHTML = `
      <span>Your share this month</span>
      <strong>Rs. ${totalMyShare.toFixed(2)}</strong>
    `;
    list.insertBefore(totalRow, list.firstChild);

  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

// ============================================================
// VIEW TAB SWITCHING (Dashboard <-> History)
// ============================================================
document.querySelectorAll('.user-tabs .utab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.utab;
    document.querySelectorAll('.user-tabs .utab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (target === 'dashboard') {
      document.getElementById('dashboardView').classList.remove('hidden');
      document.getElementById('historyView').classList.add('hidden');
      loadDashboard();
    } else {
      document.getElementById('dashboardView').classList.add('hidden');
      document.getElementById('historyView').classList.remove('hidden');
      loadHistoryExpenses();
    }
  });
});

// History sub-tabs (Expenses / Settlements)
document.querySelectorAll('.history-subtabs .utab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.htab;
    document.querySelectorAll('.history-subtabs .utab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (target === 'expenses') {
      document.getElementById('historyExpenses').classList.remove('hidden');
      document.getElementById('historySettlements').classList.add('hidden');
      loadHistoryExpenses();
    } else {
      document.getElementById('historyExpenses').classList.add('hidden');
      document.getElementById('historySettlements').classList.remove('hidden');
      loadHistorySettlements();
    }
  });
});

// ============================================================
// HISTORY: EXPENSES grouped by month (where user is involved)
// ============================================================
async function loadHistoryExpenses() {
  const list = document.getElementById('expensesHistoryList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const snapshot = await getDocs(collection(db, 'expenses'));
    const me = currentUser.name;

    const myExpenses = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.payer === me || (e.sharedWith || []).includes(me))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (myExpenses.length === 0) {
      list.innerHTML = '<p class="empty">No expense history yet.</p>';
      return;
    }

    // Split by payment role:
    //   - paidByMe: I was the payer (I fronted the money)
    //   - shareOnly: someone else paid, I just owe my share
    const paidByMe = myExpenses.filter(e => e.payer === me);
    const shareOnly = myExpenses.filter(e => e.payer !== me && (e.sharedWith || []).includes(me));

    list.innerHTML = '';

    // Section 1: Expenses you paid
    if (paidByMe.length > 0) {
      list.appendChild(buildRoleSection({
        title: '💰 Expenses You Paid',
        sub: "You fronted the money — others owe you their share",
        cssClass: 'role-paid',
        expenses: paidByMe,
        me,
        showShareLabel: 'paid'
      }));
    }

    // Section 2: Expenses you share in
    if (shareOnly.length > 0) {
      list.appendChild(buildRoleSection({
        title: '💸 Expenses You Share In',
        sub: 'Someone else paid — your share counts toward what you owe them',
        cssClass: 'role-owe',
        expenses: shareOnly,
        me,
        showShareLabel: 'owe'
      }));
    }

  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

// Build a role-based section (paid / owe), with expenses grouped by month inside
function buildRoleSection({ title, sub, cssClass, expenses, me, showShareLabel }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'expense-role-group ' + cssClass;

  // Section totals
  let totalAmount = 0;   // total bill amount (for paid section)
  let totalMyShare = 0;  // my share across these
  expenses.forEach(e => {
    const shared = e.sharedWith || [];
    if (shared.includes(me)) totalMyShare += parseFloat(e.amount) / shared.length;
    totalAmount += parseFloat(e.amount);
  });

  const headerTotal = showShareLabel === 'paid'
    ? `Paid: Rs. ${totalAmount.toFixed(2)} · Your share: Rs. ${totalMyShare.toFixed(2)}`
    : `You owe: Rs. ${totalMyShare.toFixed(2)}`;

  wrapper.innerHTML = `
    <div class="role-group-header">
      <div>
        <h3>${title}</h3>
        <span class="role-group-sub">${sub}</span>
      </div>
      <span class="role-group-total">${headerTotal}</span>
    </div>
  `;

  // Group by month inside this section
  const groups = {};
  expenses.forEach(e => {
    const d = new Date(e.createdAt);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(e);
  });

  Object.keys(groups).sort().reverse().forEach(monthKey => {
    const group = groups[monthKey];

    const monthBlock = document.createElement('div');
    monthBlock.className = 'role-month';

    let monthShare = 0;
    group.items.forEach(e => {
      const shared = e.sharedWith || [];
      if (shared.includes(me)) monthShare += parseFloat(e.amount) / shared.length;
    });

    monthBlock.innerHTML = `
      <div class="role-month-header">
        <span class="role-month-label">${group.label}</span>
        <span class="role-month-total">Rs. ${monthShare.toFixed(2)}</span>
      </div>
    `;

    group.items.forEach(e => {
      monthBlock.appendChild(buildExpenseCard(e, me));
    });

    wrapper.appendChild(monthBlock);
  });

  return wrapper;
}

// Build a single expense card (used in both role sections)
function buildExpenseCard(e, me) {
  const date = formatExpenseDate(e);
  const shared = e.sharedWith || [];
  const share = parseFloat(e.amount) / shared.length;
  const isPayer = e.payer === me;
  const categoryBadge = e.category
    ? `<span class="category-badge"><span>${escapeHtml(e.categoryIcon || '🏷️')}</span> ${escapeHtml(e.category)}</span>`
    : `<span class="category-badge uncategorized">📦 Uncategorized</span>`;

  // Who owes whom line
  let roleLine;
  if (isPayer) {
    const othersCount = shared.filter(p => p !== me).length;
    roleLine = othersCount > 0
      ? `💰 You paid · ${othersCount} ${othersCount === 1 ? 'person owes' : 'people owe'} you`
      : `💰 You paid (just you)`;
  } else {
    roleLine = `👥 Paid by ${escapeHtml(e.payer)} · you owe them`;
  }

  // User can edit/delete expenses they added (or, for old records, ones they paid)
  const canEdit = (e.addedBy && e.addedBy === currentUser.username) ||
                  (!e.addedBy && e.payer === me);

  const card = document.createElement('div');
  card.className = 'expense-card history-expense';
  card.innerHTML = `
    <div class="expense-header">
      <strong>${escapeHtml(e.description)}</strong>
      <span class="amount">Rs. ${parseFloat(e.amount).toFixed(2)}</span>
    </div>
    <div class="expense-meta">
      ${categoryBadge}
      <span>${roleLine}</span>
      <span>📅 ${date}</span>
    </div>
    <div class="expense-shares">
      <span class="shares-label">Your share: <strong>Rs. ${share.toFixed(2)}</strong> (split among ${shared.length})</span>
    </div>
    ${canEdit ? `
    <div class="expense-actions">
      <button class="btn-edit-expense">✏️ Edit</button>
      <button class="btn-delete-expense">🗑 Delete</button>
    </div>` : ''}
  `;

  if (canEdit) {
    card.querySelector('.btn-edit-expense').addEventListener('click', () => openEditForm(e));
    card.querySelector('.btn-delete-expense').addEventListener('click', () => deleteMyExpense(e.id, e.description));
  }

  return card;
}

// Delete an expense the user added
async function deleteMyExpense(id, description) {
  if (!confirm(`Delete "${description}"?\n\nThis removes it for everyone and recalculates balances.`)) return;
  try {
    await deleteDoc(doc(db, 'expenses', id));
    loadHistoryExpenses();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// HISTORY: SETTLEMENTS grouped by month (where user is involved)
// ============================================================
async function loadHistorySettlements() {
  const list = document.getElementById('settlementsHistoryList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const me = currentUser.name;
    const [settlementsSnap, pendingSnap, expensesSnap] = await Promise.all([
      getDocs(collection(db, 'settlements')),
      getDocs(collection(db, 'pendingSettlements')),
      getDocs(collection(db, 'expenses'))
    ]);

    // ---------- 1. COMPLETED (confirmed settlements involving me) ----------
    const completed = settlementsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.from === me || s.to === me)
      .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));

    // ---------- 2. PENDING (claims awaiting confirmation involving me) ----------
    const pending = pendingSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.from === me || s.to === me)
      .sort((a, b) => new Date(b.claimedAt) - new Date(a.claimedAt));

    // ---------- 3. REMAINING (outstanding debts after confirmed + pending) ----------
    // Rebuild net debts the same way the dashboard does
    const debts = {};
    expensesSnap.forEach(docSnap => {
      const e = docSnap.data();
      const payer = e.payer;
      const amount = parseFloat(e.amount);
      const shared = e.sharedWith || [];
      if (shared.length === 0) return;
      const sharePerPerson = amount / shared.length;
      shared.forEach(person => {
        if (person !== payer) {
          if (!debts[person]) debts[person] = {};
          if (!debts[person][payer]) debts[person][payer] = 0;
          debts[person][payer] += sharePerPerson;
        }
      });
    });
    // subtract confirmed settlements
    settlementsSnap.forEach(docSnap => {
      const s = docSnap.data();
      if (debts[s.from] && debts[s.from][s.to]) {
        debts[s.from][s.to] -= parseFloat(s.amount);
        if (debts[s.from][s.to] <= 0.01) delete debts[s.from][s.to];
      }
    });
    // subtract pending settlements
    pendingSnap.forEach(docSnap => {
      const s = docSnap.data();
      if (debts[s.from] && debts[s.from][s.to]) {
        debts[s.from][s.to] -= parseFloat(s.amount);
        if (debts[s.from][s.to] <= 0.01) delete debts[s.from][s.to];
      }
    });

    // Compute my remaining (net per person)
    const remaining = []; // { other, type: 'you_owe'|'owes_you', amount }
    const processed = new Set();
    const others = new Set();
    for (const debtor in debts) {
      if (debtor === me) Object.keys(debts[debtor]).forEach(c => others.add(c));
      for (const creditor in debts[debtor]) {
        if (creditor === me) others.add(debtor);
      }
    }
    others.forEach(other => {
      const key = [me, other].sort().join('|');
      if (processed.has(key)) return;
      processed.add(key);
      const iOwe = (debts[me] && debts[me][other]) || 0;
      const owesMe = (debts[other] && debts[other][me]) || 0;
      const net = owesMe - iOwe;
      if (Math.abs(net) < 0.01) return;
      remaining.push({ other, type: net > 0 ? 'owes_you' : 'you_owe', amount: Math.abs(net) });
    });

    // ---------- RENDER ----------
    if (completed.length === 0 && pending.length === 0 && remaining.length === 0) {
      list.innerHTML = '<p class="empty">No settlements or outstanding balances 🎉</p>';
      return;
    }

    list.innerHTML = '';

    // ===== REMAINING / TO PAY section =====
    if (remaining.length > 0 || pending.length > 0) {
      const remSection = document.createElement('div');
      remSection.className = 'settle-group settle-group-remaining';

      let toPayTotal = 0, toReceiveTotal = 0;
      remaining.forEach(r => {
        if (r.type === 'you_owe') toPayTotal += r.amount;
        else toReceiveTotal += r.amount;
      });

      remSection.innerHTML = `
        <div class="settle-group-header remaining">
          <h3>⏳ Remaining</h3>
          <span class="settle-group-sub">Not yet settled</span>
        </div>
      `;

      // Pending (awaiting confirmation)
      pending.forEach(s => {
        const iPaid = s.from === me;
        const date = new Date(s.claimedAt).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
        const card = document.createElement('div');
        card.className = 'settlement-card pending-settle';
        card.innerHTML = `
          <span class="set-icon">⏳</span>
          <div class="set-text">
            <strong>${iPaid ? 'You paid ' + escapeHtml(s.to) : escapeHtml(s.from) + ' paid you'} <span class="partial-tag">awaiting confirm</span></strong>
            <span class="set-date">📅 ${date}${s.isPartial ? ' · partial payment' : ''}</span>
          </div>
          <span class="set-amount pending">Rs. ${parseFloat(s.amount).toFixed(2)}</span>
        `;
        remSection.appendChild(card);
      });

      // Outstanding (still owed, no action yet)
      remaining.forEach(r => {
        const iOwe = r.type === 'you_owe';
        const card = document.createElement('div');
        card.className = 'settlement-card ' + (iOwe ? 'paid-out' : 'received-in');
        card.innerHTML = `
          <span class="set-icon">${iOwe ? '💸' : '💰'}</span>
          <div class="set-text">
            <strong>${iOwe ? 'You still owe ' + escapeHtml(r.other) : escapeHtml(r.other) + ' still owes you'}</strong>
            <span class="set-date">Outstanding balance</span>
          </div>
          <span class="set-amount ${iOwe ? 'out' : 'in'}">${iOwe ? '-' : '+'}Rs. ${r.amount.toFixed(2)}</span>
        `;
        remSection.appendChild(card);
      });

      if (remaining.length === 0 && pending.length > 0) {
        // only pending, nothing else outstanding — fine
      }

      list.appendChild(remSection);
    }

    // ===== COMPLETED / ALREADY PAID section =====
    if (completed.length > 0) {
      const compSection = document.createElement('div');
      compSection.className = 'settle-group settle-group-completed';
      compSection.innerHTML = `
        <div class="settle-group-header completed">
          <h3>✅ Already Paid</h3>
          <span class="settle-group-sub">Confirmed settlements</span>
        </div>
      `;

      // Group completed by month
      const groups = {};
      completed.forEach(s => {
        const d = new Date(s.settledAt);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        if (!groups[key]) groups[key] = { label, items: [] };
        groups[key].items.push(s);
      });

      Object.keys(groups).sort().reverse().forEach(monthKey => {
        const group = groups[monthKey];
        let paidOut = 0, receivedIn = 0;
        group.items.forEach(s => {
          if (s.from === me) paidOut += parseFloat(s.amount);
          else receivedIn += parseFloat(s.amount);
        });

        const monthBlock = document.createElement('div');
        monthBlock.className = 'settle-month';
        monthBlock.innerHTML = `
          <div class="settle-month-header">
            <span class="settle-month-label">${group.label}</span>
            <span class="month-total">
              <span class="settle-out">-Rs. ${paidOut.toFixed(2)}</span>
              ·
              <span class="settle-in">+Rs. ${receivedIn.toFixed(2)}</span>
            </span>
          </div>
        `;

        group.items.forEach(s => {
          const date = new Date(s.settledAt).toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
          const iPaid = s.from === me;
          const card = document.createElement('div');
          card.className = 'settlement-card ' + (iPaid ? 'paid-out' : 'received-in');
          card.innerHTML = `
            <span class="set-icon">${iPaid ? '💸' : '💰'}</span>
            <div class="set-text">
              <strong>${iPaid ? 'You paid ' + escapeHtml(s.to) : escapeHtml(s.from) + ' paid you'}</strong>
              <span class="set-date">📅 ${date}</span>
            </div>
            <span class="set-amount ${iPaid ? 'out' : 'in'}">${iPaid ? '-' : '+'}Rs. ${parseFloat(s.amount).toFixed(2)}</span>
          `;
          monthBlock.appendChild(card);
        });

        compSection.appendChild(monthBlock);
      });

      list.appendChild(compSection);
    }

  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

// Boot
checkAuth();
