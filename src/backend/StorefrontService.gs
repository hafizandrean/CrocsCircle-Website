/**
 * CROCSCIRCLE.ID — CUSTOMER STOREFRONT & PUBLIC CATALOG SERVICE
 * Version: 1.3.0 (Phase 3C)
 * 
 * Modul Layanan Etalase Publik Pelanggan:
 * 1. Katalog Publik Terfilter: Menampilkan produk aktif & terpublikasi (is_published = true).
 * 2. Pemisahan Visual: Ready Stock vs Pre-Order dengan badge ketersediaan stok jelas.
 * 3. STRICT ZERO DATA LEAKAGE: Mutlak menyembunyikan HPP, modal supplier, hak vendor, dan laba.
 * 4. Keranjang Belanja Publik: Tanpa login, sinkronisasi localStorage, validasi ketersediaan.
 * 5. Validasi Server-Side Cart: Menghitung total harga resmi dari database (anti-manipulasi browser).
 * 6. Generator Pesanan WhatsApp: Format pesan pemesanan terstruktur dengan nomor WA resmi toko.
 * 7. Non-Destructive Checkout: WhatsApp Checkout adalah inquiry pemesanan, BUKAN transaksi otomatis,
 *    sehingga TIDAK memotong stok dan TIDAK membuat record penjualan sebelum disetujui Admin.
 */

const StorefrontService = (function() {

  /**
   * Mengambil nomor WhatsApp resmi toko dari tabel PENGATURAN
   */
  function getStoreWhatsAppNumber() {
    const row = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", "WHATSAPP_NUMBER");
    if (row && row.setting_value) {
      // Bersihkan karakter non-numerik
      return String(row.setting_value).replace(/\D/g, "");
    }
    return "6281234567890"; // Fallback default
  }

  /**
   * Mengambil Katalog Produk Publik
   * Hanya menampilkan produk yang is_published === true dan is_active === true.
   * 
   * @param {Object} [filters] { tab: 'ALL'|'READY'|'PO', category: string, search: string, size: string }
   * @return {Object} { success: true, count: number, products: Array }
   */
  function getCatalog(filters) {
    filters = filters || {};
    const tabFilter = (filters.tab || "ALL").toUpperCase();
    const categoryFilter = filters.category || "ALL";
    const searchQuery = (filters.search || "").toLowerCase().trim();
    const sizeFilter = filters.size || "ALL";

    // 1. Ambil data master
    const allProducts = DatabaseHelper.getAllRows("MASTER_PRODUK", p => 
      (p.is_published === true || p.is_published === "true" || p.is_published === 1) &&
      (p.is_active === true || p.is_active === "true" || p.is_active === 1 || p.is_active === undefined)
    );

    const allVariants = DatabaseHelper.getAllRows("VARIAN_PRODUK", v => 
      v.is_active === true || v.is_active === "true" || v.is_active === 1 || v.is_active === undefined
    );

    const allStocks = DatabaseHelper.getAllRows("STOK");
    const allCategories = DatabaseHelper.getAllRows("KATEGORI");

    const categoryMap = {};
    allCategories.forEach(c => { categoryMap[c.category_id] = c.category_name; });

    const stockMap = {};
    allStocks.forEach(s => { stockMap[s.variant_id] = s; });

    // 2. Hubungkan Varian ke Produk & Sanitasi Data Sensitif
    const catalogList = [];

    allProducts.forEach(prod => {
      const prodVariants = allVariants.filter(v => String(v.product_id) === String(prod.product_id));

      let prodTotalAvailable = 0;
      let minCatalogPrice = Infinity;
      let maxCatalogPrice = 0;

      let sanitizedVariants = [];
      if (prodVariants.length > 0) {
        sanitizedVariants = prodVariants.map(v => {
          const stk = stockMap[v.variant_id] || {};
          const ownedPhys = Number(stk.owned_physical_stock) || 0;
          const ownedRes = Number(stk.owned_reserved_stock) || 0;
          const ownedAvail = Math.max(0, ownedPhys - ownedRes);

          const consPhys = Number(stk.consignment_physical_stock) || 0;
          const consRes = Number(stk.consignment_reserved_stock) || 0;
          const consAvail = Math.max(0, consPhys - consRes);

          const totalAvail = Number(stk.total_available_stock) || (ownedAvail + consAvail);
          prodTotalAvailable += totalAvail;

          const price = Number(v.catalog_price) || 0;
          if (price > 0 && price < minCatalogPrice) minCatalogPrice = price;
          if (price > maxCatalogPrice) maxCatalogPrice = price;

          // Masking: HANYA kembalikan data yang aman untuk publik
          return {
            variant_id: v.variant_id,
            sku: v.sku,
            color: v.color || "-",
            size: v.size || "-",
            catalog_price: price,
            available_stock: totalAvail,
            is_in_stock: totalAvail > 0
          };
        });
      } else {
        // Tetap tampilkan produk meskipun varian ukuran belum didaftarkan
        sanitizedVariants = [{
          variant_id: "VAR-DEFAULT",
          sku: prod.product_id,
          color: "Standard",
          size: "All Size",
          catalog_price: 0,
          available_stock: 0,
          is_in_stock: false
        }];
      }

      if (minCatalogPrice === Infinity) minCatalogPrice = 0;

      // Tentukan Sales Type & Status Tampil
      // sales_type: "READY_STOCK", "PRE_ORDER", atau "ALL"
      const salesType = (prod.sales_type || "ALL").toUpperCase();
      let availabilityBadge = "READY_STOCK";
      let displayType = "READY"; // Untuk tab filter

      if (salesType === "PRE_ORDER") {
        displayType = "PO";
        availabilityBadge = "PRE_ORDER";
      } else if (salesType === "READY_STOCK") {
        displayType = "READY";
        availabilityBadge = prodTotalAvailable > 0 ? "READY_STOCK" : "OUT_OF_STOCK";
      } else {
        // ALL (Bisa Ready Stock, bisa PO jika habis)
        if (prodTotalAvailable > 0) {
          displayType = "READY";
          availabilityBadge = "READY_STOCK";
        } else {
          displayType = "PO";
          availabilityBadge = "PRE_ORDER_AVAILABLE";
        }
      }

      // Filter Tab
      if (tabFilter !== "ALL") {
        if (tabFilter === "READY" && displayType !== "READY") return;
        if (tabFilter === "PO" && displayType !== "PO") return;
      }

      // Filter Kategori
      const categoryName = categoryMap[prod.category_id] || prod.category_id || "Uncategorized";
      if (categoryFilter !== "ALL" && categoryFilter !== prod.category_id && categoryFilter !== categoryName) {
        return;
      }

      // Filter Size
      if (sizeFilter !== "ALL") {
        const hasSize = sanitizedVariants.some(v => v.size === sizeFilter);
        if (!hasSize) return;
      }

      // Filter Search
      if (searchQuery !== "") {
        const matchName = (prod.product_name || "").toLowerCase().includes(searchQuery);
        const matchModel = (prod.model || "").toLowerCase().includes(searchQuery);
        const matchDesc = (prod.description || "").toLowerCase().includes(searchQuery);
        const matchCat = categoryName.toLowerCase().includes(searchQuery);
        if (!matchName && !matchModel && !matchDesc && !matchCat) return;
      }

      catalogList.push({
        product_id: prod.product_id,
        product_name: prod.product_name,
        category_id: prod.category_id,
        category_name: categoryName,
        model: prod.model || "",
        description: prod.description || "",
        image_url: prod.image_url || "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=500&auto=format&fit=crop&q=80",
        sales_type: salesType,
        display_type: displayType, // READY atau PO
        availability_badge: availabilityBadge, // READY_STOCK, PRE_ORDER, PRE_ORDER_AVAILABLE, OUT_OF_STOCK
        price_range: {
          min_price: minCatalogPrice,
          max_price: maxCatalogPrice
        },
        total_available_stock: prodTotalAvailable,
        variant_count: sanitizedVariants.length,
        variants: sanitizedVariants
      });
    });

    return {
      success: true,
      count: catalogList.length,
      products: catalogList
    };
  }

  /**
   * Mengambil Detail Publik Satu Produk
   */
  function getProductDetail(productId) {
    if (!productId) throw new Error("productId wajib diisi.");

    const prod = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", productId);
    if (!prod) throw new Error("Produk tidak ditemukan.");

    const isPublished = prod.is_published === true || prod.is_published === "true" || prod.is_published === 1;
    const isActive = prod.is_active === true || prod.is_active === "true" || prod.is_active === 1 || prod.is_active === undefined;
    if (!isPublished || !isActive) {
      throw new Error("Produk ini saat ini tidak tersedia di etalase publik.");
    }

    const variants = DatabaseHelper.getAllRows("VARIAN_PRODUK", v => 
      String(v.product_id) === String(productId) &&
      (v.is_active === true || v.is_active === "true" || v.is_active === 1 || v.is_active === undefined)
    );

    const stocks = DatabaseHelper.getAllRows("STOK");
    const categories = DatabaseHelper.getAllRows("KATEGORI");
    const categoryMap = {};
    categories.forEach(c => { categoryMap[c.category_id] = c.category_name; });

    const stockMap = {};
    stocks.forEach(s => { stockMap[s.variant_id] = s; });

    let totalAvailable = 0;
    const sanitizedVariants = variants.map(v => {
      const stk = stockMap[v.variant_id] || {};
      const ownedPhys = Number(stk.owned_physical_stock) || 0;
      const ownedRes = Number(stk.owned_reserved_stock) || 0;
      const ownedAvail = Math.max(0, ownedPhys - ownedRes);

      const consPhys = Number(stk.consignment_physical_stock) || 0;
      const consRes = Number(stk.consignment_reserved_stock) || 0;
      const consAvail = Math.max(0, consPhys - consRes);

      const avail = Number(stk.total_available_stock) || (ownedAvail + consAvail);
      totalAvailable += avail;

      return {
        variant_id: v.variant_id,
        sku: v.sku,
        color: v.color || "-",
        size: v.size || "-",
        catalog_price: Number(v.catalog_price) || 0,
        available_stock: avail,
        is_in_stock: avail > 0
      };
    });

    return {
      success: true,
      product: {
        product_id: prod.product_id,
        product_name: prod.product_name,
        category_name: categoryMap[prod.category_id] || prod.category_id || "Uncategorized",
        model: prod.model || "",
        description: prod.description || "",
        image_url: prod.image_url || "",
        sales_type: prod.sales_type || "ALL",
        total_available_stock: totalAvailable,
        variants: sanitizedVariants
      }
    };
  }

  /**
   * Validasi Keranjang Belanja di Sisi Server (Server-Side Cart Validation)
   * Memeriksa keberadaan varian, ketersediaan stok, dan menghitung total harga resmi database.
   * Tidak mempercayai harga atau subtotal yang dikirim oleh browser klien!
   * 
   * @param {Array} cartItems Array of { variant_id: string, quantity: number }
   * @return {Object} { valid: boolean, items: Array, total_price: number, total_qty: number, issues: Array }
   */
  function validateCart(cartItems) {
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return {
        valid: false,
        total_price: 0,
        total_qty: 0,
        items: [],
        issues: ["Keranjang belanja kosong."]
      };
    }

    const verifiedItems = [];
    const issues = [];
    let totalPrice = 0;
    let totalQty = 0;

    cartItems.forEach((item, idx) => {
      const variantId = item.variant_id;
      const qty = parseInt(item.quantity, 10);

      if (!variantId) {
        issues.push(`Item #${idx + 1}: ID varian tidak valid.`);
        return;
      }
      if (isNaN(qty) || qty <= 0) {
        issues.push(`Item #${idx + 1}: Kuantitas harus lebih dari 0.`);
        return;
      }

      // 1. Ambil varian dari database
      const v = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", variantId);
      if (!v) {
        issues.push(`Item #${idx + 1} (${variantId}): Varian produk tidak ditemukan.`);
        return;
      }

      // 2. Ambil master produk
      const prod = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", v.product_id);
      if (!prod) {
        issues.push(`Item #${idx + 1}: Master produk tidak ditemukan.`);
        return;
      }

      const isPublished = prod.is_published === true || prod.is_published === "true" || prod.is_published === 1;
      const isActive = (prod.is_active === true || prod.is_active === "true" || prod.is_active === 1 || prod.is_active === undefined) &&
                       (v.is_active === true || v.is_active === "true" || v.is_active === 1 || v.is_active === undefined);

      if (!isPublished || !isActive) {
        issues.push(`"${prod.product_name}" (${v.sku}) saat ini tidak tersedia untuk pemesanan.`);
        return;
      }

      // 3. Ambil harga resmi dari database (ANTI-MANIPULASI HARGA KLIEN)
      const officialPrice = Number(v.catalog_price) || 0;
      const subtotal = qty * officialPrice;

      // 4. Periksa ketersediaan stok
      const stk = DatabaseHelper.getRowByPk("STOK", "variant_id", variantId);
      let availStock = 0;
      if (stk) {
        const ownedPhys = Number(stk.owned_physical_stock) || 0;
        const ownedRes = Number(stk.owned_reserved_stock) || 0;
        const consPhys = Number(stk.consignment_physical_stock) || 0;
        const consRes = Number(stk.consignment_reserved_stock) || 0;
        availStock = Math.max(0, (ownedPhys - ownedRes) + (consPhys - consRes));
      }

      const salesType = (prod.sales_type || "ALL").toUpperCase();
      let orderType = "READY_STOCK";

      if (salesType === "PRE_ORDER") {
        orderType = "PRE_ORDER";
      } else if (salesType === "READY_STOCK") {
        if (availStock < qty) {
          issues.push(`"${prod.product_name}" (${v.color}, Size ${v.size}): Stok Ready Stock tidak mencukupi (Tersedia: ${availStock}, Diminta: ${qty}).`);
          return;
        }
        orderType = "READY_STOCK";
      } else {
        // ALL
        if (availStock >= qty) {
          orderType = "READY_STOCK";
        } else {
          orderType = "PRE_ORDER";
        }
      }

      totalPrice += subtotal;
      totalQty += qty;

      verifiedItems.push({
        product_id: prod.product_id,
        product_name: prod.product_name,
        variant_id: v.variant_id,
        sku: v.sku,
        color: v.color || "-",
        size: v.size || "-",
        order_type: orderType,
        quantity: qty,
        unit_price: officialPrice,
        subtotal: subtotal
      });
    });

    const isValid = issues.length === 0 && verifiedItems.length > 0;

    return {
      valid: isValid,
      total_price: totalPrice,
      total_qty: totalQty,
      items: verifiedItems,
      issues: issues,
      store_whatsapp: getStoreWhatsAppNumber()
    };
  }

  /**
   * Menghasilkan Format Pesan Checkout WhatsApp yang Terstruktur
   * Catatan: Checkout WhatsApp adalah inquiry pemesanan publik,
   * TIDAK memotong stok dan TIDAK membuat record penjualan sebelum disetujui Admin.
   * 
   * @param {Object} orderData { customer_name, customer_phone, delivery_method, address, payment_choice, notes, items: Array }
   * @return {Object} { success: boolean, whatsapp_url: string, message_text: string, verified_order: Object }
   */
  function generateWhatsAppOrder(orderData) {
    if (!orderData) throw new Error("Data pemesanan wajib diisi.");

    const customerName = (orderData.customer_name || "").trim();
    const customerPhone = (orderData.customer_phone || "").trim();
    if (!customerName) throw new Error("Nama lengkap pemesan wajib diisi.");
    if (!customerPhone) throw new Error("Nomor WhatsApp pemesan wajib diisi.");

    // Validasi keranjang di server
    const validation = validateCart(orderData.items);
    if (!validation.valid) {
      throw new Error("Validasi keranjang gagal: " + validation.issues.join(", "));
    }

    const targetWaNumber = validation.store_whatsapp;
    const deliveryMethod = orderData.delivery_method || "Kirim Ekspedisi (JNE / SiCepat / J&T)";
    const address = (orderData.address || "-").trim();
    const paymentChoice = orderData.payment_choice || "Transfer BCA (CrocsCircle Official)";
    const notes = (orderData.notes || "-").trim();

    // Format Mata Uang IDR
    const formatRp = (num) => "Rp" + Number(num).toLocaleString("id-ID");

    // Susun template pesan WhatsApp profesional
    let msg = `Halo *CrocsCircle.ID*, saya ingin melakukan pemesanan:\n\n`;
    msg += `📋 *RINCIAN PESANAN:*\n`;

    validation.items.forEach((it, idx) => {
      const typeLabel = it.order_type === "PRE_ORDER" ? "[PRE-ORDER]" : "[READY STOCK]";
      msg += `${idx + 1}. *${it.product_name}* ${typeLabel}\n`;
      msg += `   • Varian: ${it.color} | Size: ${it.size} (${it.sku})\n`;
      msg += `   • Qty: ${it.quantity} pcs @ ${formatRp(it.unit_price)}\n`;
      msg += `   • Subtotal: ${formatRp(it.subtotal)}\n`;
    });

    msg += `\n💰 *TOTAL ESTIMASI:* *${formatRp(validation.total_price)}*\n\n`;

    msg += `👤 *DATA PENERIMA:*\n`;
    msg += `• Nama: ${customerName}\n`;
    msg += `• No. WhatsApp: ${customerPhone}\n`;
    msg += `• Metode Pengiriman: ${deliveryMethod}\n`;
    msg += `• Alamat: ${address}\n`;
    msg += `• Pilihan Pembayaran: ${paymentChoice}\n`;
    if (notes && notes !== "-") {
      msg += `• Catatan: ${notes}\n`;
    }

    msg += `\nMohon konfirmasi ketersediaan barang dan rincian pembayarannya. Terima kasih! 🙏`;

    const encodedText = encodeURIComponent(msg);
    const waUrl = `https://wa.me/${targetWaNumber}?text=${encodedText}`;

    // Catat inquiry log untuk audit operasional tanpa mengubah stok atau transaksi
    DatabaseHelper.logActivity(
      "CUSTOMER_WEB",
      "WHATSAPP_INQUIRY",
      "STOREFRONT",
      customerPhone,
      `Inquiry checkout WhatsApp dari ${customerName} (${validation.items.length} item, Total: ${formatRp(validation.total_price)}).`
    );

    return {
      success: true,
      whatsapp_url: waUrl,
      whatsapp_number: targetWaNumber,
      message_text: msg,
      verified_order: {
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_method: deliveryMethod,
        address: address,
        payment_choice: paymentChoice,
        notes: notes,
        total_price: validation.total_price,
        total_qty: validation.total_qty,
        items: validation.items
      }
    };
  }

  /**
   * Menguraikan Teks Pesanan WhatsApp (Parser Pesanan Storefront untuk POS Admin)
   * Mengekstrak data pelanggan & item, serta memvalidasi keaslian varian & stok database secara real-time.
   * Tidak membuat transaksi atau mengurangi stok!
   * 
   * @param {string} rawText Teks format pesan WhatsApp
   * @return {Object} { success: boolean, customer_info: Object, items: Array, issues: Array }
   */
  function parseWhatsAppOrderText(rawText) {
    if (!rawText || typeof rawText !== "string" || rawText.trim() === "") {
      return { success: false, error: "Teks pesanan WhatsApp kosong." };
    }

    const text = rawText.trim();
    
    // 1. Ekstrak Data Customer
    const nameMatch = text.match(/[•\-\*]*\s*Nama(?:\s*Lengkap)?:\s*\*?([^\n\r\*]+)\*?/i);
    const phoneMatch = text.match(/[•\-\*]*\s*No\.?\s*(?:WhatsApp|WA|HP|Telepon)?:\s*\*?([^\n\r\*]+)\*?/i);
    const deliveryMatch = text.match(/[•\-\*]*\s*Metode\s*Pengiriman:\s*\*?([^\n\r\*]+)\*?/i);
    const addressMatch = text.match(/[•\-\*]*\s*Alamat(?:\s*Pengiriman)?:\s*\*?([^\n\r\*]+)\*?/i);
    const notesMatch = text.match(/[•\-\*]*\s*Catatan:\s*\*?([^\n\r\*]+)\*?/i);
    
    const customerInfo = {
      name: nameMatch ? nameMatch[1].trim() : "",
      phone: phoneMatch ? phoneMatch[1].trim() : "",
      delivery_method: deliveryMatch ? deliveryMatch[1].trim() : "",
      address: addressMatch ? addressMatch[1].trim() : "",
      notes: notesMatch ? notesMatch[1].trim() : ""
    };

    // 2. Ekstrak Items
    const allVariants = DatabaseHelper.getAllRows("VARIAN_PRODUK");
    const allProducts = DatabaseHelper.getAllRows("MASTER_PRODUK");
    const allStocks = DatabaseHelper.getAllRows("STOK");

    const variantBySku = {};
    allVariants.forEach(v => { variantBySku[v.sku] = v; });

    const productById = {};
    allProducts.forEach(p => { productById[p.product_id] = p; });

    const stockByVariant = {};
    allStocks.forEach(s => { stockByVariant[s.variant_id] = s; });

    const items = [];
    const issues = [];

    // Cari setiap SKU di dalam tanda kurung, misal (CRC-CLS-BN-W7) atau (SKU-CC-WHT-M8)
    const skuRegex = /\((SKU-[A-Za-z0-9-]+|CRC-[A-Za-z0-9-]+|[A-Za-z0-9-]+-[A-Za-z0-9-]+-[A-Za-z0-9-]+)\)/g;
    let match;
    const foundSkus = [];
    while ((match = skuRegex.exec(text)) !== null) {
      foundSkus.push({ sku: match[1], index: match.index });
    }

    if (foundSkus.length === 0) {
      allVariants.forEach(v => {
        if (text.includes(v.sku)) {
          foundSkus.push({ sku: v.sku, index: text.indexOf(v.sku) });
        }
      });
    }

    foundSkus.forEach((itemMatch) => {
      const sku = itemMatch.sku;
      const v = variantBySku[sku];
      if (!v) {
        issues.push(`SKU '${sku}' tidak ditemukan di database.`);
        return;
      }

      const prod = productById[v.product_id] || {};
      const stk = stockByVariant[v.variant_id] || {};

      // Cari kuantitas di sekitar SKU
      const subChunk = text.substring(Math.max(0, itemMatch.index - 80), Math.min(text.length, itemMatch.index + 120));
      const qtyMatch = subChunk.match(/Qty:\s*(\d+)/i) || subChunk.match(/(\d+)\s*pcs/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      const ownedPhys = Number(stk.owned_physical_stock) || 0;
      const ownedRes = Number(stk.owned_reserved_stock) || 0;
      const consPhys = Number(stk.consignment_physical_stock) || 0;
      const consRes = Number(stk.consignment_reserved_stock) || 0;
      const avail = Math.max(0, (ownedPhys - ownedRes) + (consPhys - consRes));

      items.push({
        variant_id: v.variant_id,
        sku: v.sku,
        product_id: prod.product_id || v.product_id,
        product_name: prod.product_name || "Produk",
        color: v.color || "-",
        size: v.size || "-",
        catalog_price: Number(v.catalog_price) || 0,
        actual_price: Number(v.catalog_price) || 0,
        quantity: qty,
        subtotal: qty * (Number(v.catalog_price) || 0),
        available_stock: avail,
        is_in_stock: avail >= qty
      });
    });

    return {
      success: true,
      customer_info: customerInfo,
      customer_name: customerInfo.name,
      customer_phone: customerInfo.phone,
      shipping_address: customerInfo.address,
      delivery_method: customerInfo.delivery_method,
      items: items.map(it => ({ ...it, is_available: it.is_in_stock })),
      issues: issues,
      raw_item_count: items.length
    };
  }

  return {
    getStoreWhatsAppNumber: getStoreWhatsAppNumber,
    getCatalog: getCatalog,
    getProductDetail: getProductDetail,
    validateCart: validateCart,
    generateWhatsAppOrder: generateWhatsAppOrder,
    parseWhatsAppOrderText: parseWhatsAppOrderText
  };

})();
