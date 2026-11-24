/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: FINAL VERIFICATION TEST SUITE
 * Comprehensive Audit on Cost of Inventory, Payment/Receiving Independence,
 * Financial Integration, RBAC Security, and Real ClosingService Period Guards.
 * 
 * Skenario Pengujian:
 * AREA A: Audit Biaya Perolehan Persediaan (Harga Dasar, Insentif, Ongkir Supplier, Dampak FIFO)
 * AREA B: Audit Pembayaran dan Penerimaan Supplier (Independensi Payment Status & Receiving Status)
 * AREA C: Audit Integrasi Keuangan & Arus Kas (Isolasi Persediaan vs Beban, Timing Pengakuan HPP)
 * AREA D: Audit Keamanan RBAC & Perlindungan Periode Keuangan CLOSED (Menggunakan Real ClosingService)
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
loadBackendFile('ClosingService.gs', 'ClosingService'); // LOAD REAL CLOSING SERVICE
loadBackendFile('InventoryService.gs', 'InventoryService');
loadBackendFile('SalesService.gs', 'SalesService');
loadBackendFile('POService.gs', 'POService');
loadBackendFile('VendorService.gs', 'VendorService');
loadBackendFile('FinancialService.gs', 'FinancialService');
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

// Setup Master Data for Final Verification
DatabaseHelper.insertRow("KATEGORI", { category_id: "CAT-CLOG", category_name: "Clogs", description: "Classic Crocs" });

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-FV-01",
  product_name: "Crocs Classic Clog - Final Verif",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-FV-01",
  product_id: "PROD-FV-01",
  color: "White",
  size: "M9W11",
  sku: "CC-FV-WHT-M9",
  catalog_price: 350000,
  reference_hpp: 210000,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-FV-02",
  product_id: "PROD-FV-01",
  color: "Navy",
  size: "M8W10",
  sku: "CC-FV-NVY-M8",
  catalog_price: 350000,
  reference_hpp: 210000,
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
console.log("CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: FINAL VERIFICATION TEST SUITE");
console.log("Audit Biaya Perolehan, Independensi Status, Keuangan & Real Closing Guard");
console.log("==========================================================================\n");

// =========================================================================
// AREA A: AUDIT BIAYA PEROLEHAN PERSEDIAAN
// =========================================================================
console.log("▶ AREA A: Audit Biaya Perolehan Persediaan (Harga Dasar, Insentif, Ongkir)");

// Buat faktur 10 unit @ Rp200.000 + Insentif Rp10.000 + Ongkir Supplier Rp50.000
const invoiceAuditA = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-DZAKI",
  supplier_name: "Dzaki (Jaki) - Stock Purchase",
  purchase_date: "2026-11-18",
  shipping_cost: 50000,
  notes: "Faktur audit biaya perolehan: 10 unit Dzaki",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-FV-01",
      quantity: 10,
      base_unit_cost: 200000,
      vendor_incentive: 10000
    }
  ]
});

assert(invoiceAuditA.success === true, "Faktur pembelian Area A berhasil dibuat");
assert(invoiceAuditA.subtotal === 2000000, "Subtotal kotor = 10 x 200.000 = Rp2.000.000");
assert(invoiceAuditA.shipping_cost === 50000, "Ongkir supplier dicatat terpisah Rp50.000");
assert(invoiceAuditA.total_purchase === 2050000, "Total faktur = Subtotal + Ongkir = Rp2.050.000");

// Terima fisik 10 unit
const rcvAuditA = InventoryService.receivePurchaseShipment({
  purchase_id: invoiceAuditA.purchase_id,
  idempotency_key: "IDEM-AUDIT-A-01",
  notes: "Penerimaan fisik 10 unit lengkap",
  created_by: "admin1",
  received_items: [
    {
      variant_id: "VAR-FV-01",
      quantity: 10,
      base_unit_cost: 200000,
      vendor_incentive: 10000
    }
  ]
});

assert(rcvAuditA.success === true, "Penerimaan fisik 10 unit berhasil");

// Verifikasi baris batch persediaan di DETAIL_PEMBELIAN
const batchA = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === invoiceAuditA.purchase_id)[0];
assert(batchA !== undefined, "Baris batch persediaan ditemukan di DETAIL_PEMBELIAN");
assert(Number(batchA.base_unit_cost) === 200000, "Komponen 1: base_unit_cost tercatat terpisah = Rp200.000");
assert(Number(batchA.vendor_incentive) === 10000, "Komponen 2: vendor_incentive tercatat terpisah = Rp10.000");
assert(Number(batchA.unit_cost) === 215000, "Total biaya perolehan unit_cost = Rp215.000 (base 200k + incentive 10k + ongkir 5k)");
assert(Number(batchA.quantity) === 10, "Kuantitas batch fisik = 10 unit");
assert(Number(batchA.subtotal) === 2150000, "Subtotal persediaan batch = 10 x 215.000 = Rp2.150.000");

// Verifikasi kapitalisasi ongkir supplier sesuai kebijakan Owner Alternatif 2
assert(Number(batchA.shipping_cost_allocation) === 50000, "Alokasi ongkir supplier tercatat Rp50.000 untuk 10 unit (Rp5.000/unit)");

// Uji pemotongan FIFO saat penjualan: HPP modal harus diakui tepat Rp215.000/unit saat terjual
const saleAuditA = SalesService.createSale({
  sales_channel: "STORE",
  sales_type: "READY_STOCK",
  customer_name: "Customer Audit HPP",
  payment_method: "CASH",
  idempotency_key: "IDEM-SALE-AUDIT-A-01",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-FV-01",
      quantity: 4,
      actual_price: 350000,
      item_ownership: "OWNED"
    }
  ]
});

assert(saleAuditA.success === true, "Penjualan 4 unit berhasil");
assert(saleAuditA.financial_breakdown.total_hpp === 860000, "HPP diakui saat barang terjual: 4 x 215.000 = Rp860.000");

// Verifikasi sisa stok di batch: 10 - 4 = 6 unit @ Rp210.000
const batchAfterSaleA = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batchA.purchase_detail_id);
assert(Number(batchAfterSaleA.remaining_qty) === 6, "Sisa persediaan batch adalah 6 unit");

// =========================================================================
// AREA B: AUDIT PEMBAYARAN DAN PENERIMAAN SUPPLIER (INDEPENDENSI STATUS)
// =========================================================================
console.log("\n▶ AREA B: Audit Pembayaran dan Penerimaan Supplier (Independensi Status)");

// Buat faktur 10 unit VAR-FV-02
const invoiceAuditB = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-GLOBAL",
  supplier_name: "PT Sepatu Dunia",
  purchase_date: "2026-11-18",
  shipping_cost: 40000,
  notes: "Faktur 10 unit untuk audit independensi status",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-FV-02",
      quantity: 10,
      base_unit_cost: 180000,
      vendor_incentive: 0
    }
  ]
});

// Skenario 1: Faktur dibayar PENUH (PAID), tetapi barang baru tiba 6 unit (PARTIAL_RECEIVED)
InventoryService.updatePurchasePaymentStatus(invoiceAuditB.purchase_id, "PAID", "Pelunasan via Transfer Bank", "hafiz", true);
const rcvAuditB1 = InventoryService.receivePurchaseShipment({
  purchase_id: invoiceAuditB.purchase_id,
  idempotency_key: "IDEM-AUDIT-B-01",
  notes: "Penerimaan tahap 1: 6 unit tiba",
  created_by: "admin1",
  received_items: [
    {
      variant_id: "VAR-FV-02",
      quantity: 6,
      base_unit_cost: 180000
    }
  ]
});

const invAfterB1 = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoiceAuditB.purchase_id);
assert(invAfterB1.payment_status === "PAID", "Payment status = PAID (LUNAS)");
assert(invAfterB1.receiving_status === "PARTIAL_RECEIVED", "Receiving status = PARTIAL_RECEIVED (Barang diterima sebagian)");
const stockB1 = InventoryService.getStock("VAR-FV-02");
assert(stockB1.owned_physical_stock === 6, "Stok fisik HANYA bertambah 6 unit (sesuai barang fisik diterima, bukan 10)");
assert(stockB1.owned_available_stock === 6, "Stok available bertambah 6 unit");

// Skenario 2: Faktur 10 unit belum dibayar (UNPAID), tetapi barang diterima sebagian (PARTIAL_RECEIVED)
const invoiceAuditB2 = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-GLOBAL",
  supplier_name: "PT Sepatu Dunia - Termin",
  purchase_date: "2026-11-18",
  shipping_cost: 20000,
  notes: "Faktur termin 30 hari",
  created_by: "admin1",
  items: [
    { variant_id: "VAR-FV-02", quantity: 5, base_unit_cost: 180000 }
  ]
});

InventoryService.receivePurchaseShipment({
  purchase_id: invoiceAuditB2.purchase_id,
  idempotency_key: "IDEM-AUDIT-B-02",
  notes: "Terima 3 unit secara konsinyasi/termin",
  created_by: "admin1",
  received_items: [
    { variant_id: "VAR-FV-02", quantity: 3, base_unit_cost: 180000 }
  ]
});

const invAfterB2 = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoiceAuditB2.purchase_id);
assert(invAfterB2.payment_status === "UNPAID", "Payment status tetap UNPAID (belum dibayar)");
assert(invAfterB2.receiving_status === "PARTIAL_RECEIVED", "Receiving status adalah PARTIAL_RECEIVED");
const stockB2 = InventoryService.getStock("VAR-FV-02");
assert(stockB2.owned_physical_stock === 9, "Stok fisik terakumulasi menjadi 9 (6 dari B1 + 3 dari B2)");

// Skenario 3: Faktur dibayar sebagian (PARTIAL)
InventoryService.updatePurchasePaymentStatus(invoiceAuditB2.purchase_id, "PARTIAL", "DP 50% dibayar", "hafiz");
const invAfterB2Partial = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoiceAuditB2.purchase_id);
assert(invAfterB2Partial.payment_status === "PARTIAL", "Payment status berhasil diubah menjadi PARTIAL");
assert(invAfterB2Partial.receiving_status === "PARTIAL_RECEIVED", "Receiving status tidak berubah saat payment status diupdate");

// Skenario 4: Sisa penerimaan tidak boleh melebihi kuantitas faktur
// Pada faktur B1 (10 unit, sudah terima 6 unit, sisa 4 unit): Coba terima 5 unit
let overReceiveBError = null;
try {
  InventoryService.receivePurchaseShipment({
    purchase_id: invoiceAuditB.purchase_id,
    idempotency_key: "IDEM-AUDIT-B-OVER",
    notes: "Mencoba terima 5 unit saat sisa hanya 4",
    created_by: "admin1",
    received_items: [
      { variant_id: "VAR-FV-02", quantity: 5, base_unit_cost: 180000 }
    ]
  });
} catch (err) {
  overReceiveBError = err.message;
}
assert(overReceiveBError !== null, "Penerimaan melebihi sisa kuantitas faktur berhasil ditolak keras");
assert(overReceiveBError.includes("melebihi jumlah yang dipesan"), `Pesan error: '${overReceiveBError}'`);

// Skenario 5: Retry penerimaan tidak boleh menggandakan stok atau batch FIFO
// Terima 4 unit sah untuk melengkapi faktur B1
const rcvAuditBComplete = InventoryService.receivePurchaseShipment({
  purchase_id: invoiceAuditB.purchase_id,
  idempotency_key: "IDEM-AUDIT-B-COMPLETE",
  notes: "Terima sisa 4 unit lengkap",
  created_by: "admin1",
  received_items: [
    { variant_id: "VAR-FV-02", quantity: 4, base_unit_cost: 180000 }
  ]
});
assert(rcvAuditBComplete.new_receiving_status === "FULLY_RECEIVED", "Faktur B1 berstatus FULLY_RECEIVED");
const stockBeforeRetry = InventoryService.getStock("VAR-FV-02").owned_physical_stock;

// Kirim ulang request penerimaan dengan key sama persis
const retryResult = InventoryService.receivePurchaseShipment({
  purchase_id: invoiceAuditB.purchase_id,
  idempotency_key: "IDEM-AUDIT-B-COMPLETE",
  notes: "Kirim ulang retry",
  created_by: "admin1",
  received_items: [
    { variant_id: "VAR-FV-02", quantity: 4, base_unit_cost: 180000 }
  ]
});
assert(retryResult.idempotent === true, "Retry penerimaan mengembalikan idempotent: true");
assert(retryResult.batches_created === 0, "Zero batch dibuat saat retry");
const stockAfterRetry = InventoryService.getStock("VAR-FV-02").owned_physical_stock;
assert(stockAfterRetry === stockBeforeRetry, "Stok fisik TIDAK bertambah ganda pada retry");

// =========================================================================
// AREA C: AUDIT INTEGRASI KEUANGAN & ARUS KAS
// =========================================================================
console.log("\n▶ AREA C: Audit Integrasi Keuangan & Arus Kas");

// Verifikasi pembukuan: Pembelian stok TIDAK pernah masuk ke PENGELUARAN
const expenseRows = DatabaseHelper.getAllRows("PENGELUARAN");
const illegalExpenses = expenseRows.filter(e => 
  String(e.category).toUpperCase().includes("PURCHASE") ||
  String(e.category).toUpperCase().includes("STOK") ||
  String(e.expense_id).startsWith("PUR-")
);
assert(illegalExpenses.length === 0, "Tabel PENGELUARAN 100% bersih dari transaksi pembelian persediaan");

// Periksa Laba Rugi November 2026: Pembelian stok tidak memotong laba operasional
const incomeNov = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
// Penjualan tadi (saleAuditA): 4 unit @ Rp350.000 = Omzet Rp1.400.000, HPP = Rp840.000, Laba Kotor = Rp560.000
assert(incomeNov.revenue_breakdown.total_omzet === 1400000, "Omzet November tercatat Rp1.400.000");
assert(incomeNov.hpp_breakdown.total_hpp === 860000, "HPP FIFO tercatat Rp860.000 (4 x 215k termasuk ongkir)");
assert(incomeNov.gross_profit === 540000, "Laba Kotor = Omzet - HPP = Rp540.000");
assert(incomeNov.expenses_breakdown.operational_expenses === 0, "Beban operasional tetap Rp0 (pembelian stok tidak masuk beban)");
assert(incomeNov.net_profit === 540000, "Laba Bersih operasional utuh Rp540.000");

// Periksa Rekonsiliasi Kas: Pembelian stok dipisahkan ke pos cash_outflow.stock_purchases_paid
const cashReconNov = FinancialService.getMonthlyCashAndVendorReconciliation(11, 2026);
assert(cashReconNov.cash_outflow.stock_purchases_paid > 0, "Belanja stok supplier dicatat terpisah pada stock_purchases_paid");
assert(cashReconNov.cash_outflow.operational_expenses_paid === 0, "Beban operasional kas tetap Rp0");

// =========================================================================
// AREA D: AUDIT KEAMANAN RBAC & PERLINDUNGAN PERIODE KEKUANGAN CLOSED
// =========================================================================
console.log("\n▶ AREA D: Audit Keamanan RBAC & Real ClosingService Period Guards");

// 1. RBAC Kasir / Admin: getSalesList harus menyembunyikan HPP dan Gross Profit dari non-Owner
const adminSalesList = SalesService.getSalesList({}, adminToken);
assert(adminSalesList.success === true, "Admin dapat mengambil daftar penjualan");
adminSalesList.sales.forEach(s => {
  assert(s.total_hpp === undefined || s.total_hpp === null, `HPP disanitasi dari Admin pada sales ${s.sales_id}`);
  assert(s.gross_profit === undefined || s.gross_profit === null, `Gross Profit disanitasi dari Admin pada sales ${s.sales_id}`);
});

// Owner memanggil getSalesList: total_hpp dan gross_profit harus TERLIHAT
const ownerSalesList = SalesService.getSalesList({}, ownerToken);
assert(ownerSalesList.success === true, "Owner dapat mengambil daftar penjualan");
const ownerSample = ownerSalesList.sales.find(s => s.sales_id === saleAuditA.sales_id);
assert(ownerSample !== undefined, "Penjualan audit ditemukan di daftar Owner");
assert(ownerSample.total_hpp === 860000, "Owner dapat melihat data modal total_hpp (Rp860.000)");
assert(ownerSample.gross_profit === 540000, "Owner dapat melihat data gross_profit (Rp540.000)");

// 2. REAL ClosingService Period Guard Validation
// DatabaseHelper seedDefaultPeriods() mencatat:
// PER-2026-10: CLOSED
// PER-2026-11: OPEN
const closedPeriod = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-10");
assert(closedPeriod.period_status === "CLOSED", "PER-2026-10 terverifikasi berstatus CLOSED");

// Coba buat faktur pembelian dengan tanggal Oktober 2026 (Periode CLOSED)
let closedPurchaseError = null;
try {
  InventoryService.createPurchaseInvoice({
    vendor_id: "VND-DZAKI",
    supplier_name: "Dzaki Backdated",
    purchase_date: "2026-10-15", // OKTOBER 2026 (CLOSED)
    notes: "Percobaan pembuatan faktur pada periode CLOSED",
    items: [{ variant_id: "VAR-FV-01", quantity: 2, base_unit_cost: 200000 }]
  });
} catch (err) {
  closedPurchaseError = err.message;
}
assert(closedPurchaseError !== null, "Pembuatan faktur pembelian pada periode CLOSED berhasil ditolak ClosingService asli");
assert(closedPurchaseError.includes("DITUTUP") || closedPurchaseError.includes("CLOSED"), `Pesan error: '${closedPurchaseError}'`);

// Coba catat pengeluaran operasional dengan tanggal Oktober 2026 (Periode CLOSED)
let closedExpenseError = null;
try {
  FinancialService.recordOperationalExpense({
    expense_date: "2026-10-20", // OKTOBER 2026 (CLOSED)
    category: "LISTRIK",
    description: "Bayar listrik Oktober susulan",
    amount: 150000,
    created_by: "admin1"
  });
} catch (err) {
  closedExpenseError = err.message;
}
assert(closedExpenseError !== null, "Pencatatan pengeluaran pada periode CLOSED berhasil ditolak ClosingService asli");
assert(closedExpenseError.includes("DITUTUP") || closedExpenseError.includes("CLOSED"), `Pesan error: '${closedExpenseError}'`);

// Pengeluaran pada periode OPEN (November 2026) harus BERHASIL
const openExpense = FinancialService.recordOperationalExpense({
  expense_date: "2026-11-18", // NOVEMBER 2026 (OPEN)
  category: "TRANSPORT",
  description: "Bensin kurir antar barang",
  amount: 45000,
  created_by: "admin1"
});
assert(openExpense.success === true, "Pengeluaran pada periode OPEN (November 2026) berhasil dicatat");

// =========================================================================
// REKAPITULASI HASIL PENGUJIAN FINAL VERIFICATION
// =========================================================================
console.log("\n==========================================================================");
console.log("REKAPITULASI FINAL VERIFICATION PHASE 3D SUB-MODUL 3");
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
