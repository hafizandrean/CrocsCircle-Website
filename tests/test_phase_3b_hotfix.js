/**
 * CROCSCIRCLE.ID — PHASE 3B HOTFIX TEST SUITE
 * Multi-Vendor Consignment Lot Integrity & Overselling Prevention
 * 
 * Verifikasi 14 Skenario Kritis:
 * 1. Multi-vendor deposit pada SKU yang sama
 * 2. Integritas data tabel BATCH_KONSINYASI
 * 3. Penjualan sah Vendor A (Dzaki)
 * 4. PENCEGAHAN OVERSELLING DZAKI (Celah kritis berhasil ditutup)
 * 5. Pemotongan habis lot Dzaki (EXHAUSTED)
 * 6. Penolakan penjualan saat lot vendor bernilai 0
 * 7. Penjualan sah Vendor B saat Dzaki habis
 * 8. Retur penjualan memulihkan remaining_qty pada lot spesifik
 * 9. Penjualan kembali setelah stok dipulihkan oleh retur
 * 10. Multi-lot FIFO split untuk vendor yang sama
 * 11. Validasi error parameter vendor & varian
 * 12. Integritas finansial: HPP CrocsCircle = 0, hak vendor & fee
 * 13. Reversal kewajiban finansial pada retur barang
 * 14. Audit trail MUTASI_STOK & konsistensi getConsignmentStockByVendor
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
    console.log(`\x1b[32m✔ [TEST ${testNumber}] PASS: ${name}\x1b[0m`);
    passedCount++;
    testResults.push({ number: testNumber, name, status: 'PASS' });
  } catch (err) {
    console.error(`\x1b[31m✘ [TEST ${testNumber}] FAIL: ${name}\x1b[0m`);
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
console.log("🚀 CROCSCIRCLE.ID — PHASE 3B HOTFIX TEST SUITE");
console.log("   Consignment Lot & Multi-Vendor Stock Integrity");
console.log("==========================================================================\n");

// 0. Inisialisasi Database Bersih
initializeCrocsCircleDatabase();

// Setup User & Tokens
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const ownerLogin = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = ownerLogin.token;

// Setup Master Data untuk Hotfix Test
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-HOTFIX",
  product_name: "Crocs Hotfix Edition Clog",
  category_id: "CLOG",
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-HOTFIX-01",
  product_id: "PRD-HOTFIX",
  sku: "CRC-HOTFIX-M9",
  size: "M9",
  color: "Black",
  catalog_price: 350000,
  reference_hpp: 0,
  is_active: true
});

// Setup Vendor B & Vendor C (Dzaki VND-DZAKI sudah otomatis di-seed oleh InitDatabase)
VendorService.createVendor({
  vendor_id: "VND-VNDB",
  vendor_name: "Vendor B (Toko Partner)",
  cooperation_type: "CONSIGNMENT",
  consignment_fee_type: "PERCENTAGE",
  default_consignment_fee: 10, // 10% komisi CrocsCircle
  phone: "0811223344",
  bank_name: "BCA",
  bank_account_no: "1234567890",
  bank_account_holder: "Vendor B"
}, ownerToken);

VendorService.createVendor({
  vendor_id: "VND-VNDC",
  vendor_name: "Vendor C (Multi-Lot Partner)",
  cooperation_type: "CONSIGNMENT",
  consignment_fee_type: "FIXED_PER_UNIT",
  default_consignment_fee: 15000,
  phone: "0811556677",
  bank_name: "Mandiri",
  bank_account_no: "9876543210",
  bank_account_holder: "Vendor C"
}, ownerToken);

let dzakiLot1Id = null;
let vendorBLotId = null;
let saleDzaki1 = null;
let saleDzaki1DetailId = null;

// =========================================================================
// TEST SCENARIOS
// =========================================================================

// Skenario 1: Multi-Vendor Deposit pada SKU yang Sama
runTest(1, "Multi-Vendor Deposit pada SKU yang Sama (Dzaki 3 pcs & Vendor B 4 pcs)", () => {
  const resDzaki = InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-HOTFIX-01", 3, "Titip Dzaki Batch 1", "hafiz");
  assertTrue(resDzaki.success, "Penerimaan Dzaki harus sukses");
  dzakiLot1Id = resDzaki.lot_id;
  assertTrue(dzakiLot1Id.startsWith("LOT-CNS-"), "Lot ID harus memiliki prefix LOT-CNS-");

  const resVendorB = InventoryService.receiveConsignmentStock("VND-VNDB", "VAR-HOTFIX-01", 4, "Titip Vendor B Batch 1", "hafiz");
  assertTrue(resVendorB.success, "Penerimaan Vendor B harus sukses");
  vendorBLotId = resVendorB.lot_id;
  assertTrue(vendorBLotId.startsWith("LOT-CNS-"), "Lot ID harus memiliki prefix LOT-CNS-");

  const stk = InventoryService.getStock("VAR-HOTFIX-01");
  assertEquals(stk.consignment_physical_stock, 7, "Stok fisik konsinyasi total harus 7 pcs (3+4)");
  assertEquals(stk.consignment_available_stock, 7, "Stok available konsinyasi total harus 7 pcs");
});

// Skenario 2: Integritas Tabel BATCH_KONSINYASI
runTest(2, "Integritas Tabel BATCH_KONSINYASI (2 Record Terisolasi)", () => {
  const lots = DatabaseHelper.getAllRows("BATCH_KONSINYASI", l => l.variant_id === "VAR-HOTFIX-01");
  assertEquals(lots.length, 2, "Harus ada tepat 2 record lot konsinyasi untuk varian ini");

  const dzakiLot = lots.find(l => l.consignment_lot_id === dzakiLot1Id);
  assertTrue(!!dzakiLot, "Lot Dzaki harus ditemukan");
  assertEquals(dzakiLot.vendor_id, "VND-DZAKI", "Vendor ID Dzaki cocok");
  assertEquals(Number(dzakiLot.received_qty), 3, "Received Qty Dzaki = 3");
  assertEquals(Number(dzakiLot.remaining_qty), 3, "Remaining Qty Dzaki = 3");
  assertEquals(dzakiLot.status, "ACTIVE", "Status lot Dzaki = ACTIVE");

  const vendorBLot = lots.find(l => l.consignment_lot_id === vendorBLotId);
  assertTrue(!!vendorBLot, "Lot Vendor B harus ditemukan");
  assertEquals(vendorBLot.vendor_id, "VND-VNDB", "Vendor ID Vendor B cocok");
  assertEquals(Number(vendorBLot.received_qty), 4, "Received Qty Vendor B = 4");
  assertEquals(Number(vendorBLot.remaining_qty), 4, "Remaining Qty Vendor B = 4");
  assertEquals(vendorBLot.status, "ACTIVE", "Status lot Vendor B = ACTIVE");
});

// Skenario 3: Penjualan Sah Milik Dzaki (1 pc)
runTest(3, "Penjualan Pertama Dzaki (1 pc) Memotong Lot Dzaki Saja", () => {
  saleDzaki1 = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Customer A",
    sales_channel: "DIRECT",
    payment_method: "CASH",
    items: [{
      variant_id: "VAR-HOTFIX-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 1,
      actual_price: 350000
    }]
  }, "hafiz");

  assertTrue(saleDzaki1.success, "Penjualan Dzaki 1 harus sukses");

  // Ambil detail penjualan
  const salesId = saleDzaki1.salesId || saleDzaki1.header.sales_id;
  const details = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_id === salesId);
  assertEquals(details.length, 1, "Harus ada 1 detail penjualan");
  saleDzaki1DetailId = details[0].sales_detail_id;
  assertEquals(details[0].batch_id, dzakiLot1Id, "batch_id harus menunjuk ke consignment_lot_id Dzaki");

  // Cek Lot Dzaki
  const dzakiLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", dzakiLot1Id);
  assertEquals(Number(dzakiLot.remaining_qty), 2, "Sisa lot Dzaki harus 2 pcs");
  assertEquals(dzakiLot.status, "ACTIVE", "Status lot Dzaki tetap ACTIVE");

  // Cek Lot Vendor B (Harus tidak tersentuh)
  const vendorBLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", vendorBLotId);
  assertEquals(Number(vendorBLot.remaining_qty), 4, "Sisa lot Vendor B harus tetap 4 pcs");

  // Cek Stok Fisik Konsinyasi
  const stk = InventoryService.getStock("VAR-HOTFIX-01");
  assertEquals(stk.consignment_physical_stock, 6, "Total stok konsinyasi fisik sekarang 6 pcs (2 Dzaki + 4 Vendor B)");
});

// Skenario 4: PENCEGAHAN OVERSELLING DZAKI (Celah Kritis Berhasil Ditutup)
runTest(4, "PENCEGAHAN OVERSELLING: Percobaan Jual 3 pcs untuk Dzaki Ditolak (Sisa Dzaki hanya 2 pcs, Total Konsinyasi 6 pcs)", () => {
  let threw = false;
  let errMsg = "";
  try {
    SalesService.createSale({
      transaction_date: new Date(),
      customer_name: "Customer Fraud Check",
      sales_channel: "DIRECT",
      payment_method: "CASH",
      items: [{
        variant_id: "VAR-HOTFIX-01",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 3, // DZAKI HANYA PUNYA 2 PCS! GLOBAL ADA 6 PCS!
        actual_price: 350000
      }]
    }, "hafiz");
  } catch (err) {
    threw = true;
    errMsg = err.message;
  }

  assertTrue(threw, "Penjualan 3 pcs Dzaki HARUS DITOLAK karena Dzaki hanya memiliki 2 pcs!");
  assertTrue(errMsg.includes("tidak mencukupi"), "Pesan error harus menjelaskan stok tidak mencukupi");
  assertTrue(errMsg.includes("Tersedia: 2") || errMsg.includes("2 unit"), "Pesan error harus menyebut stok tersedia 2 unit");

  // Pastikan stok tidak berkurang
  const dzakiLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", dzakiLot1Id);
  assertEquals(Number(dzakiLot.remaining_qty), 2, "Sisa lot Dzaki harus tetap 2 pcs setelah penolakan");
  const vendorBLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", vendorBLotId);
  assertEquals(Number(vendorBLot.remaining_qty), 4, "Sisa lot Vendor B harus tetap 4 pcs");
});

// Skenario 5: Pemotongan Habis Lot Dzaki (2 pcs)
runTest(5, "Pemotongan Habis Sisa Lot Dzaki (2 pcs) Menjadikan Status EXHAUSTED", () => {
  const saleDzaki2 = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Customer B",
    sales_channel: "WHATSAPP",
    payment_method: "TRANSFER_BCA",
    items: [{
      variant_id: "VAR-HOTFIX-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 2,
      actual_price: 350000
    }]
  }, "hafiz");

  assertTrue(saleDzaki2.success, "Penjualan sisa 2 pcs Dzaki harus sukses");

  const dzakiLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", dzakiLot1Id);
  assertEquals(Number(dzakiLot.remaining_qty), 0, "Sisa lot Dzaki harus 0 pcs");
  assertEquals(dzakiLot.status, "EXHAUSTED", "Status lot Dzaki harus berubah menjadi EXHAUSTED");

  const stk = InventoryService.getStock("VAR-HOTFIX-01");
  assertEquals(stk.consignment_physical_stock, 4, "Sisa stok fisik konsinyasi total sekarang 4 pcs (semua milik Vendor B)");
});

// Skenario 6: Penolakan Penjualan Saat Lot Vendor Bernilai 0
runTest(6, "Penolakan Penjualan Saat Lot Dzaki Habis (0 Tersedia, Total Konsinyasi Masih 4 pcs)", () => {
  let threw = false;
  let errMsg = "";
  try {
    SalesService.createSale({
      transaction_date: new Date(),
      customer_name: "Customer Zero Test",
      sales_channel: "DIRECT",
      payment_method: "CASH",
      items: [{
        variant_id: "VAR-HOTFIX-01",
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

  assertTrue(threw, "Penjualan 1 pc Dzaki harus ditolak karena stok Dzaki sudah 0!");
  assertTrue(errMsg.includes("Tersedia: 0"), "Pesan error harus menyatakan tersedia 0 unit");
});

// Skenario 7: Penjualan Sah Milik Vendor B Saat Dzaki Habis
let saleVendorBDetailId = null;
runTest(7, "Penjualan Sah Milik Vendor B (3 pcs) Saat Dzaki Habis", () => {
  const saleB = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Customer Vendor B",
    sales_channel: "WEBSITE",
    payment_method: "TRANSFER_BCA",
    items: [{
      variant_id: "VAR-HOTFIX-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-VNDB",
      quantity: 3,
      actual_price: 400000
    }]
  }, "hafiz");

  assertTrue(saleB.success, "Penjualan Vendor B harus sukses");

  const salesIdB = saleB.salesId || saleB.header.sales_id;
  const details = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_id === salesIdB);
  assertEquals(details[0].batch_id, vendorBLotId, "batch_id harus menunjuk ke consignment_lot_id Vendor B");
  saleVendorBDetailId = details[0].sales_detail_id;

  const vendorBLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", vendorBLotId);
  assertEquals(Number(vendorBLot.remaining_qty), 1, "Sisa lot Vendor B harus 1 pc");
  assertEquals(vendorBLot.status, "ACTIVE", "Status lot Vendor B tetap ACTIVE");

  const stk = InventoryService.getStock("VAR-HOTFIX-01");
  assertEquals(stk.consignment_physical_stock, 1, "Sisa stok fisik konsinyasi total sekarang 1 pc");
});

// Skenario 8: Retur Penjualan Dzaki Memulihkan Lot Spesifik
runTest(8, "Retur Penjualan Dzaki Memulihkan remaining_qty dan Mengaktifkan Kembali Lot (EXHAUSTED -> ACTIVE)", () => {
  // Retur 1 pc dari transaksi Dzaki pertama (saleDzaki1DetailId)
  const salesIdDzaki = saleDzaki1.salesId || saleDzaki1.header.sales_id;
  const retRes = SalesService.returnSaleItem(salesIdDzaki, saleDzaki1DetailId, 1, "Salah ukuran", "hafiz");
  assertTrue(retRes.success, "Retur barang harus sukses");

  const dzakiLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", dzakiLot1Id);
  assertEquals(Number(dzakiLot.remaining_qty), 1, "Sisa lot Dzaki harus bertambah kembali menjadi 1 pc");
  assertEquals(dzakiLot.status, "ACTIVE", "Status lot Dzaki harus aktif kembali (ACTIVE)");

  const stk = InventoryService.getStock("VAR-HOTFIX-01");
  assertEquals(stk.consignment_physical_stock, 2, "Stok fisik bertambah kembali menjadi 2 pcs (1 Dzaki + 1 Vendor B)");
});

// Skenario 9: Penjualan Kembali Setelah Stok Dipulihkan oleh Retur
runTest(9, "Penjualan Kembali 1 pc Dzaki yang Baru Dipulihkan Retur", () => {
  const saleDzakiRe = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Customer Re-buy Dzaki",
    sales_channel: "DIRECT",
    payment_method: "CASH",
    items: [{
      variant_id: "VAR-HOTFIX-01",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI",
      quantity: 1,
      actual_price: 350000
    }]
  }, "hafiz");

  assertTrue(saleDzakiRe.success, "Penjualan 1 pc Dzaki harus berhasil");

  const dzakiLot = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", dzakiLot1Id);
  assertEquals(Number(dzakiLot.remaining_qty), 0, "Sisa lot Dzaki menjadi 0 kembali");
  assertEquals(dzakiLot.status, "EXHAUSTED", "Status lot Dzaki menjadi EXHAUSTED kembali");

  const stk = InventoryService.getStock("VAR-HOTFIX-01");
  assertEquals(stk.consignment_physical_stock, 1, "Sisa stok fisik konsinyasi sekarang 1 pc (milik Vendor B)");
});

// Skenario 10: Multi-Lot FIFO Split untuk Vendor yang Sama
runTest(10, "Multi-Lot FIFO Split untuk Vendor C (Lot 1: 2 pcs, Lot 2: 3 pcs, Dipotong 4 pcs)", () => {
  // Setup varian baru untuk Vendor C
  DatabaseHelper.insertRow("VARIAN_PRODUK", {
    variant_id: "VAR-HOTFIX-02",
    product_id: "PRD-HOTFIX",
    sku: "CRC-HOTFIX-M10",
    size: "M10",
    color: "White",
    catalog_price: 450000,
    reference_hpp: 0,
    is_active: true
  });

  const resLot1 = InventoryService.receiveConsignmentStock("VND-VNDC", "VAR-HOTFIX-02", 2, "Vendor C Lot 1", "hafiz");
  const lot1Id = resLot1.lot_id;

  const resLot2 = InventoryService.receiveConsignmentStock("VND-VNDC", "VAR-HOTFIX-02", 3, "Vendor C Lot 2", "hafiz");
  const lot2Id = resLot2.lot_id;

  // Jual 4 pcs sekaligus untuk Vendor C
  const saleC = SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Customer Multi-Lot C",
    sales_channel: "WEBSITE",
    payment_method: "TRANSFER_BCA",
    items: [{
      variant_id: "VAR-HOTFIX-02",
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-VNDC",
      quantity: 4,
      actual_price: 450000
    }]
  }, "hafiz");

  assertTrue(saleC.success, "Penjualan multi-lot Vendor C harus berhasil");

  const salesIdC = saleC.salesId || saleC.header.sales_id;
  const details = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_id === salesIdC);
  assertEquals(details.length, 2, "Penjualan harus dipecah menjadi 2 detail baris (Split-Lot)");

  assertEquals(details[0].batch_id, lot1Id, "Baris 1 harus mengambil Lot 1");
  assertEquals(Number(details[0].quantity), 2, "Baris 1 kuantitas 2");

  assertEquals(details[1].batch_id, lot2Id, "Baris 2 harus mengambil Lot 2");
  assertEquals(Number(details[1].quantity), 2, "Baris 2 kuantitas 2");

  // Periksa kondisi lot di BATCH_KONSINYASI
  const lot1 = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", lot1Id);
  assertEquals(Number(lot1.remaining_qty), 0, "Lot 1 harus habis (0)");
  assertEquals(lot1.status, "EXHAUSTED", "Lot 1 status EXHAUSTED");

  const lot2 = DatabaseHelper.getRowByPk("BATCH_KONSINYASI", "consignment_lot_id", lot2Id);
  assertEquals(Number(lot2.remaining_qty), 1, "Lot 2 harus tersisa 1 pc (3 - 2)");
  assertEquals(lot2.status, "ACTIVE", "Lot 2 status ACTIVE");
});

// Skenario 11: Validasi Error Parameter Vendor & Varian
runTest(11, "Validasi Error Parameter Konsinyasi (Tanpa vendor_id, Vendor Salah, Qty Negatif)", () => {
  let threwNoVendor = false;
  try {
    InventoryService.depleteConsignmentStock("SLS-TEST", "VAR-HOTFIX-01", "", 1, 350000, "hafiz");
  } catch (e) {
    threwNoVendor = true;
  }
  assertTrue(threwNoVendor, "Deplete tanpa vendorId harus ditolak");

  let threwNonExist = false;
  try {
    InventoryService.depleteConsignmentStock("SLS-TEST", "VAR-HOTFIX-01", "VND-GHOST", 1, 350000, "hafiz");
  } catch (e) {
    threwNonExist = true;
  }
  assertTrue(threwNonExist, "Deplete untuk vendor yang tidak ada stoknya harus ditolak");

  let threwNeg = false;
  try {
    InventoryService.depleteConsignmentStock("SLS-TEST", "VAR-HOTFIX-01", "VND-DZAKI", -2, 350000, "hafiz");
  } catch (e) {
    threwNeg = true;
  }
  assertTrue(threwNeg, "Deplete kuantitas negatif harus ditolak");
});

// Skenario 12: Integritas Finansial Konsinyasi (HPP = 0, Hak Vendor & Insentif)
runTest(12, "Integritas Finansial Konsinyasi (HPP = 0, Hak Dzaki Rp270k, Komisi Vendor B 10%)", () => {
  // Transaksi Dzaki: Harga Rp350.000, Fixed Share Dzaki Rp270.000, Insentif CrocsCircle Rp80.000
  const detailDzaki = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_detail_id === saleDzaki1DetailId)[0];
  assertEquals(Number(detailDzaki.hpp_unit), 0, "HPP CrocsCircle untuk konsinyasi harus 0");
  assertEquals(Number(detailDzaki.total_hpp), 0, "Total HPP harus 0");
  assertEquals(Number(detailDzaki.vendor_payable_unit), 270000, "Hak Dzaki per unit = Rp270.000");
  assertEquals(Number(detailDzaki.crocs_incentive_unit), 80000, "Insentif Crocs per unit = Rp80.000");

  // Transaksi Vendor B: Harga Rp400.000, Qty 3, Fee 10% (Crocs Rp40.000/unit, Vendor B Rp360.000/unit)
  const detailB = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_detail_id === saleVendorBDetailId)[0];
  assertEquals(Number(detailB.hpp_unit), 0, "HPP CrocsCircle untuk konsinyasi harus 0");
  assertEquals(Number(detailB.vendor_payable_unit), 360000, "Hak Vendor B per unit = Rp360.000");
  assertEquals(Number(detailB.crocs_incentive_unit), 40000, "Insentif Crocs per unit = Rp40.000");
  assertEquals(Number(detailB.total_vendor_payable), 1080000, "Total kewajiban Vendor B = Rp1.080.000 (3 x Rp360.000)");
  assertEquals(Number(detailB.total_crocs_incentive), 120000, "Total insentif Crocs = Rp120.000 (3 x Rp40.000)");
});

// Skenario 13: Reversal Kewajiban Finansial Saat Retur Barang Konsinyasi
runTest(13, "Reversal Kewajiban Finansial Saat Retur (Total Payable Dikurangi, Status CANCELLED/ADJUSTED)", () => {
  const detailDzaki = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_detail_id === saleDzaki1DetailId)[0];
  // Karena 1 pc diretur dari order 1 pc, kewajiban vendor harus menjadi 0 dan status CANCELLED
  assertEquals(Number(detailDzaki.total_vendor_payable), 0, "Kewajiban vendor setelah retur penuh harus 0");
  assertEquals(Number(detailDzaki.vendor_remaining_payable), 0, "Sisa kewajiban vendor harus 0");
  assertEquals(detailDzaki.settlement_status, "CANCELLED", "Status settlement harus CANCELLED");
});

// Skenario 14: Audit Trail MUTASI_STOK & Konsistensi getConsignmentStockByVendor
runTest(14, "Audit Trail MUTASI_STOK & Konsistensi getConsignmentStockByVendor", () => {
  const mutasi = DatabaseHelper.getAllRows("MUTASI_STOK", m => m.variant_id === "VAR-HOTFIX-01");
  assertTrue(mutasi.length >= 5, "Harus ada minimal 5 mutasi stok tercatat");

  // Mutasi receipt
  const receipts = mutasi.filter(m => m.movement_type === "CONSIGNMENT_RECEIPT");
  assertEquals(receipts.length, 2, "Harus ada 2 mutasi CONSIGNMENT_RECEIPT");
  assertTrue(receipts.some(r => r.reference_id === dzakiLot1Id), "Receipt Dzaki merujuk ke lot ID");
  assertTrue(receipts.some(r => r.reference_id === vendorBLotId), "Receipt Vendor B merujuk ke lot ID");

  // Mutasi retur
  const returns = mutasi.filter(m => m.movement_type === "RETURN_IN");
  assertTrue(returns.length >= 1, "Harus ada mutasi RETURN_IN");

  // getConsignmentStockByVendor verification
  const dzakiStock = InventoryService.getConsignmentStockByVendor("VAR-HOTFIX-01", "VND-DZAKI");
  assertEquals(dzakiStock.available_qty, 0, "Dzaki available qty harus 0");

  const vendorBStock = InventoryService.getConsignmentStockByVendor("VAR-HOTFIX-01", "VND-VNDB");
  assertEquals(vendorBStock.available_qty, 1, "Vendor B available qty harus 1");

  const vendorCStock = InventoryService.getConsignmentStockByVendor("VAR-HOTFIX-02", "VND-VNDC");
  assertEquals(vendorCStock.available_qty, 1, "Vendor C available qty harus 1");
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n==========================================================================");
console.log(`📊 PHASE 3B HOTFIX TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log("==========================================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("\x1b[32m🎉 SEMUA 14 SKENARIO HOTFIX KONSINYASI MULTI-VENDOR LULUS 100%!\x1b[0m\n");
  process.exit(0);
}
