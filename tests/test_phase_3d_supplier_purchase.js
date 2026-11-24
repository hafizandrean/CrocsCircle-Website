/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3 TEST SUITE
 * Pembelian Stok Supplier & Pengeluaran Operasional
 * 
 * 10 Core Financial, Inventory, and Accounting Scenarios:
 * 1. Pembuatan Faktur Pembelian Supplier Tanpa Menambah Stok Fisik (Status UNRECEIVED, Stok 0)
 * 2. Penerimaan Fisik Bertahap (Partial Reception: 10 unit dipesan, 6 tiba, lalu 4 tiba)
 * 3. Idempotency Key Penerimaan Barang (Mencegah Duplikasi Batch Persediaan & Mutasi Stok)
 * 4. Validasi Batas Kuantitas Penerimaan (Menolak Penerimaan Melebihi Kuantitas Faktur)
 * 5. Multi-Item Purchase Invoice (Faktur dengan Banyak Varian Berbeda & Pemenuhan Parsial)
 * 6. Isolasi Akuntansi Pembelian Stok (TIDAK Masuk Pengeluaran Operasional / Contra-Expense)
 * 7. Pencatatan Pengeluaran Operasional Sah (Masuk Tabel PENGELUARAN & Mengurangi Saldo Kas)
 * 8. Penolakan Keras Kategori Non-Operasional (STOCK_PURCHASE, VENDOR_SETTLEMENT Ditolak Keras)
 * 9. Filter & Sanitasi Riwayat Pembelian & Beban (getPurchasesList & getExpensesList)
 * 10. Integrasi End-to-End FIFO Penjualan atas Stok Hasil Penerimaan Faktur Supplier
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
  getName() { return this.name; }
  clearContents() { this.cells = {}; }
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

const mockSpreadsheet = new MockSpreadsheet();
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => mockSpreadsheet,
  openById: () => mockSpreadsheet
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    waitLock: () => true,
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
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    if (fmt === 'yyyyMMdd') return `${y}${m}${d}`;
    if (fmt === 'yyyyMMdd-HHmmss') return `${y}${m}${d}-${h}${min}${s}`;
    if (fmt === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
    if (fmt === 'yyyy-MM') return `${y}-${m}`;
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  },
  getUuid: () => crypto.randomUUID(),
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

// Load Backend Modules
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

// Initialize Database Schema
initializeCrocsCircleDatabase();

// Setup Owner & Admin Users
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const ownerLogin = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = ownerLogin.token;

AuthService.setupOwnerAccount("admin1", "Admin Operasional", "AdminOperasional2026!");
DatabaseHelper.updateRowByPk("USERS", "username", "admin1", { role: "ADMIN" });
const adminLogin = AuthService.login("admin1", "AdminOperasional2026!");
const adminToken = adminLogin.token;

// Setup Master Data for Supplier Testing
DatabaseHelper.insertRow("KATEGORI", { category_id: "CAT-CLOG", category_name: "Clogs", description: "Classic Crocs" });

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-PUR-01",
  product_name: "Crocs Classic Clog - Bone",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-PUR-01",
  product_id: "PROD-PUR-01",
  color: "Bone",
  size: "M9W11",
  sku: "CC-BONE-M9",
  catalog_price: 320000,
  reference_hpp: 160000,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-PUR-02",
  product_id: "PROD-PUR-01",
  color: "Black",
  size: "M8W10",
  sku: "CC-BLK-M8",
  catalog_price: 320000,
  reference_hpp: 155000,
  is_active: true
});

// Test Assertion Framework
let passCount = 0;
let failCount = 0;
const testResults = [];

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  ✅ PASS: ${message}`);
    testResults.push({ status: "PASS", message });
  } else {
    failCount++;
    console.error(`  ❌ FAIL: ${message}`);
    testResults.push({ status: "FAIL", message });
  }
}

console.log("\n==========================================================================");
console.log("CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: PEMBELIAN STOK & BEBAN OPERASIONAL");
console.log("==========================================================================\n");

// -------------------------------------------------------------------------
// SKENARIO 1: Pembuatan Faktur Pembelian Supplier Tanpa Menambah Stok Fisik
// -------------------------------------------------------------------------
console.log("▶ Skenario 1: Pembuatan Faktur Pembelian Tanpa Menambah Stok Fisik");

const stockBeforePur = InventoryService.getStock("VAR-PUR-01");
assert(stockBeforePur.owned_physical_stock === 0, "Stok fisik awal varian VAR-PUR-01 adalah 0");
assert(stockBeforePur.owned_available_stock === 0, "Stok available awal varian VAR-PUR-01 adalah 0");

const invoiceData1 = {
  vendor_id: "VND-IMPORT-01",
  supplier_name: "PT Mitra Sepatu Global",
  purchase_date: "2026-11-18",
  shipping_cost: 50000,
  notes: "Faktur PO Import Batch 10 Pcs",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-PUR-01",
      quantity: 10,
      base_unit_cost: 150000,
      vendor_incentive: 10000
    }
  ]
};

const invoice1 = InventoryService.createPurchaseInvoice(invoiceData1);
assert(invoice1.success === true, "Pembuatan faktur pembelian berhasil");
assert(invoice1.purchase_id.startsWith("PUR-"), `ID Faktur berformat PUR- (${invoice1.purchase_id})`);
assert(invoice1.subtotal === 1500000, "Subtotal kotor 10 x 150.000 = 1.500.000");
assert(invoice1.total_purchase === 1550000, "Total faktur termasuk ongkir 50.000 = 1.550.000");
assert(invoice1.receiving_status === "UNRECEIVED", "Status penerimaan awal adalah UNRECEIVED");
assert(invoice1.payment_status === "UNPAID", "Status pembayaran awal adalah UNPAID");

// Verifikasi fisik di STOK: stok fisik dan available TIDAK BOLEH BERTAMBAH
const stockAfterPur = InventoryService.getStock("VAR-PUR-01");
assert(stockAfterPur.owned_physical_stock === 0, "Stok fisik tetap 0 setelah faktur pembelian diterbitkan");
assert(stockAfterPur.owned_available_stock === 0, "Stok available tetap 0 setelah faktur pembelian diterbitkan");

// Verifikasi MUTASI_STOK: tidak boleh ada mutasi persediaan yang tercatat
const purMutations = DatabaseHelper.getAllRows("MUTASI_STOK", m => m.reference_id === invoice1.purchase_id);
assert(purMutations.length === 0, "Tidak ada mutasi stok tercatat saat pembuatan faktur pembelian");

// -------------------------------------------------------------------------
// SKENARIO 2: Penerimaan Fisik Bertahap (Partial Reception)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 2: Penerimaan Fisik Bertahap (Tahap 1: 6 unit, Tahap 2: 4 unit)");

// Tahap 1: Penerimaan 6 unit
const receiptKey1 = "IDEM-PUR-RCV-01";
const receiptResult1 = InventoryService.receivePurchaseShipment({
  purchase_id: invoice1.purchase_id,
  idempotency_key: receiptKey1,
  notes: "Penerimaan tahap 1: 6 pasang tiba dari gudang Cikarang",
  created_by: "admin1",
  received_items: [
    {
      variant_id: "VAR-PUR-01",
      quantity: 6,
      base_unit_cost: 150000,
      vendor_incentive: 10000
    }
  ]
});

assert(receiptResult1.success === true, "Penerimaan tahap 1 berhasil diproses");
assert(receiptResult1.batches_created === 1, "1 batch persediaan dibuat pada penerimaan tahap 1");
assert(receiptResult1.new_receiving_status === "PARTIAL_RECEIVED", "Status faktur diperbarui menjadi PARTIAL_RECEIVED");

// Periksa tabel PEMBELIAN_STOK
const invoiceRowAfterRcv1 = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoice1.purchase_id);
assert(invoiceRowAfterRcv1.receiving_status === "PARTIAL_RECEIVED", "Header PEMBELIAN_STOK berstatus PARTIAL_RECEIVED");

// Periksa STOK fisik
const stockAfterRcv1 = InventoryService.getStock("VAR-PUR-01");
assert(stockAfterRcv1.owned_physical_stock === 6, "Stok fisik bertambah tepat +6 (menjadi 6)");
assert(stockAfterRcv1.owned_available_stock === 6, "Stok available bertambah tepat +6 (menjadi 6)");

// Periksa DETAIL_PEMBELIAN
const batchesRcv1 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === invoice1.purchase_id);
assert(batchesRcv1.length === 1, "Tabel DETAIL_PEMBELIAN memiliki 1 baris batch untuk faktur ini");
assert(batchesRcv1[0].quantity === 6, "Batch kuantitas awal = 6");
assert(batchesRcv1[0].remaining_qty === 6, "Batch sisa stok FIFO = 6");
assert(batchesRcv1[0].unit_cost === 165000, "Unit cost = base_unit_cost (150.000) + incentive (10.000) + shipping_allocation (5.000) = 165.000");

// Tahap 2: Penerimaan sisa 4 unit
const receiptKey2 = "IDEM-PUR-RCV-02";
const receiptResult2 = InventoryService.receivePurchaseShipment({
  purchase_id: invoice1.purchase_id,
  idempotency_key: receiptKey2,
  notes: "Penerimaan tahap 2: sisa 4 pasang tiba",
  created_by: "admin1",
  received_items: [
    {
      variant_id: "VAR-PUR-01",
      quantity: 4,
      base_unit_cost: 150000,
      vendor_incentive: 10000
    }
  ]
});

assert(receiptResult2.success === true, "Penerimaan tahap 2 berhasil diproses");
assert(receiptResult2.new_receiving_status === "FULLY_RECEIVED", "Status faktur kini menjadi FULLY_RECEIVED");

const invoiceRowAfterRcv2 = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoice1.purchase_id);
assert(invoiceRowAfterRcv2.receiving_status === "FULLY_RECEIVED", "Header PEMBELIAN_STOK berstatus FULLY_RECEIVED");

const stockAfterRcv2 = InventoryService.getStock("VAR-PUR-01");
assert(stockAfterRcv2.owned_physical_stock === 10, "Total stok fisik terakumulasi penuh menjadi 10");
assert(stockAfterRcv2.owned_available_stock === 10, "Total stok available terakumulasi penuh menjadi 10");

const batchesRcv2 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === invoice1.purchase_id);
assert(batchesRcv2.length === 2, "Terdapat 2 batch FIFO terpisah di DETAIL_PEMBELIAN");
const totalReceivedQty = batchesRcv2.reduce((sum, b) => sum + Number(b.quantity), 0);
assert(totalReceivedQty === 10, "Akumulasi kuantitas diterima tepat 10 unit");

// -------------------------------------------------------------------------
// SKENARIO 3: Idempotency Key Penerimaan Barang
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 3: Idempotency Key Penerimaan Barang");

// Kirim ulang permintaan penerimaan tahap 2 dengan idempotency_key yang sama
const replayResult = InventoryService.receivePurchaseShipment({
  purchase_id: invoice1.purchase_id,
  idempotency_key: receiptKey2, // KEY SAMA
  notes: "Penerimaan tahap 2: kirim ulang akibat jaringan putus",
  created_by: "admin1",
  received_items: [
    {
      variant_id: "VAR-PUR-01",
      quantity: 4
    }
  ]
});

assert(replayResult.success === true, "Pemanggilan ulang dengan idempotency key sama mengembalikan success: true");
assert(replayResult.idempotent === true, "Respons menandai idempotent: true");
assert(replayResult.batches_created === 0, "Zero batch baru dibuat pada replay");

const stockAfterReplay = InventoryService.getStock("VAR-PUR-01");
assert(stockAfterReplay.owned_physical_stock === 10, "Stok fisik TIDAK bertambah ganda (tetap 10)");
const batchesAfterReplay = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === invoice1.purchase_id);
assert(batchesAfterReplay.length === 2, "DETAIL_PEMBELIAN tidak menggandakan baris batch (tetap 2)");

// -------------------------------------------------------------------------
// SKENARIO 4: Validasi Batas Kuantitas Penerimaan
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 4: Validasi Batas Kuantitas Penerimaan (Proteksi Over-receiving)");

// Buat faktur baru dengan kuantitas 5 unit
const invoiceData2 = {
  vendor_id: "VND-IMPORT-02",
  supplier_name: "Supplier Sepatu Lokal",
  purchase_date: "2026-11-18",
  shipping_cost: 25000,
  notes: "Faktur batas 5 unit",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-PUR-02",
      quantity: 5,
      base_unit_cost: 140000,
      vendor_incentive: 10000
    }
  ]
};
const invoice2 = InventoryService.createPurchaseInvoice(invoiceData2);

// Coba terima 6 unit (melebihi 5 yang dipesan)
let overReceiveError = null;
try {
  InventoryService.receivePurchaseShipment({
    purchase_id: invoice2.purchase_id,
    idempotency_key: "IDEM-OVER-01",
    notes: "Penerimaan berlebih",
    created_by: "admin1",
    received_items: [
      {
        variant_id: "VAR-PUR-02",
        quantity: 6 // Lebih dari 5
      }
    ]
  });
} catch (err) {
  overReceiveError = err.message;
}

assert(overReceiveError !== null, "Penerimaan melebihi pesanan berhasil ditolak sistem");
assert(overReceiveError.includes("melebihi jumlah yang dipesan"), `Pesan error menyebutkan kelebihan kuantitas: '${overReceiveError}'`);

const stockAfterOverAttempt = InventoryService.getStock("VAR-PUR-02");
assert(stockAfterOverAttempt.owned_physical_stock === 0, "Stok fisik tetap 0 setelah penolakan over-receiving");

// Sekarang coba penerimaan pada faktur 1 yang sudah FULLY_RECEIVED
let fullyReceivedError = null;
try {
  InventoryService.receivePurchaseShipment({
    purchase_id: invoice1.purchase_id,
    idempotency_key: "IDEM-FULLY-01",
    notes: "Penerimaan ke faktur yang sudah lunas penerimaan",
    created_by: "admin1",
    received_items: [
      {
        variant_id: "VAR-PUR-01",
        quantity: 1
      }
    ]
  });
} catch (err) {
  fullyReceivedError = err.message;
}
assert(fullyReceivedError !== null, "Penerimaan tambahan pada faktur yang sudah FULLY_RECEIVED berhasil ditolak");
assert(fullyReceivedError.includes("FULLY_RECEIVED"), `Pesan penolakan menyebutkan FULLY_RECEIVED: '${fullyReceivedError}'`);

// -------------------------------------------------------------------------
// SKENARIO 5: Multi-Item Purchase Invoice (Banyak Varian Berbeda)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 5: Multi-Item Purchase Invoice (Banyak Varian dalam 1 Faktur)");

const multiInvoiceData = {
  vendor_id: "VND-IMPORT-01",
  supplier_name: "PT Multi Varian Abadi",
  purchase_date: "2026-11-18",
  shipping_cost: 30000,
  notes: "Faktur Multi Varian: 3 unit Bone, 4 unit Black",
  created_by: "admin1",
  items: [
    { variant_id: "VAR-PUR-01", quantity: 3, base_unit_cost: 150000, vendor_incentive: 10000 },
    { variant_id: "VAR-PUR-02", quantity: 4, base_unit_cost: 140000, vendor_incentive: 10000 }
  ]
};

const multiInvoice = InventoryService.createPurchaseInvoice(multiInvoiceData);
assert(multiInvoice.success === true, "Faktur multi-item berhasil dibuat");
assert(multiInvoice.items_count === 2, "Faktur mencatat 2 item varian berbeda");
// subtotal = (3 * 150.000) + (4 * 140.000) = 450.000 + 560.000 = 1.010.000
assert(multiInvoice.subtotal === 1010000, "Subtotal tepat 1.010.000");
assert(multiInvoice.total_purchase === 1040000, "Total purchase dengan ongkir 30.000 = 1.040.000");

// Terima parsial: 3 unit VAR-PUR-01 tiba duluan, VAR-PUR-02 belum
const multiRcv1 = InventoryService.receivePurchaseShipment({
  purchase_id: multiInvoice.purchase_id,
  idempotency_key: "IDEM-MULTI-01",
  notes: "Varian 01 tiba penuh (3 unit), varian 02 belum tiba",
  created_by: "admin1",
  received_items: [
    { variant_id: "VAR-PUR-01", quantity: 3, base_unit_cost: 150000, vendor_incentive: 10000 }
  ]
});

assert(multiRcv1.new_receiving_status === "PARTIAL_RECEIVED", "Status tetap PARTIAL_RECEIVED karena varian kedua belum tiba");

// Terima sisa: 4 unit VAR-PUR-02
const multiRcv2 = InventoryService.receivePurchaseShipment({
  purchase_id: multiInvoice.purchase_id,
  idempotency_key: "IDEM-MULTI-02",
  notes: "Varian 02 tiba penuh (4 unit)",
  created_by: "admin1",
  received_items: [
    { variant_id: "VAR-PUR-02", quantity: 4, base_unit_cost: 140000, vendor_incentive: 10000 }
  ]
});

assert(multiRcv2.new_receiving_status === "FULLY_RECEIVED", "Status faktur berubah menjadi FULLY_RECEIVED setelah seluruh varian lengkap");

// -------------------------------------------------------------------------
// SKENARIO 6: Isolasi Akuntansi Pembelian Stok (Tidak Masuk PENGELUARAN)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 6: Isolasi Akuntansi Pembelian Stok");

// Periksa tabel PENGELUARAN: tidak boleh ada catatan pembelian stok
const allExpensesPre = DatabaseHelper.getAllRows("PENGELUARAN");
const purchaseInExpenses = allExpensesPre.filter(e => 
  String(e.category).toUpperCase().includes("PURCHASE") || 
  String(e.category).toUpperCase().includes("STOK") ||
  String(e.expense_id).startsWith("PUR-")
);
assert(purchaseInExpenses.length === 0, "Tidak ada satupun transaksi pembelian stok di tabel PENGELUARAN");

// Hitung laporan laba rugi bulan berjalan: pengeluaran operasional harus Rp0 jika belum ada expense sah
const incomeStmt = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(incomeStmt.expenses_breakdown.operational_expenses === 0, "Beban operasional di laporan laba rugi adalah Rp0 (pembelian stok tidak masuk beban)");

// Reconciliasi kas: pembelian stok dicatat di cash_outflow.stock_purchases_paid, bukan di operational_expenses_paid
const cashRecon = FinancialService.getMonthlyCashAndVendorReconciliation(11, 2026);
assert(cashRecon.cash_outflow.operational_expenses_paid === 0, "Arus kas beban operasional tetap Rp0");
assert(cashRecon.cash_outflow.stock_purchases_paid > 0, "Arus kas pembelian stok tercatat terpisah pada stock_purchases_paid");

// -------------------------------------------------------------------------
// SKENARIO 7: Pencatatan Pengeluaran Operasional Sah
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 7: Pencatatan Pengeluaran Operasional Sah");

const expense1 = FinancialService.recordOperationalExpense({
  expense_date: "2026-11-18",
  category: "PACKING",
  activity: "Belanja Lakban & Polymailer",
  description: "Pembelian kardus ukuran M x 50 dan lakban fragile x 5",
  amount: 85000,
  payment_method: "TRANSFER_BCA",
  paid_by: "Hafiz",
  notes: "Pengeluaran operasional resmi toko",
  created_by: "admin1"
});

assert(expense1.success === true, "Pengeluaran operasional sah berhasil dicatat");
assert(expense1.expense_id.startsWith("EXP-"), `ID Pengeluaran berformat EXP- (${expense1.expense_id})`);
assert(expense1.amount === 85000, "Nominal pengeluaran tepat 85.000");

// Verifikasi pembacaan dari database
const savedExpense = DatabaseHelper.getRowByPk("PENGELUARAN", "expense_id", expense1.expense_id);
assert(savedExpense !== null, "Baris pengeluaran tersimpan di sheet PENGELUARAN");
assert(savedExpense.category === "PACKING", "Kategori tersimpan adalah PACKING");

// Verifikasi dampak ke laporan laba rugi
const incomeStmtAfterExp = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(incomeStmtAfterExp.expenses_breakdown.operational_expenses === 85000, "Beban operasional pada laba rugi bertambah tepat 85.000");

// -------------------------------------------------------------------------
// SKENARIO 8: Penolakan Keras Kategori Non-Operasional
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 8: Penolakan Keras Kategori Non-Operasional");

const forbiddenTestCases = [
  "STOCK_PURCHASE",
  "PEMBELIAN_STOK",
  "PENGADAAN_STOK",
  "VENDOR_SETTLEMENT",
  "SETTLEMENT_VENDOR",
  "HUTANG_VENDOR",
  "VENDOR_PAYMENT"
];

forbiddenTestCases.forEach(category => {
  let catError = null;
  try {
    FinancialService.recordOperationalExpense({
      expense_date: "2026-11-18",
      category: category,
      description: "Percobaan bypass kategori non-operasional",
      amount: 500000,
      created_by: "admin1"
    });
  } catch (err) {
    catError = err.message;
  }
  assert(catError !== null, `Kategori terlarang '${category}' berhasil ditolak keras`);
  assert(catError.includes("TIDAK DIIZINKAN"), `Pesan penolakan menyebut 'TIDAK DIIZINKAN': '${catError}'`);
});

// Penolakan nominal negatif atau nol
let zeroAmountError = null;
try {
  FinancialService.recordOperationalExpense({
    expense_date: "2026-11-18",
    category: "MARKETING",
    description: "Iklan Facebook",
    amount: 0,
    created_by: "admin1"
  });
} catch (err) {
  zeroAmountError = err.message;
}
assert(zeroAmountError !== null, "Pengeluaran dengan nominal 0 berhasil ditolak");

// -------------------------------------------------------------------------
// SKENARIO 9: Filter & Sanitasi Riwayat Pembelian & Beban
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 9: Filter & Sanitasi Riwayat Pembelian & Beban");

// getPurchasesList dengan filter receiving_status
const fullyPurchases = InventoryService.getPurchasesList({ receiving_status: "FULLY_RECEIVED" });
assert(fullyPurchases.success === true, "getPurchasesList berhasil dieksekusi");
assert(fullyPurchases.count >= 2, `Ditemukan ${fullyPurchases.count} faktur FULLY_RECEIVED`);
fullyPurchases.purchases.forEach(p => {
  assert(p.receiving_status === "FULLY_RECEIVED", `Faktur ${p.purchase_id} terverifikasi FULLY_RECEIVED`);
  assert(p.display_notes !== undefined, "Terdapat field display_notes yang telah dibersihkan dari JSON");
});

// getExpensesList dengan filter kategori
const packingExpenses = FinancialService.getExpensesList({ category: "PACKING" });
assert(packingExpenses.success === true, "getExpensesList berhasil dieksekusi");
assert(packingExpenses.count >= 1, `Ditemukan ${packingExpenses.count} pengeluaran PACKING`);
assert(packingExpenses.total_amount === 85000, "Total nominal terfilter tepat 85.000");

// -------------------------------------------------------------------------
// SKENARIO 10: Integrasi End-to-End FIFO Penjualan atas Stok Supplier
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 10: Integrasi End-to-End FIFO Penjualan atas Stok Supplier");

// Stok VAR-PUR-01 saat ini: 10 dari invoice1 + 3 dari multiInvoice = 13 unit
// Batch 1: 6 unit @ 160.000
// Batch 2: 4 unit @ 160.000
// Batch 3: 3 unit @ 160.000
const initialStockFIFO = InventoryService.getStock("VAR-PUR-01");
assert(initialStockFIFO.owned_physical_stock === 13, "Total stok fisik VAR-PUR-01 siap jual adalah 13 unit");

// Lakukan penjualan kasir POS untuk 8 unit VAR-PUR-01
const saleResult = SalesService.createSale({
  sales_channel: "STORE",
  sales_type: "READY_STOCK",
  customer_name: "Customer Retail FIFO",
  payment_method: "CASH",
  idempotency_key: "IDEM-SALE-FIFO-01",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-PUR-01",
      quantity: 8,
      actual_price: 320000,
      item_ownership: "OWNED"
    }
  ]
});

assert(saleResult.success === true, "Penjualan 8 unit kasir berhasil diproses");

// Periksa sisa stok fisik
const stockAfterSale = InventoryService.getStock("VAR-PUR-01");
assert(stockAfterSale.owned_physical_stock === 5, "Sisa stok fisik setelah penjualan 8 unit adalah 5 unit (13 - 8)");
assert(stockAfterSale.owned_available_stock === 5, "Sisa stok available setelah penjualan 8 unit adalah 5 unit");

// Periksa alokasi FIFO di DETAIL_PEMBELIAN:
// Batch 1 (6 unit) harus habis (remaining_qty = 0)
// Batch 2 (4 unit) harus terpotong 2 unit (remaining_qty = 2)
// Batch 3 (3 unit) belum tersentuh (remaining_qty = 3)
const allBatchesVar1 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.variant_id === "VAR-PUR-01");
assert(Number(allBatchesVar1[0].remaining_qty) === 0, "Batch 1 habis terpotong penuh (remaining_qty = 0)");
assert(Number(allBatchesVar1[1].remaining_qty) === 2, "Batch 2 terpotong 2 unit (remaining_qty = 2)");
assert(Number(allBatchesVar1[2].remaining_qty) === 3, "Batch 3 utuh belum tersentuh (remaining_qty = 3)");

// Total sisa persediaan FIFO: 0 + 2 + 3 = 5 unit
const totalRemainingBatches = allBatchesVar1.reduce((sum, b) => sum + Number(b.remaining_qty), 0);
assert(totalRemainingBatches === 5, "Total sisa batch FIFO (5) konsisten 100% dengan STOK.owned_physical_stock (5)");

// =========================================================================
// REKAPITULASI HASIL PENGUJIAN
// =========================================================================
console.log("\n==========================================================================");
console.log("REKAPITULASI HASIL PENGUJIAN PHASE 3D SUB-MODUL 3");
console.log("==========================================================================");
console.log(`TOTAL PENGECEKAN : ${passCount + failCount}`);
console.log(`LULUS (PASS)     : ${passCount}`);
console.log(`GAGAL (FAIL)     : ${failCount}`);
console.log("==========================================================================\n");

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
