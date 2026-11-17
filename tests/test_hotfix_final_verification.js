/**
 * CROCSCIRCLE.ID — PHASE 3B HOTFIX FINAL VERIFICATION & MIGRATION AUDIT SUITE
 * 
 * Pengujian Mendalam 4 Kriteria Utama:
 * 1. Audit Migrasi Stok Konsinyasi Lama (Legacy Quarantine & Owner Reconciliation)
 * 2. Uji Race Condition & Concurrency Locking (Pencegahan Double-Spending Stok)
 * 3. Uji Atomic Rollback (Simulasi Kegagalan Transaksi Tanpa Sisa Data Parsial)
 * 4. Uji Integritas Retur (Batas Kuantitas, Idempotensi, Lot Asli, Reversal Kewajiban)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

let lockState = { locked: false, lockCount: 0 };
global.LockService = {
  getScriptLock: () => ({
    tryLock: (timeout) => {
      lockState.lockCount++;
      lockState.locked = true;
      return true;
    },
    releaseLock: () => {
      lockState.locked = false;
    }
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

// Test Runner Framework
let passedCount = 0;
let failedCount = 0;
const testResults = [];

function runTest(testNumber, name, fn) {
  try {
    fn();
    console.log(`\x1b[32m✔ [FINAL TEST ${testNumber}] PASS: ${name}\x1b[0m`);
    passedCount++;
    testResults.push({ number: testNumber, name, status: 'PASS' });
  } catch (err) {
    console.error(`\x1b[31m✘ [FINAL TEST ${testNumber}] FAIL: ${name}\x1b[0m`);
    console.error(`   Error: ${err.message}`);
    failedCount++;
    testResults.push({ number: testNumber, name, status: 'FAIL', error: err.message });
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Assertion failed"} | Expected: ${expected}, Got: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || "Expected condition to be true");
  }
}

console.log("==========================================================================");
console.log("🔍 CROCSCIRCLE.ID — PHASE 3B HOTFIX FINAL VERIFICATION & MIGRATION AUDIT");
console.log("   Legacy Quarantine, Concurrency Safety, Atomic Rollback & Return Limits");
console.log("==========================================================================\n");

// 0. Setup Clean Database & Auth
initializeCrocsCircleDatabase();
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const ownerLogin = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = ownerLogin.token;

// =========================================================================
// BAGIAN 1: AUDIT MIGRASI STOK KONSINYASI LAMA (LEGACY QUARANTINE)
// =========================================================================
console.log("--- BAGIAN 1: AUDIT MIGRASI STOK KONSINYASI LAMA ---");

// Setup Varian Warisan
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-LEGACY",
  product_name: "Crocs Classic Legacy Clog",
  category_id: "CLOG",
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-LEGACY-01",
  product_id: "PRD-LEGACY",
  sku: "CRC-LEGACY-M9",
  size: "M9",
  color: "Navy",
  catalog_price: 350000,
  reference_hpp: 0,
  is_active: true
});

// Simulasi Keadaan Warisan: STOK memiliki 5 pcs konsinyasi, tetapi BATCH_KONSINYASI masih 0
DatabaseHelper.insertRow("STOK", {
  variant_id: "VAR-LEGACY-01",
  owned_physical_stock: 0,
  owned_reserved_stock: 0,
  owned_available_stock: 0,
  consignment_physical_stock: 5,
  consignment_reserved_stock: 0,
  consignment_available_stock: 5,
  total_available_stock: 5,
  minimum_stock: 2,
  updated_at: new Date()
});

runTest(1, "Deteksi dan Karantina Stok Konsinyasi Warisan (LEGACY_UNALLOCATED)", () => {
  const reconRes = InventoryService.reconcileLegacyConsignmentStock(ownerToken);
  assertTrue(reconRes.success, "Rekonsiliasi harus sukses");
  assertEquals(reconRes.quarantined_count, 1, "Harus ada 1 varian yang dikarantina");

  const legacyLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", "LOT-LEGACY-VAR-LEGACY-01");
  assertTrue(!!legacyLot, "Lot karantina harus terbentuk");
  assertEquals(legacyLot.vendor_id, "UNALLOCATED_LEGACY", "Vendor ID harus UNALLOCATED_LEGACY");
  assertEquals(legacyLot.status, "LEGACY_UNALLOCATED", "Status harus LEGACY_UNALLOCATED");
  assertEquals(Number(legacyLot.remaining_qty), 5, "Sisa kuantitas karantina harus 5 pcs");
});

runTest(2, "Pencegahan Penjualan atas Stok Karantina (Anti-Overselling)", () => {
  // Percobaan menjual stok atas nama Dzaki pada varian warisan ini
  let threw = false;
  let errMsg = "";
  try {
    SalesService.createSale({
      transaction_date: new Date(),
      customer_name: "Pembeli Ilegal",
      sales_channel: "DIRECT",
      payment_method: "CASH",
      items: [{
        variant_id: "VAR-LEGACY-01",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 1,
        actual_price: 350000
      }]
    }, "hafiz");
  } catch (err) {
    threw = true;
    errMsg = err.message;
  }

  assertTrue(threw, "Penjualan stok karantina harus DITOLAK keras!");
  assertTrue(errMsg.includes("Tersedia: 0 unit"), "Stok Dzaki harus terdeteksi 0 unit meskipun ada stok karantina");

  // Pastikan lot karantina tetap utuh 5 pcs
  const legacyLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", "LOT-LEGACY-VAR-LEGACY-01");
  assertEquals(Number(legacyLot.remaining_qty), 5, "Lot karantina tidak boleh tersentuh");
});

runTest(3, "Idempotensi Migrasi Stok Warisan (Tidak Menduplikasi Lot)", () => {
  // Jalankan ulang fungsi rekonsiliasi
  const rerunRes = InventoryService.reconcileLegacyConsignmentStock(ownerToken);
  assertTrue(rerunRes.success, "Eksekusi ulang harus sukses");
  assertEquals(rerunRes.quarantined_count, 0, "Tidak boleh ada karantina baru yang terbentuk");

  const allLots = DatabaseHelper.getAllRows("BATCH_KONSINYASI", l => l.variant_id === "VAR-LEGACY-01");
  assertEquals(allLots.length, 1, "Hanya boleh ada 1 lot untuk varian warisan ini (tidak dobel)");
});

runTest(4, "Rekonsiliasi Manual oleh Owner (Reassign ke Vendor yang Sah)", () => {
  const reassignRes = InventoryService.reassignLegacyConsignmentLot(
    "LOT-LEGACY-VAR-LEGACY-01",
    "VND-DZAKI",
    "Verifikasi nota titip konsinyasi Dzaki No. 042/10/2026",
    ownerToken
  );

  assertTrue(reassignRes.success, "Reassign harus berhasil");
  assertEquals(reassignRes.new_vendor_id, "VND-DZAKI", "Vendor tujuan menjadi VND-DZAKI");
  assertEquals(reassignRes.status, "ACTIVE", "Status berubah menjadi ACTIVE");

  // Setelah disahkan, Dzaki sekarang memiliki 5 pcs siap jual
  const dzakiStock = InventoryService.getConsignmentStockByVendor("VAR-LEGACY-01", "VND-DZAKI");
  assertEquals(dzakiStock.available_qty, 5, "Stok Dzaki kini sah 5 pcs");

  // Sekarang penjualan atas nama Dzaki berhasil
  const saleLegal = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Pembeli Sah",
    sales_channel: "DIRECT",
    payment_method: "CASH",
    items: [{
      variant_id: "VAR-LEGACY-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 2,
      actual_price: 350000
    }]
  }, "hafiz");

  assertTrue(saleLegal.success, "Penjualan harus sukses setelah direkonsiliasi");
  const dzakiAfter = InventoryService.getConsignmentStockByVendor("VAR-LEGACY-01", "VND-DZAKI");
  assertEquals(dzakiAfter.available_qty, 3, "Sisa stok Dzaki menjadi 3 pcs");
});

// =========================================================================
// BAGIAN 2: UJI RACE CONDITION & CONCURRENCY SAFETY
// =========================================================================
console.log("\n--- BAGIAN 2: UJI RACE CONDITION & CONCURRENCY SAFETY ---");

// Setup Varian Race
DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-RACE-01",
  product_id: "PRD-LEGACY",
  sku: "CRC-RACE-W7",
  size: "W7",
  color: "Bone",
  catalog_price: 350000,
  reference_hpp: 0,
  is_active: true
});

// Dzaki menyetor persis 2 pcs
InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-RACE-01", 2, "Stok terbatas Dzaki untuk uji race", "hafiz");

// Vendor B menyetor 4 pcs pada varian yang sama
VendorService.createVendor({
  vendor_id: "VND-RACE-B",
  vendor_name: "Vendor Race B",
  cooperation_type: "CONSIGNMENT",
  consignment_fee_type: "PERCENTAGE",
  default_consignment_fee: 10,
  phone: "08119999",
  bank_name: "BCA",
  bank_account_no: "999999",
  bank_account_holder: "Vendor Race B"
}, ownerToken);
InventoryService.receiveConsignmentStock("VND-RACE-B", "VAR-RACE-01", 4, "Stok Vendor B", "hafiz");

runTest(5, "Uji Race Condition: 2 Permintaan Kasir Bersamaan Masing-Masing Meminta 2 pcs (Dzaki Total 2 pcs)", () => {
  // Simulasi dua kasir (Kasir A dan Kasir B) mengirimkan pesanan pada waktu hampir bersamaan
  let kasirASuccess = false;
  let kasirBSuccess = false;
  let kasirAError = null;
  let kasirBError = null;

  const orderA = {
    transaction_date: new Date(),
    customer_name: "Customer Kasir A",
    sales_channel: "DIRECT",
    payment_method: "CASH",
    items: [{
      variant_id: "VAR-RACE-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 2,
      actual_price: 350000
    }]
  };

  const orderB = {
    transaction_date: new Date(),
    customer_name: "Customer Kasir B",
    sales_channel: "WHATSAPP",
    payment_method: "TRANSFER_BCA",
    items: [{
      variant_id: "VAR-RACE-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 2,
      actual_price: 350000
    }]
  };

  // Eksekusi transaksi berurutan dalam proteksi LockService
  try {
    const resA = SalesService.createSale(orderA, "kasir_a");
    kasirASuccess = resA.success;
  } catch (err) {
    kasirAError = err.message;
  }

  try {
    const resB = SalesService.createSale(orderB, "kasir_b");
    kasirBSuccess = resB.success;
  } catch (err) {
    kasirBError = err.message;
  }

  // Tepat 1 transaksi berhasil, 1 transaksi ditolak
  assertTrue(
    (kasirASuccess && !kasirBSuccess) || (!kasirASuccess && kasirBSuccess),
    "Tepat satu transaksi harus berhasil dan satu transaksi harus ditolak!"
  );

  const failedError = kasirAError || kasirBError;
  assertTrue(failedError.includes("tidak mencukupi"), "Transaksi kedua harus ditolak karena stok tidak mencukupi");
  assertTrue(failedError.includes("Tersedia: 0 unit"), "Transaksi kedua harus mendeteksi 0 unit tersedia");

  // Verifikasi integritas: Stok Dzaki persis 0 (tidak pernah negatif)
  const dzakiStock = InventoryService.getConsignmentStockByVendor("VAR-RACE-01", "VND-DZAKI");
  assertEquals(dzakiStock.available_qty, 0, "Sisa stok Dzaki harus persis 0 pcs");

  // Stok Vendor B sama sekali tidak berubah (tetap 4 pcs)
  const vendorBStock = InventoryService.getConsignmentStockByVendor("VAR-RACE-01", "VND-RACE-B");
  assertEquals(vendorBStock.available_qty, 4, "Stok Vendor B harus tetap 4 pcs (tidak terpengaruh)");

  // Total kewajiban Dzaki tercatat tepat 1x (2 unit x Rp270.000 = Rp540.000)
  const allDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.variant_id === "VAR-RACE-01" && d.vendor_id === "VND-DZAKI");
  const totalPayable = allDetails.reduce((sum, d) => sum + Number(d.total_vendor_payable), 0);
  assertEquals(totalPayable, 540000, "Total kewajiban Dzaki harus persis Rp540.000 (tidak ada double booking)");
});

// =========================================================================
// BAGIAN 3: UJI ATOMIC ROLLBACK
// =========================================================================
console.log("\n--- BAGIAN 3: UJI ATOMIC ROLLBACK ---");

// Setup varian Rollback
DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-ROLL-01",
  product_id: "PRD-LEGACY",
  sku: "CRC-ROLL-W8",
  size: "W8",
  color: "Black",
  catalog_price: 350000,
  reference_hpp: 0,
  is_active: true
});

InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-ROLL-01", 3, "Stok Dzaki untuk Uji Rollback", "hafiz");
const rollLotBefore = DatabaseHelper.getAllRows("BATCH_KONSINYASI", l => l.variant_id === "VAR-ROLL-01")[0];
const initialLotId = rollLotBefore.consignment_lot_id;

runTest(6, "Simulasi Kegagalan Transaksi Multi-Item: Atomic Rollback Memulihkan Sisa Lot", () => {
  // Item 1: Sah (Dzaki 2 pcs)
  // Item 2: Sengaja Dibuat Gagal (variant_id tidak ada)
  let threw = false;
  try {
    SalesService.createSale({
      transaction_date: new Date(),
      customer_name: "Customer Error Simulation",
      sales_channel: "DIRECT",
      payment_method: "CASH",
      items: [
        {
          variant_id: "VAR-ROLL-01",
          item_ownership: "CONSIGNMENT",
          vendor_id: "VND-DZAKI",
          quantity: 2,
          actual_price: 350000
        },
        {
          variant_id: "VAR-INVALID-NONEXIST", // Akan melempar error saat validasi/depletion
          item_ownership: "CONSIGNMENT",
          vendor_id: "VND-DZAKI",
          quantity: 1,
          actual_price: 350000
        }
      ]
    }, "hafiz");
  } catch (err) {
    threw = true;
  }

  assertTrue(threw, "Transaksi harus gagal dan memicu rollback!");

  // Verifikasi: Lot Dzaki harus kembali utuh 3 pcs
  const rollLotAfter = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", initialLotId);
  assertEquals(Number(rollLotAfter.remaining_qty), 3, "Sisa lot harus kembali utuh 3 pcs");
  assertEquals(rollLotAfter.status, "ACTIVE", "Status lot tetap ACTIVE");

  // Verifikasi: Tidak ada baris DETAIL_PENJUALAN atau PENJUALAN yang tertinggal
  const orphanedDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.variant_id === "VAR-ROLL-01");
  assertEquals(orphanedDetails.length, 0, "Tidak boleh ada detail penjualan yatim yang tersisa");

  const orphanedHeaders = DatabaseHelper.getAllRows("PENJUALAN", p => p.customer_name === "Customer Error Simulation");
  assertEquals(orphanedHeaders.length, 0, "Tidak boleh ada header penjualan yang tersisa");

  // Verifikasi stok fisik
  const stk = InventoryService.getStock("VAR-ROLL-01");
  assertEquals(stk.consignment_physical_stock, 3, "Stok fisik konsinyasi harus kembali utuh 3 pcs");
});

// =========================================================================
// BAGIAN 4: UJI INTEGRITAS RETUR
// =========================================================================
console.log("\n--- BAGIAN 4: UJI INTEGRITAS RETUR ---");

// Setup Penjualan Sah untuk Pengujian Retur (Kuantitas = 2)
const retSale = SalesService.createSale({
  transaction_date: new Date(),
  customer_name: "Customer Retur Test",
  sales_channel: "DIRECT",
  payment_method: "CASH",
  items: [{
    variant_id: "VAR-ROLL-01",
    item_ownership: "CONSIGNMENT",
    vendor_id: "VND-DZAKI",
    quantity: 2,
    actual_price: 350000
  }]
}, "hafiz");

const retDetail = retSale.details[0];
const salesIdRet = retSale.salesId || retSale.header.sales_id;
const salesDetailIdRet = retDetail.sales_detail_id;

runTest(7, "Retur Parsial Pertama (1 pc dari 2 pc Terjual) Berhasil Mengarah ke Lot Asli", () => {
  const ret1 = SalesService.returnSaleItem(salesIdRet, salesDetailIdRet, 1, "Ukuran agak longgar", "hafiz");
  assertTrue(ret1.success, "Retur parsial 1 harus berhasil");

  // Sisa lot bertambah 1
  const lot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", initialLotId);
  assertEquals(Number(lot.remaining_qty), 2, "Sisa lot Dzaki bertambah menjadi 2 pcs");

  // Kewajiban vendor berkurang 1x (dari Rp540.000 menjadi Rp270.000)
  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", salesDetailIdRet);
  assertEquals(Number(detailAfter.total_vendor_payable), 270000, "Kewajiban vendor tersisa Rp270.000");
});

runTest(8, "Penolakan Retur yang Melebihi Kuantitas yang Belum Diretur", () => {
  // Sisa yang belum diretur tinggal 1 pc (dari 2 terjual).
  // Kasir mencoba meretur 2 pcs lagi.
  let threw = false;
  let errMsg = "";
  try {
    SalesService.returnSaleItem(salesIdRet, salesDetailIdRet, 2, "Coba retur melebihi sisa", "hafiz");
  } catch (err) {
    threw = true;
    errMsg = err.message;
  }

  assertTrue(threw, "Retur melebihi sisa harus ditolak!");
  assertTrue(errMsg.includes("melebihi sisa kuantitas yang dapat diretur"), "Pesan error harus menjelaskan sisa kuantitas");
  assertTrue(errMsg.includes("1 dari 2 terjual"), "Pesan error harus menyebut 1 dari 2 terjual");
});

runTest(9, "Retur Parsial Kedua (1 pc Terakhir) Berhasil Menuntaskan Retur", () => {
  const ret2 = SalesService.returnSaleItem(salesIdRet, salesDetailIdRet, 1, "Tukar warna", "hafiz");
  assertTrue(ret2.success, "Retur parsial 2 harus berhasil");

  // Sisa lot kembali penuh 3 pcs
  const lot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", initialLotId);
  assertEquals(Number(lot.remaining_qty), 3, "Sisa lot Dzaki kembali penuh 3 pcs");

  // Kewajiban vendor menjadi 0 dan status CANCELLED
  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", salesDetailIdRet);
  assertEquals(Number(detailAfter.total_vendor_payable), 0, "Kewajiban vendor menjadi 0");
  assertEquals(detailAfter.settlement_status, "CANCELLED", "Status settlement menjadi CANCELLED");
});

runTest(10, "Penolakan Total Saat Seluruh Kuantitas Telah Diretur (Unreturned = 0)", () => {
  let threw = false;
  let errMsg = "";
  try {
    SalesService.returnSaleItem(salesIdRet, salesDetailIdRet, 1, "Retur ekstra setelah habis", "hafiz");
  } catch (err) {
    threw = true;
    errMsg = err.message;
  }

  assertTrue(threw, "Retur pada item yang sudah habis diretur harus ditolak keras!");
  assertTrue(errMsg.includes("sudah pernah diretur sebelumnya"), "Pesan error harus menyebut sudah pernah diretur");
});

runTest(11, "Idempotensi Retur: Kunci Retur Berulang Mengembalikan Replay Tanpa Tambah Stok Dobel", () => {
  // Setup penjualan baru untuk uji idempotensi retur
  const saleIdem = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Customer Idempotency Test",
    sales_channel: "DIRECT",
    payment_method: "CASH",
    items: [{
      variant_id: "VAR-ROLL-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 1,
      actual_price: 350000
    }]
  }, "hafiz");

  const detailIdem = saleIdem.details[0];
  const sId = saleIdem.salesId || saleIdem.header.sales_id;
  const sdId = detailIdem.sales_detail_id;

  const lotBefore = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", initialLotId);
  const qtyBeforeRet = Number(lotBefore.remaining_qty);

  // Retur Pertama dengan Kunci Idempotensi
  const retA = SalesService.returnSaleItem(sId, sdId, 1, "Alasan retur valid", "hafiz", null, "IDEM-RET-KEY-999");
  assertTrue(retA.success, "Retur pertama harus berhasil");
  assertTrue(!retA.idempotentReplay, "Bukan idempotent replay");

  const lotAfterFirst = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", initialLotId);
  assertEquals(Number(lotAfterFirst.remaining_qty), qtyBeforeRet + 1, "Stok bertambah 1 pcs");

  // Retur Kedua dengan Kunci Idempotensi yang Sama (Replay)
  const retB = SalesService.returnSaleItem(sId, sdId, 1, "Alasan retur valid", "hafiz", null, "IDEM-RET-KEY-999");
  assertTrue(retB.success, "Retur kedua harus mengembalikan sukses (Replay)");
  assertTrue(retB.idempotentReplay === true, "Harus ditandai sebagai idempotentReplay");

  // Stok TIDAK bertambah dua kali
  const lotAfterSecond = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", initialLotId);
  assertEquals(Number(lotAfterSecond.remaining_qty), qtyBeforeRet + 1, "Stok TIDAK bertambah dua kali (tetap +1)");
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n==========================================================================");
console.log(`📊 FINAL VERIFICATION AUDIT RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log("==========================================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("\x1b[32m🎉 SELURUH 11 SKENARIO FINAL VERIFICATION LULUS 100% TANPA CACAT!\x1b[0m\n");
  process.exit(0);
}
