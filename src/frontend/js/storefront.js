// CrocsCircle.ID - Customer Storefront JavaScript (Phase 3C)
// Live Backend Integration, Server-Side Cart Verification & WhatsApp Checkout

let STORE_PRODUCTS = [];
let cart = JSON.parse(localStorage.getItem("crocscircle_cart") || "[]");
let currentTab = "ALL";
let searchQuery = "";
let selectedCategory = "ALL";
let selectedSize = "ALL";
let currentModalProduct = null;

// Helper: Format Rupiah
function formatRupiah(number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(number || 0);
}

// Helper: Image Proxy & Parsers
function formatProxyImageUrl(url) {
  if (!url) return "";
  if (typeof url === 'string' && (url.includes('i.ibb.co') || url.includes('ibb.co'))) {
    return '/api/image-proxy?url=' + encodeURIComponent(url);
  }
  return url;
}

function getPrimaryImageUrl(imageUrl) {
  if (!imageUrl) return "";
  let raw = "";
  if (Array.isArray(imageUrl)) raw = imageUrl[0] || "";
  else if (typeof imageUrl === "string" && imageUrl.startsWith("[")) {
    try {
      const arr = JSON.parse(imageUrl);
      if (Array.isArray(arr) && arr.length > 0) raw = arr[0];
    } catch (e) {}
  } else if (typeof imageUrl === "string" && imageUrl.includes(",")) {
    raw = imageUrl.split(",")[0].trim();
  } else {
    raw = imageUrl;
  }
  return formatProxyImageUrl(raw);
}

function getAllProductImages(imageUrl) {
  let list = [];
  if (!imageUrl) return [];
  if (Array.isArray(imageUrl)) list = imageUrl.filter(Boolean);
  else if (typeof imageUrl === "string" && imageUrl.startsWith("[")) {
    try {
      const arr = JSON.parse(imageUrl);
      if (Array.isArray(arr)) list = arr.filter(Boolean);
    } catch (e) {}
  } else if (typeof imageUrl === "string" && imageUrl.includes(",")) {
    list = imageUrl.split(",").map(s => s.trim()).filter(Boolean);
  } else if (imageUrl) {
    list = [imageUrl];
  }
  return list.map(formatProxyImageUrl);
}

// Fetch Catalog from Backend API
async function loadCatalog() {
  const grid = document.getElementById("productGrid");
  if (grid) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--accent); margin-bottom: 1rem;"></i>
        <p style="font-weight: 600;">Memuat koleksi produk CrocsCircle...</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/storefront/catalog');
    const data = await res.json();
    if (data.success && data.products) {
      STORE_PRODUCTS = data.products;
      populateCategoryFilter(STORE_PRODUCTS);
      populateSizeFilter(STORE_PRODUCTS);
      renderProducts();

      // Check URL query params for visual inspection / direct deep linking
      const urlParams = new URLSearchParams(window.location.search);
      const modalTarget = urlParams.get('modal');
      if (modalTarget) {
        openProductDetail(modalTarget);
      }
      if (urlParams.get('cart') === 'true') {
        if (CART.length === 0 && STORE_PRODUCTS.length > 0 && STORE_PRODUCTS[0].variants.length > 0) {
          const p = STORE_PRODUCTS[0];
          const v = p.variants[0];
          CART.push({
            product_id: p.product_id,
            product_name: p.product_name,
            variant_id: v.variant_id,
            sku: v.sku,
            size: v.size,
            color: v.color,
            price: v.catalog_price,
            order_type: "READY_STOCK",
            quantity: 1,
            image_url: p.image_url
          });
          saveCart();
          updateCartBadge();
        }
        openCart();
      }
    } else {
      showEmptyState("Gagal memuat katalog produk dari server.");
    }
  } catch (err) {
    console.error("Gagal terhubung ke API katalog:", err);
    showEmptyState("Tidak dapat terhubung ke server. Pastikan koneksi aktif.");
  }
}

function showEmptyState(message) {
  const grid = document.getElementById("productGrid");
  if (!grid) return;
  grid.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
      <i class="fa-solid fa-box-open" style="font-size: 3rem; margin-bottom: 1rem; color: #CBD5E1;"></i>
      <h3 style="font-size: 1.2rem; color: var(--text-main); margin-bottom: 0.5rem;">${message || "Produk Tidak Ditemukan"}</h3>
      <p style="font-size: 0.85rem;">Coba gunakan kata kunci lain atau pilih filter yang berbeda.</p>
    </div>
  `;
}

// Populate Category Filter
function populateCategoryFilter(products) {
  const catFilter = document.getElementById("categoryFilter");
  if (!catFilter) return;

  const categories = Array.from(new Set(products.map(p => p.category_name).filter(Boolean)));
  const currentVal = catFilter.value;

  catFilter.innerHTML = '<option value="ALL">Semua Kategori</option>' + 
    categories.map(c => `<option value="${c}">${c}</option>`).join('');

  if (categories.includes(currentVal)) {
    catFilter.value = currentVal;
  }
}

// Populate Size Filter from Available Variants
function populateSizeFilter(products) {
  const sizeFilter = document.getElementById("sizeFilter");
  if (!sizeFilter) return;

  const sizes = new Set();
  products.forEach(p => {
    if (p.variants) {
      p.variants.forEach(v => {
        if (v.size && v.size !== "-") sizes.add(v.size);
      });
    }
  });

  const sortedSizes = Array.from(sizes).sort();
  sizeFilter.innerHTML = '<option value="ALL">Semua Size</option>' + 
    sortedSizes.map(s => `<option value="${s}">Size ${s}</option>`).join('');
}

// Render Products Grid
function renderProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const filtered = STORE_PRODUCTS.filter(p => {
    // Tab filter: ALL, READY (Ready Stock), PO (Pre-Order)
    if (currentTab !== "ALL" && p.display_type !== currentTab) return false;

    // Category filter
    if (selectedCategory !== "ALL" && p.category_name !== selectedCategory) return false;

    // Size filter
    if (selectedSize !== "ALL") {
      const hasSize = p.variants && p.variants.some(v => v.size === selectedSize);
      if (!hasSize) return false;
    }

    // Search query
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = (p.product_name || "").toLowerCase().includes(q);
      const matchCat = (p.category_name || "").toLowerCase().includes(q);
      const matchDesc = (p.description || "").toLowerCase().includes(q);
      const matchSku = p.variants && p.variants.some(v => v.sku.toLowerCase().includes(q));
      if (!matchName && !matchCat && !matchDesc && !matchSku) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    showEmptyState("Tidak ada produk yang cocok dengan kriteria pencarian.");
    return;
  }

  grid.innerHTML = filtered.map(p => {
    let badgeClass = "badge-ready";
    let badgeText = "⚡ Ready Stock";

    if (p.availability_badge === "PRE_ORDER") {
      badgeClass = "badge-po";
      badgeText = "📦 Pre-Order (PO)";
    } else if (p.availability_badge === "PRE_ORDER_AVAILABLE") {
      badgeClass = "badge-po";
      badgeText = "📦 PO Ready";
    } else if (p.availability_badge === "OUT_OF_STOCK") {
      badgeClass = "badge-danger";
      badgeText = "Habis";
    }

    const priceDisplay = p.price_range.min_price === p.price_range.max_price
      ? formatRupiah(p.price_range.min_price)
      : `${formatRupiah(p.price_range.min_price)} - ${formatRupiah(p.price_range.max_price)}`;

    const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23F8FAFC'/><circle cx='200' cy='170' r='55' fill='%23E2E8F0'/><text x='50%25' y='178' dominant-baseline='middle' text-anchor='middle' fill='%2337B89D' font-family='sans-serif' font-size='32' font-weight='900'>C</text><text x='50%25' y='270' dominant-baseline='middle' text-anchor='middle' fill='%23173B35' font-family='sans-serif' font-size='16' font-weight='700'>CrocsCircle.ID</text><text x='50%25' y='295' dominant-baseline='middle' text-anchor='middle' fill='%2394A3B8' font-family='sans-serif' font-size='12'>Foto Produk Segera Hadir</text></svg>";
    const coverUrl = getPrimaryImageUrl(p.image_url) || placeholderSvg;

    return `
      <div class="product-card">
        <span class="card-badge ${badgeClass}" style="${p.availability_badge === 'OUT_OF_STOCK' ? 'background: #EF4444; color: white;' : ''}">
          ${badgeText}
        </span>
        <div class="card-img-wrap" onclick="openProductDetail('${p.product_id}')" style="cursor: pointer;">
          <img src="${coverUrl}" alt="${p.product_name}" loading="lazy" onerror="this.onerror=null;this.src='${placeholderSvg}';">
        </div>
        <div class="card-body">
          <span class="card-category">${p.category_name || 'Crocs Footwear'}</span>
          <h3 class="card-title" onclick="openProductDetail('${p.product_id}')" style="cursor: pointer;">${p.product_name}</h3>
          
          <div class="card-sizes" style="margin-bottom: 0.75rem;">
            ${availableSizes.length > 0 
              ? availableSizes.slice(0, 4).map(s => `<span class="size-pill">${s}</span>`).join('') + (availableSizes.length > 4 ? `<span class="size-pill">+${availableSizes.length - 4}</span>` : '')
              : '<span class="size-pill">All Size</span>'
            }
          </div>

          <div class="card-footer">
            <span class="card-price">${priceDisplay}</span>
            <button class="card-btn" onclick="openProductDetail('${p.product_id}')">
              <i class="fa-solid fa-cart-plus"></i> Beli
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Open Detail Modal
window.openProductDetail = function(productId) {
  const prod = STORE_PRODUCTS.find(p => p.product_id === productId);
  if (!prod) return;
  currentModalProduct = prod;

  const modal = document.getElementById("productModal");
  const title = document.getElementById("modalProductTitle");
  const body = document.getElementById("modalProductBody");

  title.innerText = prod.product_name;

  let badgeClass = "badge-ready";
  let badgeText = "⚡ Ready Stock";
  if (prod.display_type === "PO") {
    badgeClass = "badge-po";
    badgeText = "📦 Pre-Order (Estimasi 10-14 Hari Kerja)";
  }

  const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'><rect width='400' height='400' fill='%23F8FAFC'/><circle cx='200' cy='170' r='55' fill='%23E2E8F0'/><text x='50%25' y='178' dominant-baseline='middle' text-anchor='middle' fill='%2337B89D' font-family='sans-serif' font-size='32' font-weight='900'>C</text><text x='50%25' y='270' dominant-baseline='middle' text-anchor='middle' fill='%23173B35' font-family='sans-serif' font-size='16' font-weight='700'>CrocsCircle.ID</text><text x='50%25' y='295' dominant-baseline='middle' text-anchor='middle' fill='%2394A3B8' font-family='sans-serif' font-size='12'>Foto Produk Segera Hadir</text></svg>";
  const allImgs = getAllProductImages(prod.image_url);
  const primaryImg = allImgs[0] || placeholderSvg;

  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;" class="detail-grid">
      <div style="background: #F8FAFC; border-radius: var(--radius-md); padding: 1.25rem; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid var(--border);">
        <img id="storefrontDetailMainImg" src="${primaryImg}" alt="${prod.product_name}" style="max-width: 100%; max-height: 250px; object-fit: contain;" onerror="this.onerror=null;this.src='${placeholderSvg}';">
        ${allImgs.length > 1 ? `
          <div style="display: flex; gap: 0.5rem; margin-top: 1rem; overflow-x: auto; max-width: 100%; padding: 4px;">
            ${allImgs.map((imgUrl, i) => `
              <img src="${imgUrl}" onclick="document.getElementById('storefrontDetailMainImg').src='${imgUrl}'" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px; border: 2px solid ${i === 0 ? 'var(--primary)' : 'var(--border)'}; cursor: pointer; background: white;" onmouseover="this.style.borderColor='var(--primary)'">
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div>
        <div style="margin-bottom: 0.5rem;">
          <span class="card-badge ${badgeClass}" style="position: static; display: inline-block;">
            ${badgeText}
          </span>
          <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 0.5rem;">${prod.category_name}</span>
        </div>

        <div style="font-size: 1.6rem; font-weight: 800; color: var(--primary); margin: 0.6rem 0;" id="modalDisplayPrice">
          ${formatRupiah(prod.price_range.min_price)}
        </div>

        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; margin-bottom: 1.25rem;">
          ${prod.description || 'Alas kaki Crocs 100% original dengan material Croslite™ yang empuk, tahan air, dan sangat nyaman dipakai beraktivitas sehari-hari.'}
        </p>

        <!-- Pilihan Varian & Ukuran -->
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label style="font-size: 0.82rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.5rem; display: block;">
            Pilih Warna & Ukuran (Size):
          </label>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.5rem;" id="modalVariantList">
            ${prod.variants.map((v, idx) => `
              <label style="cursor: pointer; border: 1.5px solid var(--border); padding: 8px 10px; border-radius: 8px; font-size: 0.82rem; display: flex; flex-direction: column; gap: 2px; transition: all 0.2s;" class="variant-option-label" onclick="selectVariantOption(this, ${v.catalog_price})">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-weight: 700; color: var(--text-main);">Size ${v.size}</span>
                  <input type="radio" name="modal_variant_id" value="${v.variant_id}" ${idx === 0 ? 'checked' : ''} style="margin: 0;">
                </div>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${v.color}</span>
                <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent); margin-top: 4px;">${formatRupiah(v.catalog_price)}</span>
                <span style="font-size: 0.68rem; color: ${v.is_in_stock ? 'var(--success)' : '#D97706'}; font-weight: 600;">
                  ${v.is_in_stock ? `Ready (${v.available_stock} pcs)` : 'Pre-Order'}
                </span>
              </label>
            `).join('')}
          </div>
        </div>

        <div style="margin-top: 1.5rem;">
          <button class="cart-btn" style="width: 100%; justify-content: center; padding: 0.85rem; font-size: 0.95rem; font-weight: 700;" onclick="addToCartFromModal()">
            <i class="fa-solid fa-bag-shopping"></i> Tambah ke Keranjang
          </button>
        </div>
      </div>
    </div>
  `;

  // Update initial selected radio style
  const firstLabel = document.querySelector(".variant-option-label");
  if (firstLabel) {
    firstLabel.style.borderColor = "var(--accent)";
    firstLabel.style.background = "rgba(55, 184, 157, 0.08)";
  }

  modal.classList.add("active");
};

window.selectVariantOption = function(element, price) {
  document.querySelectorAll(".variant-option-label").forEach(l => {
    l.style.borderColor = "var(--border)";
    l.style.background = "none";
  });
  element.style.borderColor = "var(--accent)";
  element.style.background = "rgba(55, 184, 157, 0.08)";

  const displayPrice = document.getElementById("modalDisplayPrice");
  if (displayPrice && price) {
    displayPrice.innerText = formatRupiah(price);
  }
};

// Add to Cart from Modal
window.addToCartFromModal = function() {
  if (!currentModalProduct) return;

  const checkedRadio = document.querySelector('input[name="modal_variant_id"]:checked');
  if (!checkedRadio) {
    alert("Silakan pilih ukuran/varian produk terlebih dahulu.");
    return;
  }

  const selectedVariantId = checkedRadio.value;
  const variant = currentModalProduct.variants.find(v => v.variant_id === selectedVariantId);
  if (!variant) return;

  const existingIdx = cart.findIndex(item => item.variant_id === selectedVariantId);
  if (existingIdx > -1) {
    cart[existingIdx].qty += 1;
  } else {
    cart.push({
      product_id: currentModalProduct.product_id,
      product_name: currentModalProduct.product_name,
      variant_id: variant.variant_id,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      price: variant.catalog_price,
      type: currentModalProduct.display_type, // READY atau PO
      img: currentModalProduct.image_url,
      qty: 1
    });
  }

  saveCart();
  closeModal();
  openCart();
};

function saveCart() {
  localStorage.setItem("crocscircle_cart", JSON.stringify(cart));
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  const badge = document.getElementById("cartCountBadge");
  if (badge) {
    const totalQty = cart.reduce((acc, it) => acc + (it.qty || 1), 0);
    badge.innerText = totalQty;
  }
}

function renderCartItems() {
  const container = document.getElementById("cartItemsList");
  const totalEl = document.getElementById("cartTotalPrice");
  if (!container || !totalEl) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <i class="fa-solid fa-basket-shopping" style="font-size: 2.5rem; color: #CBD5E1; margin-bottom: 0.8rem;"></i>
        <p style="font-size: 0.95rem; font-weight: 600;">Keranjang Anda masih kosong</p>
        <span style="font-size: 0.8rem;">Pilih produk Crocs favorit Anda sekarang!</span>
      </div>
    `;
    totalEl.innerText = "Rp0";
    return;
  }

  let total = 0;
  container.innerHTML = cart.map((item, idx) => {
    const subtotal = (item.price || 0) * (item.qty || 1);
    total += subtotal;
    return `
      <div class="cart-item">
        <img src="${item.img}" alt="${item.product_name}" class="cart-item-img" onerror="this.onerror=null;this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\' viewBox=\'0 0 60 60\'><rect width=\'60\' height=\'60\' fill=\'%23F1F5F9\'/><text x=\'50%25\' y=\'50%25\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%23173B35\' font-family=\'sans-serif\' font-size=\'10\' font-weight=\'bold\'>CROCS</text></svg>';">
        <div class="cart-item-info">
          <div class="cart-item-title">${item.product_name}</div>
          <div class="cart-item-meta">
            ${item.color} | Size: <strong>${item.size}</strong> • ${item.type === 'READY' ? '⚡ Ready Stock' : '📦 Pre-Order'}
          </div>
          <div style="font-weight: 700; color: var(--primary); font-size: 0.9rem; margin-top: 2px;">
            ${formatRupiah(item.price)}
          </div>
          <div class="cart-item-qty">
            <button class="qty-btn" onclick="updateItemQty(${idx}, -1)">-</button>
            <span style="font-size: 0.85rem; font-weight: 600; min-width: 20px; text-align: center;">${item.qty}</span>
            <button class="qty-btn" onclick="updateItemQty(${idx}, 1)">+</button>
            <button onclick="removeCartItem(${idx})" style="background: none; border: none; color: var(--danger); font-size: 0.78rem; margin-left: auto; cursor: pointer;">
              <i class="fa-solid fa-trash-can"></i> Hapus
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  totalEl.innerText = formatRupiah(total);
}

window.updateItemQty = function(index, delta) {
  if (cart[index]) {
    cart[index].qty += delta;
    if (cart[index].qty <= 0) {
      cart.splice(index, 1);
    }
    saveCart();
  }
};

window.removeCartItem = function(index) {
  if (cart[index]) {
    cart.splice(index, 1);
    saveCart();
  }
};

function openCart() {
  document.getElementById("cartBackdrop").classList.add("active");
  document.getElementById("cartDrawer").classList.add("active");
  renderCartItems();
}

function closeCart() {
  document.getElementById("cartBackdrop").classList.remove("active");
  document.getElementById("cartDrawer").classList.remove("active");
}

function closeModal() {
  document.getElementById("productModal").classList.remove("active");
}

// WhatsApp Checkout Generator with Server-Side Verification
async function checkoutViaWhatsApp() {
  if (cart.length === 0) {
    alert("Keranjang Anda masih kosong. Silakan pilih produk terlebih dahulu.");
    return;
  }

  const name = document.getElementById("custName").value.trim();
  const phone = document.getElementById("custPhone").value.trim();
  const address = document.getElementById("custAddress").value.trim();
  const payment = document.getElementById("custPayment").value;

  if (!name || !phone || !address) {
    alert("Mohon lengkapi Nama Lengkap, Nomor WhatsApp, dan Alamat Pengiriman Anda.");
    return;
  }

  const checkoutBtn = document.getElementById("checkoutWaBtn");
  const originalText = checkoutBtn.innerHTML;
  checkoutBtn.disabled = true;
  checkoutBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menghubungkan ke WhatsApp...`;

  try {
    const payload = {
      customer_name: name,
      customer_phone: phone,
      delivery_method: "Kirim Ekspedisi",
      address: address,
      payment_choice: payment,
      items: cart.map(item => ({
        variant_id: item.variant_id,
        quantity: item.qty
      }))
    };

    const res = await fetch('/api/storefront/checkout-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && data.whatsapp_url) {
      // Buka tautan WhatsApp resmi di tab baru
      window.open(data.whatsapp_url, "_blank");
    } else {
      alert("Pemesanan belum dapat diproses:\n" + (data.error || "Gagal memvalidasi keranjang."));
    }
  } catch (err) {
    console.error("Gagal checkout WhatsApp:", err);
    alert("Terjadi kendala saat menghubungkan ke WhatsApp. Silakan coba kembali.");
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.innerHTML = originalText;
  }
}

// DOM Setup
document.addEventListener("DOMContentLoaded", () => {
  loadCatalog();
  updateCartBadge();

  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.getAttribute("data-tab");
      renderProducts();
    });
  });

  // Search
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderProducts();
    });
  }

  // Category & Size filter
  const catFilter = document.getElementById("categoryFilter");
  if (catFilter) {
    catFilter.addEventListener("change", (e) => {
      selectedCategory = e.target.value;
      renderProducts();
    });
  }

  const szFilter = document.getElementById("sizeFilter");
  if (szFilter) {
    szFilter.addEventListener("change", (e) => {
      selectedSize = e.target.value;
      renderProducts();
    });
  }

  // Cart open/close
  document.getElementById("openCartBtn").addEventListener("click", openCart);
  document.getElementById("closeCartBtn").addEventListener("click", closeCart);
  document.getElementById("cartBackdrop").addEventListener("click", closeCart);

  // Modal close
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);
  document.getElementById("productModal").addEventListener("click", (e) => {
    if (e.target.id === "productModal") closeModal();
  });

  // Checkout Button
  document.getElementById("checkoutWaBtn").addEventListener("click", checkoutViaWhatsApp);
});
