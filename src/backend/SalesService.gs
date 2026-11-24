/**
 * CROCSCIRCLE.ID — SALES TRANSACTION ENGINE
 * Version: 1.2.0
 * 
 * Modul Transaksi Penjualan Multi-Item, Multi-Channel & Fleksibilitas Harga:
 * 1. Penjualan Offline, Bazar, Event, WhatsApp, dan Channel Lainnya.
 * 2. Transaksi Multi-Item & Multi-Varian dalam 1 Faktur Penjualan.
 * 3. Harga Jual Fleksibel: Menggunakan harga aktual hasil kesepakatan/tawar-menawar.
 * 4. Integrasi FIFO Otomatis untuk Stok OWNED (pemecahan detail baris split-batch).
 * 5. Integrasi Stok CONSIGNMENT: HPP = 0, mencatat hak vendor & insentif CrocsCircle.
 * 6. Pemisahan Akuntansi: Omzet Sendiri vs Nilai Bruto Konsinyasi vs Kas Diterima.
 * 7. Perlindungan Idempotency, Concurrency (LockService), dan Atomic Rollback jika ada item gagal.
 * 8. Retur Penjualan: Mengembalikan stok OWNED ke batch asal dan membalik kewajiban vendor.
 */

const SalesService = (function() {

  /**
   * Mencatat transaksi penjualan baru (Multi-Item)
   * 
   * @param {Object} saleData
   *   - transaction_date: Date|string (default: now)
   *   - sales_channel: string ('OFFLINE_EVENT', 'WEEKLY_MARKET', 'WHATSAPP', 'OTHER')
   *   - sales_type: string ('READY_STOCK', 'PO_SETTLEMENT')
   *   - customer_name: string (opsional)
   *   - payment_method: string ('QRIS', 'CASH', 'TRANSFER', 'OTHER')
   *   - idempotency_key: string (UUID unik dari client untuk anti-double submission)
   *   - notes: string (lokasi bazar, catatan event)
   *   - created_by: string (User ID admin/kasir)
   *   - items: Array of objects
   *       [
   *         {
   *           variant_id: "VAR-CLS-BLK-M8",
   *           item_ownership: "OWNED" | "CONSIGNMENT",
   *           vendor_id: "VND-DZAKI" (wajib jika CONSIGNMENT),
   *           quantity: 1,
   *           actual_price: 270000 (harga jual aktual yang disepakati)
   *         }
   *       ]
   */
  function createSale(saleData) {
    if (!saleData) throw new Error("Data transaksi penjualan wajib diisi.");
    if (!saleData.items || !Array.isArray(saleData.items) || saleData.items.length === 0) {
      throw new Error("Transaksi harus memiliki minimal 1 item produk.");
    }

    return DatabaseHelper.withLock(30000, function() {
      const now = new Date();
      const idempotencyKey = saleData.idempotency_key || "";

      // 1. Cek Idempotency: Jika key sudah pernah diproses, kembalikan transaksi eksisting
      if (idempotencyKey) {
        const existingSales = DatabaseHelper.getAllRows("PENJUALAN", s => String(s.idempotency_key) === String(idempotencyKey));
        if (existingSales.length > 0) {
          const existing = existingSales[0];
          const details = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => String(d.sales_id) === String(existing.sales_id));
          return {
            success: true,
            idempotentReplay: true,
            message: "Transaksi telah tercatat sebelumnya (Idempotency matched).",
            sale: existing,
            details: details
          };
        }
      }

      const salesId = "SLS-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      const txDate = saleData.transaction_date ? new Date(saleData.transaction_date) : now;
      const createdBy = saleData.created_by || "SYSTEM";

      // Validasi Periode Buku: Mencegah transaksi baru pada periode yang sudah CLOSED
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(txDate);
      }

      let grossCustomerPayment = 0;
      let ownedSalesAmount = 0;
      let vendorIncentiveAmount = 0;
      let totalHpp = 0;

      const detailRecordsToInsert = [];
      const executedDepletions = []; // Pelacak untuk Atomic Rollback jika terjadi kegagalan di tengah jalan
      let headerInserted = false;
      const insertedDetailIds = [];

      try {
        // 2. Proses Setiap Item Transaksi
        for (let i = 0; i < saleData.items.length; i++) {
          const item = saleData.items[i];
          const variantId = item.variant_id;
          const qty = parseInt(item.quantity, 10);
          const ownership = (item.item_ownership || "OWNED").toUpperCase();
          const actualPrice = parseFloat(item.actual_price);

          if (!variantId) throw new Error("Item ke-" + (i + 1) + " tidak memiliki variant_id.");
          if (isNaN(qty) || qty <= 0) throw new Error("Kuantitas item ke-" + (i + 1) + " harus lebih dari 0.");
          if (isNaN(actualPrice) || actualPrice < 0) throw new Error("Harga aktual item ke-" + (i + 1) + " tidak valid.");

          if (ownership === "OWNED") {
            // A. Pemotongan Stok Milik Sendiri (FIFO)
            const fifoRes = InventoryService.depleteOwnedStockFIFO(
              salesId,
              variantId,
              qty,
              actualPrice,
              createdBy,
              idempotencyKey ? (idempotencyKey + "_item_" + i) : ""
            );

            executedDepletions.push({
              ownership: "OWNED",
              variant_id: variantId,
              allocations: fifoRes.allocations
            });

            // FIFO mungkin memecah 1 item pesanan menjadi beberapa baris batch (Split-Batch)
            fifoRes.allocations.forEach(alloc => {
              const detailId = "SLSD-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 10000);
              
              detailRecordsToInsert.push({
                sales_detail_id: detailId,
                sales_id: salesId,
                variant_id: variantId,
                item_ownership: "OWNED",
                vendor_id: "",
                batch_id: alloc.batch_id,
                quantity: alloc.quantity,
                selling_price: alloc.selling_price,
                hpp_unit: alloc.hpp_unit,
                vendor_payable_unit: 0,
                crocs_incentive_unit: 0,
                subtotal: alloc.subtotal,
                total_hpp: alloc.total_hpp,
                total_vendor_payable: 0,
                total_crocs_incentive: 0,
                vendor_paid_amount: 0,
                vendor_remaining_payable: 0,
                settlement_status: "NOT_APPLICABLE"
              });

              grossCustomerPayment += alloc.subtotal;
              ownedSalesAmount += alloc.subtotal;
              totalHpp += alloc.total_hpp;
            });

          } else if (ownership === "CONSIGNMENT") {
            // B. Pemotongan Barang Titipan Vendor
            const vendorId = item.vendor_id;
            if (!vendorId) throw new Error("Item titipan vendor ke-" + (i + 1) + " wajib menyertakan vendor_id.");

            // Proteksi Diskon Konsinyasi: Harga bersih setelah diskon tidak boleh lebih rendah dari hak pokok vendor
            const vendorRow = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", vendorId);
            if (vendorRow && vendorRow.fixed_vendor_share) {
              const fixedShare = Number(vendorRow.fixed_vendor_share) || 0;
              if (fixedShare > 0 && actualPrice < fixedShare) {
                throw new Error("Diskon ditolak: Harga bersih item konsinyasi (Rp" + actualPrice.toLocaleString("id-ID") + ") tidak boleh lebih rendah dari hak pokok vendor " + (vendorRow.vendor_name || vendorId) + " (Rp" + fixedShare.toLocaleString("id-ID") + ").");
              }
            }

            // Penentuan izin harga di bawah batas minimum (khusus persetujuan Owner yang sah)
            let allowBelowMinPrice = false;
            if (saleData.owner_override_approval === true || saleData.allow_below_min_price === true || item.owner_override_approval === true) {
              if (saleData.caller_token) {
                if (typeof AuthService !== "undefined" && AuthService.requireOwner) {
                  AuthService.requireOwner(saleData.caller_token);
                }
                allowBelowMinPrice = true;
              } else if (saleData.created_by && (String(saleData.created_by).toLowerCase().includes("owner") || String(saleData.created_by).toLowerCase() === "hafiz" || String(saleData.created_by).toLowerCase() === "harits")) {
                allowBelowMinPrice = true;
              } else {
                throw new Error("Otorisasi harga di bawah batas minimum ditolak: Fitur ini hanya dapat disetujui oleh Owner.");
              }
            }

            const consRes = InventoryService.depleteConsignmentStock(
              salesId,
              variantId,
              vendorId,
              qty,
              actualPrice,
              createdBy,
              idempotencyKey ? (idempotencyKey + "_item_" + i) : "",
              allowBelowMinPrice
            );

            executedDepletions.push({
              ownership: "CONSIGNMENT",
              variant_id: variantId,
              vendor_id: vendorId,
              quantity: qty,
              allocations: consRes.allocations
            });

            consRes.allocations.forEach(alloc => {
              const detailId = "SLSD-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 10000);
              
              detailRecordsToInsert.push({
                sales_detail_id: detailId,
                sales_id: salesId,
                variant_id: variantId,
                item_ownership: "CONSIGNMENT",
                vendor_id: alloc.vendor_id,
                batch_id: alloc.batch_id,
                quantity: alloc.quantity,
                selling_price: alloc.selling_price,
                hpp_unit: 0, // HPP CrocsCircle = 0
                vendor_payable_unit: alloc.vendor_payable_unit,
                crocs_incentive_unit: alloc.crocs_incentive_unit,
                subtotal: alloc.subtotal,
                total_hpp: 0,
                total_vendor_payable: alloc.total_vendor_payable,
                total_crocs_incentive: alloc.total_crocs_incentive,
                vendor_paid_amount: 0,
                vendor_remaining_payable: alloc.total_vendor_payable,
                settlement_status: "UNPAID"
              });

              grossCustomerPayment += alloc.subtotal;
              vendorIncentiveAmount += alloc.total_crocs_incentive;
            });

          } else {
            throw new Error("item_ownership tidak dikenal: " + ownership);
          }
        }

        // 3. Perhitungan Nilai Transaksi & Akuntansi (Opsi A: Titipan Ekspedisi)
        const discount = Math.max(0, parseFloat(saleData.discount) || parseFloat(saleData.cashier_discount) || 0);
        const shippingCharge = Math.max(0, parseFloat(saleData.shipping_charge) || 0);
        const productSubtotal = grossCustomerPayment; // Total kotor produk

        // Diskon mengurangi omzet operasional bersih
        const netOperationalRevenue = Math.max(0, (ownedSalesAmount + vendorIncentiveAmount) - discount);
        const grossProfit = netOperationalRevenue - totalHpp;

        // Total uang riil yang dibayar pelanggan = (productSubtotal - discount) + shippingCharge
        const totalCashCollected = Math.max(0, (productSubtotal - discount) + shippingCharge);

        // 4. Simpan Header PENJUALAN
        headerInserted = false;
        const notesDetail = (saleData.notes || "") + 
          (discount > 0 ? " | Diskon: Rp" + discount.toLocaleString("id-ID") : "") + 
          (shippingCharge > 0 ? " | Titipan Ongkir: Rp" + shippingCharge.toLocaleString("id-ID") : "");

        const saleHeader = {
          sales_id: salesId,
          transaction_date: txDate,
          sales_channel: saleData.sales_channel || "OFFLINE_EVENT",
          sales_type: saleData.sales_type || "READY_STOCK",
          customer_name: saleData.customer_name || "Pelanggan Langsung",
          payment_method: saleData.payment_method || "CASH",
          payment_status: "LUNAS",
          gross_customer_payment: totalCashCollected,
          owned_sales_amount: ownedSalesAmount,
          vendor_incentive_amount: vendorIncentiveAmount,
          net_operational_revenue: netOperationalRevenue,
          total_hpp: totalHpp,
          gross_profit: grossProfit,
          idempotency_key: idempotencyKey,
          notes: notesDetail,
          created_by: createdBy,
          created_at: now
        };
        DatabaseHelper.insertRow("PENJUALAN", saleHeader);
        headerInserted = true;

        // 5. Simpan Seluruh Baris DETAIL_PENJUALAN
        detailRecordsToInsert.forEach(d => {
          DatabaseHelper.insertRow("DETAIL_PENJUALAN", d);
          insertedDetailIds.push(d.sales_detail_id);
        });

        DatabaseHelper.logActivity(
          createdBy,
          "CREATE_SALE",
          "SALES",
          salesId,
          "Penjualan " + salesId + " (" + detailRecordsToInsert.length + " baris). Bruto: " + totalCashCollected + ", Net Rev: " + netOperationalRevenue + ", Laba Kotor: " + grossProfit
        );

        return {
          success: true,
          salesId: salesId,
          sales_id: salesId,
          header: saleHeader,
          sale: saleHeader,
          details: detailRecordsToInsert,
          financial_breakdown: {
            product_subtotal: productSubtotal,
            discount: discount,
            shipping_charge: shippingCharge,
            grand_total: totalCashCollected,
            net_operational_revenue: netOperationalRevenue,
            total_hpp: totalHpp,
            gross_profit: grossProfit
          }
        };

      } catch (err) {
        // ROLLBACK TRANSAKSI: Batalkan seluruh stok yang sudah sempat terpotong sebelum error terjadi
        executedDepletions.forEach(dep => {
          try {
            if (dep.ownership === "OWNED") {
              dep.allocations.forEach(alloc => {
                InventoryService.returnOwnedStockToBatch(salesId, dep.variant_id, alloc.batch_id, alloc.quantity, "Rollback error transaksi penjualan", createdBy);
              });
            } else if (dep.ownership === "CONSIGNMENT") {
              if (dep.allocations && dep.allocations.length > 0) {
                dep.allocations.forEach(alloc => {
                  InventoryService.returnConsignmentStock(salesId, dep.variant_id, dep.vendor_id, alloc.quantity, "Rollback error transaksi penjualan", createdBy, alloc.batch_id);
                });
              } else {
                InventoryService.returnConsignmentStock(salesId, dep.variant_id, dep.vendor_id, dep.quantity, "Rollback error transaksi penjualan", createdBy);
              }
            }
          } catch (rbErr) {
            Logger.log("Gagal rollback stok penjualan: " + rbErr.message);
          }
        });

        // Bersihkan detail atau header jika sempat tersimpan sebelum error terjadi
        if (typeof insertedDetailIds !== "undefined") {
          insertedDetailIds.forEach(id => {
            try { DatabaseHelper.deleteRowByPk("DETAIL_PENJUALAN", "sales_detail_id", id); } catch (e) {}
          });
        }
        if (typeof headerInserted !== "undefined" && headerInserted) {
          try { DatabaseHelper.deleteRowByPk("PENJUALAN", "sales_id", salesId); } catch (e) {}
        }

        throw new Error("Transaksi penjualan gagal dan telah dibatalkan secara utuh: " + err.message);
      }
    });
  }

  /**
   * Mengambil data transaksi penjualan beserta detail barisnya
   */
  function getSaleById(salesId) {
    if (!salesId) throw new Error("salesId wajib diisi.");
    const header = DatabaseHelper.getRowByPk("PENJUALAN", "sales_id", salesId);
    if (!header) return null;
    const details = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => String(d.sales_id) === String(salesId));
    return {
      header: header,
      details: details
    };
  }

  /**
   * Retur Item Penjualan
   * Mengembalikan stok ke batch asal (OWNED) atau ke vendor (CONSIGNMENT)
   * dan membalik kewajiban finansial.
   */
  /**
   * Retur Item Penjualan
   * Mengembalikan stok ke batch asal (OWNED) atau ke vendor (CONSIGNMENT)
   * dan mencatat penyesuaian finansial pada periode retur (RETUR_PENJUALAN).
   * 
   * @param {string} salesId
   * @param {string} salesDetailId
   * @param {number} quantityToReturn
   * @param {string} reason
   * @param {string} createdBy
   * @param {Date|string} [returnDateInput] Tanggal transaksi retur (default: now)
   * @param {string} [idempotencyKey] Kunci idempotensi opsional untuk mencegah retur ganda
   */
  function returnSaleItem(salesId, salesDetailId, quantityToReturn, reason, createdBy, returnDateInput, idempotencyKey) {
    return DatabaseHelper.withLock(30000, function() {
      // 0. Cek Idempotency: Jika kunci retur sudah pernah diproses, kembalikan hasil sebelumnya
      if (idempotencyKey) {
        const existingReturn = DatabaseHelper.getAllRows("RETUR_PENJUALAN", r => String(r.reference_id) === String(idempotencyKey));
        if (existingReturn.length > 0) {
          return {
            success: true,
            idempotentReplay: true,
            message: "Permintaan retur telah diproses sebelumnya (Idempotency matched).",
            return_id: existingReturn[0].return_id
          };
        }
      }

      const qtyRet = parseInt(quantityToReturn, 10);
      if (isNaN(qtyRet) || qtyRet <= 0) throw new Error("Kuantitas retur harus positif.");
      if (!reason || reason.trim().length < 5) throw new Error("Alasan retur wajib diisi minimal 5 karakter.");

      const detail = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", salesDetailId);
      if (!detail) throw new Error("Detail penjualan " + salesDetailId + " tidak ditemukan.");
      if (String(detail.sales_id) !== String(salesId)) {
        throw new Error("Detail penjualan tidak sesuai dengan salesId.");
      }

      const now = new Date();
      const returnDate = returnDateInput ? new Date(returnDateInput) : now;

      // Validasi Periode Buku: Memeriksa apakah periode tanggal RETUR masih OPEN
      // Catatan: Retur atas penjualan bulan lalu yang sudah CLOSED tetap diizinkan
      // selama periode bulan retur saat ini masih OPEN!
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(returnDate);
      }

      // Validasi Akumulasi Kuantitas Retur:
      // Tidak boleh mengembalikan lebih dari kuantitas yang terjual dikurangi kuantitas yang sudah pernah diretur
      const existingReturns = DatabaseHelper.getAllRows("RETUR_PENJUALAN", r => String(r.sales_detail_id) === String(salesDetailId));
      const alreadyReturnedQty = existingReturns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
      const currentDetailQty = Number(detail.quantity) || 0;
      const unreturnedQty = currentDetailQty - alreadyReturnedQty;

      if (unreturnedQty <= 0) {
        throw new Error("Seluruh kuantitas pada item penjualan ini (" + currentDetailQty + " unit) sudah pernah diretur sebelumnya.");
      }
      if (qtyRet > unreturnedQty) {
        throw new Error("Kuantitas retur (" + qtyRet + ") melebihi sisa kuantitas yang dapat diretur (" + unreturnedQty + " dari " + currentDetailQty + " terjual).");
      }

      const ownership = detail.item_ownership;
      const variantId = detail.variant_id;
      const unitSellingPrice = Number(detail.selling_price) || 0;
      const refundAmount = qtyRet * unitSellingPrice;
      let hppReversal = 0;
      let crocsIncentiveReversal = 0;
      let vendorPayableReversal = 0;

      if (ownership === "OWNED") {
        hppReversal = qtyRet * (Number(detail.hpp_unit) || 0);
        // Kembalikan stok fisik & batch remaining_qty
        InventoryService.returnOwnedStockToBatch(salesId, variantId, detail.batch_id, qtyRet, reason, createdBy);

      } else if (ownership === "CONSIGNMENT") {
        crocsIncentiveReversal = qtyRet * (Number(detail.crocs_incentive_unit) || 0);
        vendorPayableReversal = qtyRet * (Number(detail.vendor_payable_unit) || 0);

        // Kembalikan stok konsinyasi fisik dan pulihkan lot konsinyasi spesifik
        InventoryService.returnConsignmentStock(salesId, variantId, detail.vendor_id, qtyRet, reason, createdBy, detail.batch_id);

        // Penyesuaian Finansial Kewajiban & Piutang Vendor:
        const currentPaid = Number(detail.vendor_paid_amount) || 0;
        const currentTotalPayable = Number(detail.total_vendor_payable) || 0;

        const newTotalPayable = Math.max(0, currentTotalPayable - vendorPayableReversal);
        const newRemainingPayable = newTotalPayable - currentPaid;

        let newSettlementStatus = "UNPAID";
        if (currentPaid > 0) {
          if (newRemainingPayable < 0) {
            newSettlementStatus = "OVERPAID_CLAIM"; // Piutang Vendor (Kelebihan bayar)
          } else if (newRemainingPayable === 0) {
            newSettlementStatus = "PAID";
          } else {
            newSettlementStatus = "PARTIAL";
          }
        } else {
          newSettlementStatus = newRemainingPayable === 0 ? "CANCELLED" : "UNPAID";
        }

        DatabaseHelper.updateRowByPk("DETAIL_PENJUALAN", "sales_detail_id", salesDetailId, {
          total_vendor_payable: newTotalPayable,
          vendor_remaining_payable: newRemainingPayable,
          settlement_status: newSettlementStatus
        });

        if (newRemainingPayable < 0) {
          const claimAmount = Math.abs(newRemainingPayable);
          const claimId = "CLM-" + Utilities.formatDate(returnDate, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
          DatabaseHelper.insertRow("KLAIM_VENDOR", {
            claim_id: claimId,
            claim_date: returnDate,
            vendor_id: detail.vendor_id,
            source_sales_detail_id: salesDetailId,
            source_sales_id: salesId,
            claim_amount: claimAmount,
            compensated_amount: 0,
            remaining_claim: claimAmount,
            claim_status: "ACTIVE",
            notes: "Klaim piutang retur dari penjualan " + salesId + " (" + qtyRet + " unit). Alasan: " + reason,
            created_by: createdBy,
            created_at: now
          });

          DatabaseHelper.logActivity(
            createdBy,
            "VENDOR_RECEIVABLE_CLAIM",
            "VENDOR",
            detail.vendor_id,
            "Retur barang konsinyasi menghasilkan PIUTANG VENDOR sebesar Rp" + claimAmount + " (Claim ID: " + claimId + ") pada vendor " + detail.vendor_id + ". Nominal ini akan memotong transfer settlement berikutnya."
          );
        }
      }

      // Catat Baris Resmi di RETUR_PENJUALAN
      const returnId = "RET-" + Utilities.formatDate(returnDate, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      DatabaseHelper.insertRow("RETUR_PENJUALAN", {
        return_id: returnId,
        return_date: returnDate,
        sales_id: salesId,
        sales_detail_id: salesDetailId,
        variant_id: variantId,
        item_ownership: ownership,
        vendor_id: detail.vendor_id || "",
        batch_id: detail.batch_id || "",
        reference_id: idempotencyKey || returnId,
        quantity: qtyRet,
        refund_amount: refundAmount,
        hpp_reversal: hppReversal,
        crocs_incentive_reversal: crocsIncentiveReversal,
        vendor_payable_reversal: vendorPayableReversal,
        reason: reason,
        created_by: createdBy,
        created_at: now
      });

      // Catat mutasi log
      DatabaseHelper.logActivity(
        createdBy,
        "RETURN_SALE_ITEM",
        "SALES",
        salesDetailId,
        "Retur " + qtyRet + " unit pada " + salesDetailId + ". Alasan: " + reason
      );

      return {
        success: true,
        return_id: returnId,
        returnId: returnId,
        salesId: salesId,
        salesDetailId: salesDetailId,
        returnedQty: qtyRet,
        ownership: ownership
      };
    });
  }

  /**
   * Mengambil Riwayat Transaksi Penjualan Terfilter
   * 
   * @param {Object} [filters] { startDate, endDate, sales_channel, payment_method, search }
   * @param {string} [callerToken] Token otentikasi untuk pengecekan RBAC (Owner vs Admin)
   * @return {Object} { success: boolean, count: number, sales: Array }
   */
  function getSalesList(filters, callerToken) {
    filters = filters || {};
    
    // RBAC Check: Hanya Owner yang dapat melihat kolom HPP dan Gross Profit
    let isOwner = false;
    if (typeof AuthService !== "undefined" && callerToken) {
      try {
        const session = AuthService.validateSession(callerToken);
        if (session.valid && session.user && session.user.role === "OWNER") {
          isOwner = true;
        }
      } catch (e) {}
    }

    const allSales = DatabaseHelper.getAllRows("PENJUALAN");
    const allDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN");

    // Map detail count per sales_id
    const detailsMap = {};
    allDetails.forEach(d => {
      if (!detailsMap[d.sales_id]) detailsMap[d.sales_id] = [];
      detailsMap[d.sales_id].push(d);
    });

    const filtered = allSales.filter(s => {
      if (!s.sales_id) return false;

      // Filter Rentang Tanggal
      if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        const tx = s.transaction_date ? new Date(s.transaction_date).getTime() : 0;
        if (tx < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate).getTime() + (24 * 3600 * 1000 - 1);
        const tx = s.transaction_date ? new Date(s.transaction_date).getTime() : 0;
        if (tx > end) return false;
      }

      // Filter Sales Channel
      if (filters.sales_channel && filters.sales_channel !== "ALL") {
        if (String(s.sales_channel).toUpperCase() !== String(filters.sales_channel).toUpperCase()) return false;
      }

      // Filter Payment Method
      if (filters.payment_method && filters.payment_method !== "ALL") {
        if (String(s.payment_method).toUpperCase() !== String(filters.payment_method).toUpperCase()) return false;
      }

      // Search Query
      if (filters.search && filters.search.trim() !== "") {
        const q = filters.search.toLowerCase().trim();
        const matchId = String(s.sales_id || "").toLowerCase().includes(q);
        const matchCust = String(s.customer_name || "").toLowerCase().includes(q);
        const matchNotes = String(s.notes || "").toLowerCase().includes(q);
        if (!matchId && !matchCust && !matchNotes) return false;
      }

      return true;
    });

    // Urutkan transaksi terbaru di paling atas
    filtered.sort((a, b) => {
      const dateA = a.transaction_date ? new Date(a.transaction_date).getTime() : 0;
      const dateB = b.transaction_date ? new Date(b.transaction_date).getTime() : 0;
      return dateB - dateA;
    });

    // Sanitasi data jika bukan Owner
    const sanitized = filtered.map(s => {
      const items = detailsMap[s.sales_id] || [];
      const res = {
        sales_id: s.sales_id,
        transaction_date: s.transaction_date,
        sales_channel: s.sales_channel,
        sales_type: s.sales_type,
        customer_name: s.customer_name,
        payment_method: s.payment_method,
        payment_status: s.payment_status,
        gross_customer_payment: Number(s.gross_customer_payment) || 0,
        owned_sales_amount: Number(s.owned_sales_amount) || 0,
        vendor_incentive_amount: Number(s.vendor_incentive_amount) || 0,
        net_operational_revenue: Number(s.net_operational_revenue) || 0,
        notes: s.notes || "",
        created_by: s.created_by,
        item_count: items.length
      };

      if (isOwner) {
        res.total_hpp = Number(s.total_hpp) || 0;
        res.gross_profit = Number(s.gross_profit) || 0;
      } else {
        res.total_hpp = null;
        res.gross_profit = null;
      }

      return res;
    });

    return {
      success: true,
      count: sanitized.length,
      sales: sanitized
    };
  }

  return {
    createSale: createSale,
    recordSalesTransaction: createSale,
    getSaleById: getSaleById,
    returnSaleItem: returnSaleItem,
    getSalesList: getSalesList
  };
})();
