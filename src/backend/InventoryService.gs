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
  function receiveOwnedStockBatch(purchaseId, variantId, quantity, baseUnitCost, vendorIncentive, notes, createdBy, allocatedShippingCost) {
    return DatabaseHelper.withLock(30000, function() {
      const qty = parseInt(quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        throw new Error("Kuantitas penerimaan stok harus angka positif lebih dari 0.");
      }

      const baseCost = parseFloat(baseUnitCost) || 0;
      const incentive = parseFloat(vendorIncentive) || 0;
      const shippingAlloc = parseFloat(allocatedShippingCost) || 0;
      const shippingAllocPerUnit = qty > 0 ? (shippingAlloc / qty) : 0;
      const unitCost = baseCost + incentive + shippingAllocPerUnit;
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
        shipping_cost_allocation: shippingAlloc,
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
        if (a._rowIndex && b._rowIndex && a._rowIndex !== b._rowIndex) {
          return a._rowIndex - b._rowIndex;
        }
        const dateA = a.purchase_detail_id || a.purchase_id || "";
        const dateB = b.purchase_detail_id || b.purchase_id || "";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return 0;
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
      // 1. Jika harga jual di bawah hak pokok vendor:
      // Diizinkan hanya jika ada otorisasi Owner (allowBelowMinPrice === true): laba toko dikunci, sisa harga disetor ke vendor
      if (fixedShare > 0 && price < fixedShare && !allowBelowMinPrice) {
        throw new Error("Transaksi titip jual ditolak: Harga jual negosiasi (Rp" + price.toLocaleString("id-ID") + ") lebih rendah dari hak pokok vendor (Rp" + fixedShare.toLocaleString("id-ID") + "). Diperlukan otorisasi Owner untuk menyetujui penyesuaian setoran vendor.");
      }

      // 2. Jika harga jual di bawah batas minimum pemenuhan hak vendor + insentif CrocsCircle: DITOLAK
      // Kecuali jika ada otorisasi khusus Owner yang sah (allowBelowMinPrice === true)
      if (minPrice > 0 && price < minPrice && !allowBelowMinPrice) {
        throw new Error("Transaksi titip jual ditolak: Harga jual negosiasi (Rp" + price.toLocaleString("id-ID") + ") berada di bawah batas minimum kesepakatan vendor " + vendorName + " (Rp" + minPrice.toLocaleString("id-ID") + "). Hak vendor: Rp" + fixedShare.toLocaleString("id-ID") + ", Insentif CrocsCircle: Rp" + feeValue.toLocaleString("id-ID") + ". Transaksi di bawah batas minimum memerlukan persetujuan khusus Owner.");
      }

      let vendorPayablePerUnit = fixedShare > 0 ? fixedShare : 0;
      let incentivePerUnit = feeValue;

      if (fixedShare > 0) {
        if (price < fixedShare && allowBelowMinPrice) {
          // Otorisasi Nego Khusus: Insentif CrocsCircle dikunci aman (feeValue), potongan harga ditanggung hak vendor
          incentivePerUnit = feeValue;
          vendorPayablePerUnit = Math.max(0, price - feeValue);
        } else {
          // Model Fixed Guaranteed Share standar:
          vendorPayablePerUnit = fixedShare;
          incentivePerUnit = price - fixedShare;
        }
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

        let lotVendorPayable = vendorPayablePerUnit;
        let lotIncentive = incentivePerUnit;

        // Dukungan Hak Vendor & Insentif yang Di-adjust Khusus per Lot (di-encode di reference_id)
        if (lot.reference_id && typeof lot.reference_id === "string") {
          const matchShare = lot.reference_id.match(/\[HAK_VENDOR:(\d+)\]/i);
          const matchFee = lot.reference_id.match(/\[INSENTIF:(\d+)\]/i);
          if (matchShare) {
            const lotFixedShare = Number(matchShare[1]);
            const lotFee = matchFee ? Number(matchFee[1]) : 10000;
            if (price < lotFixedShare && allowBelowMinPrice) {
              // Nego di bawah hak vendor dengan izin Owner: kunci insentif toko, sesuaikan setoran vendor
              lotIncentive = lotFee;
              lotVendorPayable = Math.max(0, price - lotFee);
            } else {
              lotVendorPayable = lotFixedShare;
              lotIncentive = Math.max(0, price - lotVendorPayable);
            }
          } else if (matchFee) {
            lotIncentive = Number(matchFee[1]);
            lotVendorPayable = Math.max(0, price - lotIncentive);
          }
        }

        plannedAllocations.push({
          item_ownership: "CONSIGNMENT",
          vendor_id: vendorId,
          batch_id: lot.consignment_lot_id, // Lot ID recorded in batch_id
          quantity: take,
          selling_price: price,
          hpp_unit: 0, // CrocsCircle HPP = 0
          vendor_payable_unit: lotVendorPayable,
          crocs_incentive_unit: lotIncentive,
          subtotal: take * price,
          total_hpp: 0,
          total_vendor_payable: take * lotVendorPayable,
          total_crocs_incentive: take * lotIncentive,
          vendor_paid_amount: 0,
          vendor_remaining_payable: take * lotVendorPayable,
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

  /**
   * Membuat Faktur Pembelian Stok baru (Header PEMBELIAN_STOK).
   * TIDAK menyentuh STOK — hanya mencatat rencana pembelian.
   * Status awal: receiving_status = "UNRECEIVED", payment_status = "UNPAID".
   *
   * @param {Object} purchaseData
   *   { vendor_id, supplier_name, purchase_date, items: [{variant_id, quantity, base_unit_cost, vendor_incentive}],
   *     shipping_cost, notes, created_by }
   * @return {Object} { success, purchase_id, subtotal, total_purchase, ... }
   */
  function createPurchaseInvoice(purchaseData) {
    return DatabaseHelper.withLock(30000, function() {
      const items = purchaseData.items || [];
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Faktur pembelian harus memiliki minimal satu item.");
      }
      items.forEach(function(item, idx) {
        const qty = parseInt(item.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          throw new Error("Kuantitas item ke-" + (idx + 1) + " harus lebih dari 0.");
        }
        if (!item.variant_id) {
          throw new Error("variant_id wajib untuk setiap item (item ke-" + (idx + 1) + ").");
        }
      });

      const shippingCost = parseFloat(purchaseData.shipping_cost) || 0;

      let subtotal = 0;
      items.forEach(function(item) {
        const qty = parseInt(item.quantity, 10);
        const baseCost = parseFloat(item.base_unit_cost) || 0;
        subtotal += qty * baseCost;
      });
      const totalPurchase = subtotal + shippingCost;

      const now = new Date();
      // Validasi Periode Buku Aktif
      const txDate = purchaseData.purchase_date ? new Date(purchaseData.purchase_date) : now;
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(txDate);
      }

      const dateStr = Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss");
      const purchase_id = "PUR-" + dateStr + "-" + Math.floor(Math.random() * 900 + 100);

      // Simpan planned_items dalam notes agar bisa divalidasi saat penerimaan
      const userNotes = purchaseData.notes || "";
      const plannedItems = items.map(function(item) {
        return {
          variant_id: item.variant_id,
          quantity: parseInt(item.quantity, 10),
          base_unit_cost: parseFloat(item.base_unit_cost) || 0,
          vendor_incentive: parseFloat(item.vendor_incentive) || 0
        };
      });
      const notesPayload = JSON.stringify({
        user_notes: userNotes,
        planned_items: plannedItems
      });

      DatabaseHelper.insertRow("PEMBELIAN_STOK", {
        purchase_id: purchase_id,
        purchase_date: purchaseData.purchase_date || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd"),
        vendor_id: purchaseData.vendor_id || "",
        supplier_name: purchaseData.supplier_name || "",
        subtotal: subtotal,
        shipping_cost: shippingCost,
        total_purchase: totalPurchase,
        payment_status: "UNPAID",
        receiving_status: "UNRECEIVED",
        notes: notesPayload,
        created_by: purchaseData.created_by || "SYSTEM"
      });

      DatabaseHelper.logActivity(
        purchaseData.created_by || "SYSTEM",
        "CREATE_PURCHASE_INVOICE",
        "PURCHASE",
        purchase_id,
        "Faktur pembelian dibuat: " + purchase_id + " — Supplier: " + (purchaseData.supplier_name || "") + " — Total: " + totalPurchase
      );

      return {
        success: true,
        purchase_id: purchase_id,
        supplier_name: purchaseData.supplier_name || "",
        subtotal: subtotal,
        shipping_cost: shippingCost,
        total_purchase: totalPurchase,
        payment_status: "UNPAID",
        receiving_status: "UNRECEIVED",
        items_count: items.length
      };
    });
  }

  /**
   * Menerima pengiriman fisik barang dari supplier (partial atau penuh).
   * Idempoten via idempotency_key — pengiriman ulang dengan key yang sama diabaikan.
   * Memanggil receiveOwnedStockBatch() untuk setiap item diterima.
   * Memperbarui receiving_status PEMBELIAN_STOK menjadi PARTIAL_RECEIVED atau FULLY_RECEIVED.
   *
   * @param {Object} receiptData
   *   { purchase_id, received_items: [{variant_id, quantity, base_unit_cost, vendor_incentive}],
   *     idempotency_key, notes, created_by }
   * @return {Object} { success, purchase_id, batches_created, new_receiving_status }
   */
  function receivePurchaseShipment(receiptData) {
    return DatabaseHelper.withLock(30000, function() {
      const purchaseId = receiptData.purchase_id;
      const idempotencyKey = receiptData.idempotency_key;
      const receivedItems = receiptData.received_items || [];

      if (!purchaseId) {
        throw new Error("purchase_id wajib disertakan.");
      }
      if (!idempotencyKey) {
        throw new Error("idempotency_key wajib disertakan untuk mencegah duplikasi penerimaan.");
      }
      if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
        throw new Error("received_items tidak boleh kosong.");
      }

      // Validasi Periode Buku Aktif
      const now = new Date();
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(now);
      }

      // 1. Idempotency check: cek apakah idempotency_key sudah pernah digunakan
      const existingMutations = DatabaseHelper.getAllRows("MUTASI_STOK", function(m) {
        return String(m.reference_id) === String(idempotencyKey) && m.movement_type === "PURCHASE_RECEIPT_BATCH";
      });
      if (existingMutations.length > 0) {
        return {
          success: true,
          idempotent: true,
          purchase_id: purchaseId,
          message: "Penerimaan dengan idempotency_key ini sudah diproses sebelumnya. Diabaikan.",
          batches_created: 0
        };
      }

      // 2. Validasi faktur pembelian ada di PEMBELIAN_STOK
      const invoice = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId);
      if (!invoice) {
        throw new Error("Faktur pembelian tidak ditemukan: " + purchaseId);
      }
      if (invoice.receiving_status === "FULLY_RECEIVED") {
        throw new Error("Faktur pembelian " + purchaseId + " sudah sepenuhnya diterima (FULLY_RECEIVED). Tidak dapat menambah penerimaan.");
      }

      // 3. Parse planned_items dari notes untuk validasi kuantitas
      let plannedItems = [];
      try {
        const notesObj = JSON.parse(invoice.notes || "{}");
        plannedItems = notesObj.planned_items || [];
      } catch (e) {
        // notes tidak berformat JSON — tidak ada rencana kuantitas untuk divalidasi
        plannedItems = [];
      }

      // 4. Untuk setiap item diterima, validasi tidak melebihi yang dipesan
      const batchesCreated = [];
      receivedItems.forEach(function(item) {
        const newQty = parseInt(item.quantity, 10);
        if (isNaN(newQty) || newQty <= 0) {
          throw new Error("Kuantitas penerimaan untuk variant " + item.variant_id + " harus lebih dari 0.");
        }

        // Hitung kuantitas yang sudah diterima sebelumnya untuk varian ini
        const previousBatches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
          return String(b.purchase_id) === String(purchaseId) && String(b.variant_id) === String(item.variant_id);
        });
        let previouslyReceived = 0;
        previousBatches.forEach(function(b) { previouslyReceived += (parseInt(b.quantity, 10) || 0); });

        // Validasi vs planned_items jika tersedia
        const plannedItem = plannedItems.filter(function(p) {
          return String(p.variant_id) === String(item.variant_id);
        })[0];

        if (plannedItem) {
          const orderedQty = parseInt(plannedItem.quantity, 10) || 0;
          if (previouslyReceived + newQty > orderedQty) {
            throw new Error(
              "Kuantitas penerimaan untuk variant " + item.variant_id +
              " melebihi jumlah yang dipesan. Dipesan: " + orderedQty +
              ", Sudah diterima: " + previouslyReceived +
              ", Baru diterima: " + newQty
            );
          }
        }

        // Hitung alokasi ongkir supplier proporsional (Kapitalisasi Persediaan)
        const invoiceShippingCost = parseFloat(invoice.shipping_cost) || 0;
        let totalPlannedQty = 0;
        plannedItems.forEach(function(p) { totalPlannedQty += (parseInt(p.quantity, 10) || 0); });

        let itemAllocatedShipping = 0;
        const shouldCapitalizeShipping = (receiptData.capitalize_shipping !== false);
        if (shouldCapitalizeShipping && invoiceShippingCost > 0 && totalPlannedQty > 0) {
          const shippingPerUnit = invoiceShippingCost / totalPlannedQty;
          itemAllocatedShipping = Math.round(shippingPerUnit * newQty);
        }

        // Panggil receiveOwnedStockBatch — ini membuat DETAIL_PEMBELIAN + update STOK + MUTASI_STOK
        const baseCost = parseFloat(item.base_unit_cost) || (plannedItem ? parseFloat(plannedItem.base_unit_cost) : 0);
        const incentive = parseFloat(item.vendor_incentive) || (plannedItem ? parseFloat(plannedItem.vendor_incentive) : 0);
        const batchResult = receiveOwnedStockBatch(
          purchaseId,
          item.variant_id,
          newQty,
          baseCost,
          incentive,
          receiptData.notes || ("Penerimaan batch faktur " + purchaseId),
          receiptData.created_by || "SYSTEM",
          itemAllocatedShipping
        );
        batchesCreated.push(batchResult);
      });

      // 5. Catat idempotency marker di MUTASI_STOK dengan movement_type khusus
      const idemMovId = "MOV-IDEM-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("MUTASI_STOK", {
        movement_id: idemMovId,
        movement_date: now,
        variant_id: receivedItems[0].variant_id,
        stock_category: "OWNED",
        movement_type: "PURCHASE_RECEIPT_BATCH",
        quantity: 0,
        reference_type: "IDEMPOTENCY",
        reference_id: idempotencyKey,
        notes: "Idempotency marker untuk penerimaan batch faktur " + purchaseId,
        created_by: receiptData.created_by || "SYSTEM",
        created_at: now
      });

      // 6. Hitung total diterima vs total dipesan untuk menentukan receiving_status baru
      let newReceivingStatus = "PARTIAL_RECEIVED";
      if (plannedItems.length > 0) {
        let allFullyReceived = true;
        plannedItems.forEach(function(planned) {
          const allBatchesForVariant = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
            return String(b.purchase_id) === String(purchaseId) && String(b.variant_id) === String(planned.variant_id);
          });
          let totalReceived = 0;
          allBatchesForVariant.forEach(function(b) { totalReceived += (parseInt(b.quantity, 10) || 0); });
          if (totalReceived < parseInt(planned.quantity, 10)) {
            allFullyReceived = false;
          }
        });
        if (allFullyReceived) newReceivingStatus = "FULLY_RECEIVED";
      }

      // 7. Update PEMBELIAN_STOK receiving_status
      DatabaseHelper.updateRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId, {
        receiving_status: newReceivingStatus
      });

      DatabaseHelper.logActivity(
        receiptData.created_by || "SYSTEM",
        "RECEIVE_PURCHASE_SHIPMENT",
        "PURCHASE",
        purchaseId,
        "Penerimaan batch faktur " + purchaseId + " — Status baru: " + newReceivingStatus + " — Batch dibuat: " + batchesCreated.length
      );

      return {
        success: true,
        purchase_id: purchaseId,
        batches_created: batchesCreated.length,
        new_receiving_status: newReceivingStatus,
        batch_details: batchesCreated
      };
    });
  }

  /**
   * Mendapatkan daftar faktur pembelian stok dengan filter opsional.
   *
   * @param {Object} filters
   *   { payment_status, receiving_status, vendor_id, date_from, date_to }
   * @return {Object} { success, purchases: [...], count }
   */
  function getPurchasesList(filters) {
    filters = filters || {};
    const allPurchases = DatabaseHelper.getAllRows("PEMBELIAN_STOK");

    const filtered = allPurchases.filter(function(p) {
      if (filters.payment_status && String(p.payment_status).toUpperCase() !== String(filters.payment_status).toUpperCase()) return false;
      if (filters.receiving_status && String(p.receiving_status).toUpperCase() !== String(filters.receiving_status).toUpperCase()) return false;
      if (filters.vendor_id && String(p.vendor_id) !== String(filters.vendor_id)) return false;
      if (filters.date_from) {
        const df = new Date(filters.date_from);
        const pd = new Date(p.purchase_date);
        if (pd < df) return false;
      }
      if (filters.date_to) {
        const dt = new Date(filters.date_to);
        const pd = new Date(p.purchase_date);
        if (pd > dt) return false;
      }
      return true;
    });

    // Parse user_notes dari kolom notes untuk tampilan lebih bersih dan hitung sisa tagihan
    const result = filtered.map(function(p) {
      let userNotes = p.notes || "";
      let plannedItemsCount = 0;
      try {
        const notesObj = JSON.parse(p.notes || "{}");
        userNotes = notesObj.user_notes || "";
        plannedItemsCount = (notesObj.planned_items || []).length;
      } catch (e) { /* bukan JSON */ }

      // Hitung total_paid riil dari PEMBAYARAN_PEMBELIAN
      let totalPaid = 0;
      let paymentRowsCount = 0;
      try {
        const pmts = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(pm) {
          return String(pm.purchase_id) === String(p.purchase_id);
        });
        paymentRowsCount = pmts.length;
        pmts.forEach(function(pm) { totalPaid += (parseFloat(pm.amount) || 0); });
      } catch (e) {}

      const totalPurchase = parseFloat(p.total_purchase) || 0;
      let remainingBill = 0;
      let isLegacyPayment = false;

      // Proteksi Data Pembayaran Historis (Legacy):
      // Jika faktur sudah berstatus PAID tetapi belum memiliki riwayat di PEMBAYARAN_PEMBELIAN (dibuat sebelum buku besar aktif),
      // sistem mengakui faktur telah lunas secara historis tanpa membuat data transaksi palsu di basis data.
      if (paymentRowsCount === 0 && String(p.payment_status).toUpperCase() === "PAID") {
        totalPaid = totalPurchase;
        remainingBill = 0;
        isLegacyPayment = true;
      } else if (paymentRowsCount === 0 && String(p.payment_status).toUpperCase() === "PARTIAL") {
        isLegacyPayment = true;
        remainingBill = totalPurchase;
      } else {
        remainingBill = Math.max(0, totalPurchase - totalPaid);
      }

      return Object.assign({}, p, {
        display_notes: userNotes,
        planned_items_count: plannedItemsCount,
        total_paid: totalPaid,
        remaining_bill: remainingBill,
        is_legacy_payment: isLegacyPayment
      });
    });

    return {
      success: true,
      purchases: result,
      count: result.length
    };
  }

  /**
   * Mencatat Pembayaran Faktur Supplier secara Riil & Bertahap ke PEMBAYARAN_PEMBELIAN
   *
   * @param {Object} paymentData
   *   { purchase_id, amount, payment_date, payment_method, idempotency_key, notes, created_by }
   * @return {Object} { success, payment_id, purchase_id, amount_paid, total_paid, remaining_bill, payment_status }
   */
  function recordPurchasePayment(paymentData) {
    if (!paymentData) throw new Error("paymentData wajib diisi.");
    const purchaseId = paymentData.purchase_id;
    if (!purchaseId) throw new Error("purchase_id wajib diisi.");

    return DatabaseHelper.withLock(30000, function() {
      // 1. Validasi Nominal Pembayaran
      const amount = parseFloat(paymentData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Nominal pembayaran harus berupa angka positif lebih dari 0.");
      }

      // 2. Validasi Keberadaan Faktur Pembelian
      const invoice = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId);
      if (!invoice) {
        throw new Error("Faktur pembelian dengan ID '" + purchaseId + "' tidak ditemukan.");
      }

      const totalPurchase = parseFloat(invoice.total_purchase) || 0;

      // 3. Validasi Periode Buku Aktif (Real ClosingService Guard)
      const now = new Date();
      const paymentDate = paymentData.payment_date ? new Date(paymentData.payment_date) : now;
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(paymentDate);
      }

      // 4. Cek Idempotency Key
      if (paymentData.idempotency_key) {
        const existingIdemp = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(p) {
          return String(p.idempotency_key) === String(paymentData.idempotency_key);
        });
        if (existingIdemp.length > 0) {
          const ep = existingIdemp[0];
          const allPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(p) {
            return String(p.purchase_id) === String(purchaseId);
          });
          let curTotalPaid = 0;
          allPayments.forEach(function(p) { curTotalPaid += (parseFloat(p.amount) || 0); });
          return {
            success: true,
            idempotent: true,
            idempotentReplay: true,
            payment_id: ep.payment_id,
            purchase_id: ep.purchase_id,
            amount_paid: Number(ep.amount) || 0,
            total_paid: curTotalPaid,
            remaining_bill: Math.max(0, totalPurchase - curTotalPaid),
            payment_status: invoice.payment_status,
            message: "Pembayaran telah dicatat sebelumnya (Idempotency matched)."
          };
        }
      }

      // 5. Hitung Akumulasi Pembayaran Sebelumnya
      const previousPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(p) {
        return String(p.purchase_id) === String(purchaseId);
      });
      let totalPreviouslyPaid = 0;
      previousPayments.forEach(function(p) {
        totalPreviouslyPaid += (parseFloat(p.amount) || 0);
      });

      // Handle Data Pembayaran Historis (Legacy Invoice):
      // Jika faktur sudah berstatus PAID sejak sebelum adanya PEMBAYARAN_PEMBELIAN,
      // sistem mengunci sisa tagihan menjadi Rp0 dan menolak pembayaran berlebih.
      const isHistoricalPaid = (previousPayments.length === 0 && String(invoice.payment_status).toUpperCase() === "PAID");
      if (isHistoricalPaid) {
        throw new Error(
          "Pembayaran ditolak: Faktur pembelian '" + purchaseId + "' sudah berstatus LUNAS (PAID) secara historis (sisa tagihan Rp0). Tidak ada pembayaran tambahan yang perlu dicatat."
        );
      }

      const remainingBill = Math.max(0, totalPurchase - totalPreviouslyPaid);

      // 6. Validasi Pencegahan Pembayaran Melebihi Sisa Tagihan (Toleransi 1 rupiah)
      if (amount > remainingBill + 1) {
        throw new Error(
          "Pembayaran ditolak: Nominal pembayaran (Rp" + amount.toLocaleString("id-ID") +
          ") melebihi sisa tagihan faktur (Rp" + remainingBill.toLocaleString("id-ID") + "). " +
          "Total faktur: Rp" + totalPurchase.toLocaleString("id-ID") +
          ", Sudah dibayar: Rp" + totalPreviouslyPaid.toLocaleString("id-ID") + "."
        );
      }

      // 7. Terbitkan ID Pembayaran Baru
      const dateStr = Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss");
      const paymentId = "PAY-PUR-" + dateStr + "-" + Math.floor(Math.random() * 900 + 100);
      const createdBy = paymentData.created_by || "SYSTEM";

      const newTotalPaid = totalPreviouslyPaid + amount;
      const newRemainingBill = Math.max(0, totalPurchase - newTotalPaid);

      // Tentukan status pembayaran faktur secara otomatis
      let newPaymentStatus = "PARTIAL";
      if (newRemainingBill === 0 || newTotalPaid >= totalPurchase - 1) {
        newPaymentStatus = "PAID";
      }

      // 8. Simpan Transaksi Pembayaran ke PEMBAYARAN_PEMBELIAN
      DatabaseHelper.insertRow("PEMBAYARAN_PEMBELIAN", {
        payment_id: paymentId,
        purchase_id: purchaseId,
        payment_date: paymentData.payment_date || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd"),
        amount: amount,
        payment_method: paymentData.payment_method || "TRANSFER_BANK",
        idempotency_key: paymentData.idempotency_key || "",
        notes: paymentData.notes || "",
        created_by: createdBy,
        created_at: now
      });

      // 9. Perbarui status pembayaran pada header faktur PEMBELIAN_STOK
      DatabaseHelper.updateRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId, {
        payment_status: newPaymentStatus
      });

      // 10. Audit Log Aktivitas
      DatabaseHelper.logActivity(
        createdBy,
        "RECORD_PURCHASE_PAYMENT",
        "PURCHASE",
        paymentId,
        "Pembayaran faktur " + purchaseId + " sebesar Rp" + amount.toLocaleString("id-ID") +
        " via " + (paymentData.payment_method || "TRANSFER_BANK") +
        ". Status faktur kini: " + newPaymentStatus + " (Sisa: Rp" + newRemainingBill.toLocaleString("id-ID") + ")"
      );

      return {
        success: true,
        payment_id: paymentId,
        purchase_id: purchaseId,
        amount_paid: amount,
        total_paid: newTotalPaid,
        remaining_bill: newRemainingBill,
        payment_status: newPaymentStatus,
        payment_method: paymentData.payment_method || "TRANSFER_BANK",
        payment_date: paymentData.payment_date || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd")
      };
    });
  }

  /**
   * Mengambil riwayat pembayaran untuk faktur pembelian tertentu
   *
   * @param {string} purchaseId
   * @return {Object} { success, purchase_id, payments, total_paid, total_purchase, remaining_bill }
   */
  function getPurchasePayments(purchaseId) {
    if (!purchaseId) throw new Error("purchaseId wajib disertakan.");
    const invoice = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId);
    if (!invoice) throw new Error("Faktur pembelian '" + purchaseId + "' tidak ditemukan.");

    const totalPurchase = parseFloat(invoice.total_purchase) || 0;
    const payments = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(p) {
      return String(p.purchase_id) === String(purchaseId);
    });

    let totalPaid = 0;
    const hasLedgerRecords = (payments && payments.length > 0);
    if (hasLedgerRecords) {
      payments.forEach(function(p) { totalPaid += (parseFloat(p.amount) || 0); });
    }

    let remainingBill = 0;
    let isLegacyPayment = false;
    let legacyNotice = null;

    if (!hasLedgerRecords && String(invoice.payment_status).toUpperCase() === "PAID") {
      totalPaid = totalPurchase;
      remainingBill = 0;
      isLegacyPayment = true;
      legacyNotice = "Faktur historis berstatus lunas (PAID) sebelum sistem buku besar PEMBAYARAN_PEMBELIAN diaktifkan. Tidak ada transaksi ganda atau fiktif yang dibuat.";
    } else if (!hasLedgerRecords && String(invoice.payment_status).toUpperCase() === "PARTIAL") {
      isLegacyPayment = true;
      remainingBill = totalPurchase;
      legacyNotice = "Faktur historis berstatus PARTIAL sebelum sistem buku besar aktif. Sisa tagihan dapat dicatat via modal pembayaran kas.";
    } else {
      remainingBill = Math.max(0, totalPurchase - totalPaid);
    }

    return {
      success: true,
      purchase_id: purchaseId,
      supplier_name: invoice.supplier_name || "",
      total_purchase: totalPurchase,
      total_paid: totalPaid,
      remaining_bill: remainingBill,
      payment_status: invoice.payment_status,
      is_legacy_payment: isLegacyPayment,
      legacy_notice: legacyNotice,
      payments: payments,
      count: payments.length
    };
  }

  /**
   * Memperbarui status pembayaran faktur pembelian stok (UNPAID, PARTIAL, PAID).
   * Berdiri sendiri dan TERPISAH dari status penerimaan fisik (receiving_status).
   *
   * @param {string} purchaseId
   * @param {string} paymentStatus - "UNPAID" | "PARTIAL" | "PAID"
   * @param {string} notes
   * @param {string} updatedBy
   * @param {boolean} [allowManualOverride=false] - Flag izin override khusus (default ditolak jika tanpa bukti pembayaran)
   * @return {Object} { success, purchase_id, payment_status, receiving_status }
   */
  function updatePurchasePaymentStatus(purchaseId, paymentStatus, notes, updatedBy, allowManualOverride) {
    return DatabaseHelper.withLock(30000, function() {
      if (!purchaseId) throw new Error("purchaseId wajib disertakan.");
      const validStatuses = ["UNPAID", "PARTIAL", "PAID"];
      const upperStatus = String(paymentStatus || "").toUpperCase();
      if (validStatuses.indexOf(upperStatus) === -1) {
        throw new Error("Status pembayaran tidak valid. Harus salah satu dari: " + validStatuses.join(", "));
      }

      const invoice = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId);
      if (!invoice) throw new Error("Faktur pembelian tidak ditemukan: " + purchaseId);

      // Proteksi Status PAID: Mencegah perubahan manual ke PAID tanpa transaksi pembayaran di PEMBAYARAN_PEMBELIAN
      if (upperStatus === "PAID" && !allowManualOverride) {
        const pmts = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(pm) {
          return String(pm.purchase_id) === String(purchaseId);
        });
        let totalPaid = 0;
        pmts.forEach(function(pm) { totalPaid += (parseFloat(pm.amount) || 0); });
        const totalPurchase = parseFloat(invoice.total_purchase) || 0;
        const isLegacyPaid = (String(invoice.payment_status).toUpperCase() === "PAID");

        if (!isLegacyPaid && (pmts.length === 0 || totalPaid < totalPurchase)) {
          throw new Error(
            "Perubahan status menjadi PAID ditolak: Faktur belum memiliki transaksi pembayaran yang lunas pada buku besar PEMBAYARAN_PEMBELIAN " +
            "(Total Faktur: Rp" + totalPurchase.toLocaleString("id-ID") + ", Terbayar: Rp" + totalPaid.toLocaleString("id-ID") + "). " +
            "Gunakan recordPurchasePayment() untuk mencatat pembayaran kas riil."
          );
        }
      }

      DatabaseHelper.updateRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId, {
        payment_status: upperStatus
      });

      DatabaseHelper.logActivity(
        updatedBy || "SYSTEM",
        "UPDATE_PURCHASE_PAYMENT",
        "PURCHASE",
        purchaseId,
        "Status pembayaran faktur " + purchaseId + " diubah menjadi " + upperStatus + ". Catatan: " + (notes || "-")
      );

      return {
        success: true,
        purchase_id: purchaseId,
        payment_status: upperStatus,
        receiving_status: invoice.receiving_status
      };
    });
  }

  /**
   * Mengambil detail lengkap faktur pembelian: header, item terencana yang diperkaya,
   * riwayat penerimaan, dan riwayat pembayaran. READ-ONLY — tidak mengubah data apapun.
   *
   * @param {string} purchaseId - ID faktur pembelian (PUR-...)
   * @return {Object} { success, purchase_id, purchase_date, vendor_id, supplier_name,
   *                    subtotal, shipping_cost, total_purchase, payment_status, receiving_status,
   *                    user_notes, created_by, items, payments, total_paid, remaining_bill }
   */
  function getPurchaseDetail(purchaseId) {
    if (!purchaseId) throw new Error("purchase_id wajib diisi.");
    const invoice = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", purchaseId);
    if (!invoice) throw new Error("Faktur tidak ditemukan: " + purchaseId);

    // Parse planned items from notes
    var userNotes = "";
    var plannedItems = [];
    try {
      var notesObj = JSON.parse(invoice.notes || "{}");
      userNotes = notesObj.user_notes || "";
      plannedItems = notesObj.planned_items || [];
    } catch(e) { plannedItems = []; }

    // Get actual received batches per variant
    var receivedBatches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
      return String(b.purchase_id) === String(purchaseId);
    });

    // Map received qty per variant
    var receivedQtyMap = {};
    receivedBatches.forEach(function(b) {
      var vid = String(b.variant_id);
      receivedQtyMap[vid] = (receivedQtyMap[vid] || 0) + (parseInt(b.quantity, 10) || 0);
    });

    // Enrich planned items with product/variant names and received status
    var enrichedItems = plannedItems.map(function(item) {
      var variant = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", item.variant_id) || {};
      var product = variant.product_id ? (DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", variant.product_id) || {}) : {};
      var qtyReceived = receivedQtyMap[String(item.variant_id)] || 0;
      var qtyOrdered = parseInt(item.quantity, 10) || 0;
      return {
        variant_id: item.variant_id,
        product_name: product.product_name || "",
        color: variant.color || "",
        size: variant.size || "",
        qty_ordered: qtyOrdered,
        qty_received: qtyReceived,
        qty_remaining: Math.max(0, qtyOrdered - qtyReceived),
        base_unit_cost: parseFloat(item.base_unit_cost) || 0,
        vendor_incentive: parseFloat(item.vendor_incentive) || 0,
        is_fully_received: qtyReceived >= qtyOrdered
      };
    });

    // Get payment history
    var payments = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", function(p) {
      return String(p.purchase_id) === String(purchaseId);
    });

    var totalPaid = 0;
    payments.forEach(function(p) { totalPaid += (parseFloat(p.amount) || 0); });
    var totalPurchase = parseFloat(invoice.total_purchase) || 0;

    return {
      success: true,
      purchase_id: invoice.purchase_id,
      purchase_date: invoice.purchase_date,
      vendor_id: invoice.vendor_id || "",
      supplier_name: invoice.supplier_name || "",
      subtotal: parseFloat(invoice.subtotal) || 0,
      shipping_cost: parseFloat(invoice.shipping_cost) || 0,
      total_purchase: totalPurchase,
      payment_status: invoice.payment_status,
      receiving_status: invoice.receiving_status,
      user_notes: userNotes,
      created_by: invoice.created_by || "",
      items: enrichedItems,
      payments: payments.map(function(p) {
        return {
          payment_id: p.payment_id,
          payment_date: p.payment_date,
          amount: parseFloat(p.amount) || 0,
          payment_method: p.payment_method || "",
          notes: p.notes || "",
          created_by: p.created_by || ""
        };
      }),
      total_paid: totalPaid,
      remaining_bill: Math.max(0, totalPurchase - totalPaid)
    };
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
    adjustStock: adjustStock,
    createPurchaseInvoice: createPurchaseInvoice,
    receivePurchaseShipment: receivePurchaseShipment,
    getPurchasesList: getPurchasesList,
    updatePurchasePaymentStatus: updatePurchasePaymentStatus,
    recordPurchasePayment: recordPurchasePayment,
    getPurchasePayments: getPurchasePayments,
    getPurchaseDetail: getPurchaseDetail
  };
})();
