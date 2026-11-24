/**
 * CROCSCIRCLE.ID — Pengeluaran Operasional Controller
 * Frontend Controller: expenses.js
 */

let currentUser = null;
let currentToken = null;

function getToken() {
  return sessionStorage.getItem('crocscircle_admin_token');
}

// ============================================================
// AUTH & SESSION
// ============================================================
async function verifySession() {
  const token = getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }
  try {
    const res = await fetch('/api/session', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.success || !data.user) {
      sessionStorage.removeItem('crocscircle_admin_token');
      window.location.href = 'login.html';
      return;
    }
    currentUser = data.user;
    currentToken = token;

    const userFullNameEl = document.getElementById('userFullName');
    const userRoleBadgeEl = document.getElementById('userRoleBadge');
    const userAvatarEl = document.getElementById('userAvatar');

    if (userFullNameEl) userFullNameEl.textContent = currentUser.full_name || currentUser.username;
    if (userRoleBadgeEl) userRoleBadgeEl.textContent = 'Role: ' + (currentUser.role || 'ADMIN');
    const initials = (currentUser.full_name || currentUser.username || 'U').charAt(0).toUpperCase();
    if (userAvatarEl) userAvatarEl.textContent = initials;

    // Hide owner-only items for non-owners
    if (currentUser.role !== 'OWNER') {
      document.querySelectorAll('.owner-only').forEach(el => el.style.display = 'none');
    }

    document.getElementById('authLoadingOverlay').style.display = 'none';
    document.getElementById('mainLayout').style.display = 'flex';

    // Init page data
    setDefaultDates();
    loadExpenseList();
  } catch (err) {
    window.location.href = 'login.html';
  }
}

function showLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.style.display = 'flex';
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) modal.style.display = 'none';
}

async function confirmLogout() {
  try {
    if (currentToken) {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken })
      });
    }
  } catch (e) {
    // Ignore error on logout
  } finally {
    sessionStorage.removeItem('crocscircle_admin_token');
    window.location.href = 'login.html';
  }
}

// ============================================================
// UTILS
// ============================================================
function formatRp(amount) {
  return 'Rp ' + Number(amount || 0).toLocaleString('id-ID');
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) { return isoStr; }
}

function setDefaultDates() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dateInput = document.getElementById('expDate');
  if (dateInput) dateInput.value = today;

  const currentMonth = (now.getMonth() + 1).toString();
  const currentYear = now.getFullYear().toString();

  const monthFilter = document.getElementById('filterExpMonth');
  const yearFilter = document.getElementById('filterExpYear');

  if (monthFilter && !monthFilter.value) monthFilter.value = currentMonth;
  if (yearFilter && !yearFilter.value) yearFilter.value = currentYear;
}

function showAlert(boxId, type, message) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.className = 'alert-box alert-' + type;
  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
  box.innerHTML = '<i class="fa-solid ' + (icons[type] || 'fa-circle-info') + '"></i><span>' + message + '</span>';
  box.style.display = 'flex';
  if (type === 'success') setTimeout(() => { box.style.display = 'none'; }, 6000);
}

function hideAlert(boxId) {
  const box = document.getElementById(boxId);
  if (box) box.style.display = 'none';
}

// ============================================================
// EXPENSE LOGIC
// ============================================================
const FORBIDDEN_CATEGORIES = [
  'STOCK_PURCHASE', 'PEMBELIAN_STOK', 'PENGADAAN_STOK',
  'VENDOR_SETTLEMENT', 'SETTLEMENT_VENDOR', 'BAYAR_VENDOR',
  'HUTANG_VENDOR', 'VENDOR_PAYMENT', 'PURCHASE', 'STOCK_IN'
];

function checkForbiddenCategory() {
  const cat = (document.getElementById('expCategory').value || '').toUpperCase();
  const warning = document.getElementById('forbiddenCategoryWarning');
  const btn = document.getElementById('createExpenseBtn');
  if (FORBIDDEN_CATEGORIES.includes(cat)) {
    if (warning) warning.style.display = 'flex';
    if (btn) btn.disabled = true;
  } else {
    if (warning) warning.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

async function submitCreateExpense() {
  hideAlert('expAlertBox');
  const btn = document.getElementById('createExpenseBtn');
  const category = document.getElementById('expCategory').value;
  const expDate = document.getElementById('expDate').value;
  const activity = document.getElementById('expActivity').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value) || 0;
  const paymentMethod = document.getElementById('expPaymentMethod').value;
  const paidBy = document.getElementById('expPaidBy').value.trim();
  const description = document.getElementById('expDescription').value.trim();
  const notes = document.getElementById('expNotes').value.trim();

  if (!category) { showAlert('expAlertBox', 'error', 'Pilih kategori pengeluaran.'); return; }
  if (!expDate) { showAlert('expAlertBox', 'error', 'Tanggal pengeluaran wajib diisi.'); return; }
  if (!activity) { showAlert('expAlertBox', 'error', 'Aktivitas pengeluaran wajib diisi.'); return; }
  if (amount <= 0) { showAlert('expAlertBox', 'error', 'Jumlah pengeluaran harus berupa angka lebih dari 0.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  try {
    const res = await fetch('/api/expenses/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify({
        expense_date: expDate,
        category: category,
        activity: activity,
        amount: amount,
        payment_method: paymentMethod,
        paid_by: paidBy,
        description: description,
        notes: notes
      })
    });
    const data = await res.json();
    if (data.success) {
      showAlert('expAlertBox', 'success',
        '✅ Pengeluaran berhasil disimpan! ID: <strong>' + data.expense_id + '</strong> — Kategori: ' + data.category + ' — Nominal: ' + formatRp(data.amount));
      // Reset form
      document.getElementById('expCategory').value = '';
      document.getElementById('expActivity').value = '';
      document.getElementById('expAmount').value = '';
      document.getElementById('expPaidBy').value = '';
      document.getElementById('expDescription').value = '';
      document.getElementById('expNotes').value = '';
      loadExpenseList();
    } else {
      showAlert('expAlertBox', 'error', '❌ ' + (data.error || 'Gagal menyimpan pengeluaran.'));
    }
  } catch (err) {
    showAlert('expAlertBox', 'error', '❌ Koneksi gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Pengeluaran';
  }
}

async function loadExpenseList() {
  const month = document.getElementById('filterExpMonth').value;
  const year = document.getElementById('filterExpYear').value;
  const category = document.getElementById('filterExpCategory').value;

  let url = '/api/expenses/list?';
  if (month) url += 'month=' + month + '&';
  if (year) url += 'year=' + year + '&';
  if (category) url += 'category=' + category + '&';

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (data.success) {
      const expenses = data.expenses || [];
      const totalAmount = data.total_amount || 0;
      renderExpensesTable(expenses);

      // Update metrics
      document.getElementById('metricExpCount').textContent = expenses.length;
      document.getElementById('metricExpTotal').textContent = formatRp(totalAmount);

      let periodLabel = 'Semua Periode';
      if (month && year) {
        const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        periodLabel = monthNames[parseInt(month, 10)] + ' ' + year;
      } else if (year) {
        periodLabel = 'Tahun ' + year;
      }
      document.getElementById('metricExpPeriod').textContent = periodLabel;

      if (expenses.length > 0) {
        document.getElementById('expTotalRow').style.display = 'block';
        document.getElementById('expTotalAmount').textContent = formatRp(totalAmount);
      } else {
        document.getElementById('expTotalRow').style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to load expenses:', err);
  }
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expensesTableBody');
  if (!expenses.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 2rem;">Tidak ada data pengeluaran ditemukan untuk filter ini.</td></tr>';
    return;
  }
  tbody.innerHTML = expenses.map(e => {
    const details = [e.description, e.notes].filter(Boolean).join(' • ');
    return `
      <tr>
        <td><strong style="font-family: monospace; font-size: 0.75rem;">${e.expense_id}</strong></td>
        <td>${formatDate(e.expense_date)}</td>
        <td><span style="background: #F3E8FF; color: #7E22CE; border: 1px solid #E9D5FF; border-radius: 5px; padding: 2px 7px; font-size: 0.72rem; font-weight: 700;">${e.category}</span></td>
        <td><strong>${e.activity || '—'}</strong></td>
        <td><strong style="color: #DC2626;">${formatRp(e.amount)}</strong></td>
        <td><span style="font-size: 0.75rem; background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">${e.payment_method || '—'}</span></td>
        <td>${e.paid_by || '—'}</td>
        <td style="font-size: 0.8rem; color: var(--text-muted); max-width: 250px;">${details || '—'}</td>
      </tr>
    `;
  }).join('');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  verifySession();
});
