/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 2 TEST SUITE
 * Manajemen Pre-Order (PO) - 10 Core Financial & Operational Scenarios
 * 
 * Skenario Pengujian:
 * 1. Pembuatan PO dengan Uang Muka (DP) — Status PARTIAL, DP Bukan Omzet
 * 2. Pembuatan PO Tanpa DP — Status UNPAID
 * 3. Pelunasan PO (Settlement) — Status Berubah Menjadi PAID, Settlement Date Tercatat
 * 4. Pengakuan Omzet Pre-Order — Omzet 100% Hanya Diakui Saat Lunas Berdasarkan settlement_date
 * 5. Siklus Status Pengadaan Supplier (NOT_ORDERED -> ORDERED -> IN_TRANSIT -> RECEIVED)
 * 6. Alokasi & Reservasi Stok Fisik saat Barang Tiba (STOK.reserved_stock Bertambah)
 * 7. Serah Terima Barang (Fulfillment) — Pengurangan reserved & physical stock, ZERO Omzet Ganda
 * 8. Pembatalan PO Sebelum Barang Tiba — Refund Tercatat, Stok Fisik Tidak Berubah
 * 9. Pembatalan PO Setelah Barang Tiba — Pelepasan Reservasi ke Ready Stock (available_stock Bertambah)
 * 10. Validasi Refund Akumulatif & Idempotency Key (Mencegah Refund Melebihi Uang Masuk)
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

// Helper for finding a single row
function findRow(tableName, filterFn) {
  const rows = DatabaseHelper.getAllRows(tableName, filterFn);
  return rows.length > 0 ? rows[0] : null;
}

// Setup Owner & Admin Users
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const ownerLogin = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = ownerLogin.token;

AuthService.setupOwnerAccount("admin1", "Admin Operasional", "AdminOperasional2026!");
// Update role of admin1 to ADMIN
DatabaseHelper.updateRowByPk("USERS", "username", "admin1", { role: "ADMIN" });
const adminLogin = AuthService.login("admin1", "AdminOperasional2026!");
const adminToken = adminLogin.token;

// Setup Master Data for Pre-Order Testing
DatabaseHelper.insertRow("KATEGORI", { category_id: "CAT-CLOG", category_name: "Clogs", description: "Classic Crocs" });

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-PO-ECHO",
  product_name: "Crocs Echo Clog - Stucco",
  category_id: "CAT-CLOG",
  model: "Echo Clog",
  sales_type: "PRE_ORDER",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-PO-ECHO-M9",
  product_id: "PROD-PO-ECHO",
  sku: "CRC-ECH-STC-M9",
  color: "Stucco",
  size: "M9",
  catalog_price: 1299000,
  is_active: true
});

DatabaseHelper.insertRow("STOK", {
  variant_id: "VAR-PO-ECHO-M9",
  owned_physical_stock: 0,
  owned_reserved_stock: 0,
  consignment_physical_stock: 0,
  consignment_reserved_stock: 0,
  min_stock_alert: 2,
  last_updated: "2026-11-01 10:00:00"
});

// Setup second variant for cancellation tests
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-PO-MEGA",
  product_name: "Crocs Mega Crush Clog - Bone",
  category_id: "CAT-CLOG",
  model: "Mega Crush",
  sales_type: "PRE_ORDER",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-PO-MEGA-W7",
  product_id: "PROD-PO-MEGA",
  sku: "CRC-MGA-BN-W7",
  color: "Bone",
  size: "W7",
  catalog_price: 1599000,
  is_active: true
});

DatabaseHelper.insertRow("STOK", {
  variant_id: "VAR-PO-MEGA-W7",
  owned_physical_stock: 0,
  owned_reserved_stock: 0,
  consignment_physical_stock: 0,
  consignment_reserved_stock: 0,
  min_stock_alert: 2,
  last_updated: "2026-11-01 10:00:00"
});

// ---------------------------------------------------------------------------
// TEST RUNNER UTILITIES
// ---------------------------------------------------------------------------
let totalTests = 0;
let passedTests = 0;
const results = [];

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    results.push({ status: "PASS", message });
    console.log(`  ✓ PASS: ${message}`);
  } else {
    results.push({ status: "FAIL", message });
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log("========================================================================");
console.log("🧪 RUNNING PHASE 3D SUB-MODUL 2 TEST SUITE: PRE-ORDER (PO) ENGINE");
console.log("========================================================================\n");

// ---------------------------------------------------------------------------
// SKENARIO 1: Pembuatan PO dengan DP Awal (Status PARTIAL, DP Bukan Omzet)
// ---------------------------------------------------------------------------
console.log("▶ Skenario 1: Pembuatan PO dengan DP Awal (Status PARTIAL, DP Bukan Omzet)");
const po1Result = POService.createPreOrder({
  customer_name: "Budi Pratama",
  customer_contact: "081234567890",
  variant_id: "VAR-PO-ECHO-M9",
  quantity: 1,
  agreed_price: 1250000,
  supplier_info: "Supplier Korea Direct",
  target_eta: "2026-11-28",
  initial_dp: 500000,
  initial_dp_method: "TRANSFER_BCA",
  notes: "Titip box mulus",
  created_by: "admin1",
  idempotency_key: "po-create-001"
});

assert(po1Result && po1Result.success === true, "PO berhasil dibuat");
assert(po1Result.po_id && po1Result.po_id.startsWith("PO-"), `PO ID terformat dengan benar: ${po1Result.po_id}`);

const po1Header = findRow("PRE_ORDER", r => r.po_id === po1Result.po_id);
assert(po1Header.payment_status === "PARTIAL", `Status pembayaran awal adalah PARTIAL`);
assert(po1Header.procurement_status === "NOT_ORDERED", `Status pengadaan awal adalah NOT_ORDERED`);
assert(po1Header.fulfillment_status === "NOT_DELIVERED", `Status penyerahan awal adalah NOT_DELIVERED`);
assert(Number(po1Header.total_order) === 1250000, `Total tagihan PO adalah Rp1.250.000`);
assert(po1Header.settlement_date === "" || !po1Header.settlement_date, "settlement_date masih kosong saat status PARTIAL");

// Cek bahwa DP tercatat di PEMBAYARAN_PO
const po1Payments = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => p.po_id === po1Result.po_id);
assert(po1Payments.length === 1, "Terdapat 1 baris pembayaran DP di PEMBAYARAN_PO");
assert(Number(po1Payments[0].amount) === 500000, "Nominal DP Rp500.000 tercatat di PEMBAYARAN_PO");

// Bukti: DP BUKAN OMZET
const recognizedPO1 = POService.getRecognizedMonthlyPO("2026-11");
const po1InRecognized = (recognizedPO1.records || []).find(p => p.po_id === po1Result.po_id);
assert(!po1InRecognized, "PO berstatus PARTIAL (hanya bayar DP) TIDAK diakui dalam omzet bulanan (DP adalah Liabilitas)");

// ---------------------------------------------------------------------------
// SKENARIO 2: Pembuatan PO Tanpa DP (Status UNPAID)
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 2: Pembuatan PO Tanpa DP (Status UNPAID)");
const po2Result = POService.createPreOrder({
  customer_name: "Siti Rahma",
  customer_contact: "081298765432",
  variant_id: "VAR-PO-ECHO-M9",
  quantity: 2,
  agreed_price: 1200000,
  supplier_info: "Supplier Jepang Direct",
  target_eta: "2026-12-05",
  initial_dp: 0,
  notes: "Size M9 2 pasang",
  created_by: "admin1",
  idempotency_key: "po-create-002"
});

assert(po2Result.success === true, "PO tanpa DP berhasil dibuat");
const po2Header = findRow("PRE_ORDER", r => r.po_id === po2Result.po_id);
assert(po2Header.payment_status === "UNPAID", "Status pembayaran awal adalah UNPAID");
assert(Number(po2Header.total_order) === 2400000, "Total tagihan PO adalah 2 x Rp1.200.000 = Rp2.400.000");

const po2Payments = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => p.po_id === po2Result.po_id);
assert(po2Payments.length === 0, "Tidak ada entri di PEMBAYARAN_PO untuk PO tanpa DP");

// ---------------------------------------------------------------------------
// SKENARIO 3: Pelunasan PO (Settlement) & Pencatatan settlement_date
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 3: Pelunasan PO (Settlement) & Pencatatan settlement_date");
// PO 1 memiliki sisa tagihan Rp1.250.000 - Rp500.000 = Rp750.000
const paySettlementResult = POService.recordPayment(po1Result.po_id, {
  payment_amount: 750000,
  payment_method: "TRANSFER_BCA",
  notes: "Pelunasan sisa tagihan PO 1",
  created_by: "admin1",
  idempotency_key: "po-pay-settle-001"
});

assert(paySettlementResult.success === true, "Pelunasan PO berhasil diproses");
assert(paySettlementResult.new_status === "PAID", "Status PO otomatis berubah menjadi PAID setelah sisa lunas");

const po1Updated = findRow("PRE_ORDER", r => r.po_id === po1Result.po_id);
assert(po1Updated.payment_status === "PAID", "Kolom payment_status di tabel PRE_ORDER ter-update menjadi PAID");
assert(Boolean(po1Updated.settlement_date), `settlement_date berhasil dicatat: ${po1Updated.settlement_date}`);

const allPaymentsPo1 = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => p.po_id === po1Result.po_id);
assert(allPaymentsPo1.length === 2, "Tercatat 2 baris pembayaran di PEMBAYARAN_PO (DP + Pelunasan)");
const sumPayments = allPaymentsPo1.reduce((sum, p) => sum + Number(p.amount), 0);
assert(sumPayments === 1250000, `Total pembayaran masuk adalah Rp${sumPayments.toLocaleString('id-ID')} (Lunas penuh)`);

// ---------------------------------------------------------------------------
// SKENARIO 4: Pengakuan Omzet Pre-Order (100% Omzet Diakui pada Bulan settlement_date)
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 4: Pengakuan Omzet Pre-Order (100% Omzet Diakui pada Bulan settlement_date)");
const recognizedAfterSettlement = POService.getRecognizedMonthlyPO("2026-11");
const po1Recognized = (recognizedAfterSettlement.records || []).find(p => p.po_id === po1Result.po_id);

assert(Boolean(po1Recognized), "PO 1 sekarang resmi diakui dalam omzet bulanan periode 2026-11");
assert(Number(po1Recognized.total_order) === 1250000, `Omzet yang diakui adalah 100% nilai total PO (Rp1.250.000)`);

// Pastikan PO 2 yang belum bayar tetap tidak masuk omzet
const po2Recognized = (recognizedAfterSettlement.records || []).find(p => p.po_id === po2Result.po_id);
assert(!po2Recognized, "PO 2 (UNPAID) tetap tidak diakui sebagai omzet");

// ---------------------------------------------------------------------------
// SKENARIO 5: Siklus Status Pengadaan Supplier (NOT_ORDERED -> ORDERED -> IN_TRANSIT -> RECEIVED)
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 5: Siklus Status Pengadaan Supplier");
// 1. Update ke ORDERED
const proc1 = POService.updateProcurementStatus(po1Result.po_id, "ORDERED", "admin1");
assert(proc1.success === true && proc1.procurement_status === "ORDERED", "Status berhasil diupdate menjadi ORDERED");

// 2. Update ke IN_TRANSIT
const proc2 = POService.updateProcurementStatus(po1Result.po_id, "IN_TRANSIT", "admin1");
assert(proc2.success === true && proc2.procurement_status === "IN_TRANSIT", "Status berhasil diupdate menjadi IN_TRANSIT");

// 3. Update ke RECEIVED (Barang tiba di toko)
const proc3 = POService.updateProcurementStatus(po1Result.po_id, "RECEIVED", "admin1");
assert(proc3.success === true && proc3.procurement_status === "RECEIVED", "Status berhasil diupdate menjadi RECEIVED");

// ---------------------------------------------------------------------------
// SKENARIO 6: Alokasi & Reservasi Stok Fisik saat Barang Tiba
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 6: Alokasi & Reservasi Stok Fisik saat Barang Tiba");
// Simulasikan barang fisik telah diterima dari supplier via InventoryService
InventoryService.receiveOwnedStockBatch("PUR-PO-001", "VAR-PO-ECHO-M9", 1, 800000, 0, "Penerimaan stok supplier untuk PO", "admin1");

const stockBeforeAlloc = InventoryService.getStock("VAR-PO-ECHO-M9");
assert(Number(stockBeforeAlloc.owned_physical_stock) === 1, "Fisik stok bertambah 1 pasang dari supplier");
assert(Number(stockBeforeAlloc.owned_reserved_stock) === 0, "Stok reservasi masih 0 sebelum alokasi");

// Lakukan alokasi untuk PO 1
const allocResult = POService.allocateStockForPO(po1Result.po_id, "OWNED", "admin1");
assert(allocResult.success === true, "Alokasi stok untuk PO 1 berhasil");

const stockAfterAlloc = InventoryService.getStock("VAR-PO-ECHO-M9");
assert(Number(stockAfterAlloc.owned_physical_stock) === 1, "Fisik stok tetap 1 pasang");
assert(Number(stockAfterAlloc.owned_reserved_stock) === 1, "Stok reservasi menjadi 1 pasang (terkunci untuk customer Budi)");
assert(Number(stockAfterAlloc.owned_available_stock) === 0, "Stok siap jual (available) menjadi 0 (tidak bisa dibeli orang lain)");

// Cek bahwa mutasi reservasi tercatat
const allocMutation = findRow("MUTASI_STOK", m => (m.movement_type === "STOCK_RESERVATION" || m.mutation_type === "RESERVE_PO") && m.reference_id === po1Result.po_id);
assert(Boolean(allocMutation), "Tercatat baris mutasi reservasi di MUTASI_STOK");

// ---------------------------------------------------------------------------
// SKENARIO 7: Serah Terima Barang (Fulfillment) — Zero Omzet Ganda
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 7: Serah Terima Barang (Fulfillment) — Zero Omzet Ganda");
const fulfillResult = POService.fulfillPO(po1Result.po_id, "OWNED", "admin1");
assert(fulfillResult.success === true, "Serah terima barang ke pelanggan berhasil diproses");

const po1Fulfilled = findRow("PRE_ORDER", r => r.po_id === po1Result.po_id);
assert(po1Fulfilled.fulfillment_status === "DELIVERED", "Status penyerahan menjadi DELIVERED");

const stockAfterFulfill = InventoryService.getStock("VAR-PO-ECHO-M9");
assert(Number(stockAfterFulfill.owned_physical_stock) === 0, "Fisik stok berkurang 1 pasang setelah diserahkan");
assert(Number(stockAfterFulfill.owned_reserved_stock) === 0, "Stok reservasi kembali 0 setelah diserahkan");

// Cek bahwa mutasi penyerahan tercatat
const fulfillMutation = findRow("MUTASI_STOK", m => (m.movement_type === "PO_FULFILLMENT" || m.mutation_type === "FULFILL_PO") && m.reference_id === po1Result.po_id);
assert(Boolean(fulfillMutation), "Tercatat baris mutasi fulfillment di MUTASI_STOK");

// Bukti: ZERO OMZET GANDA! Omzet tetap diakui 1 kali saja berdasarkan settlement_date
const recognizedAfterFulfill = POService.getRecognizedMonthlyPO("2026-11");
const countPo1 = (recognizedAfterFulfill.records || []).filter(p => p.po_id === po1Result.po_id).length;
assert(countPo1 === 1, "PO 1 hanya terhitung tepat 1 kali dalam omzet (Zero Omzet Ganda)");

// ---------------------------------------------------------------------------
// SKENARIO 8: Pembatalan PO Sebelum Barang Tiba (Refund Tercatat, Stok Fisik Aman)
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 8: Pembatalan PO Sebelum Barang Tiba (Refund Tercatat, Stok Fisik Aman)");
// Buat PO baru khusus pembatalan
const poCancel1 = POService.createPreOrder({
  customer_name: "Doni Prasetyo",
  customer_contact: "081300001111",
  variant_id: "VAR-PO-MEGA-W7",
  quantity: 1,
  agreed_price: 1500000,
  supplier_info: "Supplier US Direct",
  initial_dp: 500000,
  initial_dp_method: "TRANSFER_BCA",
  created_by: "admin1",
  idempotency_key: "po-create-cancel-1"
});

// Batalkan sebelum barang tiba (procurement_status masih NOT_ORDERED)
const cancel1Result = POService.cancelPO(
  poCancel1.po_id,
  "Customer membatalkan karena butuh uang mendesak",
  500000, // Refund penuh DP
  "TRANSFER_BCA",
  "OWNED",
  "admin1",
  "cancel-key-001"
);

assert(cancel1Result.success === true, "Pembatalan PO sebelum tiba berhasil diproses");
const poCancel1Row = findRow("PRE_ORDER", r => r.po_id === poCancel1.po_id);
assert(poCancel1Row.fulfillment_status === "CANCELLED", "fulfillment_status berubah menjadi CANCELLED");
assert(poCancel1Row.payment_status === "REFUNDED", "payment_status berubah menjadi REFUNDED");

// Cek bahwa pengembalian dana tercatat sebagai nilai negatif di PEMBAYARAN_PO
const refundPayments = DatabaseHelper.getAllRows("PEMBAYARAN_PO", p => p.po_id === poCancel1.po_id && Number(p.amount) < 0);
assert(refundPayments.length === 1, "Tercatat 1 baris REFUND di PEMBAYARAN_PO");
assert(Number(refundPayments[0].amount) === -500000, "Nominal refund dicatat negatif (-Rp500.000) untuk menjaga net cash flow");

// Stok fisik tidak berubah
const megaStock1 = InventoryService.getStock("VAR-PO-MEGA-W7");
assert(Number(megaStock1.owned_physical_stock) === 0, "Stok fisik tetap 0 (tidak ada barang tiba)");

// ---------------------------------------------------------------------------
// SKENARIO 9: Pembatalan PO Setelah Barang Tiba (Pelepasan Reservasi ke Ready Stock)
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 9: Pembatalan PO Setelah Barang Tiba (Pelepasan Reservasi ke Ready Stock)");
// Buat PO baru
const poCancel2 = POService.createPreOrder({
  customer_name: "Rian Hendra",
  customer_contact: "081322223333",
  variant_id: "VAR-PO-MEGA-W7",
  quantity: 1,
  agreed_price: 1500000,
  supplier_info: "Supplier US Direct",
  initial_dp: 500000,
  initial_dp_method: "TRANSFER_BCA",
  created_by: "admin1",
  idempotency_key: "po-create-cancel-2"
});

// Simulasikan barang tiba dari supplier
InventoryService.receiveOwnedStockBatch("PUR-MEGA-001", "VAR-PO-MEGA-W7", 1, 1000000, 0, "Penerimaan stok dari supplier US", "admin1");

// Update status pengadaan menjadi RECEIVED dan alokasikan stok (reserved)
POService.updateProcurementStatus(poCancel2.po_id, "RECEIVED", "admin1");
POService.allocateStockForPO(poCancel2.po_id, "OWNED", "admin1");

const stockBeforeCancel2 = InventoryService.getStock("VAR-PO-MEGA-W7");
assert(Number(stockBeforeCancel2.owned_physical_stock) === 1, "Stok fisik adalah 1 pasang");
assert(Number(stockBeforeCancel2.owned_reserved_stock) === 1, "Stok reservasi adalah 1 pasang");
assert(Number(stockBeforeCancel2.owned_available_stock) === 0, "Stok available adalah 0");

// Sekarang customer membatalkan PO setelah barang tiba!
const cancel2Result = POService.cancelPO(
  poCancel2.po_id,
  "Customer membatalkan pesanan setelah barang tiba",
  500000,
  "TRANSFER_BCA",
  "OWNED",
  "admin1",
  "cancel-key-002"
);

assert(cancel2Result.success === true, "Pembatalan PO setelah barang tiba berhasil");

// Verifikasi aturan bisnis:
// - reserved_stock berkurang menjadi 0
// - physical_stock TETAP 1 (karena barang sudah ada di toko)
// - available_stock BERTAMBAH menjadi 1 (menjadi stok siap jual / ready stock)
const stockAfterCancel2 = InventoryService.getStock("VAR-PO-MEGA-W7");
assert(Number(stockAfterCancel2.owned_physical_stock) === 1, "Stok fisik TETAP 1 pasang di toko");
assert(Number(stockAfterCancel2.owned_reserved_stock) === 0, "Stok reservasi BERKURANG menjadi 0");
assert(Number(stockAfterCancel2.owned_available_stock) === 1, "Stok available BERTAMBAH menjadi 1 (siap dijual sebagai ready stock!)");

// Cek bahwa mutasi pelepasan reservasi tercatat
const releaseMutation = findRow("MUTASI_STOK", m => (m.movement_type === "RELEASE_RESERVATION" || m.mutation_type === "RELEASE_RESERVE") && m.reference_id === poCancel2.po_id);
assert(Boolean(releaseMutation), "Tercatat baris mutasi pelepasan reservasi di MUTASI_STOK");

// ---------------------------------------------------------------------------
// SKENARIO 10: Validasi Refund Akumulatif & Idempotency Key
// ---------------------------------------------------------------------------
console.log("\n▶ Skenario 10: Validasi Refund Akumulatif & Idempotency Key");
// Buat PO untuk menguji refund bertahap
const poRefundTest = POService.createPreOrder({
  customer_name: "Anita Wijaya",
  customer_contact: "081399998888",
  variant_id: "VAR-PO-ECHO-M9",
  quantity: 1,
  agreed_price: 1200000,
  initial_dp: 600000, // Total bayar masuk = Rp600.000
  initial_dp_method: "TRANSFER_BCA",
  created_by: "admin1",
  idempotency_key: "po-refund-test-create"
});

// 1. Uji Refund Parsial Pertama: Rp200.000 (Maksimal refund sisa: Rp400.000)
const partialRefund1 = POService.cancelPO(
  poRefundTest.po_id,
  "Refund sebagian tahap 1",
  200000,
  "TRANSFER_BCA",
  "OWNED",
  "admin1",
  "idemp-refund-1"
);
assert(partialRefund1.success === true, "Refund parsial pertama Rp200.000 berhasil");
assert(partialRefund1.payment_status === "PARTIAL_REFUNDED", "Status pembayaran adalah PARTIAL_REFUNDED");

// 2. Uji Penolakan Refund Melebihi Sisa Hak Refund:
// Total bayar: Rp600.000, sudah refund: Rp200.000, sisa hak refund: Rp400.000.
// Coba refund Rp500.000 -> HARUS DITOLAK!
let excessRefundBlocked = false;
try {
  POService.cancelPO(
    poRefundTest.po_id,
    "Refund kedua melebihi saldo",
    500000, // > 400.000
    "TRANSFER_BCA",
    "OWNED",
    "admin1",
    "idemp-refund-2"
  );
} catch (err) {
  excessRefundBlocked = true;
  assert(err.message.includes("melebihi") || err.message.includes("sisa dana"), `Refund berlebih berhasil ditolak oleh server: "${err.message}"`);
}
assert(excessRefundBlocked === true, "Server memblokir refund yang melebihi batas akumulatif pembayaran");

// 3. Uji Refund Tepat Sisa Hak: Rp400.000 -> HARUS BERHASIL & Status menjadi REFUNDED
const fullRemainingRefund = POService.cancelPO(
  poRefundTest.po_id,
  "Pelunasan refund tahap akhir",
  400000,
  "TRANSFER_BCA",
  "OWNED",
  "admin1",
  "idemp-refund-3"
);
assert(fullRemainingRefund.success === true, "Refund sisa Rp400.000 berhasil");
assert(fullRemainingRefund.payment_status === "REFUNDED", "Status pembayaran resmi menjadi REFUNDED (100% dana telah kembali)");

// 4. Uji Penolakan Refund Lanjutan (Bahkan Rp1) Setelah REFUNDED Penuh
let postRefundBlocked = false;
try {
  POService.cancelPO(
    poRefundTest.po_id,
    "Refund susulan",
    1000,
    "TRANSFER_BCA",
    "OWNED",
    "admin1",
    "idemp-refund-4"
  );
} catch (err) {
  postRefundBlocked = true;
  assert(err.message.includes("direfund penuh") || err.message.includes("Maksimal refund") || err.message.includes("melebihi"), `Refund susulan Rp1.000 ditolak: "${err.message}"`);
}
assert(postRefundBlocked === true, "Server memblokir refund lanjutan pada PO yang sudah REFUNDED penuh");

// 5. Uji Idempotency Key pada Refund
const idempRetry = POService.cancelPO(
  poRefundTest.po_id,
  "Pelunasan refund tahap akhir (Retry)",
  400000,
  "TRANSFER_BCA",
  "OWNED",
  "admin1",
  "idemp-refund-3" // Kunci idempotency sama dengan panggilan ke-3
);
assert(idempRetry.success === true && idempRetry.idempotent === true, "Retry panggilan refund dengan idempotency_key sama tidak memicu duplikasi transaksi");

// ---------------------------------------------------------------------------
// RINGKASAN HASIL
// ---------------------------------------------------------------------------
console.log("\n========================================================================");
console.log(`📊 HASIL PENGUJIAN PHASE 3D SUB-MODUL 2: PRE-ORDER (PO)`);
console.log(`Total Pengujian : ${totalTests}`);
console.log(`Lulus (PASS)    : ${passedTests}`);
console.log(`Gagal (FAIL)    : ${totalTests - passedTests}`);
console.log("========================================================================");

if (passedTests === totalTests) {
  console.log("🎉 SEMUA SKENARIO OPERASIONAL & FINANSIAL PRE-ORDER DINYATAKAN LULUS!");
  process.exit(0);
} else {
  console.error("❌ BEBERAPA PENGUJIAN GAGAL.");
  process.exit(1);
}
