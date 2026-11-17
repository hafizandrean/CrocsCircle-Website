// CrocsCircle.ID — POS & Sales Frontend Controller (Vanilla JS)
// Version: 1.0.0 (Phase 3D - Sub-Modul 1: Kasir & Penjualan)

const POS_STATE = {
  token: null,
  user: null,
  variants: [],
  cart: [],
  activeReturnTarget: null,
  currentReceiptData: null,
  parsedWaData: null
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
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d);
}

// Helper: Generate UUID for Idempotency
function generateUUID() {
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'pos-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
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

  POS_STATE.token = token;

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

    POS_STATE.user = sessionData.user;
    renderUserProfile(sessionData.user);

    // Muat Varian Produk untuk Terminal POS
    await loadPosVariants();

    // Muat Riwayat Transaksi
    await loadSalesHistory();

    // Tampilkan Layout Utama
    document.getElementById("authLoadingOverlay").style.display = "none";
    document.getElementById("salesMainLayout").style.display = "flex";

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
    document.querySelectorAll(".owner-only-col").forEach(el => el.style.display = "table-cell");
  } else {
    roleBadgeEl.innerHTML = `<span style="display:inline-flex; align-items:center; gap:0.25rem; font-weight:700; color:#0369A1;"><i class="fa-solid fa-user-gear"></i> ADMIN / KASIR</span>`;
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "none");
    document.querySelectorAll(".owner-only-col").forEach(el => el.style.display = "none");
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
// 2. POS CATALOG & VARIANT LOOKUP
// ---------------------------------------------------------------------------
async function loadPosVariants() {
  const container = document.getElementById("posVariantsContainer");
  try {
    const res = await fetch('/api/pos/variants', {
      headers: { 'Authorization': `Bearer ${POS_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Gagal memuat varian POS");

    POS_STATE.variants = data.variants || [];
    renderPosVariants();
  } catch (err) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--danger);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i>
        <p>Gagal memuat produk: ${err.message}</p>
        <button onclick="loadPosVariants()" class="admin-btn" style="margin-top: 0.5rem; padding: 0.4rem 0.8rem; font-size: 0.8rem;">Coba Lagi</button>
      </div>
    `;
  }
}

let searchDebounceTimer = null;
function handlePosSearch(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    renderPosVariants();
  }, 200);
}

function renderPosVariants() {
  const container = document.getElementById("posVariantsContainer");
  const query = (document.getElementById("posSearchInput").value || "").trim().toLowerCase();
  const ownershipFilter = document.getElementById("posOwnershipFilter").value;

  let filtered = POS_STATE.variants.filter(v => {
    const matchText = (v.product_name + " " + v.model + " " + v.sku + " " + v.color + " " + v.size).toLowerCase();
    const passesQuery = !query || matchText.includes(query);

    if (!passesQuery) return false;

    if (ownershipFilter === "OWNED") {
      return v.owned_available_stock > 0;
    } else if (ownershipFilter === "CONSIGNMENT") {
      return v.consignment_available_stock > 0;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
        <i class="fa-solid fa-box-open" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
        <p style="font-size: 0.85rem; margin: 0;">Tidak ada varian produk yang cocok dengan pencarian / filter.</p>
      </div>
    `;
    return;
  }

  let html = "";
  filtered.forEach(v => {
    const hasOwned = v.owned_available_stock > 0;
    const hasCons = v.consignment_available_stock > 0;
    const isOutOfStock = v.total_available_stock <= 0;

    html += `
      <div class="variant-search-item" style="opacity: ${isOutOfStock ? '0.6' : '1'};">
        <div style="flex: 1; padding-right: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem;">
            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${escapeHtml(v.product_name)}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace;">(${escapeHtml(v.sku)})</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.35rem;">
            Varian: <strong>${escapeHtml(v.color)}</strong> | Size: <strong>${escapeHtml(v.size)}</strong>
          </div>
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <span class="ownership-pill ownership-owned">
              <i class="fa-solid fa-cube" style="margin-right: 3px;"></i> Sendiri: ${v.owned_available_stock}
            </span>
            <span class="ownership-pill ownership-consignment">
              <i class="fa-solid fa-handshake" style="margin-right: 3px;"></i> Konsinyasi: ${v.consignment_available_stock}
            </span>
          </div>
        </div>

        <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem;">
          <div style="font-weight: 800; color: var(--primary); font-size: 0.95rem;">
            ${formatRupiah(v.catalog_price)}
          </div>
          <div style="display: flex; gap: 0.3rem;">
            ${hasOwned ? `
              <button onclick="addToPosCart('${v.variant_id}', 'OWNED')" class="admin-btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; border-radius: 4px; font-weight: 700; cursor: pointer;" title="Tambah dari Stok Sendiri (FIFO)">
                + Stok Sendiri
              </button>
            ` : ''}
            ${hasCons ? `
              <button onclick="addToPosCart('${v.variant_id}', 'CONSIGNMENT')" class="admin-btn" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: #F3E8FF; color: #7E22CE; border: 1px solid #E9D5FF; border-radius: 4px; font-weight: 700; cursor: pointer;" title="Tambah dari Stok Konsinyasi">
                + Konsinyasi
              </button>
            ` : ''}
            ${isOutOfStock ? `
              <span style="font-size: 0.72rem; color: var(--danger); font-weight: 700; padding: 0.3rem 0.5rem; background: #FEE2E2; border-radius: 4px;">
                Habis
              </span>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// 3. POS CART MANAGEMENT
// ---------------------------------------------------------------------------
function addToPosCart(variantId, ownership = "OWNED", specificLotId = null) {
  const variant = POS_STATE.variants.find(v => v.variant_id === variantId);
  if (!variant) return alert("Varian produk tidak ditemukan.");

  let lot = null;
  let vendorId = null;
  let maxStock = 0;

  if (ownership === "OWNED") {
    maxStock = variant.owned_available_stock;
    if (maxStock <= 0) return alert("Stok OWNED untuk varian ini kosong.");
  } else {
    // CONSIGNMENT
    if (!variant.consignment_lots || variant.consignment_lots.length === 0) {
      return alert("Tidak ada lot konsinyasi aktif untuk varian ini.");
    }
    // Pilih lot yang ditentukan atau lot pertama dengan sisa > 0
    if (specificLotId) {
      lot = variant.consignment_lots.find(l => l.lot_id === specificLotId);
    } else {
      lot = variant.consignment_lots.find(l => l.remaining_qty > 0);
    }

    if (!lot) return alert("Lot konsinyasi yang dipilih tidak memiliki sisa stok.");
    vendorId = lot.vendor_id;
    maxStock = lot.remaining_qty;
  }

  // Cek apakah item dengan varian + kepemilikan + vendor/lot sama sudah ada di keranjang
  const existingIndex = POS_STATE.cart.findIndex(item => 
    item.variant_id === variantId && 
    item.item_ownership === ownership && 
    (ownership === "OWNED" || item.vendor_id === vendorId)
  );

  if (existingIndex >= 0) {
    if (POS_STATE.cart[existingIndex].quantity + 1 > maxStock) {
      return alert(`Kuantitas melebihi stok yang tersedia (${maxStock} pcs).`);
    }
    POS_STATE.cart[existingIndex].quantity += 1;
  } else {
    POS_STATE.cart.push({
      variant_id: variant.variant_id,
      sku: variant.sku,
      product_name: variant.product_name,
      color: variant.color,
      size: variant.size,
      item_ownership: ownership,
      vendor_id: vendorId,
      lot_id: lot ? lot.lot_id : null,
      vendor_name: lot ? lot.vendor_name : null,
      fixed_share: lot ? lot.fixed_share : 0,
      min_selling_price: lot ? lot.min_selling_price : 0,
      quantity: 1,
      max_stock: maxStock,
      catalog_price: variant.catalog_price,
      actual_price: variant.catalog_price
    });
  }

  renderPosCart();
}

function removeFromPosCart(index) {
  POS_STATE.cart.splice(index, 1);
  renderPosCart();
}

function updatePosCartQty(index, newQty) {
  const item = POS_STATE.cart[index];
  if (!item) return;

  const qty = parseInt(newQty, 10);
  if (isNaN(qty) || qty <= 0) {
    removeFromPosCart(index);
    return;
  }

  if (qty > item.max_stock) {
    alert(`Maksimal stok tersedia untuk item ini adalah ${item.max_stock} pcs.`);
    item.quantity = item.max_stock;
  } else {
    item.quantity = qty;
  }
  renderPosCart();
}

function updateItemPrice(index, newPrice) {
  const item = POS_STATE.cart[index];
  if (!item) return;

  const price = parseFloat(newPrice);
  if (isNaN(price) || price < 0) {
    alert("Harga tidak valid.");
    renderPosCart();
    return;
  }

  // Validasi khusus konsinyasi vendor Dzaki / fixed share
  if (item.item_ownership === "CONSIGNMENT" && item.fixed_share > 0) {
    if (price < item.fixed_share) {
      alert(`Harga jual konsinyasi tidak boleh lebih rendah dari hak pokok vendor (${formatRupiah(item.fixed_share)}).`);
      renderPosCart();
      return;
    }
  }

  item.actual_price = price;
  updateCartCalculations();
}

function clearPosCart() {
  if (POS_STATE.cart.length === 0) return;
  if (confirm("Kosongkan keranjang kasir?")) {
    POS_STATE.cart = [];
    document.getElementById("posDiscountInput").value = 0;
    document.getElementById("posShippingInput").value = 0;
    renderPosCart();
  }
}

function renderPosCart() {
  const tbody = document.getElementById("posCartTableBody");
  if (POS_STATE.cart.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem 1rem;">
          Keranjang kosong. Pilih varian produk di sebelah kiri.
        </td>
      </tr>
    `;
    updateCartCalculations();
    return;
  }

  let html = "";
  POS_STATE.cart.forEach((item, index) => {
    const isCons = item.item_ownership === "CONSIGNMENT";
    html += `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 8px 6px;">
          <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-main);">${escapeHtml(item.product_name)}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(item.color)} | ${escapeHtml(item.size)}</div>
          <div>
            ${isCons ? `
              <span class="ownership-pill ownership-consignment" style="font-size: 0.65rem; padding: 1px 5px;">
                Konsinyasi (${escapeHtml(item.vendor_name || item.vendor_id)})
              </span>
            ` : `
              <span class="ownership-pill ownership-owned" style="font-size: 0.65rem; padding: 1px 5px;">
                Stok Sendiri
              </span>
            `}
          </div>
        </td>
        <td style="text-align: center; padding: 8px 4px;">
          <input type="number" min="1" max="${item.max_stock}" value="${item.quantity}" style="width: 48px; text-align: center; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; font-weight: 700;" onchange="updatePosCartQty(${index}, this.value)">
        </td>
        <td style="text-align: right; padding: 8px 4px;">
          <input type="number" step="5000" min="0" value="${item.actual_price}" style="width: 88px; text-align: right; padding: 2px 4px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.8rem; font-weight: 700;" onchange="updateItemPrice(${index}, this.value)">
        </td>
        <td style="text-align: center; padding: 8px 4px;">
          <button onclick="removeFromPosCart(${index})" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 2px 4px;" title="Hapus Item">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  updateCartCalculations();
}

// Real-Time Total Calculations
function updateCartCalculations() {
  let subtotal = 0;
  POS_STATE.cart.forEach(item => {
    subtotal += (item.actual_price * item.quantity);
  });

  let discount = parseFloat(document.getElementById("posDiscountInput").value) || 0;
  let shipping = parseFloat(document.getElementById("posShippingInput").value) || 0;

  if (discount < 0) discount = 0;
  if (discount > subtotal) discount = subtotal;

  if (shipping < 0) shipping = 0;

  // Cek perlindungan diskon konsinyasi vendor:
  // Diskon ditanggung CrocsCircle dan tidak boleh membuat penerimaan bersih di bawah hak vendor
  if (discount > 0 && POS_STATE.cart.length > 0) {
    const totalQty = POS_STATE.cart.reduce((sum, it) => sum + it.quantity, 0);
    const discountPerUnit = totalQty > 0 ? (discount / totalQty) : 0;

    for (let it of POS_STATE.cart) {
      if (it.item_ownership === "CONSIGNMENT" && it.fixed_share > 0) {
        const netPerUnit = it.actual_price - discountPerUnit;
        if (netPerUnit < it.fixed_share) {
          // Warning indikator
          document.getElementById("posSummaryOmzetPreview").innerText = "PERINGATAN: Diskon melanggar hak vendor!";
          document.getElementById("posSummaryOmzetPreview").style.color = "#DC2626";
        }
      }
    }
  }

  const grandTotal = Math.max(0, subtotal - discount + shipping);
  const netOperationalRevenue = Math.max(0, subtotal - discount); // Opsi A: Tanpa titipan ongkir!

  document.getElementById("posSummarySubtotal").innerText = formatRupiah(subtotal);
  document.getElementById("posSummaryGrandTotal").innerText = formatRupiah(grandTotal);
  
  const omzetEl = document.getElementById("posSummaryOmzetPreview");
  omzetEl.innerText = formatRupiah(netOperationalRevenue);
  omzetEl.style.color = "#1E293B";
}

// ---------------------------------------------------------------------------
// 4. SUBMIT POS SALE TRANSACTION
// ---------------------------------------------------------------------------
async function submitPosTransaction() {
  if (POS_STATE.cart.length === 0) {
    return alert("Keranjang belanja masih kosong! Silakan pilih varian produk terlebih dahulu.");
  }

  const customerName = (document.getElementById("posCustomerName").value || "").trim() || "Pelanggan Langsung";
  const salesChannel = document.getElementById("posSalesChannel").value;
  const paymentMethod = document.getElementById("posPaymentMethod").value;
  const cashierDiscount = parseFloat(document.getElementById("posDiscountInput").value) || 0;
  const shippingCharge = parseFloat(document.getElementById("posShippingInput").value) || 0;

  // Validasi perlindungan hak konsinyasi vendor
  let subtotal = 0;
  let totalQty = 0;
  POS_STATE.cart.forEach(it => {
    subtotal += (it.actual_price * it.quantity);
    totalQty += it.quantity;
  });

  const discountPerUnit = totalQty > 0 ? (cashierDiscount / totalQty) : 0;
  for (let it of POS_STATE.cart) {
    if (it.item_ownership === "CONSIGNMENT" && it.fixed_share > 0) {
      const netPerUnit = it.actual_price - discountPerUnit;
      if (netPerUnit < it.fixed_share) {
        return alert(`Transaksi DITOLAK: Diskon kasir menyebabkan harga bersih per unit untuk produk konsinyasi (${formatRupiah(netPerUnit)}) lebih rendah dari hak pokok vendor (${formatRupiah(it.fixed_share)}). Harap sesuaikan diskon.`);
      }
    }
  }

  const submitBtn = document.getElementById("posSubmitSaleBtn");
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses Transaksi...`;

  const payload = {
    transaction_date: new Date().toISOString(),
    sales_channel: salesChannel,
    sales_type: "READY_STOCK",
    customer_name: customerName,
    payment_method: paymentMethod,
    cashier_discount: cashierDiscount,
    shipping_charge: shippingCharge,
    idempotency_key: generateUUID(),
    created_by: POS_STATE.user.username || "KASIR",
    notes: `Transaksi POS Kasir (${paymentMethod})`,
    items: POS_STATE.cart.map(it => ({
      variant_id: it.variant_id,
      item_ownership: it.item_ownership,
      vendor_id: it.vendor_id || undefined,
      quantity: it.quantity,
      actual_price: it.actual_price
    }))
  };

  try {
    const res = await fetch('/api/sales/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POS_STATE.token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(result.error || "Gagal menyimpan transaksi");
    }

    // Transaksi Berhasil!
    const sale = result.sale;
    const details = result.details || [];

    // Tampilkan Struk Thermal
    showReceiptModal(sale, details);

    // Reset Form & Keranjang
    POS_STATE.cart = [];
    document.getElementById("posCustomerName").value = "Pelanggan Langsung";
    document.getElementById("posDiscountInput").value = 0;
    document.getElementById("posShippingInput").value = 0;
    renderPosCart();

    // Segarkan Data Stok dan Riwayat
    await loadPosVariants();
    await loadSalesHistory();

  } catch (err) {
    alert("Gagal memproses transaksi kasir: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-cash-register"></i> Simpan Transaksi & Cetak Struk`;
  }
}

// ---------------------------------------------------------------------------
// 5. THERMAL INVOICE RECEIPT MODAL
// ---------------------------------------------------------------------------
function showReceiptModal(sale, details) {
  POS_STATE.currentReceiptData = { sale, details };

  const receiptEl = document.getElementById("thermalReceiptContent");
  const modal = document.getElementById("receiptModal");

  let subtotal = 0;
  details.forEach(d => {
    subtotal += (Number(d.actual_price) * Number(d.quantity));
  });

  const discount = Number(sale.cashier_discount) || 0;
  const shipping = Number(sale.shipping_charge) || 0;
  const grandTotal = Number(sale.gross_customer_payment) || (subtotal - discount + shipping);
  const netRevenue = Number(sale.net_operational_revenue) || (subtotal - discount);

  let itemsHtml = "";
  details.forEach(d => {
    const itemSubtotal = Number(d.actual_price) * Number(d.quantity);
    itemsHtml += `
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
        <div>${escapeHtml(d.variant_id)} x${d.quantity}</div>
        <div>${formatRupiah(itemSubtotal)}</div>
      </div>
    `;
  });

  const receiptHtml = `
    <div style="text-align: center; border-bottom: 1px dashed #94A3B8; padding-bottom: 0.6rem; margin-bottom: 0.6rem;">
      <div style="font-weight: 800; font-size: 1rem; color: #173B35;">CROCSCIRCLE.ID</div>
      <div style="font-size: 0.72rem; color: #64748B;">Authentic Footwear & Consignment Hub</div>
      <div style="font-size: 0.7rem; color: #64748B;">WhatsApp: +62 851-9069-4241</div>
    </div>

    <div style="font-size: 0.75rem; margin-bottom: 0.6rem; border-bottom: 1px dashed #94A3B8; padding-bottom: 0.6rem;">
      <div style="display: flex; justify-content: space-between;">
        <span>No. Struk:</span>
        <span style="font-weight: 700;">${sale.sales_id}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Tanggal:</span>
        <span>${formatDateIndo(sale.transaction_date)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Kasir:</span>
        <span>${escapeHtml(sale.created_by || "Admin")}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Pelanggan:</span>
        <span>${escapeHtml(sale.customer_name || "Pelanggan Langsung")}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>Metode:</span>
        <span>${sale.payment_method} (${sale.sales_channel})</span>
      </div>
    </div>

    <div style="font-size: 0.75rem; margin-bottom: 0.6rem; border-bottom: 1px dashed #94A3B8; padding-bottom: 0.6rem;">
      ${itemsHtml}
    </div>

    <div style="font-size: 0.75rem; margin-bottom: 0.6rem;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
        <span>Subtotal:</span>
        <span>${formatRupiah(subtotal)}</span>
      </div>
      ${discount > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem; color: #DC2626;">
          <span>Diskon Kasir:</span>
          <span>-${formatRupiah(discount)}</span>
        </div>
      ` : ''}
      ${shipping > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem; color: #0369A1;">
          <span>Titipan Ongkir (Opsi A):</span>
          <span>+${formatRupiah(shipping)}</span>
        </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 0.95rem; margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid #CBD5E1; color: #173B35;">
        <span>TOTAL DITERIMA:</span>
        <span>${formatRupiah(grandTotal)}</span>
      </div>
      <div style="font-size: 0.68rem; color: #64748B; text-align: right; margin-top: 0.2rem;">
        *Omzet Bersih Toko: ${formatRupiah(netRevenue)}
      </div>
    </div>

    <div style="text-align: center; font-size: 0.72rem; color: #64748B; border-top: 1px dashed #94A3B8; padding-top: 0.6rem;">
      Terima kasih telah berbelanja di CrocsCircle.ID!<br>
      Barang yang dibeli tidak dapat ditukar kecuali cacat pabrik.
    </div>
  `;

  receiptEl.innerHTML = receiptHtml;
  modal.style.display = "flex";
}

function closeReceiptModal() {
  document.getElementById("receiptModal").style.display = "none";
}

function copyReceiptText() {
  if (!POS_STATE.currentReceiptData) return;
  const receiptEl = document.getElementById("thermalReceiptContent");
  const text = receiptEl.innerText;

  navigator.clipboard.writeText(text).then(() => {
    alert("Teks struk berhasil disalin ke clipboard!");
  }).catch(() => {
    alert("Gagal menyalin teks ke clipboard.");
  });
}

function printReceipt() {
  const printWindow = window.open('', '_blank', 'width=450,height=600');
  const content = document.getElementById("thermalReceiptContent").innerHTML;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Struk Belanja - CrocsCircle.ID</title>
        <style>
          body { font-family: monospace; font-size: 11px; padding: 15px; margin: 0; color: #000; }
          @page { margin: 0; }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// ---------------------------------------------------------------------------
// 6. WHATSAPP ORDER PARSER MODAL
// ---------------------------------------------------------------------------
function openWhatsAppParserModal() {
  document.getElementById("waRawTextInput").value = "";
  document.getElementById("waParserPreview").style.display = "none";
  document.getElementById("waApplyCartBtn").style.display = "none";
  document.getElementById("waParseBtn").style.display = "block";
  document.getElementById("waParserModal").style.display = "flex";
}

function closeWhatsAppParserModal() {
  document.getElementById("waParserModal").style.display = "none";
}

async function processWhatsAppText() {
  const text = document.getElementById("waRawTextInput").value.trim();
  if (!text) {
    return alert("Silakan tempelkan teks format pesanan WhatsApp dari pelanggan.");
  }

  const parseBtn = document.getElementById("waParseBtn");
  parseBtn.disabled = true;
  parseBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Mengekstrak Data...`;

  try {
    const res = await fetch('/api/sales/parse-wa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POS_STATE.token}`
      },
      body: JSON.stringify({ raw_text: text })
    });

    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal mengekstrak teks");

    POS_STATE.parsedWaData = result.data;
    renderWhatsAppPreview(result.data);

    parseBtn.style.display = "none";
    document.getElementById("waApplyCartBtn").style.display = "block";

  } catch (err) {
    alert("Ekstraksi gagal: " + err.message);
  } finally {
    parseBtn.disabled = false;
    parseBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Ekstrak & Validasi`;
  }
}

function renderWhatsAppPreview(data) {
  const previewEl = document.getElementById("waParserPreview");
  previewEl.style.display = "block";

  let itemsHtml = "";
  (data.items || []).forEach((it, idx) => {
    const isAvail = it.is_available;
    itemsHtml += `
      <div style="background: white; border: 1px solid ${isAvail ? '#CBD5E1' : '#FCA5A5'}; border-radius: 6px; padding: 0.5rem; margin-top: 0.4rem; font-size: 0.78rem;">
        <div style="display: flex; justify-content: space-between;">
          <strong style="color: ${isAvail ? '#1E293B' : '#DC2626'};">${idx + 1}. ${escapeHtml(it.product_name)}</strong>
          <span>${formatRupiah(it.price)} x${it.quantity}</span>
        </div>
        <div style="color: var(--text-muted); font-size: 0.72rem;">SKU: ${escapeHtml(it.sku)}</div>
        <div style="margin-top: 0.25rem;">
          ${isAvail ? `
            <span style="color: #166534; font-weight: 700; font-size: 0.72rem;">
              <i class="fa-solid fa-circle-check"></i> Stok Tersedia (${it.stock_available} pcs - ${it.ownership_type})
            </span>
          ` : `
            <span style="color: #DC2626; font-weight: 700; font-size: 0.72rem;">
              <i class="fa-solid fa-triangle-exclamation"></i> Stok Tidak Cukup (Tersedia: ${it.stock_available})
            </span>
          `}
        </div>
      </div>
    `;
  });

  previewEl.innerHTML = `
    <div style="font-size: 0.8rem; font-weight: 700; color: #166534; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.4rem;">
      <i class="fa-solid fa-circle-check"></i> Data Pesanan Berhasil Divalidasi
    </div>
    <div style="font-size: 0.78rem; line-height: 1.5; color: var(--text-main);">
      <div><strong>Nama:</strong> ${escapeHtml(data.customer_name || "-")}</div>
      <div><strong>Telepon:</strong> ${escapeHtml(data.customer_phone || "-")}</div>
      <div><strong>Alamat:</strong> ${escapeHtml(data.shipping_address || "-")}</div>
    </div>
    <div style="margin-top: 0.5rem;">
      <strong style="font-size: 0.78rem; color: var(--text-muted);">Daftar Item:</strong>
      ${itemsHtml}
    </div>
  `;
}

function applyWhatsAppToCart() {
  if (!POS_STATE.parsedWaData) return;
  const data = POS_STATE.parsedWaData;

  // Set Pelanggan & Kanal
  document.getElementById("posCustomerName").value = data.customer_name || "Pelanggan WhatsApp";
  document.getElementById("posSalesChannel").value = "WHATSAPP";

  // Tambahkan item yang valid dan ada stok ke keranjang
  let addedCount = 0;
  (data.items || []).forEach(it => {
    if (it.variant_id && it.is_available) {
      const ownership = it.ownership_type === "CONSIGNMENT" ? "CONSIGNMENT" : "OWNED";
      for (let i = 0; i < it.quantity; i++) {
        addToPosCart(it.variant_id, ownership);
      }
      addedCount++;
    }
  });

  closeWhatsAppParserModal();
  alert(`Berhasil memasukkan ${addedCount} jenis produk dari WhatsApp ke keranjang kasir!`);
}

// ---------------------------------------------------------------------------
// 7. SALES HISTORY & RETURN TRANSACTION
// ---------------------------------------------------------------------------
async function loadSalesHistory() {
  const tbody = document.getElementById("salesHistoryTableBody");
  const startDate = document.getElementById("historyStartDate").value;
  const endDate = document.getElementById("historyEndDate").value;

  let query = "";
  if (startDate) query += `&startDate=${startDate}`;
  if (endDate) query += `&endDate=${endDate}`;

  try {
    const res = await fetch(`/api/sales/list?${query}`, {
      headers: { 'Authorization': `Bearer ${POS_STATE.token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal memuat riwayat penjualan");

    const sales = result.sales || [];
    renderSalesHistoryTable(sales);

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--danger); padding: 2rem;">
          Gagal memuat riwayat penjualan: ${err.message}
        </td>
      </tr>
    `;
  }
}

function renderSalesHistoryTable(sales) {
  const tbody = document.getElementById("salesHistoryTableBody");
  const isOwner = POS_STATE.user && POS_STATE.user.role === "OWNER";

  if (sales.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
          Belum ada riwayat transaksi penjualan.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  sales.forEach(s => {
    const grossPayment = Number(s.gross_customer_payment) || 0;
    const netRevenue = Number(s.net_operational_revenue) || 0;
    const hpp = isOwner && s.total_hpp !== null && s.total_hpp !== undefined ? Number(s.total_hpp) : null;
    const grossProfit = isOwner && s.gross_profit !== null && s.gross_profit !== undefined ? Number(s.gross_profit) : null;

    html += `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 10px; font-weight: 700; font-family: monospace; font-size: 0.78rem;">
          ${escapeHtml(s.sales_id)}
        </td>
        <td style="padding: 10px; font-size: 0.78rem;">
          ${formatDateIndo(s.transaction_date)}
        </td>
        <td style="padding: 10px; font-size: 0.8rem; font-weight: 600;">
          ${escapeHtml(s.customer_name || "-")}
        </td>
        <td style="padding: 10px; text-align: center;">
          <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: #F1F5F9; color: var(--text-muted); font-weight: 600;">
            ${escapeHtml(s.sales_channel)}
          </span>
        </td>
        <td style="padding: 10px; text-align: center; font-size: 0.78rem;">
          ${escapeHtml(s.payment_method)}
        </td>
        <td style="padding: 10px; text-align: right; font-weight: 700; font-size: 0.82rem;">
          ${formatRupiah(grossPayment)}
        </td>
        <td style="padding: 10px; text-align: right; font-weight: 800; font-size: 0.82rem; color: var(--primary);">
          ${formatRupiah(netRevenue)}
        </td>
        <td class="owner-only-col" style="padding: 10px; text-align: right; font-size: 0.8rem; color: #991B1B; font-weight: 600; display: ${isOwner ? 'table-cell' : 'none'};">
          ${hpp !== null ? formatRupiah(hpp) : '-'}
        </td>
        <td class="owner-only-col" style="padding: 10px; text-align: right; font-size: 0.8rem; color: #166534; font-weight: 800; display: ${isOwner ? 'table-cell' : 'none'};">
          ${grossProfit !== null ? formatRupiah(grossProfit) : '-'}
        </td>
        <td style="padding: 10px; text-align: center;">
          <button onclick="openReturnModal('${s.sales_id}')" class="admin-btn" style="padding: 3px 8px; font-size: 0.72rem; background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 4px; font-weight: 700; cursor: pointer;" title="Retur Transaksi">
            <i class="fa-solid fa-arrow-rotate-left"></i> Retur
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ---------------------------------------------------------------------------
// 8. RETURN MODAL CONTROLLER
// ---------------------------------------------------------------------------
async function openReturnModal(salesId) {
  try {
    const res = await fetch(`/api/sales/detail?sales_id=${encodeURIComponent(salesId)}`, {
      headers: { 'Authorization': `Bearer ${POS_STATE.token}` }
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal memuat detail transaksi");

    const sale = result.sale;
    const details = result.details || [];

    if (details.length === 0) {
      return alert("Transaksi tidak memiliki item yang dapat diretur.");
    }

    POS_STATE.activeReturnTarget = { sale, details, selectedDetail: details[0] };

    const infoEl = document.getElementById("returnDetailInfo");
    infoEl.innerHTML = `
      <div style="font-weight: 800; margin-bottom: 0.3rem;">Faktur: ${sale.sales_id} (${sale.customer_name})</div>
      <div>Pilih Item yang Diretur:</div>
      <select id="returnItemSelect" style="width: 100%; padding: 0.4rem; border: 1px solid #FECACA; border-radius: 4px; font-size: 0.8rem; margin-top: 0.3rem;" onchange="handleReturnItemChange(this.value)">
        ${details.map(d => `
          <option value="${d.sales_detail_id || d.detail_id}">${d.variant_id} (Qty Beli: ${d.quantity} pcs @ ${formatRupiah(d.actual_price || d.selling_price)})</option>
        `).join('')}
      </select>
    `;

    document.getElementById("returnQtyInput").max = details[0].quantity;
    document.getElementById("returnQtyInput").value = 1;
    document.getElementById("returnReasonInput").value = "";

    document.getElementById("returnModal").style.display = "flex";

  } catch (err) {
    alert("Gagal membuka menu retur: " + err.message);
  }
}

function handleReturnItemChange(detailId) {
  if (!POS_STATE.activeReturnTarget) return;
  const d = POS_STATE.activeReturnTarget.details.find(x => (x.sales_detail_id || x.detail_id) === detailId);
  if (d) {
    POS_STATE.activeReturnTarget.selectedDetail = d;
    document.getElementById("returnQtyInput").max = d.quantity;
    document.getElementById("returnQtyInput").value = 1;
  }
}

function closeReturnModal() {
  document.getElementById("returnModal").style.display = "none";
  POS_STATE.activeReturnTarget = null;
}

async function executeReturn() {
  if (!POS_STATE.activeReturnTarget) return;

  const target = POS_STATE.activeReturnTarget.selectedDetail;
  const qty = parseInt(document.getElementById("returnQtyInput").value, 10);
  const reason = (document.getElementById("returnReasonInput").value || "").trim();

  if (isNaN(qty) || qty <= 0) return alert("Kuantitas retur tidak valid.");
  if (qty > target.quantity) return alert(`Kuantitas retur melebihi pembelian (${target.quantity} pcs).`);
  if (!reason || reason.length < 5) return alert("Alasan retur wajib diisi minimal 5 karakter.");

  const returnBtn = document.getElementById("submitReturnBtn");
  returnBtn.disabled = true;
  returnBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Memproses Retur...`;

  try {
    const payload = {
      sales_id: target.sales_id,
      detail_id: target.detail_id,
      variant_id: target.variant_id,
      quantity: qty,
      reason: reason,
      caller_token: POS_STATE.token
    };

    const res = await fetch('/api/sales/return', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${POS_STATE.token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal memproses retur");

    alert(`Retur transaksi berhasil dicatat! Stok produk telah dikembalikan.`);
    closeReturnModal();

    // Segarkan stok dan tabel riwayat
    await loadPosVariants();
    await loadSalesHistory();

  } catch (err) {
    alert("Retur gagal: " + err.message);
  } finally {
    returnBtn.disabled = false;
    returnBtn.innerHTML = `<i class="fa-solid fa-arrow-rotate-left"></i> Konfirmasi Retur`;
  }
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
