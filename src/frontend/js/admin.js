// CrocsCircle.ID — Admin Dashboard Script (Vanilla JS)
// Integrates with AuthService & AdminController with strict RBAC & Real Data

const ADMIN_STATE = {
  token: null,
  user: null,
  dashboardData: null
};

// Helper: Format Rupiah
function formatRupiah(num) {
  if (num === null || num === undefined || isNaN(num)) return "Rp0";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(num);
}

// Helper: Format Date
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

// Initialize and Guard Dashboard
document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("crocscircle_admin_token");
  if (!token) {
    // Sesi tidak ada, lempar ke login
    window.location.href = "login.html";
    return;
  }

  ADMIN_STATE.token = token;

  // Verifikasi Sesi ke Server (Token dikirim via Authorization Header, BUKAN URL)
  try {
    const sessionRes = await fetch('/api/session', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success || !sessionData.user) {
      alert("Sesi Anda telah kedaluwarsa atau tidak valid. Silakan masuk kembali.");
      sessionStorage.removeItem("crocscircle_admin_token");
      sessionStorage.removeItem("crocscircle_admin_user");
      window.location.href = "login.html";
      return;
    }

    ADMIN_STATE.user = sessionData.user;
    renderUserProfile(sessionData.user);

    // Ambil Data Dashboard Asli dari Server
    await loadDashboardData();

    // Sembunyikan Overlay Loading, Tampilkan Layout Utama
    document.getElementById("authLoadingOverlay").style.display = "none";
    document.getElementById("adminMainLayout").style.display = "flex";

  } catch (err) {
    alert("Gagal memverifikasi autentikasi ke server: " + err.message);
    window.location.href = "login.html";
  }
});

// Render User Profile & Role-Based UI
function renderUserProfile(user) {
  const fullNameEl = document.getElementById("userFullName");
  const roleBadgeEl = document.getElementById("userRoleBadge");
  const avatarEl = document.getElementById("userAvatar");
  const isOwner = user.role === "OWNER";

  fullNameEl.innerText = user.full_name || user.username;
  avatarEl.innerText = (user.full_name || user.username).charAt(0).toUpperCase();

  if (isOwner) {
    roleBadgeEl.innerHTML = `<span class="badge badge-success"><i class="fa-solid fa-crown"></i> OWNER</span>`;
    document.getElementById("ownerFinancialSection").style.display = "block";
    document.getElementById("adminRbacNotice").style.display = "none";
    
    // Tampilkan menu Owner
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "flex");
    document.querySelectorAll(".financial-col").forEach(el => el.style.display = "table-cell");
  } else {
    roleBadgeEl.innerHTML = `<span class="badge badge-info"><i class="fa-solid fa-user-gear"></i> ADMIN</span>`;
    document.getElementById("ownerFinancialSection").style.display = "none";
    document.getElementById("adminRbacNotice").style.display = "flex";
    
    // Sembunyikan menu & kolom finansial khusus Owner
    document.querySelectorAll(".owner-only").forEach(el => el.style.display = "none");
    document.querySelectorAll(".financial-col").forEach(el => el.style.display = "none");
  }
}

// Load Real Dashboard Data from Backend (Token dikirim via Authorization Header)
async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard', {
      headers: {
        'Authorization': `Bearer ${ADMIN_STATE.token}`
      }
    });
    const data = await res.json();

    if (!data.success) {
      if (data.statusCode === 401) {
        alert("Sesi tidak valid. Silakan login kembali.");
        window.location.href = "login.html";
        return;
      }
      throw new Error(data.error || "Gagal memuat data dashboard.");
    }

    ADMIN_STATE.dashboardData = data;
    renderDashboardMetrics(data);

  } catch (err) {
    console.error("Dashboard Load Error:", err);
  }
}

// Render Dashboard Metrics & Tables
function renderDashboardMetrics(data) {
  const op = data.operational || {};
  const fin = data.financial;
  const isOwner = data.user && data.user.role === "OWNER";

  // Update Periode Laporan Header
  const periodEl = document.getElementById("dashboardPeriodText");
  if (periodEl) {
    const periodNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    const monthNum = fin ? fin.month : (new Date().getMonth() + 1);
    const yearNum = fin ? fin.year : new Date().getFullYear();
    periodEl.innerText = `Periode: ${periodNames[monthNum - 1] || 'November'} ${yearNum} (Bulan Berjalan)`;
  }

  // 1. Operational KPIs (Both Owner & Admin) - Pemisahan Visual Fisik, Reservasi, dan Siap Jual
  document.getElementById("kpiPhysicalStock").innerHTML = `${op.total_physical_stock || 0} <span style="font-size: 0.9rem; font-weight: 500;">Pcs</span>`;
  const reservedEl = document.getElementById("kpiReservedStock");
  if (reservedEl) {
    reservedEl.innerHTML = `${op.total_reserved_stock || 0} <span style="font-size: 0.9rem; font-weight: 500;">Pcs</span>`;
  }
  document.getElementById("kpiAvailableStock").innerHTML = `${op.total_available_stock || 0} <span style="font-size: 0.9rem; font-weight: 500;">Pcs</span>`;
  document.getElementById("kpiActivePO").innerHTML = `${op.active_po_count || 0} <span style="font-size: 0.9rem; font-weight: 500;">PO</span>`;
  document.getElementById("kpiLowStock").innerHTML = `${op.low_stock_count || 0} <span style="font-size: 0.9rem; font-weight: 500;">Item</span>`;

  // 2. Financial KPIs (Owner Only)
  if (isOwner && fin) {
    document.getElementById("kpiOmzet").innerText = formatRupiah(fin.total_omzet);
    document.getElementById("kpiHpp").innerText = formatRupiah(fin.total_hpp);
    document.getElementById("kpiGrossProfit").innerText = formatRupiah(fin.gross_profit);
    document.getElementById("kpiExpenses").innerText = formatRupiah(fin.operational_expenses);
    document.getElementById("kpiNetProfit").innerText = formatRupiah(fin.net_profit);
    document.getElementById("kpiVendorPayables").innerText = formatRupiah(fin.vendor_payables_outstanding);
  }

  // 3. Render Low Stock Alerts Table
  const lowStockTable = document.getElementById("lowStockTableBody");
  const lowStockEmpty = document.getElementById("lowStockEmptyState");
  const lowStockBadge = document.getElementById("lowStockBadgeCount");

  lowStockBadge.innerText = `${op.low_stock_count || 0} Item`;

  if (!op.low_stock_alerts || op.low_stock_alerts.length === 0) {
    lowStockTable.innerHTML = "";
    lowStockEmpty.style.display = "block";
  } else {
    lowStockEmpty.style.display = "none";
    lowStockTable.innerHTML = op.low_stock_alerts.map(item => `
      <tr>
        <td><code>${item.sku}</code></td>
        <td><strong>${item.product_name}</strong> (${item.size})</td>
        <td style="font-weight: 800; color: var(--danger);">${item.available_stock} pcs</td>
        <td><span class="badge badge-danger">Min: ${item.minimum_stock}</span></td>
      </tr>
    `).join('');
  }

  // 4. Render Active POs Table
  const poTable = document.getElementById("activePoTableBody");
  const poEmpty = document.getElementById("activePoEmptyState");
  const poBadge = document.getElementById("activePoBadgeCount");

  poBadge.innerText = `${op.active_po_count || 0} PO`;

  if (!op.active_pos || op.active_pos.length === 0) {
    poTable.innerHTML = "";
    poEmpty.style.display = "block";
  } else {
    poEmpty.style.display = "none";
    poTable.innerHTML = op.active_pos.map(po => `
      <tr>
        <td><strong>${po.po_id}</strong></td>
        <td>${po.customer_name}</td>
        <td style="font-weight: 700;">${formatRupiah(po.total_order)}</td>
        <td>
          <span class="badge ${po.payment_status === 'PAID' ? 'badge-success' : 'badge-warning'}">
            ${po.payment_status}
          </span>
        </td>
        <td>
          <span class="badge ${po.fulfillment_status === 'DELIVERED' ? 'badge-success' : 'badge-info'}">
            ${po.fulfillment_status}
          </span>
        </td>
      </tr>
    `).join('');
  }

  // 5. Render Recent Sales Table
  const salesTable = document.getElementById("recentSalesTableBody");
  const salesEmpty = document.getElementById("recentSalesEmptyState");

  if (!op.recent_sales || op.recent_sales.length === 0) {
    salesTable.innerHTML = "";
    salesEmpty.style.display = "block";
  } else {
    salesEmpty.style.display = "none";
    salesTable.innerHTML = op.recent_sales.map(s => `
      <tr>
        <td><strong>${s.sales_id}</strong></td>
        <td>${formatDateIndo(s.transaction_date)}</td>
        <td>${s.customer_name}</td>
        <td><span class="badge badge-info">${s.sales_channel}</span></td>
        <td>${s.payment_method}</td>
        <td style="font-weight: 700; color: var(--primary);">${formatRupiah(s.gross_customer_payment)}</td>
        ${isOwner ? `
          <td class="financial-col" style="color: #991B1B; font-weight: 600;">${formatRupiah(s.total_hpp)}</td>
          <td class="financial-col" style="color: var(--success); font-weight: 700;">${formatRupiah(s.gross_profit)}</td>
        ` : ''}
        <td><span class="badge badge-success">${s.payment_status}</span></td>
      </tr>
    `).join('');
  }
}

// Placeholder modal / notification for future phases
window.showPlaceholder = function(featureName) {
  alert(`Modul "${featureName}" dijadwalkan pada fase berikutnya sesuai roadmap CrocsCircle.ID.\nFokus Phase 3C saat ini adalah Etalase Belanja Pelanggan & Keranjang Pre-Order / Ready Stock.`);
};

// Handle Logout
window.handleLogout = async function() {
  if (!confirm("Apakah Anda yakin ingin keluar dari Portal Admin?")) return;

  const token = ADMIN_STATE.token;
  try {
    if (token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
    }
  } catch (e) {
    // Continue cleanup even if network fails
  } finally {
    sessionStorage.removeItem("crocscircle_admin_token");
    sessionStorage.removeItem("crocscircle_admin_user");
    window.location.href = "login.html";
  }
};
