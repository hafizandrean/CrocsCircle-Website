/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: SUPPLIER PAYMENT & CAPITALIZATION AUDIT
 * Pemeriksaan Tambahan terhadap Mekanisme Pembayaran Faktur Supplier,
 * Pemisahan Biaya Ongkir, dan Integrasi Keuangan.
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
loadBackendFile('ClosingService.gs', 'ClosingService'); // REAL ClosingService
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

// Master Data Setup
DatabaseHelper.insertRow("KATEGORI", { category_id: "CAT-CLOG", category_name: "Clogs", description: "Classic Crocs" });

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-REV-01",
  product_name: "Crocs Classic Clog - Review Special",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-REV-01",
  product_id: "PROD-REV-01",
  color: "Graphite",
  size: "M9W11",
  sku: "CC-REV-GRP-M9",
  catalog_price: 360000,
  reference_hpp: 210000,
  is_active: true
});

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
console.log("CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: AUDIT PEMBAYARAN & ONGKIR SUPPLIER");
console.log("==========================================================================\n");

// -------------------------------------------------------------------------
// 1. AUDIT PEMBUATAN FAKTUR & STATUS AWAL UNPAID
// -------------------------------------------------------------------------
console.log("▶ Bagian 1: Audit Pembuatan Faktur & Status Awal UNPAID");

const inv = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-DZAKI",
  supplier_name: "Dzaki Supplier Partner",
  purchase_date: "2026-11-18",
  shipping_cost: 50000,
  notes: "Faktur audit pembayaran supplier 10 unit",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-REV-01",
      quantity: 10,
      base_unit_cost: 200000,
      vendor_incentive: 10000
    }
  ]
});

assert(inv.success === true, "Faktur pembelian berhasil dibuat");
assert(inv.payment_status === "UNPAID", "Kriteria 1: Status pembayaran faktur baru adalah UNPAID");
assert(inv.receiving_status === "UNRECEIVED", "Status penerimaan fisik faktur baru adalah UNRECEIVED");
assert(inv.total_purchase === 2050000, "Total tagihan = Subtotal (2.000.000) + Ongkir (50.000) = Rp2.050.000");

// Verifikasi fisik gudang: Stok fisik tetap 0
const stockInit = InventoryService.getStock("VAR-REV-01");
assert(stockInit.owned_physical_stock === 0, "Stok fisik tetap 0 (faktur baru belum menambah stok)");

// -------------------------------------------------------------------------
// 2. AUDIT PEMBAYARAN BERTAHAP & PELUNASAN FAKTUR
// -------------------------------------------------------------------------
console.log("\n▶ Bagian 2: Audit Pembayaran Bertahap & Pelunasan Faktur");

// Update status ke PARTIAL (misal DP Rp500.000 telah ditransfer)
const updateDP = InventoryService.updatePurchasePaymentStatus(
  inv.purchase_id,
  "PARTIAL",
  "Pembayaran DP Rp500.000 via Transfer BCA",
  "hafiz"
);
assert(updateDP.success === true, "Kriteria 2: Pembayaran DP berhasil dicatat (status PARTIAL)");
assert(updateDP.payment_status === "PARTIAL", "Payment status menjadi PARTIAL");
assert(updateDP.receiving_status === "UNRECEIVED", "Receiving status tetap UNRECEIVED (pembayaran tidak mengubah status barang)");

// Update status ke PAID (Pelunasan sisa Rp1.550.000)
const updateFull = InventoryService.updatePurchasePaymentStatus(
  inv.purchase_id,
  "PAID",
  "Pelunasan sisa tagihan Rp1.550.000",
  "hafiz",
  true
);
assert(updateFull.success === true, "Kriteria 4: Pelunasan faktur berhasil dicatat (status PAID)");
assert(updateFull.payment_status === "PAID", "Payment status menjadi PAID");
assert(updateFull.receiving_status === "UNRECEIVED", "Receiving status tetap UNRECEIVED saat faktur lunas");

// Validasi enum status pembayaran yang ketat
let invalidStatusError = null;
try {
  InventoryService.updatePurchasePaymentStatus(inv.purchase_id, "HUTANG_LANCAR", "Catatan", "admin1");
} catch (err) {
  invalidStatusError = err.message;
}
assert(invalidStatusError !== null, "Status pembayaran non-standar berhasil ditolak sistem");
assert(invalidStatusError.includes("tidak valid"), `Pesan validasi enum: '${invalidStatusError}'`);

// -------------------------------------------------------------------------
// 3. AUDIT KETERBATASAN SISTEM SAAT INI (DATA MODEL GAP AUDIT)
// -------------------------------------------------------------------------
console.log("\n▶ Bagian 3: Audit Keterbatasan Data Model Pembayaran Saat Ini");

// Cek apakah tabel riwayat pembayaran supplier telah terdaftar di database
let hasSupplierPaymentTable = false;
try {
  const rows = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN");
  hasSupplierPaymentTable = Array.isArray(rows);
} catch (e) {
  hasSupplierPaymentTable = false;
}
assert(hasSupplierPaymentTable === true, "Tabel PEMBAYARAN_PEMBELIAN telah terdaftar resmi di CROCS_SCHEMA_V120");

// Catat temuan audit teknis:
// Di skema CROCS_SCHEMA_V120, tabel PEMBELIAN_STOK hanya memiliki kolom payment_status.
// Belum ada tabel transaksi kas keluar per pembayaran (seperti PEMBAYARAN_PO untuk Pre-Order).
const currentInvoiceRecord = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", inv.purchase_id);
assert(currentInvoiceRecord.payment_status === "PAID", "Header faktur hanya mencatat status akhir (PAID)");
assert(currentInvoiceRecord.paid_amount === undefined, "Kolom paid_amount belum ada di tabel PEMBELIAN_STOK skema v1.2.0");

// -------------------------------------------------------------------------
// 4. AUDIT BIAYA ONGKIR SUPPLIER & ISOLASI HPP UNIT
// -------------------------------------------------------------------------
console.log("\n▶ Bagian 4: Audit Ongkos Kirim Supplier & Isolasi HPP Unit");

// Terima fisik 10 unit (Opsi Beban Periode / capitalize_shipping: false)
InventoryService.receivePurchaseShipment({
  purchase_id: inv.purchase_id,
  idempotency_key: "IDEM-PAY-REV-01",
  notes: "Penerimaan fisik 10 unit",
  created_by: "admin1",
  capitalize_shipping: false,
  received_items: [
    {
      variant_id: "VAR-REV-01",
      quantity: 10,
      base_unit_cost: 200000,
      vendor_incentive: 10000
    }
  ]
});

// Periksa batch di DETAIL_PEMBELIAN
const batchRev = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === inv.purchase_id)[0];
assert(Number(batchRev.unit_cost) === 210000, "Biaya perolehan unit_cost = Rp210.000 (Harga Dasar 200k + Insentif 10k)");
assert(Number(batchRev.unit_cost) !== 215000, "Ongkir supplier (Rp50.000) TIDAK dikapitalisasi otomatis ke unit_cost (bukan Rp215.000)");

// Periksa header PEMBELIAN_STOK
assert(Number(currentInvoiceRecord.shipping_cost) === 50000, "Ongkir supplier tercatat terpisah pada kolom shipping_cost (Rp50.000)");

// Penjualan via POS: HPP modal yang terpotong adalah Rp210.000 per unit
const saleRev = SalesService.createSale({
  sales_channel: "STORE",
  sales_type: "READY_STOCK",
  customer_name: "Customer Review Ongkir",
  payment_method: "CASH",
  idempotency_key: "IDEM-SALE-REV-01",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-REV-01",
      quantity: 2,
      actual_price: 360000,
      item_ownership: "OWNED"
    }
  ]
});

assert(saleRev.success === true, "Penjualan 2 unit berhasil");
assert(saleRev.financial_breakdown.total_hpp === 420000, "HPP diakui saat penjualan: 2 x 210.000 = Rp420.000");

// -------------------------------------------------------------------------
// 5. AUDIT INTEGRASI KEUANGAN: ISOLASI DARI BEBAN OPERASIONAL
// -------------------------------------------------------------------------
console.log("\n▶ Bagian 5: Audit Integrasi Keuangan & Beban Operasional");

const expensesTable = DatabaseHelper.getAllRows("PENGELUARAN");
const purchaseExpenseMatches = expensesTable.filter(e => 
  String(e.category).toUpperCase().includes("PURCHASE") || 
  String(e.category).toUpperCase().includes("STOK") ||
  String(e.expense_id).startsWith("PUR-")
);
assert(purchaseExpenseMatches.length === 0, "Tabel PENGELUARAN 100% bersih dari transaksi pembelian stok");

const incomeRev = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(incomeRev.expenses_breakdown.operational_expenses === 0, "Beban operasional di laporan laba rugi bulanan adalah Rp0");
assert(incomeRev.revenue_breakdown.total_omzet === 720000, "Omzet dari 2 unit x 360.000 = Rp720.000");
assert(incomeRev.hpp_breakdown.total_hpp === 420000, "Total HPP = Rp420.000");
assert(incomeRev.gross_profit === 300000, "Laba Kotor = Omzet (720k) - HPP (420k) = Rp300.000");
assert(incomeRev.net_profit === 300000, "Laba Bersih operasional utuh Rp300.000");

// -------------------------------------------------------------------------
// 6. AUDIT PROTEKSI PERIODE CLOSED DENGAN CLOSINGSERVICE ASLI
// -------------------------------------------------------------------------
console.log("\n▶ Bagian 6: Audit Proteksi Periode CLOSED (Real ClosingService)");

// Periode PER-2026-10 berstatus CLOSED
const periodOkt = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-10");
assert(periodOkt.period_status === "CLOSED", "Periode PER-2026-10 terverifikasi CLOSED");

// Coba buat faktur pembelian pada periode CLOSED
let errClosedPur = null;
try {
  InventoryService.createPurchaseInvoice({
    vendor_id: "VND-DZAKI",
    purchase_date: "2026-10-10", // CLOSED
    notes: "Faktur di periode tertutup",
    items: [{ variant_id: "VAR-REV-01", quantity: 1, base_unit_cost: 200000 }]
  });
} catch (e) {
  errClosedPur = e.message;
}
assert(errClosedPur !== null, "Pembuatan faktur pembelian di periode CLOSED ditolak oleh ClosingService asli");
assert(errClosedPur.includes("DITUTUP") || errClosedPur.includes("CLOSED"), `Pesan penolakan: '${errClosedPur}'`);

// Coba catat pengeluaran operasional di periode CLOSED
let errClosedExp = null;
try {
  FinancialService.recordOperationalExpense({
    expense_date: "2026-10-15", // CLOSED
    category: "SEWA",
    amount: 1000000,
    created_by: "admin1"
  });
} catch (e) {
  errClosedExp = e.message;
}
assert(errClosedExp !== null, "Pencatatan beban operasional di periode CLOSED ditolak oleh ClosingService asli");
assert(errClosedExp.includes("DITUTUP") || errClosedExp.includes("CLOSED"), `Pesan penolakan: '${errClosedExp}'`);

// =========================================================================
// REKAPITULASI HASIL AUDIT
// =========================================================================
console.log("\n==========================================================================");
console.log("REKAPITULASI HASIL AUDIT PEMBAYARAN SUPPLIER & ONGKIR");
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
