import {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  ADMIN_PASSWORD
} from './firebase-config.js';

// ============================================================
// AUTHENTICATION (simple password check)
// ============================================================
function checkAuth() {
  if (sessionStorage.getItem('adminAuth') === 'true') {
    showDashboard();
  }
}

function showDashboard() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadMembers();
}

document.getElementById('loginBtn').addEventListener('click', () => {
  const pwd = document.getElementById('adminPassword').value;
  if (pwd === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminAuth', 'true');
    showDashboard();
  } else {
    document.getElementById('loginError').textContent = '❌ Wrong password!';
  }
});

document.getElementById('adminPassword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem('adminAuth');
  location.reload();
});

// ============================================================
// TAB SWITCHING
// ============================================================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');

    if (tabName === 'expenses') loadExpenses();
    if (tabName === 'summary') loadSummary();
    if (tabName === 'members') loadMembers();
    if (tabName === 'history') loadHistory();
  });
});

// ============================================================
// MEMBERS
// ============================================================
document.getElementById('addMemberBtn').addEventListener('click', addMember);
document.getElementById('memberPassword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addMember();
});

async function addMember() {
  const nameInput = document.getElementById('memberName');
  const usernameInput = document.getElementById('memberUsername');
  const passwordInput = document.getElementById('memberPassword');

  const name = nameInput.value.trim();
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  if (!name) return alert('Please enter a name');
  if (!username) return alert('Please enter a username');
  if (!password) return alert('Please enter a password');
  if (username.includes(' ')) return alert('Username cannot have spaces');

  try {
    // Check if username already exists
    const existing = await getDocs(collection(db, 'members'));
    const duplicate = existing.docs.find(d => (d.data().username || '').toLowerCase() === username);
    if (duplicate) {
      return alert(`Username "${username}" is already taken. Please choose another.`);
    }

    await addDoc(collection(db, 'members'), {
      name: name,
      username: username,
      password: password,
      createdAt: new Date().toISOString()
    });

    nameInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    loadMembers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function loadMembers() {
  const list = document.getElementById('membersList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const snapshot = await getDocs(collection(db, 'members'));
    if (snapshot.empty) {
      list.innerHTML = '<p class="empty">No members yet. Add one above!</p>';
      return;
    }

    list.innerHTML = '';
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const hasCredentials = data.username && data.password;

      const item = document.createElement('div');
      item.className = 'list-item member-item';
      item.innerHTML = `
        <div class="member-info">
          <span class="item-name">👤 ${escapeHtml(data.name)}</span>
          ${hasCredentials
            ? `<span class="member-creds">@${escapeHtml(data.username)} · 🔑 ${escapeHtml(data.password)}</span>`
            : `<span class="member-creds no-creds">⚠️ No login credentials</span>`
          }
        </div>
        <div class="member-actions">
          <button class="btn-secondary-sm btn-edit" data-id="${docSnap.id}">✏️ Edit</button>
          <button class="btn-danger-sm btn-delete" data-id="${docSnap.id}">🗑 Delete</button>
        </div>
      `;
      item.querySelector('.btn-edit').addEventListener('click', () => editMember(docSnap.id, data));
      item.querySelector('.btn-delete').addEventListener('click', () => deleteMember(docSnap.id, data.name));
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error loading members: ${err.message}</p>`;
  }
}

async function editMember(id, current) {
  const newName = prompt('Full Name:', current.name);
  if (newName === null) return;
  if (!newName.trim()) return alert('Name cannot be empty');

  const newUsername = prompt('Username:', current.username || '');
  if (newUsername === null) return;
  if (!newUsername.trim()) return alert('Username cannot be empty');
  if (newUsername.includes(' ')) return alert('Username cannot have spaces');

  const newPassword = prompt('Password:', current.password || '');
  if (newPassword === null) return;
  if (!newPassword.trim()) return alert('Password cannot be empty');

  try {
    // Check username uniqueness (excluding this member)
    const existing = await getDocs(collection(db, 'members'));
    const duplicate = existing.docs.find(d =>
      d.id !== id && (d.data().username || '').toLowerCase() === newUsername.trim().toLowerCase()
    );
    if (duplicate) return alert(`Username "${newUsername}" is already taken.`);

    await updateDoc(doc(db, 'members', id), {
      name: newName.trim(),
      username: newUsername.trim().toLowerCase(),
      password: newPassword.trim()
    });
    loadMembers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteMember(id, name) {
  if (!confirm(`Delete member "${name}"?\n\nNote: Their past expense records will stay.`)) return;
  try {
    await deleteDoc(doc(db, 'members', id));
    loadMembers();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// EXPENSES (read-only view for admin)
// ============================================================
async function loadExpenses() {
  const list = document.getElementById('expensesList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      list.innerHTML = '<p class="empty">No expenses recorded yet.</p>';
      return;
    }

    list.innerHTML = '';
    snapshot.forEach(docSnap => {
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
          <span>💰 Paid by: <strong>${escapeHtml(e.payer)}</strong></span>
          <span>📅 ${date}</span>
        </div>
        <div class="expense-shares">
          <span class="shares-label">Split equally among ${e.sharedWith.length}:</span>
          <div class="shares-list">
            ${e.sharedWith.map(m => `<span class="share-pill">${escapeHtml(m)} = Rs. ${share}</span>`).join('')}
          </div>
        </div>
        <button class="btn-danger-sm" data-id="${docSnap.id}">🗑 Delete</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteExpense(docSnap.id, e.description));
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

async function deleteExpense(id, desc) {
  if (!confirm(`Delete expense "${desc}"?`)) return;
  try {
    await deleteDoc(doc(db, 'expenses', id));
    loadExpenses();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ============================================================
// BALANCE SUMMARY
// Logic:
//   - Payer pays full amount
//   - Amount is split equally among "sharedWith" (payer included if in list)
//   - Each non-payer in sharedWith owes the payer their share
//   - Settlements (paid debts) SUBTRACT from the debt
//   - Net balance per person = total paid - total share owed + settlements paid - settlements received
// ============================================================
async function loadSummary() {
  const list = document.getElementById('summaryList');
  list.innerHTML = '<p class="loading">Calculating...</p>';

  try {
    // Get all members
    const membersSnap = await getDocs(collection(db, 'members'));
    const memberNames = membersSnap.docs.map(d => d.data().name);

    // Get all expenses
    const expensesSnap = await getDocs(collection(db, 'expenses'));

    // Get all settlements (paid debts)
    const settlementsSnap = await getDocs(collection(db, 'settlements'));

    if (expensesSnap.empty) {
      list.innerHTML = '<p class="empty">No expenses yet — nothing to calculate.</p>';
      return;
    }

    // Track each person's net balance
    const balance = {};
    memberNames.forEach(n => balance[n] = 0);

    // Pair-wise debt tracking: debts[debtor][creditor] = amount
    const debts = {};

    // Process expenses
    expensesSnap.forEach(docSnap => {
      const e = docSnap.data();
      const payer = e.payer;
      const amount = parseFloat(e.amount);
      const shared = e.sharedWith;
      const sharePerPerson = amount / shared.length;

      if (!(payer in balance)) balance[payer] = 0;
      balance[payer] += amount;

      shared.forEach(person => {
        if (!(person in balance)) balance[person] = 0;
        balance[person] -= sharePerPerson;

        if (person !== payer) {
          if (!debts[person]) debts[person] = {};
          if (!debts[person][payer]) debts[person][payer] = 0;
          debts[person][payer] += sharePerPerson;
        }
      });
    });

    // Process settlements (subtract from debts and adjust balance)
    settlementsSnap.forEach(docSnap => {
      const s = docSnap.data();
      const from = s.from; // who paid
      const to = s.to;     // who received
      const amount = parseFloat(s.amount);

      // Adjust balance: payer's balance goes up (they paid), receiver's down
      if (!(from in balance)) balance[from] = 0;
      if (!(to in balance)) balance[to] = 0;
      balance[from] += amount;
      balance[to] -= amount;

      // Reduce debt
      if (debts[from] && debts[from][to]) {
        debts[from][to] -= amount;
        if (debts[from][to] <= 0.01) delete debts[from][to];
      }
    });

    // Render
    list.innerHTML = '';

    // Section 1: Net balances
    const balanceCard = document.createElement('div');
    balanceCard.className = 'summary-section';
    balanceCard.innerHTML = '<h3>💰 Net Balance per Member</h3>';
    const balanceList = document.createElement('div');
    balanceList.className = 'balance-list';

    Object.entries(balance).forEach(([name, bal]) => {
      const isPositive = bal > 0.01;
      const isNegative = bal < -0.01;
      const status = isPositive ? 'gets back' : isNegative ? 'should pay' : 'settled ✓';
      const cls = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';

      const row = document.createElement('div');
      row.className = `balance-row ${cls}`;

      // Build row HTML
      let rowHtml = `
        <span class="bal-name">${escapeHtml(name)}</span>
        <span class="bal-status">${status}</span>
        <span class="bal-amount">Rs. ${Math.abs(bal).toFixed(2)}</span>
      `;

      // Add "Reset" button if person has any debt or credit
      if (isPositive || isNegative) {
        rowHtml += `<button class="btn-reset" data-name="${escapeAttr(name)}">Reset to 0</button>`;
      }

      row.innerHTML = rowHtml;

      const resetBtn = row.querySelector('.btn-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => resetPerson(name, debts, balance));
      }

      balanceList.appendChild(row);
    });
    balanceCard.appendChild(balanceList);
    list.appendChild(balanceCard);

    // Section 2: Who owes whom (simplified) with "Mark as Paid" buttons
    const debtCard = document.createElement('div');
    debtCard.className = 'summary-section';
    debtCard.innerHTML = '<h3>🔄 Settlements Needed</h3>';
    const debtList = document.createElement('div');
    debtList.className = 'debt-list';

    const settlements = simplifyDebts(debts);

    if (settlements.length === 0) {
      debtList.innerHTML = '<p class="empty">All settled! 🎉</p>';
    } else {
      settlements.forEach(s => {
        const row = document.createElement('div');
        row.className = 'debt-row';
        row.innerHTML = `
          <span class="debtor">${escapeHtml(s.from)}</span>
          <span class="arrow">→ pays →</span>
          <span class="creditor">${escapeHtml(s.to)}</span>
          <span class="debt-amount">Rs. ${s.amount.toFixed(2)}</span>
          <button class="btn-paid">✓ Mark Paid</button>
        `;
        row.querySelector('.btn-paid').addEventListener('click', () => markSettlementPaid(s.from, s.to, s.amount));
        debtList.appendChild(row);
      });
    }
    debtCard.appendChild(debtList);
    list.appendChild(debtCard);

  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

// ============================================================
// SETTLEMENT ACTIONS
// ============================================================

// Mark a single settlement as paid
async function markSettlementPaid(from, to, amount) {
  if (!confirm(`Confirm: ${from} paid Rs. ${amount.toFixed(2)} to ${to}?`)) return;

  try {
    await addDoc(collection(db, 'settlements'), {
      from: from,
      to: to,
      amount: amount,
      settledAt: new Date().toISOString(),
      type: 'individual'
    });
    alert(`✅ Settlement recorded: ${from} → ${to} Rs. ${amount.toFixed(2)}`);
    loadSummary();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Reset all debts for a single person (whole-person reset)
async function resetPerson(name, debts, balance) {
  const personBalance = balance[name];

  if (Math.abs(personBalance) < 0.01) {
    alert(`${name} is already settled.`);
    return;
  }

  const action = personBalance < 0 ? 'pays' : 'receives';
  const totalAmount = Math.abs(personBalance);

  if (!confirm(
    `Reset all debts for ${name}?\n\n` +
    `This will record that ${name} ${action} Rs. ${totalAmount.toFixed(2)} (total).\n` +
    `Balance will become 0.`
  )) return;

  try {
    // If person owes money, create settlement entries for each debt they owe
    if (personBalance < 0 && debts[name]) {
      for (const creditor in debts[name]) {
        const amt = debts[name][creditor];
        if (amt > 0.01) {
          await addDoc(collection(db, 'settlements'), {
            from: name,
            to: creditor,
            amount: amt,
            settledAt: new Date().toISOString(),
            type: 'bulk-reset'
          });
        }
      }
    }
    // If person is owed money, create settlement entries from each debtor
    else if (personBalance > 0) {
      for (const debtor in debts) {
        if (debts[debtor][name]) {
          const amt = debts[debtor][name];
          if (amt > 0.01) {
            await addDoc(collection(db, 'settlements'), {
              from: debtor,
              to: name,
              amount: amt,
              settledAt: new Date().toISOString(),
              type: 'bulk-reset'
            });
          }
        }
      }
    }

    alert(`✅ ${name}'s balance has been reset to 0.`);
    loadSummary();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Simplify mutual debts: if A owes B 100 and B owes A 60, then A owes B 40
function simplifyDebts(debts) {
  const result = [];
  const processed = new Set();

  for (const debtor in debts) {
    for (const creditor in debts[debtor]) {
      const key = [debtor, creditor].sort().join('|');
      if (processed.has(key)) continue;
      processed.add(key);

      const owe1 = debts[debtor]?.[creditor] || 0;
      const owe2 = debts[creditor]?.[debtor] || 0;
      const net = owe1 - owe2;

      if (Math.abs(net) < 0.01) continue;
      if (net > 0) {
        result.push({ from: debtor, to: creditor, amount: net });
      } else {
        result.push({ from: creditor, to: debtor, amount: -net });
      }
    }
  }
  return result;
}

// ============================================================
// SETTLEMENT HISTORY
// ============================================================
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const snapshot = await getDocs(collection(db, 'settlements'));

    if (snapshot.empty) {
      list.innerHTML = '<p class="empty">No settlements recorded yet.</p>';
      return;
    }

    // Sort by date descending
    const settlements = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));

    list.innerHTML = '';
    settlements.forEach(s => {
      const date = new Date(s.settledAt).toLocaleString();
      const typeLabel = s.type === 'bulk-reset' ? '🔄 Bulk Reset' : '💸 Individual';

      const item = document.createElement('div');
      item.className = 'expense-card';
      item.innerHTML = `
        <div class="expense-header">
          <strong>${escapeHtml(s.from)} → ${escapeHtml(s.to)}</strong>
          <span class="amount">Rs. ${parseFloat(s.amount).toFixed(2)}</span>
        </div>
        <div class="expense-meta">
          <span>${typeLabel}</span>
          <span>📅 ${date}</span>
        </div>
        <button class="btn-danger-sm" data-id="${s.id}">🗑 Undo / Delete</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteSettlement(s.id, s.from, s.to, s.amount));
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
  }
}

async function deleteSettlement(id, from, to, amount) {
  if (!confirm(`Undo this settlement?\n\n${from} → ${to} Rs. ${parseFloat(amount).toFixed(2)}\n\nThis will restore the debt in Balance Summary.`)) return;
  try {
    await deleteDoc(doc(db, 'settlements', id));
    loadHistory();
  } catch (err) {
    alert('Error: ' + err.message);
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
