import {
  db,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
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
  });
});

// ============================================================
// MEMBERS
// ============================================================
document.getElementById('addMemberBtn').addEventListener('click', addMember);
document.getElementById('memberName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addMember();
});

async function addMember() {
  const nameInput = document.getElementById('memberName');
  const name = nameInput.value.trim();
  if (!name) return alert('Please enter a name');

  try {
    await addDoc(collection(db, 'members'), {
      name: name,
      createdAt: new Date().toISOString()
    });
    nameInput.value = '';
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
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <span class="item-name">👤 ${escapeHtml(data.name)}</span>
        <button class="btn-danger-sm" data-id="${docSnap.id}">Delete</button>
      `;
      item.querySelector('button').addEventListener('click', () => deleteMember(docSnap.id, data.name));
      list.appendChild(item);
    });
  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error loading members: ${err.message}</p>`;
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
//   - Net balance per person = total paid - total share owed
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

    if (expensesSnap.empty) {
      list.innerHTML = '<p class="empty">No expenses yet — nothing to calculate.</p>';
      return;
    }

    // Track each person's net balance
    // Positive = they are owed money (paid more than their share)
    // Negative = they owe money
    const balance = {};
    memberNames.forEach(n => balance[n] = 0);

    // Pair-wise debt tracking: debts[debtor][creditor] = amount
    const debts = {};

    expensesSnap.forEach(docSnap => {
      const e = docSnap.data();
      const payer = e.payer;
      const amount = parseFloat(e.amount);
      const shared = e.sharedWith;
      const sharePerPerson = amount / shared.length;

      // Payer paid the full amount
      if (!(payer in balance)) balance[payer] = 0;
      balance[payer] += amount;

      // Each sharer owes their portion
      shared.forEach(person => {
        if (!(person in balance)) balance[person] = 0;
        balance[person] -= sharePerPerson;

        // Track pair debt (if not the payer themselves)
        if (person !== payer) {
          if (!debts[person]) debts[person] = {};
          if (!debts[person][payer]) debts[person][payer] = 0;
          debts[person][payer] += sharePerPerson;
        }
      });
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
      const status = isPositive ? 'gets back' : isNegative ? 'should pay' : 'settled';
      const cls = isPositive ? 'positive' : isNegative ? 'negative' : 'neutral';

      const row = document.createElement('div');
      row.className = `balance-row ${cls}`;
      row.innerHTML = `
        <span class="bal-name">${escapeHtml(name)}</span>
        <span class="bal-status">${status}</span>
        <span class="bal-amount">Rs. ${Math.abs(bal).toFixed(2)}</span>
      `;
      balanceList.appendChild(row);
    });
    balanceCard.appendChild(balanceList);
    list.appendChild(balanceCard);

    // Section 2: Who owes whom (simplified)
    const debtCard = document.createElement('div');
    debtCard.className = 'summary-section';
    debtCard.innerHTML = '<h3>🔄 Settlements Needed</h3>';
    const debtList = document.createElement('div');
    debtList.className = 'debt-list';

    // Simplify: net out mutual debts
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
        `;
        debtList.appendChild(row);
      });
    }
    debtCard.appendChild(debtList);
    list.appendChild(debtCard);

  } catch (err) {
    list.innerHTML = `<p class="error-msg">Error: ${err.message}</p>`;
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
// UTILS
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Boot
checkAuth();
