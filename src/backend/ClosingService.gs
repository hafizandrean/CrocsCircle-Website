/**
 * CROCSCIRCLE.ID — MONTHLY CLOSING & PROFIT DISTRIBUTION ENGINE
 * Version: 1.2.0
 * 
 * Modul Tutup Buku Bulanan, Pembagian Keuntungan 4 Pos & Penguncian Transaksi:
 * 1. PREVIEW & SIMULASI:
 *    - Preview Laporan Keuangan Bulanan & simulasi pembagian laba.
 *    - Formula resmi: Owner 1 (20%), Owner 2 (20%), Dana Darurat (10%), Laba Ditahan (50%).
 *    - Pembulatan konsisten: Plug selisih pembulatan ke Laba Ditahan, menjamin total 100% presisi = Laba Bersih.
 *    - Jika laba bersih <= 0, semua alokasi keuntungan bernilai 0.
 * 2. CLOSE PERIOD:
 *    - Hanya dapat dijalankan oleh OWNER.
 *    - Snapshot angka laporan, persentase & nominal alokasi laba.
 *    - Mengubah status periode menjadi CLOSED dan mengunci transaksi.
 *    - Mencegah closing ganda pada periode yang sama.
 *    - Menambahkan mutasi ke SALDO_DANA (tipe ALLOCATION).
 * 3. REOPEN PERIOD:
 *    - Hanya dapat dijalankan oleh OWNER dengan alasan wajib (audit trail).
 *    - Menyimpan alasan, waktu, actor, dan menaikkan closing_version.
 *    - Membalik saldo alokasi di SALDO_DANA agar saldo dana tetap akurat.
 * 4. ASSERT PERIOD OPEN:
 *    - Menolak pencatatan/pengubahan transaksi pada periode yang berstatus CLOSED.
 * 5. SALDO DANA:
 *    - Memantau saldo kumulatif Owner 1, Owner 2, Dana Darurat, Laba Ditahan.
 *    - Memisahkan alokasi laba akuntansi dari penarikan kas aktual (WITHDRAWAL).
 */

const ClosingService = (function() {

  /**
   * Mengambil persentase pembagian laba aktif dari pengaturan sistem
   */
  function getActiveProfitPercentages() {
    let pOwner1 = 20;
    let pOwner2 = 20;
    let pEmergency = 10;
    let pRetained = 50;

    try {
      const sO1 = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", "OWNER1_PERCENTAGE");
      if (sO1 && sO1.setting_value) pOwner1 = parseFloat(sO1.setting_value);

      const sO2 = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", "OWNER2_PERCENTAGE");
      if (sO2 && sO2.setting_value) pOwner2 = parseFloat(sO2.setting_value);

      const sEm = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", "EMERGENCY_PERCENTAGE");
      if (sEm && sEm.setting_value) pEmergency = parseFloat(sEm.setting_value);

      const sRet = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", "RETAINED_PERCENTAGE");
      if (sRet && sRet.setting_value) pRetained = parseFloat(sRet.setting_value);
    } catch (e) {
      // Gunakan default 20/20/10/50 jika pembacaan gagal
    }

    return {
      owner1_percentage: pOwner1,
      owner2_percentage: pOwner2,
      emergency_percentage: pEmergency,
      retained_percentage: pRetained
    };
  }

  /**
   * Simulasi Pembagian Keuntungan dengan Pembulatan Presisi 100%
   * 
   * @param {number} netProfit (Laba bersih yang akan dibagi)
   * @param {Object} [customPercentages] (Opsional: persentase khusus dari Owner)
   */
  function simulateProfitDistribution(netProfit, customPercentages) {
    const profit = Number(netProfit) || 0;
    const p = customPercentages || getActiveProfitPercentages();

    const p1 = Number(p.owner1_percentage) || 20;
    const p2 = Number(p.owner2_percentage) || 20;
    const pEm = Number(p.emergency_percentage) || 10;
    const pRet = Number(p.retained_percentage) || 50;

    // Validasi total persentase harus 100%
    const totalPct = p1 + p2 + pEm + pRet;
    if (Math.abs(totalPct - 100) > 0.001) {
      throw new Error("Total persentase pembagian keuntungan harus tepat 100% (saat ini: " + totalPct + "%).");
    }

    // Jika Laba Bersih <= 0: Seluruh alokasi keuntungan bernilai NOL
    if (profit <= 0) {
      return {
        net_profit: profit,
        is_profitable: false,
        percentages: { owner1: p1, owner2: p2, emergency: pEm, retained: pRet },
        allocations: {
          owner1_amount: 0,
          owner2_amount: 0,
          emergency_amount: 0,
          retained_amount: 0,
          total_allocated: 0
        },
        rounding_discrepancy: 0,
        note: "Laba bersih nol atau negatif. Tidak ada pembagian keuntungan yang dialokasikan."
      };
    }

    // Hitung alokasi masing-masing pos dengan pembulatan konsisten
    const o1Amount = Math.round(profit * (p1 / 100));
    const o2Amount = Math.round(profit * (p2 / 100));
    const emAmount = Math.round(profit * (pEm / 100));

    // Plug selisih pembulatan ke Keuntungan Ditahan (Retained Earnings)
    // Menjamin total nominal alokasi SAMA PERSIS dengan laba bersih sampai Rp1 terakhir
    const retainedAmount = profit - (o1Amount + o2Amount + emAmount);
    const totalAllocated = o1Amount + o2Amount + emAmount + retainedAmount;

    return {
      net_profit: profit,
      is_profitable: true,
      percentages: {
        owner1: p1,
        owner2: p2,
        emergency: pEm,
        retained: pRet
      },
      allocations: {
        owner1_amount: o1Amount,
        owner2_amount: o2Amount,
        emergency_amount: emAmount,
        retained_amount: retainedAmount,
        total_allocated: totalAllocated
      },
      rounding_discrepancy: 0,
      note: "Total alokasi tepat 100% sama dengan laba bersih. Selisih pembulatan dialokasikan ke Keuntungan Ditahan."
    };
  }

  /**
   * Preview Laporan Bulanan & Simulasi Pembagian Keuntungan sebelum Tutup Buku
   */
  function previewMonthlyReport(month, year, customPercentages) {
    const incomeStatement = FinancialService.calculateMonthlyIncomeStatement(month, year);
    const profitSim = simulateProfitDistribution(incomeStatement.net_profit, customPercentages);

    // Ambil status periode saat ini
    const periodId = incomeStatement.period.period_id;
    const periodRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", periodId);

    return {
      period_id: periodId,
      month: incomeStatement.period.month,
      year: incomeStatement.period.year,
      period_status: periodRow ? periodRow.period_status : "OPEN",
      closing_version: periodRow ? (periodRow.closing_version || 1) : 1,
      income_statement: incomeStatement,
      profit_distribution: profitSim
    };
  }

  /**
   * Eksekusi Tutup Buku Bulanan (Close Period)
   * Wajib otorisasi OWNER
   */
  function closePeriod(month, year, callerToken, closingNotes, customPercentages) {
    const caller = AuthService.requireOwner(callerToken);
    const targetMonth = parseInt(month, 10);
    const targetYear = parseInt(year, 10);
    const periodId = "PER-" + targetYear + "-" + (targetMonth < 10 ? "0" + targetMonth : targetMonth);

    return DatabaseHelper.withLock(30000, function() {
      // 1. Cek keberadaan & status periode
      let periodRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", periodId);
      if (!periodRow) {
        // Buat baris periode jika belum ada
        periodRow = {
          period_id: periodId,
          month: targetMonth,
          year: targetYear,
          period_status: "OPEN",
          closing_date: "",
          closed_by: "",
          closing_version: 1,
          total_omzet: 0,
          total_hpp: 0,
          gross_profit: 0,
          operational_expenses: 0,
          net_profit: 0,
          reopen_reason: "",
          reopened_by: "",
          reopened_at: "",
          notes: ""
        };
        DatabaseHelper.insertRow("PERIODE_KEUANGAN", periodRow);
      }

      // 2. Mencegah Closing Ganda
      if (periodRow.period_status === "CLOSED") {
        throw new Error("Periode " + periodId + " sudah ditutup (CLOSED). Mencegah closing ganda.");
      }

      // 3. Hitung angka final laporan dan pembagian laba
      const incomeStatement = FinancialService.calculateMonthlyIncomeStatement(targetMonth, targetYear);
      const profitDist = simulateProfitDistribution(incomeStatement.net_profit, customPercentages);

      const now = new Date();
      const currentVersion = Number(periodRow.closing_version) || 1;
      const allocId = "ALC-" + targetYear + (targetMonth < 10 ? "0" + targetMonth : targetMonth) + "-" + Math.floor(Math.random() * 1000);
      const closingId = "CLS-" + targetYear + (targetMonth < 10 ? "0" + targetMonth : targetMonth) + "-V" + currentVersion;

      // 4. Simpan Alokasi Keuntungan di PEMBAGIAN_KEUNTUNGAN
      const allocationRecord = {
        allocation_id: allocId,
        period_id: periodId,
        net_profit: incomeStatement.net_profit,
        owner1_percentage: profitDist.percentages.owner1,
        owner1_amount: profitDist.allocations.owner1_amount,
        owner2_percentage: profitDist.percentages.owner2,
        owner2_amount: profitDist.allocations.owner2_amount,
        emergency_percentage: profitDist.percentages.emergency,
        emergency_amount: profitDist.allocations.emergency_amount,
        retained_percentage: profitDist.percentages.retained,
        retained_amount: profitDist.allocations.retained_amount,
        allocation_date: now,
        status: "COMMITTED"
      };
      DatabaseHelper.insertRow("PEMBAGIAN_KEUNTUNGAN", allocationRecord);

      // 5. Catat Mutasi ke SALDO_DANA (hanya jika ada laba yang dialokasikan)
      if (incomeStatement.net_profit > 0) {
        const fundsToRecord = [
          { type: "OWNER_1", amount: profitDist.allocations.owner1_amount },
          { type: "OWNER_2", amount: profitDist.allocations.owner2_amount },
          { type: "DANA_DARURAT", amount: profitDist.allocations.emergency_amount },
          { type: "LABA_DITAHAN", amount: profitDist.allocations.retained_amount }
        ];

        fundsToRecord.forEach(fund => {
          const fundTxId = "FTX-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
          DatabaseHelper.insertRow("SALDO_DANA", {
            fund_transaction_id: fundTxId,
            fund_type: fund.type,
            transaction_date: now,
            period_id: periodId,
            transaction_type: "ALLOCATION",
            amount: fund.amount,
            reference_id: allocId,
            notes: "Alokasi laba bersih periode " + periodId + " (V" + currentVersion + ")",
            created_by: caller.username
          });
        });
      }

      // 6. Simpan Snapshot di CLOSING_BULANAN
      DatabaseHelper.insertRow("CLOSING_BULANAN", {
        closing_id: closingId,
        period_id: periodId,
        closing_version: currentVersion,
        closing_date: now,
        closed_by: caller.username,
        total_omzet: incomeStatement.revenue_breakdown.total_omzet,
        total_hpp: incomeStatement.hpp_breakdown.total_hpp,
        gross_profit: incomeStatement.gross_profit,
        operational_expenses: incomeStatement.expenses_breakdown.operational_expenses,
        net_profit: incomeStatement.net_profit,
        owner1_amount: profitDist.allocations.owner1_amount,
        owner2_amount: profitDist.allocations.owner2_amount,
        emergency_amount: profitDist.allocations.emergency_amount,
        retained_amount: profitDist.allocations.retained_amount,
        notes: closingNotes || ("Tutup buku bulanan " + periodId),
        created_at: now
      });

      // 7. Update Status PERIODE_KEUANGAN menjadi CLOSED
      DatabaseHelper.updateRowByPk("PERIODE_KEUANGAN", "period_id", periodId, {
        period_status: "CLOSED",
        closing_date: now,
        closed_by: caller.username,
        total_omzet: incomeStatement.revenue_breakdown.total_omzet,
        total_hpp: incomeStatement.hpp_breakdown.total_hpp,
        gross_profit: incomeStatement.gross_profit,
        operational_expenses: incomeStatement.expenses_breakdown.operational_expenses,
        net_profit: incomeStatement.net_profit,
        notes: closingNotes || ("Tutup buku resmi V" + currentVersion)
      });

      DatabaseHelper.logActivity(
        caller.username,
        "CLOSE_PERIOD",
        "FINANCE",
        periodId,
        "Periode " + periodId + " resmi ditutup (V" + currentVersion + "). Laba Bersih: Rp" + incomeStatement.net_profit
      );

      return {
        success: true,
        period_id: periodId,
        closing_version: currentVersion,
        period_status: "CLOSED",
        income_statement: incomeStatement,
        profit_distribution: profitDist
      };
    });
  }

  /**
   * Membuka Kembali Periode yang Sudah Ditutup (Reopen Period)
   * Wajib otorisasi OWNER dengan alasan tertulis
   */
  function reopenPeriod(periodId, callerToken, reason) {
    const caller = AuthService.requireOwner(callerToken);

    if (!reason || reason.trim() === "") {
      throw new Error("Alasan reopen periode wajib diisi untuk jejak audit.");
    }

    return DatabaseHelper.withLock(30000, function() {
      const periodRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", periodId);
      if (!periodRow) throw new Error("Periode " + periodId + " tidak ditemukan.");
      if (periodRow.period_status !== "CLOSED") {
        throw new Error("Periode " + periodId + " saat ini tidak dalam status CLOSED (Status: " + periodRow.period_status + ").");
      }

      const now = new Date();
      const currentVersion = Number(periodRow.closing_version) || 1;
      const nextVersion = currentVersion + 1;

      // 1. Ambil alokasi aktif yang sedang berlaku (status: COMMITTED)
      const activeAllocRows = DatabaseHelper.getAllRows("PEMBAGIAN_KEUNTUNGAN", a => String(a.period_id) === String(periodId) && a.status === "COMMITTED");
      const activeAllocId = activeAllocRows.length > 0 ? activeAllocRows[0].allocation_id : "";

      // 2. Balik saldo dana HANYA untuk alokasi aktif dari closing terakhir (mencegah double reversal jika multi-reopen)
      if (activeAllocId) {
        const activeFundTxs = DatabaseHelper.getAllRows("SALDO_DANA", f => String(f.period_id) === String(periodId) && String(f.reference_id) === String(activeAllocId) && f.transaction_type === "ALLOCATION");
        activeFundTxs.forEach(ftx => {
          const revTxId = "FTX-REV-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
          DatabaseHelper.insertRow("SALDO_DANA", {
            fund_transaction_id: revTxId,
            fund_type: ftx.fund_type,
            transaction_date: now,
            period_id: periodId,
            transaction_type: "ADJUSTMENT",
            amount: -Number(ftx.amount), // Pengurangan saldo pembalik
            reference_id: ftx.fund_transaction_id,
            notes: "Reversal alokasi laba V" + currentVersion + " akibat Reopen Periode " + periodId + " (Alasan: " + reason.trim() + ")",
            created_by: caller.username
          });
        });
      }

      // 3. Tandai alokasi keuntungan lama sebagai REOPENED_SUPERSEDED
      activeAllocRows.forEach(a => {
        DatabaseHelper.updateRowByPk("PEMBAGIAN_KEUNTUNGAN", "allocation_id", a.allocation_id, {
          status: "REOPENED_SUPERSEDED"
        });
      });

      // 3. Update Status PERIODE_KEUANGAN kembali ke OPEN dan naikkan versi
      DatabaseHelper.updateRowByPk("PERIODE_KEUANGAN", "period_id", periodId, {
        period_status: "OPEN",
        closing_version: nextVersion,
        reopen_reason: reason.trim(),
        reopened_by: caller.username,
        reopened_at: now,
        notes: "Dibuka kembali dari V" + currentVersion + " ke V" + nextVersion + ". Alasan: " + reason.trim()
      });

      DatabaseHelper.logActivity(
        caller.username,
        "REOPEN_PERIOD",
        "FINANCE",
        periodId,
        "Periode " + periodId + " dibuka kembali (V" + nextVersion + "). Alasan: " + reason.trim()
      );

      return {
        success: true,
        period_id: periodId,
        period_status: "OPEN",
        previous_version: currentVersion,
        new_version: nextVersion,
        reopen_reason: reason.trim(),
        reopened_by: caller.username,
        reopened_at: now
      };
    });
  }

  /**
   * Memvalidasi bahwa periode untuk tanggal transaksi yang diberikan masih OPEN
   * Menolak jika periode sudah CLOSED
   */
  function assertPeriodOpenForTransaction(transactionDate) {
    if (!transactionDate) return;
    const txDate = new Date(transactionDate);
    if (isNaN(txDate.getTime())) return;

    const m = txDate.getMonth() + 1;
    const y = txDate.getFullYear();
    const periodId = "PER-" + y + "-" + (m < 10 ? "0" + m : m);

    const periodRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", periodId);
    if (periodRow && periodRow.period_status === "CLOSED") {
      throw new Error(
        "Transaksi pada tanggal " + Utilities.formatDate(txDate, "GMT+7", "yyyy-MM-dd") +
        " ditolak karena Periode Buku " + periodId +
        " telah DITUTUP (CLOSED). Pengubahan transaksi pada periode tertutup tidak diizinkan tanpa proses Reopen oleh Owner."
      );
    }
  }

  /**
   * Mengambil Saldo Akumulatif Seluruh Pos Dana dari SALDO_DANA
   */
  function getFundBalances() {
    const allFundTxs = DatabaseHelper.getAllRows("SALDO_DANA");
    const balances = {
      OWNER_1: 0,
      OWNER_2: 0,
      DANA_DARURAT: 0,
      LABA_DITAHAN: 0
    };

    allFundTxs.forEach(tx => {
      const type = String(tx.fund_type).toUpperCase();
      const amt = Number(tx.amount) || 0;
      if (balances.hasOwnProperty(type)) {
        balances[type] += amt;
      }
    });

    const totalFunds = balances.OWNER_1 + balances.OWNER_2 + balances.DANA_DARURAT + balances.LABA_DITAHAN;
    const ownerDeficits = {
      OWNER_1: balances.OWNER_1 < 0 ? Math.abs(balances.OWNER_1) : 0,
      OWNER_2: balances.OWNER_2 < 0 ? Math.abs(balances.OWNER_2) : 0
    };
    const hasDeficit = ownerDeficits.OWNER_1 > 0 || ownerDeficits.OWNER_2 > 0;

    return {
      balances: balances,
      total_funds: totalFunds,
      owner_deficits: ownerDeficits,
      has_overdrawn_owner: hasDeficit,
      deficit_notes: hasDeficit ? "Terdapat saldo penarikan melebihi alokasi laba (piutang modal owner kepada bisnis)." : "Seluruh saldo pos dana dalam kondisi sehat (non-negatif).",
      updated_at: new Date()
    };
  }

  /**
   * Mencatat Penarikan Kas Aktual oleh Owner atau Dana Darurat (WITHDRAWAL)
   * Memisahkan hak akuntansi laba dari uang kas yang ditarik fisik
   */
  function recordFundWithdrawal(fundType, amount, callerToken, notes) {
    const caller = AuthService.requireOwner(callerToken);
    const amt = parseFloat(amount);
    const cleanType = String(fundType).toUpperCase();

    if (isNaN(amt) || amt <= 0) {
      throw new Error("Nominal penarikan harus lebih dari 0.");
    }

    const validTypes = ["OWNER_1", "OWNER_2", "DANA_DARURAT", "LABA_DITAHAN"];
    if (validTypes.indexOf(cleanType) === -1) {
      throw new Error("Jenis pos dana tidak valid: " + fundType);
    }

    return DatabaseHelper.withLock(30000, function() {
      // Cek saldo yang tersedia
      const currentBalances = getFundBalances();
      const currentAvailable = currentBalances.balances[cleanType] || 0;

      if (amt > currentAvailable) {
        throw new Error("Saldo pos " + cleanType + " (Rp" + currentAvailable + ") tidak mencukupi untuk penarikan Rp" + amt + ".");
      }

      const now = new Date();
      const fundTxId = "FTX-WDR-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);

      const withdrawalRecord = {
        fund_transaction_id: fundTxId,
        fund_type: cleanType,
        transaction_date: now,
        period_id: "",
        transaction_type: "WITHDRAWAL",
        amount: -amt, // Pengurangan saldo
        reference_id: "",
        notes: notes || ("Penarikan dana fisik oleh " + caller.username),
        created_by: caller.username
      };

      DatabaseHelper.insertRow("SALDO_DANA", withdrawalRecord);

      DatabaseHelper.logActivity(
        caller.username,
        "WITHDRAW_FUND",
        "FINANCE",
        cleanType,
        "Penarikan dana fisik pos " + cleanType + " sebesar Rp" + amt
      );

      return {
        success: true,
        transaction_id: fundTxId,
        fund_type: cleanType,
        amount_withdrawn: amt,
        remaining_balance: currentAvailable - amt
      };
    });
  }

  return {
    getActiveProfitPercentages: getActiveProfitPercentages,
    simulateProfitDistribution: simulateProfitDistribution,
    previewMonthlyReport: previewMonthlyReport,
    closePeriod: closePeriod,
    reopenPeriod: reopenPeriod,
    assertPeriodOpenForTransaction: assertPeriodOpenForTransaction,
    getFundBalances: getFundBalances,
    recordFundWithdrawal: recordFundWithdrawal
  };

})();
