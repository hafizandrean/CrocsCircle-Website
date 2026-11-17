/**
 * CROCSCIRCLE.ID — FINAL REVIEW & INVENTORY INTEGRITY AUDIT SUITE (PHASE 3B)
 * 
 * Pengujian Mendalam Integritas Inventaris, Multi-Kepemilikan Stok, Penerimaan Bertahap,
 * FIFO Split-Batch, Reservasi & Pemenuhan PO, Immutabilitas Mutasi, dan RBAC.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock GAS Spreadsheet Environment
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

let passed = 0;
let failed = 0;

function assert(condition, testName, errMsg) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: ${errMsg || "Assertion failed"}`);
    failed++;
  }
}

console.log("=======================================================================");
console.log("🔍 CROCSCIRCLE.ID — PHASE 3B FINAL REVIEW & INVENTORY AUDIT SUITE");
console.log("=======================================================================\n");

// Inisialisasi Database
initializeCrocsCircleDatabase();

// Setup Users
AuthService.setupOwnerAccount("hafiz_owner", "Hafiz Owner", "HafizPass2026!");
const ownerLogin = AuthService.login("hafiz_owner", "HafizPass2026!");
const ownerToken = ownerLogin.token;

AuthService.setupOwnerAccount("harits_owner", "Harits Owner", "HaritsPass2026!");
const owner2Login = AuthService.login("harits_owner", "HaritsPass2026!");
const owner2Token = owner2Login.token;

AuthService.createAdminAccount(ownerToken, "admin_staff", "Admin Staff", "AdminPass2026!");
const adminLogin = AuthService.login("admin_staff", "AdminPass2026!");
const adminToken = adminLogin.token;

// =========================================================================
// BAGIAN 1: AUDIT PEMISAHAN KEPEMILIKAN STOK PADA SKU YANG SAMA
// =========================================================================
console.log("--- BAGIAN 1: AUDIT PEMISAHAN KEPEMILIKAN PADA SKU YANG SAMA ---");

// Buat Produk & Varian Uji
ProductService.createProduct({
  product_id: "PRD-AUDIT-01",
  product_name: "Crocs Classic Audit Clog",
  category_id: "CLOG",
  model: "Classic"
}, "hafiz_owner");

ProductService.createVariant({
  variant_id: "VAR-AUDIT-W7",
  product_id: "PRD-AUDIT-01",
  color: "Bone",
  size: "W7",
  sku: "CRC-CRUSH-BN-W7",
  catalog_price: 1299000,
  reference_hpp: 700000
}, "hafiz_owner");

// Terima 5 pcs OWN_STOCK @700.000
ProductService.createPurchaseOrder({
  purchase_id: "PUR-AUDIT-01",
  supplier_name: "Supplier Jakarta",
  receiving_status: "RECEIVED"
}, [{
  variant_id: "VAR-AUDIT-W7",
  quantity: 5,
  base_unit_cost: 700000
}], "hafiz_owner");

// Terima 3 pcs VENDOR_CONSIGNMENT dari Dzaki
ProductService.receiveConsignment("VND-DZAKI", "VAR-AUDIT-W7", 3, "Titip Jual Dzaki", "hafiz_owner");

const stk1 = InventoryService.getStock("VAR-AUDIT-W7");
assert(
  stk1.owned_physical_stock === 5 &&
  stk1.consignment_physical_stock === 3 &&
  stk1.total_available_stock === 8,
  "1.1 Stok fisik OWNED (5) dan CONSIGNMENT (3) terpisah sempurna pada SKU yang sama (Total Available = 8)"
);

// Jual 2 pcs OWN_STOCK via Kasir
const saleOwned = SalesService.createSale({
  transaction_date: new Date(),
  customer_name: "Customer A",
  items: [{
    variant_id: "VAR-AUDIT-W7",
    quantity: 2,
    actual_price: 1299000,
    item_ownership: "OWNED"
  }]
}, "hafiz_owner");

const stkAfterOwnedSale = InventoryService.getStock("VAR-AUDIT-W7");
assert(
  stkAfterOwnedSale.owned_physical_stock === 3 &&
  stkAfterOwnedSale.consignment_physical_stock === 3 &&
  saleOwned.details[0].total_hpp === 1400000 &&
  saleOwned.details[0].vendor_remaining_payable === 0,
  "1.2 Penjualan OWNED memotong batch FIFO modal (HPP Rp1.400.000) tanpa mengurangi stok konsinyasi"
);

// Jual 1 pcs CONSIGNMENT via Kasir
const saleConsignment = SalesService.createSale({
  transaction_date: new Date(),
  customer_name: "Customer B",
  items: [{
    variant_id: "VAR-AUDIT-W7",
    quantity: 1,
    actual_price: 1299000,
    item_ownership: "CONSIGNMENT",
    vendor_id: "VND-DZAKI"
  }]
}, "hafiz_owner");

const stkAfterConsSale = InventoryService.getStock("VAR-AUDIT-W7");
assert(
  stkAfterConsSale.owned_physical_stock === 3 &&
  stkAfterConsSale.consignment_physical_stock === 2 &&
  saleConsignment.details[0].total_hpp === 0 &&
  saleConsignment.details[0].vendor_remaining_payable === 270000,
  "1.3 Penjualan CONSIGNMENT menghasilkan HPP = 0 & mencatat kewajiban vendor Rp270.000 tanpa memotong stok sendiri"
);

// =========================================================================
// BAGIAN 2: AUDIT PENERIMAAN STOK BERTINGKAT & SEBAGIAN (PARTIAL RECEIPT)
// =========================================================================
console.log("\n--- BAGIAN 2: AUDIT PENERIMAAN STOK BERTINGKAT & SEBAGIAN ---");

// Scenario A: Supplier PO 10 unit -> Terima 5, lalu terima 5
ProductService.createVariant({
  variant_id: "VAR-AUDIT-M9",
  product_id: "PRD-AUDIT-01",
  color: "Black",
  size: "M9",
  sku: "CRC-CRUSH-BK-M9",
  catalog_price: 1299000
}, "hafiz_owner");

ProductService.createPurchaseOrder({
  purchase_id: "PUR-STEP-01",
  supplier_name: "Supplier Bandung",
  receiving_status: "ORDERED"
}, [{
  variant_id: "VAR-AUDIT-M9",
  quantity: 10,
  base_unit_cost: 650000
}], "hafiz_owner");

// Verifikasi sebelum diterima: stok fisik = 0, available = 0
const stockPre = InventoryService.getStock("VAR-AUDIT-M9");
assert(
  stockPre.owned_physical_stock === 0 && stockPre.total_available_stock === 0,
  "2.1 Pesanan berstatus ORDERED tidak menambah stok fisik atau available sebelum barang diterima"
);

// Penerimaan tahap 1: 5 unit
ProductService.receivePartialPurchase("PUR-STEP-01", [{
  variant_id: "VAR-AUDIT-M9",
  quantity: 5,
  base_unit_cost: 650000,
  is_last_delivery: false
}], "Tahap 1 datang 5 pcs", "hafiz_owner");

const stockPart1 = InventoryService.getStock("VAR-AUDIT-M9");
const poPart1 = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", "PUR-STEP-01");
const batchesPart1 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === "PUR-STEP-01");

assert(
  stockPart1.owned_physical_stock === 5 &&
  poPart1.receiving_status === "PARTIAL_RECEIVED" &&
  batchesPart1.length === 1 &&
  batchesPart1[0].remaining_qty === 5,
  "2.2 Penerimaan tahap 1 menambah tepat 5 pcs fisik & batch persediaan terbentuk tepat 5 pcs"
);

// Penerimaan tahap 2 (terakhir): 5 unit
ProductService.receivePartialPurchase("PUR-STEP-01", [{
  variant_id: "VAR-AUDIT-M9",
  quantity: 5,
  base_unit_cost: 650000,
  is_last_delivery: true
}], "Tahap 2 sisa 5 pcs lengkap", "hafiz_owner");

const stockPart2 = InventoryService.getStock("VAR-AUDIT-M9");
const poPart2 = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", "PUR-STEP-01");
const batchesPart2 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === "PUR-STEP-01");

assert(
  stockPart2.owned_physical_stock === 10 &&
  poPart2.receiving_status === "RECEIVED" &&
  batchesPart2.length === 2 &&
  (batchesPart2[0].remaining_qty + batchesPart2[1].remaining_qty === 10),
  "2.3 Penerimaan tahap 2 melengkapi total fisik 10 pcs & update status PO ke RECEIVED"
);

// Mencegah penerimaan ganda saat status sudah RECEIVED
let doubleReceiveRejected = false;
try {
  ProductService.receivePartialPurchase("PUR-STEP-01", [{
    variant_id: "VAR-AUDIT-M9",
    quantity: 5,
    base_unit_cost: 650000
  }], "Mencoba terima lagi", "hafiz_owner");
} catch (e) {
  doubleReceiveRejected = true;
}
assert(doubleReceiveRejected, "2.4 Mencegah penerimaan ganda pada PO yang sudah berstatus RECEIVED penuh");

// =========================================================================
// BAGIAN 3: AUDIT FIFO MULTI-BATCH & RESERVASI PRE-ORDER (PO)
// =========================================================================
console.log("\n--- BAGIAN 3: AUDIT FIFO MULTI-BATCH & RESERVASI PO ---");

// Bentuk 2 batch pada varian baru
ProductService.createVariant({
  variant_id: "VAR-FIFO-01",
  product_id: "PRD-AUDIT-01",
  color: "Stucco",
  size: "M10",
  sku: "CRC-FIFO-ST-M10",
  catalog_price: 1399000
}, "hafiz_owner");

// Batch 1: 5 pcs @700.000 (Pur ID PUR-BATCH-01)
InventoryService.receiveOwnedStockBatch("PUR-BATCH-01", "VAR-FIFO-01", 5, 700000, 0, "Batch 1", "hafiz_owner");
// Batch 2: 5 pcs @800.000 (Pur ID PUR-BATCH-02)
InventoryService.receiveOwnedStockBatch("PUR-BATCH-02", "VAR-FIFO-01", 5, 800000, 0, "Batch 2", "hafiz_owner");

// Lakukan reservasi PO sebanyak 2 pcs
InventoryService.reserveStock("PO-AUDIT-01", "VAR-FIFO-01", 2, "OWNED", "hafiz_owner");

const stockRes = InventoryService.getStock("VAR-FIFO-01");
assert(
  stockRes.owned_physical_stock === 10 &&
  stockRes.owned_reserved_stock === 2 &&
  stockRes.total_available_stock === 8,
  "3.1 Reservasi PO mengunci 2 pcs (Physical tetap 10, Reserved = 2, Available = 8)"
);

// Batalkan reservasi PO
InventoryService.releaseReservation("PO-AUDIT-01", "VAR-FIFO-01", 2, "OWNED", "hafiz_owner");
const stockReleased = InventoryService.getStock("VAR-FIFO-01");
assert(
  stockReleased.owned_reserved_stock === 0 && stockReleased.total_available_stock === 10,
  "3.2 Pembatalan PO membebaskan reservasi & memulihkan available stock menjadi 10 pcs"
);

// Jual 7 pcs stok sendiri (harus split: 5 pcs @700k dari Batch 1, dan 2 pcs @800k dari Batch 2)
const fifoDeplete = InventoryService.depleteOwnedStockFIFO("SAL-AUDIT-FIFO", "VAR-FIFO-01", 7, 1399000, "hafiz_owner", "IDEMP-AUDIT-FIFO");
const expectedTotalHpp = (5 * 700000) + (2 * 800000); // 3.500.000 + 1.600.000 = 5.100.000
const actualTotalHpp = fifoDeplete.allocations.reduce((sum, a) => sum + a.total_hpp, 0);

assert(
  fifoDeplete.allocations.length === 2 &&
  actualTotalHpp === expectedTotalHpp &&
  fifoDeplete.allocations[0].quantity === 5 &&
  fifoDeplete.allocations[1].quantity === 2,
  "3.3 FIFO memecah batch secara akurat (5 pcs @700k + 2 pcs @800k = Total HPP Rp5.100.000)"
);

// =========================================================================
// BAGIAN 4: AUDIT IMMUTABILITAS & INTEGRITAS RIWAYAT MUTASI STOK
// =========================================================================
console.log("\n--- BAGIAN 4: AUDIT IMMUTABILITAS & INTEGRITAS RIWAYAT MUTASI STOK ---");

const allMovements = ProductService.getStockMovements({ sku: "CRC-FIFO-ST-M10" });
const receiptMovements = allMovements.filter(m => m.movement_type === "PURCHASE_RECEIPT");
const reservationMovements = allMovements.filter(m => m.movement_type === "STOCK_RESERVATION");
const releaseMovements = allMovements.filter(m => m.movement_type === "RELEASE_RESERVATION");
const salesMovements = allMovements.filter(m => m.movement_type === "SALES_DISPATCH");

assert(
  allMovements.length === 5 &&
  receiptMovements.length === 2 &&
  reservationMovements.length === 1 &&
  releaseMovements.length === 1 &&
  salesMovements.length === 1 &&
  salesMovements[0].quantity === -7,
  "4.1 Seluruh kronologi mutasi tercatat permanen (2x Receipt, Reserve, Release, Sales -7 pcs) tanpa ada baris tertimpa"
);

// =========================================================================
// BAGIAN 5: AUDIT SERVER-SIDE RBAC (OWNER VS ADMIN ACCESS)
// =========================================================================
console.log("\n--- BAGIAN 5: AUDIT SERVER-SIDE RBAC (OWNER VS ADMIN) ---");

// Owner 1 dan Owner 2 Identik
const owner1Inv = AdminController.getInventory(ownerToken, {});
const owner2Inv = AdminController.getInventory(owner2Token, {});
const adminInv = AdminController.getInventory(adminToken, {});

const o1Item = owner1Inv.inventory.find(i => i.sku === "CRC-FIFO-ST-M10");
const o2Item = owner2Inv.inventory.find(i => i.sku === "CRC-FIFO-ST-M10");
const admItem = adminInv.inventory.find(i => i.sku === "CRC-FIFO-ST-M10");

assert(
  o1Item.fifo_batches[0].unit_cost === 800000 &&
  o2Item.fifo_batches[0].unit_cost === 800000,
  "5.1 Owner 1 dan Owner 2 memiliki hak akses membaca nilai modal HPP yang 100% identik"
);

assert(
  adminInv.is_financial_restricted === true &&
  admItem.fifo_batches[0].unit_cost === null &&
  admItem.reference_hpp === null,
  "5.2 Admin dibatasi di server: unit_cost = null & reference_hpp = null pada seluruh inventory"
);

console.log("\n=======================================================================");
console.log(`📊 REKAPITULASI AUDIT FINAL REVIEW PHASE 3B: ${passed} LULUS, ${failed} GAGAL`);
console.log("=======================================================================");

if (failed === 0) {
  console.log("🎉 SELURUH SKENARIO AUDIT FINAL REVIEW PHASE 3B LULUS 100%!");
  process.exit(0);
} else {
  console.error("❌ ADA SKENARIO AUDIT YANG GAGAL!");
  process.exit(1);
}
