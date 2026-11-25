/**
 * CROCSCIRCLE.ID — Pembelian Stok Supplier Controller
 * Frontend Controller: purchases.js
 * Redesign: Vendor & Product Dropdown, Locked HPP Receiving, Contextual Details
 */

let currentUser = null;
let currentToken = null;

let vendorsList = [];
let productsList = [];
const variantsCache = {};

let invoiceItemIndex = 0;
let activeReceiveData = null;
let activePaymentData = null;

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
    await loadMetadataAndProducts();
    loadPurchaseList();
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

function receivingStatusPill(status) {
  const map = {
    'UNRECEIVED': '<span class="status-pill status-unreceived"><i class="fa-solid fa-clock"></i> Belum Diterima</span>',
    'PARTIAL_RECEIVED': '<span class="status-pill status-partial"><i class="fa-solid fa-truck"></i> Sebagian</span>',
    'FULLY_RECEIVED': '<span class="status-pill status-fully"><i class="fa-solid fa-circle-check"></i> Penuh</span>'
  };
  return map[status] || ('<span class="status-pill status-unreceived">' + status + '</span>');
}

function paymentStatusPill(status) {
  if (status === 'PAID') return '<span class="status-pill status-paid"><i class="fa-solid fa-check"></i> Lunas</span>';
  if (status === 'PARTIAL') return '<span class="status-pill status-partial"><i class="fa-solid fa-clock-rotate-left"></i> Sebagian</span>';
  return '<span class="status-pill status-unpaid"><i class="fa-solid fa-clock"></i> Belum Bayar</span>';
}

// ============================================================
// METADATA & PRODUCTS LOADERS
// ============================================================
async function loadMetadataAndProducts() {
  try {
    const headers = { 'Authorization': 'Bearer ' + currentToken };

    // 1. Load Vendors
    const metaRes = await fetch('/api/metadata', { headers });
    const metaData = await metaRes.json();
    if (metaData.success && Array.isArray(metaData.vendors)) {
      vendorsList = metaData.vendors;
      populateVendorDropdowns();
    }

    // 2. Load Products Master
    const prodRes = await fetch('/api/products', { headers });
    const prodData = await prodRes.json();
    if (prodData.success && Array.isArray(prodData.products)) {
      productsList = prodData.products.filter(p => p.is_active === true || p.is_active === 'true' || p.is_active === 1 || p.is_active === undefined);
    }
  } catch (err) {
    console.error('Error loading metadata/products:', err);
  }
}

function populateVendorDropdowns() {
  const filterVendorSelect = document.getElementById('filterVendorId');
  const newInvoiceVendorSelect = document.getElementById('newInvoiceVendor');

  if (filterVendorSelect) {
    filterVendorSelect.innerHTML = '<option value="">Semua Supplier</option>' +
      vendorsList.map(v => `<option value="${v.vendor_id}">${v.vendor_name} (${v.vendor_id})</option>`).join('');
  }

  if (newInvoiceVendorSelect) {
    newInvoiceVendorSelect.innerHTML = '<option value="">— Pilih Supplier Terdaftar —</option>' +
      vendorsList.map(v => `<option value="${v.vendor_id}" data-name="${v.vendor_name}">${v.vendor_name} (${v.vendor_id})</option>`).join('');
  }
}

// ============================================================
// PURCHASES LIST & FILTERS
// ============================================================
async function loadPurchaseList() {
  const receivingStatus = document.getElementById('filterReceivingStatus')?.value || '';
  const paymentStatus = document.getElementById('filterPaymentStatus')?.value || '';
  const vendorId = document.getElementById('filterVendorId')?.value || '';
  const dateFrom = document.getElementById('filterDateFrom')?.value || '';
  const dateTo = document.getElementById('filterDateTo')?.value || '';

  let url = '/api/purchases/list?';
  if (receivingStatus) url += 'receiving_status=' + encodeURIComponent(receivingStatus) + '&';
  if (paymentStatus) url += 'payment_status=' + encodeURIComponent(paymentStatus) + '&';
  if (vendorId) url += 'vendor_id=' + encodeURIComponent(vendorId) + '&';
  if (dateFrom) url += 'date_from=' + encodeURIComponent(dateFrom) + '&';
  if (dateTo) url += 'date_to=' + encodeURIComponent(dateTo) + '&';

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (data.success) {
      const purchases = data.purchases || [];
      renderPurchasesTable(purchases);
      updateMetrics(purchases);
    }
  } catch (err) {
    console.error('Failed to load purchases:', err);
  }
}

function resetFilters() {
  if (document.getElementById('filterDateFrom')) document.getElementById('filterDateFrom').value = '';
  if (document.getElementById('filterDateTo')) document.getElementById('filterDateTo').value = '';
  if (document.getElementById('filterVendorId')) document.getElementById('filterVendorId').value = '';
  if (document.getElementById('filterReceivingStatus')) document.getElementById('filterReceivingStatus').value = '';
  if (document.getElementById('filterPaymentStatus')) document.getElementById('filterPaymentStatus').value = '';
  loadPurchaseList();
}

function updateMetrics(purchases) {
  let totalRemainingBill = 0;
  let inTransitCount = 0;
  let fullyReceivedCount = 0;

  purchases.forEach(p => {
    const rem = p.remaining_bill !== undefined ? parseFloat(p.remaining_bill) : Math.max(0, (parseFloat(p.total_purchase) || 0) - (parseFloat(p.total_paid) || 0));
    totalRemainingBill += rem;

    if (p.receiving_status === 'FULLY_RECEIVED') {
      fullyReceivedCount++;
    } else {
      inTransitCount++;
    }
  });

  document.getElementById('metricTotalInvoices').textContent = purchases.length;
  document.getElementById('metricRemainingBill').textContent = formatRp(totalRemainingBill);
  document.getElementById('metricInTransit').textContent = inTransitCount;
  document.getElementById('metricFullyReceived').textContent = fullyReceivedCount;
}

function renderPurchasesTable(purchases) {
  const tbody = document.getElementById('purchasesTableBody');
  if (!purchases.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--text-muted); padding: 2rem;">Tidak ada faktur pembelian ditemukan.</td></tr>';
    return;
  }

  tbody.innerHTML = purchases.map(p => {
    const totalPurchase = parseFloat(p.total_purchase) || 0;
    const totalPaid = parseFloat(p.total_paid) || 0;
    const remainingBill = p.remaining_bill !== undefined ? parseFloat(p.remaining_bill) : Math.max(0, totalPurchase - totalPaid);
    const isPaid = p.payment_status === 'PAID' || remainingBill <= 0;
    const isFullyReceived = p.receiving_status === 'FULLY_RECEIVED';
    const supplierEscaped = (p.supplier_name || '').replace(/'/g, "\\'");

    return `
      <tr>
        <td><strong style="font-family: monospace; font-size: 0.75rem;">${p.purchase_id}</strong></td>
        <td>${formatDate(p.purchase_date)}</td>
        <td><strong>${p.supplier_name || '—'}</strong><br><span style="font-size: 0.72rem; color: var(--text-muted);">${p.vendor_id || ''}</span></td>
        <td><strong>${formatRp(totalPurchase)}</strong></td>
        <td><span style="color: #059669; font-weight: 700;">${formatRp(totalPaid)}</span></td>
        <td><strong style="color: ${remainingBill > 0 ? '#DC2626' : '#059669'};">${formatRp(remainingBill)}</strong></td>
        <td>${receivingStatusPill(p.receiving_status)}</td>
        <td>${paymentStatusPill(p.payment_status)}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            ${!isPaid ? `
              <button onclick="openPaymentModal('${p.purchase_id}', '${supplierEscaped}', ${totalPurchase}, ${totalPaid})" style="background: #059669; color: white; border: none; border-radius: 4px; padding: 3px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                <i class="fa-solid fa-money-bill-wave"></i> Bayar
              </button>
            ` : ''}

            ${!isFullyReceived ? `
              <button onclick="openReceiveModal('${p.purchase_id}')" style="background: #0369A1; color: white; border: none; border-radius: 4px; padding: 3px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                <i class="fa-solid fa-truck-ramp-box"></i> Terima
              </button>
            ` : ''}

            <button onclick="openDetailModal('${p.purchase_id}')" style="background: #F1F5F9; color: #475569; border: 1px solid var(--border); border-radius: 4px; padding: 3px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
              <i class="fa-solid fa-eye"></i> Detail
            </button>

            <button onclick="openHistoryModal('${p.purchase_id}')" style="background: #F8FAFC; color: #64748B; border: 1px solid #E2E8F0; border-radius: 4px; padding: 3px 6px; font-size: 0.72rem; cursor: pointer;" title="Riwayat Pembayaran">
              <i class="fa-solid fa-clock-rotate-left"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ============================================================
// MODAL 1: BUAT FAKTUR PEMBELIAN (VENDOR & PRODUCT DROPDOWN)
// ============================================================
function openCreateInvoiceModal() {
  hideAlert('createModalAlertBox');
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('newInvoiceDate').value = today;
  document.getElementById('newInvoiceVendor').value = '';
  document.getElementById('newInvoiceShipping').value = 0;
  document.getElementById('newInvoiceNotes').value = '';

  document.getElementById('invoiceItemsContainer').innerHTML = '';
  invoiceItemIndex = 0;
  addInvoiceItemRow();
  updateInvoiceTotals();

  document.getElementById('createInvoiceModal').style.display = 'flex';
}

function closeCreateInvoiceModal() {
  document.getElementById('createInvoiceModal').style.display = 'none';
}

function addInvoiceItemRow() {
  invoiceItemIndex++;
  const idx = invoiceItemIndex;
  const container = document.getElementById('invoiceItemsContainer');

  const rowDiv = document.createElement('div');
  rowDiv.className = 'item-row-container';
  rowDiv.id = 'invItemRow-' + idx;

  const productOptions = '<option value="">— Pilih Produk —</option>' +
    productsList.map(p => `<option value="${p.product_id}">${p.product_name} (${p.category_id || p.model || ''})</option>`).join('');

  rowDiv.innerHTML = `
    <div class="item-row-header">
      <span style="font-size: 0.78rem; font-weight: 700; color: var(--primary);">Item #${idx}</span>
      <button type="button" class="remove-item-btn" onclick="removeInvoiceItemRow(${idx})">
        <i class="fa-solid fa-trash"></i> Hapus
      </button>
    </div>
    <div class="form-row">
      <div>
        <label class="form-label">Pilih Produk Master *</label>
        <select id="invItemProduct-${idx}" class="form-input" onchange="onProductSelectChange(${idx})">
          ${productOptions}
        </select>
      </div>
      <div>
        <label class="form-label">Pilih Varian (Warna &amp; Ukuran) *</label>
        <select id="invItemVariant-${idx}" class="form-input" onchange="onVariantSelectChange(${idx})" disabled>
          <option value="">— Pilih produk terlebih dahulu —</option>
        </select>
      </div>
    </div>
    <div class="form-row-3" style="margin-top: 0.5rem;">
      <div>
        <label class="form-label">Qty Dipesan *</label>
        <input type="number" id="invItemQty-${idx}" class="form-input" value="1" min="1" oninput="updateInvoiceTotals()">
      </div>
      <div>
        <label class="form-label">Harga Pokok Unit (Rp) *</label>
        <input type="number" id="invItemCost-${idx}" class="form-input" value="0" min="0" oninput="updateInvoiceTotals()">
      </div>
      <div>
        <label class="form-label">Insentif Vendor Unit (Rp)</label>
        <input type="number" id="invItemIncentive-${idx}" class="form-input" value="0" min="0" oninput="updateInvoiceTotals()">
      </div>
    </div>
    <div style="text-align: right; margin-top: 0.4rem;">
      <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-muted);" id="invItemSubtotal-${idx}">Subtotal: Rp 0</span>
    </div>
  `;

  container.appendChild(rowDiv);
  updateInvoiceTotals();
}

function removeInvoiceItemRow(idx) {
  const el = document.getElementById('invItemRow-' + idx);
  if (el) el.remove();
  updateInvoiceTotals();
}

async function onProductSelectChange(rowIdx) {
  const prodSelect = document.getElementById('invItemProduct-' + rowIdx);
  const varSelect = document.getElementById('invItemVariant-' + rowIdx);
  const productId = prodSelect.value;

  if (!productId) {
    varSelect.innerHTML = '<option value="">— Pilih produk terlebih dahulu —</option>';
    varSelect.disabled = true;
    updateInvoiceTotals();
    return;
  }

  varSelect.disabled = true;
  varSelect.innerHTML = '<option value="">Memuat varian...</option>';

  try {
    let variants = variantsCache[productId];
    if (!variants) {
      const res = await fetch('/api/products/detail?id=' + encodeURIComponent(productId), {
        headers: { 'Authorization': 'Bearer ' + currentToken }
      });
      const data = await res.json();
      const rawVariants = (data.data && Array.isArray(data.data.variants)) ? data.data.variants : (Array.isArray(data.variants) ? data.variants : []);
      if (data.success && rawVariants.length > 0) {
        variants = rawVariants.filter(v => v.is_active === true || v.is_active === 'true' || v.is_active === 1 || v.is_active === undefined);
        variantsCache[productId] = variants;
      }
    }

    if (variants && variants.length > 0) {
      varSelect.innerHTML = '<option value="">— Pilih Warna & Ukuran —</option>' +
        variants.map(v => `<option value="${v.variant_id}" data-hpp="${v.reference_hpp || 0}">${v.color || 'Standar'} - ${v.size || 'All Size'} (SKU: ${v.sku || v.variant_id})</option>`).join('');
      varSelect.disabled = false;
    } else {
      varSelect.innerHTML = '<option value="">Tidak ada varian aktif</option>';
      varSelect.disabled = true;
    }
  } catch (err) {
    varSelect.innerHTML = '<option value="">Gagal memuat varian</option>';
    varSelect.disabled = true;
  }
}

function onVariantSelectChange(rowIdx) {
  const varSelect = document.getElementById('invItemVariant-' + rowIdx);
  const costInput = document.getElementById('invItemCost-' + rowIdx);
  const selectedOpt = varSelect.options[varSelect.selectedIndex];

  if (selectedOpt && selectedOpt.dataset.hpp) {
    const hpp = parseFloat(selectedOpt.dataset.hpp) || 0;
    if (hpp > 0 && parseFloat(costInput.value) === 0) {
      costInput.value = hpp;
    }
  }
  updateInvoiceTotals();
}

function updateInvoiceTotals() {
  let subtotal = 0;
  const container = document.getElementById('invoiceItemsContainer');
  const rows = container ? container.querySelectorAll('.item-row-container') : [];

  rows.forEach(r => {
    const id = r.id.replace('invItemRow-', '');
    const qtyInput = document.getElementById('invItemQty-' + id);
    const costInput = document.getElementById('invItemCost-' + id);
    const subLabel = document.getElementById('invItemSubtotal-' + id);

    if (qtyInput && costInput) {
      const q = parseInt(qtyInput.value, 10) || 0;
      const c = parseFloat(costInput.value) || 0;
      const s = q * c;
      subtotal += s;
      if (subLabel) subLabel.textContent = 'Subtotal: ' + formatRp(s);
    }
  });

  const shipping = parseFloat(document.getElementById('newInvoiceShipping')?.value) || 0;
  const grandTotal = subtotal + shipping;

  const subPrev = document.getElementById('invoiceSubtotalPreview');
  const shipPrev = document.getElementById('invoiceShippingPreview');
  const grandPrev = document.getElementById('invoiceGrandTotalPreview');

  if (subPrev) subPrev.textContent = formatRp(subtotal);
  if (shipPrev) shipPrev.textContent = formatRp(shipping);
  if (grandPrev) grandPrev.textContent = formatRp(grandTotal);
}

async function submitCreateInvoice() {
  hideAlert('createModalAlertBox');
  const btn = document.getElementById('submitCreateInvoiceBtn');
  const vendorSelect = document.getElementById('newInvoiceVendor');
  const vendorId = vendorSelect.value;
  const selectedVendorOpt = vendorSelect.options[vendorSelect.selectedIndex];
  const supplierName = selectedVendorOpt ? (selectedVendorOpt.dataset.name || selectedVendorOpt.text) : '';
  const purchaseDate = document.getElementById('newInvoiceDate').value;
  const shippingCost = parseFloat(document.getElementById('newInvoiceShipping').value) || 0;
  const notes = document.getElementById('newInvoiceNotes').value.trim();

  if (!vendorId) {
    showAlert('createModalAlertBox', 'error', 'Pilih Supplier dari data Manajemen Vendor terlebih dahulu.');
    return;
  }
  if (!purchaseDate) {
    showAlert('createModalAlertBox', 'error', 'Tanggal pembelian wajib diisi.');
    return;
  }

  // Collect items
  const container = document.getElementById('invoiceItemsContainer');
  const rows = container.querySelectorAll('.item-row-container');
  const items = [];

  for (let i = 0; i < rows.length; i++) {
    const id = rows[i].id.replace('invItemRow-', '');
    const varSelect = document.getElementById('invItemVariant-' + id);
    const variantId = varSelect ? varSelect.value : '';
    const qty = parseInt(document.getElementById('invItemQty-' + id)?.value, 10) || 0;
    const baseCost = parseFloat(document.getElementById('invItemCost-' + id)?.value) || 0;
    const incentive = parseFloat(document.getElementById('invItemIncentive-' + id)?.value) || 0;

    if (!variantId) {
      showAlert('createModalAlertBox', 'error', `Item #${i + 1}: Silakan pilih produk dan varian yang valid.`);
      return;
    }
    if (qty <= 0) {
      showAlert('createModalAlertBox', 'error', `Item #${i + 1}: Kuantitas harus lebih dari 0.`);
      return;
    }

    items.push({
      variant_id: variantId,
      quantity: qty,
      base_unit_cost: baseCost,
      vendor_incentive: incentive
    });
  }

  if (items.length === 0) {
    showAlert('createModalAlertBox', 'error', 'Tambahkan minimal satu item produk dalam faktur pembelian.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  try {
    const res = await fetch('/api/purchases/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify({
        supplier_name: supplierName,
        vendor_id: vendorId,
        purchase_date: purchaseDate,
        shipping_cost: shippingCost,
        notes: notes,
        items: items
      })
    });
    const data = await res.json();
    if (data.success) {
      closeCreateInvoiceModal();
      showAlert('purAlertBox', 'success',
        `✅ Faktur pembelian <strong>${data.purchase_id}</strong> berhasil dibuat! Total: ${formatRp(data.total_purchase)}. Status: Belum Diterima.`);
      loadPurchaseList();
    } else {
      showAlert('createModalAlertBox', 'error', '❌ ' + (data.error || 'Gagal membuat faktur pembelian.'));
    }
  } catch (err) {
    showAlert('createModalAlertBox', 'error', '❌ Koneksi gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i> Buat Faktur';
  }
}

// ============================================================
// MODAL 2: PENERIMAAN BARANG FISIK (HPP LOCKED & CONTEXTUAL)
// ============================================================
async function openReceiveModal(purchaseId) {
  hideAlert('receiveModalAlertBox');
  document.getElementById('rcvContextId').textContent = purchaseId;
  document.getElementById('rcvContextSupplier').textContent = 'Memuat...';
  document.getElementById('rcvContextStatus').textContent = 'Memuat...';
  document.getElementById('rcvShipmentNotes').value = '';

  const tbody = document.getElementById('receiveItemsTableBody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Memuat rincian faktur dari server...</td></tr>';
  document.getElementById('receiveModal').style.display = 'flex';

  try {
    const res = await fetch('/api/purchases/detail?purchase_id=' + encodeURIComponent(purchaseId), {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (data.success) {
      activeReceiveData = data;
      document.getElementById('rcvContextSupplier').textContent = data.supplier_name || '—';
      document.getElementById('rcvContextStatus').outerHTML = receivingStatusPill(data.receiving_status);

      const items = data.items || [];
      if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Tidak ada item terencana dalam faktur ini.</td></tr>';
        return;
      }

      tbody.innerHTML = items.map((it, idx) => {
        const remaining = it.qty_remaining !== undefined ? it.qty_remaining : Math.max(0, it.qty_ordered - it.qty_received);
        const isDone = remaining <= 0;

        return `
          <tr>
            <td>
              <strong>${it.product_name || it.variant_id}</strong><br>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${it.color || ''} ${it.size ? '• Size ' + it.size : ''} (${it.variant_id})</span>
            </td>
            <td style="text-align: center;"><strong>${it.qty_ordered}</strong></td>
            <td style="text-align: center; color: #059669; font-weight: 700;">${it.qty_received}</td>
            <td style="text-align: center; color: ${remaining > 0 ? '#DC2626' : '#059669'}; font-weight: 700;">
              ${remaining > 0 ? remaining : '0 ✅'}
            </td>
            <td>
              <span style="font-family: monospace; font-weight: 700;">${formatRp(it.base_unit_cost)}</span>
              <input type="hidden" id="rcvCost-${idx}" value="${it.base_unit_cost}">
              <input type="hidden" id="rcvIncentive-${idx}" value="${it.vendor_incentive || 0}">
              <input type="hidden" id="rcvVariant-${idx}" value="${it.variant_id}">
            </td>
            <td style="text-align: center;">
              ${!isDone ? `
                <input type="number" id="rcvQty-${idx}" class="form-input" value="${remaining}" min="0" max="${remaining}" style="text-align: center; font-weight: 700; width: 90px; padding: 4px;">
              ` : `
                <span style="font-size: 0.75rem; color: #059669; font-weight: 700;">Sudah Penuh</span>
                <input type="hidden" id="rcvQty-${idx}" value="0">
              `}
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #DC2626; padding: 1.5rem;">Gagal memuat: ${data.error}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #DC2626; padding: 1.5rem;">Koneksi gagal: ${err.message}</td></tr>`;
  }
}

function closeReceiveModal() {
  document.getElementById('receiveModal').style.display = 'none';
  activeReceiveData = null;
}

async function submitReceiveShipment() {
  if (!activeReceiveData) return;
  hideAlert('receiveModalAlertBox');
  const btn = document.getElementById('submitReceiveBtn');

  const items = activeReceiveData.items || [];
  const receivedItems = [];

  for (let i = 0; i < items.length; i++) {
    const qtyInput = document.getElementById('rcvQty-' + i);
    const qty = parseInt(qtyInput ? qtyInput.value : 0, 10) || 0;
    const variantId = document.getElementById('rcvVariant-' + i)?.value;
    const baseCost = parseFloat(document.getElementById('rcvCost-' + i)?.value) || 0;
    const incentive = parseFloat(document.getElementById('rcvIncentive-' + i)?.value) || 0;

    if (qty > 0 && variantId) {
      receivedItems.push({
        variant_id: variantId,
        quantity: qty,
        base_unit_cost: baseCost,
        vendor_incentive: incentive
      });
    }
  }

  if (receivedItems.length === 0) {
    showAlert('receiveModalAlertBox', 'error', 'Masukkan kuantitas barang yang baru diterima minimal 1 unit.');
    return;
  }

  // Generate invisible idempotency key behind the scenes
  const ts = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 15);
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  const idempotencyKey = 'RCPT-' + ts + '-' + rand;

  const notes = document.getElementById('rcvShipmentNotes').value.trim();

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses Penerimaan...';

  try {
    const res = await fetch('/api/purchases/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify({
        purchase_id: activeReceiveData.purchase_id,
        idempotency_key: idempotencyKey,
        notes: notes,
        received_items: receivedItems
      })
    });
    const data = await res.json();
    if (data.success) {
      closeReceiveModal();
      showAlert('purAlertBox', 'success',
        `✅ Penerimaan barang faktur <strong>${data.purchase_id}</strong> berhasil dicatat! Status: <strong>${data.new_receiving_status}</strong>. Stok fisik telah diperbarui ke batch FIFO.`);
      loadPurchaseList();
    } else {
      showAlert('receiveModalAlertBox', 'error', '❌ ' + (data.error || 'Gagal memproses penerimaan barang.'));
    }
  } catch (err) {
    showAlert('receiveModalAlertBox', 'error', '❌ Koneksi gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-box-open"></i> Konfirmasi Penerimaan Stok';
  }
}

// ============================================================
// MODAL 3: CATAT PEMBAYARAN FAKTUR SUPPLIER
// ============================================================
function openPaymentModal(purchaseId, supplierName, totalPurchase, totalPaid) {
  const remainingBill = Math.max(0, totalPurchase - totalPaid);
  activePaymentData = { purchaseId, supplierName, totalPurchase, totalPaid, remainingBill };

  document.getElementById('modalPurchaseId').textContent = purchaseId;
  document.getElementById('modalSupplierName').textContent = supplierName;
  document.getElementById('modalTotalPurchase').textContent = formatRp(totalPurchase);
  document.getElementById('modalTotalPaid').textContent = formatRp(totalPaid);
  document.getElementById('modalRemainingBill').textContent = formatRp(remainingBill);
  document.getElementById('modalPaymentAmount').value = remainingBill;
  document.getElementById('modalPaymentDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('modalPaymentNotes').value = '';

  hideAlert('modalAlertBox');
  document.getElementById('paymentModal').style.display = 'flex';
}

function closePaymentModal() {
  document.getElementById('paymentModal').style.display = 'none';
  activePaymentData = null;
}

function setPayFullAmount() {
  if (activePaymentData) {
    document.getElementById('modalPaymentAmount').value = activePaymentData.remainingBill;
  }
}

async function submitRecordPayment() {
  if (!activePaymentData) return;
  hideAlert('modalAlertBox');
  const btn = document.getElementById('modalSubmitPayBtn');

  const amount = parseFloat(document.getElementById('modalPaymentAmount').value);
  if (isNaN(amount) || amount <= 0) {
    showAlert('modalAlertBox', 'error', 'Nominal pembayaran harus berupa angka positif lebih dari 0.');
    return;
  }

  if (amount > activePaymentData.remainingBill + 1) {
    showAlert('modalAlertBox', 'error', `Nominal pembayaran (${formatRp(amount)}) melebihi sisa tagihan (${formatRp(activePaymentData.remainingBill)}).`);
    return;
  }

  const ts = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 15);
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const idempotencyKey = 'PAY-' + ts + '-' + rand;

  const payload = {
    purchase_id: activePaymentData.purchaseId,
    amount: amount,
    payment_date: document.getElementById('modalPaymentDate').value,
    payment_method: document.getElementById('modalPaymentMethod').value,
    idempotency_key: idempotencyKey,
    notes: document.getElementById('modalPaymentNotes').value
  };

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

  try {
    const res = await fetch('/api/purchases/payment-record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + currentToken
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closePaymentModal();
      showAlert('purAlertBox', 'success', `✅ Pembayaran faktur ${data.purchase_id} sebesar ${formatRp(data.amount_paid)} berhasil dicatat! Status: ${data.payment_status}.`);
      loadPurchaseList();
    } else {
      showAlert('modalAlertBox', 'error', '❌ ' + (data.error || 'Gagal mencatat pembayaran.'));
    }
  } catch (err) {
    showAlert('modalAlertBox', 'error', '❌ Koneksi gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan Pembayaran';
  }
}

// ============================================================
// MODAL 4: DETAIL LENGKAP FAKTUR PEMBELIAN
// ============================================================
async function openDetailModal(purchaseId) {
  document.getElementById('detPurchaseId').textContent = purchaseId;
  document.getElementById('detPurchaseDate').textContent = 'Memuat...';
  document.getElementById('detSupplierName').textContent = 'Memuat...';
  document.getElementById('detTotalPurchase').textContent = 'Memuat...';
  document.getElementById('detTotalPaid').textContent = 'Memuat...';
  document.getElementById('detRemainingBill').textContent = 'Memuat...';
  document.getElementById('detReceivingStatus').textContent = '—';
  document.getElementById('detPaymentStatus').textContent = '—';

  document.getElementById('detItemsTableBody').innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1rem;">Memuat rincian item...</td></tr>';
  document.getElementById('detPaymentsTableBody').innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1rem;">Memuat data pembayaran...</td></tr>';

  document.getElementById('detailModal').style.display = 'flex';

  try {
    const res = await fetch('/api/purchases/detail?purchase_id=' + encodeURIComponent(purchaseId), {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('detPurchaseDate').textContent = formatDate(data.purchase_date);
      document.getElementById('detSupplierName').textContent = data.supplier_name + (data.vendor_id ? ` (${data.vendor_id})` : '');
      document.getElementById('detTotalPurchase').textContent = formatRp(data.total_purchase);
      document.getElementById('detTotalPaid').textContent = formatRp(data.total_paid);
      document.getElementById('detRemainingBill').textContent = formatRp(data.remaining_bill);

      document.getElementById('detReceivingStatus').outerHTML = receivingStatusPill(data.receiving_status);
      document.getElementById('detPaymentStatus').outerHTML = paymentStatusPill(data.payment_status);

      // Render Items
      const items = data.items || [];
      const itemTbody = document.getElementById('detItemsTableBody');
      if (!items.length) {
        itemTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 1rem;">Tidak ada rincian item.</td></tr>';
      } else {
        itemTbody.innerHTML = items.map(it => `
          <tr>
            <td>
              <strong>${it.product_name || it.variant_id}</strong><br>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${it.color || ''} ${it.size ? '• Size ' + it.size : ''} (${it.variant_id})</span>
            </td>
            <td style="text-align: center;"><strong>${it.qty_ordered}</strong></td>
            <td style="text-align: center; color: #059669; font-weight: 700;">${it.qty_received}</td>
            <td style="text-align: center; color: ${it.qty_remaining > 0 ? '#DC2626' : '#059669'}; font-weight: 700;">${it.qty_remaining}</td>
            <td>${formatRp(it.base_unit_cost)}</td>
            <td>${formatRp(it.vendor_incentive)}</td>
            <td>${it.is_fully_received ? '<span class="status-pill status-fully">Lengkap</span>' : '<span class="status-pill status-partial">Belum Lengkap</span>'}</td>
          </tr>
        `).join('');
      }

      // Render Payments
      const payments = data.payments || [];
      const pmtTbody = document.getElementById('detPaymentsTableBody');
      if (!payments.length) {
        pmtTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 1rem;">Belum ada riwayat pembayaran untuk faktur ini.</td></tr>';
      } else {
        pmtTbody.innerHTML = payments.map(p => `
          <tr>
            <td><strong style="font-family: monospace; font-size: 0.72rem;">${p.payment_id}</strong></td>
            <td>${formatDate(p.payment_date)}</td>
            <td><strong style="color: #059669;">${formatRp(p.amount)}</strong></td>
            <td><span style="background: #F1F5F9; padding: 2px 6px; border-radius: 4px; font-size: 0.72rem;">${p.payment_method || '—'}</span></td>
            <td>${p.notes || '—'}</td>
            <td>${p.created_by || '—'}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load purchase detail:', err);
  }
}

function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
}

// ============================================================
// MODAL 5: RIWAYAT PEMBAYARAN CEPAT
// ============================================================
async function openHistoryModal(purchaseId) {
  document.getElementById('histPurchaseId').textContent = purchaseId;
  document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Memuat riwayat...</td></tr>';
  document.getElementById('historyModal').style.display = 'flex';

  try {
    const res = await fetch('/api/purchases/payments?purchase_id=' + encodeURIComponent(purchaseId), {
      headers: { 'Authorization': 'Bearer ' + currentToken }
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('histSupplierName').textContent = data.supplier_name || '—';
      document.getElementById('histTotalPurchase').textContent = formatRp(data.total_purchase);
      document.getElementById('histTotalPaid').textContent = formatRp(data.total_paid);
      document.getElementById('histRemainingBill').textContent = formatRp(data.remaining_bill);

      const tbody = document.getElementById('historyTableBody');
      if (!data.payments || !data.payments.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Belum ada riwayat pembayaran untuk faktur ini.</td></tr>';
        return;
      }

      tbody.innerHTML = data.payments.map(pm => `
        <tr>
          <td><strong style="font-family: monospace; font-size: 0.72rem;">${pm.payment_id}</strong></td>
          <td>${formatDate(pm.payment_date)}</td>
          <td><strong style="color: #059669;">${formatRp(pm.amount)}</strong></td>
          <td><span class="status-pill status-unreceived">${pm.payment_method || '—'}</span></td>
          <td style="font-size: 0.75rem; color: var(--text-muted);">${pm.notes || '—'}</td>
          <td style="font-size: 0.75rem;">${pm.created_by || '—'}</td>
        </tr>
      `).join('');
    } else {
      document.getElementById('historyTableBody').innerHTML = `<tr><td colspan="6" style="text-align:center; color: #DC2626; padding: 1.5rem;">Gagal memuat: ${data.error}</td></tr>`;
    }
  } catch (err) {
    document.getElementById('historyTableBody').innerHTML = `<tr><td colspan="6" style="text-align:center; color: #DC2626; padding: 1.5rem;">Koneksi gagal: ${err.message}</td></tr>`;
  }
}

function closeHistoryModal() {
  document.getElementById('historyModal').style.display = 'none';
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  verifySession();
});
