// CrocsCircle.ID — Financial Reporting & Month-End Closing Script
// Integrates with FinancialService, ClosingService, POService, & VendorService with Owner RBAC

const FIN_STATE = {
  token: null,
  user: null,
  activeTab: "income",
  currentMonth: 11,
  currentYear: 2026,
  previewData: null
};

function formatRupiah(num) {
  if (num === null || num === undefined || isNaN(num)) return "Rp0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}

function formatDateIndo(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(d);
}

document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("crocscircle_admin_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }
  FIN_STATE.token = token;

  try {
    const sessionRes = await fetch('/api/session', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success || !sessionData.user) {
      sessionStorage.removeItem("crocscircle_admin_token");
      window.location.href = "login.html";
      return;
    }

    if (sessionData.user.role !== "OWNER") {
      window.location.href = "admin.html";
      return;
    }

    FIN_STATE.user = sessionData.user;
    document.getElementById("userFullName").innerText = sessionData.user.full_name || sessionData.user.username;
    document.getElementById("userAvatar").innerText = (sessionData.user.full_name || sessionData.user.username).charAt(0).toUpperCase();

    // Check URL hash for tab switching
    handleHashNav();

    await loadAllFinancialData();

    document.getElementById("authLoadingOverlay").style.display = "none";
    document.getElementById("adminMainLayout").style.display = "flex";

  } catch (err) {
    window.location.href = "login.html";
  }
});

function handleHashNav() {
  const hash = window.location.hash;
  if (hash === "#vendor") {
    switchTab("vendor");
  } else if (hash === "#closing") {
    switchTab("closing");
  } else if (hash === "#cashflow") {
    switchTab("cashflow");
  } else {
    switchTab("income");
  }
}

window.addEventListener("hashchange", handleHashNav);

function goToVendorTab() {
  switchTab("vendor");
  if (window.location.hash !== "#vendor") {
    window.location.hash = "#vendor";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goToFinanceTab() {
  switchTab("income");
  if (window.location.hash && window.location.hash !== "#income") {
    history.pushState("", document.title, window.location.pathname + window.location.search);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchTab(tabId) {
  FIN_STATE.activeTab = tabId;
  const tabMap = {
    income: { btn: "tabBtnIncome", content: "tabContentIncome" },
    cashflow: { btn: "tabBtnCashFlow", content: "tabContentCashFlow" },
    vendor: { btn: "tabBtnVendor", content: "tabContentVendor" },
    closing: { btn: "tabBtnClosing", content: "tabContentClosing" }
  };
  Object.keys(tabMap).forEach(key => {
    const item = tabMap[key];
    const btn = document.getElementById(item.btn);
    const content = document.getElementById(item.content);
    if (btn) btn.classList.toggle("active", key === tabId);
    if (content) content.style.display = key === tabId ? "block" : "none";
  });

  // Sync sidebar active highlight
  const sideFinance = document.getElementById("sidebarNavFinance");
  if (sideFinance) {
    sideFinance.classList.add("active");
  }
}

async function loadAllFinancialData() {
  const m = parseInt(document.getElementById("filterMonth").value, 10);
  const y = parseInt(document.getElementById("filterYear").value, 10);
  FIN_STATE.currentMonth = m;
  FIN_STATE.currentYear = y;

  const authHeader = { 'Authorization': `Bearer ${FIN_STATE.token}` };
  const periodId = `PER-${y}-${m < 10 ? '0' + m : m}`;

  try {
    // 3. Load Closing Preview & Period Status FIRST (sets FIN_STATE.previewData used by renderIncomeStatement)
    const prevRes = await fetch(`/api/closing/preview?month=${m}&year=${y}`, { headers: authHeader });
    const prevData = await prevRes.json();
    if (prevData.success && prevData.preview) {
      FIN_STATE.previewData = prevData.preview;
      renderClosingPreview(prevData.preview);
    }

    // 1. Load Income Statement (Laba Rugi) — after preview so profit_distribution is available
    const pnlRes = await fetch(`/api/reports/income-statement?month=${m}&year=${y}`, { headers: authHeader });
    const pnlData = await pnlRes.json();
    if (pnlData.success && pnlData.report) {
      renderIncomeStatement(pnlData.report);
    }

    // 2. Load Cash Flow Statement (Arus Kas)
    // Route: GET /api/reports/cash-flow → { success, report: {...} }
    const cashRes = await fetch(`/api/reports/cash-flow?month=${m}&year=${y}`, { headers: authHeader });
    const cashData = await cashRes.json();
    if (cashData.success && (cashData.cash_flow || cashData.report)) {
      renderCashFlowStatement(cashData.cash_flow || cashData.report);
    }

    // 4. Load Fund Balances (4 Pos)
    // Route: GET /api/closing/fund-balances → { success, fund_balances: { balances: { OWNER_1, OWNER_2, DANA_DARURAT, LABA_DITAHAN } } }
    const fundsRes = await fetch(`/api/closing/fund-balances`, { headers: authHeader });
    const fundsData = await fundsRes.json();
    if (fundsData.success && fundsData.fund_balances) {
      const fb = fundsData.fund_balances;
      const balances = fb.balances || {};
      // Map flat OWNER_1/OWNER_2 structure to { owner1, owner2, emergency, retained }
      renderFundBalances({
        owner1:   { current_balance: balances.OWNER_1 || 0,       total_withdrawn: 0 },
        owner2:   { current_balance: balances.OWNER_2 || 0,       total_withdrawn: 0 },
        emergency:{ current_balance: balances.DANA_DARURAT || 0,  total_withdrawn: 0 },
        retained: { current_balance: balances.LABA_DITAHAN || 0,  total_withdrawn: 0 }
      });
    }

    // 5. Load Vendor Reconciliation
    // Route: GET /api/reports/vendor-reconciliation → { success, vendors: [{ vendor, consignment_summary, settlement_history }] }
    const vndRes = await fetch(`/api/reports/vendor-reconciliation`, { headers: authHeader });
    const vndData = await vndRes.json();
    if (vndData.success) {
      // Aggregate consignment payable & history across all vendors
      const vendors = vndData.vendors || [];
      const totalGross = vendors.reduce((s, v) => {
        const cs = v.consignment_summary || {};
        return s + ((cs.outstanding_payable || 0) + (cs.total_paid_gross || 0));
      }, 0);
      const totalClaims = vendors.reduce((s, v) => {
        const cs = v.consignment_summary || {};
        return s + (cs.active_receivable_claims || 0);
      }, 0);
      const history = vendors.flatMap(v => v.settlement_history || []);
      renderVendorReconciliation({
        payables: {
          total_gross_payable:   totalGross,
          total_claims_deducted: totalClaims,
          total_net_payout:      totalGross - totalClaims
        },
        settlement_history: history
      });
    }

    // 6. Load Snapshots Audit Trail (no dedicated endpoint yet — render empty state gracefully)
    renderSnapshots([]);

  } catch (err) {
    console.error("Error loading financial reports:", err);
  }
}

function renderIncomeStatement(report) {
  const rev = report.revenue_breakdown || {};
  const hpp = report.hpp_breakdown || {};
  const exp = report.expenses_breakdown || {};
  // profit_distribution comes from closing/preview; income-statement may not include it
  const profitDist = report.profit_distribution || (FIN_STATE.previewData && FIN_STATE.previewData.profit_distribution) || {};
  const alloc = profitDist.allocations || {};

  document.getElementById("kpiPnlOmzet").innerText = formatRupiah(rev.total_omzet);
  document.getElementById("kpiPnlHpp").innerText = formatRupiah(hpp.total_hpp);
  document.getElementById("kpiPnlGrossProfit").innerText = formatRupiah(report.gross_profit);
  // gross_margin_percentage may not be in report — compute fallback
  const grossMarginPct = report.gross_margin_percentage != null
    ? report.gross_margin_percentage
    : (rev.total_omzet ? ((report.gross_profit / rev.total_omzet) * 100).toFixed(1) : 0);
  document.getElementById("kpiPnlGrossMargin").innerText = `Gross Margin: ${grossMarginPct}%`;
  document.getElementById("kpiPnlExpenses").innerText = formatRupiah(exp.operational_expenses);
  document.getElementById("kpiPnlNetProfit").innerText = formatRupiah(report.net_profit);

  // Omzet details — use actual API field names
  document.getElementById("pnlOwnSales").innerText = formatRupiah(
    rev.own_sales_omzet || rev.net_owned_sales || rev.owned_sales_amount || 0
  );
  document.getElementById("pnlConsignIncentive").innerText = formatRupiah(
    rev.consignment_incentive_omzet || rev.net_vendor_incentive || rev.vendor_incentive_amount || 0
  );
  document.getElementById("pnlPoRecognized").innerText = formatRupiah(rev.po_recognized_omzet || 0);
  document.getElementById("pnlTotalOmzet").innerText = formatRupiah(rev.total_omzet || 0);

  // HPP details — use actual API field names
  document.getElementById("pnlSalesHpp").innerText = formatRupiah(
    hpp.sales_hpp || hpp.net_sales_hpp || hpp.gross_sales_hpp || 0
  );
  document.getElementById("pnlPoHpp").innerText = formatRupiah(hpp.po_recognized_hpp || 0);
  document.getElementById("pnlHppReturns").innerText = formatRupiah(
    hpp.hpp_returns || hpp.hpp_reversal_returns || 0
  );
  document.getElementById("pnlTotalHpp").innerText = formatRupiah(hpp.total_hpp || 0);

  // Operating Expenses
  const expListEl = document.getElementById("pnlExpensesList");
  if (!exp.operational_expenses || exp.operational_expenses === 0) {
    expListEl.innerHTML = `<div class="breakdown-row" style="color: var(--text-muted);"><span>Belum ada beban operasional tercatat pada periode ini.</span></div>`;
  } else {
    expListEl.innerHTML = `
      <div class="breakdown-row">
        <span>Beban Operasional (${exp.expenses_count || 0} transaksi)</span>
        <strong>${formatRupiah(exp.operational_expenses)}</strong>
      </div>
    `;
  }
  document.getElementById("pnlTotalExpenses").innerText = formatRupiah(exp.operational_expenses || 0);

  // Profit Allocation Preview (from closing preview data)
  document.getElementById("pnlAllocOwner1").innerText = formatRupiah(alloc.owner1_amount || 0);
  document.getElementById("pnlAllocOwner2").innerText = formatRupiah(alloc.owner2_amount || 0);
  document.getElementById("pnlAllocEmergency").innerText = formatRupiah(alloc.emergency_amount || 0);
  document.getElementById("pnlAllocRetained").innerText = formatRupiah(alloc.retained_amount || 0);
  document.getElementById("pnlAllocTotal").innerText = formatRupiah(
    (alloc.owner1_amount || 0) + (alloc.owner2_amount || 0) + (alloc.emergency_amount || 0) + (alloc.retained_amount || 0)
  );
}

function renderCashFlowStatement(cashFlow) {
  const isReconciled = cashFlow.reconciliation_status === "RECONCILED";
  const badgeEl = document.getElementById("cashReconBadge");
  const descEl = document.getElementById("cashReconDesc");
  const btnVerify = document.getElementById("btnOpenVerifyModal");

  if (isReconciled) {
    badgeEl.className = "status-badge badge-reconciled";
    badgeEl.innerHTML = `<i class="fa-solid fa-check-circle"></i> RECONCILED (TERVERIFIKASI)`;
    descEl.innerText = "Saldo kas terverifikasi dan telah terekonsiliasi penuh dengan rekening & brankas.";
    btnVerify.style.display = "none";
  } else {
    badgeEl.className = "status-badge badge-unreconciled";
    badgeEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> NEEDS_RECONCILIATION`;
    descEl.innerText = "Saldo pembukaan awal kas belum diverifikasi Owner. Klik tombol di kanan untuk memverifikasi.";
    btnVerify.style.display = "inline-flex";
  }

  document.getElementById("kpiCashBeginning").innerText = formatRupiah(cashFlow.beginning_cash);
  document.getElementById("kpiCashInflow").innerText = formatRupiah(cashFlow.cash_inflows.total_cash_inflow);
  document.getElementById("kpiCashOutflow").innerText = formatRupiah(cashFlow.cash_outflows.total_cash_outflow);
  document.getElementById("kpiCashNet").innerText = formatRupiah(cashFlow.net_cash_flow);
  document.getElementById("kpiCashEnding").innerText = isReconciled ? formatRupiah(cashFlow.ending_cash) : "Menunggu Rekonsiliasi";

  // Inflow details — actual API fields: customer_sales_cash, po_customer_cash
  document.getElementById("cashInflowRetail").innerText = formatRupiah(
    cashFlow.cash_inflows.retail_sales_cash || cashFlow.cash_inflows.customer_sales_cash || 0
  );
  document.getElementById("cashInflowConsign").innerText = formatRupiah(
    cashFlow.cash_inflows.consignment_sales_gross_cash || 0
  );
  document.getElementById("cashInflowPO").innerText = formatRupiah(
    cashFlow.cash_inflows.preorder_payments_cash || cashFlow.cash_inflows.po_customer_cash || 0
  );
  document.getElementById("cashInflowTotal").innerText = formatRupiah(cashFlow.cash_inflows.total_cash_inflow || 0);

  // Outflow details
  document.getElementById("cashOutflowSupplier").innerText = formatRupiah(cashFlow.cash_outflows.supplier_purchases_paid);
  document.getElementById("cashOutflowVendor").innerText = formatRupiah(cashFlow.cash_outflows.vendor_settlements_paid);
  document.getElementById("cashOutflowExpenses").innerText = formatRupiah(cashFlow.cash_outflows.operational_expenses_paid);
  document.getElementById("cashOutflowWithdrawals").innerText = formatRupiah(cashFlow.cash_outflows.owner_withdrawals_paid || 0);
  document.getElementById("cashOutflowTotal").innerText = formatRupiah(cashFlow.cash_outflows.total_cash_outflow);

  // Kewajiban Setoran Vendor Berjalan & Analisis Posisi Kas
  const vLiability = cashFlow.vendor_payables_liability || cashFlow.restricted_cash_liabilities || {};
  document.getElementById("restrictedVendorPayables").innerText = formatRupiah(vLiability.vendor_payables_outstanding);
  document.getElementById("unrestrictedFreeCash").innerText = formatRupiah(
    vLiability.operating_cash_after_vendor_obligations !== undefined 
      ? vLiability.operating_cash_after_vendor_obligations 
      : vLiability.unrestricted_free_cash
  );
}

function renderClosingPreview(prev) {
  // API returns period data at top level (period_id, period_status, closing_version)
  const status = prev.period_status || (prev.period && prev.period.period_status) || "OPEN";
  const periodId = prev.period_id || (prev.period && prev.period.period_id) || `PER-${FIN_STATE.currentYear}-${FIN_STATE.currentMonth < 10 ? '0' + FIN_STATE.currentMonth : FIN_STATE.currentMonth}`;
  const closingVersion = prev.closing_version || 1;
  const badgeEl = document.getElementById("clsPeriodBadge");
  const descEl = document.getElementById("clsPeriodDesc");
  const btnClose = document.getElementById("btnExecuteClose");
  const btnReopen = document.getElementById("btnExecuteReopen");

  document.getElementById("clsPeriodLabel").innerText = periodId;

  if (status === "CLOSED") {
    badgeEl.className = "status-badge badge-closed";
    badgeEl.innerHTML = `<i class="fa-solid fa-lock"></i> CLOSED (TERKUNCI V${closingVersion})`;
    descEl.innerText = "Periode buku telah ditutup secara resmi. Transaksi transaksi baru pada periode ini ditolak.";
    btnClose.style.display = "none";
    btnReopen.style.display = "inline-flex";
  } else if (status === "REOPENED") {
    badgeEl.className = "status-badge badge-reopened";
    badgeEl.innerHTML = `<i class="fa-solid fa-lock-open"></i> REOPENED (DIBUKA KEMBALI)`;
    descEl.innerText = "Periode buku dalam status REOPEN. Transaksi penyesuaian diizinkan sebelum ditutup kembali.";
    btnClose.style.display = "inline-flex";
    btnReopen.style.display = "none";
  } else {
    badgeEl.className = "status-badge badge-open";
    badgeEl.innerHTML = `<i class="fa-solid fa-check"></i> OPEN (BULAN AKTIF)`;
    descEl.innerText = "Periode buku aktif. Seluruh transaksi penjualan, pembelian, dan beban masih dapat dicatat.";
    btnClose.style.display = "inline-flex";
    btnReopen.style.display = "none";
  }
}

function renderFundBalances(funds) {
  document.getElementById("fundOwner1").innerText = formatRupiah(funds.owner1 ? funds.owner1.current_balance : 0);
  document.getElementById("subOwner1").innerText = `Total Tarik: ${formatRupiah(funds.owner1 ? funds.owner1.total_withdrawn : 0)}`;

  document.getElementById("fundOwner2").innerText = formatRupiah(funds.owner2 ? funds.owner2.current_balance : 0);
  document.getElementById("subOwner2").innerText = `Total Tarik: ${formatRupiah(funds.owner2 ? funds.owner2.total_withdrawn : 0)}`;

  document.getElementById("fundEmergency").innerText = formatRupiah(funds.emergency ? funds.emergency.current_balance : 0);
  document.getElementById("fundRetained").innerText = formatRupiah(funds.retained ? funds.retained.current_balance : 0);
}

function renderVendorReconciliation(vndData) {
  const payables = vndData.payables || {};
  const history = vndData.settlement_history || [];

  document.getElementById("vndGrossPayable").innerText = formatRupiah(payables.total_gross_payable);
  document.getElementById("vndClaimsDeducted").innerText = formatRupiah(payables.total_claims_deducted || 0);
  document.getElementById("vndNetPayout").innerText = formatRupiah(payables.total_net_payout || payables.total_gross_payable);

  const tableBody = document.getElementById("vndSettlementTableBody");
  if (!history || history.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Belum ada riwayat settlement vendor pada periode ini.</td></tr>`;
  } else {
    tableBody.innerHTML = history.map(s => `
      <tr>
        <td><strong>${s.settlement_id}</strong></td>
        <td>${formatDateIndo(s.settlement_date)}</td>
        <td>${formatRupiah(s.total_gross_payable)}</td>
        <td style="color: #DC2626;">-${formatRupiah(s.total_claims_deducted)}</td>
        <td style="font-weight: 700; color: #059669;">${formatRupiah(s.total_net_payout)}</td>
        <td><span class="badge badge-info">${s.payment_method}</span></td>
        <td><span class="badge badge-success">COMPLETED</span></td>
      </tr>
    `).join('');
  }
}

function renderSnapshots(snapshots) {
  const tableBody = document.getElementById("clsSnapshotsTableBody");
  if (!snapshots || snapshots.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Belum ada riwayat snapshot penutupan buku untuk periode ini.</td></tr>`;
  } else {
    tableBody.innerHTML = snapshots.map(s => `
      <tr>
        <td><code>${s.closing_id}</code></td>
        <td><strong>V${s.closing_version}</strong></td>
        <td>${formatDateIndo(s.closing_date)}</td>
        <td>${formatRupiah(s.total_revenue)}</td>
        <td>${formatRupiah(s.total_hpp)}</td>
        <td style="font-weight: 700; color: #059669;">${formatRupiah(s.net_profit)}</td>
        <td>
          <span class="status-badge ${s.snapshot_status === 'ACTIVE' ? 'badge-reconciled' : 'badge-reopened'}">
            ${s.snapshot_status}
          </span>
        </td>
        <td>${s.closed_by || 'OWNER'}</td>
      </tr>
    `).join('');
  }
}

// Modal Triggers & Actions
function openOpeningCashModal() {
  document.getElementById("modalOpeningCash").style.display = "flex";
}

function openClosePeriodModal() {
  const prev = FIN_STATE.previewData;
  // income_statement.net_profit lives at preview.income_statement.net_profit
  const net = prev ? (prev.income_statement ? prev.income_statement.net_profit : 0) : 0;
  const periodLabel = prev ? (prev.period_id || `PER-${FIN_STATE.currentYear}-${FIN_STATE.currentMonth < 10 ? '0' + FIN_STATE.currentMonth : FIN_STATE.currentMonth}`) : `PER-${FIN_STATE.currentYear}-${FIN_STATE.currentMonth < 10 ? '0' + FIN_STATE.currentMonth : FIN_STATE.currentMonth}`;
  document.getElementById("modalCloseSummaryText").innerText = 
    `Periode: ${periodLabel} | Laba Bersih yang akan dialokasikan: ${formatRupiah(net)}`;
  document.getElementById("modalClosePeriod").style.display = "flex";
}

function openReopenModal() {
  document.getElementById("modalReopenPeriod").style.display = "flex";
}

function openWithdrawModal() {
  document.getElementById("modalWithdraw").style.display = "flex";
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}

async function submitOpeningCash() {
  const payload = {
    opening_date: document.getElementById("openCashDate").value,
    cash_in_hand: parseFloat(document.getElementById("openCashTunai").value) || 0,
    bank_balance: parseFloat(document.getElementById("openCashBank").value) || 0,
    ewallet_balance: parseFloat(document.getElementById("openCashEwallet").value) || 0,
    source_evidence: document.getElementById("openCashEvidence").value,
    notes: "Saldo awal kas diverifikasi Owner via Web Portal"
  };

  try {
    const res = await fetch('/api/finance/opening-cash', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIN_STATE.token}`
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal verifikasi saldo awal.");

    alert("Saldo awal kas berhasil diverifikasi Owner!");
    closeModal("modalOpeningCash");
    await loadAllFinancialData();
  } catch (err) {
    alert("Error: " + err.message);
  }
}

async function submitClosePeriod() {
  const notes = document.getElementById("closeNotes").value || "Tutup buku bulanan disetujui Owner";
  try {
    const res = await fetch('/api/closing/close-period', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIN_STATE.token}`
      },
      body: JSON.stringify({
        month: FIN_STATE.currentMonth,
        year: FIN_STATE.currentYear,
        notes: notes
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal melakukan tutup buku.");

    alert("Tutup buku periode berhasil dieksekusi!");
    closeModal("modalClosePeriod");
    await loadAllFinancialData();
  } catch (err) {
    alert("Error Tutup Buku: " + err.message);
  }
}

async function submitReopenPeriod() {
  const reason = document.getElementById("reopenReason").value;
  if (!reason || reason.trim().length < 5) {
    alert("Alasan reopen wajib diisi minimal 5 karakter untuk audit trail.");
    return;
  }
  const periodId = `PER-${FIN_STATE.currentYear}-${FIN_STATE.currentMonth < 10 ? '0' + FIN_STATE.currentMonth : FIN_STATE.currentMonth}`;

  try {
    const res = await fetch('/api/closing/reopen-period', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIN_STATE.token}`
      },
      body: JSON.stringify({
        period_id: periodId,
        reason: reason
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal reopen periode.");

    alert("Periode berhasil di-reopen! Versi penutupan dinaikkan ke V" + (result.new_version || 2));
    closeModal("modalReopenPeriod");
    await loadAllFinancialData();
  } catch (err) {
    alert("Error Reopen: " + err.message);
  }
}

async function submitWithdraw() {
  const fundType = document.getElementById("withdrawFundType").value;
  const amount = parseFloat(document.getElementById("withdrawAmount").value) || 0;
  const notes = document.getElementById("withdrawNotes").value || "Penarikan kas";

  if (amount <= 0) {
    alert("Nominal penarikan harus lebih besar dari Rp0.");
    return;
  }

  try {
    const res = await fetch('/api/closing/fund-withdrawal', {
      method: "POST",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIN_STATE.token}`
      },
      body: JSON.stringify({
        fund_type: fundType,
        amount: amount,
        notes: notes
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal mencatat penarikan.");

    alert(`Penarikan ${formatRupiah(amount)} berhasil dicatat! Sisa saldo: ${formatRupiah(result.remaining_balance)}`);
    closeModal("modalWithdraw");
    await loadAllFinancialData();
  } catch (err) {
    alert("Error Penarikan: " + err.message);
  }
}

// Settlement Modal & Submission
window.openSettlementModal = async function() {
  document.getElementById("settlementMaxAmount").value = "";
  document.getElementById("settlementBankRef").value = "";
  document.getElementById("settlementNotes").value = "";

  // Dynamically populate vendor list from API
  try {
    const res = await fetch('/api/reports/vendor-reconciliation', {
      headers: { 'Authorization': `Bearer ${FIN_STATE.token}` }
    });
    const data = await res.json();
    if (data.success && data.vendors && data.vendors.length > 0) {
      const sel = document.getElementById("settlementVendorSelect");
      // API returns [{ vendor: {...}, consignment_summary: {...}, ... }]
      sel.innerHTML = data.vendors.map(v => {
        const vInfo = v.vendor || v;
        return `<option value="${vInfo.vendor_id}">${vInfo.vendor_name || vInfo.vendor_id} — Konsinyasi</option>`;
      }).join('');
    }
  } catch (e) {
    // Keep existing static option as fallback
  }

  document.getElementById("modalSettlement").style.display = "flex";
};

async function submitSettlement() {
  const vendorId = document.getElementById("settlementVendorSelect").value;
  const maxNetStr = document.getElementById("settlementMaxAmount").value.trim();
  const paymentMethod = document.getElementById("settlementPaymentMethod").value;
  const bankRef = document.getElementById("settlementBankRef").value.trim();
  const notes = document.getElementById("settlementNotes").value.trim();

  const payload = {
    vendor_id: vendorId,
    payment_method: paymentMethod,
    bank_reference: bankRef || "TRF-" + Date.now(),
    notes: notes
  };
  if (maxNetStr && !isNaN(Number(maxNetStr)) && Number(maxNetStr) > 0) {
    payload.max_net_transfer = Number(maxNetStr);
  }

  const btn = document.getElementById("submitSettlementBtn");
  btn.disabled = true;

  try {
    const res = await fetch('/api/vendors/settlement', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIN_STATE.token}`
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || "Gagal mengeksekusi settlement.");

    alert(`Settlement ID ${result.settlementId || result.settlement_id} berhasil diproses!\nTotal Transfer Bersih: ${formatRupiah(result.total_net_payout)}\nItem Terselesaikan: ${result.settled_items_count} transaksi.`);
    closeModal("modalSettlement");
    await loadAllFinancialData();
  } catch (err) {
    alert("Gagal settlement vendor: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

window.handleLogout = async function() {
  if (!confirm("Apakah Anda yakin ingin keluar dari Portal Admin?")) return;
  try {
    if (FIN_STATE.token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: FIN_STATE.token })
      });
    }
  } catch (e) {
  } finally {
    sessionStorage.removeItem("crocscircle_admin_token");
    window.location.href = "login.html";
  }
};
