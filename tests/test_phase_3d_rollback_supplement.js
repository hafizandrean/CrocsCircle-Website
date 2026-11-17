/**
 * CROCSCIRCLE.ID — PHASE 3D POS ATOMIC ROLLBACK SUPPLEMENTARY TEST SUITE
 * 
 * Pengujian Mendalam Failure Injection Khusus:
 * 1. Failure injection saat pencatatan MUTASI_STOK pada transaksi multi-item.
 * 2. Failure injection saat pembuatan kewajiban vendor (DETAIL_PENJUALAN).
 * 3. Audit trail: Memastikan rollback tidak menghapus transaksi historis yang sudah sah.
 * 4. Idempotency & Retry: Memastikan retry tidak menghasilkan mutasi atau kewajiban ganda.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Mock Google Apps Script Environment
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
    const rows = Object.keys(this.cells).map(Number);
    return rows.length === 0 ? 0 : Math.max(...rows);
  }
  getLastColumn() {
    let maxCol = 0;
    Object.values(this.cells).forEach(row => {
      const cols = Object.keys(row).map(Number);
      if (cols.length > 0) maxCol = Math.max(maxCol, ...cols);
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
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => activeSS,
  openById: () => activeSS
};
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

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => {
      if (k === 'ADMIN_PHONE') return '6281234567890';
      if (k === 'STORE_NAME') return 'CrocsCircle.ID';
      return null;
    }
  })
};

// Load Backend Files
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

// Initialize database schema
initializeCrocsCircleDatabase();

// Setup Owner & Admin Users
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const ownerLogin = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = ownerLogin.token;

// Setup Products & Variants
DatabaseHelper.insertRow("KATEGORI", { category_id: "CAT-CLOG", category_name: "Clogs", description: "Classic Crocs" });

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-ROLLBACK-TEST",
  product_name: "Crocs Rollback Edition",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-RB-OWNED",
  product_id: "PRD-ROLLBACK-TEST",
  sku: "CRC-RB-OWNED-W7",
  color: "White",
  size: "W7",
  catalog_price: 999000,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-RB-DZAKI",
  product_id: "PRD-ROLLBACK-TEST",
  sku: "CRC-RB-DZAKI-W8",
  color: "Black",
  size: "W8",
  catalog_price: 300000,
  is_active: true
});

// Seed initial stock
// 1. Owned: 5 pcs @ 500k
InventoryService.receiveOwnedStockBatch("PUR-RB-INIT", "VAR-RB-OWNED", 5, 500000, 0, "Stok Awal Rollback Owned", "TESTER");

// 2. Consignment Dzaki: 5 pcs
InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-RB-DZAKI", 5, "Stok Awal Dzaki Rollback", "TESTER");

// Commit 1 Real Historical Transaction to test immutability
const committedSale = SalesService.createSale({
  sales_channel: "OFFLINE_STORE",
  customer_name: "Pelanggan Sah Sebelum Kegagalan",
  payment_method: "QRIS",
  items: [
    { variant_id: "VAR-RB-OWNED", item_ownership: "OWNED", quantity: 1, actual_price: 999000 },
    { variant_id: "VAR-RB-DZAKI", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }
  ]
});

const historicalSaleId = committedSale.sale.sales_id;
const historicalDetailCount = committedSale.details.length;

console.log("==========================================================================");
console.log("🛡️ CROCSCIRCLE.ID — POS ATOMIC ROLLBACK SUPPLEMENTARY AUDIT TEST SUITE");
console.log("==========================================================================\n");

let passedCount = 0;
let totalTests = 4;

function assert(condition, message) {
  if (!condition) throw new Error("Assertion Failed: " + message);
}

// =========================================================================
// PENGUJIAN 1: FAILURE INJECTION SAAT PENCATATAN MUTASI_STOK
// =========================================================================
try {
  console.log("[1/4] Menguji Failure Injection Saat Pencatatan MUTASI_STOK...");
  // Kondisi Sebelum:
  // VAR-RB-OWNED: 4 pcs (dari 5 dikurangi 1 pada committedSale)
  // VAR-RB-DZAKI: 4 pcs (dari 5 dikurangi 1 pada committedSale)
  const preStockOwned = InventoryService.getStock("VAR-RB-OWNED").owned_available_stock;
  const preStockDzaki = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  const preMutasiCount = DatabaseHelper.getAllRows("MUTASI_STOK").length;
  const prePenjualanCount = DatabaseHelper.getAllRows("PENJUALAN").length;

  assert(preStockOwned === 4, `Pre stock owned harus 4, didapat ${preStockOwned}`);
  assert(preStockDzaki === 4, `Pre stock dzaki harus 4, didapat ${preStockDzaki}`);

  // Simulasikan kegagalan saat DatabaseHelper.insertRow("MUTASI_STOK", ...) dipanggil
  const originalInsertRow = DatabaseHelper.insertRow;
  let mutasiFailureTriggered = false;

  DatabaseHelper.insertRow = function(tableName, rowData) {
    if (tableName === "MUTASI_STOK" && !mutasiFailureTriggered) {
      mutasiFailureTriggered = true;
      throw new Error("INJECTED_DATABASE_DISK_CRASH_ON_MUTASI_STOK");
    }
    return originalInsertRow.apply(this, arguments);
  };

  let threw = false;
  try {
    SalesService.createSale({
      sales_channel: "OFFLINE_STORE",
      customer_name: "Customer Crash Mutasi",
      payment_method: "CASH",
      items: [
        { variant_id: "VAR-RB-OWNED", item_ownership: "OWNED", quantity: 2, actual_price: 999000 },
        { variant_id: "VAR-RB-DZAKI", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }
      ]
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("INJECTED_DATABASE_DISK_CRASH_ON_MUTASI_STOK"), "Error harus memuat pesan crash simulasi");
  } finally {
    DatabaseHelper.insertRow = originalInsertRow; // Restore fungsi asli
  }

  assert(threw === true, "Transaksi harus ditolak dan melempar exception");
  assert(mutasiFailureTriggered === true, "Failure injection MUTASI_STOK harus sempat terpanggil");

  // Verifikasi Kondisi Setelah Kegagalan:
  const postStockOwned = InventoryService.getStock("VAR-RB-OWNED").owned_available_stock;
  const postStockDzaki = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  const postMutasiCount = DatabaseHelper.getAllRows("MUTASI_STOK").length;
  const postPenjualanCount = DatabaseHelper.getAllRows("PENJUALAN").length;

  assert(postStockOwned === preStockOwned, `Stok OWNED harus 100% dipulihkan (${preStockOwned} == ${postStockOwned})`);
  assert(postStockDzaki === preStockDzaki, `Stok CONSIGNMENT harus 100% dipulihkan (${preStockDzaki} == ${postStockDzaki})`);
  assert(postMutasiCount === preMutasiCount, `Tidak boleh ada baris mutasi stok yatim (${preMutasiCount} == ${postMutasiCount})`);
  assert(postPenjualanCount === prePenjualanCount, `Tidak boleh ada header penjualan tersimpan (${prePenjualanCount} == ${postPenjualanCount})`);

  console.log("  ✔ PASS: Failure injection MUTASI_STOK berhasil di-rollback utuh tanpa data yatim.");
  passedCount++;
} catch (e) {
  console.error("  ✘ FAIL [1/4]:", e.message);
}

// =========================================================================
// PENGUJIAN 2: FAILURE INJECTION SAAT PEMBUATAN KEWAJIBAN VENDOR
// =========================================================================
try {
  console.log("\n[2/4] Menguji Failure Injection Saat Pembuatan Kewajiban Vendor (DETAIL_PENJUALAN)...");
  const preStockDzaki = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  const preDetailCount = DatabaseHelper.getAllRows("DETAIL_PENJUALAN").length;
  const preSalesCount = DatabaseHelper.getAllRows("PENJUALAN").length;

  // Simulasikan kegagalan saat baris kewajiban vendor pada DETAIL_PENJUALAN disimpan
  const originalInsertRow = DatabaseHelper.insertRow;
  let payableFailureTriggered = false;

  DatabaseHelper.insertRow = function(tableName, rowData) {
    if (tableName === "DETAIL_PENJUALAN" && rowData.total_vendor_payable > 0 && !payableFailureTriggered) {
      payableFailureTriggered = true;
      throw new Error("INJECTED_CRASH_DURING_VENDOR_PAYABLE_PERSISTENCE");
    }
    return originalInsertRow.apply(this, arguments);
  };

  let threw = false;
  try {
    SalesService.createSale({
      sales_channel: "OFFLINE_STORE",
      customer_name: "Customer Crash Payable",
      payment_method: "CASH",
      items: [
        { variant_id: "VAR-RB-DZAKI", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 2, actual_price: 280000 }
      ]
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes("INJECTED_CRASH_DURING_VENDOR_PAYABLE_PERSISTENCE"), "Pesan error crash kewajiban vendor harus tertangkap");
  } finally {
    DatabaseHelper.insertRow = originalInsertRow; // Restore fungsi asli
  }

  assert(threw === true, "Transaksi harus digagalkan");
  assert(payableFailureTriggered === true, "Simulasi crash pembuatan hutang vendor harus terpanggil");

  // Verifikasi Integritas:
  const postStockDzaki = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  const postDetailCount = DatabaseHelper.getAllRows("DETAIL_PENJUALAN").length;
  const postSalesCount = DatabaseHelper.getAllRows("PENJUALAN").length;

  // 1. Stok konsinyasi harus kembali utuh (tidak berkurang)
  assert(postStockDzaki === preStockDzaki, `Stok Dzaki harus kembali utuh (${preStockDzaki} == ${postStockDzaki})`);
  // 2. Tidak ada DETAIL_PENJUALAN yang tersimpan tanpa kewajiban vendor
  assert(postDetailCount === preDetailCount, `DETAIL_PENJUALAN tidak boleh bertambah (${preDetailCount} == ${postDetailCount})`);
  // 3. Tidak ada faktur penjualan yang tersimpan tanpa kewajiban vendor
  assert(postSalesCount === preSalesCount, `Faktur PENJUALAN tidak boleh tersimpan (${preSalesCount} == ${postSalesCount})`);

  console.log("  ✔ PASS: Failure injection pembuatan hutang vendor berhasil di-rollback. Tidak ada penjualan parsial tanpa kewajiban vendor.");
  passedCount++;
} catch (e) {
  console.error("  ✘ FAIL [2/4]:", e.message);
}

// =========================================================================
// PENGUJIAN 3: IMMUTABILITAS TRANSAKSI HISTORIS (AUDIT TRAIL UTUH)
// =========================================================================
try {
  console.log("\n[3/4] Menguji Immutabilitas Transaksi Historis Saat Rollback Berlangsung...");
  // Verifikasi bahwa transaksi historis 'historicalSaleId' yang sudah committed sebelumnya
  // TIDAK TERHAPUS, TIDAK BERUBAH, dan DETAILNYA TETAP UTUH!
  const pastSaleInDb = DatabaseHelper.getRowByPk("PENJUALAN", "sales_id", historicalSaleId);
  const pastDetailsInDb = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => String(d.sales_id) === String(historicalSaleId));

  assert(pastSaleInDb !== null, "Faktur historis yang sah tetap ada di PENJUALAN");
  assert(pastSaleInDb.sales_id === historicalSaleId, "ID Faktur historis identik");
  assert(pastDetailsInDb.length === historicalDetailCount, `Detail historis tetap utuh (${historicalDetailCount} baris)`);

  console.log("  ✔ PASS: Rollback kegagalan HANYA membatalkan transaksi yang sedang in-flight dan TIDAK MENYENTUH transaksi historis sah.");
  passedCount++;
} catch (e) {
  console.error("  ✘ FAIL [3/4]:", e.message);
}

// =========================================================================
// PENGUJIAN 4: IDEMPOTENCY & RETRY BEBAS DARI MUTASI / KEWAJIBAN GANDA
// =========================================================================
try {
  console.log("\n[4/4] Menguji Retry Transaksi dengan Idempotency Key Bebas Dari Mutasi Ganda...");
  const idempotencyKey = "RETRY-KEY-SAFE-9999";
  const preStock = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  const preDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN").length;

  const salePayload = {
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Idemp Test",
    payment_method: "QRIS",
    idempotency_key: idempotencyKey,
    items: [
      { variant_id: "VAR-RB-DZAKI", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }
    ]
  };

  // Submit Pertama
  const res1 = SalesService.createSale(salePayload);
  assert(res1.success === true, "Submit pertama harus berhasil");
  assert(!res1.idempotentReplay, "Submit pertama bukan replay");

  const stockAfterFirst = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  assert(stockAfterFirst === preStock - 1, "Stok Dzaki harus berkurang 1");

  // Submit Kedua (Retry dengan key yang sama)
  const res2 = SalesService.createSale(salePayload);
  assert(res2.success === true, "Submit kedua harus berhasil sebagai replay");
  assert(res2.idempotentReplay === true, "Submit kedua wajib terdeteksi sebagai idempotentReplay");
  assert(res2.sale.sales_id === res1.sale.sales_id, "ID Transaksi harus sama");

  // Verifikasi Tidak Terjadi Pemotongan Stok atau Pembuatan Kewajiban Ganda
  const stockAfterRetry = InventoryService.getStock("VAR-RB-DZAKI").consignment_available_stock;
  const postDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN").length;

  assert(stockAfterRetry === stockAfterFirst, `Stok Dzaki TIDAK BOLEH terpotong dua kali (${stockAfterFirst} == ${stockAfterRetry})`);
  assert(postDetails === preDetails + 1, `Hanya terbentuk tepat 1 baris kewajiban vendor (${preDetails + 1} == ${postDetails})`);

  console.log("  ✔ PASS: Idempotency replay mencegah pemotongan stok berulang dan mencegah kewajiban vendor ganda.");
  passedCount++;
} catch (e) {
  console.error("  ✘ FAIL [4/4]:", e.message);
}

// =========================================================================
// REKAPITULASI
// =========================================================================
console.log("\n==========================================================================");
console.log(`📊 HASIL PENGUJIAN ATOMIC ROLLBACK SUPPLEMENT: ${passedCount}/${totalTests} PASS`);
console.log("==========================================================================");

if (passedCount === totalTests) {
  console.log("🎉 SELURUH SKENARIO ATOMIC ROLLBACK FAILURE INJECTION LULUS 100%!");
  process.exit(0);
} else {
  console.error(`⚠️ Ada ${totalTests - passedCount} skenario gagal.`);
  process.exit(1);
}
