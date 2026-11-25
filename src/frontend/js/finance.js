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
    // Route: GET /api/reports/vendor-reconciliation → { success, vendors: [{ vendor, consignment_summary, sold_items, settlement_history }] }
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
      const allSoldItems = vendors.flatMap(v => v.sold_items || []);

      FIN_STATE.soldConsignmentItems = allSoldItems;
      FIN_STATE.vendorsList = vendors;

      renderVendorReconciliation({
        vendors: vendors,
        payables: {
          total_gross_payable:   totalGross,
          total_claims_deducted: totalClaims,
          total_net_payout:      totalGross - totalClaims
        },
        sold_items: allSoldItems,
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
  const vendors = vndData.vendors || [];
  const soldItems = vndData.sold_items || [];

  // Update Partner Name in Title if available
  const titleEl = document.getElementById("vndPartnerTitle");
  if (titleEl && vendors.length > 0) {
    const vNames = vendors.map(v => (v.vendor ? (v.vendor.vendor_name || v.vendor.vendor_id) : 'Dzaki')).join(', ');
    titleEl.innerHTML = `<i class="fa-solid fa-handshake" style="color: var(--primary);"></i> Rekonsiliasi Partner Titip Jual: ${vNames}`;
  }

  // KPI Metrics
  document.getElementById("vndGrossPayable").innerText = formatRupiah(payables.total_gross_payable);
  document.getElementById("vndClaimsDeducted").innerText = formatRupiah(payables.total_claims_deducted || 0);
  document.getElementById("vndNetPayout").innerText = formatRupiah(payables.total_net_payout || payables.total_gross_payable);

  // Quick Stats Badges
  const totalUnits = soldItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalStoreIncentive = soldItems.reduce((s, it) => s + (Number(it.total_crocs_incentive) || 0), 0);
  const totalPartnerPayable = soldItems.reduce((s, it) => s + (Number(it.total_vendor_payable) || 0), 0);

  const badgeUnits = document.getElementById("badgeSoldUnits");
  const badgeInc = document.getElementById("badgeStoreIncentive");
  const badgePayable = document.getElementById("badgePartnerPayable");
  if (badgeUnits) badgeUnits.innerText = totalUnits + " psg";
  if (badgeInc) badgeInc.innerText = formatRupiah(totalStoreIncentive);
  if (badgePayable) badgePayable.innerText = formatRupiah(totalPartnerPayable);

  // Render Sold Items Table
  renderSoldConsignmentItems(soldItems);

  // Render Settlement History Table
  const tableBody = document.getElementById("vndSettlementTableBody");
  if (!history || history.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Belum ada riwayat settlement pembayaran partner pada periode ini.</td></tr>`;
  } else {
    tableBody.innerHTML = history.map(s => `
      <tr>
        <td><strong>${s.settlement_id}</strong></td>
        <td>${formatDateIndo(s.settlement_date)}</td>
        <td style="text-align: right;">${formatRupiah(s.total_gross_payable)}</td>
        <td style="text-align: right; color: #DC2626;">-${formatRupiah(s.total_claims_deducted)}</td>
        <td style="text-align: right; font-weight: 700; color: #059669;">${formatRupiah(s.total_net_payout)}</td>
        <td style="text-align: center;"><span class="badge badge-info">${s.payment_method}</span></td>
        <td style="text-align: center;"><span class="badge badge-success">COMPLETED</span></td>
      </tr>
    `).join('');
  }
}

function renderSoldConsignmentItems(items) {
  const tbody = document.getElementById("vndSoldItemsTableBody");
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2.5rem 1rem;">Tidak ada transaksi barang titip jual yang cocok dengan kriteria filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const dateFormatted = item.transaction_date ? formatDateIndo(item.transaction_date) : "—";
    const normalPrice = Number(item.normal_price) || 0;
    const sellingPrice = Number(item.selling_price) || 0;
    const isNego = item.is_negotiated || (normalPrice > 0 && sellingPrice < normalPrice);
    const disc = isNego ? (normalPrice - sellingPrice) : 0;
    const isPaid = item.settlement_status === "PAID" || Number(item.vendor_remaining_payable) === 0;

    const variantBadge = [item.color, item.size ? `Size ${item.size}` : ''].filter(Boolean).join(' • ');

    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td>
          <div style="font-family: monospace; font-size: 0.78rem; font-weight: 700; color: var(--primary);">
            ${item.sales_id}
          </div>
          <div style="font-size: 0.73rem; color: var(--text-muted); margin-top: 2px;">
            <i class="fa-regular fa-calendar" style="color: #94A3B8;"></i> ${dateFormatted}
          </div>
          <div style="font-size: 0.7rem; color: #64748B;">
            ${item.sales_channel || 'OFFLINE_STORE'}
          </div>
        </td>
        <td>
          <div style="font-weight: 700; font-size: 0.86rem; color: var(--text-main);">
            ${item.product_name || 'Crocs Classic'}
          </div>
          <div style="display: flex; gap: 0.35rem; align-items: center; margin-top: 3px; flex-wrap: wrap;">
            ${variantBadge ? `<span style="font-size: 0.72rem; background: #F1F5F9; color: #475569; padding: 1px 6px; border-radius: 4px; font-weight: 600;">${variantBadge}</span>` : ''}
            <span style="font-family: monospace; font-size: 0.7rem; color: #94A3B8;">${item.sku || item.variant_id}</span>
          </div>
        </td>
        <td style="text-align: center; font-weight: 700; font-size: 0.88rem;">
          ${item.quantity || 1} psg
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">
            ${formatRupiah(normalPrice)}
          </span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="font-weight: 800; font-size: 0.95rem; color: ${isNego ? '#B45309' : 'var(--text-main)'};">
            ${formatRupiah(sellingPrice)}
          </div>
          ${isNego ? `
            <span style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.68rem; background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; padding: 1px 5px; border-radius: 4px; font-weight: 700; margin-top: 2px;">
              <i class="fa-solid fa-tag"></i> Nego -${formatRupiah(disc)}
            </span>
          ` : `
            <span style="font-size: 0.68rem; color: #059669; font-weight: 600;">
              <i class="fa-solid fa-circle-check"></i> Normal
            </span>
          `}
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <span style="display: inline-block; font-weight: 800; font-size: 0.8rem; color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 3px 8px; border-radius: 5px;">
            🔒 ${formatRupiah(item.crocs_incentive_unit)}
          </span>
          <div style="font-size: 0.68rem; color: #065F46; margin-top: 2px;">Laba Toko Terkunci</div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="font-weight: 700; font-size: 0.88rem; color: #1D4ED8;">
            ${formatRupiah(item.vendor_payable_unit)}
          </div>
          <div style="font-size: 0.68rem; color: var(--text-muted);">per pasang</div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <span style="font-weight: 800; font-size: 0.98rem; color: #059669;">
            ${formatRupiah(item.total_vendor_payable)}
          </span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          ${isPaid ? `
            <span style="display: inline-flex; align-items: center; gap: 4px; background: #ECFDF5; color: #059669; border: 1px solid #A7F3D0; padding: 3px 8px; border-radius: 5px; font-size: 0.74rem; font-weight: 700;">
              <i class="fa-solid fa-check-double"></i> Lunas Disetor
            </span>
          ` : `
            <span style="display: inline-flex; align-items: center; gap: 4px; background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; padding: 3px 8px; border-radius: 5px; font-size: 0.74rem; font-weight: 700;">
              <i class="fa-regular fa-clock"></i> Belum Disetor
            </span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

let soldSearchTimer = null;
window.onFilterSoldItems = function() {
  clearTimeout(soldSearchTimer);
  soldSearchTimer = setTimeout(() => {
    applySoldItemFilters();
  }, 200);
};

window.resetSoldFilters = function() {
  const searchEl = document.getElementById("filterSoldSearch");
  const statusEl = document.getElementById("filterSoldStatus");
  const negoEl = document.getElementById("filterSoldNego");
  if (searchEl) searchEl.value = "";
  if (statusEl) statusEl.value = "ALL";
  if (negoEl) negoEl.value = "ALL";
  applySoldItemFilters();
};

function applySoldItemFilters() {
  const all = FIN_STATE.soldConsignmentItems || [];
  const q = (document.getElementById("filterSoldSearch")?.value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("filterSoldStatus")?.value || "ALL";
  const negoFilter = document.getElementById("filterSoldNego")?.value || "ALL";

  const filtered = all.filter(it => {
    if (q) {
      const matchText = [
        it.sales_id, it.product_name, it.variant_id, it.sku,
        it.color, it.size, it.customer_name
      ].join(" ").toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    const isPaid = it.settlement_status === "PAID" || Number(it.vendor_remaining_payable) === 0;
    if (statusFilter === "UNPAID" && isPaid) return false;
    if (statusFilter === "PAID" && !isPaid) return false;

    const normalPrice = Number(it.normal_price) || 0;
    const sellingPrice = Number(it.selling_price) || 0;
    const isNego = it.is_negotiated || (normalPrice > 0 && sellingPrice < normalPrice);
    if (negoFilter === "NEGOTIATED" && !isNego) return false;
    if (negoFilter === "NORMAL" && isNego) return false;

    return true;
  });

  renderSoldConsignmentItems(filtered);
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

// ============================================================
// MODAL SPREADSHEET & EXCEL EXPORT
// ============================================================
window.openSpreadsheetModal = function() {
  const savedUrl = localStorage.getItem('crocscircle_spreadsheet_url') || '';
  const input = document.getElementById('spreadsheetUrlInput');
  if (input) input.value = savedUrl;
  document.getElementById('modalSpreadsheet').style.display = 'flex';
};

window.saveSpreadsheetUrlOnly = function() {
  const url = (document.getElementById('spreadsheetUrlInput')?.value || '').trim();
  if (url) {
    localStorage.setItem('crocscircle_spreadsheet_url', url);
    alert('✅ Link Google Sheets berhasil disimpan.');
  } else {
    alert('Masukkan URL Google Sheets terlebih dahulu.');
  }
};

window.saveAndOpenSpreadsheet = function() {
  const url = (document.getElementById('spreadsheetUrlInput')?.value || '').trim();
  if (!url) {
    alert('Silakan tempelkan link URL Google Sheets database Anda.');
    return;
  }
  localStorage.setItem('crocscircle_spreadsheet_url', url);
  window.open(url, '_blank');
  closeModal('modalSpreadsheet');
};

window.downloadFinancialExcel = function() {
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const monthLabel = monthNames[FIN_STATE.currentMonth] || `Bulan_${FIN_STATE.currentMonth}`;
  const yearLabel = FIN_STATE.currentYear;

  // Retrieve current report figures
  const rev = (FIN_STATE.incomeReport && FIN_STATE.incomeReport.revenue_breakdown) || {};
  const exp = (FIN_STATE.incomeReport && FIN_STATE.incomeReport.expenses_breakdown) || {};
  const hpp = (FIN_STATE.incomeReport && FIN_STATE.incomeReport.hpp_breakdown) || {};
  const pnl = FIN_STATE.incomeReport || {};
  const cash = FIN_STATE.cashFlowReport || {};
  const soldItems = FIN_STATE.soldConsignmentItems || [];

  let csvContent = `\uFEFF`; // UTF-8 BOM for Microsoft Excel compatibility

  // 1. Header
  csvContent += `LAPORAN KEUANGAN & PEMBUKUAN CROCSCIRCLE.ID\n`;
  csvContent += `Periode;${monthLabel} ${yearLabel}\n`;
  csvContent += `Tanggal Export;${new Date().toLocaleString('id-ID')}\n\n`;

  // 2. Laba Rugi
  csvContent += `=== LAPORAN LABA RUGI (P&L) ===\n`;
  csvContent += `Komponen Akuntansi;Nominal (Rp)\n`;
  csvContent += `Penjualan Retail Stok Sendiri;${rev.own_sales_omzet || 0}\n`;
  csvContent += `Insentif / Laba Jual Titip Jual (Dzaki);${rev.consignment_incentive_omzet || 0}\n`;
  csvContent += `Pre-Order (PO) Lunas Diakui;${rev.po_recognized_omzet || 0}\n`;
  csvContent += `TOTAL OMZET RESMI;${rev.total_omzet || 0}\n`;
  csvContent += `Total HPP FIFO Terakui;${hpp.total_hpp || 0}\n`;
  csvContent += `LABA KOTOR (GROSS PROFIT);${pnl.gross_profit || 0}\n`;
  csvContent += `Beban Operasional Usaha;${exp.operational_expenses || 0}\n`;
  csvContent += `LABA BERSIH BERJALAN;${pnl.net_profit || 0}\n\n`;

  // 3. Arus Kas
  csvContent += `=== LAPORAN ARUS KAS (CASH FLOW) ===\n`;
  csvContent += `Komponen Kas;Nominal (Rp)\n`;
  csvContent += `Saldo Awal Kas;${cash.beginning_cash || 0}\n`;
  csvContent += `Total Kas Masuk (Customer Receipts);${(cash.cash_inflows && cash.cash_inflows.total_cash_inflow) || 0}\n`;
  csvContent += `Total Kas Keluar (Disbursements);${(cash.cash_outflows && cash.cash_outflows.total_cash_outflow) || 0}\n`;
  csvContent += `Net Cash Flow Periode Ini;${cash.net_cash_flow || 0}\n`;
  csvContent += `SALDO AKHIR KAS BERJALAN;${cash.ending_cash || 0}\n\n`;

  // 4. Rincian Barang Titip Jual
  csvContent += `=== RINCIAN PENJUALAN BARANG TITIP JUAL (DZAKI) ===\n`;
  csvContent += `ID Penjualan;Tanggal;Produk;Varian;SKU;Qty;Harga Normal;Harga Laku Kasir;Status Nego;Laba Toko;Hak Bersih Partner;Total Setor;Status Setoran\n`;

  if (soldItems.length > 0) {
    soldItems.forEach(it => {
      const isNego = it.is_negotiated ? 'NEGO' : 'NORMAL';
      const variantStr = [it.color, it.size ? `Size ${it.size}` : ''].filter(Boolean).join(' ');
      csvContent += `${it.sales_id};${it.transaction_date || ''};"${it.product_name || ''}";"${variantStr}";${it.sku || it.variant_id};${it.quantity || 1};${it.normal_price || 0};${it.selling_price || 0};${isNego};${it.crocs_incentive_unit || 0};${it.vendor_payable_unit || 0};${it.total_vendor_payable || 0};${it.settlement_status || 'UNPAID'}\n`;
    });
  } else {
    csvContent += `Belum ada transaksi titip jual pada periode ini.;;;;;;;;;;;;\n`;
  }

  // Trigger download as CSV blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laporan_Keuangan_CrocsCircle_${monthLabel}_${yearLabel}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
