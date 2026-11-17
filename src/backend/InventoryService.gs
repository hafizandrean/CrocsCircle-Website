/**
 * CROCSCIRCLE.ID — INVENTORY & FIFO ENGINE
 * Version: 1.2.0
 * 
 * Modul Pengelolaan Inventaris, Pelacakan Batch & HPP FIFO Otomatis:
 * 1. Pemisahan Ketat Kepemilikan: OWNED (Stok Sendiri) vs CONSIGNMENT (Titipan Vendor).
 * 2. FIFO Otomatis: Pengambilan HPP dari batch tertua (DETAIL_PEMBELIAN) dengan remaining_qty > 0.
 * 3. Split-Batch Allocation: Pemecahan baris detail saat pesanan mengonsumsi lebih dari 1 batch.
 * 4. Stok Konsinyasi: Tanpa HPP CrocsCircle, mencatat hak vendor dan insentif CrocsCircle.
 * 5. Reservasi PO & Penyerahan Barang: Pelacakan status fisik, reservasi, dan available stock.
 * 6. Rollback & Integritas Transaksi: Rollback otomatis jika alokasi multi-batch gagal di tengah jalan.
 * 7. Perlindungan LockService (30s) anti-overselling dan pencegahan stok negatif.
 */

const InventoryService = (function() {

  /**
   * Mengambil snapshot stok untuk varian tertentu dengan auto-healing baris jika belum ada
   */
  function getStock(variantId) {
    if (!variantId) throw new Error("variantId wajib diisi.");
    let row = DatabaseHelper.getRowByPk("STOK", "variant_id", variantId);
    
    if (!row) {
      // Inisialisasi baris stok awal jika belum ada
      const initialRow = {
        variant_id: variantId,
        owned_physical_stock: 0,
        owned_reserved_stock: 0,
        owned_available_stock: 0,
        consignment_physical_stock: 0,
        consignment_reserved_stock: 0,
        consignment_available_stock: 0,
        total_available_stock: 0,
        minimum_stock: 2,
        updated_at: new Date()
      };
      DatabaseHelper.insertRow("STOK", initialRow);
      return initialRow;
    }

    // Normalisasi nilai angka
    const ownedPhys = Number(row.owned_physical_stock) || 0;
    const ownedRes = Number(row.owned_reserved_stock) || 0;
    const ownedAvail = Math.max(0, ownedPhys - ownedRes);

    const consPhys = Number(row.consignment_physical_stock) || 0;
    const consRes = Number(row.consignment_reserved_stock) || 0;
    const consAvail = Math.max(0, consPhys - consRes);

    const totalAvail = ownedAvail + consAvail;
    const minStock = Number(row.minimum_stock) || 2;

    return {
      variant_id: variantId,
      owned_physical_stock: ownedPhys,
      owned_reserved_stock: ownedRes,
      owned_available_stock: ownedAvail,
      consignment_physical_stock: consPhys,
      consignment_reserved_stock: consRes,
      consignment_available_stock: consAvail,
      total_available_stock: totalAvail,
      minimum_stock: minStock,
      updated_at: row.updated_at
    };
  }

  /**
   * Helper internal untuk memperbarui tabel STOK dan menghitung ulang available stock
   */
  function updateStockValues(variantId, partialUpdates) {
    const current = getStock(variantId);
    const updated = Object.assign({}, current, partialUpdates);

    updated.owned_physical_stock = Math.max(0, Number(updated.owned_physical_stock) || 0);
    updated.owned_reserved_stock = Math.max(0, Number(updated.owned_reserved_stock) || 0);
    updated.owned_available_stock = Math.max(0, updated.owned_physical_stock - updated.owned_reserved_stock);

    updated.consignment_physical_stock = Math.max(0, Number(updated.consignment_physical_stock) || 0);
    updated.consignment_reserved_stock = Math.max(0, Number(updated.consignment_reserved_stock) || 0);
    updated.consignment_available_stock = Math.max(0, updated.consignment_physical_stock - updated.consignment_reserved_stock);

    updated.total_available_stock = updated.owned_available_stock + updated.consignment_available_stock;
    updated.updated_at = new Date();

    DatabaseHelper.updateRowByPk("STOK", "variant_id", variantId, updated);
    return updated;
  }

  /**
   * Pencatatan penerimaan stok sendiri (Pembelian Stok dari Supplier / Vendor Outright)
   */
  function receiveOwnedStockBatch(purchaseId, variantId, quantity, baseUnitCost, vendorIncentive, notes, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        throw new Error("Kuantitas penerimaan stok harus angka positif lebih dari 0.");
      }

      const baseCost = parseFloat(baseUnitCost) || 0;
      const incentive = parseFloat(vendorIncentive) || 0;
      const unitCost = baseCost + incentive;
      const now = new Date();
      const batchId = "PURD-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);

      // 1. Simpan batch persediaan baru di DETAIL_PEMBELIAN
      const batchData = {
        purchase_detail_id: batchId,
        purchase_id: purchaseId || ("PUR-MANUAL-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd")),
        variant_id: variantId,
        quantity: qty,
        remaining_qty: qty, // Tersedia penuh untuk FIFO
        base_unit_cost: baseCost,
        vendor_incentive: incentive,
        unit_cost: unitCost,
        subtotal: qty * unitCost
      };
      DatabaseHelper.insertRow("DETAIL_PEMBELIAN", batchData);

      // 2. Tambah stok fisik milik sendiri
      const currentStock = getStock(variantId);
      updateStockValues(variantId, {
        owned_physical_stock: currentStock.owned_physical_stock + qty
      });

      // 3. Catat mutasi stok
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: "OWNED",
        movement_type: "PURCHASE_RECEIPT",
        quantity: qty,
        reference_type: "PURCHASE",
        reference_id: batchId,
        notes: notes || "Penerimaan stok batch " + batchId,
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      DatabaseHelper.logActivity(createdBy, "STOCK_IN_OWNED", "INVENTORY", batchId, "Penerimaan " + qty + " unit stok sendiri. Unit cost: " + unitCost);
      return {
        success: true,
        batch_id: batchId,
        variant_id: variantId,
        quantity: qty,
        unit_cost: unitCost
      };
    });
  }

  /**
   * Pencatatan penerimaan barang konsinyasi / titipan vendor (Dzaki dll.)
   * Membentuk Lot Konsinyasi Unik di BATCH_KONSINYASI untuk pelacakan multi-vendor & remaining_qty.
   */
  function receiveConsignmentStock(vendorId, variantId, quantity, notes, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        throw new Error("Kuantitas barang titipan harus angka positif lebih dari 0.");
      }
      if (!vendorId) {
        throw new Error("vendorId wajib disertakan pada penerimaan barang titipan.");
      }

      const now = new Date();
      const currentStock = getStock(variantId);
      updateStockValues(variantId, {
        consignment_physical_stock: currentStock.consignment_physical_stock + qty
      });

      // 1. Buat Batch Lot Konsinyasi Unik di BATCH_KONSINYASI
      const lotId = "LOT-CNS-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      const lotData = {
        consignment_lot_id: lotId,
        vendor_id: vendorId,
        variant_id: variantId,
        received_qty: qty,
        remaining_qty: qty,
        received_date: now,
        reference_id: notes || ("Titipan vendor " + vendorId),
        created_by: createdBy || "SYSTEM",
        status: "ACTIVE"
      };
      DatabaseHelper.insertRow("BATCH_KONSINYASI", lotData);

      // 2. Catat Mutasi Stok dengan referensi lotId
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: "CONSIGNMENT",
        movement_type: "CONSIGNMENT_RECEIPT",
        quantity: qty,
        reference_type: "CONSIGNMENT_IN",
        reference_id: lotId,
        notes: (notes || ("Penerimaan barang titipan vendor " + vendorId)) + " [Lot: " + lotId + "]",
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      DatabaseHelper.logActivity(createdBy, "STOCK_IN_CONSIGNMENT", "INVENTORY", lotId, "Penerimaan " + qty + " unit barang titipan vendor " + vendorId + " [Lot: " + lotId + "]");
      return {
        success: true,
        lot_id: lotId,
        vendor_id: vendorId,
        variant_id: variantId,
        quantity: qty
      };
    });
  }

  /**
   * Pemotongan Stok Milik Sendiri Menggunakan Algoritma FIFO Murni
   * Mendukung split-batch jika kuantitas melintasi beberapa batch pembelian.
   */
  function depleteOwnedStockFIFO(salesId, variantId, requestedQty, sellingPrice, createdBy, idempotencyKey) {
    return DatabaseHelper.withLock(30000, function() {
      const qtyNeeded = parseInt(requestedQty, 10);
      if (isNaN(qtyNeeded) || qtyNeeded <= 0) {
        throw new Error("Kuantitas yang diminta harus lebih dari 0.");
      }

      // 1. Cek Idempotency: Cegah double deduction
      if (idempotencyKey) {
        const existingMutations = DatabaseHelper.getAllRows("MUTASI_STOK", m => 
          String(m.reference_id) === String(idempotencyKey) || String(m.reference_id) === String(salesId)
        );
        if (existingMutations.length > 0) {
          // Permintaan ini sudah pernah diproses sebelumnya
          return {
            success: true,
            idempotentReplay: true,
            message: "Transaksi telah diproses sebelumnya (Idempotency matched).",
            allocations: []
          };
        }
      }

      // 2. Validasi Ketersediaan Stok Sendiri
      const currentStock = getStock(variantId);
      if (currentStock.owned_available_stock < qtyNeeded) {
        throw new Error("Stok sendiri tidak mencukupi untuk varian " + variantId + ". Tersedia siap jual: " + currentStock.owned_available_stock + ", Diminta: " + qtyNeeded);
      }

      // 3. Ambil seluruh batch aktif untuk varian ini yang masih memiliki sisa stok (remaining_qty > 0)
      const allBatches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => 
        String(b.variant_id) === String(variantId) && Number(b.remaining_qty) > 0
      );

      // Urutkan FIFO: batch tertua diproses terlebih dahulu berdasarkan baris fisik atau tanggal
      allBatches.sort((a, b) => {
        const dateA = a.purchase_id || "";
        const dateB = b.purchase_id || "";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (a._rowIndex || 0) - (b._rowIndex || 0);
      });

      // Hitung total sisa yang ada pada batch
      const totalAvailableInBatches = allBatches.reduce((sum, b) => sum + Number(b.remaining_qty), 0);
      if (totalAvailableInBatches < qtyNeeded) {
        throw new Error("Inkonsistensi data: Total sisa pada batch pembelian (" + totalAvailableInBatches + ") lebih kecil dari kuantitas yang diminta (" + qtyNeeded + "). Hubungi Owner.");
      }

      let remainingToDeduct = qtyNeeded;
      const plannedAllocations = [];

      // 4. Hitung alokasi FIFO per batch
      for (let i = 0; i < allBatches.length && remainingToDeduct > 0; i++) {
        const batch = allBatches[i];
        const batchRemaining = Number(batch.remaining_qty);
        const take = Math.min(batchRemaining, remainingToDeduct);

        plannedAllocations.push({
          batch_id: batch.purchase_detail_id,
          variant_id: variantId,
          item_ownership: "OWNED",
          quantity: take,
          selling_price: Number(sellingPrice) || 0,
          hpp_unit: Number(batch.unit_cost) || 0,
          subtotal: take * (Number(sellingPrice) || 0),
          total_hpp: take * (Number(batch.unit_cost) || 0),
          previous_remaining_qty: batchRemaining,
          new_remaining_qty: batchRemaining - take
        });

        remainingToDeduct -= take;
      }

      // 5. Eksekusi pemotongan batch dengan Rollback Safety
      const executedUpdates = [];
      let stockValuesUpdated = false;
      try {
        plannedAllocations.forEach(alloc => {
          DatabaseHelper.updateRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", alloc.batch_id, {
            remaining_qty: alloc.new_remaining_qty
          });
          executedUpdates.push(alloc);
        });

        // 6. Update stok fisik & available stock
        updateStockValues(variantId, {
          owned_physical_stock: currentStock.owned_physical_stock - qtyNeeded
        });
        stockValuesUpdated = true;

        // 7. Catat mutasi stok
        const now = new Date();
        const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
        DatabaseHelper.insertRow("MUTASI_STOK", {
          movement_id: movementId,
          movement_date: now,
          variant_id: variantId,
          stock_category: "OWNED",
          movement_type: "SALES_DISPATCH",
          quantity: -qtyNeeded,
          reference_type: "SALES",
          reference_id: idempotencyKey || salesId,
          notes: "Penjualan FIFO sales " + salesId + " (" + plannedAllocations.length + " batch terpakai)",
          created_by: createdBy || "SYSTEM",
          created_at: now
        });

        DatabaseHelper.logActivity(createdBy, "FIFO_DISPATCH_OWNED", "INVENTORY", salesId, "Pengurangan FIFO " + qtyNeeded + " unit varian " + variantId + " melintasi " + plannedAllocations.length + " batch.");

        return {
          success: true,
          salesId: salesId,
          variantId: variantId,
          totalQty: qtyNeeded,
          allocations: plannedAllocations
        };

      } catch (err) {
        // ROLLBACK STATE: Kembalikan remaining_qty batch yang sudah terlanjur dipotong
        executedUpdates.forEach(alloc => {
          try {
            DatabaseHelper.updateRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", alloc.batch_id, {
              remaining_qty: alloc.previous_remaining_qty
            });
          } catch (rbErr) {
            Logger.log("FATAL ROLLBACK ERROR pada batch " + alloc.batch_id + ": " + rbErr.message);
          }
        });
        if (stockValuesUpdated) {
          try {
            updateStockValues(variantId, {
              owned_physical_stock: currentStock.owned_physical_stock
            });
          } catch (stkErr) {
            Logger.log("FATAL ROLLBACK ERROR pada STOK: " + stkErr.message);
          }
        }
        throw new Error("Gagal mengeksekusi alokasi FIFO: " + err.message + ". Seluruh perubahan batch telah di-rollback.");
      }
    });
  }

  /**
   * Pemotongan Barang Titipan Vendor (Konsinyasi) Saat Penjualan
   * Memvalidasi ketersediaan stok spesifik per vendor melalui BATCH_KONSINYASI
   * Menggunakan alokasi FIFO lot konsinyasi dan menyimpan lot_id pada detail penjualan.
   */
  function depleteConsignmentStock(salesId, variantId, vendorId, requestedQty, sellingPrice, createdBy, idempotencyKey, allowBelowMinPrice) {
    return DatabaseHelper.withLock(30000, function() {
      const qtyNeeded = parseInt(requestedQty, 10);
      if (isNaN(qtyNeeded) || qtyNeeded <= 0) {
        throw new Error("Kuantitas yang diminta harus lebih dari 0.");
      }
      if (!vendorId) {
        throw new Error("vendorId wajib disertakan pada pemotongan barang konsinyasi.");
      }

      // 1. Cek Idempotency
      if (idempotencyKey) {
        const existing = DatabaseHelper.getAllRows("MUTASI_STOK", m => String(m.reference_id) === String(idempotencyKey));
        if (existing.length > 0) {
          return { success: true, idempotentReplay: true, allocations: [] };
        }
      }

      // 2. Ambil vendor info
      const vendorRow = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", vendorId);
      const vendorName = vendorRow ? vendorRow.vendor_name : vendorId;

      // 3. Validasi Ketersediaan Stok Konsinyasi Spesifik Vendor dari BATCH_KONSINYASI
      const activeLots = DatabaseHelper.getAllRows("BATCH_KONSINYASI", lot =>
        String(lot.vendor_id) === String(vendorId) &&
        String(lot.variant_id) === String(variantId) &&
        Number(lot.remaining_qty) > 0 &&
        (lot.status === "ACTIVE" || lot.status === "active" || !lot.status)
      );

      // Urutkan FIFO berdasarkan received_date / consignment_lot_id
      activeLots.sort((a, b) => {
        const dateA = a.received_date ? new Date(a.received_date).getTime() : 0;
        const dateB = b.received_date ? new Date(b.received_date).getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a._rowIndex || 0) - (b._rowIndex || 0);
      });

      const totalVendorAvailable = activeLots.reduce((sum, l) => sum + Number(l.remaining_qty), 0);
      if (totalVendorAvailable < qtyNeeded) {
        throw new Error("Stok konsinyasi untuk vendor " + vendorName + " tidak mencukupi untuk varian " + variantId + ". Tersedia: " + totalVendorAvailable + " unit, Diminta: " + qtyNeeded + " unit.");
      }

      // 4. Validasi Global Physical Stock (Konsinyasi)
      const currentStock = getStock(variantId);
      if (currentStock.consignment_available_stock < qtyNeeded) {
        throw new Error("Stok titipan vendor global tidak mencukupi untuk varian " + variantId + ". Tersedia: " + currentStock.consignment_available_stock + ", Diminta: " + qtyNeeded);
      }

      // 5. Hitung hak vendor & insentif CrocsCircle
      const feeType = vendorRow ? vendorRow.consignment_fee_type : "FIXED_PER_UNIT";
      const feeValue = vendorRow ? Number(vendorRow.default_consignment_fee) : 10000;
      const fixedShare = vendorRow && vendorRow.fixed_vendor_share ? Number(vendorRow.fixed_vendor_share) : 0;
      const minPrice = vendorRow && vendorRow.min_selling_price ? Number(vendorRow.min_selling_price) : (fixedShare + feeValue);

      const price = Number(sellingPrice) || 0;

      // VALIDASI NEGOSIASI HARGA VENDOR:
      // 1. Jika harga jual di bawah hak pokok vendor: MUTLAK DITOLAK
      if (fixedShare > 0 && price < fixedShare) {
        throw new Error("Transaksi konsinyasi ditolak: Harga jual negosiasi (Rp" + price.toLocaleString("id-ID") + ") lebih rendah dari hak pokok vendor (Rp" + fixedShare.toLocaleString("id-ID") + "). Penjualan akan menimbulkan kerugian langsung.");
      }

      // 2. Jika harga jual di bawah batas minimum pemenuhan hak vendor + insentif CrocsCircle: DITOLAK
      // Kecuali jika ada otorisasi khusus Owner yang sah (allowBelowMinPrice === true)
      if (minPrice > 0 && price < minPrice && !allowBelowMinPrice) {
        throw new Error("Transaksi konsinyasi ditolak: Harga jual negosiasi (Rp" + price.toLocaleString("id-ID") + ") berada di bawah batas minimum kesepakatan vendor " + vendorName + " (Rp" + minPrice.toLocaleString("id-ID") + "). Hak vendor: Rp" + fixedShare.toLocaleString("id-ID") + ", Insentif CrocsCircle: Rp" + feeValue.toLocaleString("id-ID") + ". Transaksi di bawah batas minimum memerlukan persetujuan khusus Owner.");
      }

      let vendorPayablePerUnit = fixedShare > 0 ? fixedShare : 0;
      let incentivePerUnit = feeValue;

      if (fixedShare > 0) {
        // Model Fixed Guaranteed Share (seperti Dzaki Rp270.000):
        // Hak Dzaki tetap Rp270.000, CrocsCircle mengambil sisa harga (price - fixedShare)
        vendorPayablePerUnit = fixedShare;
        incentivePerUnit = price - fixedShare;
      } else {
        if (feeType === "PERCENTAGE") {
          incentivePerUnit = Math.round(price * (feeValue / 100));
        }
        vendorPayablePerUnit = Math.max(0, price - incentivePerUnit);
      }

      // 6. Alokasi FIFO Lot Konsinyasi
      let remainingToDeduct = qtyNeeded;
      const plannedLotUpdates = [];
      const plannedAllocations = [];

      for (let i = 0; i < activeLots.length && remainingToDeduct > 0; i++) {
        const lot = activeLots[i];
        const lotRemaining = Number(lot.remaining_qty);
        const take = Math.min(lotRemaining, remainingToDeduct);
        const newRem = lotRemaining - take;

        plannedLotUpdates.push({
          lot_id: lot.consignment_lot_id,
          previous_remaining_qty: lotRemaining,
          new_remaining_qty: newRem,
          previous_status: lot.status || "ACTIVE",
          new_status: newRem === 0 ? "EXHAUSTED" : "ACTIVE"
        });

        plannedAllocations.push({
          item_ownership: "CONSIGNMENT",
          vendor_id: vendorId,
          batch_id: lot.consignment_lot_id, // Lot ID recorded in batch_id
          quantity: take,
          selling_price: price,
          hpp_unit: 0, // CrocsCircle HPP = 0
          vendor_payable_unit: vendorPayablePerUnit,
          crocs_incentive_unit: incentivePerUnit,
          subtotal: take * price,
          total_hpp: 0,
          total_vendor_payable: take * vendorPayablePerUnit,
          total_crocs_incentive: take * incentivePerUnit,
          vendor_paid_amount: 0,
          vendor_remaining_payable: take * vendorPayablePerUnit,
          settlement_status: "UNPAID"
        });

        remainingToDeduct -= take;
      }

      // 7. Eksekusi pemotongan lot dengan Rollback Safety
      const executedLotUpdates = [];
      let stockValuesUpdated = false;
      try {
        plannedLotUpdates.forEach(u => {
          DatabaseHelper.updateRowByPk("BATCH_KONSINYASI", "consignment_lot_id", u.lot_id, {
            remaining_qty: u.new_remaining_qty,
            status: u.new_status
          });
          executedLotUpdates.push(u);
        });

        // Update stok fisik konsinyasi
        updateStockValues(variantId, {
          consignment_physical_stock: currentStock.consignment_physical_stock - qtyNeeded
        });
        stockValuesUpdated = true;

        // Catat mutasi stok
        const now = new Date();
        const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
        DatabaseHelper.insertRow("MUTASI_STOK", {
          movement_id: movementId,
          movement_date: now,
          variant_id: variantId,
          stock_category: "CONSIGNMENT",
          movement_type: "SALES_DISPATCH",
          quantity: -qtyNeeded,
          reference_type: "SALES",
          reference_id: idempotencyKey || salesId,
          notes: "Penjualan konsinyasi vendor " + vendorId + " pada sales " + salesId + " (" + plannedAllocations.length + " lot terpakai: " + plannedLotUpdates.map(u => u.lot_id).join(", ") + ")",
          created_by: createdBy || "SYSTEM",
          created_at: now
        });

        const totalPayableAll = plannedAllocations.reduce((sum, a) => sum + a.total_vendor_payable, 0);
        const totalIncentiveAll = plannedAllocations.reduce((sum, a) => sum + a.total_crocs_incentive, 0);
        DatabaseHelper.logActivity(createdBy, "CONSIGNMENT_DISPATCH", "INVENTORY", salesId, "Penjualan konsinyasi " + qtyNeeded + " unit vendor " + vendorId + " (" + plannedAllocations.length + " lot). Hak vendor: " + totalPayableAll + ", Insentif Crocs: " + totalIncentiveAll);

        return {
          success: true,
          salesId: salesId,
          variantId: variantId,
          totalQty: qtyNeeded,
          allocations: plannedAllocations
        };

      } catch (err) {
        // Rollback state
        executedLotUpdates.forEach(u => {
          try {
            DatabaseHelper.updateRowByPk("BATCH_KONSINYASI", "consignment_lot_id", u.lot_id, {
              remaining_qty: u.previous_remaining_qty,
              status: u.previous_status
            });
          } catch (rbErr) {
            Logger.log("FATAL ROLLBACK ERROR pada lot konsinyasi " + u.lot_id + ": " + rbErr.message);
          }
        });
        if (stockValuesUpdated) {
          try {
            updateStockValues(variantId, {
              consignment_physical_stock: currentStock.consignment_physical_stock
            });
          } catch (stkErr) {
            Logger.log("FATAL ROLLBACK ERROR pada STOK konsinyasi: " + stkErr.message);
          }
        }
        throw new Error("Gagal mengeksekusi alokasi lot konsinyasi: " + err.message + ". Seluruh perubahan lot telah di-rollback.");
      }
    });
  }

  /**
   * Reservasi Stok untuk Pesanan Pre-Order (PO)
   */
  function reserveStock(poId, variantId, quantity, stockCategory, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas reservasi harus positif.");
      const category = (stockCategory || "OWNED").toUpperCase();

      const current = getStock(variantId);
      if (category === "OWNED") {
        if (current.owned_available_stock < qty) {
          throw new Error("Stok sendiri tidak cukup untuk di-booking PO. Tersedia: " + current.owned_available_stock + ", Diminta: " + qty);
        }
        updateStockValues(variantId, {
          owned_reserved_stock: current.owned_reserved_stock + qty
        });
      } else {
        if (current.consignment_available_stock < qty) {
          throw new Error("Stok titipan vendor tidak cukup untuk di-booking PO. Tersedia: " + current.consignment_available_stock + ", Diminta: " + qty);
        }
        updateStockValues(variantId, {
          consignment_reserved_stock: current.consignment_reserved_stock + qty
        });
      }

      const now = new Date();
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: category,
        movement_type: "STOCK_RESERVATION",
        quantity: qty,
        reference_type: "PRE_ORDER",
        reference_id: poId,
        notes: "Booking stok untuk PO " + poId,
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      return { success: true, poId: poId, variantId: variantId, reservedQty: qty, category: category };
    });
  }

  /**
   * Pelepasan Reservasi Stok (Misal saat pesanan PO dibatalkan)
   */
  function releaseReservation(poId, variantId, quantity, stockCategory, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas pelepasan reservasi harus positif.");
      const category = (stockCategory || "OWNED").toUpperCase();

      const current = getStock(variantId);
      if (category === "OWNED") {
        updateStockValues(variantId, {
          owned_reserved_stock: Math.max(0, current.owned_reserved_stock - qty)
        });
      } else {
        updateStockValues(variantId, {
          consignment_reserved_stock: Math.max(0, current.consignment_reserved_stock - qty)
        });
      }

      const now = new Date();
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: category,
        movement_type: "RELEASE_RESERVATION",
        quantity: -qty,
        reference_type: "PRE_ORDER",
        reference_id: poId,
        notes: "Pelepasan booking stok untuk PO " + poId,
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      return { success: true, poId: poId, variantId: variantId, releasedQty: qty };
    });
  }

  /**
   * Penyerahan Barang PO kepada Pelanggan (Fulfillment)
   * Mengurangi stok fisik dan stok reservasi secara bersamaan.
   */
  function fulfillReservedStock(poId, variantId, quantity, stockCategory, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas serah PO harus positif.");
      const category = (stockCategory || "OWNED").toUpperCase();

      const current = getStock(variantId);
      if (category === "OWNED") {
        updateStockValues(variantId, {
          owned_physical_stock: Math.max(0, current.owned_physical_stock - qty),
          owned_reserved_stock: Math.max(0, current.owned_reserved_stock - qty)
        });
      } else {
        updateStockValues(variantId, {
          consignment_physical_stock: Math.max(0, current.consignment_physical_stock - qty),
          consignment_reserved_stock: Math.max(0, current.consignment_reserved_stock - qty)
        });
      }

      const now = new Date();
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: category,
        movement_type: "PO_FULFILLMENT",
        quantity: -qty,
        reference_type: "PRE_ORDER",
        reference_id: poId,
        notes: "Penyerahan barang pesanan PO " + poId + " kepada customer",
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      return { success: true, poId: poId, variantId: variantId, fulfilledQty: qty };
    });
  }

  /**
   * Retur Barang Milik Sendiri ke Batch Pembelian Asal
   */
  function returnOwnedStockToBatch(salesId, variantId, batchId, quantity, reason, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas retur harus positif.");

      // 1. Ambil data batch asal
      const batch = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batchId);
      if (!batch) {
        throw new Error("Batch pembelian asal " + batchId + " tidak ditemukan.");
      }

      const newRemaining = (Number(batch.remaining_qty) || 0) + qty;
      DatabaseHelper.updateRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batchId, {
        remaining_qty: newRemaining
      });

      // 2. Tambah stok fisik kembali
      const current = getStock(variantId);
      updateStockValues(variantId, {
        owned_physical_stock: current.owned_physical_stock + qty
      });

      // 3. Catat mutasi retur
      const now = new Date();
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: "OWNED",
        movement_type: "RETURN_IN",
        quantity: qty,
        reference_type: "RETURN",
        reference_id: salesId,
        notes: "Retur ke batch " + batchId + ": " + (reason || "Retur penjualan"),
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      DatabaseHelper.logActivity(createdBy, "STOCK_RETURN_OWNED", "INVENTORY", salesId, "Retur " + qty + " unit ke batch " + batchId + ". Alasan: " + reason);

      return { success: true, salesId: salesId, batchId: batchId, returnedQty: qty, remaining_qty: newRemaining };
    });
  }

  /**
   * Retur Barang Konsinyasi ke Stok Vendor & Lot Spesifik
   */
  function returnConsignmentStock(salesId, variantId, vendorId, quantity, reason, createdBy, lotId) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas retur harus positif.");

      // 1. Pulihkan remaining_qty pada lot spesifik di BATCH_KONSINYASI jika lotId diberikan
      let restoredLotId = null;
      if (lotId) {
        const lot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", lotId);
        if (lot) {
          const newRemaining = (Number(lot.remaining_qty) || 0) + qty;
          DatabaseHelper.updateRowByPk("BATCH_KONSINYASI", "consignment_lot_id", lotId, {
            remaining_qty: newRemaining,
            status: "ACTIVE" // Aktifkan kembali lot jika sebelumnya EXHAUSTED
          });
          restoredLotId = lotId;
        }
      }

      // 2. Tambah stok fisik konsinyasi
      const current = getStock(variantId);
      updateStockValues(variantId, {
        consignment_physical_stock: current.consignment_physical_stock + qty
      });

      // 3. Catat mutasi retur
      const now = new Date();
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: "CONSIGNMENT",
        movement_type: "RETURN_IN",
        quantity: qty,
        reference_type: "RETURN",
        reference_id: salesId,
        notes: "Retur barang konsinyasi vendor " + vendorId + (restoredLotId ? " [Lot: " + restoredLotId + "]" : "") + ": " + (reason || "Retur penjualan"),
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      DatabaseHelper.logActivity(createdBy, "STOCK_RETURN_CONSIGNMENT", "INVENTORY", salesId, "Retur konsinyasi " + qty + " unit vendor " + vendorId + (restoredLotId ? " [Lot: " + restoredLotId + "]" : "") + ". Alasan: " + reason);

      return { success: true, salesId: salesId, vendorId: vendorId, returnedQty: qty, lotId: restoredLotId };
    });
  }

  /**
   * Menghitung total stok konsinyasi yang tersedia untuk vendor tertentu pada varian tertentu
   */
  function getConsignmentStockByVendor(variantId, vendorId) {
    const lots = DatabaseHelper.getAllRows("BATCH_KONSINYASI", lot =>
      String(lot.vendor_id) === String(vendorId) &&
      String(lot.variant_id) === String(variantId) &&
      Number(lot.remaining_qty) > 0
    );
    const totalRemaining = lots.reduce((sum, l) => sum + (Number(l.remaining_qty) || 0), 0);
    return {
      variant_id: variantId,
      vendor_id: vendorId,
      available_qty: totalRemaining,
      active_lots: lots
    };
  }

  /**
   * Penyesuaian Stok Manual (Opname Fisik) dengan Audit Trail Wajib
   */
  function adjustStock(variantId, stockCategory, adjustmentQty, reason, createdBy) {
    return DatabaseHelper.withLock(30000, function() {
      const adj = parseInt(adjustmentQty, 10);
      if (isNaN(adj) || adj === 0) throw new Error("Nominal penyesuaian stok tidak boleh nol.");
      if (!reason || reason.trim().length < 5) throw new Error("Alasan penyesuaian stok wajib diisi minimal 5 karakter.");

      const category = (stockCategory || "OWNED").toUpperCase();
      const current = getStock(variantId);

      if (category === "OWNED") {
        const newPhys = current.owned_physical_stock + adj;
        if (newPhys < 0) throw new Error("Penyesuaian ditolak: Stok fisik tidak boleh menjadi negatif.");
        updateStockValues(variantId, { owned_physical_stock: newPhys });
      } else {
        const newPhys = current.consignment_physical_stock + adj;
        if (newPhys < 0) throw new Error("Penyesuaian ditolak: Stok konsinyasi tidak boleh menjadi negatif.");
        updateStockValues(variantId, { consignment_physical_stock: newPhys });
      }

      const now = new Date();
      const movementId = "MOV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: movementId,
        movement_date: now,
        variant_id: variantId,
        stock_category: category,
        movement_type: "STOCK_ADJUSTMENT",
        quantity: adj,
        reference_type: "MANUAL_ADJUSTMENT",
        reference_id: movementId,
        notes: reason,
        created_by: createdBy || "SYSTEM",
        created_at: now
      });

      DatabaseHelper.logActivity(createdBy, "STOCK_ADJUSTMENT", "INVENTORY", variantId, "Penyesuaian stok " + (adj > 0 ? "+" : "") + adj + " (" + category + "). Alasan: " + reason);

      return { success: true, variantId: variantId, adjustment: adj, category: category };
    });
  }

  /**
   * Rekonsiliasi & Karantina Stok Konsinyasi Warisan (Legacy)
   * Memeriksa ketidakcocokan antara STOK.consignment_physical_stock dan jumlah remaining_qty di BATCH_KONSINYASI.
   * Setiap kelebihan stok fisik konsinyasi lama yang tidak jelas asal lot/vendornya dimasukkan ke lot karantina:
   * status: "LEGACY_UNALLOCATED", vendor_id: "UNALLOCATED_LEGACY".
   * Stok ini TIDAK DAPAT DIJUAL oleh kasir sebelum direkonsiliasi manual oleh Owner.
   * Fungsi ini bersifat IDEMPOTENT (tidak menggandakan lot jika dijalankan ulang).
   */
  function reconcileLegacyConsignmentStock(callerToken) {
    if (callerToken) {
      AuthService.requireOwner(callerToken);
    }
    return DatabaseHelper.withLock(30000, function() {
      const allStocks = DatabaseHelper.getAllRows("STOK");
      const allLots = DatabaseHelper.getAllRows("BATCH_KONSINYASI");
      const results = [];

      allStocks.forEach(stk => {
        const variantId = stk.variant_id;
        const physicalCons = Number(stk.consignment_physical_stock) || 0;
        if (physicalCons <= 0) return;

        // Hitung total sisa yang tercatat di BATCH_KONSINYASI untuk varian ini
        const variantLots = allLots.filter(l => String(l.variant_id) === String(variantId));
        const totalLotRemaining = variantLots.reduce((sum, l) => sum + (Number(l.remaining_qty) || 0), 0);

        if (physicalCons > totalLotRemaining) {
          const discrepancy = physicalCons - totalLotRemaining;
          const legacyLotId = "LOT-LEGACY-" + variantId;

          // Cek apakah lot legacy sudah pernah dibuat sebelumnya (Idempotency)
          const existingLegacy = variantLots.find(l => String(l.consignment_lot_id) === legacyLotId);
          if (existingLegacy) {
            results.push({
              variant_id: variantId,
              status: "ALREADY_QUARANTINED",
              lot_id: existingLegacy.consignment_lot_id,
              quarantined_qty: Number(existingLegacy.remaining_qty)
            });
            return;
          }

          // Buat record karantina terisolasi
          const now = new Date();
          const legacyLot = {
            consignment_lot_id: legacyLotId,
            vendor_id: "UNALLOCATED_LEGACY",
            variant_id: variantId,
            received_qty: discrepancy,
            remaining_qty: discrepancy,
            received_date: now,
            reference_id: "LEGACY_PRE_HOTFIX_UNALLOCATED",
            created_by: "SYSTEM_MIGRATION",
            status: "LEGACY_UNALLOCATED"
          };
          DatabaseHelper.insertRow("BATCH_KONSINYASI", legacyLot);

          // Catat log audit mutasi
          const movementId = "MOV-MIG-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
          DatabaseHelper.insertRow("MUTASI_STOK", {
            movement_id: movementId,
            movement_date: now,
            variant_id: variantId,
            stock_category: "CONSIGNMENT",
            movement_type: "LEGACY_MIGRATION_QUARANTINE",
            quantity: 0,
            reference_type: "MIGRATION",
            reference_id: legacyLotId,
            notes: "Karantina stok konsinyasi warisan tanpa data lot (" + discrepancy + " unit). Wajib verifikasi Owner.",
            created_by: "SYSTEM_MIGRATION",
            created_at: now
          });

          DatabaseHelper.logActivity("SYSTEM_MIGRATION", "LEGACY_STOCK_QUARANTINE", "INVENTORY", legacyLotId, "Karantina " + discrepancy + " unit stok konsinyasi warisan varian " + variantId + " sebagai LEGACY_UNALLOCATED.");

          results.push({
            variant_id: variantId,
            status: "QUARANTINED",
            lot_id: legacyLotId,
            quarantined_qty: discrepancy
          });
        }
      });

      return {
        success: true,
        quarantined_count: results.filter(r => r.status === "QUARANTINED").length,
        items: results
      };
    });
  }

  /**
   * Rekonsiliasi Manual oleh Owner untuk Mengalokasikan Lot Karantina ke Vendor yang Terbukti Sah
   */
  function reassignLegacyConsignmentLot(lotId, targetVendorId, verifiedNotes, callerToken) {
    if (callerToken) {
      AuthService.requireOwner(callerToken);
    }
    return DatabaseHelper.withLock(30000, function() {
      if (!lotId) throw new Error("lotId wajib diisi.");
      if (!targetVendorId) throw new Error("targetVendorId wajib dipilih.");
      if (!verifiedNotes || verifiedNotes.trim().length < 5) {
        throw new Error("Catatan bukti verifikasi rekonsiliasi wajib diisi minimal 5 karakter.");
      }

      const lot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", lotId);
      if (!lot) throw new Error("Lot konsinyasi '" + lotId + "' tidak ditemukan.");
      if (lot.status !== "LEGACY_UNALLOCATED") {
        throw new Error("Lot '" + lotId + "' bukan lot berstatus LEGACY_UNALLOCATED (status saat ini: " + lot.status + ").");
      }

      const vendor = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", targetVendorId);
      if (!vendor) throw new Error("Vendor tujuan '" + targetVendorId + "' tidak ditemukan.");

      const now = new Date();
      DatabaseHelper.updateRowByPk("BATCH_KONSINYASI", "consignment_lot_id", lotId, {
        vendor_id: targetVendorId,
        status: "ACTIVE",
        reference_id: verifiedNotes,
        updated_at: now
      });

      DatabaseHelper.logActivity(
        "OWNER",
        "REASSIGN_LEGACY_LOT",
        "INVENTORY",
        lotId,
        "Owner menetapkan lot karantina " + lotId + " (" + lot.remaining_qty + " unit) kepada vendor " + targetVendorId + " (" + vendor.vendor_name + "). Bukti: " + verifiedNotes
      );

      return {
        success: true,
        lot_id: lotId,
        new_vendor_id: targetVendorId,
        vendor_name: vendor.vendor_name,
        remaining_qty: lot.remaining_qty,
        status: "ACTIVE"
      };
    });
  }

  return {
    getStock: getStock,
    receiveOwnedStockBatch: receiveOwnedStockBatch,
    receiveConsignmentStock: receiveConsignmentStock,
    depleteOwnedStockFIFO: depleteOwnedStockFIFO,
    depleteConsignmentStock: depleteConsignmentStock,
    reserveStock: reserveStock,
    releaseReservation: releaseReservation,
    fulfillReservedStock: fulfillReservedStock,
    returnOwnedStockToBatch: returnOwnedStockToBatch,
    returnConsignmentStock: returnConsignmentStock,
    getConsignmentStockByVendor: getConsignmentStockByVendor,
    reconcileLegacyConsignmentStock: reconcileLegacyConsignmentStock,
    reassignLegacyConsignmentLot: reassignLegacyConsignmentLot,
    adjustStock: adjustStock
  };
})();
