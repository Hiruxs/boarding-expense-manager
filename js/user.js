import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy
} from './firebase-config.js';

let allMembers = [];
let currentUser = null; // { name, username }

// ============================================================
// AUTHENTICATION
// ============================================================

// Check if user is already logged in (localStorage = stay signed in, sessionStorage = temporary)
function checkAuth() {
  const stored = localStorage.getItem('boardingUser') || sessionStorage.getItem('boardingUser');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      showApp();
      return true;
    } catch (e) {
      // Invalid stored data, clear and ask to login again
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
  loadRecent();
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
    currentUser = {
      name: data.name,
      username: data.username
    };

    // Save based on "stay signed in"
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
// LOAD MEMBERS (populate dropdown and checkboxes)
// ============================================================
async function loadMembers() {
  try {
    const snapshot = await getDocs(collection(db, 'members'));
    allMembers = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));

    if (allMembers.length === 0) {
      document.querySelector('.card-form').innerHTML = `
        <h2>⚠️ No members yet</h2>
        <p>Ask the admin to add members first.</p>
        <a href="index.html" class="btn-primary">Back to Home</a>
      `;
      return;
    }

    // Populate payer dropdown
    const payerSelect = document.getElementById('payerSelect');
    payerSelect.innerHTML = '<option value="">-- Select payer --</option>';
    allMembers.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      if (m.name === currentUser.name) {
        opt.selected = true; // ✅ Auto-select current user as payer
      }
      payerSelect.appendChild(opt);
    });

    // Populate checkboxes
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

    // Wire up live preview listeners
    document.getElementById('payerSelect').addEventListener('change', updatePreview);
    document.getElementById('amount').addEventListener('input', updatePreview);
    checkboxContainer.querySelectorAll('input[type="checkbox"]')
      .forEach(cb => cb.addEventListener('change', updatePreview));

    updatePreview(); // Show preview if form is already partially valid

  } catch (err) {
    alert('Error loading members: ' + err.message);
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
      addedBy: currentUser.username, // Track who submitted
      createdAt: new Date().toISOString()
    });

    showMsg('✅ Expense saved successfully!', 'success');

    // Reset form (but keep payer = current user and self-tick)
    document.getElementById('description').value = '';
    document.getElementById('amount').value = '';

    // Reset checkboxes to default (only current user ticked)
    document.querySelectorAll('#membersCheckboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = (cb.value === currentUser.name);
    });

    // Reset payer to current user
    document.getElementById('payerSelect').value = currentUser.name;

    document.getElementById('preview').classList.add('hidden');
    loadRecent();
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
  if (type === 'success') {
    setTimeout(() => { msg.textContent = ''; msg.className = 'message'; }, 3000);
  }
}

// ============================================================
// MY RECENT EXPENSES (filtered to logged-in user)
// ============================================================
async function loadRecent() {
  const list = document.getElementById('recentList');
  list.innerHTML = '<p class="loading">Loading...</p>';

  try {
    const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    // Filter to only expenses paid by current user
    const myExpenses = snapshot.docs.filter(d => d.data().payer === currentUser.name);

    if (myExpenses.length === 0) {
      list.innerHTML = '<p class="empty">You haven\'t added any expenses yet.</p>';
      return;
    }

    list.innerHTML = '';
    let count = 0;
    myExpenses.forEach(docSnap => {
      if (count >= 10) return;
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
