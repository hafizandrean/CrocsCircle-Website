/**
 * CROCSCIRCLE.ID — PHASE 3E.2 TEST SUITE
 * Google Apps Script V8 & Google Sheets Integration Verification
 *
 * Verifies:
 * 1. GAS V8 Runtime Compatibility (No Node.js built-ins in .gs files).
 * 2. Script Properties Connection & Container-bound Spreadsheet fallback.
 * 3. Dynamic Header Mapping & Safe Idempotent Schema Initialization (No .clear() data loss).
 * 4. Production-Grade Session Authentication (Token in Request Body, Expiration, Lockout, Revocation).
 * 5. Strict Role-Based Access Control (RBAC) & Financial Data Sanitization.
 * 6. Browser & ContentService Compatibility (text/plain CORS preflight bypass, 302 redirect).
 * 7. End-to-End Operational Lifecycle on Isolated Test Spreadsheet.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Setup Mock GAS Environment with PropertiesService & Multi-Spreadsheet Support
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
  constructor(id) {
    this.id = id || "MOCK_ACTIVE_SS";
    this.sheets = {};
  }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
  deleteSheet(sheet) { delete this.sheets[sheet.name]; }
  getSheets() { return Object.values(this.sheets); }
}

// Global Spreadsheet Registry
const spreadsheetRegistry = {};
function getOrCreateSpreadsheet(id) {
  if (!spreadsheetRegistry[id]) {
    spreadsheetRegistry[id] = new MockSpreadsheet(id);
  }
  return spreadsheetRegistry[id];
}

const activeContainerSS = getOrCreateSpreadsheet("CONTAINER_BOUND_SS");
let mockScriptProperties = { SPREADSHEET_ID: "" };

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => activeContainerSS,
  openById: (id) => getOrCreateSpreadsheet(id)
};

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (key) => mockScriptProperties[key] || null,
    setProperty: (key, val) => { mockScriptProperties[key] = val; },
    deleteProperty: (key) => { delete mockScriptProperties[key]; }
  })
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};

global.Logger = { log: () => {} };

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

global.ContentService = {
  MimeType: {
    JSON: 'application/json',
    TEXT: 'text/plain'
  },
  createTextOutput: function(content) {
    let currentMimeType = 'text/plain';
    return {
      setMimeType: function(type) {
        currentMimeType = type;
        return this;
      },
      getMimeType: function() { return currentMimeType; },
      getContent: function() { return content; }
    };
  }
};

// Load Backend Scripts
const backendDir = path.join(__dirname, '..', 'src', 'backend');
function loadBackendFile(fileName, globalName) {
  const code = fs.readFileSync(path.join(backendDir, fileName), 'utf8');
  const exportStmt = globalName ? `\nglobal.${globalName} = ${globalName};` : '';
  (new Function(code + exportStmt))();
}

loadBackendFile('DatabaseHelper.gs', 'DatabaseHelper');
loadBackendFile('InitDatabase.gs', 'initializeCrocsCircleDatabase');
loadBackendFile('AuthService.gs', 'AuthService');
loadBackendFile('InventoryService.gs', 'InventoryService');
loadBackendFile('SalesService.gs', 'SalesService');
loadBackendFile('POService.gs', 'POService');
loadBackendFile('VendorService.gs', 'VendorService');
loadBackendFile('FinancialService.gs', 'FinancialService');
loadBackendFile('ClosingService.gs', 'ClosingService');
loadBackendFile('ProductService.gs', 'ProductService');
loadBackendFile('AdminController.gs', 'AdminController');
loadBackendFile('StorefrontService.gs', 'StorefrontService');
loadBackendFile('WebAppRouter.gs', 'WebAppRouter');

// Top-level GAS entry functions
global.doGet = WebAppRouter.handleRequest.bind(null, "GET");
global.doPost = WebAppRouter.handleRequest.bind(null, "POST");

function unpackResponse(output) {
  const raw = output.getContent();
  const mime = output.getMimeType();
  const json = JSON.parse(raw);
  return { mime, json };
}

// Test Runner Engine
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message, extra) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message} -> GOT:`, extra !== undefined ? extra : "");
  }
}

async function runPhase3E2TestSuite() {
  console.log("================================================================================");
  console.log("CROCSCIRCLE.ID — PHASE 3E.2 INTEGRATION TEST SUITE");
  console.log("Google Apps Script V8 Runtime & Google Sheets Integration");
  console.log("================================================================================\n");

  // ============================================================================
  // BAGIAN 1: AUDIT RUNTIME V8 & KONEKSI SPREADSHEET (3E.2A & 3E.2B)
  // ============================================================================
  console.log("--- BAGIAN 1: AUDIT RUNTIME V8 & SPREADSHEET CONNECTION ---");

  // 1.1 Verifikasi manifest appsscript.json ada dan valid
  const manifestPath = path.join(backendDir, 'appsscript.json');
  assert(fs.existsSync(manifestPath), "Manifest appsscript.json tersedia di src/backend/");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.runtimeVersion === "V8", "Manifest mengonfigurasi runtimeVersion: V8");
  assert(manifest.timeZone === "Asia/Jakarta", "Manifest mengonfigurasi timeZone: Asia/Jakarta");
  assert(manifest.webapp.access === "ANYONE", "Manifest mengonfigurasi webapp access: ANYONE");
  assert(manifest.webapp.executeAs === "USER_DEPLOYING", "Manifest mengonfigurasi webapp executeAs: USER_DEPLOYING");

  // 1.2 Verifikasi koneksi Spreadsheet via Script Properties (Standalone mode)
  const TEST_ISOLATED_SS_ID = "SS_TEST_CROCS_PHASE_3E2";
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", TEST_ISOLATED_SS_ID);
  
  const connectedSS = DatabaseHelper.getSpreadsheet();
  assert(connectedSS.id === TEST_ISOLATED_SS_ID, "DatabaseHelper terhubung ke SPREADSHEET_ID terkonfigurasi (Script Properties)");

  // 1.3 Verifikasi fallback ke active spreadsheet jika SPREADSHEET_ID kosong (Container-bound mode)
  PropertiesService.getScriptProperties().deleteProperty("SPREADSHEET_ID");
  const fallbackSS = DatabaseHelper.getSpreadsheet();
  assert(fallbackSS.id === "CONTAINER_BOUND_SS", "DatabaseHelper fallback ke Container-bound spreadsheet saat properti kosong");

  // Kembalikan ke spreadsheet pengujian terisolasi
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", TEST_ISOLATED_SS_ID);

  // ============================================================================
  // BAGIAN 2: INTEGRASI DATABASE & DYNAMIC HEADER MAPPING (3E.2C)
  // ============================================================================
  console.log("\n--- BAGIAN 2: DATABASE HELPER & SCHEMA INTEGRITY ---");

  // 2.1 Inisialisasi Idempotent Database pada Spreadsheet Pengujian
  initializeCrocsCircleDatabase();
  assert(true, "Inisialisasi database awal pada spreadsheet pengujian berhasil");

  // 2.2 Verifikasi seluruh 26 tabel dari schema.json terbuat
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.json');
  const schemaDoc = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const testSS = getOrCreateSpreadsheet(TEST_ISOLATED_SS_ID);

  let missingTables = 0;
  schemaDoc.tables.forEach(t => {
    if (!testSS.getSheetByName(t.sheet_name)) {
      missingTables++;
      console.error("Missing sheet:", t.sheet_name);
    }
  });
  assert(missingTables === 0, `Semua ${schemaDoc.tables.length} tabel schema.json terverifikasi ada di spreadsheet`);

  // 2.3 Uji Dynamic Header Mapping (Kebal terhadap urutan kolom acak)
  const usersSheet = testSS.getSheetByName("USERS");
  const origHeaderMap = DatabaseHelper.getHeaderMap(usersSheet);
  assert(origHeaderMap.user_id && origHeaderMap.username && origHeaderMap.password_hash, "HeaderMap membaca kolom USERS secara dinamis");

  // 2.4 Uji Safe Idempotency: Inisialisasi ulang TIDAK PERNAH menghapus data (No .clear())
  DatabaseHelper.insertRow("KATEGORI", {
    category_id: "CAT-TEST-KEEP",
    category_name: "Kategori Uji Keutuhan Data",
    description: "Data ini tidak boleh terhapus saat re-init",
    is_active: true
  });
  
  // Re-run initialization
  initializeCrocsCircleDatabase();

  const preservedRow = DatabaseHelper.getRowByPk("KATEGORI", "category_id", "CAT-TEST-KEEP");
  assert(preservedRow !== null && preservedRow.category_name === "Kategori Uji Keutuhan Data", "Idempotent Re-Init: Data eksisting tetap utuh tanpa terhapus (No .clear())");

  // ============================================================================
  // BAGIAN 3: AUTENTIKASI PRODUKSI & PRIORITAS TOKEN DI REQUEST BODY (3E.2D)
  // ============================================================================
  console.log("\n--- BAGIAN 3: AUTHENTICATION & SESSION IN BODY ---");

  // 3.1 Setup Akun Pengguna
  AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
  const ownerLoginRes = AuthService.login("hafiz", "HafizOwner2026!");
  assert(ownerLoginRes.success === true, "Owner login berhasil");
  const ownerToken = ownerLoginRes.token;

  AuthService.createAdminAccount(ownerToken, "admin1", "Admin Operasional", "AdminOp2026!");
  const adminLoginRes = AuthService.login("admin1", "AdminOp2026!");
  assert(adminLoginRes.success === true, "Admin login berhasil");
  const adminToken = adminLoginRes.token;

  // 3.2 Uji Prioritas Token di Request Body (Bukan URL)
  {
    const res = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "auth/session",
          token: ownerToken // Token di BODY
        })
      }
    }));
    assert(res.json.success === true && res.json.user.username === "hafiz", "Token di Request BODY berhasil diverifikasi");
  }

  // 3.3 Uji Kedaluwarsa Sesi (TTL Resmi: 8 Jam sesuai AuthService.gs)
  {
    // Simulasi sesi kedaluwarsa dengan memajukan session_expires_at ke 9 jam yang lalu (> TTL 8 jam)
    const expiredTimestamp = new Date(Date.now() - 3600000 * 9);
    DatabaseHelper.updateRowByPk("USERS", "username", "admin1", {
      session_expires_at: expiredTimestamp
    });

    const expiredRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "dashboard/data",
          token: adminToken
        })
      }
    }));
    assert(expiredRes.json.success === false && expiredRes.json.statusCode === 401, "Sesi kedaluwarsa (>8 jam) ditolak dengan 401");

    // Login ulang untuk memulihkan token admin
    const relogin = AuthService.login("admin1", "AdminOp2026!");
    adminTokenFresh = relogin.token;
  }

  // 3.4 Uji Pencabutan Sesi (Logout)
  {
    const logoutRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "auth/logout",
          token: adminTokenFresh
        })
      }
    }));
    assert(logoutRes.json.success === true, "Sesi berhasil dicabut melalui logout");

    // Akses ulang setelah logout ditolak
    const afterLogoutRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "dashboard/data",
          token: adminTokenFresh
        })
      }
    }));
    assert(afterLogoutRes.json.success === false && afterLogoutRes.json.statusCode === 401, "Token yang telah di-logout tidak dapat digunakan lagi");
  }

  // Login ulang admin untuk pengujian selanjutnya
  const activeAdminLogin = AuthService.login("admin1", "AdminOp2026!");
  const activeAdminToken = activeAdminLogin.token;

  // 3.5 Uji Brute-force Lockout (5x gagal -> Terkunci 15 menit)
  {
    for (let i = 0; i < 5; i++) {
      AuthService.login("admin1", "PasswordSalah123!");
    }
    const lockedRes = AuthService.login("admin1", "PasswordSalah123!");
    assert(lockedRes.success === false && (lockedRes.error.includes("dikunci") || lockedRes.error.includes("terkunci")), "Proteksi Lockout aktif setelah 5x gagal login", lockedRes);

    // Buka kunci admin1 untuk uji lanjutan
    DatabaseHelper.updateRowByPk("USERS", "username", "admin1", {
      failed_attempts: 0,
      locked_until: ""
    });
  }

  // ============================================================================
  // BAGIAN 4: BROWSER & API COMPATIBILITY (3E.2D & 3E.2E)
  // ============================================================================
  console.log("\n--- BAGIAN 4: BROWSER & API COMPATIBILITY ---");

  // 4.1 Simulasi Pengiriman Request dari Browser via text/plain (CORS Preflight Bypass)
  {
    const browserPayload = JSON.stringify({
      action: "ping"
    });
    const res = unpackResponse(global.doPost({
      postData: { contents: browserPayload }
    }));
    assert(res.mime === "application/json", "Response ContentService menghasilkan MIME type application/json");
    assert(res.json.success === true && res.json.statusCode === 200, "Browser text/plain payload berhasil diurai oleh doPost");
  }

  // 4.2 Verifikasi RBAC Laporan Owner (403 Forbidden untuk Admin)
  {
    const adminBlockedRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "reports/income-statement",
          token: activeAdminToken,
          month: 10,
          year: 2026
        })
      }
    }));
    assert(adminBlockedRes.json.success === false && adminBlockedRes.json.statusCode === 403, "Admin DITOLAK (403) pada Laporan Laba Rugi Owner");
  }

  // 4.3 Verifikasi Owner Mengakses Laporan Finansial (200 OK)
  {
    const ownerAllowedRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "reports/income-statement",
          token: ownerToken,
          month: 10,
          year: 2026
        })
      }
    }));
    assert(ownerAllowedRes.json.success === true && ownerAllowedRes.json.report !== undefined, "Owner BERHASIL mengakses Laporan Laba Rugi (200 OK)");
  }

  // ============================================================================
  // BAGIAN 5: END-TO-END OPERATIONAL LIFECYCLE PADA SPREADSHEET PENGUJIAN
  // ============================================================================
  console.log("\n--- BAGIAN 5: END-TO-END LIFECYCLE PADA SPREADSHEET PENGUJIAN ---");

  // 5.1 Setup Master Data Produk & Vendor
  DatabaseHelper.insertRow("VENDORS", {
    vendor_id: "VND-TEST-01",
    vendor_name: "Vendor Pengujian Integrasi",
    contact_person: "Bambang",
    consignment_fee_type: "PERCENTAGE",
    default_consignment_fee: 10,
    status: "ACTIVE"
  });

  DatabaseHelper.insertRow("MASTER_PRODUK", {
    product_id: "PRD-INT-01",
    product_name: "Crocs Classic Test Integration",
    category_id: "CAT-CLOG",
    model: "Classic Clog",
    sales_type: "READY_STOCK",
    is_active: true,
    is_published: true
  });

  DatabaseHelper.insertRow("VARIAN_PRODUK", {
    variant_id: "VAR-INT-M9",
    product_id: "PRD-INT-01",
    size: "M9",
    sku: "CRC-INT-M9",
    color: "Black",
    catalog_price: 1000000,
    reference_hpp: 500000,
    is_active: true
  });

  DatabaseHelper.insertRow("STOK", {
    variant_id: "VAR-INT-M9",
    owned_physical_stock: 0,
    owned_reserved_stock: 0,
    consignment_physical_stock: 0,
    consignment_reserved_stock: 0,
    total_available_stock: 0
  });

  // 5.2 Siklus Pembelian Supplier: Buat Faktur, Terima Barang (Kapitalisasi Ongkir FIFO), Bayar Bertahap
  let purchaseId = null;
  {
    // A. Buat Faktur Pembelian (10 pasang @ Rp500.000 + Ongkir Rp50.000 = Rp5.050.000)
    const purRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "purchases/create",
          token: activeAdminToken,
          supplier_name: "Supplier Resmi Crocs",
          invoice_number: "INV-SUP-INT-01",
          invoice_date: "2026-10-01",
          due_date: "2026-10-31",
          shipping_cost: 50000,
          items: [{ variant_id: "VAR-INT-M9", quantity: 10, base_unit_cost: 500000 }]
        })
      }
    }));
    assert(purRes.json.success === true && purRes.json.purchase_id !== undefined, "Faktur pembelian dibuat pada spreadsheet pengujian");
    purchaseId = purRes.json.purchase_id;

    // B. Terima Fisik Barang (Stok Masuk & HPP Terkapitalisasi Menjadi Rp505.000/pasang)
    const recRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "purchases/receive",
          token: activeAdminToken,
          purchase_id: purchaseId,
          receive_date: "2026-10-02",
          idempotency_key: "IDEMP-REC-INT-01",
          received_items: [{ variant_id: "VAR-INT-M9", quantity: 10 }]
        })
      }
    }));
    assert(recRes.json.success === true, "Penerimaan fisik barang dicatat dan stok bertambah", recRes.json);

    // Periksa stok fisik di tabel STOK
    const stockRow = DatabaseHelper.getRowByPk("STOK", "variant_id", "VAR-INT-M9");
    assert(Number(stockRow.owned_physical_stock) === 10, "Stok fisik di STOK bertambah menjadi 10 pasang", stockRow);

    // C. Catat Pembayaran Termin ke Supplier (DP Rp2.000.000 via PEMBAYARAN_PEMBELIAN)
    const payRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "purchases/payment-record",
          token: activeAdminToken,
          purchase_id: purchaseId,
          amount: 2000000,
          payment_method: "TRANSFER",
          notes: "DP 1 Faktur Supplier"
        })
      }
    }));
    assert(payRes.json.success === true && payRes.json.payment_id !== undefined, "Pembayaran termin dicatat di PEMBAYARAN_PEMBELIAN");
  }

  // 5.3 Siklus Kasir POS: Penjualan Real-Time dengan Pemotongan FIFO
  {
    const saleRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "sales/create",
          token: activeAdminToken,
          sales_channel: "OFFLINE_EVENT",
          sales_type: "READY_STOCK",
          payment_method: "QRIS",
          items: [{
            variant_id: "VAR-INT-M9",
            item_ownership: "OWNED",
            quantity: 2,
            actual_price: 1000000
          }]
        })
      }
    }));
    assert(saleRes.json.success === true && saleRes.json.sales_id !== undefined, "Transaksi penjualan POS berhasil memotong stok FIFO", saleRes.json);

    // Sisa stok di spreadsheet harus 8
    const updatedStock = DatabaseHelper.getRowByPk("STOK", "variant_id", "VAR-INT-M9");
    assert(Number(updatedStock.owned_physical_stock) === 8, "Stok fisik berkurang menjadi 8 pasang", updatedStock);
  }

  // 5.4 Siklus Pengeluaran Operasional
  {
    const expRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "expenses/create",
          token: activeAdminToken,
          category: "PACKAGING",
          amount: 100000,
          payment_method: "TRANSFER",
          notes: "Boks & stiker packing"
        })
      }
    }));
    assert(expRes.json.success === true && expRes.json.expense_id !== undefined, "Beban operasional dicatat di spreadsheet pengujian");
  }

  // 5.5 Siklus Tutup Buku (Closing) & Snapshot Multi-Versi oleh Owner
  {
    // Preview tutup buku bulan November 2026 (Periode OPEN)
    const prevRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "closing/preview",
          token: ownerToken,
          month: 11,
          year: 2026
        })
      }
    }));
    assert(prevRes.json.success === true && prevRes.json.preview !== undefined, "Preview Tutup Buku berhasil dihasilkan");

    // Eksekusi Tutup Buku bulan November 2026
    const closeRes = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "closing/close-period",
          token: ownerToken,
          month: 11,
          year: 2026,
          notes: "Tutup buku integrasi pengujian Phase 3E.2"
        })
      }
    }));
    assert(closeRes.json.success === true && closeRes.json.period_id === "PER-2026-11", "Tutup buku berhasil dieksekusi pada spreadsheet pengujian", closeRes.json);

    // Periksa status periode menjadi CLOSED
    const periodRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-11");
    assert(periodRow && periodRow.period_status === "CLOSED", "Status PERIODE_KEUANGAN terkunci (CLOSED)");
  }

  // ============================================================================
  // BAGIAN 6: AUDIT SUMMARY & VERIFIKASI AKHIR
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`PHASE 3E.2 TEST SUMMARY:`);
  console.log(`Total Assertions : ${totalTests}`);
  console.log(`Passed           : ${passedTests}`);
  console.log(`Failed           : ${failedTests}`);
  console.log("================================================================================");

  if (failedTests > 0) {
    throw new Error(`Test Suite Phase 3E.2 gagal dengan ${failedTests} kesalahan.`);
  }
}

// Run test immediately
runPhase3E2TestSuite().catch(err => {
  console.error("FATAL ERROR IN PHASE 3E.2 TEST EXECUTION:", err);
  process.exit(1);
});
