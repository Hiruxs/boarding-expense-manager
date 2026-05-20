import {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy
} from './firebase-config.js';

let allMembers = [];
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
  document.getElementById('dashboardView').classList.add('hidden');
  document.getElementById('formView').classList.remove('hidden');
  resetForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('closeFormBtn').addEventListener('click', () => {
  showDashboard();
});

function showDashboard() {
  document.getElementById('formView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  loadDashboard();
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

function resetForm() {
  document.getElementById('description').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('payerSelect').value = currentUser.name;
  document.querySelectorAll('#membersCheckboxes input[type="checkbox"]').forEach(cb => {
    cb.checked = (cb.value === currentUser.name);
  });
  document.getElementById('preview').classList.add('hidden');
  document.getElementById('message').textContent = '';
  document.getElementById('message').className = 'message';
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
      pendingByDebtor[from][to] = { id, amount };

      if (!pendingByCreditor[to]) pendingByCreditor[to] = {};
      pendingByCreditor[to][from] = { id, amount };

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
        pendingId: info.id
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
          row.innerHTML = `
            <span class="bd-icon">⏳</span>
            <span class="bd-text">Waiting for <strong>${escapeHtml(b.other)}</strong> to confirm</span>
            <span class="bd-amount">Rs. ${b.amount.toFixed(2)}</span>
            <button class="btn-cancel-pay">Cancel</button>
          `;
          row.querySelector('.btn-cancel-pay').addEventListener('click', () =>
            cancelPendingPayment(b.pendingId, b.other, b.amount));
        } else if (b.type === 'you_owe') {
          row.className = 'breakdown-row owe';
          row.innerHTML = `
            <span class="bd-icon">💸</span>
            <span class="bd-text">You owe <strong>${escapeHtml(b.other)}</strong></span>
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
    `Enter the amount you paid (you can adjust if it's a partial payment):`,
    suggestedAmount.toFixed(2)
  );
  if (input === null) return;

  const amount = parseFloat(input);
  if (isNaN(amount) || amount <= 0) {
    return alert('Invalid amount');
  }
  if (amount > suggestedAmount + 0.01) {
    if (!confirm(`You're claiming Rs. ${amount.toFixed(2)} but you only owe Rs. ${suggestedAmount.toFixed(2)}.\nContinue anyway?`)) return;
  }

  try {
    await addDoc(collection(db, 'pendingSettlements'), {
      from: currentUser.name,
      to: creditor,
      amount: amount,
      claimedAt: new Date().toISOString(),
      status: 'pending'
    });
    alert(`✅ Marked as paid.\n${creditor} will be asked to confirm receipt of Rs. ${amount.toFixed(2)}.`);
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

  if (!payer) return showMsg('Please select who paid', 'error');
  if (!description) return showMsg('Please enter a description', 'error');
  if (!amount || amount <= 0) return showMsg('Please enter a valid amount', 'error');
  if (sharedWith.length === 0) return showMsg('Please tick at least one member to split with', 'error');

  try {
    document.getElementById('submitBtn').disabled = true;
    showMsg('Saving...', 'info');

    await addDoc(collection(db, 'expenses'), {
      payer: payer,
      description: description,
      amount: amount,
      sharedWith: sharedWith,
      addedBy: currentUser.username,
      createdAt: new Date().toISOString()
    });

    showMsg('✅ Expense saved! Returning to dashboard...', 'success');
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
      const date = new Date(e.createdAt).toLocaleString();
      const share = (e.amount / e.sharedWith.length).toFixed(2);

      const item = document.createElement('div');
      item.className = 'expense-card';
      item.innerHTML = `
        <div class="expense-header">
          <strong>${escapeHtml(e.description)}</strong>
          <span class="amount">Rs. ${e.amount.toFixed(2)}</span>
        </div>
        <div class="expense-meta">
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

// Boot
checkAuth();
