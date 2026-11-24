// CrocsCircle.ID — System Settings Frontend Controller
// Version: 1.0.0

const SETTINGS_STATE = {
  token: null,
  user: null,
  settings: {}
};

document.addEventListener("DOMContentLoaded", async () => {
  const token = sessionStorage.getItem("crocscircle_admin_token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  SETTINGS_STATE.token = token;

  try {
    const sessionRes = await fetch('/api/session', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success || !sessionData.user) {
      alert("Sesi Anda telah kedaluwarsa. Silakan masuk kembali.");
      sessionStorage.removeItem("crocscircle_admin_token");
      sessionStorage.removeItem("crocscircle_admin_user");
      window.location.href = "login.html";
      return;
    }

    if (sessionData.user.role !== "OWNER") {
      alert("Akses Terbatas: Hanya role OWNER yang dapat mengelola Pengaturan Sistem.");
      window.location.href = "admin.html";
      return;
    }

    SETTINGS_STATE.user = sessionData.user;
    renderUserProfile(sessionData.user);

    // Muat Pengaturan
    await loadSettings();

    // Sembunyikan Loading Overlay
    document.getElementById("authLoadingOverlay").style.display = "none";
    document.getElementById("adminMainLayout").style.display = "flex";

  } catch (err) {
    alert("Gagal memverifikasi autentikasi ke server: " + err.message);
    window.location.href = "login.html";
  }
});

function renderUserProfile(user) {
  const fullNameEl = document.getElementById("userFullName");
  const avatarEl = document.getElementById("userAvatar");
  fullNameEl.innerText = user.full_name || user.username;
  avatarEl.innerText = (user.full_name || user.username).charAt(0).toUpperCase();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings', {
      headers: { 'Authorization': `Bearer ${SETTINGS_STATE.token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    SETTINGS_STATE.settings = data.settings || {};

    // Isi Nilai ke Form
    document.getElementById("settingStoreName").value = SETTINGS_STATE.settings.STORE_NAME || "CrocsCircle.ID";
    document.getElementById("settingWhatsappNumber").value = SETTINGS_STATE.settings.WHATSAPP_NUMBER || "6281234567890";
    document.getElementById("settingMinStockAlert").value = SETTINGS_STATE.settings.MINIMUM_STOCK_ALERT || 2;

    const o1Name = SETTINGS_STATE.settings.OWNER1_NAME || "Owner 1";
    const o2Name = SETTINGS_STATE.settings.OWNER2_NAME || "Owner 2";
    document.getElementById("labelOwner1").innerText = `${o1Name} (%):`;
    document.getElementById("labelOwner2").innerText = `${o2Name} (%):`;

    document.getElementById("settingOwner1Pct").value = SETTINGS_STATE.settings.OWNER1_PERCENTAGE || 20;
    document.getElementById("settingOwner2Pct").value = SETTINGS_STATE.settings.OWNER2_PERCENTAGE || 20;
    document.getElementById("settingEmergencyPct").value = SETTINGS_STATE.settings.EMERGENCY_PERCENTAGE || 10;
    document.getElementById("settingRetainedPct").value = SETTINGS_STATE.settings.RETAINED_PERCENTAGE || 50;

    // Render Akun Pengguna
    const usersTable = document.getElementById("usersTableBody");
    if (data.users && data.users.length > 0) {
      usersTable.innerHTML = data.users.map(u => `
        <tr>
          <td><code>${u.user_id}</code></td>
          <td><strong>${u.full_name || u.username}</strong></td>
          <td>${u.username}</td>
          <td style="text-align: center;">
            <span class="badge ${u.role === 'OWNER' ? 'badge-success' : 'badge-info'}">
              <i class="fa-solid ${u.role === 'OWNER' ? 'fa-crown' : 'fa-user-gear'}"></i> ${u.role}
            </span>
          </td>
          <td style="text-align: center;">
            <span class="badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${u.status || 'ACTIVE'}</span>
          </td>
        </tr>
      `).join('');
    }

  } catch (err) {
    console.error("Gagal memuat pengaturan:", err);
  }
}

async function saveAllSettings() {
  const storeName = document.getElementById("settingStoreName").value.trim();
  const waNumber = document.getElementById("settingWhatsappNumber").value.trim();
  const minStock = parseInt(document.getElementById("settingMinStockAlert").value, 10) || 2;

  const o1 = parseFloat(document.getElementById("settingOwner1Pct").value) || 0;
  const o2 = parseFloat(document.getElementById("settingOwner2Pct").value) || 0;
  const em = parseFloat(document.getElementById("settingEmergencyPct").value) || 0;
  const ret = parseFloat(document.getElementById("settingRetainedPct").value) || 0;

  const total = o1 + o2 + em + ret;
  const warnEl = document.getElementById("allocationSumWarning");
  if (Math.abs(total - 100) > 0.01) {
    warnEl.style.display = "block";
    document.getElementById("currentTotalAllocation").innerText = total;
    alert(`Total alokasi pembagian laba harus tepat 100%. Saat ini: ${total}%.`);
    return;
  }
  warnEl.style.display = "none";

  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SETTINGS_STATE.token}`
      },
      body: JSON.stringify({
        settings: {
          STORE_NAME: storeName,
          WHATSAPP_NUMBER: waNumber,
          MINIMUM_STOCK_ALERT: String(minStock),
          OWNER1_PERCENTAGE: String(o1),
          OWNER2_PERCENTAGE: String(o2),
          EMERGENCY_PERCENTAGE: String(em),
          RETAINED_PERCENTAGE: String(ret)
        }
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error);

    alert("Pengaturan sistem berhasil disimpan!");
    await loadSettings();
  } catch (e) {
    alert("Gagal menyimpan pengaturan: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

window.handleLogout = async function() {
  if (!confirm("Apakah Anda yakin ingin keluar dari Portal Admin?")) return;
  try {
    if (SETTINGS_STATE.token) {
      await fetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: SETTINGS_STATE.token })
      });
    }
  } catch (e) {
  } finally {
    sessionStorage.removeItem("crocscircle_admin_token");
    sessionStorage.removeItem("crocscircle_admin_user");
    window.location.href = "login.html";
  }
};
