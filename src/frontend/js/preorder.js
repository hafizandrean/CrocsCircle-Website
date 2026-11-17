// CrocsCircle.ID — Pre-Order (PO) Frontend Controller (Vanilla JS)
// Version: 1.0.0 (Phase 3D - Sub-Modul 2: Manajemen Pre-Order)

const PO_STATE = {
  token: null,
  user: null,
  variants: [],
  orders: [],
  currentPo: null,
  searchDebounceTimer: null
};

// Helper: Format Rupiah
function formatRupiah(num) {
  if (num === null || num === undefined || isNaN(num)) return "Rp0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}

// Helper: Format Date
function formatDateIndo(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(d);
}

// Helper: Generate UUID for Idempotency
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'po-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
}

// Helper: Sanitize Phone for WhatsApp
function sanitizeWaPhone(phone) {
  if (!phone) return "";
  let cleaned = String(phone).replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.substring(1);
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// 1. INITIALIZATION & SESSION GUARD
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const devToken = urlParams.get("token");
  if (devToken) {
    sessionStorage.setItem("crocscircle_admin_token", devToken);
  }

  const token = sessionStorage.getItem("crocscircle_admin_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  PO_STATE.token = token;

  try {
    const sessionRes = await fetch('/api/session', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success || !sessionData.user) {
      alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
      sessionStorage.removeItem("crocscircle_admin_token");
      sessionStorage.removeItem("crocscircle_admin_user");
      window.location.href = "login.html";
      return;
    }

    PO_STATE.user = sessionData.user;
    renderUserProfile(sessionData.user);

    // Muat Varian Produk untuk Dropdown PO
    await loadVariantsForPO();

    // Muat Daftar PO
    await loadPOList();

    // Tampilkan Layout Utama
    document.getElementById("authLoadingOverlay").style.display = "none";
    document.getElementById("poMainLayout").style.display = "flex";

  } catch (err) {
    alert("Gagal memverifikasi autentikasi ke server: " + err.message);
    window.location.href = "login.html";
  }
});

// Render User Profile & RBAC UI
function renderUserProfile(user) {
  const fullNameEl = document.getElementById("userFullName");
  const roleBadgeEl = document.getElementById("userRoleBadge");
  const avatarEl = document.getElementById("userAvatar");
  const isOwner = user.role === "OWNER";

  fullNameEl.innerText = user.full_name || user.username;
  avatarEl.innerText = (user.full_name || user.username).charAt(0).toUpperCase();

  if (isOwner) {
    roleBadgeEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:0.25rem; font-weight:700; color:#166534;"><i class="fa-solid fa-crown" style="color:#EAB308;"></i> OWNER</span>`;
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "flex");
  } else {
    roleBadgeEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:0.25rem; font-weight:700; color:#0369A1;"><i class="fa-solid fa-user-gear"></i> ADMIN</span>`;
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "none");
  }
}

function handleLogout() {
  if (confirm("Apakah Anda yakin ingin keluar dari sistem?")) {
    sessionStorage.removeItem("crocscircle_admin_token");
    sessionStorage.removeItem("crocscircle_admin_user");
    window.location.href = "login.html";
  }
}

function showPlaceholder(moduleName) {
  alert(`Modul "${moduleName}" dijadwalkan pada milestone berikutnya sesuai Roadmap Implementasi CrocsCircle.ID.`);
}

// ---------------------------------------------------------------------------
// 2. LOAD VARIANTS FOR PO DROPDOWN
// ---------------------------------------------------------------------------
async function loadVariantsForPO() {
  const selectEl = document.getElementById("newPoVariantSelect");
  try {
    const res = await fetch('/api/pos/variants', {
      headers: { 'Authorization': `Bearer ${PO_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Gagal memuat varian produk");

    PO_STATE.variants = data.variants || [];
    selectEl.innerHTML = `<option value="">-- Pilih Varian Produk --</option>`;

    PO_STATE.variants.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.variant_id;
      opt.textContent = `[${v.sku}] ${v.product_name} - ${v.color} (${v.size}) — ${formatRupiah(v.catalog_price)}`;
      opt.dataset.price = v.catalog_price || 0;
      opt.dataset.sku = v.sku;
      opt.dataset.title = `${v.product_name} - ${v.color} (${v.size})`;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading variants:", err);
  }
}

function handlePoVariantChange() {
  const selectEl = document.getElementById("newPoVariantSelect");
  const selectedOpt = selectEl.options[selectEl.selectedIndex];
  if (selectedOpt && selectedOpt.dataset.price) {
    const price = Number(selectedOpt.dataset.price) || 0;
    document.getElementById("newPoPrice").value = price;
  }
  calculatePoTotal();
}

function calculatePoTotal() {
  const qty = Number(document.getElementById("newPoQuantity").value) || 0;
  const price = Number(document.getElementById("newPoPrice").value) || 0;
  const total = qty * price;
  document.getElementById("newPoTotalOrderPreview").innerText = formatRupiah(total);
}

// ---------------------------------------------------------------------------
// 3. LOAD & RENDER PRE-ORDER LIST & METRICS
// ---------------------------------------------------------------------------
function handlePoSearch(val) {
  clearTimeout(PO_STATE.searchDebounceTimer);
  PO_STATE.searchDebounceTimer = setTimeout(() => {
    loadPOList();
  }, 350);
}

async function loadPOList() {
  const tableBody = document.getElementById("poTableBody");
  tableBody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; color: var(--accent); margin-bottom: 0.5rem;"></i>
        <p>Memuat daftar pesanan Pre-Order...</p>
      </td>
    </tr>
  `;

  const search = document.getElementById("poSearchInput").value.trim();
  const paymentStatus = document.getElementById("filterPaymentStatus").value;
  const procurementStatus = document.getElementById("filterProcurementStatus").value;
  const fulfillmentStatus = document.getElementById("filterFulfillmentStatus").value;
  const startDate = document.getElementById("poStartDate").value;
  const endDate = document.getElementById("poEndDate").value;

  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (paymentStatus && paymentStatus !== "ALL") params.append("payment_status", paymentStatus);
  if (procurementStatus && procurementStatus !== "ALL") params.append("procurement_status", procurementStatus);
  if (fulfillmentStatus && fulfillmentStatus !== "ALL") params.append("fulfillment_status", fulfillmentStatus);
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);

  try {
    const res = await fetch(`/api/po/list?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${PO_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Gagal mengambil data PO");

    PO_STATE.orders = data.data || [];
    renderPOMetrics(PO_STATE.orders);
    renderPOTable(PO_STATE.orders);
  } catch (err) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 2rem; color: var(--danger);">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
          <p>Terjadi kesalahan saat memuat data: ${err.message}</p>
        </td>
      </tr>
    `;
  }
}

function renderPOMetrics(orders) {
  let activeCount = 0;
  let totalDPAmount = 0;
  let receivedCount = 0;
  let recognizedOmzet = 0;

  const currentYearMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  orders.forEach(po => {
    const isCancelled = po.fulfillment_status === "CANCELLED" || po.status === "CANCELLED";
    const isDelivered = po.fulfillment_status === "DELIVERED" || po.status === "FULFILLED";

    if (!isCancelled && !isDelivered) {
      activeCount++;
      // DP liability: paid amount for active POs that are not yet fully paid/settled
      if (po.payment_status === "PARTIAL" || po.payment_status === "UNPAID") {
        totalDPAmount += (Number(po.total_paid) || 0);
      }
    }

    if (po.procurement_status === "RECEIVED" && !isDelivered && !isCancelled) {
      receivedCount++;
    }

    // Omzet is ONLY recognized when payment_status === 'PAID' in the month of settlement_date
    if (po.payment_status === "PAID" && po.settlement_date) {
      const settlementYM = String(po.settlement_date).substring(0, 7);
      if (settlementYM === currentYearMonth) {
        recognizedOmzet += (Number(po.total_amount) || 0);
      }
    }
  });

  document.getElementById("metricActivePOCount").innerText = activeCount;
  document.getElementById("metricTotalDPAmount").innerText = formatRupiah(totalDPAmount);
  document.getElementById("metricReceivedPOCount").innerText = receivedCount;
  document.getElementById("metricRecognizedOmzet").innerText = formatRupiah(recognizedOmzet);
}

function renderPOTable(orders) {
  const tableBody = document.getElementById("poTableBody");
  if (!orders || orders.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; color: #CBD5E1;"></i>
          <p>Belum ada data pesanan Pre-Order yang sesuai dengan filter.</p>
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = orders.map(po => {
    // Payment status badge
    let paymentBadge = `<span class="status-pill status-unpaid"><i class="fa-solid fa-clock"></i> BELUM BAYAR</span>`;
    if (po.payment_status === "PARTIAL") {
      paymentBadge = `<span class="status-pill status-partial"><i class="fa-solid fa-hand-holding-dollar"></i> DP (PARTIAL)</span>`;
    } else if (po.payment_status === "PAID") {
      paymentBadge = `<span class="status-pill status-paid"><i class="fa-solid fa-circle-check"></i> LUNAS (PAID)</span>`;
    } else if (po.payment_status === "REFUNDED" || po.payment_status === "PARTIAL_REFUNDED") {
      paymentBadge = `<span class="status-pill status-refunded"><i class="fa-solid fa-rotate-left"></i> REFUND</span>`;
    }

    // Procurement status badge
    let procBadge = `<span class="status-pill status-proc-not">BELUM DIPESAN</span>`;
    if (po.procurement_status === "ORDERED") {
      procBadge = `<span class="status-pill status-proc-ordered"><i class="fa-solid fa-cart-shopping"></i> DIPESAN</span>`;
    } else if (po.procurement_status === "IN_TRANSIT") {
      procBadge = `<span class="status-pill status-proc-ordered"><i class="fa-solid fa-truck-fast"></i> DIKIRIM</span>`;
    } else if (po.procurement_status === "RECEIVED") {
      procBadge = `<span class="status-pill status-proc-received"><i class="fa-solid fa-box-check"></i> TIBA</span>`;
    }

    // Fulfillment status badge
    let fulBadge = `<span class="status-pill status-ful-not">BELUM DISERAHKAN</span>`;
    if (po.fulfillment_status === "READY_FOR_PICKUP") {
      fulBadge = `<span class="status-pill status-proc-received"><i class="fa-solid fa-bell"></i> SIAP DIAMBIL</span>`;
    } else if (po.fulfillment_status === "DELIVERED") {
      fulBadge = `<span class="status-pill status-ful-delivered"><i class="fa-solid fa-circle-check"></i> DISERAHKAN</span>`;
    } else if (po.fulfillment_status === "CANCELLED") {
      fulBadge = `<span class="status-pill status-ful-cancelled"><i class="fa-solid fa-ban"></i> BATAL</span>`;
    }

    const totalAmt = Number(po.total_amount) || 0;
    const paidAmt = Number(po.total_paid) || 0;
    const remainingAmt = Math.max(0, totalAmt - paidAmt);
    const isCancelled = po.fulfillment_status === "CANCELLED" || po.status === "CANCELLED";
    const isDelivered = po.fulfillment_status === "DELIVERED" || po.status === "FULFILLED";

    // Action buttons
    let actionButtons = `
      <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
    `;

    // WhatsApp button (always available)
    actionButtons += `
      <button onclick="openWaModal('${po.po_id}')" title="Template WhatsApp" style="background: #25D366; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">
        <i class="fa-brands fa-whatsapp"></i>
      </button>
    `;

    // Payment button (if not paid and not cancelled)
    if (po.payment_status !== "PAID" && !isCancelled) {
      actionButtons += `
        <button onclick="openPaymentModal('${po.po_id}')" title="Catat Pembayaran / Pelunasan" style="background: #15803D; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">
          <i class="fa-solid fa-hand-holding-dollar"></i> Bayar
        </button>
      `;
    }

    // Procurement button (if not received and not cancelled)
    if (po.procurement_status !== "RECEIVED" && !isCancelled) {
      actionButtons += `
        <button onclick="openProcurementModal('${po.po_id}')" title="Update Pengadaan Supplier" style="background: #0369A1; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">
          <i class="fa-solid fa-truck"></i> Pengadaan
        </button>
      `;
    }

    // Fulfillment button (if received and not delivered and not cancelled)
    if (po.procurement_status === "RECEIVED" && !isDelivered && !isCancelled) {
      actionButtons += `
        <button onclick="openFulfillModal('${po.po_id}')" title="Serah Terima Barang ke Customer" style="background: #047857; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">
          <i class="fa-solid fa-hand-holding-hand"></i> Serah Terima
        </button>
      `;
    }

    // Cancel button (if not delivered and not cancelled)
    if (!isDelivered && !isCancelled) {
      actionButtons += `
        <button onclick="openCancelPOModal('${po.po_id}')" title="Batalkan PO & Refund" style="background: #DC2626; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">
          <i class="fa-solid fa-ban"></i>
        </button>
      `;
    }

    actionButtons += `</div>`;

    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td>
          <div style="font-weight: 800; color: var(--primary); font-family: monospace;">${po.po_id}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">${formatDateIndo(po.order_date || po.created_at)}</div>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(po.customer_name || "-")}</div>
          <div style="font-size: 0.72rem; color: #0369A1;">
            <i class="fa-brands fa-whatsapp"></i> ${escapeHtml(po.customer_contact || "-")}
          </div>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(po.product_name || "Produk PO")}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">
            ${escapeHtml(po.color || "")} | ${escapeHtml(po.size || "")} (${po.quantity || 1} pcs)
          </div>
          <div style="font-size: 0.68rem; color: #64748B;">SKU: ${escapeHtml(po.sku || "-")}</div>
        </td>
        <td style="text-align: right; font-weight: 700; color: var(--primary);">
          ${formatRupiah(totalAmt)}
        </td>
        <td style="text-align: right; font-weight: 700; color: #15803D;">
          ${formatRupiah(paidAmt)}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${remainingAmt > 0 ? '#B45309' : '#059669'};">
          ${formatRupiah(remainingAmt)}
        </td>
        <td style="text-align: center;">${paymentBadge}</td>
        <td style="text-align: center;">${procBadge}</td>
        <td style="text-align: center;">${fulBadge}</td>
        <td style="text-align: center;">${actionButtons}</td>
      </tr>
    `;
  }).join("");
}

// ---------------------------------------------------------------------------
// 4. MODAL 1: CREATE PRE-ORDER
// ---------------------------------------------------------------------------
function openCreatePOModal() {
  document.getElementById("newPoCustomerName").value = "";
  document.getElementById("newPoCustomerContact").value = "";
  document.getElementById("newPoVariantSelect").value = "";
  document.getElementById("newPoQuantity").value = "1";
  document.getElementById("newPoPrice").value = "0";
  document.getElementById("newPoSupplier").value = "";
  document.getElementById("newPoNotes").value = "";
  document.getElementById("newPoDpAmount").value = "0";
  document.getElementById("newPoDpMethod").value = "TRANSFER_BCA";

  // Target ETA: today + 10 days
  const etaDate = new Date();
  etaDate.setDate(etaDate.getDate() + 10);
  document.getElementById("newPoEta").value = etaDate.toISOString().substring(0, 10);

  calculatePoTotal();
  document.getElementById("createPOModal").style.display = "flex";
}

function closeCreatePOModal() {
  document.getElementById("createPOModal").style.display = "none";
}

async function submitCreatePO() {
  const customerName = document.getElementById("newPoCustomerName").value.trim();
  const customerContact = document.getElementById("newPoCustomerContact").value.trim();
  const variantId = document.getElementById("newPoVariantSelect").value;
  const quantity = Number(document.getElementById("newPoQuantity").value) || 0;
  const agreedPrice = Number(document.getElementById("newPoPrice").value) || 0;
  const supplier = document.getElementById("newPoSupplier").value.trim();
  const targetEta = document.getElementById("newPoEta").value;
  const dpAmount = Number(document.getElementById("newPoDpAmount").value) || 0;
  const dpMethod = document.getElementById("newPoDpMethod").value;
  const notes = document.getElementById("newPoNotes").value.trim();

  if (!customerName) {
    alert("Mohon masukkan nama pelanggan.");
    return;
  }
  if (!variantId) {
    alert("Mohon pilih varian produk yang dipesan.");
    return;
  }
  if (quantity <= 0) {
    alert("Kuantitas pemesanan harus lebih besar dari 0.");
    return;
  }
  if (agreedPrice <= 0) {
    alert("Harga jual yang disepakati harus lebih besar dari 0.");
    return;
  }

  const btn = document.getElementById("saveNewPoBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

  try {
    const payload = {
      customer_name: customerName,
      customer_contact: customerContact,
      variant_id: variantId,
      quantity: quantity,
      agreed_price: agreedPrice,
      supplier_info: supplier,
      target_eta: targetEta,
      initial_dp: dpAmount,
      initial_dp_method: dpMethod,
      notes: notes,
      idempotency_key: generateUUID()
    };

    const res = await fetch('/api/po/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PO_STATE.token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Gagal menyimpan Pre-Order");
    }

    alert(`Pre-Order berhasil dibuat dengan No. PO: ${result.po_id}!`);
    closeCreatePOModal();
    await loadPOList();

  } catch (err) {
    alert("Gagal membuat Pre-Order: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Pre-Order`;
  }
}

// ---------------------------------------------------------------------------
// 5. MODAL 2: CATAT PEMBAYARAN (DP / PELUNASAN)
// ---------------------------------------------------------------------------
function openPaymentModal(poId) {
  const po = PO_STATE.orders.find(o => o.po_id === poId);
  if (!po) return;
  PO_STATE.currentPo = po;

  const total = Number(po.total_amount) || 0;
  const paid = Number(po.total_paid) || 0;
  const remaining = Math.max(0, total - paid);

  document.getElementById("paymentPoInfo").innerHTML = `
    <div><strong>No. PO:</strong> <span style="font-family: monospace;">${po.po_id}</span></div>
    <div><strong>Pelanggan:</strong> ${escapeHtml(po.customer_name)} (${escapeHtml(po.customer_contact || "-")})</div>
    <div><strong>Produk:</strong> ${escapeHtml(po.product_name)} - ${escapeHtml(po.color)} (${escapeHtml(po.size)}) [${po.quantity} pcs]</div>
    <div style="margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dashed var(--border); display: flex; justify-content: space-between;">
      <span>Total Tagihan: <strong>${formatRupiah(total)}</strong></span>
      <span>Sudah Terbayar: <strong style="color: #15803D;">${formatRupiah(paid)}</strong></span>
    </div>
    <div style="margin-top: 0.25rem; color: #B45309; font-weight: 700;">
      Sisa Pelunasan: ${formatRupiah(remaining)}
    </div>
  `;

  document.getElementById("poPaymentAmountInput").value = remaining > 0 ? remaining : 0;
  document.getElementById("poPaymentMethodSelect").value = "TRANSFER_BCA";
  document.getElementById("poPaymentNotesInput").value = remaining > 0 ? "Pelunasan Pre-Order" : "Pembayaran PO";

  document.getElementById("paymentModal").style.display = "flex";
}

function closePaymentModal() {
  document.getElementById("paymentModal").style.display = "none";
  PO_STATE.currentPo = null;
}

async function submitPoPayment() {
  if (!PO_STATE.currentPo) return;
  const amount = Number(document.getElementById("poPaymentAmountInput").value) || 0;
  const method = document.getElementById("poPaymentMethodSelect").value;
  const notes = document.getElementById("poPaymentNotesInput").value.trim();

  if (amount <= 0) {
    alert("Nominal pembayaran harus lebih besar dari 0.");
    return;
  }

  const btn = document.getElementById("submitPaymentBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

  try {
    const payload = {
      po_id: PO_STATE.currentPo.po_id,
      payment_amount: amount,
      payment_method: method,
      notes: notes,
      idempotency_key: generateUUID()
    };

    const res = await fetch('/api/po/payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PO_STATE.token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Gagal mencatat pembayaran");
    }

    alert(`Pembayaran berhasil dicatat! Status pembayaran PO sekarang: ${result.new_status || 'BERHASIL'}`);
    closePaymentModal();
    await loadPOList();

  } catch (err) {
    alert("Gagal mencatat pembayaran: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> Simpan Pembayaran`;
  }
}

// ---------------------------------------------------------------------------
// 6. MODAL 3: STATUS PENGADAAN SUPPLIER
// ---------------------------------------------------------------------------
function openProcurementModal(poId) {
  const po = PO_STATE.orders.find(o => o.po_id === poId);
  if (!po) return;
  PO_STATE.currentPo = po;

  document.getElementById("procurementPoInfo").innerHTML = `
    <div><strong>No. PO:</strong> <span style="font-family: monospace;">${po.po_id}</span></div>
    <div><strong>Produk:</strong> ${escapeHtml(po.product_name)} - ${escapeHtml(po.color)} (${escapeHtml(po.size)}) [${po.quantity} pcs]</div>
    <div><strong>Supplier:</strong> ${escapeHtml(po.supplier_info || "Supplier")}</div>
    <div><strong>Target ETA:</strong> ${formatDateIndo(po.target_eta)}</div>
    <div style="margin-top: 0.3rem;">Status Saat Ini: <strong>${po.procurement_status || "NOT_ORDERED"}</strong></div>
  `;

  // Select matching radio
  const radios = document.getElementsByName("procStatusRadio");
  radios.forEach(r => {
    r.checked = (r.value === (po.procurement_status || "NOT_ORDERED"));
  });

  document.getElementById("procurementModal").style.display = "flex";
}

function closeProcurementModal() {
  document.getElementById("procurementModal").style.display = "none";
  PO_STATE.currentPo = null;
}

async function submitProcurementStatus() {
  if (!PO_STATE.currentPo) return;
  const radios = document.getElementsByName("procStatusRadio");
  let selectedStatus = null;
  radios.forEach(r => {
    if (r.checked) selectedStatus = r.value;
  });

  if (!selectedStatus) {
    alert("Pilih status pengadaan yang baru.");
    return;
  }

  const btn = document.getElementById("saveProcurementBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;

  try {
    const res = await fetch('/api/po/procurement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PO_STATE.token}`
      },
      body: JSON.stringify({
        po_id: PO_STATE.currentPo.po_id,
        status: selectedStatus
      })
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Gagal memperbarui status pengadaan");
    }

    // Jika status RECEIVED dan belum dialokasikan stok, tawarkan alokasi/reservasi otomatis
    if (selectedStatus === "RECEIVED") {
      try {
        await fetch('/api/po/allocate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PO_STATE.token}`
          },
          body: JSON.stringify({
            po_id: PO_STATE.currentPo.po_id,
            stock_category: 'OWNED'
          })
        });
      } catch (allocErr) {
        console.warn("Stock allocation notice:", allocErr);
      }
    }

    alert(`Status pengadaan PO berhasil diperbarui menjadi ${selectedStatus}!`);
    closeProcurementModal();
    await loadPOList();

  } catch (err) {
    alert("Gagal memperbarui status pengadaan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Status`;
  }
}

// ---------------------------------------------------------------------------
// 7. MODAL 4: SERAH TERIMA BARANG (FULFILLMENT)
// ---------------------------------------------------------------------------
function openFulfillModal(poId) {
  const po = PO_STATE.orders.find(o => o.po_id === poId);
  if (!po) return;
  PO_STATE.currentPo = po;

  const total = Number(po.total_amount) || 0;
  const paid = Number(po.total_paid) || 0;
  const isPaid = po.payment_status === "PAID" || paid >= total;

  let warningBox = "";
  if (!isPaid) {
    warningBox = `
      <div style="background: #FEF3C7; border: 1px solid #FDE68A; padding: 0.5rem; border-radius: 6px; color: #92400E; margin-top: 0.5rem; font-size: 0.75rem;">
        <i class="fa-solid fa-triangle-exclamation"></i> <strong>Perhatian:</strong> Pesanan ini belum lunas (Sisa: ${formatRupiah(total - paid)}). Pastikan pembayaran telah diterima atau disepakati sebelum penyerahan barang.
      </div>
    `;
  }

  document.getElementById("fulfillPoInfo").innerHTML = `
    <div><strong>No. PO:</strong> <span style="font-family: monospace;">${po.po_id}</span></div>
    <div><strong>Pelanggan:</strong> ${escapeHtml(po.customer_name)} (${escapeHtml(po.customer_contact || "-")})</div>
    <div><strong>Barang yang Diserahkan:</strong> ${escapeHtml(po.product_name)} - ${escapeHtml(po.color)} (${escapeHtml(po.size)}) [${po.quantity} pcs]</div>
    <div><strong>Status Pembayaran:</strong> <span style="font-weight: 700; color: ${isPaid ? '#15803D' : '#B45309'};">${po.payment_status || "UNPAID"}</span></div>
    ${warningBox}
  `;

  document.getElementById("fulfillModal").style.display = "flex";
}

function closeFulfillModal() {
  document.getElementById("fulfillModal").style.display = "none";
  PO_STATE.currentPo = null;
}

async function submitFulfillPO() {
  if (!PO_STATE.currentPo) return;

  const btn = document.getElementById("confirmFulfillBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;

  try {
    const res = await fetch('/api/po/fulfill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PO_STATE.token}`
      },
      body: JSON.stringify({
        po_id: PO_STATE.currentPo.po_id,
        stock_category: 'OWNED'
      })
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Gagal memproses penyerahan barang");
    }

    alert(`Barang PO berhasil diserahkan kepada pelanggan dan stok reservasi telah dipotong secara resmi!`);
    closeFulfillModal();
    await loadPOList();

  } catch (err) {
    alert("Gagal memproses penyerahan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-hand-holding-hand"></i> Serahkan Barang`;
  }
}

// ---------------------------------------------------------------------------
// 8. MODAL 5: PEMBATALAN PO & REFUND
// ---------------------------------------------------------------------------
function openCancelPOModal(poId) {
  const po = PO_STATE.orders.find(o => o.po_id === poId);
  if (!po) return;
  PO_STATE.currentPo = po;

  const paid = Number(po.total_paid) || 0;
  const refunded = Number(po.total_refunded) || 0;
  const maxRefund = Math.max(0, paid - refunded);

  const isReceived = po.procurement_status === "RECEIVED";

  document.getElementById("cancelPoInfo").innerHTML = `
    <div><strong>No. PO:</strong> <span style="font-family: monospace;">${po.po_id}</span></div>
    <div><strong>Pelanggan:</strong> ${escapeHtml(po.customer_name)}</div>
    <div><strong>Total Pembayaran Masuk:</strong> ${formatRupiah(paid)}</div>
    <div><strong>Refund Sebelumnya:</strong> ${formatRupiah(refunded)}</div>
    <div style="font-weight: 700; margin-top: 0.25rem;">Maksimal Refund Tersedia: ${formatRupiah(maxRefund)}</div>
    ${isReceived ? '<div style="margin-top: 0.4rem; font-size: 0.72rem; color: #B91C1C;"><strong>Catatan Stok:</strong> Barang sudah diterima di gudang/toko. Pembatalan akan otomatis melepaskan reservasi barang ini menjadi stok siap jual (ready stock).</div>' : ''}
  `;

  document.getElementById("cancelPoRefundAmountInput").value = maxRefund;
  document.getElementById("cancelPoRefundAmountInput").max = maxRefund;
  document.getElementById("cancelPoMaxRefundNotice").innerText = `Maksimal refund: ${formatRupiah(maxRefund)}`;
  document.getElementById("cancelPoReasonInput").value = "";

  document.getElementById("cancelPoModal").style.display = "flex";
}

function closeCancelPOModal() {
  document.getElementById("cancelPoModal").style.display = "none";
  PO_STATE.currentPo = null;
}

async function submitCancelPO() {
  if (!PO_STATE.currentPo) return;
  const refundAmount = Number(document.getElementById("cancelPoRefundAmountInput").value) || 0;
  const refundMethod = document.getElementById("cancelPoRefundMethodSelect").value;
  const reason = document.getElementById("cancelPoReasonInput").value.trim();

  if (!reason) {
    alert("Mohon isi alasan pembatalan PO.");
    return;
  }

  const btn = document.getElementById("confirmCancelPoBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses...`;

  try {
    const res = await fetch('/api/po/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PO_STATE.token}`
      },
      body: JSON.stringify({
        po_id: PO_STATE.currentPo.po_id,
        reason: reason,
        refund_amount: refundAmount,
        payment_method: refundMethod,
        stock_category: 'OWNED',
        idempotency_key: generateUUID()
      })
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Gagal membatalkan PO");
    }

    alert(`Pesanan Pre-Order berhasil dibatalkan. Dana refund ${formatRupiah(refundAmount)} telah dicatat!`);
    closeCancelPOModal();
    await loadPOList();

  } catch (err) {
    alert("Gagal membatalkan PO: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-ban"></i> Konfirmasi Pembatalan`;
  }
}

// ---------------------------------------------------------------------------
// 9. MODAL 6: TEMPLATE PESAN WHATSAPP
// ---------------------------------------------------------------------------
function openWaModal(poId) {
  const po = PO_STATE.orders.find(o => o.po_id === poId);
  if (!po) return;
  PO_STATE.currentPo = po;

  generateWaText('DP_CONFIRM');
  document.getElementById("waTemplateModal").style.display = "flex";
}

function closeWaTemplateModal() {
  document.getElementById("waTemplateModal").style.display = "none";
  PO_STATE.currentPo = null;
}

function generateWaText(type) {
  const po = PO_STATE.currentPo;
  if (!po) return;

  const total = Number(po.total_amount) || 0;
  const paid = Number(po.total_paid) || 0;
  const remaining = Math.max(0, total - paid);
  const etaStr = formatDateIndo(po.target_eta);
  const prodTitle = `${po.product_name} - ${po.color} (${po.size}) [${po.quantity} pcs]`;

  let text = "";
  if (type === 'DP_CONFIRM') {
    text = `Halo Kak ${po.customer_name},\n\nTerima kasih telah melakukan pemesanan Pre-Order di *CrocsCircle.ID*! 🐊✨\n\nBerikut rincian pesanan Kakak:\n• No. PO: *${po.po_id}*\n• Produk: *${prodTitle}*\n• Total Pesanan: *${formatRupiah(total)}*\n• Uang Muka (DP) Diterima: *${formatRupiah(paid)}*\n• Sisa Pelunasan: *${formatRupiah(remaining)}*\n• Estimasi Tiba (Target ETA): *${etaStr}*\n\nPesanan Kakak sudah masuk antrean pengadaan ke supplier kami. Kami akan segera menginfokan begitu barang tiba di CrocsCircle.ID.\n\nTerima kasih atas kepercayaannya! 🙏`;
  } else if (type === 'ARRIVED_READY') {
    text = `Kabar gembira Kak ${po.customer_name}! 🎉\n\nPesanan Pre-Order Kakak di *CrocsCircle.ID* telah tiba di gudang/toko kami!\n\n• No. PO: *${po.po_id}*\n• Produk: *${prodTitle}*\n• Sisa Pelunasan: *${formatRupiah(remaining)}*\n\nMohon lakukan pelunasan sisa tagihan agar pesanan Kakak dapat segera kami kirimkan / siap diambil di toko.\n\nRekening Pembayaran Resmi:\n• Bank BCA: *1234567890* a.n. CrocsCircle Indonesia\n\nSilakan kirimkan bukti transfer setelah melakukan pembayaran ya Kak. Terima kasih! 🙏`;
  } else if (type === 'SETTLEMENT_DONE') {
    text = `Halo Kak ${po.customer_name},\n\nTerima kasih banyak! Pembayaran pesanan Pre-Order Kakak (*${po.po_id}*) telah *LUNAS* dan pesanan Kakak telah berhasil diserahkan/dikirimkan. 📦✨\n\n• Produk: *${prodTitle}*\n• Status: *Selesai & Diserahkan*\n\nSemoga produknya pas dan nyaman dipakai ya Kak. Jangan lupa tag kami di Instagram @crocscircle.id jika Kakak suka dengan produknya!\n\nSalam hangat,\n*Tim CrocsCircle.ID* 🐊`;
  }

  document.getElementById("waMessageTextarea").value = text;
}

function copyWaText() {
  const textarea = document.getElementById("waMessageTextarea");
  textarea.select();
  textarea.setSelectionRange(0, 99999);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value).then(() => {
      alert("Template pesan WhatsApp berhasil disalin ke clipboard!");
    }).catch(() => {
      document.execCommand("copy");
      alert("Template pesan WhatsApp berhasil disalin!");
    });
  } else {
    document.execCommand("copy");
    alert("Template pesan WhatsApp berhasil disalin!");
  }
}

function openWaDirect() {
  if (!PO_STATE.currentPo) return;
  const phone = sanitizeWaPhone(PO_STATE.currentPo.customer_contact);
  if (!phone) {
    alert("Nomor WhatsApp pelanggan tidak valid atau belum diisi.");
    return;
  }
  const text = encodeURIComponent(document.getElementById("waMessageTextarea").value);
  window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
