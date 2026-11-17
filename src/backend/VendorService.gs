/**
 * CROCSCIRCLE.ID — VENDOR MANAGEMENT & SETTLEMENT ENGINE
 * Version: 1.2.0
 * 
 * Modul Pengelolaan Vendor, Perjanjian Kerja Sama, Kewajiban Konsinyasi & Settlement:
 * 1. Manajemen Master Vendor (Create, Update, Deactivate).
 * 2. Perjanjian Kerja Sama Independen: SELLER_FOR_VENDOR vs BUY_STOCK_FROM_VENDOR.
 * 3. Pemantauan Saldo Kewajiban (Restricted Cash) & Saldo Piutang/Klaim Retur (KLAIM_VENDOR).
 * 4. Mesin Settlement Fleksibel:
 *    - Settlement satu transaksi atau gabungan multi-transaksi dalam 1 transfer bank.
 *    - Pembayaran bertahap / parsial.
 *    - Kompensasi otomatis klaim piutang retur (OVERPAID_CLAIM) tanpa dobel potong.
 *    - Pencegahan pembayaran ganda atau membayar transaksi yang sudah dibatalkan.
 * 5. Dashboard & Laporan Vendor lengkap dengan jejak audit.
 * 6. Perlindungan LockService (30s) dan validasi hak akses RBAC Owner.
 */

const VendorService = (function() {

  /**
   * Membuat Vendor Baru
   */
  function createVendor(vendorData, callerToken) {
    AuthService.requireOwner(callerToken);
    if (!vendorData) throw new Error("Data vendor wajib diisi.");
    if (!vendorData.vendor_id || vendorData.vendor_id.trim() === "") {
      throw new Error("vendor_id wajib diisi.");
    }
    if (!vendorData.vendor_name || vendorData.vendor_name.trim() === "") {
      throw new Error("vendor_name wajib diisi.");
    }

    const cleanId = vendorData.vendor_id.trim().toUpperCase();
    const existing = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", cleanId);
    if (existing) {
      throw new Error("Vendor dengan ID '" + cleanId + "' sudah terdaftar.");
    }

    const now = new Date();
    const newVendor = {
      vendor_id: cleanId,
      vendor_name: vendorData.vendor_name.trim(),
      contact_person: vendorData.contact_person || "-",
      phone: vendorData.phone || "-",
      address: vendorData.address || "-",
      cooperation_type: vendorData.cooperation_type || "SELLER_FOR_VENDOR",
      consignment_fee_type: vendorData.consignment_fee_type || "FIXED_PER_UNIT",
      default_consignment_fee: Number(vendorData.default_consignment_fee) || 10000,
      purchase_incentive_default: Number(vendorData.purchase_incentive_default) || 0,
      fixed_vendor_share: Number(vendorData.fixed_vendor_share) || 0,
      min_selling_price: Number(vendorData.min_selling_price) || 0,
      status: "ACTIVE",
      notes: vendorData.notes || "",
      created_at: now,
      updated_at: now
    };

    DatabaseHelper.insertRow("VENDORS", newVendor);
    DatabaseHelper.logActivity("OWNER", "CREATE_VENDOR", "VENDOR", cleanId, "Vendor baru dibuat: " + newVendor.vendor_name);
    return { success: true, vendor: newVendor };
  }

  /**
   * Mengubah Data Vendor
   */
  function updateVendor(vendorId, updateData, callerToken) {
    AuthService.requireOwner(callerToken);
    if (!vendorId) throw new Error("vendorId wajib diisi.");
    const existing = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", vendorId);
    if (!existing) throw new Error("Vendor '" + vendorId + "' tidak ditemukan.");

    const allowedFields = [
      "vendor_name", "contact_person", "phone", "address",
      "cooperation_type", "consignment_fee_type", "default_consignment_fee",
      "purchase_incentive_default", "fixed_vendor_share", "min_selling_price",
      "status", "notes"
    ];

    const updates = { updated_at: new Date() };
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    const updated = DatabaseHelper.updateRowByPk("VENDORS", "vendor_id", vendorId, updates);
    DatabaseHelper.logActivity("OWNER", "UPDATE_VENDOR", "VENDOR", vendorId, "Data vendor '" + vendorId + "' diperbarui.");
    return { success: true, vendor: updated };
  }

  /**
   * Menonaktifkan Vendor (Soft Delete)
   */
  function deactivateVendor(vendorId, callerToken) {
    AuthService.requireOwner(callerToken);
    return updateVendor(vendorId, { status: "INACTIVE" }, callerToken);
  }

  /**
   * Mengambil Daftar Seluruh Vendor
   */
  function getVendorList(statusFilter) {
    return DatabaseHelper.getAllRows("VENDORS", v => {
      if (!statusFilter) return true;
      return String(v.status).toUpperCase() === String(statusFilter).toUpperCase();
    });
  }

  /**
   * Mengambil Detail Profil Vendor
   */
  function getVendorDetail(vendorId) {
    if (!vendorId) throw new Error("vendorId wajib diisi.");
    const v = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", vendorId);
    if (!v) return null;
    return v;
  }

  /**
   * Mengambil Saldo Kewajiban Hutang Vendor yang Belum Disetor (Restricted Cash)
   */
  function getVendorOutstandingPayables(vendorId) {
    if (!vendorId) throw new Error("vendorId wajib diisi.");

    const allItems = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => {
      return String(d.vendor_id) === String(vendorId) &&
             d.item_ownership === "CONSIGNMENT" &&
             d.settlement_status !== "PAID" &&
             d.settlement_status !== "CANCELLED" &&
             Number(d.vendor_remaining_payable) > 0;
    });

    const totalGrossPayable = allItems.reduce((sum, item) => sum + (Number(item.vendor_remaining_payable) || 0), 0);
    return {
      vendor_id: vendorId,
      total_gross_payable: totalGrossPayable,
      item_count: allItems.length,
      items: allItems
    };
  }

  /**
   * Mengambil Saldo Klaim / Piutang Retur kepada Vendor (KLAIM_VENDOR)
   */
  function getVendorActiveClaims(vendorId) {
    if (!vendorId) throw new Error("vendorId wajib diisi.");

    const activeClaims = DatabaseHelper.getAllRows("KLAIM_VENDOR", c => {
      return String(c.vendor_id) === String(vendorId) &&
             (c.claim_status === "ACTIVE" || c.claim_status === "PARTIALLY_COMPENSATED") &&
             Number(c.remaining_claim) > 0;
    });

    const totalClaims = activeClaims.reduce((sum, c) => sum + (Number(c.remaining_claim) || 0), 0);
    return {
      vendor_id: vendorId,
      total_active_claims: totalClaims,
      claim_count: activeClaims.length,
      claims: activeClaims
    };
  }

  /**
   * Mengambil Saldo Bersih yang Harus Ditransfer (Gross Payable - Active Claims)
   */
  function getVendorNetPayableSummary(vendorId) {
    const payables = getVendorOutstandingPayables(vendorId);
    const claims = getVendorActiveClaims(vendorId);

    const gross = payables.total_gross_payable;
    const claimTotal = claims.total_active_claims;
    const netPayout = Math.max(0, gross - claimTotal);
    const netReceivable = Math.max(0, claimTotal - gross);

    return {
      vendor_id: vendorId,
      total_gross_payable: gross,
      total_active_claims: claimTotal,
      net_payout_due: netPayout,
      net_vendor_receivable: netReceivable, // Jika klaim retur lebih besar dari hutang penjualan baru
      unpaid_sales_count: payables.item_count,
      active_claim_count: claims.claim_count
    };
  }

  /**
   * Eksekusi Pembayaran / Pelunasan Kewajiban Vendor (Settlement)
   * 
   * @param {Object} settlementData
   *   - vendor_id: string
   *   - settlement_date: Date|string (default: now)
   *   - payment_method: string ('TRANSFER_BCA', 'QRIS', 'CASH')
   *   - bank_reference: string (No resi / ref transfer)
   *   - receipt_url: string (Link bukti transfer)
   *   - notes: string
   *   - allocations: Array of { sales_detail_id, amount_to_pay } (opsional, jika kosong dialokasikan FIFO)
   *   - claim_ids_to_compensate: Array of string (opsional, jika kosong dikompensasikan otomatis dari klaim aktif tertua)
   *   - max_net_transfer: number (opsional, batas transfer yang dilakukan)
   */
  function executeSettlement(settlementData, callerToken) {
    AuthService.requireOwner(callerToken);
    if (!settlementData) throw new Error("Data settlement wajib diisi.");
    const vendorId = settlementData.vendor_id;
    if (!vendorId) throw new Error("vendor_id wajib diisi.");

    return DatabaseHelper.withLock(30000, function() {
      const vendor = DatabaseHelper.getRowByPk("VENDORS", "vendor_id", vendorId);
      if (!vendor) throw new Error("Vendor '" + vendorId + "' tidak ditemukan.");

      const now = new Date();
      const stlDate = settlementData.settlement_date ? new Date(settlementData.settlement_date) : now;
      const settlementId = "STL-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);

      // 1. Tentukan Item Kewajiban yang Akan Diselesaikan
      let itemsToPay = [];
      if (settlementData.allocations && Array.isArray(settlementData.allocations) && settlementData.allocations.length > 0) {
        // Alokasi manual spesifik yang diminta
        settlementData.allocations.forEach(alloc => {
          const detail = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", alloc.sales_detail_id);
          if (!detail) throw new Error("Item penjualan " + alloc.sales_detail_id + " tidak ditemukan.");
          if (String(detail.vendor_id) !== String(vendorId)) {
            throw new Error("Item penjualan " + alloc.sales_detail_id + " bukan milik vendor " + vendorId);
          }
          if (detail.settlement_status === "PAID") {
            throw new Error("Item penjualan " + alloc.sales_detail_id + " sudah LUNAS sebelumnya.");
          }
          if (detail.settlement_status === "CANCELLED") {
            throw new Error("Item penjualan " + alloc.sales_detail_id + " telah dibatalkan/diretur.");
          }

          const rem = Number(detail.vendor_remaining_payable) || 0;
          const payAmount = Number(alloc.amount_to_pay) || rem;
          if (payAmount > rem) {
            throw new Error("Alokasi pembayaran Rp" + payAmount + " melebihi sisa hutang Rp" + rem + " pada item " + alloc.sales_detail_id);
          }

          itemsToPay.push({
            sales_detail_id: alloc.sales_detail_id,
            pay_amount: payAmount,
            current_detail: detail
          });
        });
      } else {
        // Alokasi Otomatis: Ambil seluruh item kewajiban yang belum lunas
        const outstanding = getVendorOutstandingPayables(vendorId);
        if (outstanding.items.length === 0) {
          throw new Error("Tidak ada kewajiban penjualan konsinyasi yang belum dibayar untuk vendor " + vendorId);
        }

        let transferLimit = settlementData.max_net_transfer !== undefined ? Number(settlementData.max_net_transfer) : Infinity;
        outstanding.items.forEach(item => {
          if (transferLimit <= 0) return;
          const rem = Number(item.vendor_remaining_payable);
          const take = Math.min(rem, transferLimit);
          itemsToPay.push({
            sales_detail_id: item.sales_detail_id,
            pay_amount: take,
            current_detail: item
          });
          if (transferLimit !== Infinity) transferLimit -= take;
        });
      }

      const totalGrossPayable = itemsToPay.reduce((sum, it) => sum + it.pay_amount, 0);
      if (totalGrossPayable <= 0) {
        throw new Error("Total nilai kewajiban kotor yang diselesaikan harus lebih dari 0.");
      }

      // 2. Evaluasi Klaim Piutang Retur untuk Dikompensasikan
      const activeClaimsData = getVendorActiveClaims(vendorId);
      let claimsToCompensate = [];
      let totalClaimsDeducted = 0;

      if (activeClaimsData.claims.length > 0) {
        let maxCompensable = totalGrossPayable; // Klaim tidak boleh memotong lebih dari total gross payable

        if (settlementData.claim_ids_to_compensate && Array.isArray(settlementData.claim_ids_to_compensate)) {
          // Kompensasi klaim yang dipilih spesifik
          settlementData.claim_ids_to_compensate.forEach(cId => {
            const claim = DatabaseHelper.getRowByPk("KLAIM_VENDOR", "claim_id", cId);
            if (!claim) throw new Error("Klaim ID " + cId + " tidak ditemukan.");
            if (claim.claim_status === "FULLY_COMPENSATED") throw new Error("Klaim ID " + cId + " sudah pernah dikompensasikan.");
            
            const remClaim = Number(claim.remaining_claim) || 0;
            const takeClaim = Math.min(remClaim, maxCompensable);
            if (takeClaim > 0) {
              claimsToCompensate.push({ claim_id: cId, claim_record: claim, deduct_amount: takeClaim });
              totalClaimsDeducted += takeClaim;
              maxCompensable -= takeClaim;
            }
          });
        } else {
          // Kompensasi otomatis klaim tertua
          activeClaimsData.claims.forEach(claim => {
            if (maxCompensable <= 0) return;
            const remClaim = Number(claim.remaining_claim) || 0;
            const takeClaim = Math.min(remClaim, maxCompensable);
            if (takeClaim > 0) {
              claimsToCompensate.push({ claim_id: claim.claim_id, claim_record: claim, deduct_amount: takeClaim });
              totalClaimsDeducted += takeClaim;
              maxCompensable -= takeClaim;
            }
          });
        }
      }

      // 3. Hitung Jumlah Transfer Bersih (Net Payout)
      const totalNetPayout = Math.max(0, totalGrossPayable - totalClaimsDeducted);

      // 4. Eksekusi Penyimpanan Header SETTLEMENT_VENDOR
      const settlementHeader = {
        settlement_id: settlementId,
        settlement_date: stlDate,
        vendor_id: vendorId,
        total_gross_payable: totalGrossPayable,
        total_claims_deducted: totalClaimsDeducted,
        total_net_payout: totalNetPayout,
        payment_method: settlementData.payment_method || "TRANSFER_BCA",
        bank_reference: settlementData.bank_reference || "-",
        receipt_url: settlementData.receipt_url || "",
        notes: (settlementData.notes || "") + (totalClaimsDeducted > 0 ? " [Dipotong klaim retur Rp" + totalClaimsDeducted + "]" : ""),
        created_by: "OWNER",
        created_at: now
      };
      DatabaseHelper.insertRow("SETTLEMENT_VENDOR", settlementHeader);

      // 5. Eksekusi DETAIL_SETTLEMENT_VENDOR untuk Pembayaran Penjualan
      const detailRecords = [];
      itemsToPay.forEach(item => {
        const detailStlId = "STLD-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 10000);
        const detailStlRecord = {
          settlement_detail_id: detailStlId,
          settlement_id: settlementId,
          allocation_type: "PAYABLE_PAYMENT",
          sales_detail_id: item.sales_detail_id,
          claim_id: "",
          amount_allocated: item.pay_amount,
          notes: "Pelunasan kewajiban penjualan " + item.sales_detail_id
        };
        DatabaseHelper.insertRow("DETAIL_SETTLEMENT_VENDOR", detailStlRecord);
        detailRecords.push(detailStlRecord);

        // Update status di DETAIL_PENJUALAN
        const curPaid = Number(item.current_detail.vendor_paid_amount) || 0;
        const curRem = Number(item.current_detail.vendor_remaining_payable) || 0;
        const newPaid = curPaid + item.pay_amount;
        const newRem = Math.max(0, curRem - item.pay_amount);
        const newStatus = newRem === 0 ? "PAID" : "PARTIAL";

        DatabaseHelper.updateRowByPk("DETAIL_PENJUALAN", "sales_detail_id", item.sales_detail_id, {
          vendor_paid_amount: newPaid,
          vendor_remaining_payable: newRem,
          settlement_status: newStatus
        });
      });

      // 6. Eksekusi DETAIL_SETTLEMENT_VENDOR untuk Kompensasi Klaim Retur
      claimsToCompensate.forEach(comp => {
        const detailStlId = "STLD-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 10000);
        const detailStlRecord = {
          settlement_detail_id: detailStlId,
          settlement_id: settlementId,
          allocation_type: "CLAIM_COMPENSATION",
          sales_detail_id: "",
          claim_id: comp.claim_id,
          amount_allocated: comp.deduct_amount,
          notes: "Kompensasi klaim piutang retur " + comp.claim_id
        };
        DatabaseHelper.insertRow("DETAIL_SETTLEMENT_VENDOR", detailStlRecord);
        detailRecords.push(detailStlRecord);

        // Update status di KLAIM_VENDOR
        const curComp = Number(comp.claim_record.compensated_amount) || 0;
        const curRem = Number(comp.claim_record.remaining_claim) || 0;
        const newComp = curComp + comp.deduct_amount;
        const newRem = Math.max(0, curRem - comp.deduct_amount);
        const newStatus = newRem === 0 ? "FULLY_COMPENSATED" : "PARTIALLY_COMPENSATED";

        DatabaseHelper.updateRowByPk("KLAIM_VENDOR", "claim_id", comp.claim_id, {
          compensated_amount: newComp,
          remaining_claim: newRem,
          claim_status: newStatus
        });
      });

      DatabaseHelper.logActivity(
        "OWNER",
        "EXECUTE_SETTLEMENT",
        "VENDOR",
        settlementId,
        "Settlement " + settlementId + " ke vendor " + vendorId + ". Gross: Rp" + totalGrossPayable + ", Potongan Klaim: Rp" + totalClaimsDeducted + ", Transfer Bersih: Rp" + totalNetPayout
      );

      return {
        success: true,
        settlementId: settlementId,
        header: settlementHeader,
        details: detailRecords,
        settled_items_count: itemsToPay.length,
        compensated_claims_count: claimsToCompensate.length
      };
    });
  }

  /**
   * Mengambil Riwayat Settlement Vendor
   */
  function getVendorSettlementHistory(vendorId) {
    if (!vendorId) throw new Error("vendorId wajib diisi.");
    const settlements = DatabaseHelper.getAllRows("SETTLEMENT_VENDOR", s => String(s.vendor_id) === String(vendorId));
    return settlements;
  }

  /**
   * Laporan Ringkasan Dashboard Vendor (Komprehensif & Terisolasi dari Stok Sendiri)
   */
  function getVendorDashboardSummary(vendorId, startDate, endDate) {
    if (!vendorId) throw new Error("vendorId wajib diisi.");
    const vendor = getVendorDetail(vendorId);
    if (!vendor) throw new Error("Vendor '" + vendorId + "' tidak ditemukan.");

    const payablesData = getVendorOutstandingPayables(vendorId);
    const claimsData = getVendorActiveClaims(vendorId);
    const settlements = getVendorSettlementHistory(vendorId);

    // Hitung seluruh item konsinyasi terjual (baik yang sudah dibayar maupun belum)
    const allConsignmentSold = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => {
      return String(d.vendor_id) === String(vendorId) && d.item_ownership === "CONSIGNMENT";
    });

    const totalSoldUnits = allConsignmentSold.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
    const totalGrossEarned = allConsignmentSold.reduce((sum, d) => sum + (Number(d.total_vendor_payable) || 0), 0);
    const totalPaidSoFar = settlements.reduce((sum, s) => sum + (Number(s.total_gross_payable) || 0), 0);
    const totalNetCashPaid = settlements.reduce((sum, s) => sum + (Number(s.total_net_payout) || 0), 0);

    return {
      vendor: vendor,
      consignment_summary: {
        total_units_sold: totalSoldUnits,
        total_gross_earned: totalGrossEarned,
        total_paid_gross: totalPaidSoFar,
        total_net_cash_transferred: totalNetCashPaid,
        outstanding_payable: payablesData.total_gross_payable,
        active_receivable_claims: claimsData.total_active_claims,
        net_amount_due: Math.max(0, payablesData.total_gross_payable - claimsData.total_active_claims)
      },
      unpaid_items: payablesData.items,
      active_claims: claimsData.claims,
      settlement_history: settlements
    };
  }

  return {
    createVendor: createVendor,
    updateVendor: updateVendor,
    deactivateVendor: deactivateVendor,
    getVendorList: getVendorList,
    getVendorDetail: getVendorDetail,
    getVendorOutstandingPayables: getVendorOutstandingPayables,
    getVendorActiveClaims: getVendorActiveClaims,
    getVendorNetPayableSummary: getVendorNetPayableSummary,
    executeSettlement: executeSettlement,
    getVendorSettlementHistory: getVendorSettlementHistory,
    getVendorDashboardSummary: getVendorDashboardSummary
  };
})();
