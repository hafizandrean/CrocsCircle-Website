// CrocsCircle.ID — Product & Inventory Management Frontend Controller (Vanilla JS)
// Version: 1.0.0 (Phase 3B)

const PROD_STATE = {
  token: null,
  user: null,
  categories: [],
  vendors: [],
  currentTab: 'products',
  activeDetailProductId: null,
  inventoryList: [],
  activeDetailProduct: null,
  searchTimer: null,
  modalImages: [], // array of { data, name, isCover }
  selectedInitSizes: new Set(['M6', 'M7', 'M8', 'M9', 'M10']),
  selectedModalSizes: new Set(['M6', 'M7', 'M8', 'M9', 'M10']),
  varModalMode: 'batch'
};

const CROCS_STANDARD_SIZES = [
  'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12',
  'W5', 'W6', 'W7', 'W8', 'W9'
];

// Helper: Image Parsers
window.getPrimaryImageUrl = function(imageUrl) {
  if (!imageUrl) return "";
  if (Array.isArray(imageUrl)) return imageUrl[0] || "";
  if (typeof imageUrl === "string" && imageUrl.startsWith("[")) {
    try {
      const arr = JSON.parse(imageUrl);
      if (Array.isArray(arr) && arr.length > 0) return arr[0];
    } catch (e) {}
  }
  if (typeof imageUrl === "string" && imageUrl.includes(",")) {
    return imageUrl.split(",")[0].trim();
  }
  return imageUrl;
};

window.getAllProductImages = function(imageUrl) {
  if (!imageUrl) return [];
  if (Array.isArray(imageUrl)) return imageUrl.filter(Boolean);
  if (typeof imageUrl === "string" && imageUrl.startsWith("[")) {
    try {
      const arr = JSON.parse(imageUrl);
      if (Array.isArray(arr)) return arr.filter(Boolean);
    } catch (e) {}
  }
  if (typeof imageUrl === "string" && imageUrl.includes(",")) {
    return imageUrl.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [imageUrl].filter(Boolean);
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

      // Populate Vendor Dropdown in Penerimaan Titip Jual
      const vendorSelect = document.getElementById("stockInVendorSelect");
      if (vendorSelect) {
        vendorSelect.innerHTML = PROD_STATE.vendors.map(v => {
          let termDesc = "Bagi Hasil Standar";
          if (v.fixed_vendor_share && Number(v.fixed_vendor_share) > 0) {
            termDesc = `Hak Bersih ${formatRupiah(v.fixed_vendor_share)} / psg`;
          } else if (v.consignment_fee_type === 'PERCENTAGE') {
            termDesc = `Komisi Toko ${v.default_consignment_fee || 10}%`;
          } else if (v.default_consignment_fee) {
            termDesc = `Komisi Toko ${formatRupiah(v.default_consignment_fee)}`;
          }
          return `<option value="${v.vendor_id}">${v.vendor_name} — [${termDesc}]</option>`;
        }).join('');
      }
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
    tbody.innerHTML = data.products.map(p => {
      const coverUrl = getPrimaryImageUrl(p.image_url) || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 50 50\'><rect width=\'50\' height=\'50\' fill=\'%23E2E8F0\'/><text x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23173B35\' font-family=\'sans-serif\' font-size=\'9\' font-weight=\'bold\'>CROCS</text></svg>';
      return `
      <tr>
        <td>
          <img src="${coverUrl}" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 50 50\'><rect width=\'50\' height=\'50\' fill=\'%23E2E8F0\'/><text x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23173B35\' font-family=\'sans-serif\' font-size=\'9\' font-weight=\'bold\'>CROCS</text></svg>';" alt="${p.product_name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);">
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
    `}).join('');

  } catch (err) {
    console.error("Gagal memuat katalog produk:", err);
  }
};

// ===========================================================================
// IMAGE UPLOAD & GALLERY HANDLERS (LOCAL FILE PICKER & DRAG & DROP)
// ===========================================================================
window.triggerFileInput = function() {
  const fileInput = document.getElementById("modalProductFileInput");
  if (fileInput) fileInput.click();
};

window.handleDragOver = function(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById("imageDropZone");
  if (zone) zone.style.borderColor = "var(--primary)";
};

window.handleDragLeave = function(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById("imageDropZone");
  if (zone) zone.style.borderColor = "#94A3B8";
};

window.handleFileDrop = function(e) {
  e.preventDefault();
  e.stopPropagation();
  const zone = document.getElementById("imageDropZone");
  if (zone) zone.style.borderColor = "#94A3B8";
  if (e.dataTransfer && e.dataTransfer.files) {
    processFiles(e.dataTransfer.files);
  }
};

window.handleFileSelection = function(e) {
  if (e.target && e.target.files) {
    processFiles(e.target.files);
  }
};

function processFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  const statusEl = document.getElementById("imageUploadStatus");
  if (statusEl) {
    statusEl.innerText = `Memproses ${fileList.length} file gambar...`;
    statusEl.style.display = "block";
  }

  let processed = 0;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file.type.startsWith("image/")) continue;

    const reader = new FileReader();
    reader.onload = function(evt) {
      const rawData = evt.target.result;
      PROD_STATE.modalImages.push({
        name: file.name,
        data: rawData,
        isNewLocal: true,
        file: file
      });
      processed++;
      if (processed >= fileList.length) {
        if (statusEl) statusEl.style.display = "none";
        renderImagePreviews();
      }
    };
    reader.readAsDataURL(file);
  }
}

window.toggleManualUrlInput = function() {
  const container = document.getElementById("manualUrlContainer");
  const toggleText = document.getElementById("manualUrlToggleText");
  if (!container) return;
  if (container.style.display === "none") {
    container.style.display = "block";
    toggleText.innerText = "Sembunyikan Input URL";
  } else {
    container.style.display = "none";
    toggleText.innerText = "Atau Masukkan Link URL Web";
  }
};

window.addManualUrlImage = function() {
  const input = document.getElementById("manualUrlInput");
  if (!input) return;
  const url = input.value.trim();
  if (!url) return;

  PROD_STATE.modalImages.push({
    name: "Web URL",
    data: url,
    isNewLocal: false
  });
  input.value = "";
  renderImagePreviews();
};

window.renderImagePreviews = function() {
  const grid = document.getElementById("imagePreviewGrid");
  if (!grid) return;

  if (PROD_STATE.modalImages.length === 0) {
    grid.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">Belum ada foto dipilih. Foto pertama akan otomatis menjadi sampul katalog.</span>`;
    return;
  }

  grid.innerHTML = PROD_STATE.modalImages.map((img, idx) => {
    const isCover = idx === 0;
    return `
      <div style="position: relative; width: 90px; height: 90px; border-radius: 8px; border: 2px solid ${isCover ? 'var(--primary)' : 'var(--border)'}; overflow: hidden; background: #F1F5F9; box-shadow: var(--shadow-sm);">
        <img src="${img.data}" alt="${img.name || 'Foto'}" style="width: 100%; height: 100%; object-fit: cover;">
        ${isCover ? `
          <span style="position: absolute; top: 3px; left: 3px; background: var(--primary); color: white; font-size: 0.62rem; font-weight: 700; padding: 1px 5px; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
            ⭐ Sampul
          </span>
        ` : `
          <button type="button" onclick="setAsCoverImage(${idx})" title="Jadikan Sampul Utama" style="position: absolute; bottom: 3px; left: 3px; background: rgba(0,0,0,0.65); color: white; border: none; font-size: 0.62rem; padding: 2px 4px; border-radius: 3px; cursor: pointer;">
            Jadikan Sampul
          </button>
        `}
        <button type="button" onclick="removeImageAtIndex(${idx})" title="Hapus Foto" style="position: absolute; top: 3px; right: 3px; background: #DC2626; color: white; border: none; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; cursor: pointer;">
          &times;
        </button>
      </div>
    `;
  }).join('');
};

window.setAsCoverImage = function(index) {
  if (index <= 0 || index >= PROD_STATE.modalImages.length) return;
  const item = PROD_STATE.modalImages.splice(index, 1)[0];
  PROD_STATE.modalImages.unshift(item);
  renderImagePreviews();
};

window.removeImageAtIndex = function(index) {
  PROD_STATE.modalImages.splice(index, 1);
  renderImagePreviews();
};

// Upload any local images to Cloud ImgBB (Lossless original quality)
const IMGBB_API_KEY = "523d5e151a6dadfae29378f2124f3a68";

async function uploadModalImagesToServer() {
  const localItems = PROD_STATE.modalImages.filter(img => img.isNewLocal && (img.file || (typeof img.data === 'string' && img.data.startsWith('data:'))));
  if (localItems.length === 0) {
    return PROD_STATE.modalImages.map(img => img.data);
  }

  const statusEl = document.getElementById("imageUploadStatus");
  const finalUrls = [];
  let currentIdx = 0;

  for (const img of PROD_STATE.modalImages) {
    if (img.isNewLocal && (img.file || (typeof img.data === 'string' && img.data.startsWith('data:')))) {
      currentIdx++;
      if (statusEl) {
        statusEl.innerText = `Mengunggah foto ke Cloud ImgBB (${currentIdx}/${localItems.length})...`;
        statusEl.style.display = "block";
      }

      let uploadedUrl = null;
      try {
        const formData = new FormData();
        if (img.file) {
          formData.append("image", img.file);
        } else if (typeof img.data === 'string' && img.data.startsWith('data:')) {
          const b64 = img.data.split(',')[1];
          formData.append("image", b64);
        }

        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: "POST",
          body: formData
        });
        const resData = await res.json();
        if (resData && resData.success && resData.data && resData.data.url) {
          uploadedUrl = resData.data.url;
          console.log("Berhasil upload ke ImgBB:", uploadedUrl);
        } else {
          console.warn("ImgBB upload warning response:", resData);
        }
      } catch (err) {
        console.warn("Gagal upload langsung ke ImgBB:", err.message);
      }

      if (uploadedUrl) {
        finalUrls.push(uploadedUrl);
        img.data = uploadedUrl;
        img.isNewLocal = false;
      } else {
        // Fallback: coba endpoint server lokal
        try {
          const res = await fetch('/api/upload-images', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${PROD_STATE.token}`
            },
            body: JSON.stringify({ images: [img] })
          });
          const resData = await res.json();
          if (resData && resData.success && resData.urls && resData.urls[0]) {
            finalUrls.push(resData.urls[0]);
          } else {
            finalUrls.push(img.data);
          }
        } catch (e) {
          finalUrls.push(img.data);
        }
      }
    } else {
      finalUrls.push(img.data);
    }
  }

  if (statusEl) statusEl.style.display = "none";
  return finalUrls;
}

// ===========================================================================
// BATCH SIZE SELECTOR & INITIAL VARIANTS LOGIC
// ===========================================================================
window.renderInitSizeChips = function() {
  const container = document.getElementById("initSizeChipsContainer");
  if (!container) return;

  container.innerHTML = CROCS_STANDARD_SIZES.map(sz => {
    const isSelected = PROD_STATE.selectedInitSizes.has(sz);
    return `
      <button type="button" onclick="toggleInitSizeChip('${sz}')" style="padding: 5px 9px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 1.5px solid ${isSelected ? '#16A34A' : '#CBD5E1'}; background: ${isSelected ? '#DCFCE7' : 'white'}; color: ${isSelected ? '#15803D' : '#475569'}; display: inline-flex; align-items: center; gap: 3px;">
        ${isSelected ? '<i class="fa-solid fa-check" style="font-size: 0.7rem;"></i>' : ''} ${sz}
      </button>
    `;
  }).join('');

  updateInitialVariantPreview();
};

window.toggleInitSizeChip = function(sz) {
  if (PROD_STATE.selectedInitSizes.has(sz)) {
    PROD_STATE.selectedInitSizes.delete(sz);
  } else {
    PROD_STATE.selectedInitSizes.add(sz);
  }
  renderInitSizeChips();
};

window.renderModalSizeChips = function() {
  const container = document.getElementById("modalSizeChipsContainer");
  if (!container) return;

  container.innerHTML = CROCS_STANDARD_SIZES.map(sz => {
    const isSelected = PROD_STATE.selectedModalSizes.has(sz);
    return `
      <button type="button" onclick="toggleModalSizeChip('${sz}')" style="padding: 5px 9px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.15s; border: 1.5px solid ${isSelected ? '#2563EB' : '#CBD5E1'}; background: ${isSelected ? '#EFF6FF' : 'white'}; color: ${isSelected ? '#1D4ED8' : '#475569'}; display: inline-flex; align-items: center; gap: 3px;">
        ${isSelected ? '<i class="fa-solid fa-check" style="font-size: 0.7rem;"></i>' : ''} ${sz}
      </button>
    `;
  }).join('');

  updateVarBatchPreview();
};

window.toggleModalSizeChip = function(sz) {
  if (PROD_STATE.selectedModalSizes.has(sz)) {
    PROD_STATE.selectedModalSizes.delete(sz);
  } else {
    PROD_STATE.selectedModalSizes.add(sz);
  }
  renderModalSizeChips();
};

window.selectBatchSizes = function(mode, targetPrefix) {
  const setRef = targetPrefix === 'init' ? PROD_STATE.selectedInitSizes : PROD_STATE.selectedModalSizes;
  setRef.clear();

  if (mode === 'POPULAR') {
    ['M6', 'M7', 'M8', 'M9', 'M10'].forEach(s => setRef.add(s));
  } else if (mode === 'ALL_M') {
    ['M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'].forEach(s => setRef.add(s));
  } // 'CLEAR' leaves it empty

  if (targetPrefix === 'init') {
    renderInitSizeChips();
  } else {
    renderModalSizeChips();
  }
};

window.toggleInitialVariantsFields = function() {
  const chk = document.getElementById("toggleInitialVariants");
  const fields = document.getElementById("initialVariantsFields");
  if (!chk || !fields) return;
  fields.style.display = chk.checked ? "block" : "none";
  if (chk.checked) {
    renderInitSizeChips();
  }
};

window.syncSuggestedModelAndSku = function() {
  const name = document.getElementById("modalProductName").value.trim();
  const modelInput = document.getElementById("modalProductModel");
  if (!modelInput.value && name) {
    const words = name.split(" ");
    modelInput.value = words.slice(1).join(" ") || words[0];
  }
  updateInitialVariantPreview();
};

window.updateInitialVariantPreview = function() {
  const textEl = document.getElementById("initVariantPreviewText");
  if (!textEl) return;

  const count = PROD_STATE.selectedInitSizes.size;
  const color = (document.getElementById("initVarColor")?.value || "Black").trim();
  const price = Number(document.getElementById("initVarPrice")?.value) || 0;

  if (count === 0) {
    textEl.innerText = "Pilih minimal 1 ukuran di atas. SKU akan di-generate otomatis.";
    textEl.style.color = "#DC2626";
    return;
  }

  const sizesArr = Array.from(PROD_STATE.selectedInitSizes);
  textEl.innerText = `⚡ ${count} Varian ukuran (${sizesArr.join(', ')}) warna ${color} akan langsung dibuat otomatis dengan harga ${formatRupiah(price)}.`;
  textEl.style.color = "#065F46";
};

// ===========================================================================
// MODAL: TAMBAH / EDIT PRODUK (ETALASE)
// ===========================================================================
window.openAddProductModal = function() {
  document.getElementById("productModalTitle").innerText = "Tambah Produk Baru ke Etalase";
  document.getElementById("modalProductId").value = "";
  document.getElementById("modalProductName").value = "";
  document.getElementById("modalProductModel").value = "";
  document.getElementById("modalProductDesc").value = "";
  
  // Reset images
  PROD_STATE.modalImages = [];
  renderImagePreviews();
  const manualContainer = document.getElementById("manualUrlContainer");
  if (manualContainer) manualContainer.style.display = "none";
  
  // Set default category
  const catSelect = document.getElementById("modalProductCategory");
  if (catSelect && catSelect.options.length > 0) catSelect.selectedIndex = 0;
  
  document.getElementById("modalProductActive").checked = true;
  document.getElementById("modalProductPublished").checked = true;

  // Show initial variants section for new products
  const initSection = document.getElementById("initialVariantsSection");
  if (initSection) initSection.style.display = "block";
  const chk = document.getElementById("toggleInitialVariants");
  if (chk) {
    chk.checked = true;
    toggleInitialVariantsFields();
  }

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
    document.getElementById("productModalTitle").innerText = "Edit Produk Etalase";
    document.getElementById("modalProductId").value = p.product_id;
    document.getElementById("modalProductName").value = p.product_name;
    document.getElementById("modalProductModel").value = p.model || "";
    
    // Set category
    const catSelect = document.getElementById("modalProductCategory");
    if (catSelect) {
      if (p.category_id) catSelect.value = p.category_id;
      else if (catSelect.options.length > 0) catSelect.selectedIndex = 0;
    }

    document.getElementById("modalProductDesc").value = p.description || "";
    document.getElementById("modalProductActive").checked = (p.is_active === true || p.is_active === "true");
    document.getElementById("modalProductPublished").checked = (p.is_published === true || p.is_published === "true");

    // Load existing images into state
    const existingImages = getAllProductImages(p.image_url);
    PROD_STATE.modalImages = existingImages.map((url, i) => ({
      name: `Foto ${i + 1}`,
      data: url,
      isNewLocal: false
    }));
    renderImagePreviews();

    // Hide initial variants section when editing existing product
    const initSection = document.getElementById("initialVariantsSection");
    if (initSection) initSection.style.display = "none";

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
  const btn = document.getElementById("btnSubmitProduct");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  try {
    // 1. Upload local images to server
    const finalImageUrls = await uploadModalImagesToServer();
    const finalImageUrlStr = finalImageUrls.length === 1 ? finalImageUrls[0] : (finalImageUrls.length > 1 ? JSON.stringify(finalImageUrls) : "");

    const productId = document.getElementById("modalProductId").value;
    const isNew = !productId;
    const productName = document.getElementById("modalProductName").value.trim();
    const model = document.getElementById("modalProductModel").value.trim();
    const categoryId = document.getElementById("modalProductCategory").value;

    const productData = {
      product_id: productId || undefined,
      product_name: productName,
      model: model,
      category_id: categoryId,
      description: document.getElementById("modalProductDesc").value.trim(),
      image_url: finalImageUrlStr,
      is_active: document.getElementById("modalProductActive").checked,
      is_published: document.getElementById("modalProductPublished").checked
    };

    // 2. Save product
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

    const savedProductId = result.product_id || (result.product && result.product.product_id) || productId;

    // 3. If new product and toggleInitialVariants is checked, batch create initial variants!
    const chkInit = document.getElementById("toggleInitialVariants");
    if (isNew && chkInit && chkInit.checked && PROD_STATE.selectedInitSizes.size > 0) {
      const color = (document.getElementById("initVarColor").value || "Black").trim();
      const price = Number(document.getElementById("initVarPrice").value) || 0;
      const refHpp = Number(document.getElementById("initVarRefHpp")?.value) || 0;

      const modelCode = (model || productName).substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const colorCode = color.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');

      const variantsPayload = [];
      PROD_STATE.selectedInitSizes.forEach(size => {
        const sku = `CRC-${modelCode || 'GEN'}-${colorCode || 'CLR'}-${size}`;
        variantsPayload.push({
          product_id: savedProductId,
          sku: sku,
          color: color,
          size: size,
          catalog_price: price,
          reference_hpp: refHpp
        });
      });

      if (variantsPayload.length > 0) {
        await fetch('/api/variants/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PROD_STATE.token}`
          },
          body: JSON.stringify({ variants: variantsPayload })
        });
      }
    }

    alert("Produk & varian berhasil disimpan ke etalase!");
    closeProductModal();
    loadProducts();
  } catch (err) {
    alert("Gagal menyimpan produk: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-save"></i> Simpan Produk`;
    }
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
    PROD_STATE.activeDetailProduct = p;
    PROD_STATE.activeDetailVariants = variants;

    document.getElementById("detailModalProductName").innerText = p.product_name;
    document.getElementById("detailModalCategory").innerText = `ID: ${p.product_id} | Kategori: ${p.category_id}`;

    // Render photo gallery in detail modal
    const galleryRow = document.getElementById("detailModalGalleryRow");
    if (galleryRow) {
      const allImgs = getAllProductImages(p.image_url);
      if (allImgs.length === 0) {
        galleryRow.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted); font-style: italic;"><i class="fa-solid fa-image"></i> Belum ada foto untuk produk ini.</span>`;
      } else {
        galleryRow.innerHTML = allImgs.map((url, i) => `
          <div style="position: relative; flex-shrink: 0; width: 75px; height: 75px; border-radius: 6px; overflow: hidden; border: 2px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}; background: white; box-shadow: var(--shadow-sm);">
            <img src="${url}" alt="Foto ${i+1}" style="width: 100%; height: 100%; object-fit: cover;">
            ${i === 0 ? '<span style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(23,59,53,0.85); color: white; font-size: 0.58rem; text-align: center; font-weight: 700; padding: 1px 0;">Sampul</span>' : ''}
          </div>
        `).join('');
      }
    }

    const tbody = document.getElementById("detailModalVariantsBody");
    if (variants.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">Belum ada varian ukuran untuk produk ini. Klik "Tambah Varian" untuk menambahkan.</td></tr>`;
    } else {
      tbody.innerHTML = variants.map((v, idx) => `
        <tr>
          <td><code>${v.sku}</code></td>
          <td>${v.color || '-'}</td>
          <td style="text-align: center; font-weight: 700;">${v.size || '-'}</td>
          <td style="text-align: right; font-weight: 700;">${formatRupiah(v.catalog_price)}</td>
          <td style="text-align: center;">
            <span style="font-weight: 600;">${v.stock ? v.stock.owned_physical : 0}</span> Fisik
            <span style="font-size: 0.75rem; color: #D97706;">(${v.stock ? v.stock.owned_reserved : 0} PO)</span>
          </td>
          <td style="text-align: center; color: #7C3AED;">
            <span style="font-weight: 600;">${v.stock ? v.stock.consignment_physical : 0}</span> Fisik
            <span style="font-size: 0.75rem; color: #D97706;">(${v.stock ? v.stock.consignment_reserved : 0} PO)</span>
          </td>
          <td style="text-align: right; font-weight: 800; color: var(--success);">${v.stock ? v.stock.total_available : 0} pcs</td>
          <td style="text-align: center; white-space: nowrap;">
            <button onclick="editVariantByIndex(${idx})" class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" title="Edit Varian">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
          </td>
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

// ===========================================================================
// STANDALONE VARIANT MODAL HANDLERS (BATCH & MANUAL MODES)
// ===========================================================================
window.switchVariantInputMode = function(mode) {
  PROD_STATE.varModalMode = mode;
  const btnBatch = document.getElementById("varModeBtnBatch");
  const btnManual = document.getElementById("varModeBtnManual");
  const containerBatch = document.getElementById("varBatchModeContainer");
  const containerManual = document.getElementById("varManualModeContainer");
  const sizeInput = document.getElementById("modalVarSize");
  const skuInput = document.getElementById("modalVarSku");

  if (mode === 'batch') {
    if (btnBatch) {
      btnBatch.style.background = "var(--primary)";
      btnBatch.style.color = "white";
      btnBatch.style.fontWeight = "700";
    }
    if (btnManual) {
      btnManual.style.background = "white";
      btnManual.style.color = "var(--text-muted)";
      btnManual.style.fontWeight = "600";
    }
    if (containerBatch) containerBatch.style.display = "block";
    if (containerManual) containerManual.style.display = "none";
    if (sizeInput) sizeInput.required = false;
    if (skuInput) skuInput.required = false;

    renderModalSizeChips();
  } else {
    if (btnManual) {
      btnManual.style.background = "var(--primary)";
      btnManual.style.color = "white";
      btnManual.style.fontWeight = "700";
    }
    if (btnBatch) {
      btnBatch.style.background = "white";
      btnBatch.style.color = "var(--text-muted)";
      btnBatch.style.fontWeight = "600";
    }
    if (containerManual) containerManual.style.display = "block";
    if (containerBatch) containerBatch.style.display = "none";
    if (sizeInput) sizeInput.required = true;
    if (skuInput) skuInput.required = true;
  }
};

window.updateVarBatchPreview = function() {
  const textEl = document.getElementById("modalVarBatchPreviewText");
  if (!textEl) return;

  const count = PROD_STATE.selectedModalSizes.size;
  const color = (document.getElementById("modalVarColor")?.value || "Black").trim();
  const prod = PROD_STATE.activeDetailProduct;
  const modelName = prod ? (prod.model || prod.product_name) : "CROCS";
  const modelCode = modelName.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const colorCode = color.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (count === 0) {
    textEl.innerText = "Pilih minimal 1 ukuran di atas. SKU akan di-generate otomatis.";
    textEl.style.color = "#DC2626";
    return;
  }

  const sizesArr = Array.from(PROD_STATE.selectedModalSizes);
  const sampleSku = `CRC-${modelCode || 'GEN'}-${colorCode || 'CLR'}-${sizesArr[0]}`;
  textEl.innerText = `⚡ ${count} Varian ukuran (${sizesArr.join(', ')}) warna ${color} akan dibuat sekaligus. Contoh SKU: ${sampleSku}`;
  textEl.style.color = "#1E40AF";
};

// Modal Tambah / Edit Varian
window.openAddVariantFromDetail = function() {
  const prodId = PROD_STATE.activeDetailProductId;
  if (!prodId) return;

  const prod = PROD_STATE.activeDetailProduct;
  const prodName = prod ? prod.product_name : prodId;

  document.getElementById("variantModalTitle").innerText = "Tambah Varian Ukuran & Warna";
  document.getElementById("modalVarProductId").value = prodId;
  document.getElementById("modalVarId").value = "";
  document.getElementById("variantModalSubtitle").innerText = `Produk: ${prodName} (${prodId})`;
  document.getElementById("modalVarSku").value = "";
  document.getElementById("modalVarColor").value = "Black";
  document.getElementById("modalVarSize").value = "";
  document.getElementById("modalVarCatalogPrice").value = "";
  document.getElementById("modalVarRefHpp").value = "";

  const switcher = document.getElementById("variantModeSwitcher");
  if (switcher) switcher.style.display = "flex";

  switchVariantInputMode('batch');
  document.getElementById("variantModal").style.display = "flex";
};

window.editVariantByIndex = function(idx) {
  if (!PROD_STATE.activeDetailVariants || !PROD_STATE.activeDetailVariants[idx]) return;
  const v = PROD_STATE.activeDetailVariants[idx];
  const prod = PROD_STATE.activeDetailProduct;
  const prodName = prod ? prod.product_name : v.product_id;

  document.getElementById("variantModalTitle").innerText = "Edit Varian Produk";
  document.getElementById("modalVarProductId").value = v.product_id;
  document.getElementById("modalVarId").value = v.variant_id;
  document.getElementById("variantModalSubtitle").innerText = `Produk: ${prodName} | SKU: ${v.sku}`;
  document.getElementById("modalVarSku").value = v.sku;
  document.getElementById("modalVarColor").value = v.color || "";
  document.getElementById("modalVarSize").value = v.size || "";
  document.getElementById("modalVarCatalogPrice").value = v.catalog_price || 0;
  document.getElementById("modalVarRefHpp").value = v.reference_hpp || 0;

  const switcher = document.getElementById("variantModeSwitcher");
  if (switcher) switcher.style.display = "none";

  switchVariantInputMode('manual');
  document.getElementById("variantModal").style.display = "flex";
};

window.generateSuggestedSku = function() {
  const prod = PROD_STATE.activeDetailProduct;
  const color = document.getElementById("modalVarColor").value.trim().toUpperCase().replace(/\s+/g, '');
  const size = document.getElementById("modalVarSize").value.trim().toUpperCase().replace(/\s+/g, '');
  
  let prefix = "CRC";
  let modelCode = "GEN";
  if (prod && prod.model) {
    modelCode = prod.model.substring(0, 3).toUpperCase();
  } else if (prod && prod.product_name) {
    const words = prod.product_name.split(' ');
    modelCode = (words[1] || words[0]).substring(0, 3).toUpperCase();
  }

  const colorCode = color ? color.substring(0, 3) : "CLR";
  const sizeCode = size || "SZ";
  const suggested = `${prefix}-${modelCode}-${colorCode}-${sizeCode}`;
  document.getElementById("modalVarSku").value = suggested;
};

window.closeVariantModal = function() {
  document.getElementById("variantModal").style.display = "none";
};

window.handleVariantFormSubmit = async function(event) {
  event.preventDefault();
  const btn = document.getElementById("btnSubmitVariant");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
  }

  try {
    const productId = document.getElementById("modalVarProductId").value;
    const variantId = document.getElementById("modalVarId").value;
    const color = document.getElementById("modalVarColor").value.trim();
    const price = Number(document.getElementById("modalVarCatalogPrice").value) || 0;
    const refHpp = Number(document.getElementById("modalVarRefHpp")?.value) || 0;

    if (PROD_STATE.varModalMode === 'batch' && !variantId) {
      // BATCH MODE
      if (PROD_STATE.selectedModalSizes.size === 0) {
        alert("Silakan pilih minimal 1 ukuran varian.");
        return;
      }

      const prod = PROD_STATE.activeDetailProduct;
      const modelName = prod ? (prod.model || prod.product_name) : "CROCS";
      const modelCode = modelName.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const colorCode = color.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');

      const variantsPayload = [];
      PROD_STATE.selectedModalSizes.forEach(size => {
        const sku = `CRC-${modelCode || 'GEN'}-${colorCode || 'CLR'}-${size}`;
        variantsPayload.push({
          product_id: productId,
          sku: sku,
          color: color,
          size: size,
          catalog_price: price,
          reference_hpp: refHpp
        });
      });

      const res = await fetch('/api/variants/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PROD_STATE.token}`
        },
        body: JSON.stringify({ variants: variantsPayload })
      });
      const result = await res.json();
      if (!result.success && result.errors && result.errors.length > 0) {
        alert("Peringatan: Beberapa varian gagal dibuat: " + result.errors.map(e => `${e.sku}: ${e.error}`).join('\n'));
      } else if (!result.success) {
        throw new Error(result.error);
      } else {
        alert(`Berhasil membuat ${result.createdCount || variantsPayload.length} varian ukuran!`);
      }

    } else {
      // MANUAL 1-SIZE MODE OR EDIT MODE
      const variantData = {
        product_id: productId,
        variant_id: variantId || undefined,
        sku: document.getElementById("modalVarSku").value.trim().toUpperCase(),
        color: color,
        size: document.getElementById("modalVarSize").value.trim().toUpperCase(),
        catalog_price: price,
        reference_hpp: refHpp
      };

      const res = await fetch('/api/variants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PROD_STATE.token}`
        },
        body: JSON.stringify(variantData)
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      alert("Varian produk berhasil disimpan!");
    }

    closeVariantModal();
    // Refresh modal detail & daftar produk
    viewProductDetail(productId);
    loadProducts();
  } catch (err) {
    alert("Gagal menyimpan varian: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-plus"></i> Simpan Varian`;
    }
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
    PROD_STATE.inventoryList = items;

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
    tbody.innerHTML = items.map((item, idx) => {
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
            <button onclick="viewBatchDetailByIndex(${idx})" class="btn btn-outline" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;" title="Lihat Antrean Batch FIFO & Lot Konsinyasi">
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

// Helper Batch FIFO by Index
window.viewBatchDetailByIndex = function(idx) {
  if (!PROD_STATE.inventoryList || !PROD_STATE.inventoryList[idx]) return;
  const item = PROD_STATE.inventoryList[idx];
  viewBatchDetail(item.sku, item.fifo_batches, item.consignment_lots);
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
// 6. TAB 3: PENERIMAAN TITIP JUAL (KONSINYASI VENDOR)
// ---------------------------------------------------------------------------
window.toggleOwnershipFields = function() {
  // Legacy stub: Tab 3 is now dedicated to VENDOR_CONSIGNMENT
};

window.populateStockInVariants = async function() {
  try {
    const res = await fetch('/api/inventory', {
      headers: { 'Authorization': `Bearer ${PROD_STATE.token}` }
    });
    const data = await res.json();
    if (data.success && data.inventory) {
      PROD_STATE.inventoryList = data.inventory;
      const select = document.getElementById("stockInVariantSelect");
      if (select) {
        select.innerHTML = '<option value="">-- Pilih SKU Varian Produk --</option>' + 
          data.inventory.map(v => 
            `<option value="${v.variant_id}">${v.sku} — ${v.product_name} (${v.color}, Size ${v.size}) [${formatRupiah(v.catalog_price)}]</option>`
          ).join('');
      }
      calculateTitipJualPreview();
    }
  } catch (e) {
    console.error("Gagal memuat varian:", e);
  }
};

window.calculateTitipJualPreview = function(preserveCustom = false) {
  const variantSelect = document.getElementById("stockInVariantSelect");
  const vendorSelect = document.getElementById("stockInVendorSelect");
  const qtyInput = document.getElementById("stockInQuantity");
  if (!variantSelect || !vendorSelect) return;

  const variantId = variantSelect.value;
  const vendorId = vendorSelect.value;
  const qty = parseInt(qtyInput ? qtyInput.value : 1, 10) || 1;

  const prevSellingPrice = document.getElementById("prevSellingPrice");
  const prevVendorShare = document.getElementById("prevVendorShare");
  const prevCrocsIncentive = document.getElementById("prevCrocsIncentive");
  const prevVendorNameBadge = document.getElementById("previewVendorNameBadge");
  const prevVendorShareNote = document.getElementById("prevVendorShareNote");
  const prevTotalIncentive = document.getElementById("prevTotalIncentive");
  const customShareInput = document.getElementById("customVendorShareInput");
  const customIncentiveInput = document.getElementById("customCrocsIncentiveInput");

  if (!variantId) {
    if (prevSellingPrice) prevSellingPrice.innerText = "Rp 0";
    if (prevVendorShare) prevVendorShare.innerText = "Rp 0";
    if (prevCrocsIncentive) prevCrocsIncentive.innerText = "Rp 0";
    if (prevTotalIncentive) prevTotalIncentive.innerText = "Pilih varian untuk kalkulasi";
    if (customShareInput) customShareInput.value = "";
    if (customIncentiveInput) customIncentiveInput.value = "";
    return;
  }

  // Find variant in loaded inventory
  const variant = (PROD_STATE.inventoryList || []).find(v => v.variant_id === variantId);
  const catalogPrice = variant ? Number(variant.catalog_price || 0) : 0;

  // Find vendor
  const vendor = (PROD_STATE.vendors || []).find(v => v.vendor_id === vendorId);
  if (prevVendorNameBadge && vendor) {
    prevVendorNameBadge.innerText = `Partner: ${vendor.vendor_name}`;
  }

  let vendorShare = 0;
  let crocsIncentive = 0;
  let shareNote = "Disetor setelah barang laku";

  if (preserveCustom && customShareInput && customShareInput.value !== "") {
    vendorShare = Number(customShareInput.value) || 0;
    crocsIncentive = Math.max(0, catalogPrice - vendorShare);
    shareNote = "Disesuaikan khusus untuk penerimaan ini";
  } else if (vendor) {
    const fixedShare = vendor.fixed_vendor_share ? Number(vendor.fixed_vendor_share) : 0;
    const feeType = vendor.consignment_fee_type || "FIXED_PER_UNIT";
    const feeValue = vendor.default_consignment_fee ? Number(vendor.default_consignment_fee) : 10000;

    if (fixedShare > 0) {
      vendorShare = fixedShare;
      crocsIncentive = Math.max(0, catalogPrice - fixedShare);
      shareNote = `Hak pasti partner ${formatRupiah(fixedShare)} / unit`;
    } else if (feeType === "PERCENTAGE") {
      crocsIncentive = Math.round(catalogPrice * (feeValue / 100));
      vendorShare = Math.max(0, catalogPrice - crocsIncentive);
      shareNote = `Bagi hasil partner (${100 - feeValue}%)`;
    } else {
      crocsIncentive = feeValue;
      vendorShare = Math.max(0, catalogPrice - crocsIncentive);
      shareNote = `Harga jual dikurangi fee ${formatRupiah(feeValue)}`;
    }

    if (customShareInput) customShareInput.value = vendorShare;
    if (customIncentiveInput) customIncentiveInput.value = crocsIncentive;
  } else {
    crocsIncentive = 10000;
    vendorShare = Math.max(0, catalogPrice - 10000);
    if (customShareInput) customShareInput.value = vendorShare;
    if (customIncentiveInput) customIncentiveInput.value = crocsIncentive;
  }

  if (prevSellingPrice) prevSellingPrice.innerText = formatRupiah(catalogPrice);
  if (prevVendorShare) prevVendorShare.innerText = formatRupiah(vendorShare);
  if (prevCrocsIncentive) prevCrocsIncentive.innerText = formatRupiah(crocsIncentive);
  if (prevVendorShareNote) prevVendorShareNote.innerText = shareNote;
  if (prevTotalIncentive) {
    prevTotalIncentive.innerText = (qty > 1) 
      ? `Total estimasi laba (${qty} pcs): ${formatRupiah(crocsIncentive * qty)}`
      : `Keuntungan bersih toko per unit`;
  }
};

window.onCustomVendorShareChange = function() {
  const variantSelect = document.getElementById("stockInVariantSelect");
  const customShareInput = document.getElementById("customVendorShareInput");
  const customIncentiveInput = document.getElementById("customCrocsIncentiveInput");
  if (!variantSelect || !customShareInput) return;

  const variantId = variantSelect.value;
  const variant = (PROD_STATE.inventoryList || []).find(v => v.variant_id === variantId);
  const catalogPrice = variant ? Number(variant.catalog_price || 0) : 0;

  const newShare = Number(customShareInput.value) || 0;
  const newIncentive = Math.max(0, catalogPrice - newShare);
  if (customIncentiveInput) customIncentiveInput.value = newIncentive;

  calculateTitipJualPreview(true);
};

window.onCustomCrocsIncentiveChange = function() {
  const variantSelect = document.getElementById("stockInVariantSelect");
  const customShareInput = document.getElementById("customVendorShareInput");
  const customIncentiveInput = document.getElementById("customCrocsIncentiveInput");
  if (!variantSelect || !customIncentiveInput) return;

  const variantId = variantSelect.value;
  const variant = (PROD_STATE.inventoryList || []).find(v => v.variant_id === variantId);
  const catalogPrice = variant ? Number(variant.catalog_price || 0) : 0;

  const newIncentive = Number(customIncentiveInput.value) || 0;
  const newShare = Math.max(0, catalogPrice - newIncentive);
  if (customShareInput) customShareInput.value = newShare;

  calculateTitipJualPreview(true);
};

window.resetToVendorDefaultTerms = function() {
  calculateTitipJualPreview(false);
};

window.handleStockInSubmit = async function(event) {
  event.preventDefault();

  const variantId = document.getElementById("stockInVariantSelect").value;
  const vendorId = document.getElementById("stockInVendorSelect").value;
  const quantity = parseInt(document.getElementById("stockInQuantity").value, 10);
  const notes = document.getElementById("stockInNotes").value.trim();

  if (!vendorId) {
    alert("Silakan pilih partner / pemilik barang titip jual.");
    return;
  }

  if (!variantId) {
    alert("Silakan pilih SKU varian produk terlebih dahulu.");
    return;
  }

  if (isNaN(quantity) || quantity <= 0) {
    alert("Kuantitas fisik yang diterima harus lebih dari 0.");
    return;
  }

  const customShare = Number(document.getElementById("customVendorShareInput")?.value);
  const customFee = Number(document.getElementById("customCrocsIncentiveInput")?.value);

  let finalNotes = notes;
  if (!isNaN(customShare) && customShare > 0) {
    finalNotes = (notes ? (notes + " ") : "") + `[HAK_VENDOR:${customShare};INSENTIF:${customFee || 0}]`;
  }

  const stockData = {
    ownership_type: "VENDOR_CONSIGNMENT",
    variant_id: variantId,
    vendor_id: vendorId,
    quantity: quantity,
    notes: finalNotes
  };

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

    alert(`Penerimaan barang titip jual sebanyak ${quantity} unit berhasil dicatat dan masuk ke inventaris!`);
    document.getElementById("stockInForm").reset();
    calculateTitipJualPreview(false);
    // Beralih ke tab inventaris untuk melihat stok terbarunya
    switchTab('inventory');
  } catch (err) {
    alert("Gagal mencatat penerimaan titip jual: " + err.message);
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
