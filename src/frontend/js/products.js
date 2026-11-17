// CrocsCircle.ID — Product & Inventory Management Frontend Controller (Vanilla JS)
// Version: 1.0.0 (Phase 3B)

const PROD_STATE = {
  token: null,
  user: null,
  categories: [],
  vendors: [],
  currentTab: 'products',
  activeDetailProductId: null,
  searchTimer: null
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

// ---------------------------------------------------------------------------
// 1. INITIALIZATION & SESSION GUARD
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("crocscircle_admin_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  PROD_STATE.token = token;

  try {
    const sessionRes = await fetch('/api/session', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success || !sessionData.user) {
      alert("Sesi Anda telah kedaluwarsa. Silakan masuk kembali.");
      sessionStorage.removeItem("crocscircle_admin_token");
      sessionStorage.removeItem("crocscircle_admin_user");
      window.location.href = "login.html";
      return;
    }

    PROD_STATE.user = sessionData.user;
    renderUserProfile(sessionData.user);

    // Muat Metadata (Kategori & Vendor)
    await loadMetadata();

    // Muat Konten Tab Pertama (Katalog Produk)
    await loadProducts();

    // Sembunyikan Loading Overlay
    document.getElementById("authLoadingOverlay").style.display = "none";
    document.getElementById("adminMainLayout").style.display = "flex";

  } catch (err) {
    alert("Gagal memverifikasi autentikasi ke server: " + err.message);
    window.location.href = "login.html";
  }
});

// Render User Profile & Role-Based UI
function renderUserProfile(user) {
  const fullNameEl = document.getElementById("userFullName");
  const roleBadgeEl = document.getElementById("userRoleBadge");
  const avatarEl = document.getElementById("userAvatar");
  const isOwner = user.role === "OWNER";

  fullNameEl.innerText = user.full_name || user.username;
  avatarEl.innerText = (user.full_name || user.username).charAt(0).toUpperCase();

  if (isOwner) {
    roleBadgeEl.innerHTML = `<span class="badge badge-success"><i class="fa-solid fa-crown"></i> OWNER</span>`;
    document.getElementById("adminRbacNotice").style.display = "none";
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "flex");
    document.querySelectorAll(".owner-cost-col").forEach(el => el.style.display = "table-cell");
  } else {
    roleBadgeEl.innerHTML = `<span class="badge badge-info"><i class="fa-solid fa-user-gear"></i> ADMIN</span>`;
    document.getElementById("adminRbacNotice").style.display = "flex";
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "none");
    document.querySelectorAll(".owner-cost-col").forEach(el => el.style.display = "none");
  }
}

// Load Categories & Vendors
async function loadMetadata() {
  try {
    const res = await fetch('/api/metadata', {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (data.success) {
      PROD_STATE.categories = data.categories || [];
      PROD_STATE.vendors = data.vendors || [];

      // Populate Category Dropdowns
      const prodFilter = document.getElementById("prodCategoryFilter");
      const modalCategory = document.getElementById("modalProductCategory");
      
      const catOptions = PROD_STATE.categories.map(c => 
        `<option value="${c.category_id}">${c.category_name}</option>`
      ).join('');

      prodFilter.innerHTML = '<option value="ALL">Semua Kategori</option>' + catOptions;
      modalCategory.innerHTML = catOptions;

      // Populate Vendor Dropdown in Stock In
      const vendorSelect = document.getElementById("stockInVendorSelect");
      vendorSelect.innerHTML = PROD_STATE.vendors.map(v => 
        `<option value="${v.vendor_id}">${v.vendor_name} (${v.partnership_type || 'CONSIGNMENT'})</option>`
      ).join('');
    }
  } catch (e) {
    console.error("Gagal memuat metadata:", e);
  }
}

// ---------------------------------------------------------------------------
// 2. TAB SWITCHING
// ---------------------------------------------------------------------------
window.switchTab = function(tabName) {
  PROD_STATE.currentTab = tabName;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.remove("active");
    btn.style.borderBottomColor = "transparent";
    btn.style.color = "var(--text-muted)";
    btn.style.fontWeight = "600";
  });

  document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");

  if (tabName === 'products') {
    document.getElementById("tabBtnProducts").classList.add("active");
    document.getElementById("tabBtnProducts").style.borderBottomColor = "var(--primary)";
    document.getElementById("tabBtnProducts").style.color = "var(--primary)";
    document.getElementById("tabBtnProducts").style.fontWeight = "700";
    document.getElementById("sectionProducts").style.display = "block";
    loadProducts();
  } else if (tabName === 'inventory') {
    document.getElementById("tabBtnInventory").classList.add("active");
    document.getElementById("tabBtnInventory").style.borderBottomColor = "var(--primary)";
    document.getElementById("tabBtnInventory").style.color = "var(--primary)";
    document.getElementById("tabBtnInventory").style.fontWeight = "700";
    document.getElementById("sectionInventory").style.display = "block";
    loadInventory();
  } else if (tabName === 'stockin') {
    document.getElementById("tabBtnStockIn").classList.add("active");
    document.getElementById("tabBtnStockIn").style.borderBottomColor = "var(--primary)";
    document.getElementById("tabBtnStockIn").style.color = "var(--primary)";
    document.getElementById("tabBtnStockIn").style.fontWeight = "700";
    document.getElementById("sectionStockIn").style.display = "block";
    populateStockInVariants();
  } else if (tabName === 'movements') {
    document.getElementById("tabBtnMovements").classList.add("active");
    document.getElementById("tabBtnMovements").style.borderBottomColor = "var(--primary)";
    document.getElementById("tabBtnMovements").style.color = "var(--primary)";
    document.getElementById("tabBtnMovements").style.fontWeight = "700";
    document.getElementById("sectionMovements").style.display = "block";
    loadStockMovements();
  }
};

// ---------------------------------------------------------------------------
// 3. TAB 1: KATALOG MASTER PRODUK
// ---------------------------------------------------------------------------
window.debounceProductSearch = function() {
  clearTimeout(PROD_STATE.searchTimer);
  PROD_STATE.searchTimer = setTimeout(loadProducts, 300);
};

window.loadProducts = async function() {
  const q = document.getElementById("prodSearchInput").value.trim();
  const cat = document.getElementById("prodCategoryFilter").value;

  try {
    const params = new URLSearchParams();
    if (q) params.append("search", q);
    if (cat !== "ALL") params.append("category_id", cat);

    const res = await fetch(`/api/products?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    const tbody = document.getElementById("productsTableBody");
    const empty = document.getElementById("productsEmptyState");

    if (!data.products || data.products.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";
    tbody.innerHTML = data.products.map(p => `
      <tr>
        <td>
          <img src="${p.image_url || 'https://via.placeholder.com/60?text=Crocs'}" alt="${p.product_name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);">
        </td>
        <td><code>${p.product_id}</code></td>
        <td>
          <strong>${p.product_name}</strong>
          ${p.model ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${p.model}</div>` : ''}
        </td>
        <td><span class="badge badge-info">${p.category_name}</span></td>
        <td style="text-align: center; font-weight: 700;">${p.variant_count}</td>
        <td style="text-align: right; font-weight: 600;">${p.total_physical_stock} pcs</td>
        <td style="text-align: right; font-weight: 700; color: var(--success);">${p.total_available_stock} pcs</td>
        <td style="text-align: center;">
          <span class="badge ${p.is_published ? 'badge-success' : 'badge-warning'}">
            ${p.is_published ? 'Publik' : 'Draft'}
          </span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button onclick="viewProductDetail('${p.product_id}')" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;" title="Lihat Detail & Varian">
            <i class="fa-solid fa-eye"></i> Detail
          </button>
          <button onclick="editProduct('${p.product_id}')" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;" title="Edit Produk">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error("Gagal memuat katalog produk:", err);
  }
};

// Modal Tambah / Edit Produk
window.openAddProductModal = function() {
  document.getElementById("productModalTitle").innerText = "Tambah Master Produk Baru";
  document.getElementById("modalProductId").value = "";
  document.getElementById("modalProductName").value = "";
  document.getElementById("modalProductModel").value = "";
  document.getElementById("modalProductDesc").value = "";
  document.getElementById("modalProductImage").value = "";
  document.getElementById("modalProductActive").checked = true;
  document.getElementById("modalProductPublished").checked = true;
  document.getElementById("productModal").style.display = "flex";
};

window.editProduct = async function(productId) {
  try {
    const res = await fetch(`/api/products/detail?id=${encodeURIComponent(productId)}`, {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const p = data.data.product;
    document.getElementById("productModalTitle").innerText = "Edit Master Produk";
    document.getElementById("modalProductId").value = p.product_id;
    document.getElementById("modalProductName").value = p.product_name;
    document.getElementById("modalProductModel").value = p.model || "";
    document.getElementById("modalProductCategory").value = p.category_id || "CLOG";
    document.getElementById("modalProductDesc").value = p.description || "";
    document.getElementById("modalProductImage").value = p.image_url || "";
    document.getElementById("modalProductActive").checked = (p.is_active === true || p.is_active === "true");
    document.getElementById("modalProductPublished").checked = (p.is_published === true || p.is_published === "true");
    document.getElementById("productModal").style.display = "flex";
  } catch (e) {
    alert("Gagal memuat data produk: " + e.message);
  }
};

window.closeProductModal = function() {
  document.getElementById("productModal").style.display = "none";
};

window.handleProductFormSubmit = async function(event) {
  event.preventDefault();
  const productId = document.getElementById("modalProductId").value;
  const productData = {
    product_id: productId || undefined,
    product_name: document.getElementById("modalProductName").value.trim(),
    model: document.getElementById("modalProductModel").value.trim(),
    category_id: document.getElementById("modalProductCategory").value,
    description: document.getElementById("modalProductDesc").value.trim(),
    image_url: document.getElementById("modalProductImage").value.trim(),
    is_active: document.getElementById("modalProductActive").checked,
    is_published: document.getElementById("modalProductPublished").checked
  };

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PROD_STATE.token}`
      },
      body: JSON.stringify(productData)
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    alert("Produk berhasil disimpan!");
    closeProductModal();
    loadProducts();
  } catch (err) {
    alert("Gagal menyimpan produk: " + err.message);
  }
};

// ---------------------------------------------------------------------------
// 4. MODAL DETAIL PRODUK & DAFTAR VARIAN
// ---------------------------------------------------------------------------
window.viewProductDetail = async function(productId) {
  PROD_STATE.activeDetailProductId = productId;
  try {
    const res = await fetch(`/api/products/detail?id=${encodeURIComponent(productId)}`, {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const p = data.data.product;
    const variants = data.data.variants || [];

    document.getElementById("detailModalProductName").innerText = p.product_name;
    document.getElementById("detailModalCategory").innerText = `ID: ${p.product_id} | Kategori: ${p.category_id}`;

    const tbody = document.getElementById("detailModalVariantsBody");
    if (variants.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Belum ada varian ukuran untuk produk ini. Klik "Tambah Varian" untuk menambahkan.</td></tr>`;
    } else {
      tbody.innerHTML = variants.map(v => `
        <tr>
          <td><code>${v.sku}</code></td>
          <td>${v.color}</td>
          <td style="text-align: center; font-weight: 700;">${v.size}</td>
          <td style="text-align: right; font-weight: 700;">${formatRupiah(v.catalog_price)}</td>
          <td style="text-align: center;">
            <span style="font-weight: 600;">${v.stock.owned_physical}</span> Fisik
            <span style="font-size: 0.75rem; color: #D97706;">(${v.stock.owned_reserved} PO)</span>
          </td>
          <td style="text-align: center; color: #7C3AED;">
            <span style="font-weight: 600;">${v.stock.consignment_physical}</span> Fisik
            <span style="font-size: 0.75rem; color: #D97706;">(${v.stock.consignment_reserved} PO)</span>
          </td>
          <td style="text-align: right; font-weight: 800; color: var(--success);">${v.stock.total_available} pcs</td>
        </tr>
      `).join('');
    }

    document.getElementById("productDetailModal").style.display = "flex";
  } catch (e) {
    alert("Gagal memuat detail produk: " + e.message);
  }
};

window.closeProductDetailModal = function() {
  document.getElementById("productDetailModal").style.display = "none";
};

// Modal Tambah Varian
window.openAddVariantFromDetail = function() {
  const prodId = PROD_STATE.activeDetailProductId;
  if (!prodId) return;

  document.getElementById("modalVarProductId").value = prodId;
  document.getElementById("modalVarId").value = "";
  document.getElementById("variantModalSubtitle").innerText = `Produk ID: ${prodId}`;
  document.getElementById("modalVarSku").value = "";
  document.getElementById("modalVarColor").value = "";
  document.getElementById("modalVarSize").value = "";
  document.getElementById("modalVarCatalogPrice").value = "";
  document.getElementById("modalVarRefHpp").value = "";
  document.getElementById("skuErrorText").innerText = "";

  document.getElementById("variantModal").style.display = "flex";
};

window.closeVariantModal = function() {
  document.getElementById("variantModal").style.display = "none";
};

window.handleVariantFormSubmit = async function(event) {
  event.preventDefault();
  const skuError = document.getElementById("skuErrorText");
  skuError.innerText = "";

  const variantData = {
    product_id: document.getElementById("modalVarProductId").value,
    variant_id: document.getElementById("modalVarId").value || undefined,
    sku: document.getElementById("modalVarSku").value.trim().toUpperCase(),
    color: document.getElementById("modalVarColor").value.trim(),
    size: document.getElementById("modalVarSize").value.trim().toUpperCase(),
    catalog_price: Number(document.getElementById("modalVarCatalogPrice").value) || 0,
    reference_hpp: Number(document.getElementById("modalVarRefHpp").value) || 0
  };

  try {
    const res = await fetch('/api/variants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PROD_STATE.token}`
      },
      body: JSON.stringify(variantData)
    });
    const result = await res.json();

    if (!result.success) {
      if (result.error && result.error.includes("SKU harus unik")) {
        skuError.innerText = result.error;
        return;
      }
      throw new Error(result.error);
    }

    alert("Varian produk berhasil ditambahkan!");
    closeVariantModal();
    // Refresh modal detail & daftar produk
    viewProductDetail(variantData.product_id);
    loadProducts();
  } catch (err) {
    alert("Gagal menyimpan varian: " + err.message);
  }
};

// ---------------------------------------------------------------------------
// 5. TAB 2: MANAJEMEN STOK & VARIAN (INVENTARIS)
// ---------------------------------------------------------------------------
window.debounceInventorySearch = function() {
  clearTimeout(PROD_STATE.searchTimer);
  PROD_STATE.searchTimer = setTimeout(loadInventory, 300);
};

window.loadInventory = async function() {
  const q = document.getElementById("invSearchInput").value.trim();
  const status = document.getElementById("invStatusFilter").value;

  try {
    const params = new URLSearchParams();
    if (q) params.append("search", q);
    if (status !== "ALL") params.append("stock_status", status);

    const res = await fetch(`/api/inventory?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const isOwner = (PROD_STATE.user && PROD_STATE.user.role === "OWNER");
    const items = data.inventory || [];

    // Calculate Summary KPIs
    let totalPhys = 0;
    let totalRes = 0;
    let totalAvail = 0;
    let totalOwned = 0;
    let totalCons = 0;

    items.forEach(it => {
      totalPhys += it.stock.total_physical;
      totalRes += it.stock.total_reserved;
      totalAvail += it.stock.total_available;
      totalOwned += it.stock.owned_physical;
      totalCons += it.stock.consignment_physical;
    });

    document.getElementById("invTotalPhysical").innerText = `${totalPhys} pcs`;
    document.getElementById("invTotalReserved").innerText = `${totalRes} pcs`;
    document.getElementById("invTotalAvailable").innerText = `${totalAvail} pcs`;
    document.getElementById("invTotalOwned").innerText = `${totalOwned} pcs`;
    document.getElementById("invTotalConsignment").innerText = `${totalCons} pcs`;

    const tbody = document.getElementById("inventoryTableBody");
    tbody.innerHTML = items.map(item => {
      let badgeClass = "badge-success";
      let statusLabel = "In Stock";
      if (item.stock_status === "OUT_OF_STOCK") {
        badgeClass = "badge-danger";
        statusLabel = "Habis";
      } else if (item.stock_status === "LOW_STOCK") {
        badgeClass = "badge-warning";
        statusLabel = "Menipis";
      }

      return `
        <tr>
          <td><strong><code>${item.sku}</code></strong></td>
          <td>
            <div>${item.product_name}</div>
            <span style="font-size: 0.74rem; color: var(--text-muted);">${item.color} | ${item.category_name}</span>
          </td>
          <td style="text-align: center; font-weight: 700;">${item.size}</td>
          <td style="text-align: right; font-weight: 700;">${formatRupiah(item.catalog_price)}</td>
          <td style="text-align: right;" class="owner-cost-col">
            ${isOwner ? (item.reference_hpp ? formatRupiah(item.reference_hpp) : '-') : '<span style="color:#94A3B8;">[Restricted]</span>'}
          </td>
          <td style="text-align: center; background: rgba(23, 59, 53, 0.03);">
            <span style="font-weight: 700; color: var(--primary);">${item.stock.owned_physical}</span> |
            <span style="color: #D97706;">${item.stock.owned_reserved}</span> |
            <span style="font-weight: 700; color: var(--success);">${item.stock.owned_available}</span>
          </td>
          <td style="text-align: center; background: rgba(139, 92, 246, 0.03);">
            <span style="font-weight: 700; color: #7C3AED;">${item.stock.consignment_physical}</span> |
            <span style="color: #D97706;">${item.stock.consignment_reserved}</span> |
            <span style="font-weight: 700; color: var(--success);">${item.stock.consignment_available}</span>
          </td>
          <td style="text-align: right; font-weight: 800; font-size: 1rem; color: var(--primary);">${item.stock.total_available} pcs</td>
          <td style="text-align: center;">
            <span class="badge ${badgeClass}">${statusLabel}</span>
          </td>
          <td style="text-align: center;">
            <button onclick="viewBatchDetail('${item.sku}', ${JSON.stringify(item.fifo_batches).replace(/"/g, '&quot;')}, ${JSON.stringify(item.consignment_lots || []).replace(/"/g, '&quot;')})" class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" title="Lihat Antrean Batch FIFO & Lot Konsinyasi">
              <i class="fa-solid fa-layer-group"></i> ${item.fifo_batches ? item.fifo_batches.length : 0} Batch | ${item.consignment_lots ? item.consignment_lots.length : 0} Lot
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Toggle owner columns
    if (!isOwner) {
      document.querySelectorAll(".owner-cost-col").forEach(el => el.style.display = "none");
    } else {
      document.querySelectorAll(".owner-cost-col").forEach(el => el.style.display = "table-cell");
    }

  } catch (err) {
    console.error("Gagal memuat inventaris:", err);
  }
};

// Modal Batch FIFO & Lot Konsinyasi
window.viewBatchDetail = function(sku, batches, consignmentLots) {
  const isOwner = (PROD_STATE.user && PROD_STATE.user.role === "OWNER");
  document.getElementById("batchModalSku").innerText = `SKU: ${sku}`;
  const tbody = document.getElementById("batchModalTableBody");
  const tbodyConsignment = document.getElementById("consignmentLotModalTableBody");

  if (!batches || batches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Tidak ada batch persediaan aktif untuk varian ini.</td></tr>`;
  } else {
    tbody.innerHTML = batches.map(b => `
      <tr>
        <td><code>${b.batch_id}</code></td>
        <td>${b.purchase_id || '-'}</td>
        <td style="text-align: right; font-weight: 700; color: var(--primary);">${b.remaining_qty} pcs</td>
        <td style="text-align: right;" class="owner-cost-col">
          ${isOwner ? formatRupiah(b.unit_cost) : '<span style="color:#94A3B8;">[Restricted]</span>'}
        </td>
      </tr>
    `).join('');
  }

  if (tbodyConsignment) {
    if (!consignmentLots || consignmentLots.length === 0) {
      tbodyConsignment.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Tidak ada lot konsinyasi vendor aktif untuk varian ini.</td></tr>`;
    } else {
      tbodyConsignment.innerHTML = consignmentLots.map(l => `
        <tr>
          <td><code>${l.consignment_lot_id}</code></td>
          <td><span style="font-weight: 600; color: #7C3AED;">${l.vendor_id}</span></td>
          <td style="text-align: right; font-weight: 700; color: #7C3AED;">${l.remaining_qty} pcs</td>
          <td style="text-align: center;">
            <span class="badge ${l.remaining_qty > 0 ? 'badge-success' : 'badge-danger'}">${l.status || 'ACTIVE'}</span>
          </td>
        </tr>
      `).join('');
    }
  }

  if (!isOwner) {
    document.querySelectorAll(".owner-cost-col").forEach(el => el.style.display = "none");
  } else {
    document.querySelectorAll(".owner-cost-col").forEach(el => el.style.display = "table-cell");
  }

  document.getElementById("batchModal").style.display = "flex";
};

window.closeBatchModal = function() {
  document.getElementById("batchModal").style.display = "none";
};

// ---------------------------------------------------------------------------
// 6. TAB 3: PENERIMAAN STOK (STOCK IN: SUPPLIER & CONSIGNMENT)
// ---------------------------------------------------------------------------
window.toggleOwnershipFields = function() {
  const type = document.querySelector('input[name="ownershipType"]:checked').value;
  const consignmentFields = document.getElementById("consignmentFields");
  const supplierFields = document.getElementById("supplierFields");
  const costWrapper = document.getElementById("costInputWrapper");
  const partialWrapper = document.getElementById("partialDeliveryWrapper");

  if (type === "VENDOR_CONSIGNMENT") {
    consignmentFields.style.display = "block";
    supplierFields.style.display = "none";
    costWrapper.style.display = "none";
    partialWrapper.style.display = "none";
  } else {
    consignmentFields.style.display = "none";
    supplierFields.style.display = "block";
    costWrapper.style.display = "block";
    partialWrapper.style.display = "block";
  }
};

window.populateStockInVariants = async function() {
  try {
    const res = await fetch('/api/inventory', {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (data.success && data.inventory) {
      const select = document.getElementById("stockInVariantSelect");
      select.innerHTML = '<option value="">-- Pilih SKU Varian Produk --</option>' + 
        data.inventory.map(v => 
          `<option value="${v.variant_id}">${v.sku} — ${v.product_name} (${v.color}, Size ${v.size})</option>`
        ).join('');
    }
  } catch (e) {
    console.error("Gagal memuat varian:", e);
  }
};

window.handleStockInSubmit = async function(event) {
  event.preventDefault();

  const ownershipType = document.querySelector('input[name="ownershipType"]:checked').value;
  const variantId = document.getElementById("stockInVariantSelect").value;
  const quantity = parseInt(document.getElementById("stockInQuantity").value, 10);
  const notes = document.getElementById("stockInNotes").value.trim();

  if (!variantId) {
    alert("Silakan pilih SKU varian produk terlebih dahulu.");
    return;
  }

  if (isNaN(quantity) || quantity <= 0) {
    alert("Kuantitas fisik yang diterima harus lebih dari 0.");
    return;
  }

  const stockData = {
    ownership_type: ownershipType,
    variant_id: variantId,
    quantity: quantity,
    notes: notes
  };

  if (ownershipType === "VENDOR_CONSIGNMENT") {
    const vendorId = document.getElementById("stockInVendorSelect").value;
    if (!vendorId) {
      alert("Silakan pilih vendor konsinyasi.");
      return;
    }
    stockData.vendor_id = vendorId;
  } else {
    const unitCost = parseFloat(document.getElementById("stockInUnitCost").value) || 0;
    const supplierName = document.getElementById("stockInSupplierName").value.trim() || "Supplier Umum";
    const purchaseId = document.getElementById("stockInPurchaseId").value.trim();
    const isPartial = document.getElementById("stockInIsPartial").checked;

    stockData.is_partial = isPartial;
    stockData.purchase_id = purchaseId;
    stockData.purchase_header = {
      purchase_id: purchaseId || undefined,
      supplier_name: supplierName,
      receiving_status: isPartial ? "PARTIAL_RECEIVED" : "RECEIVED"
    };
    stockData.items = [{
      variant_id: variantId,
      quantity: quantity,
      base_unit_cost: unitCost,
      vendor_incentive: 0,
      is_last_delivery: !isPartial
    }];
  }

  const btn = document.getElementById("stockInSubmitBtn");
  btn.disabled = true;

  try {
    const res = await fetch('/api/stock/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PROD_STATE.token}`
      },
      body: JSON.stringify(stockData)
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    alert(`Penerimaan stok ${quantity} unit berhasil dicatat dan masuk ke inventaris!`);
    document.getElementById("stockInForm").reset();
    toggleOwnershipFields();
    // Refresh inventaris & beralih ke tab inventaris
    switchTab('inventory');
  } catch (err) {
    alert("Gagal mencatat penerimaan stok: " + err.message);
  } finally {
    btn.disabled = false;
  }
};

// ---------------------------------------------------------------------------
// 7. TAB 4: RIWAYAT MUTASI STOK (AUDIT TRAIL)
// ---------------------------------------------------------------------------
window.debounceMovementSearch = function() {
  clearTimeout(PROD_STATE.searchTimer);
  PROD_STATE.searchTimer = setTimeout(loadStockMovements, 300);
};

window.loadStockMovements = async function() {
  const sku = document.getElementById("movSearchInput").value.trim();
  const category = document.getElementById("movCategoryFilter").value;
  const type = document.getElementById("movTypeFilter").value;

  try {
    const params = new URLSearchParams();
    if (sku) params.append("sku", sku);
    if (category !== "ALL") params.append("stock_category", category);
    if (type !== "ALL") params.append("movement_type", type);

    const res = await fetch(`/api/stock/movements?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const movements = data.movements || [];
    const tbody = document.getElementById("movementsTableBody");
    const empty = document.getElementById("movementsEmptyState");

    if (movements.length === 0) {
      tbody.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";
    tbody.innerHTML = movements.map(m => {
      const isPositive = m.quantity > 0 && !m.movement_type.includes("DISPATCH");
      const isNegative = m.movement_type.includes("DISPATCH") || m.quantity < 0;
      
      let typeLabel = m.movement_type;
      let badgeStyle = "badge-info";

      if (m.movement_type === "PURCHASE_RECEIPT") {
        typeLabel = "Penerimaan Pembelian";
        badgeStyle = "badge-success";
      } else if (m.movement_type === "CONSIGNMENT_RECEIPT") {
        typeLabel = "Titipan Konsinyasi";
        badgeStyle = "badge-info";
      } else if (m.movement_type === "SALES_DISPATCH") {
        typeLabel = "Penjualan Kasir";
        badgeStyle = "badge-warning";
      } else if (m.movement_type === "STOCK_RESERVATION") {
        typeLabel = "Reservasi PO";
        badgeStyle = "badge-warning";
      } else if (m.movement_type === "PO_FULFILLMENT") {
        typeLabel = "Pemenuhan PO";
        badgeStyle = "badge-success";
      } else if (m.movement_type === "RETURN_IN") {
        typeLabel = "Retur Masuk";
        badgeStyle = "badge-info";
      }

      return `
        <tr>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${formatDateIndo(m.movement_date)}</td>
          <td><strong><code>${m.sku}</code></strong></td>
          <td>
            <div>${m.product_name}</div>
            <span style="font-size: 0.74rem; color: var(--text-muted);">${m.color} | Size ${m.size}</span>
          </td>
          <td style="text-align: center;">
            <span class="badge ${m.stock_category === 'OWNED' ? 'badge-success' : 'badge-info'}">
              ${m.stock_category}
            </span>
          </td>
          <td style="text-align: center;">
            <span class="badge ${badgeStyle}">${typeLabel}</span>
          </td>
          <td style="text-align: right; font-weight: 700; color: ${isNegative ? 'var(--danger)' : 'var(--success)'};">
            ${isNegative ? '-' : '+'}${Math.abs(m.quantity)} pcs
          </td>
          <td>
            <div style="font-size: 0.8rem; font-family: monospace;">${m.reference_id || '-'}</div>
            ${m.notes ? `<span style="font-size: 0.74rem; color: var(--text-muted);">${m.notes}</span>` : ''}
          </td>
          <td><span style="font-size: 0.8rem; color: #475569;">${m.created_by || 'SYSTEM'}</span></td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error("Gagal memuat mutasi stok:", err);
  }
};

// ---------------------------------------------------------------------------
// 8. LOGOUT & PLACEHOLDER
// ---------------------------------------------------------------------------
window.showPlaceholder = function(featureName) {
  alert(`Modul "${featureName}" dijadwalkan pada fase berikutnya sesuai roadmap CrocsCircle.ID.\nFokus Phase 3C saat ini adalah Etalase Belanja Pelanggan & Keranjang Pre-Order / Ready Stock.`);
};

window.handleLogout = async function() {
  if (!confirm("Apakah Anda yakin ingin keluar dari Portal Admin?")) return;

  const token = PROD_STATE.token;
  try {
    if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ token })
      });
    }
  } catch (e) {
  } finally {
    sessionStorage.removeItem("crocscircle_admin_token");
    sessionStorage.removeItem("crocscircle_admin_user");
    window.location.href = "login.html";
  }
};
