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
// EXPENSE LOGIC & STATE
// ============================================================
let loadedExpenses = [];
let searchTimer = null;

const FORBIDDEN_CATEGORIES = [
  'STOCK_PURCHASE', 'PEMBELIAN_STOK', 'PENGADAAN_STOK',
  'VENDOR_SETTLEMENT', 'SETTLEMENT_VENDOR', 'BAYAR_VENDOR',
  'HUTANG_VENDOR', 'VENDOR_PAYMENT', 'PURCHASE', 'STOCK_IN'
];

const CATEGORY_MAP = {
  'TRANSPORT': { label: '🚗 Transport', bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'TRANSPORTASI': { label: '🚗 Transportasi', bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  'SEWA': { label: '🏢 Sewa Tempat', bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  'PACKING': { label: '📦 Packing', bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
  'MARKETING': { label: '📢 Marketing', bg: '#FAF5FF', text: '#7E22CE', border: '#E9D5FF' },
  'ADMINISTRASI': { label: '📝 Administrasi', bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
  'LISTRIK': { label: '⚡ Listrik & Air', bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
  'INTERNET': { label: '🌐 Internet', bg: '#E0F2FE', text: '#0369A1', border: '#BAE6FD' },
  'GAJI': { label: '👥 Gaji & Honor', bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' },
  'KERUGIAN_PENIPUAN_VENDOR': { label: '⚠️ Rugi/Penipuan', bg: '#FEE2E2', text: '#B91C1C', border: '#FECACA' },
  'LAIN_LAIN': { label: '📌 Lain-lain', bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' }
};

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

function resetExpenseForm() {
  document.getElementById('expCategory').value = '';
  document.getElementById('expActivity').value = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expPaidBy').value = '';
  document.getElementById('expDescription').value = '';
  document.getElementById('expNotes').value = '';
  setDefaultDates();
  checkForbiddenCategory();
  hideAlert('expAlertBox');
}

function resetExpenseFilters() {
  const now = new Date();
  document.getElementById('filterExpMonth').value = (now.getMonth() + 1).toString();
  document.getElementById('filterExpYear').value = now.getFullYear().toString();
  document.getElementById('filterExpCategory').value = '';
  const searchInput = document.getElementById('filterExpSearch');
  if (searchInput) searchInput.value = '';
  loadExpenseList();
}

function onSearchExpenseInput() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    applyClientFilters();
  }, 250);
}

function applyClientFilters() {
  const q = (document.getElementById('filterExpSearch')?.value || '').trim().toLowerCase();
  if (!q) {
    renderExpensesTable(loadedExpenses);
    return;
  }

  const filtered = loadedExpenses.filter(e => {
    const act = (e.activity || '').toLowerCase();
    const cat = (e.category || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    const notes = (e.notes || '').toLowerCase();
    const paidBy = (e.paid_by || '').toLowerCase();
    const id = (e.expense_id || '').toLowerCase();
    return act.includes(q) || cat.includes(q) || desc.includes(q) || notes.includes(q) || paidBy.includes(q) || id.includes(q);
  });

  renderExpensesTable(filtered);
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
      resetExpenseForm();
      loadExpenseList();
    } else {
      showAlert('expAlertBox', 'error', '❌ ' + (data.error || 'Gagal menyimpan pengeluaran.'));
    }
  } catch (err) {
    showAlert('expAlertBox', 'error', '❌ Koneksi gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Pengeluaran Operasional';
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
      loadedExpenses = expenses;

      // Update KPI metrics
      const count = expenses.length;
      const avg = count > 0 ? Math.round(totalAmount / count) : 0;
      document.getElementById('metricExpCount').textContent = count;
      document.getElementById('metricExpTotal').textContent = formatRp(totalAmount);
      const avgEl = document.getElementById('metricExpAvg');
      if (avgEl) avgEl.textContent = formatRp(avg);

      let periodLabel = 'Semua Periode';
      if (month && year) {
        const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        periodLabel = monthNames[parseInt(month, 10)] + ' ' + year;
      } else if (year) {
        periodLabel = 'Tahun ' + year;
      }
      document.getElementById('metricExpPeriod').textContent = periodLabel;

      if (expenses.length > 0) {
        document.getElementById('expTotalRow').style.display = 'flex';
        document.getElementById('expTotalAmount').textContent = formatRp(totalAmount);
      } else {
        document.getElementById('expTotalRow').style.display = 'none';
      }

      applyClientFilters();
    }
  } catch (err) {
    console.error('Failed to load expenses:', err);
  }
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expensesTableBody');
  if (!expenses || !expenses.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 3rem 1rem;">Tidak ada data pengeluaran ditemukan untuk filter yang dipilih.</td></tr>';
    return;
  }

  tbody.innerHTML = expenses.map(e => {
    const catUpper = String(e.category || '').toUpperCase();
    const catInfo = CATEGORY_MAP[catUpper] || { label: e.category || '—', bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' };

    // Format clean description
    let cleanDesc = e.description || '';
    let isMigrated = false;
    if (cleanDesc.includes('• Migrasi pengeluaran operasional November')) {
      cleanDesc = cleanDesc.replace('• Migrasi pengeluaran operasional November', '').trim();
      isMigrated = true;
    }

    const notes = e.notes ? escapeHtml(e.notes) : '';
    const descDisplay = cleanDesc ? escapeHtml(cleanDesc) : '';

    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td>
          <code style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: var(--primary); background: #F8FAFC; border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px;">
            ${escapeHtml(e.expense_id)}
          </code>
        </td>
        <td style="text-align: center; font-size: 0.83rem; font-weight: 500; white-space: nowrap;">
          ${formatDate(e.expense_date)}
        </td>
        <td style="text-align: center;">
          <span style="display: inline-block; background: ${catInfo.bg}; color: ${catInfo.text}; border: 1px solid ${catInfo.border}; border-radius: 6px; padding: 2px 8px; font-size: 0.72rem; font-weight: 700; white-space: nowrap;">
            ${catInfo.label}
          </span>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">
            ${escapeHtml(e.activity || '—')}
          </div>
          ${descDisplay ? `<div style="font-size: 0.76rem; color: #64748B; margin-top: 2px;">${descDisplay}</div>` : ''}
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <span style="font-weight: 800; font-size: 0.95rem; color: #DC2626;">
            ${formatRp(e.amount)}
          </span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <span style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 2px 7px; border-radius: 4px; font-weight: 600; color: #475569;">
            ${escapeHtml(e.payment_method || '—')}
          </span>
        </td>
        <td style="font-size: 0.82rem; font-weight: 600; color: var(--text-main); white-space: nowrap;">
          ${escapeHtml(e.paid_by || '—')}
        </td>
        <td style="font-size: 0.78rem; color: var(--text-muted); max-width: 260px;">
          ${notes ? `<div><i class="fa-solid fa-receipt" style="color: #94A3B8;"></i> ${notes}</div>` : ''}
          ${isMigrated ? `<span style="font-size: 0.68rem; color: #94A3B8; background: #F1F5F9; padding: 1px 5px; border-radius: 3px;">Migrasi Data</span>` : (!notes && !descDisplay ? '—' : '')}
        </td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  verifySession();
});
