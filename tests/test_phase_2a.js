/**
 * CROCSCIRCLE.ID — PHASE 2A TEST SUITE RUNNER
 * Verifies all 9 mandatory requirements:
 * 1. Inisialisasi pertama kali
 * 2. Inisialisasi kedua kali tanpa kehilangan data (Idempotent)
 * 3. Deteksi struktur tabel tidak sesuai skema
 * 4. Login berhasil dan gagal (termasuk proteksi lockout brute-force)
 * 5. Password tidak tersimpan sebagai plaintext (PBKDF2-HMAC-SHA256)
 * 6. Session valid, kedaluwarsa, dan logout
 * 7. Owner 1 dan Owner 2 memiliki hak akses setara
 * 8. Admin ditolak ketika mengakses endpoint khusus Owner (403 Forbidden)
 * 9. Pengguna tanpa session ditolak ketika mengakses endpoint admin (401 Unauthorized)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Mock Google Apps Script Environment for node execution
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
  setValue(val) {
    return this.setValues([[val]]);
  }
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
    this.cells = {}; // row -> col -> value
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
    // Shift rows
    const newCells = {};
    let newIndex = 1;
    Object.keys(this.cells).sort((a,b)=>Number(a)-Number(b)).forEach(k => {
      if (Number(k) < rowIndex) {
        newCells[k] = this.cells[k];
      } else if (Number(k) > rowIndex) {
        newCells[Number(k) - 1] = this.cells[k];
      }
    });
    this.cells = newCells;
  }
  setRowHeight() {}
  setFrozenRows() {}
  setColumnWidth() {}
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
  deleteSheet(sheet) {
    delete this.sheets[sheet.name];
  }
  getSheets() {
    return Object.values(this.sheets);
  }
}

// Global Mocks for GAS
const activeSS = new MockSpreadsheet();
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => activeSS
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};

global.Logger = {
  log: (...args) => {} // console.log('[GAS]', ...args)
};

global.Utilities = {
  computeHmacSha256Signature: (value, key) => {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(value);
    return Array.from(hmac.digest());
  },
  formatDate: (date, tz, fmt) => {
    return date.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  }
};

// Load actual code from src/backend
const dbHelperCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'DatabaseHelper.gs'), 'utf8');
const initDbCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'InitDatabase.gs'), 'utf8');
const authCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'AuthService.gs'), 'utf8');

// Evaluate in global context
(new Function(dbHelperCode + '\nglobal.DatabaseHelper = DatabaseHelper;'))();
(new Function(initDbCode + '\nglobal.initializeCrocsCircleDatabase = initializeCrocsCircleDatabase; global.CROCS_SCHEMA_V120 = CROCS_SCHEMA_V120;'))();
(new Function(authCode + '\nglobal.AuthService = AuthService;'))();

// Test Runner
const testResults = [];

function runTest(name, fn) {
  try {
    fn();
    testResults.push({ name: name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    testResults.push({ name: name, passed: false, error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log("=== MEMULAI PENGUJIAN OTOMATIS PHASE 2A ===\n");

// TEST 1: Inisialisasi Pertama Kali
runTest("1. Inisialisasi Pertama Kali (Minimal 21 Tabel)", () => {
  const res = initializeCrocsCircleDatabase();
  if (!res.success) throw new Error("Inisialisasi gagal");
  if (res.totalTables < 21) throw new Error(`Total tabel ${res.totalTables}, harusnya minimal 21`);
  
  // Periksa tabel penting ada
  ["MASTER_PRODUK", "VARIAN_PRODUK", "VENDORS", "STOK", "MUTASI_STOK", "PENJUALAN", 
   "DETAIL_PENJUALAN", "SETTLEMENT_VENDOR", "DETAIL_SETTLEMENT_VENDOR", "PRE_ORDER",
   "PEMBAYARAN_PO", "PEMBELIAN_STOK", "DETAIL_PEMBELIAN", "PENGELUARAN",
   "PEMBAGIAN_KEUNTUNGAN", "PERIODE_KEUANGAN", "SALDO_DANA", "USERS", "PENGATURAN",
   "KATEGORI", "LOG_AKTIVITAS"].forEach(tableName => {
    const s = activeSS.getSheetByName(tableName);
    if (!s) throw new Error(`Sheet ${tableName} tidak terbentuk`);
    if (s.getLastRow() < 1) throw new Error(`Sheet ${tableName} tidak memiliki header`);
  });

  // Periksa default vendor Dzaki ada
  const vendors = DatabaseHelper.getAllRows("VENDORS");
  if (vendors.length !== 1 || vendors[0].vendor_id !== "VND-DZAKI") {
    throw new Error("Default vendor Dzaki tidak tersimpan");
  }
});

// TEST 2: Inisialisasi Kedua Kali Tanpa Kehilangan Data (Idempotency)
runTest("2. Inisialisasi Kedua Kali Tanpa Kehilangan Data (Idempotency)", () => {
  // Masukkan 1 kategori buatan
  DatabaseHelper.insertRow("KATEGORI", {
    category_id: "CAT-CUSTOM",
    category_name: "Custom Category",
    description: "Testing",
    is_active: true
  });
  const countBefore = DatabaseHelper.getAllRows("KATEGORI").length;

  // Jalankan ulang init
  const res2 = initializeCrocsCircleDatabase();
  const countAfter = DatabaseHelper.getAllRows("KATEGORI").length;

  if (countBefore !== countAfter) {
    throw new Error(`Data berubah setelah re-init! Sebelum: ${countBefore}, Sesudah: ${countAfter}`);
  }
  const custom = DatabaseHelper.getRowByPk("KATEGORI", "category_id", "CAT-CUSTOM");
  if (!custom) throw new Error("Data custom hilang setelah inisialisasi ulang!");
});

// TEST 3: Deteksi dan Penanganan Struktur Tabel Tidak Sesuai Skema
runTest("3. Struktur Tabel Tidak Sesuai Skema (Penambahan Kolom Aman)", () => {
  // Simulasikan tabel PENGATURAN kehilangan kolom 'new_feature_flag'
  const sheet = activeSS.getSheetByName("PENGATURAN");
  const headersBefore = sheet.getLastColumn();
  
  // ensureTable dengan tambahan kolom
  const expectedWithNewCol = ["setting_key", "setting_value", "description", "updated_by", "updated_at", "new_feature_flag"];
  const ensureRes = DatabaseHelper.ensureTable("PENGATURAN", expectedWithNewCol);
  
  if (ensureRes.status !== "COLUMNS_EXTENDED") {
    throw new Error(`Status harusnya COLUMNS_EXTENDED, tapi ${ensureRes.status}`);
  }
  if (!ensureRes.missingAdded.includes("new_feature_flag")) {
    throw new Error("Kolom new_feature_flag gagal ditambahkan");
  }
  if (sheet.getLastColumn() !== headersBefore + 1) {
    throw new Error("Header tidak bertambah 1 kolom");
  }
});

// TEST 4 & 5: Setup Akun Owner, Password Tidak Plaintext (PBKDF2), Login Berhasil & Gagal
let owner1Token = "";
let owner2Token = "";
runTest("4. Setup Owner, Password PBKDF2 (Bukan Plaintext) & Login Berhasil/Gagal", () => {
  // Buat Owner 1 (Hafiz)
  const resHafiz = AuthService.setupOwnerAccount("hafiz", "Hafiz Andrean", "RahasiaHafiz2026!");
  if (!resHafiz.success) throw new Error("Gagal setup Owner Hafiz");

  // Buat Owner 2 (Harits)
  const resHarits = AuthService.setupOwnerAccount("harits", "Harits", "RahasiaHarits2026!");
  if (!resHarits.success) throw new Error("Gagal setup Owner Harits");

  // Periksa tabel USERS: pastikan password TIDAK tersimpan sebagai plaintext!
  const userRow = DatabaseHelper.getRowByPk("USERS", "username", "hafiz");
  if (userRow.password_hash.includes("RahasiaHafiz2026!")) {
    throw new Error("BAHAYA: Password tersimpan sebagai plaintext!");
  }
  if (!userRow.password_hash.startsWith("PBKDF2_HMAC_SHA256$25000$")) {
    throw new Error("Format hash bukan PBKDF2-HMAC-SHA256 dengan 25.000 iterasi!");
  }

  // Uji Login Gagal (Password salah)
  const failLogin = AuthService.login("hafiz", "SalahPassword123");
  if (failLogin.success) throw new Error("Login harusnya gagal untuk password salah");
  if (!failLogin.error.includes("Username atau password salah")) {
    throw new Error("Pesan error tidak sesuai standar keamanan");
  }

  // Uji Login Berhasil
  const okLogin1 = AuthService.login("hafiz", "RahasiaHafiz2026!");
  if (!okLogin1.success || !okLogin1.token) throw new Error("Login Owner 1 gagal");
  owner1Token = okLogin1.token;

  const okLogin2 = AuthService.login("harits", "RahasiaHarits2026!");
  if (!okLogin2.success || !okLogin2.token) throw new Error("Login Owner 2 gagal");
  owner2Token = okLogin2.token;
});

// TEST 6: Proteksi Brute-Force Lockout
runTest("5. Proteksi Brute-Force Lockout (Terkunci Setelah 5x Gagal)", () => {
  // Coba login salah 5x untuk user harits
  for (let i = 0; i < 5; i++) {
    AuthService.login("harits", "WrongPass" + i);
  }

  // Coba login ke-6 meskipun password BENAR, harus tetap ditolak karena akun terkunci!
  const lockedAttempt = AuthService.login("harits", "RahasiaHarits2026!");
  if (lockedAttempt.success) throw new Error("Akun harusnya terkunci setelah 5x gagal berturut-turut!");
  if (!lockedAttempt.error.includes("Akun terkunci") && !lockedAttempt.error.includes("dikunci")) {
    throw new Error(`Pesan lockout tidak sesuai: ${lockedAttempt.error}`);
  }

  // Reset lockout untuk testing selanjutnya
  DatabaseHelper.updateRowByPk("USERS", "username", "harits", {
    failed_attempts: 0,
    locked_until: ""
  });
});

// TEST 7: Validasi Session, Kedaluwarsa, dan Logout
runTest("6. Session Valid, Kedaluwarsa, dan Logout", () => {
  // Uji validasi sesi normal
  const check = AuthService.validateSession(owner1Token);
  if (!check.valid || check.user.username !== "hafiz") {
    throw new Error("Sesi valid gagal diverifikasi");
  }

  // Uji sesi palsu
  const fakeCheck = AuthService.validateSession("fake_token_abc_1234567890123456789012345678901234567890123456789012");
  if (fakeCheck.valid) throw new Error("Sesi palsu tidak boleh valid");

  // Uji sesi kedaluwarsa (simulasikan masa lalu)
  DatabaseHelper.updateRowByPk("USERS", "username", "hafiz", {
    session_expires_at: new Date(Date.now() - 1000)
  });
  const expiredCheck = AuthService.validateSession(owner1Token);
  if (expiredCheck.valid) throw new Error("Sesi kedaluwarsa harusnya invalid");

  // Login ulang untuk dapat token baru
  const reLogin = AuthService.login("hafiz", "RahasiaHafiz2026!");
  owner1Token = reLogin.token;

  // Uji Logout
  const logoutRes = AuthService.logout(owner1Token);
  if (!logoutRes.success) throw new Error("Logout gagal");

  const afterLogoutCheck = AuthService.validateSession(owner1Token);
  if (afterLogoutCheck.valid) throw new Error("Sesi harusnya invalid setelah logout");

  // Login kembali untuk tes berikutnya
  owner1Token = AuthService.login("hafiz", "RahasiaHafiz2026!").token;
});

// TEST 8: Kesetaraan Hak Akses Owner 1 & Owner 2, dan Pembuatan Admin
let adminToken = "";
runTest("7. Owner 1 dan Owner 2 Memiliki Hak Akses Setara & Pembuatan Akun Admin", () => {
  // Owner 1 dapat memanggil requireOwner
  const user1 = AuthService.requireOwner(owner1Token);
  if (user1.role !== "OWNER") throw new Error("Owner 1 role salah");

  // Owner 2 dapat memanggil requireOwner
  const user2 = AuthService.requireOwner(owner2Token);
  if (user2.role !== "OWNER") throw new Error("Owner 2 role salah");

  // Owner 1 membuat Admin
  const adminRes = AuthService.createAdminAccount(owner1Token, "admin_toko", "Admin Bazar", "AdminSecure123!");
  if (!adminRes.success || adminRes.role !== "ADMIN") throw new Error("Gagal membuat admin");

  // Login Admin
  const adminLogin = AuthService.login("admin_toko", "AdminSecure123!");
  if (!adminLogin.success) throw new Error("Admin gagal login");
  adminToken = adminLogin.token;
});

// TEST 9: Admin Ditolak Mengakses Endpoint Owner (403) & Tanpa Sesi Ditolak (401)
runTest("8. Admin Ditolak Pada Endpoint Owner (403) & Akses Tanpa Sesi Ditolak (401)", () => {
  // 1. Admin memanggil requireOwner -> HARUS DITOLAK
  let adminForbidden = false;
  try {
    AuthService.requireOwner(adminToken);
  } catch (err) {
    if (err.message.includes("403 Forbidden")) {
      adminForbidden = true;
    }
  }
  if (!adminForbidden) {
    throw new Error("Admin berhasil mengakses requireOwner, harusnya DITOLAK 403 Forbidden!");
  }

  // 2. Admin memanggil requireAdminOrOwner -> HARUS LOLOS
  const adminAllowed = AuthService.requireAdminOrOwner(adminToken);
  if (adminAllowed.role !== "ADMIN") {
    throw new Error("Admin gagal mengakses endpoint operasional");
  }

  // 3. Panggilan tanpa token / token acak -> HARUS DITOLAK 401
  let unauthBlocked = false;
  try {
    AuthService.requireSession("invalid_random_token_12345678901234567890123456789012345678901234");
  } catch (err) {
    if (err.message.includes("401 Unauthorized")) {
      unauthBlocked = true;
    }
  }
  if (!unauthBlocked) {
    throw new Error("Panggilan tanpa sesi valid harusnya DITOLAK 401 Unauthorized!");
  }
});

console.log("\n=== HASIL REKAPITULASI PENGUJIAN PHASE 2A ===");
const passedCount = testResults.filter(r => r.passed).length;
console.log(`Total Pengujian : ${testResults.length}`);
console.log(`Berhasil        : ${passedCount}`);
console.log(`Gagal           : ${testResults.length - passedCount}`);

if (passedCount === testResults.length) {
  console.log("\nSEMUA PENGUJIAN PHASE 2A BERHASIL 100%!");
} else {
  console.error("\nBEBERAPA PENGUJIAN GAGAL.");
  process.exit(1);
}
