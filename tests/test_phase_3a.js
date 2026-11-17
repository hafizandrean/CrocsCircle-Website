/**
 * CROCSCIRCLE.ID — PHASE 3A AUTOMATED TEST SUITE RUNNER
 * Verifies all 12 mandatory criteria for Admin Authentication & Dashboard UI:
 * 1. Login Owner 1 (Hafiz)
 * 2. Login Owner 2 (Harits)
 * 3. Login Admin (Admin 1)
 * 4. Password salah ditolak & failed_attempts bertambah
 * 5. Akun tidak ditemukan ditolak dengan pesan yang tepat
 * 6. Session kedaluwarsa / invalid token ditolak (401)
 * 7. Logout berhasil & token diinvalidasi di server
 * 8. Akses dashboard tanpa login ditolak (401 Unauthorized)
 * 9. Admin dibatasi dari data finansial sensitif (is_financial_restricted: true, financial: null)
 * 10. Dashboard menampilkan data asli lengkap untuk Owner (Omzet, HPP, Laba, Stok, PO)
 * 11. Dashboard menangani kondisi data kosong secara elegan (empty state, tanpa dummy)
 * 12. Proteksi Brute-Force (Terkunci 15 menit setelah 5x gagal)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Mock GAS Environment
class MockRange {
  constructor(sheet, startRow, startCol, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.startRow = startRow;
    this.startCol = startCol;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rowIndex = this.startRow + r;
      if (!this.sheet.cells[rowIndex]) this.sheet.cells[rowIndex] = [];
      for (let c = 0; c < values[r].length; c++) {
        const colIndex = this.startCol + c;
        this.sheet.cells[rowIndex][colIndex] = values[r][c];
      }
    }
    return this;
  }
  setValue(val) { return this.setValues([[val]]); }
  getValues() {
    const result = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      const rowIndex = this.startRow + r;
      for (let c = 0; c < this.numCols; c++) {
        const colIndex = this.startCol + c;
        row.push(this.sheet.cells[rowIndex] ? this.sheet.cells[rowIndex][colIndex] : "");
      }
      result.push(row);
    }
    return result;
  }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.cells = {};
  }
  getLastRow() {
    const rowKeys = Object.keys(this.cells).map(Number).filter(k => k > 0);
    return rowKeys.length > 0 ? Math.max(...rowKeys) : 0;
  }
  getLastColumn() {
    let maxCol = 0;
    Object.values(this.cells).forEach(rowObj => {
      const colKeys = Object.keys(rowObj).map(Number).filter(k => k > 0);
      if (colKeys.length > 0) maxCol = Math.max(maxCol, ...colKeys);
    });
    return maxCol;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this, row, col, numRows, numCols);
  }
  appendRow(rowValues) {
    const nextRow = this.getLastRow() + 1;
    this.cells[nextRow] = {};
    rowValues.forEach((val, idx) => {
      this.cells[nextRow][idx + 1] = val;
    });
  }
  deleteRow(rowIndex) {
    delete this.cells[rowIndex];
    const newCells = {};
    Object.keys(this.cells).sort((a,b)=>Number(a)-Number(b)).forEach(k => {
      if (Number(k) < rowIndex) newCells[k] = this.cells[k];
      else if (Number(k) > rowIndex) newCells[Number(k) - 1] = this.cells[k];
    });
    this.cells = newCells;
  }
  setRowHeight() {}
  setFrozenRows() {}
  setColumnWidth() {}
  autoResizeColumns() {}
}

class MockSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
  deleteSheet(sheet) { delete this.sheets[sheet.name]; }
  getSheets() { return Object.values(this.sheets); }
}

const activeSS = new MockSpreadsheet();
global.SpreadsheetApp = { getActiveSpreadsheet: () => activeSS };
global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};
global.Logger = { log: (...args) => {} };
global.Utilities = {
  computeHmacSha256Signature: (value, key) => {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(value);
    return Array.from(hmac.digest());
  },
  formatDate: (date, tz, fmt) => {
    const d = new Date(date);
    const pad = n => n < 10 ? '0' + n : n;
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    if (fmt === "yyyy-MM-dd") return `${yyyy}-${MM}-${dd}`;
    if (fmt === "yyyy-MM") return `${yyyy}-${MM}`;
    return `${yyyy}${MM}${dd}-${HH}${mm}${ss}`;
  },
  computeDigest: (algo, str) => {
    return Array.from(crypto.createHash('sha256').update(str).digest());
  },
  DigestAlgorithm: { SHA_256: 'SHA_256' },
  Charset: { UTF_8: 'UTF_8' }
};

// Load backend scripts
const backendDir = path.join(__dirname, '..', 'src', 'backend');
function loadBackend(file, globalName) {
  const code = fs.readFileSync(path.join(backendDir, file), 'utf8');
  const exportStmt = globalName ? `\nglobal.${globalName} = ${globalName};` : '';
  (new Function(code + exportStmt))();
}

loadBackend('DatabaseHelper.gs', 'DatabaseHelper');
loadBackend('InitDatabase.gs', 'initializeCrocsCircleDatabase');
loadBackend('AuthService.gs', 'AuthService');
loadBackend('InventoryService.gs', 'InventoryService');
loadBackend('SalesService.gs', 'SalesService');
loadBackend('POService.gs', 'POService');
loadBackend('VendorService.gs', 'VendorService');
loadBackend('FinancialService.gs', 'FinancialService');
loadBackend('ClosingService.gs', 'ClosingService');
loadBackend('AdminController.gs', 'AdminController');

// Initialize database
initializeCrocsCircleDatabase();

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let passed = 0;
let failed = 0;

// Setup Initial Users
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
AuthService.setupOwnerAccount("harits", "Harits Owner", "HaritsOwner2026!");

// Login Hafiz to generate ownerToken for creating admin
const ownerSetupLogin = AuthService.login("hafiz", "HafizOwner2026!");
const OWNER_TOKEN = ownerSetupLogin.token;
AuthService.createAdminAccount(OWNER_TOKEN, "admin1", "Admin Operasional", "AdminOperasional2026!");

// 1. TEST LOGIN OWNER 1 (HAFIZ)
test("1. Login Owner 1 (Hafiz) berhasil & role OWNER", () => {
  const res = AdminController.login("hafiz", "HafizOwner2026!");
  if (!res.success) throw new Error("Login Owner 1 gagal: " + res.error);
  if (res.user.role !== "OWNER") throw new Error("Role harus OWNER");
  if (!res.token || res.token.length !== 64) throw new Error("Token harus 64 hex characters");
});

// 2. TEST LOGIN OWNER 2 (HARITS)
test("2. Login Owner 2 (Harits) berhasil & role OWNER", () => {
  const res = AdminController.login("harits", "HaritsOwner2026!");
  if (!res.success) throw new Error("Login Owner 2 gagal: " + res.error);
  if (res.user.role !== "OWNER") throw new Error("Role harus OWNER");
  if (!res.token || res.token.length !== 64) throw new Error("Token harus 64 hex characters");
});

// 3. TEST LOGIN ADMIN (ADMIN1)
test("3. Login Admin (Admin 1) berhasil & role ADMIN", () => {
  const res = AdminController.login("admin1", "AdminOperasional2026!");
  if (!res.success) throw new Error("Login Admin gagal: " + res.error);
  if (res.user.role !== "ADMIN") throw new Error("Role harus ADMIN");
  if (!res.token || res.token.length !== 64) throw new Error("Token harus 64 hex characters");
});

// 4. TEST PASSWORD SALAH
test("4. Password salah ditolak & counter failed_attempts bertambah", () => {
  const res = AdminController.login("hafiz", "PasswordSalah123!");
  if (res.success !== false) throw new Error("Password salah seharusnya ditolak");
  if (!res.error.includes("Username atau password salah")) {
    throw new Error("Pesan error harus informatif");
  }

  const u = DatabaseHelper.getAllRows("USERS", usr => usr.username === "hafiz")[0];
  if (parseInt(u.failed_attempts, 10) < 1) {
    throw new Error("failed_attempts harus bertambah");
  }
});

// 5. TEST AKUN TIDAK DITEMUKAN
test("5. Akun tidak ditemukan ditolak dengan pesan yang tepat", () => {
  const res = AdminController.login("user_gaib", "Bebas12345678");
  if (res.success !== false) throw new Error("User gaib harus ditolak");
  if (!res.error.includes("Username atau password salah")) {
    throw new Error("Pesan error tidak boleh membocorkan keberadaan username (anti-enumeration)");
  }
});

// 6. TEST SESSION KEDALUWARSA / INVALID TOKEN
test("6. Session kedaluwarsa atau token acak ditolak (401)", () => {
  const fakeToken = "a".repeat(64);
  const res = AdminController.getSessionUser(fakeToken);
  if (res.success !== false) throw new Error("Fake token harus ditolak");
  if (!res.error.includes("Sesi tidak ditemukan")) {
    throw new Error("Pesan error sesi harus jelas");
  }

  const dashRes = AdminController.getDashboardData(fakeToken);
  if (dashRes.success !== false || dashRes.statusCode !== 401) {
    throw new Error("Dashboard harus mengembalikan 401 Unauthorized untuk token palsu");
  }
});

// 7. TEST LOGOUT
test("7. Logout berhasil & token diinvalidasi di server", () => {
  const loginRes = AdminController.login("harits", "HaritsOwner2026!");
  const token = loginRes.token;

  // Verifikasi sesi valid sebelum logout
  const sessBefore = AdminController.getSessionUser(token);
  if (!sessBefore.success) throw new Error("Sesi sebelum logout harus valid");

  // Lakukan logout
  const logoutRes = AdminController.logout(token);
  if (!logoutRes.success) throw new Error("Logout harus sukses");

  // Verifikasi sesi tidak valid lagi setelah logout
  const sessAfter = AdminController.getSessionUser(token);
  if (sessAfter.success !== false) throw new Error("Sesi harus tidak valid setelah logout!");
});

// 8. TEST AKSES DASHBOARD TANPA LOGIN
test("8. Akses endpoint dashboard tanpa login ditolak (401 Unauthorized)", () => {
  const dashRes1 = AdminController.getDashboardData("");
  if (dashRes1.success !== false || dashRes1.statusCode !== 401) {
    throw new Error("Token kosong harus ditolak dengan 401");
  }

  const dashRes2 = AdminController.getDashboardData(null);
  if (dashRes2.success !== false || dashRes2.statusCode !== 401) {
    throw new Error("Token null harus ditolak dengan 401");
  }
});

// 9. TEST RBAC ADMIN DIBATASI DARI DATA FINANSIAL SENSITIF
test("9. Admin dibatasi dari data finansial sensitif (is_financial_restricted: true, financial: null)", () => {
  const adminLogin = AdminController.login("admin1", "AdminOperasional2026!");
  const adminToken = adminLogin.token;

  const dashData = AdminController.getDashboardData(adminToken, 11, 2026);
  if (!dashData.success) throw new Error("Admin harus bisa melihat dashboard operasional");
  if (dashData.is_financial_restricted !== true) {
    throw new Error("is_financial_restricted harus true untuk role ADMIN");
  }
  if (dashData.financial !== null) {
    throw new Error("Data finansial (HPP, Laba Bersih, Omzet) HARUS NULL / disembunyikan dari ADMIN!");
  }

  // Admin tetap bisa melihat data operasional
  if (!dashData.operational) throw new Error("Data operasional harus ada untuk Admin");
  if (typeof dashData.operational.total_available_stock !== "number") {
    throw new Error("Stok tersedia harus berupa angka");
  }
});

// 10. TEST DASHBOARD MENAMPILKAN DATA ASLI LENGKAP UNTUK OWNER
test("10. Dashboard menampilkan data asli lengkap untuk Owner (Omzet, HPP, Laba, Stok, PO)", () => {
  // Masukkan data transaksi asli
  InventoryService.receiveOwnedStockBatch("PUR-3A-01", "VAR-3A-OWN", 10, 100000, 0, "Batch 3A", "TESTER");
  SalesService.createSale({
    transaction_date: new Date("2026-11-15"),
    customer_name: "Customer Asli 3A",
    items: [{ variant_id: "VAR-3A-OWN", item_ownership: "OWNED", quantity: 2, actual_price: 250000 }]
  });

  const ownerLogin = AdminController.login("hafiz", "HafizOwner2026!");
  const ownerToken = ownerLogin.token;

  const dashData = AdminController.getDashboardData(ownerToken, 11, 2026);
  if (!dashData.success) throw new Error("Owner harus sukses mengambil dashboard");
  if (dashData.is_financial_restricted !== false) {
    throw new Error("is_financial_restricted harus false untuk role OWNER");
  }
  if (!dashData.financial) throw new Error("Data finansial harus tersedia untuk Owner");

  // Verifikasi omzet & laba nyata
  if (dashData.financial.total_omzet < 500000) {
    throw new Error(`Total omzet Owner harus >= 500.000, got ${dashData.financial.total_omzet}`);
  }
  if (dashData.financial.total_hpp < 200000) {
    throw new Error(`Total HPP Owner harus >= 200.000, got ${dashData.financial.total_hpp}`);
  }
  if (dashData.financial.gross_profit < 300000) {
    throw new Error(`Laba kotor Owner harus >= 300.000, got ${dashData.financial.gross_profit}`);
  }
});

// 11. TEST DASHBOARD MENANGANI KONDISI DATA KOSONG (EMPTY STATE)
test("11. Dashboard menangani kondisi data kosong secara elegan (empty state, tanpa dummy)", () => {
  const ownerLogin = AdminController.login("hafiz", "HafizOwner2026!");
  const ownerToken = ownerLogin.token;

  // Cek dashboard untuk bulan yang belum pernah ada transaksi sama sekali (misal bulan Februari 2029)
  const emptyDash = AdminController.getDashboardData(ownerToken, 2, 2029);
  if (!emptyDash.success) throw new Error("Dashboard data kosong harus tetap success: true");

  if (emptyDash.financial.total_omzet !== 0) throw new Error("Omzet bulan kosong harus 0");
  if (emptyDash.financial.total_hpp !== 0) throw new Error("HPP bulan kosong harus 0");
  if (emptyDash.financial.net_profit !== 0) throw new Error("Laba bersih bulan kosong harus 0");

  if (!Array.isArray(emptyDash.operational.active_pos)) throw new Error("active_pos harus berupa array");
  if (!Array.isArray(emptyDash.operational.recent_sales)) throw new Error("recent_sales harus berupa array");
});

// 12. TEST BRUTE-FORCE PROTECTION
test("12. Proteksi Brute-Force (Terkunci 15 menit setelah 5x gagal)", () => {
  // Coba login salah 5x berturut-turut pada user harits
  for (let i = 0; i < 5; i++) {
    AdminController.login("harits", "SalahPass" + i);
  }

  // Percobaan ke-6: harus terkunci!
  const lockAttempt = AdminController.login("harits", "SalahLagi");
  if (lockAttempt.success !== false) throw new Error("Akun harusnya terkunci");
  if (!lockAttempt.error.includes("terkunci") && !lockAttempt.error.includes("dikunci")) {
    throw new Error(`Pesan harus menyebut akun terkunci, got: ${lockAttempt.error}`);
  }
});

// Execute All Tests
console.log("=======================================================================");
console.log("🚀 CROCSCIRCLE.ID — PHASE 3A AUTOMATED TEST SUITE (12 CRITERIA)");
console.log("=======================================================================");

tests.forEach((t, idx) => {
  try {
    t.fn();
    console.log(`[PASS] ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${t.name}`);
    console.error(`       Error: ${err.message}`);
    failed++;
  }
});

console.log("=======================================================================");
console.log(`📊 REKAPITULASI HASIL PHASE 3A: ${passed} LULUS, ${failed} GAGAL (TOTAL: ${tests.length})`);
console.log("=======================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("✅ SELURUH 12 KRITERIA PENGUJIAN PHASE 3A LULUS 100%!");
  process.exit(0);
}
