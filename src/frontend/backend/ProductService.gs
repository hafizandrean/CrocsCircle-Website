/**
 * CROCSCIRCLE.ID — PRODUCT & INVENTORY MANAGEMENT ENGINE
 * Version: 1.0.0 (Phase 3B)
 * 
 * Modul Pengelolaan Master Produk, Varian, Inventaris, Penerimaan Stok & Riwayat Mutasi:
 * 1. Manajemen Produk: CRUD Master Produk, kategori, model, deskripsi, foto & status publikasi.
 * 2. Manajemen Varian: SKU unik (penolakan duplikat ketat), ukuran konsisten, warna, harga katalog.
 * 3. Pemisahan Kepemilikan Stok: Batch level OWN_STOCK vs VENDOR_CONSIGNMENT pada SKU yang sama.
 * 4. Penerimaan Stok (Stock In): Pembelian supplier (FIFO batch) & titipan konsinyasi vendor.
 * 5. Dukungan Penerimaan Sebagian (Partial Receipt).
 * 6. Riwayat Mutasi Stok lengkap (Audit Trail).
 * 7. Server-side RBAC: Proteksi informasi modal/HPP untuk role ADMIN.
 */

const ProductService = (function() {

  /**
   * Helper: Validasi & Standarisasi Ukuran Crocs
   */
  function normalizeSize(sizeStr) {
    if (!sizeStr) return "";
    const clean = sizeStr.toString().trim().toUpperCase();
    return clean;
  }

  /**
   * Helper: Generate Unique Product ID
   */
  function generateProductId(model, categoryId) {
    const now = new Date();
    const dateStr = Utilities.formatDate(now, "GMT+7", "yyyyMMdd");
    const rand = Math.floor(100 + Math.random() * 900);
    const prefix = (categoryId ? categoryId.substring(0, 3).toUpperCase() : "PRD");
    return `${prefix}-${dateStr}-${rand}`;
  }

  /**
   * Helper: Generate Unique Variant ID
   */
  function generateVariantId(productId, size, color) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `VAR-${rand}`;
  }

  // =========================================================================
  // 1. MANAJEMEN MASTER PRODUK
  // =========================================================================

  /**
   * Mengambil daftar seluruh master produk beserta ringkasan varian & total stok
   */
  function listProducts(filters) {
    filters = filters || {};
    const products = DatabaseHelper.getAllRows("MASTER_PRODUK");
    const variants = DatabaseHelper.getAllRows("VARIAN_PRODUK");
    const stocks = DatabaseHelper.getAllRows("STOK");
    const categories = DatabaseHelper.getAllRows("KATEGORI");

    const categoryMap = {};
    categories.forEach(c => { categoryMap[c.category_id] = c.category_name; });

    let result = products.map(p => {
      const prodVariants = variants.filter(v => v.product_id === p.product_id);
      let totalPhysical = 0;
      let totalAvailable = 0;
      let totalReserved = 0;

      prodVariants.forEach(v => {
        const stk = stocks.find(s => s.variant_id === v.variant_id);
        if (stk) {
          const phys = (Number(stk.owned_physical_stock) || 0) + (Number(stk.consignment_physical_stock) || 0);
          const res = (Number(stk.owned_reserved_stock) || 0) + (Number(stk.consignment_reserved_stock) || 0);
          const avail = Number(stk.total_available_stock) || Math.max(0, phys - res);
          totalPhysical += phys;
          totalReserved += res;
          totalAvailable += avail;
        }
      });

      return {
        product_id: p.product_id,
        product_name: p.product_name,
        category_id: p.category_id,
        category_name: categoryMap[p.category_id] || p.category_id || "Uncategorized",
        model: p.model || "",
        description: p.description || "",
        image_url: p.image_url || "",
        sales_type: p.sales_type || "ALL",
        is_active: p.is_active === true || p.is_active === "true" || p.is_active === 1,
        is_published: p.is_published === true || p.is_published === "true" || p.is_published === 1,
        variant_count: prodVariants.length,
        total_physical_stock: totalPhysical,
        total_reserved_stock: totalReserved,
        total_available_stock: totalAvailable,
        created_at: p.created_at,
        updated_at: p.updated_at
      };
    });

    // Filtering
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(p => 
        (p.product_name && p.product_name.toLowerCase().includes(q)) ||
        (p.model && p.model.toLowerCase().includes(q)) ||
        (p.product_id && p.product_id.toLowerCase().includes(q))
      );
    }

    if (filters.category_id && filters.category_id !== "ALL") {
      result = result.filter(p => p.category_id === filters.category_id);
    }

    if (filters.is_active !== undefined && filters.is_active !== "ALL") {
      const activeBool = filters.is_active === true || filters.is_active === "true";
      result = result.filter(p => p.is_active === activeBool);
    }

    if (filters.is_published !== undefined && filters.is_published !== "ALL") {
      const pubBool = filters.is_published === true || filters.is_published === "true";
      result = result.filter(p => p.is_published === pubBool);
    }

    return result;
  }

  /**
   * Mengambil detail satu produk beserta variannya
   */
  function getProductDetail(productId) {
    if (!productId) throw new Error("Product ID wajib diisi.");
    const product = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", productId);
    if (!product) throw new Error("Produk dengan ID '" + productId + "' tidak ditemukan.");

    const variants = DatabaseHelper.getAllRows("VARIAN_PRODUK", v => v.product_id === productId);
    const stocks = DatabaseHelper.getAllRows("STOK");

    const enrichedVariants = variants.map(v => {
      const stk = stocks.find(s => s.variant_id === v.variant_id) || {};
      const ownedPhys = Number(stk.owned_physical_stock) || 0;
      const ownedRes = Number(stk.owned_reserved_stock) || 0;
      const ownedAvail = Math.max(0, ownedPhys - ownedRes);

      const consPhys = Number(stk.consignment_physical_stock) || 0;
      const consRes = Number(stk.consignment_reserved_stock) || 0;
      const consAvail = Math.max(0, consPhys - consRes);

      const totalPhys = ownedPhys + consPhys;
      const totalRes = ownedRes + consRes;
      const totalAvail = Number(stk.total_available_stock) || (ownedAvail + consAvail);

      return {
        variant_id: v.variant_id,
        product_id: v.product_id,
        color: v.color || "-",
        size: v.size || "-",
        sku: v.sku,
        unit: v.unit || "PCS",
        catalog_price: Number(v.catalog_price) || 0,
        reference_hpp: Number(v.reference_hpp) || 0,
        is_active: v.is_active === true || v.is_active === "true" || v.is_active === 1,
        stock: {
          owned_physical: ownedPhys,
          owned_reserved: ownedRes,
          owned_available: ownedAvail,
          consignment_physical: consPhys,
          consignment_reserved: consRes,
          consignment_available: consAvail,
          total_physical: totalPhys,
          total_reserved: totalRes,
          total_available: totalAvail,
          minimum_stock: Number(stk.minimum_stock) || 2
        }
      };
    });

    return {
      product: product,
      variants: enrichedVariants
    };
  }

  /**
   * Menambah Master Produk Baru
   */
  function createProduct(productData, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!productData.product_name || productData.product_name.trim() === "") {
        throw new Error("Nama produk wajib diisi.");
      }

      const now = new Date();
      const productId = productData.product_id || generateProductId(productData.model, productData.category_id);

      // Cek apakah ID sudah ada
      const existing = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", productId);
      if (existing) {
        throw new Error("Produk dengan ID '" + productId + "' sudah terdaftar.");
      }

      const row = {
        product_id: productId,
        product_name: productData.product_name.trim(),
        category_id: productData.category_id || "CLOG",
        model: productData.model ? productData.model.trim() : "",
        description: productData.description ? productData.description.trim() : "",
        image_url: productData.image_url ? productData.image_url.trim() : "",
        sales_type: productData.sales_type || "ALL",
        is_active: productData.is_active !== undefined ? productData.is_active : true,
        is_published: productData.is_published !== undefined ? productData.is_published : true,
        created_at: now,
        updated_at: now
      };

      DatabaseHelper.insertRow("MASTER_PRODUK", row);
      DatabaseHelper.logActivity(createdBy || "SYSTEM", "CREATE_PRODUCT", "PRODUCT", productId, "Tambah produk baru: " + row.product_name);

      return {
        success: true,
        product_id: productId,
        product: row
      };
    });
  }

  /**
   * Mengubah Data Master Produk
   */
  function updateProduct(productId, updates, updatedBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!productId) throw new Error("Product ID wajib diisi.");
      const current = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", productId);
      if (!current) throw new Error("Produk dengan ID '" + productId + "' tidak ditemukan.");

      const updated = Object.assign({}, current, updates);
      updated.updated_at = new Date();

      DatabaseHelper.updateRowByPk("MASTER_PRODUK", "product_id", productId, updated);
      DatabaseHelper.logActivity(updatedBy || "SYSTEM", "UPDATE_PRODUCT", "PRODUCT", productId, "Update produk: " + updated.product_name);

      return {
        success: true,
        product_id: productId,
        product: updated
      };
    });
  }

  /**
   * Mengarsipkan / Mengubah Status Aktif Produk
   */
  function setProductActiveStatus(productId, isActive, updatedBy) {
    return updateProduct(productId, { is_active: isActive }, updatedBy);
  }

  // =========================================================================
  // 2. MANAJEMEN VARIAN PRODUK & SKU DUPLICATE GUARD
  // =========================================================================

  /**
   * Menambah Varian Baru pada Produk
   * ATURAN: SKU harus unik secara global. Jika SKU sudah dipakai, ditolak keras!
   */
  function createVariant(variantData, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!variantData.product_id) throw new Error("Product ID induk wajib diisi.");
      if (!variantData.sku || variantData.sku.trim() === "") throw new Error("SKU varian wajib diisi.");
      if (!variantData.size || variantData.size.trim() === "") throw new Error("Ukuran varian wajib diisi.");

      const sku = variantData.sku.trim().toUpperCase();
      const product = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", variantData.product_id);
      if (!product) throw new Error("Produk induk dengan ID '" + variantData.product_id + "' tidak ditemukan.");

      // SKU UNIQUE GUARD: Cek apakah SKU sudah pernah terdaftar di VARIAN_PRODUK
      const existingSku = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "sku", sku);
      if (existingSku) {
        throw new Error("SKU '" + sku + "' sudah terdaftar untuk varian lain (" + existingSku.variant_id + "). SKU harus unik!");
      }

      const variantId = variantData.variant_id || generateVariantId(variantData.product_id, variantData.size, variantData.color);

      // Cek duplikasi variant_id
      const existingId = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", variantId);
      if (existingId) {
        throw new Error("Varian ID '" + variantId + "' sudah ada.");
      }

      const row = {
        variant_id: variantId,
        product_id: variantData.product_id,
        color: variantData.color ? variantData.color.trim() : "Default",
        size: normalizeSize(variantData.size),
        sku: sku,
        unit: variantData.unit ? variantData.unit.trim().toUpperCase() : "PCS",
        catalog_price: Number(variantData.catalog_price) || 0,
        reference_hpp: Number(variantData.reference_hpp) || 0,
        is_active: variantData.is_active !== undefined ? variantData.is_active : true
      };

      DatabaseHelper.insertRow("VARIAN_PRODUK", row);

      // Inisialisasi baris di tabel STOK secara otomatis
      InventoryService.getStock(variantId);

      DatabaseHelper.logActivity(createdBy || "SYSTEM", "CREATE_VARIANT", "VARIANT", variantId, "Tambah varian SKU: " + sku + " (" + row.size + ")");

      return {
        success: true,
        variant_id: variantId,
        variant: row
      };
    });
  }

  /**
   * Mengubah Data Varian Produk
   */
  function updateVariant(variantId, updates, updatedBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!variantId) throw new Error("Variant ID wajib diisi.");
      const current = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", variantId);
      if (!current) throw new Error("Varian dengan ID '" + variantId + "' tidak ditemukan.");

      // Jika SKU diubah, cek apakah SKU baru bertabrakan dengan varian lain
      if (updates.sku) {
        const newSku = updates.sku.trim().toUpperCase();
        if (newSku !== current.sku) {
          const conflict = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "sku", newSku);
          if (conflict && conflict.variant_id !== variantId) {
            throw new Error("SKU '" + newSku + "' sudah dipakai oleh varian lain. SKU harus unik!");
          }
          updates.sku = newSku;
        }
      }

      if (updates.size) {
        updates.size = normalizeSize(updates.size);
      }

      const updated = Object.assign({}, current, updates);
      DatabaseHelper.updateRowByPk("VARIAN_PRODUK", "variant_id", variantId, updated);

      // Update minimum stock di STOK jika disediakan
      if (updates.minimum_stock !== undefined) {
        InventoryService.updateStockValues(variantId, { minimum_stock: Number(updates.minimum_stock) || 2 });
      }

      DatabaseHelper.logActivity(updatedBy || "SYSTEM", "UPDATE_VARIANT", "VARIANT", variantId, "Update varian: " + updated.sku);

      return {
        success: true,
        variant_id: variantId,
        variant: updated
      };
    });
  }

  // =========================================================================
  // 3. MANAJEMEN INVENTARIS & RINCIAN BATCH PERSATUAN SKU
  // =========================================================================

  /**
   * Mengambil daftar inventaris lengkap untuk seluruh varian
   * Mendukung filter pencarian, kategori, dan status stok (aman, menipis, habis).
   * Mendukung penyamaran informasi modal jika user ber-role ADMIN (RBAC).
   */
  function listInventory(filters, userRole) {
    filters = filters || {};
    const isOwner = (userRole === "OWNER");

    const allStocks = DatabaseHelper.getAllRows("STOK");
    const allVariants = DatabaseHelper.getAllRows("VARIAN_PRODUK");
    const allProducts = DatabaseHelper.getAllRows("MASTER_PRODUK");
    const allBatches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN");
    const allConsignmentLots = DatabaseHelper.getAllRows("BATCH_KONSINYASI");
    const allCategories = DatabaseHelper.getAllRows("KATEGORI");

    const categoryMap = {};
    allCategories.forEach(c => { categoryMap[c.category_id] = c.category_name; });

    let list = allVariants.map(v => {
      const prod = allProducts.find(p => p.product_id === v.product_id) || {};
      const stk = allStocks.find(s => s.variant_id === v.variant_id) || {};

      const ownedPhys = Number(stk.owned_physical_stock) || 0;
      const ownedRes = Number(stk.owned_reserved_stock) || 0;
      const ownedAvail = Math.max(0, ownedPhys - ownedRes);

      const consPhys = Number(stk.consignment_physical_stock) || 0;
      const consRes = Number(stk.consignment_reserved_stock) || 0;
      const consAvail = Math.max(0, consPhys - consRes);

      const totalPhys = ownedPhys + consPhys;
      const totalRes = ownedRes + consRes;
      const totalAvail = Number(stk.total_available_stock) || (ownedAvail + consAvail);
      const minStock = Number(stk.minimum_stock) || 2;

      // Status Stok
      let stockStatus = "IN_STOCK";
      if (totalAvail <= 0) {
        stockStatus = "OUT_OF_STOCK";
      } else if (totalAvail <= minStock) {
        stockStatus = "LOW_STOCK";
      }

      // Rincian Batch FIFO untuk stok sendiri
      const variantBatches = allBatches
        .filter(b => b.variant_id === v.variant_id && (Number(b.remaining_qty) || 0) > 0)
        .map(b => ({
          batch_id: b.purchase_detail_id,
          purchase_id: b.purchase_id,
          remaining_qty: Number(b.remaining_qty) || 0,
          original_qty: Number(b.quantity) || 0,
          // RBAC: Masking modal untuk Admin
          unit_cost: isOwner ? (Number(b.unit_cost) || 0) : null
        }));

      return {
        variant_id: v.variant_id,
        product_id: v.product_id,
        product_name: prod.product_name || "Produk",
        model: prod.model || "",
        category_id: prod.category_id || "",
        category_name: categoryMap[prod.category_id] || "Umum",
        image_url: prod.image_url || "",
        sku: v.sku,
        color: v.color || "-",
        size: v.size || "-",
        catalog_price: Number(v.catalog_price) || 0,
        // RBAC: Masking reference_hpp untuk Admin
        reference_hpp: isOwner ? (Number(v.reference_hpp) || 0) : null,
        minimum_stock: minStock,
        stock_status: stockStatus,
        stock: {
          owned_physical: ownedPhys,
          owned_reserved: ownedRes,
          owned_available: ownedAvail,
          consignment_physical: consPhys,
          consignment_reserved: consRes,
          consignment_available: consAvail,
          total_physical: totalPhys,
          total_reserved: totalRes,
          total_available: totalAvail
        },
        fifo_batches: variantBatches,
        consignment_lots: allConsignmentLots
          .filter(l => l.variant_id === v.variant_id && (Number(l.remaining_qty) || 0) > 0)
          .map(l => ({
            consignment_lot_id: l.consignment_lot_id,
            vendor_id: l.vendor_id,
            remaining_qty: Number(l.remaining_qty) || 0,
            received_qty: Number(l.received_qty) || 0,
            received_date: l.received_date,
            reference_id: l.reference_id,
            status: l.status
          }))
      };
    });

    // Filtering
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(item => 
        (item.product_name && item.product_name.toLowerCase().includes(q)) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.color && item.color.toLowerCase().includes(q)) ||
        (item.size && item.size.toLowerCase().includes(q))
      );
    }

    if (filters.category_id && filters.category_id !== "ALL") {
      list = list.filter(item => item.category_id === filters.category_id);
    }

    if (filters.stock_status && filters.stock_status !== "ALL") {
      list = list.filter(item => item.stock_status === filters.stock_status);
    }

    return list;
  }

  // =========================================================================
  // 4. PENERIMAAN STOK (STOCK IN / PURCHASES & CONSIGNMENT)
  // =========================================================================

  /**
   * Mencatat Pembelian Stok Supplier (OWN_STOCK)
   * Mendukung pencatatan header pembelian dan detail item bertahap.
   */
  function createPurchaseOrder(purchaseData, items, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new Error("Daftar item pembelian tidak boleh kosong.");
      }

      const now = new Date();
      const purchaseId = purchaseData.purchase_id || ("PUR-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss"));

      let subtotal = 0;
      items.forEach(it => {
        const qty = parseInt(it.quantity, 10);
        const cost = parseFloat(it.base_unit_cost || it.unit_cost) || 0;
        if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas item harus positif.");
        subtotal += (qty * cost);
      });

      const shippingCost = parseFloat(purchaseData.shipping_cost) || 0;
      const totalPurchase = subtotal + shippingCost;
      const receivingStatus = purchaseData.receiving_status || "ORDERED"; // ORDERED, PARTIAL_RECEIVED, RECEIVED

      const purchaseHeader = {
        purchase_id: purchaseId,
        purchase_date: purchaseData.purchase_date || now,
        vendor_id: purchaseData.vendor_id || "",
        supplier_name: purchaseData.supplier_name || "Supplier Umum",
        subtotal: subtotal,
        shipping_cost: shippingCost,
        total_purchase: totalPurchase,
        payment_status: purchaseData.payment_status || "UNPAID",
        receiving_status: receivingStatus,
        notes: purchaseData.notes || "",
        created_by: createdBy || "SYSTEM"
      };

      DatabaseHelper.insertRow("PEMBELIAN_STOK", purchaseHeader);

      // Jika langsung diterima saat input (status RECEIVED), bentuk batch persediaan
      if (receivingStatus === "RECEIVED") {
        items.forEach(it => {
          InventoryService.receiveOwnedStockBatch(
            purchaseId,
            it.variant_id,
            it.quantity,
            it.base_unit_cost || it.unit_cost,
            it.vendor_incentive || 0,
            "Penerimaan langsung PO " + purchaseId,
            createdBy
          );
        });
      }

      DatabaseHelper.logActivity(createdBy || "SYSTEM", "CREATE_PURCHASE", "PURCHASE", purchaseId, "Buat PO Supplier " + purchaseId + " senilai " + totalPurchase);

      return {
        success: true,
        purchase_id: purchaseId,
        total_purchase: totalPurchase,
        receiving_status: receivingStatus
      };
    });
  }

  /**
   * Penerimaan Sebagian / Bertahap (Partial Receipt) untuk Pembelian Supplier
   */
  function receivePartialPurchase(purchaseId, receivedItems, notes, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!purchaseId) throw new Error("Purchase ID wajib diisi.");
      const po = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId);
      if (!po) throw new Error("Purchase Order dengan ID '" + purchaseId + "' tidak ditemukan.");

      if (po.receiving_status === "RECEIVED") {
        throw new Error("PO '" + purchaseId + "' sudah berstatus RECEIVED penuh sebelumnya.");
      }

      if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
        throw new Error("Daftar item yang diterima tidak boleh kosong.");
      }

      const now = new Date();
      const results = [];

      receivedItems.forEach(it => {
        const qty = parseInt(it.quantity, 10);
        if (isNaN(qty) || qty <= 0) return;

        const res = InventoryService.receiveOwnedStockBatch(
          purchaseId,
          it.variant_id,
          qty,
          it.base_unit_cost || it.unit_cost || 0,
          it.vendor_incentive || 0,
          notes || ("Penerimaan bertahap PO " + purchaseId),
          createdBy
        );
        results.push(res);
      });

      // Update receiving_status pada header PO
      const isComplete = receivedItems.every(it => it.is_last_delivery === true);
      const newStatus = isComplete ? "RECEIVED" : "PARTIAL_RECEIVED";

      DatabaseHelper.updateRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId, {
        receiving_status: newStatus
      });

      DatabaseHelper.logActivity(createdBy || "SYSTEM", "RECEIVE_PURCHASE_PARTIAL", "PURCHASE", purchaseId, "Penerimaan stok PO " + purchaseId + " status: " + newStatus);

      return {
        success: true,
        purchase_id: purchaseId,
        receiving_status: newStatus,
        received_items: results
      };
    });
  }

  /**
   * Penerimaan Stok Konsinyasi (VENDOR_CONSIGNMENT)
   * Terhubung dengan vendor titip jual, menambah stok konsinyasi tanpa HPP CrocsCircle.
   */
  function receiveConsignment(vendorId, variantId, quantity, notes, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      if (!vendorId) throw new Error("Vendor ID wajib dipilih.");
      if (!variantId) throw new Error("Varian produk wajib dipilih.");

      const vendor = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", vendorId);
      if (!vendor) throw new Error("Vendor dengan ID '" + vendorId + "' tidak ditemukan.");

      const variant = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", variantId);
      if (!variant) throw new Error("Varian dengan ID '" + variantId + "' tidak ditemukan.");

      const res = InventoryService.receiveConsignmentStock(vendorId, variantId, quantity, notes, createdBy);

      return {
        success: true,
        lot_id: res.lot_id,
        vendor_id: vendorId,
        variant_id: variantId,
        quantity: res.quantity
      };
    });
  }

  // =========================================================================
  // 5. RIWAYAT & AUDIT MUTASI STOK
  // =========================================================================

  /**
   * Mengambil riwayat mutasi stok lengkap dengan relasi nama produk, SKU, dan varian
   */
  function getStockMovements(filters) {
    filters = filters || {};
    const movements = DatabaseHelper.getAllRows("MUTASI_STOK");
    const variants = DatabaseHelper.getAllRows("VARIAN_PRODUK");
    const products = DatabaseHelper.getAllRows("MASTER_PRODUK");

    const variantMap = {};
    variants.forEach(v => { variantMap[v.variant_id] = v; });

    const productMap = {};
    products.forEach(p => { productMap[p.product_id] = p; });

    let list = movements.map(m => {
      const v = variantMap[m.variant_id] || {};
      const p = productMap[v.product_id] || {};

      return {
        movement_id: m.movement_id,
        movement_date: m.movement_date,
        variant_id: m.variant_id,
        sku: v.sku || m.variant_id,
        product_name: p.product_name || "Produk",
        size: v.size || "-",
        color: v.color || "-",
        stock_category: m.stock_category || "OWNED",
        movement_type: m.movement_type,
        quantity: Number(m.quantity) || 0,
        reference_type: m.reference_type || "",
        reference_id: m.reference_id || "",
        notes: m.notes || "",
        created_by: m.created_by || "SYSTEM",
        created_at: m.created_at
      };
    });

    // Urutkan dari yang paling baru
    list.sort((a, b) => new Date(b.movement_date) - new Date(a.movement_date));

    // Filtering
    if (filters.sku) {
      const q = filters.sku.toLowerCase();
      list = list.filter(m => m.sku.toLowerCase().includes(q));
    }

    if (filters.stock_category && filters.stock_category !== "ALL") {
      list = list.filter(m => m.stock_category === filters.stock_category);
    }

    if (filters.movement_type && filters.movement_type !== "ALL") {
      list = list.filter(m => m.movement_type === filters.movement_type);
    }

    return list;
  }

  // =========================================================================
  // 6. MASTER DATA HELPER (KATEGORI & VENDOR)
  // =========================================================================

  function getCategories() {
    return DatabaseHelper.getAllRows("KATEGORI");
  }

  function getVendors() {
    return DatabaseHelper.getAllRows("VENDORS", v => 
      v.is_active === true || v.is_active === "true" || v.status === "ACTIVE" || v.status === "active" || v.is_active === undefined
    );
  }

  return {
    listProducts: listProducts,
    getProductDetail: getProductDetail,
    createProduct: createProduct,
    updateProduct: updateProduct,
    setProductActiveStatus: setProductActiveStatus,
    createVariant: createVariant,
    updateVariant: updateVariant,
    listInventory: listInventory,
    createPurchaseOrder: createPurchaseOrder,
    receivePartialPurchase: receivePartialPurchase,
    receiveConsignment: receiveConsignment,
    getStockMovements: getStockMovements,
    getCategories: getCategories,
    getVendors: getVendors
  };

})();
