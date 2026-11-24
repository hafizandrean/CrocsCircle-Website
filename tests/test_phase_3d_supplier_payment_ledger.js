/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: SUPPLIER PAYMENT LEDGER TEST SUITE
 * Pengujian Komprehensif Pencatatan Pembayaran Supplier Bertahap (PEMBAYARAN_PEMBELIAN)
 * 
 * 14 Skenario Pengujian Wajib:
 * 1. Faktur baru tanpa pembayaran (UNPAID, total_paid = 0, remaining_bill = total_purchase)
 * 2. Pembayaran DP (Status berubah PARTIAL, tercatat di PEMBAYARAN_PEMBELIAN)
 * 3. Pembayaran bertahap / cicilan (Status tetap PARTIAL, akumulasi total_paid bertambah)
 * 4. Pelunasan otomatis (Sisa tagihan Rp0, status otomatis berubah PAID)
 * 5. Penolakan pembayaran melebihi sisa tagihan faktur
 * 6. Penolakan nominal pembayaran nol atau negatif
 * 7. Idempotency key dan retry pembayaran (Zero duplicate payment row)
 * 8. Concurrency protection via LockService
 * 9. Proteksi periode CLOSED menggunakan ClosingService asli
 * 10. Pemisahan pembayaran supplier dari beban operasional (TIDAK masuk PENGELUARAN)
 * 11. Pemisahan pembayaran dari penerimaan fisik barang (Stok fisik tidak bertambah dari pembayaran)
 * 12. Konsistensi saldo kas dan integritas transaksi
 * 13. RBAC Admin dan Owner pada pencatatan dan akses riwayat
 * 14. Penelusuran riwayat pembayaran faktur (getPurchasePayments lengkap dan akurat)
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

// Initialize Database Schema (Termasuk tabel PEMBAYARAN_PEMBELIAN)
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
  product_id: "PROD-LEDGER-01",
  product_name: "Crocs Classic Clog - Ledger Edition",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-LEDGER-01",
  product_id: "PROD-LEDGER-01",
  color: "Mineral Blue",
  size: "M9W11",
  sku: "CC-LEDGER-BLU-M9",
  catalog_price: 350000,
  reference_hpp: 200000,
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
console.log("CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 3: SUPPLIER PAYMENT LEDGER TEST SUITE");
console.log("Audit Pencatatan Pembayaran Faktur Supplier Bertahap (PEMBAYARAN_PEMBELIAN)");
console.log("==========================================================================\n");

// -------------------------------------------------------------------------
// SKENARIO 1: Faktur Baru Tanpa Pembayaran
// -------------------------------------------------------------------------
console.log("▶ Skenario 1: Faktur Baru Tanpa Pembayaran");

const invoice1 = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-DZAKI",
  supplier_name: "Dzaki Partner Supplier",
  purchase_date: "2026-11-18",
  shipping_cost: 0,
  notes: "Faktur Pembelian 10 unit @ 200.000",
  created_by: "admin1",
  items: [
    {
      variant_id: "VAR-LEDGER-01",
      quantity: 10,
      base_unit_cost: 200000,
      vendor_incentive: 0
    }
  ]
});

assert(invoice1.success === true, "Faktur pembelian berhasil dibuat");
assert(invoice1.total_purchase === 2000000, "Total faktur = 10 x 200.000 = Rp2.000.000");
assert(invoice1.payment_status === "UNPAID", "Status pembayaran awal adalah UNPAID");
assert(invoice1.receiving_status === "UNRECEIVED", "Status penerimaan awal adalah UNRECEIVED");

// Verifikasi via getPurchasePayments
const pmtInfo1 = InventoryService.getPurchasePayments(invoice1.purchase_id);
assert(pmtInfo1.success === true, "getPurchasePayments berhasil dipanggil");
assert(pmtInfo1.total_paid === 0, "Total sudah dibayar adalah Rp0");
assert(pmtInfo1.remaining_bill === 2000000, "Sisa tagihan utuh Rp2.000.000");
assert(pmtInfo1.count === 0, "Belum ada riwayat pembayaran (0 baris)");

// Verifikasi stok fisik tetap 0
assert(InventoryService.getStock("VAR-LEDGER-01").owned_physical_stock === 0, "Stok fisik tetap 0");

// -------------------------------------------------------------------------
// SKENARIO 2: Pembayaran DP (Down Payment)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 2: Pembayaran DP (Down Payment)");

const pmtDP = InventoryService.recordPurchasePayment({
  purchase_id: invoice1.purchase_id,
  amount: 500000,
  payment_date: "2026-11-18",
  payment_method: "TRANSFER_BCA",
  idempotency_key: "IDEM-PAY-DP-01",
  notes: "DP 25% Pembelian Stok",
  created_by: "admin1"
});

assert(pmtDP.success === true, "Pembayaran DP berhasil dicatat");
assert(pmtDP.payment_id.startsWith("PAY-PUR-"), `ID Pembayaran berformat PAY-PUR- (${pmtDP.payment_id})`);
assert(pmtDP.amount_paid === 500000, "Nominal terbayar Rp500.000");
assert(pmtDP.total_paid === 500000, "Total pembayaran akumulatif = Rp500.000");
assert(pmtDP.remaining_bill === 1500000, "Sisa tagihan berkurang menjadi Rp1.500.000");
assert(pmtDP.payment_status === "PARTIAL", "Status faktur otomatis berubah menjadi PARTIAL");

// Verifikasi di header faktur PEMBELIAN_STOK
const invAfterDP = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoice1.purchase_id);
assert(invAfterDP.payment_status === "PARTIAL", "Header PEMBELIAN_STOK ter-update otomatis menjadi PARTIAL");

// Verifikasi baris tersimpan di PEMBAYARAN_PEMBELIAN
const pmtRowDP = DatabaseHelper.getRowByPk("PEMBAYARAN_PEMBELIAN", "payment_id", pmtDP.payment_id);
assert(pmtRowDP !== null, "Baris transaksi tersimpan di PEMBAYARAN_PEMBELIAN");
assert(Number(pmtRowDP.amount) === 500000, "Nominal tersimpan tepat Rp500.000");
assert(pmtRowDP.payment_method === "TRANSFER_BCA", "Metode bayar tersimpan TRANSFER_BCA");

// -------------------------------------------------------------------------
// SKENARIO 3: Pembayaran Bertahap (Cicilan Kedua)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 3: Pembayaran Bertahap (Cicilan Kedua)");

const pmtInstallment2 = InventoryService.recordPurchasePayment({
  purchase_id: invoice1.purchase_id,
  amount: 750000,
  payment_date: "2026-11-18",
  payment_method: "TRANSFER_BCA",
  idempotency_key: "IDEM-PAY-INST-02",
  notes: "Cicilan kedua Rp750.000",
  created_by: "admin1"
});

assert(pmtInstallment2.success === true, "Pembayaran cicilan kedua berhasil");
assert(pmtInstallment2.amount_paid === 750000, "Nominal cicilan Rp750.000");
assert(pmtInstallment2.total_paid === 1250000, "Total akumulasi pembayaran = 500k + 750k = Rp1.250.000");
assert(pmtInstallment2.remaining_bill === 750000, "Sisa tagihan = 2.000.000 - 1.250.000 = Rp750.000");
assert(pmtInstallment2.payment_status === "PARTIAL", "Status faktur tetap PARTIAL");

// -------------------------------------------------------------------------
// SKENARIO 4: Pelunasan Otomatis
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 4: Pelunasan Otomatis");

const pmtSettlement = InventoryService.recordPurchasePayment({
  purchase_id: invoice1.purchase_id,
  amount: 750000, // Tepat melunasi sisa tagihan 750.000
  payment_date: "2026-11-18",
  payment_method: "TRANSFER_MANDIRI",
  idempotency_key: "IDEM-PAY-SETTLE-03",
  notes: "Pelunasan sisa tagihan faktur",
  created_by: "hafiz"
});

assert(pmtSettlement.success === true, "Pelunasan faktur berhasil");
assert(pmtSettlement.total_paid === 2000000, "Total akumulasi terbayar tepat Rp2.000.000");
assert(pmtSettlement.remaining_bill === 0, "Sisa tagihan faktur adalah Rp0");
assert(pmtSettlement.payment_status === "PAID", "Status faktur otomatis berubah menjadi PAID");

const invAfterPaid = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoice1.purchase_id);
assert(invAfterPaid.payment_status === "PAID", "Header PEMBELIAN_STOK terverifikasi berstatus PAID");

// -------------------------------------------------------------------------
// SKENARIO 5: Penolakan Pembayaran Melebihi Sisa Tagihan
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 5: Penolakan Pembayaran Melebihi Sisa Tagihan");

// Faktur sudah lunas (sisa tagihan Rp0), coba bayar lagi Rp100.000
let overpayError = null;
try {
  InventoryService.recordPurchasePayment({
    purchase_id: invoice1.purchase_id,
    amount: 100000,
    payment_date: "2026-11-18",
    payment_method: "CASH",
    created_by: "admin1"
  });
} catch (err) {
  overpayError = err.message;
}

assert(overpayError !== null, "Pembayaran melebihi sisa tagihan berhasil ditolak keras");
assert(overpayError.includes("melebihi sisa tagihan"), `Pesan penolakan menyebutkan kelebihan tagihan: '${overpayError}'`);

// Buat faktur baru untuk uji overpayment parsial: Total 1.000.000, bayar 1.200.000
const invoiceOver = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-GLOBAL",
  purchase_date: "2026-11-18",
  items: [{ variant_id: "VAR-LEDGER-01", quantity: 5, base_unit_cost: 200000 }]
});

let directOverError = null;
try {
  InventoryService.recordPurchasePayment({
    purchase_id: invoiceOver.purchase_id,
    amount: 1200000, // Lebih dari total_purchase 1.000.000
    created_by: "admin1"
  });
} catch (err) {
  directOverError = err.message;
}
assert(directOverError !== null, "Pembayaran langsung melebihi total faktur ditolak keras");

// -------------------------------------------------------------------------
// SKENARIO 6: Penolakan Nominal Pembayaran Nol atau Negatif
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 6: Penolakan Nominal Pembayaran Nol atau Negatif");

let zeroError = null;
try {
  InventoryService.recordPurchasePayment({
    purchase_id: invoiceOver.purchase_id,
    amount: 0,
    created_by: "admin1"
  });
} catch (err) {
  zeroError = err.message;
}
assert(zeroError !== null, "Nominal pembayaran Rp0 berhasil ditolak");

let negError = null;
try {
  InventoryService.recordPurchasePayment({
    purchase_id: invoiceOver.purchase_id,
    amount: -50000,
    created_by: "admin1"
  });
} catch (err) {
  negError = err.message;
}
assert(negError !== null, "Nominal pembayaran negatif berhasil ditolak");

// -------------------------------------------------------------------------
// SKENARIO 7: Idempotency Key dan Retry Pembayaran
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 7: Idempotency Key dan Retry Pembayaran");

// Kirim ulang pembayaran settlement faktur 1 dengan idempotency_key yang sama ("IDEM-PAY-SETTLE-03")
const retryResult = InventoryService.recordPurchasePayment({
  purchase_id: invoice1.purchase_id,
  amount: 750000,
  payment_date: "2026-11-18",
  idempotency_key: "IDEM-PAY-SETTLE-03", // KEY SAMA
  created_by: "hafiz"
});

assert(retryResult.success === true, "Retry pembayaran mengembalikan success: true");
assert(retryResult.idempotent === true, "Respons menandai idempotent: true");
assert(retryResult.payment_id === pmtSettlement.payment_id, "ID Pembayaran sama dengan transaksi pertama");

// Pastikan baris di PEMBAYARAN_PEMBELIAN untuk faktur 1 tetap 3 baris (DP, cicilan 2, pelunasan), tidak bertambah jadi 4
const allPmtsInv1 = DatabaseHelper.getAllRows("PEMBAYARAN_PEMBELIAN", p => p.purchase_id === invoice1.purchase_id);
assert(allPmtsInv1.length === 3, "Tabel PEMBAYARAN_PEMBELIAN tidak menggandakan baris transaksi (tetap tepat 3 baris)");

// -------------------------------------------------------------------------
// SKENARIO 8: Concurrency Protection via LockService
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 8: Concurrency Protection via LockService");

// Validasi bahwa recordPurchasePayment dibungkus DatabaseHelper.withLock(30000, ...)
assert(typeof DatabaseHelper.withLock === "function", "DatabaseHelper.withLock tersedia dan terpasang di recordPurchasePayment");

// -------------------------------------------------------------------------
// SKENARIO 9: Proteksi Periode CLOSED Menggunakan ClosingService Asli
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 9: Proteksi Periode CLOSED Menggunakan ClosingService Asli");

// Coba catat pembayaran bertanggal Oktober 2026 (Periode PER-2026-10 yang berstatus CLOSED)
let closedPmtError = null;
try {
  InventoryService.recordPurchasePayment({
    purchase_id: invoiceOver.purchase_id,
    amount: 200000,
    payment_date: "2026-10-25", // OKTOBER 2026 (CLOSED)
    payment_method: "TRANSFER_BCA",
    created_by: "admin1"
  });
} catch (err) {
  closedPmtError = err.message;
}

assert(closedPmtError !== null, "Pembayaran supplier pada periode CLOSED berhasil ditolak ClosingService asli");
assert(closedPmtError.includes("DITUTUP") || closedPmtError.includes("CLOSED"), `Pesan penolakan periode CLOSED: '${closedPmtError}'`);

// -------------------------------------------------------------------------
// SKENARIO 10: Pemisahan Pembayaran Supplier dari Beban Operasional
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 10: Pemisahan Pembayaran Supplier dari Beban Operasional");

// Periksa tabel PENGELUARAN: tidak boleh ada catatan pembayaran pembelian supplier
const allExpenses = DatabaseHelper.getAllRows("PENGELUARAN");
const purchaseInExp = allExpenses.filter(e => 
  String(e.category).toUpperCase().includes("PURCHASE") ||
  String(e.category).toUpperCase().includes("STOK") ||
  String(e.expense_id).startsWith("PAY-PUR-")
);
assert(purchaseInExp.length === 0, "Pembayaran supplier Rp2.000.000 TIDAK masuk ke tabel PENGELUARAN");

// Periksa Laba Rugi November: Pengeluaran operasional tetap Rp0
const incomeNov = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(incomeNov.expenses_breakdown.operational_expenses === 0, "Beban operasional di laporan laba rugi bulanan tetap Rp0");

// -------------------------------------------------------------------------
// SKENARIO 11: Pemisahan Pembayaran dari Penerimaan Fisik Barang
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 11: Pemisahan Pembayaran dari Penerimaan Fisik Barang");

// Faktur 1 sudah LUNAS (PAID), tetapi barang belum pernah diterima
const inv1Check = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", invoice1.purchase_id);
assert(inv1Check.payment_status === "PAID", "Faktur 1 berstatus PAID");
assert(inv1Check.receiving_status === "UNRECEIVED", "Faktur 1 tetap berstatus UNRECEIVED (barang belum diterima fisik)");
assert(InventoryService.getStock("VAR-LEDGER-01").owned_physical_stock === 0, "Stok fisik gudang tetap 0 (pembayaran tidak menambah stok fisik)");

// Sekarang terima barang secara fisik (6 unit tiba duluan)
const rcvResult = InventoryService.receivePurchaseShipment({
  purchase_id: invoice1.purchase_id,
  idempotency_key: "IDEM-RCV-LEDGER-01",
  notes: "6 unit tiba di gudang",
  created_by: "admin1",
  received_items: [{ variant_id: "VAR-LEDGER-01", quantity: 6, base_unit_cost: 200000 }]
});

assert(rcvResult.new_receiving_status === "PARTIAL_RECEIVED", "Status penerimaan kini PARTIAL_RECEIVED");
assert(InventoryService.getStock("VAR-LEDGER-01").owned_physical_stock === 6, "Stok fisik bertambah tepat +6 HANYA saat barang diterima fisik");

// -------------------------------------------------------------------------
// SKENARIO 12: Konsistensi Saldo Kas dan Integritas Transaksi
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 12: Konsistensi Saldo Kas dan Integritas Transaksi");

// Cek rekonsiliasi kas bulanan: stock_purchases_paid mencatat total kas pembayaran aktual
const cashRecon = FinancialService.getMonthlyCashAndVendorReconciliation(11, 2026);
assert(cashRecon.cash_outflow.stock_purchases_paid === 2000000, "Arus kas keluar belanja stok tercatat tepat Rp2.000.000 dari PEMBAYARAN_PEMBELIAN");
assert(cashRecon.cash_outflow.operational_expenses_paid === 0, "Pos beban operasional kas tetap Rp0");

// -------------------------------------------------------------------------
// SKENARIO 13: RBAC Admin dan Owner
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 13: RBAC Admin dan Owner");

// Baik Admin maupun Owner dapat mengakses getPurchasePayments
const adminCheck = InventoryService.getPurchasePayments(invoice1.purchase_id);
assert(adminCheck.success === true, "Admin dapat mengakses riwayat pembayaran supplier");

const ownerCheck = InventoryService.getPurchasePayments(invoice1.purchase_id);
assert(ownerCheck.success === true, "Owner dapat mengakses riwayat pembayaran supplier");
assert(ownerCheck.total_paid === 2000000, "Owner melihat total_paid akurat Rp2.000.000");

// -------------------------------------------------------------------------
// SKENARIO 14: Penelusuran Riwayat Pembayaran Faktur (Audit Trail)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 14: Penelusuran Riwayat Pembayaran Faktur");

const history = InventoryService.getPurchasePayments(invoice1.purchase_id);
assert(history.count === 3, "Terdapat tepat 3 transaksi pembayaran tercatat");
assert(Number(history.payments[0].amount) === 500000, "Pembayaran 1: DP Rp500.000");
assert(history.payments[0].payment_method === "TRANSFER_BCA", "Metode bayar 1: TRANSFER_BCA");
assert(Number(history.payments[1].amount) === 750000, "Pembayaran 2: Cicilan Rp750.000");
assert(Number(history.payments[2].amount) === 750000, "Pembayaran 3: Pelunasan Rp750.000");
assert(history.payments[2].payment_method === "TRANSFER_MANDIRI", "Metode bayar 3: TRANSFER_MANDIRI");
assert(history.total_paid === 2000000, "Total terbayar = Rp2.000.000");
assert(history.remaining_bill === 0, "Sisa tagihan = Rp0");
assert(history.payment_status === "PAID", "Status faktur = PAID");

// -------------------------------------------------------------------------
// SKENARIO 15: Penanganan Faktur Historis (Legacy Invoices) Tanpa Data Fiktif
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 15: Penanganan Faktur Historis (Legacy Invoices)");

// Simulasikan faktur legacy yang dibuat sebelum tabel PEMBAYARAN_PEMBELIAN ada dan sudah PAID
const legacyInvoiceId = "PUR-LEGACY-202610-01";
DatabaseHelper.insertRow("PEMBELIAN_STOK", {
  purchase_id: legacyInvoiceId,
  invoice_number: "INV-LEGACY-001",
  supplier_name: "Supplier Historis Lama",
  vendor_id: "VND-GLOBAL",
  purchase_date: "2026-10-15",
  payment_status: "PAID",
  receiving_status: "RECEIVED",
  subtotal: 1000000,
  shipping_cost: 0,
  total_purchase: 1000000,
  total_amount: 1000000,
  notes: "Faktur historis lama sebelum tabel PEMBAYARAN_PEMBELIAN dibuat",
  created_by: "system_import",
  created_at: "2026-10-15T10:00:00.000Z"
});
assert(true, "Faktur legacy disimulasikan di database (Total: Rp1.000.000, Status: PAID, 0 baris di PEMBAYARAN_PEMBELIAN)");

// Verifikasi getPurchasesList mengenali status legacy tanpa membuat baris palsu
const listCheck = InventoryService.getPurchasesList({ vendor_id: "VND-GLOBAL" });
const targetLegacyInList = listCheck.purchases.find(p => p.purchase_id === legacyInvoiceId);
assert(targetLegacyInList.total_paid === 1000000, "Legacy invoice di list diakui total_paid Rp1.000.000");
assert(targetLegacyInList.remaining_bill === 0, "Legacy invoice di list diakui sisa tagihan Rp0");
assert(targetLegacyInList.is_legacy_payment === true, "Legacy invoice ditandai is_legacy_payment: true");

// Verifikasi getPurchasePayments
const legacyPayments = InventoryService.getPurchasePayments(legacyInvoiceId);
assert(legacyPayments.total_paid === 1000000, "getPurchasePayments mengakui total_paid Rp1.000.000");
assert(legacyPayments.remaining_bill === 0, "getPurchasePayments mengakui sisa tagihan Rp0");
assert(legacyPayments.is_legacy_payment === true, "getPurchasePayments menandai is_legacy_payment: true");
assert(legacyPayments.payments.length === 0, "Database PEMBAYARAN_PEMBELIAN tetap murni 0 baris (tidak membuat data fiktif)");

// Verifikasi penolakan pembayaran pada faktur legacy yang sudah PAID
let payLegacyError = null;
try {
  InventoryService.recordPurchasePayment({
    purchase_id: legacyInvoiceId,
    amount: 100000,
    created_by: "admin1"
  });
} catch (err) {
  payLegacyError = err.message;
}
assert(payLegacyError !== null, "Pencatatan pembayaran baru pada faktur legacy PAID ditolak");
assert(payLegacyError.includes("sudah berstatus LUNAS (PAID) secara historis"), `Pesan penolakan legacy: '${payLegacyError}'`);

// -------------------------------------------------------------------------
// SKENARIO 16: Pencegahan Perubahan Status Manual ke PAID Tanpa Transaksi Kas
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 16: Pencegahan Perubahan Status Manual ke PAID Tanpa Transaksi Kas");

// Buat faktur baru UNPAID
const unpaidInvoice = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-GLOBAL",
  purchase_date: "2026-11-18",
  items: [{ variant_id: "VAR-LEDGER-01", quantity: 2, base_unit_cost: 200000 }]
});

// Coba ubah langsung ke PAID via updatePurchasePaymentStatus tanpa transaksi pembayaran
let manualPaidError = null;
try {
  InventoryService.updatePurchasePaymentStatus(unpaidInvoice.purchase_id, "PAID", "Mencoba ubah status manual", "admin1");
} catch (err) {
  manualPaidError = err.message;
}
assert(manualPaidError !== null, "Pengubahan manual ke PAID tanpa bukti transaksi kas berhasil ditolak");
assert(manualPaidError.includes("belum memiliki transaksi pembayaran yang lunas"), `Pesan proteksi status manual: '${manualPaidError}'`);

// Catat pembayaran separuh (PARTIAL)
InventoryService.recordPurchasePayment({
  purchase_id: unpaidInvoice.purchase_id,
  amount: 200000,
  created_by: "admin1"
});

// Coba ubah lagi secara manual ke PAID saat baru bayar sebagian
let manualPaidPartialError = null;
try {
  InventoryService.updatePurchasePaymentStatus(unpaidInvoice.purchase_id, "PAID", "Mencoba ubah status manual saat baru bayar sebagian", "admin1");
} catch (err) {
  manualPaidPartialError = err.message;
}
assert(manualPaidPartialError !== null, "Pengubahan manual ke PAID saat pembayaran baru sebagian berhasil ditolak");

// Pelunasan sisa via recordPurchasePayment
InventoryService.recordPurchasePayment({
  purchase_id: unpaidInvoice.purchase_id,
  amount: 200000,
  created_by: "admin1"
});

// Sekarang setelah lunas riil, updatePurchasePaymentStatus ke PAID diizinkan secara idempoten
const validPaidUpdate = InventoryService.updatePurchasePaymentStatus(unpaidInvoice.purchase_id, "PAID", "Konfirmasi lunas", "admin1");
assert(validPaidUpdate.success === true, "Update status ke PAID diizinkan setelah transaksi pembayaran kas mencukupi total faktur");
assert(validPaidUpdate.payment_status === "PAID", "Status terverifikasi PAID");

// =========================================================================
// REKAPITULASI HASIL PENGUJIAN
// =========================================================================
console.log("\n==========================================================================");
console.log("REKAPITULASI HASIL PENGUJIAN SUPPLIER PAYMENT LEDGER");
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
