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

      // ---------------------------------------------------------
      // 3. TOTAL OMZET BERSIH CROCSCIRCLE
      // ---------------------------------------------------------
      const totalOmzet = netOwnedSales + netVendorIncentive + poOmzetAmount;

      // ---------------------------------------------------------
      // 4. TOTAL HARGA POKOK PENJUALAN (HPP)
      //    Catatan: Penjualan barang vendor HPP = 0. Pembelian stok supplier bukan HPP.
      // ---------------------------------------------------------
      const totalHpp = Math.max(0, salesHpp - hppReturns);

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
          gross_hpp: salesHpp,
          hpp_reversal_returns: hppReturns,
          total_hpp: totalHpp,
          consignment_hpp: 0, // HPP barang vendor selalu 0
          note: "HPP diakui saat barang terjual berdasarkan snapshot FIFO transaksi, disesuaikan dengan retur periode berjalan."
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

      // 6. Kas Keluar: Belanja Pembelian Stok Supplier (PEMBELIAN_STOK)
      const allPurchases = DatabaseHelper.getAllRows("PEMBELIAN_STOK");
      let stockPurchasesCashPaid = 0;
      allPurchases.forEach(pur => {
        if (!pur.purchase_date) return;
        const purDate = new Date(pur.purchase_date);
        if ((purDate.getMonth() + 1) === targetMonth && purDate.getFullYear() === targetYear) {
          stockPurchasesCashPaid += (Number(pur.total_purchase) || 0);
        }
      });

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

  return {
    calculateMonthlyIncomeStatement: calculateMonthlyIncomeStatement,
    getMonthlyCashAndVendorReconciliation: getMonthlyCashAndVendorReconciliation,
    NON_OPERATIONAL_CATEGORIES: NON_OPERATIONAL_CATEGORIES
  };

})();
