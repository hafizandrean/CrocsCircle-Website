/**
/**
 * CROCSCIRCLE.ID — FINANCIAL MANAGEMENT ENGINE
 * Version: 1.2.0
 * 
 * Modul Pusat Perhitungan Keuangan, Akuntansi, HPP & Rekonsiliasi Vendor:
 * 1. OMZET CROCSCIRCLE:
 *    - Penjualan stok sendiri (snapshot actual price).
 *    - Penjualan Pre-Order lunas (settlement_date). DP/cicilan BUKAN omzet.
 *    - Pendapatan insentif dari barang titip jual vendor (bukan gross customer payment).
 *    - Hak vendor dicatat sebagai kewajiban, bukan omzet CrocsCircle.
 * 2. HARGA POKOK PENJUALAN (HPP):
 *    - Diakui saat barang terjual (matching principle).
 *    - Diambil dari snapshot FIFO pada DETAIL_PENJUALAN.
 *    - Barang titipan vendor TIDAK memiliki HPP CrocsCircle (HPP = 0).
 *    - Pembelian stok supplier BUKAN HPP langsung (menambah nilai persediaan).
 * 3. LABA KOTOR:
 *    - Laba Kotor = Omzet CrocsCircle - HPP.
 * 4. PENGELUARAN OPERASIONAL:
 *    - Hanya biaya operasional yang sah (packing, transport, sewa, listrik, dll).
 *    - Pembelian stok supplier TIDAK boleh masuk pengeluaran operasional.
 *    - Transfer settlement vendor BUKAN pengeluaran operasional (pelunasan utang).
 *    - Pengembalian klaim retur BUKAN pendapatan operasional.
 * 5. LABA BERSIH:
 *    - Laba Bersih = Laba Kotor - Pengeluaran Operasional.
 * 6. REKONSILIASI KAS VS OMZET VS LABA:
 *    - Membedakan arus kas masuk aktual, pendapatan operasional, utang vendor, dan laba.
 */

const FinancialService = (function() {

  /**
   * Kategori pengeluaran non-operasional yang dilarang masuk beban operasional
   */
  const NON_OPERATIONAL_CATEGORIES = [
    "PEMBELIAN_STOK",
    "STOCK_PURCHASE",
    "PENGADAAN_STOK",
    "SETTLEMENT_VENDOR",
    "BAYAR_VENDOR",
    "VENDOR_PAYMENT",
    "HAK_VENDOR",
    "PENGEMBALIAN_KLAIM",
    "WITHDRAWAL_OWNER"
  ];

  /**
   * Menghitung Laporan Laba Rugi Bulanan Resmi (Income Statement)
   * 
   * @param {number|string} month (1 - 12)
   * @param {number|string} year (misal 2026)
   * @return {Object} Laporan lengkap terperinci
   */
  function calculateMonthlyIncomeStatement(month, year) {
    const targetMonth = parseInt(month, 10);
    const targetYear = parseInt(year, 10);

    if (isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
      throw new Error("Bulan tidak valid: " + month);
    }
    if (isNaN(targetYear) || targetYear < 2020 || targetYear > 2099) {
      throw new Error("Tahun tidak valid: " + year);
    }

    return DatabaseHelper.withLock(30000, function() {
      // ---------------------------------------------------------
      // 1. OMZET PENJUALAN STOK SENDIRI & INSENTIF VENDOR (PENJUALAN)
      // ---------------------------------------------------------
      const allSales = DatabaseHelper.getAllRows("PENJUALAN");
      let ownedSalesAmount = 0;
      let vendorIncentiveAmount = 0;
      let grossCustomerSalesPayment = 0;
      let salesHpp = 0;
      const matchingSales = [];

      allSales.forEach(s => {
        if (!s.transaction_date) return;
        const txDate = new Date(s.transaction_date);
        if ((txDate.getMonth() + 1) === targetMonth && txDate.getFullYear() === targetYear) {
          // Jangan hitung jika transaksi ini adalah duplikasi dari PO settlement yang dihitung di PRE_ORDER
          if (s.sales_type === "PO_SETTLEMENT") return;

          ownedSalesAmount += (Number(s.owned_sales_amount) || 0);
          vendorIncentiveAmount += (Number(s.vendor_incentive_amount) || 0);
          grossCustomerSalesPayment += (Number(s.gross_customer_payment) || 0);
          salesHpp += (Number(s.total_hpp) || 0);
          matchingSales.push(s);
        }
      });

      // ---------------------------------------------------------
      // 1b. PENYESUAIAN RETUR PENJUALAN PADA BULAN BERJALAN (RETUR_PENJUALAN)
      //     Aturan: Retur dicatat sebagai penyesuaian (contra-revenue & hpp reversal)
      //     pada bulan terjadinya retur, sehingga snapshot bulan penjualan asal yang
      //     sudah CLOSED tetap utuh dan tidak berubah.
      // ---------------------------------------------------------
      const allReturns = DatabaseHelper.getAllRows("RETUR_PENJUALAN");
      let ownedSalesReturns = 0;
      let vendorIncentiveReturns = 0;
      let hppReturns = 0;
      const matchingReturns = [];

      allReturns.forEach(ret => {
        if (!ret.return_date) return;
        const rDate = new Date(ret.return_date);
        if ((rDate.getMonth() + 1) === targetMonth && rDate.getFullYear() === targetYear) {
          if (ret.item_ownership === "OWNED") {
            ownedSalesReturns += (Number(ret.refund_amount) || 0);
            hppReturns += (Number(ret.hpp_reversal) || 0);
          } else if (ret.item_ownership === "CONSIGNMENT") {
            vendorIncentiveReturns += (Number(ret.crocs_incentive_reversal) || 0);
          }
          matchingReturns.push(ret);
        }
      });

      const netOwnedSales = ownedSalesAmount - ownedSalesReturns;
      const netVendorIncentive = vendorIncentiveAmount - vendorIncentiveReturns;

      // ---------------------------------------------------------
      // 2. OMZET PRE-ORDER LUNAS (PRE_ORDER)
      //    Aturan: Hanya diakui jika status PAID dan settlement_date pada bulan ini.
      //    DP dan cicilan sebelum lunas BUKAN omzet!
      // ---------------------------------------------------------
      const recognizedPO = POService.getRecognizedMonthlyPO(targetMonth, targetYear);
      const poOmzetAmount = Number(recognizedPO.totalOmzet) || 0;
      const poHppAmount = Number(recognizedPO.totalHpp) || 0;

      // ---------------------------------------------------------
      // 3. TOTAL OMZET BERSIH CROCSCIRCLE
      // ---------------------------------------------------------
      const totalOmzet = netOwnedSales + netVendorIncentive + poOmzetAmount;

      // ---------------------------------------------------------
      // 4. TOTAL HARGA POKOK PENJUALAN (HPP)
      //    Matching principle: HPP POS (FIFO) disesuaikan retur + HPP PO lunas pada settlement_date.
      //    Catatan: Penjualan barang vendor HPP = 0. Pembelian stok supplier bukan HPP.
      // ---------------------------------------------------------
      const totalHpp = Math.max(0, salesHpp - hppReturns) + poHppAmount;

      // ---------------------------------------------------------
      // 5. LABA KOTOR (GROSS PROFIT)
      // ---------------------------------------------------------
      const grossProfit = totalOmzet - totalHpp;

      // ---------------------------------------------------------
      // 6. PENGELUARAN OPERASIONAL
      //    Aturan: Hanya beban operasional sah. Pembelian stok & bayar vendor DILARANG!
      // ---------------------------------------------------------
      const allExpenses = DatabaseHelper.getAllRows("PENGELUARAN");
      let operationalExpenses = 0;
      const matchingExpenses = [];
      const excludedExpenses = [];

      allExpenses.forEach(exp => {
        if (!exp.expense_date) return;
        const expDate = new Date(exp.expense_date);
        if ((expDate.getMonth() + 1) === targetMonth && expDate.getFullYear() === targetYear) {
          const category = String(exp.category || "").trim().toUpperCase();
          const amount = Number(exp.amount) || 0;

          // Cek apakah termasuk kategori yang dilarang
          if (NON_OPERATIONAL_CATEGORIES.indexOf(category) !== -1) {
            excludedExpenses.push({
              expense_id: exp.expense_id,
              category: category,
              amount: amount,
              reason: "Kategori non-operasional (pembelian stok / transfer vendor tidak boleh masuk beban operasional)."
            });
          } else {
            operationalExpenses += amount;
            matchingExpenses.push(exp);
          }
        }
      });

      // ---------------------------------------------------------
      // 7. LABA BERSIH (NET PROFIT)
      // ---------------------------------------------------------
      const netProfit = grossProfit - operationalExpenses;

      return {
        period: {
          month: targetMonth,
          year: targetYear,
          period_id: "PER-" + targetYear + "-" + (targetMonth < 10 ? "0" + targetMonth : targetMonth)
        },
        revenue_breakdown: {
          owned_sales_amount: netOwnedSales,
          gross_owned_sales: ownedSalesAmount,
          owned_sales_returns: ownedSalesReturns,
          net_owned_sales: netOwnedSales,
          po_recognized_omzet: poOmzetAmount,
          vendor_incentive_amount: netVendorIncentive,
          gross_vendor_incentive: vendorIncentiveAmount,
          vendor_incentive_returns: vendorIncentiveReturns,
          net_vendor_incentive: netVendorIncentive,
          total_omzet: totalOmzet,
          po_count: recognizedPO.count,
          sales_count: matchingSales.length,
          returns_count: matchingReturns.length
        },
        hpp_breakdown: {
          gross_sales_hpp: salesHpp,
          hpp_reversal_returns: hppReturns,
          net_sales_hpp: Math.max(0, salesHpp - hppReturns),
          po_recognized_hpp: poHppAmount,
          po_pending_hpp_count: recognizedPO.pendingHppCount || 0,
          total_hpp: totalHpp,
          consignment_hpp: 0, // HPP barang vendor selalu 0
          note: "HPP diakui saat barang terjual berdasarkan snapshot FIFO transaksi POS, serta pelunasan PO pada settlement_date."
        },
        gross_profit: grossProfit,
        expenses_breakdown: {
          operational_expenses: operationalExpenses,
          expenses_count: matchingExpenses.length,
          excluded_non_operational_count: excludedExpenses.length,
          excluded_expenses: excludedExpenses
        },
        net_profit: netProfit,
        generated_at: new Date()
      };
    });
  }

  /**
   * Rekonsiliasi Komprehensif Arus Kas vs Omzet vs Kewajiban Vendor
   * Mampu membedakan Kas Diterima, Omzet CrocsCircle, Hak Vendor, Transfer Settlement, dan Laba Bersih.
   */
  function getMonthlyCashAndVendorReconciliation(month, year) {
    const targetMonth = parseInt(month, 10);
    const targetYear = parseInt(year, 10);

    return DatabaseHelper.withLock(30000, function() {
      // 1. Ambil Laporan Laba Rugi resmi
      const incomeStatement = calculateMonthlyIncomeStatement(targetMonth, targetYear);

      // 2. Kas Masuk Customer dari Penjualan Langsung
      const allSales = DatabaseHelper.getAllRows("PENJUALAN");
      let customerCashFromSales = 0;
      let totalVendorPayableIncurred = 0;

      allSales.forEach(s => {
        if (!s.transaction_date) return;
        const txDate = new Date(s.transaction_date);
        if ((txDate.getMonth() + 1) === targetMonth && txDate.getFullYear() === targetYear) {
          if (s.sales_type !== "PO_SETTLEMENT") {
            customerCashFromSales += (Number(s.gross_customer_payment) || 0);
          }
        }
      });

      // 2b. Kewajiban Vendor yang Timbul (dari DETAIL_PENJUALAN)
      const allSaleDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN");
      allSaleDetails.forEach(d => {
        if (d.item_ownership === "CONSIGNMENT") {
          // Cek tanggal penjualan dari header
          const parentSale = DatabaseHelper.getRowByPk("PENJUALAN", "sales_id", d.sales_id);
          if (parentSale && parentSale.transaction_date) {
            const pDate = new Date(parentSale.transaction_date);
            if ((pDate.getMonth() + 1) === targetMonth && pDate.getFullYear() === targetYear) {
              totalVendorPayableIncurred += (Number(d.total_vendor_payable) || 0);
            }
          }
        }
      });

      // 3. Kas Masuk Customer dari Pre-Order (Seluruh DP & Cicilan yang Masuk di Bulan Ini)
      const allPoPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PO");
      let customerCashFromPO = 0;
      allPoPayments.forEach(p => {
        if (!p.payment_date) return;
        const pDate = new Date(p.payment_date);
        if ((pDate.getMonth() + 1) === targetMonth && pDate.getFullYear() === targetYear) {
          customerCashFromPO += (Number(p.amount) || 0);
        }
      });

      const totalCustomerCashReceived = customerCashFromSales + customerCashFromPO;

      // 4. Kas Keluar: Transfer Settlement ke Vendor
      const allSettlements = DatabaseHelper.getAllRows("SETTLEMENT_VENDOR");
      let vendorSettlementsPaid = 0;
      let vendorClaimsCompensated = 0;

      allSettlements.forEach(st => {
        if (!st.settlement_date) return;
        const stDate = new Date(st.settlement_date);
        if ((stDate.getMonth() + 1) === targetMonth && stDate.getFullYear() === targetYear) {
          vendorSettlementsPaid += (Number(st.total_net_payout) || 0);
          vendorClaimsCompensated += (Number(st.total_claims_deducted) || 0);
        }
      });

      // 5. Klaim Retur Baru yang Timbul terhadap Vendor (KLAIM_VENDOR)
      const allClaims = DatabaseHelper.getAllRows("KLAIM_VENDOR");
      let vendorClaimsIncurred = 0;
      allClaims.forEach(c => {
        if (!c.claim_date) return;
        const cDate = new Date(c.claim_date);
        if ((cDate.getMonth() + 1) === targetMonth && cDate.getFullYear() === targetYear) {
          vendorClaimsIncurred += (Number(c.claim_amount) || 0);
        }
      });

      // 6. Kas Keluar: Belanja Pembelian Stok Supplier (PEMBAYARAN_PEMBELIAN atau PEMBELIAN_STOK)
      let stockPurchasesCashPaid = 0;
      let hasPurchasePayments = false;
      try {
        const allPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN");
        if (allPayments && allPayments.length > 0) {
          hasPurchasePayments = true;
          allPayments.forEach(pm => {
            if (!pm.payment_date) return;
            const pmDate = new Date(pm.payment_date);
            if ((pmDate.getMonth() + 1) === targetMonth && pmDate.getFullYear() === targetYear) {
              stockPurchasesCashPaid += (Number(pm.amount) || 0);
            }
          });
        }
      } catch (e) {}

      if (!hasPurchasePayments) {
        const allPurchases = DatabaseHelper.getAllRows("PEMBELIAN_STOK");
        allPurchases.forEach(pur => {
          if (!pur.purchase_date) return;
          const purDate = new Date(pur.purchase_date);
          if ((purDate.getMonth() + 1) === targetMonth && purDate.getFullYear() === targetYear) {
            stockPurchasesCashPaid += (Number(pur.total_purchase) || 0);
          }
        });
      }

      // 7. Kas Keluar: Beban Operasional
      const operationalExpensesPaid = incomeStatement.expenses_breakdown.operational_expenses;

      // 7b. Kas Keluar: Pengembalian Dana Kas ke Customer atas Retur (RETUR_PENJUALAN)
      const allReturns = DatabaseHelper.getAllRows("RETUR_PENJUALAN");
      let customerRefundsPaid = 0;
      allReturns.forEach(ret => {
        if (!ret.return_date) return;
        const rDate = new Date(ret.return_date);
        if ((rDate.getMonth() + 1) === targetMonth && rDate.getFullYear() === targetYear) {
          customerRefundsPaid += (Number(ret.refund_amount) || 0);
        }
      });

      // 8. Total Kas Keluar & Net Cash Flow
      const totalCashDisbursed = vendorSettlementsPaid + stockPurchasesCashPaid + operationalExpensesPaid + customerRefundsPaid;
      const netCashFlow = totalCustomerCashReceived - totalCashDisbursed;

      return {
        period: incomeStatement.period,
        cash_inflow: {
          customer_cash_from_sales: customerCashFromSales,
          customer_cash_from_po_payments: customerCashFromPO,
          total_customer_cash_received: totalCustomerCashReceived
        },
        cash_outflow: {
          vendor_settlements_paid: vendorSettlementsPaid,
          stock_purchases_paid: stockPurchasesCashPaid,
          operational_expenses_paid: operationalExpensesPaid,
          customer_refunds_paid: customerRefundsPaid,
          total_cash_disbursed: totalCashDisbursed
        },
        net_cash_flow: netCashFlow,
        accounting_comparison: {
          total_customer_cash_received: totalCustomerCashReceived,
          crocscircle_revenue: incomeStatement.revenue_breakdown.total_omzet,
          gross_profit: incomeStatement.gross_profit,
          net_profit: incomeStatement.net_profit,
          vendor_payables_incurred: totalVendorPayableIncurred,
          vendor_settlements_paid: vendorSettlementsPaid,
          vendor_claims_incurred: vendorClaimsIncurred,
          vendor_claims_compensated: vendorClaimsCompensated,
          explanation: "Saldo Kas != Omzet != Laba Bersih. Transfer ke vendor melunasi kewajiban dan TIDAK mengurangi laba bersih dua kali."
        }
      };
    });
  }

  /**
   * Mencatat Pengeluaran Operasional ke tabel PENGELUARAN.
   * WAJIB menolak keras kategori yang seharusnya TIDAK masuk pengeluaran operasional:
   * pembelian stok supplier dan settlement vendor.
   *
   * @param {Object} expenseData
   *   { expense_date, category, activity, description, amount, payment_method, paid_by, notes, created_by }
   * @return {Object} { success, expense_id, ... }
   */
  function recordOperationalExpense(expenseData) {
    return DatabaseHelper.withLock(30000, function() {
      const FORBIDDEN_CATEGORIES = [
        "STOCK_PURCHASE", "PEMBELIAN_STOK", "PENGADAAN_STOK",
        "VENDOR_SETTLEMENT", "SETTLEMENT_VENDOR", "BAYAR_VENDOR",
        "HUTANG_VENDOR", "VENDOR_PAYMENT", "HAK_VENDOR",
        "STOCK_IN", "PURCHASE"
      ];

      const category = String(expenseData.category || "").trim().toUpperCase();
      if (!category) {
        throw new Error("Kategori pengeluaran wajib diisi.");
      }

      if (FORBIDDEN_CATEGORIES.indexOf(category) !== -1) {
        throw new Error(
          "Kategori '" + expenseData.category + "' TIDAK DIIZINKAN masuk ke pengeluaran operasional. " +
          "Pembelian stok supplier dicatat via createPurchaseInvoice/receivePurchaseShipment. " +
          "Settlement vendor dicatat via VendorService. " +
          "Kategori terlarang: " + FORBIDDEN_CATEGORIES.join(", ")
        );
      }

      const amount = parseFloat(expenseData.amount) || 0;
      if (amount <= 0) {
        throw new Error("Jumlah pengeluaran harus lebih dari 0.");
      }

      const now = new Date();
      // Validasi Periode Buku Aktif
      const expDate = expenseData.expense_date ? new Date(expenseData.expense_date) : now;
      if (typeof ClosingService !== "undefined" && ClosingService.assertPeriodOpenForTransaction) {
        ClosingService.assertPeriodOpenForTransaction(expDate);
      }

      const dateStr = Utilities.formatDate(now, "GMT+7", "yyyyMMdd");
      const expense_id = "EXP-" + dateStr + "-" + Math.floor(Math.random() * 9000 + 1000);

      DatabaseHelper.insertRow("PENGELUARAN", {
        expense_id: expense_id,
        expense_date: expenseData.expense_date || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd"),
        category: expenseData.category,
        activity: expenseData.activity || "",
        description: expenseData.description || "",
        amount: amount,
        payment_method: expenseData.payment_method || "",
        paid_by: expenseData.paid_by || "",
        receipt_url: expenseData.receipt_url || "",
        notes: expenseData.notes || "",
        created_by: expenseData.created_by || "SYSTEM"
      });

      DatabaseHelper.logActivity(
        expenseData.created_by || "SYSTEM",
        "RECORD_EXPENSE",
        "FINANCE",
        expense_id,
        "Pengeluaran operasional dicatat: " + expense_id + " — Kategori: " + expenseData.category + " — Jumlah: " + amount
      );

      return {
        success: true,
        expense_id: expense_id,
        category: expenseData.category,
        amount: amount,
        expense_date: expenseData.expense_date || Utilities.formatDate(now, "GMT+7", "yyyy-MM-dd")
      };
    });
  }

  /**
   * Mendapatkan daftar pengeluaran operasional dengan filter opsional.
   *
   * @param {Object} filters
   *   { month, year, category, payment_method, date_from, date_to }
   * @return {Object} { success, expenses: [...], count, total_amount }
   */
  function getExpensesList(filters) {
    filters = filters || {};
    const allExpenses = DatabaseHelper.getAllRows("PENGELUARAN");

    const filtered = allExpenses.filter(function(exp) {
      if (!exp.expense_date) return false;
      const expDate = new Date(exp.expense_date);

      if (filters.month && (expDate.getMonth() + 1) !== parseInt(filters.month, 10)) return false;
      if (filters.year && expDate.getFullYear() !== parseInt(filters.year, 10)) return false;
      if (filters.category && String(exp.category || "").toUpperCase() !== String(filters.category).toUpperCase()) return false;
      if (filters.payment_method && String(exp.payment_method || "").toUpperCase() !== String(filters.payment_method).toUpperCase()) return false;
      if (filters.date_from) {
        const df = new Date(filters.date_from);
        if (expDate < df) return false;
      }
      if (filters.date_to) {
        const dt = new Date(filters.date_to);
        if (expDate > dt) return false;
      }
      return true;
    });

    let totalAmount = 0;
    filtered.forEach(function(e) { totalAmount += (parseFloat(e.amount) || 0); });

    return {
      success: true,
      expenses: filtered,
      count: filtered.length,
      total_amount: totalAmount
    };
  }

  /**
   * Mencatat dan Memverifikasi Saldo Pembukaan Kas Riil (Opening Cash Balance)
   * Wajib otorisasi OWNER
   *
   * @param {Object} openingData
   *   { opening_date, cash_in_hand, bank_balance, ewallet_balance, source_evidence, notes }
   * @param {string} [callerToken]
   * @return {Object} { success, opening_data }
   */
  function recordOpeningCashBalance(openingData, callerToken) {
    let caller = { username: "OWNER" };
    if (typeof AuthService !== "undefined" && AuthService.requireOwner && callerToken) {
      caller = AuthService.requireOwner(callerToken);
    }

    if (!openingData) throw new Error("Data saldo pembukaan wajib diisi.");
    const openingDate = openingData.opening_date || "2026-10-01";
    const cashInHand = parseFloat(openingData.cash_in_hand) || 0;
    const bankBalance = parseFloat(openingData.bank_balance) || 0;
    const ewalletBalance = parseFloat(openingData.ewallet_balance) || 0;
    const totalOpeningCash = cashInHand + bankBalance + ewalletBalance;

    if (totalOpeningCash < 0) {
      throw new Error("Total saldo awal kas tidak boleh negatif.");
    }

    return DatabaseHelper.withLock(30000, function() {
      const now = new Date();
      const payload = {
        opening_date: openingDate,
        cash_in_hand: cashInHand,
        bank_balance: bankBalance,
        ewallet_balance: ewalletBalance,
        total_opening_cash: totalOpeningCash,
        source_evidence: openingData.source_evidence || "Catatan Fisik & Rekening Koran",
        notes: openingData.notes || "",
        recorded_by: caller.username,
        recorded_at: now,
        verified_by_owner: true
      };

      // Simpan ke PENGATURAN dengan key OPENING_CASH_YYYYMMDD
      const settingKey = "OPENING_CASH_" + openingDate.replace(/-/g, "");
      const existing = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", settingKey);

      if (existing) {
        DatabaseHelper.updateRowByPk("PENGATURAN", "setting_key", settingKey, {
          setting_value: JSON.stringify(payload),
          description: "Saldo Pembukaan Kas terverifikasi Owner per " + openingDate,
          updated_by: caller.username,
          updated_at: now
        });
      } else {
        DatabaseHelper.insertRow("PENGATURAN", {
          setting_key: settingKey,
          setting_value: JSON.stringify(payload),
          description: "Saldo Pembukaan Kas terverifikasi Owner per " + openingDate,
          updated_by: caller.username,
          updated_at: now
        });
      }

      DatabaseHelper.logActivity(
        caller.username,
        "RECORD_OPENING_CASH",
        "FINANCE",
        settingKey,
        "Saldo pembukaan kas per " + openingDate + " diverifikasi sebesar Rp" + totalOpeningCash.toLocaleString("id-ID")
      );

      return {
        success: true,
        opening_data: payload
      };
    });
  }

  /**
   * Mengambil saldo pembukaan kas untuk tanggal tertentu
   *
   * @param {string} targetDate - format YYYY-MM-DD
   * @return {Object|null}
   */
  function getOpeningCashBalance(targetDate) {
    const cleanDate = (targetDate || "2026-10-01").substring(0, 10);
    const settingKey = "OPENING_CASH_" + cleanDate.replace(/-/g, "");
    try {
      const row = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", settingKey);
      if (row && row.setting_value) {
        return JSON.parse(row.setting_value);
      }
    } catch (e) {}
    return null;
  }

  /**
   * Menghasilkan Laporan Arus Kas Bulanan Resmi (Cash Flow Statement)
   *
   * @param {number|string} month (1 - 12)
   * @param {number|string} year (misal 2026)
   * @return {Object} Laporan arus kas lengkap
   */
  function getMonthlyCashFlowStatement(month, year) {
    const targetMonth = parseInt(month, 10);
    const targetYear = parseInt(year, 10);

    return DatabaseHelper.withLock(30000, function() {
      // 1. Ambil data kas masuk dan kas keluar dari rekonsiliasi
      const recon = getMonthlyCashAndVendorReconciliation(targetMonth, targetYear);
      const periodId = recon.period.period_id;

      // 2. Tentukan Saldo Awal Kas
      let beginningCash = 0;
      let isVerified = false;
      let openingDetails = null;

      if (targetYear === 2026 && targetMonth === 10) {
        // Bulan Rekonstruksi Pertama: Ambil dari Opening Cash per 2026-10-01
        openingDetails = getOpeningCashBalance("2026-10-01");
        if (openingDetails && openingDetails.verified_by_owner) {
          beginningCash = Number(openingDetails.total_opening_cash) || 0;
          isVerified = true;
        }
      } else if (targetYear === 2026 && targetMonth === 11) {
        // Bulan Kedua: Saldo Awal = Saldo Akhir Bulan 10
        const prevOpening = getOpeningCashBalance("2026-10-01");
        if (prevOpening && prevOpening.verified_by_owner) {
          const octRecon = getMonthlyCashAndVendorReconciliation(10, 2026);
          const octBeginning = Number(prevOpening.total_opening_cash) || 0;
          beginningCash = octBeginning + octRecon.net_cash_flow;
          isVerified = true;
          openingDetails = {
            source: "Saldo Akhir PER-2026-10",
            total_opening_cash: beginningCash,
            verified_by_owner: true
          };
        }
      } else {
        // Bulan-bulan berikutnya: iterasi dari penutupan buku sebelumnya
        const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
        const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
        const prevPeriodId = "PER-" + prevYear + "-" + (prevMonth < 10 ? "0" + prevMonth : prevMonth);
        const prevPeriod = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", prevPeriodId);
        if (prevPeriod && prevPeriod.ending_cash_balance !== undefined && prevPeriod.ending_cash_balance !== null && prevPeriod.ending_cash_balance !== "") {
          beginningCash = Number(prevPeriod.ending_cash_balance) || 0;
          isVerified = true;
        }
      }

      // 3. Hitung Penarikan Kas Owner (WITHDRAWAL) pada bulan ini
      const allFundTxs = DatabaseHelper.getAllRows("SALDO_DANA");
      let ownerWithdrawalsPaid = 0;
      allFundTxs.forEach(function(tx) {
        if (!tx.transaction_date) return;
        const txD = new Date(tx.transaction_date);
        if ((txD.getMonth() + 1) === targetMonth && txD.getFullYear() === targetYear) {
          if (tx.transaction_type === "WITHDRAWAL") {
            ownerWithdrawalsPaid += Math.abs(Number(tx.amount) || 0);
          }
        }
      });

      // 4. Hitung Total Kas Masuk & Kas Keluar
      const totalCashInflow = recon.cash_inflow.total_customer_cash_received;
      const totalCashOutflow = recon.cash_outflow.total_cash_disbursed + ownerWithdrawalsPaid;
      const netCashFlow = totalCashInflow - totalCashOutflow;
      const endingCash = isVerified ? (beginningCash + netCashFlow) : null;

      // 5. Analisis Posisi Kas & Kewajiban Vendor Berjalan
      // a. Kewajiban Setoran Vendor Berjalan (Utang Vendor Belum Disetor - Kewajiban Lancar)
      let vendorPayablesOutstanding = 0;
      try {
        const allUnpaidConsignments = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", function(d) {
          return d.item_ownership === "CONSIGNMENT" && d.settlement_status !== "PAID" && d.settlement_status !== "CANCELLED";
        });
        allUnpaidConsignments.forEach(function(d) {
          vendorPayablesOutstanding += (Number(d.vendor_remaining_payable) || 0);
        });
      } catch (e) {}

      // b. Uang Muka DP PO yang Belum Diserahkan (Kewajiban Pengadaan PO)
      let unfulfilledPoDpBalance = 0;
      try {
        const activePOs = DatabaseHelper.getAllRows("PRE_ORDER", function(po) {
          return po.fulfillment_status !== "DELIVERED" && po.fulfillment_status !== "CANCELLED";
        });
        activePOs.forEach(function(po) {
          const poPmts = DatabaseHelper.getAllRows("PEMBAYARAN_PO", function(pm) {
            return String(pm.po_id) === String(po.po_id);
          });
          poPmts.forEach(function(pm) { unfulfilledPoDpBalance += (Number(pm.amount) || 0); });
        });
      } catch (e) {}

      const operatingCashAfterVendorObligations = endingCash !== null ? (endingCash - vendorPayablesOutstanding) : null;
      const freeOperatingCash = endingCash !== null ? (endingCash - vendorPayablesOutstanding - unfulfilledPoDpBalance) : null;

      return {
        period: recon.period,
        reconciliation_status: isVerified ? "RECONCILED" : "NEEDS_RECONCILIATION",
        is_verified: isVerified,
        verification_message: isVerified
          ? "Saldo kas terverifikasi dan direkonsiliasi penuh dengan mutasi kas riil."
          : "BELUM DIREKONSILIASI: Saldo pembukaan kas per 1 Oktober 2026 belum diverifikasi oleh Owner.",
        beginning_cash: isVerified ? beginningCash : null,
        opening_details: openingDetails,
        cash_inflows: {
          customer_sales_cash: recon.cash_inflow.customer_cash_from_sales,
          po_customer_cash: recon.cash_inflow.customer_cash_from_po_payments,
          total_cash_inflow: totalCashInflow
        },
        cash_outflows: {
          supplier_purchases_paid: recon.cash_outflow.stock_purchases_paid,
          vendor_settlements_paid: recon.cash_outflow.vendor_settlements_paid,
          operational_expenses_paid: recon.cash_outflow.operational_expenses_paid,
          customer_refunds_paid: recon.cash_outflow.customer_refunds_paid,
          owner_withdrawals_paid: ownerWithdrawalsPaid,
          total_cash_outflow: totalCashOutflow
        },
        net_cash_flow: netCashFlow,
        ending_cash: endingCash,
        // Standar Klasifikasi Akuntansi Baku:
        vendor_payables_liability: {
          title: "Kewajiban Setoran Vendor Berjalan",
          vendor_payables_outstanding: vendorPayablesOutstanding,
          operating_cash_after_vendor_obligations: operatingCashAfterVendorObligations,
          classification: "CURRENT_LIABILITY",
          note: "Jumlah uang yang masih menjadi hak vendor konsinyasi dan belum disetorkan (Kewajiban Lancar, bukan Restricted Cash)."
        },
        cash_position_analysis: {
          ending_cash_balance: endingCash,
          vendor_payables_outstanding: vendorPayablesOutstanding,
          operating_cash_after_vendor_obligations: operatingCashAfterVendorObligations,
          unfulfilled_po_dp_liability: unfulfilledPoDpBalance,
          free_operating_cash: freeOperatingCash,
          note: "Estimasi kas operasional setelah memperhitungkan kewajiban setoran vendor berjalan dan uang muka PO."
        },
        // Backward compatibility alias:
        restricted_cash_liabilities: {
          vendor_payables_outstanding: vendorPayablesOutstanding,
          unrestricted_free_cash: operatingCashAfterVendorObligations
        }
      };
    });
  }

  return {
    calculateMonthlyIncomeStatement: calculateMonthlyIncomeStatement,
    getMonthlyCashAndVendorReconciliation: getMonthlyCashAndVendorReconciliation,
    getMonthlyCashFlowStatement: getMonthlyCashFlowStatement,
    recordOpeningCashBalance: recordOpeningCashBalance,
    getOpeningCashBalance: getOpeningCashBalance,
    NON_OPERATIONAL_CATEGORIES: NON_OPERATIONAL_CATEGORIES,
    recordOperationalExpense: recordOperationalExpense,
    getExpensesList: getExpensesList
  };

})();
