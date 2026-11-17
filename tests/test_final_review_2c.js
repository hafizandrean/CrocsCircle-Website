/**
 * CROCSCIRCLE.ID — FINAL REVIEW PHASE 2C TEST SUITE
 * 
 * Pengujian Khusus 4 Skenario Negosiasi Harga Vendor & 4 Skenario Retur Barang Vendor:
 * 1. Negosiasi Normal (Customer Rp280k -> Dzaki Rp270k, Crocs Rp10k)
 * 2. Negosiasi Rp270k (Ditolak: Di bawah batas minimum kesepakatan)
 * 3. Negosiasi Di Bawah Rp270k (Ditolak: Di bawah hak pokok vendor)
 * 4. Pembayaran Lebih Tinggi (Customer Rp290k -> Dzaki Rp270k, Crocs Rp20k)
 * 5. Retur Sebelum Vendor Dibayar (UNPAID -> Kewajiban Dibatalkan)
 * 6. Retur Setelah Vendor Dibayar Penuh (PAID -> Terbentuk Piutang Vendor / OVERPAID_CLAIM)
 * 7. Retur Setelah Vendor Dibayar Sebagian (PARTIAL -> Terbentuk Piutang Vendor)
 * 8. Retur Sebagian dari Transaksi Multi-Item (Hanya item yang diretur yang dipotong)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
    return date.toISOString().replace(/[-:T]/g, '').slice(0, 15);
  }
};

// Load code files
const dbHelperCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'DatabaseHelper.gs'), 'utf8');
const initDbCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'InitDatabase.gs'), 'utf8');
const authCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'AuthService.gs'), 'utf8');
const invCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'InventoryService.gs'), 'utf8');
const salesCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'SalesService.gs'), 'utf8');
const poCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'POService.gs'), 'utf8');

(new Function(dbHelperCode + '\nglobal.DatabaseHelper = DatabaseHelper;'))();
(new Function(initDbCode + '\nglobal.initializeCrocsCircleDatabase = initializeCrocsCircleDatabase; global.CROCS_SCHEMA_V120 = CROCS_SCHEMA_V120;'))();
(new Function(authCode + '\nglobal.AuthService = AuthService;'))();
(new Function(invCode + '\nglobal.InventoryService = InventoryService;'))();
(new Function(salesCode + '\nglobal.SalesService = SalesService;'))();
(new Function(poCode + '\nglobal.POService = POService;'))();

// Initialize Database
initializeCrocsCircleDatabase();

const testResults = [];
function runTest(name, fn) {
  try {
    fn();
    testResults.push({ name: name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    testResults.push({ name: name, passed: false, error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log("=== MEMULAI TEST SUITE FINAL REVIEW PHASE 2C ===\n");

const VAR_DZAKI = "VAR-TEST-DZAKI-M8";

// Masukkan stok konsinyasi Dzaki: 10 pasang
InventoryService.receiveConsignmentStock("VND-DZAKI", VAR_DZAKI, 10, "Stok Uji Dzaki", "TESTER");

// --- AREA 1: NEGOSIASI HARGA VENDOR ---

// Skenario 1: Customer membayar normal Rp280.000
runTest("1. Vendor Negosiasi: Customer Bayar Normal Rp280.000 (Dzaki Rp270k, Crocs Rp10k)", () => {
  const res = SalesService.createSale({
    customer_name: "Customer Normal",
    items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });

  if (!res.success) throw new Error("Penjualan normal harus sukses");
  const d = res.details[0];
  if (d.vendor_payable_unit !== 270000) throw new Error("Hak Dzaki harus 270.000");
  if (d.crocs_incentive_unit !== 10000) throw new Error("Insentif Crocs harus 10.000");
  if (res.header.gross_customer_payment !== 280000) throw new Error("Gross payment harus 280.000");
  if (res.header.vendor_incentive_amount !== 10000) throw new Error("Vendor incentive amount harus 10.000");
});

// Skenario 2: Customer menawar menjadi Rp270.000 (Ditolak)
runTest("2. Vendor Negosiasi: Customer Menawar Rp270.000 (Ditolak Karena Di Bawah Floor Rp280k)", () => {
  let blocked = false;
  try {
    SalesService.createSale({
      customer_name: "Customer Nawar 270k",
      items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 270000 }]
    });
  } catch (err) {
    if (err.message.includes("berada di bawah batas minimum kesepakatan vendor")) {
      blocked = true;
    }
  }

  if (!blocked) throw new Error("Penawaran Rp270.000 harusnya DITOLAK oleh sistem!");
});

// Skenario 3: Customer menawar di bawah Rp270.000 (misal Rp250.000) (Ditolak)
runTest("3. Vendor Negosiasi: Customer Menawar Rp250.000 (Ditolak Karena Di Bawah Hak Pokok Rp270k)", () => {
  let blocked = false;
  try {
    SalesService.createSale({
      customer_name: "Customer Nawar 250k",
      items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 250000 }]
    });
  } catch (err) {
    if (err.message.includes("lebih rendah dari hak pokok vendor")) {
      blocked = true;
    }
  }

  if (!blocked) throw new Error("Penawaran Rp250.000 harusnya DITOLAK oleh sistem!");
});

// Skenario 4: Customer membayar lebih tinggi Rp290.000 (Dzaki tetap Rp270k, Crocs Rp20k)
runTest("4. Vendor Negosiasi: Customer Bayar Lebih Tinggi Rp290.000 (Dzaki Rp270k, Crocs Rp20k)", () => {
  const res = SalesService.createSale({
    customer_name: "Customer Bayar 290k",
    items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 290000 }]
  });

  if (!res.success) throw new Error("Penjualan Rp290.000 harus sukses");
  const d = res.details[0];
  if (d.vendor_payable_unit !== 270000) throw new Error("Hak Dzaki harus tetap Rp270.000");
  if (d.crocs_incentive_unit !== 20000) throw new Error("Insentif CrocsCircle harus bertambah menjadi Rp20.000 (290k - 270k)");
  if (res.header.vendor_incentive_amount !== 20000) throw new Error("Total insentif header harus 20.000");
});

// --- AREA 2: RETUR BARANG VENDOR ---

// Skenario 5: Retur Sebelum Vendor Dibayar (UNPAID -> CANCELLED)
runTest("5. Retur Vendor: Sebelum Vendor Dibayar (UNPAID -> Kewajiban Dibatalkan)", () => {
  // Buat penjualan 1 pasang konsinyasi seharga Rp280.000
  const sale = SalesService.createSale({
    customer_name: "Customer Retur Unpaid",
    items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const detail = sale.details[0];
  if (detail.settlement_status !== "UNPAID") throw new Error("Status awal harus UNPAID");

  // Retur barang
  const ret = SalesService.returnSaleItem(sale.salesId, detail.sales_detail_id, 1, "Cacat produk", "TESTER");
  if (!ret.success) throw new Error("Retur gagal");

  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detail.sales_detail_id);
  if (detailAfter.vendor_remaining_payable !== 0) throw new Error("Sisa hutang vendor harus 0");
  if (detailAfter.settlement_status !== "CANCELLED") throw new Error("Status harus CANCELLED");
});

// Skenario 6: Retur Setelah Vendor Dibayar Penuh (PAID -> Terbentuk Piutang Vendor / OVERPAID_CLAIM)
runTest("6. Retur Vendor: Setelah Vendor Dibayar Penuh (PAID -> Terbentuk Piutang Vendor -Rp270k)", () => {
  // Buat penjualan 1 pasang konsinyasi
  const sale = SalesService.createSale({
    customer_name: "Customer Retur Paid",
    items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const detail = sale.details[0];

  // Simulasikan vendor sudah dibayar penuh (settlement sudah ditransfer ke Dzaki sebesar Rp270.000)
  DatabaseHelper.updateRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detail.sales_detail_id, {
    vendor_paid_amount: 270000,
    vendor_remaining_payable: 0,
    settlement_status: "PAID"
  });

  // Customer mengembalikan sepatu (Retur setelah dibayar)
  const ret = SalesService.returnSaleItem(sale.salesId, detail.sales_detail_id, 1, "Retur barang setelah lunas ke vendor", "TESTER");
  if (!ret.success) throw new Error("Retur gagal");

  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detail.sales_detail_id);
  // Total kewajiban menjadi 0, tetapi karena sudah terlanjur dibayar Rp270.000, remaining payable menjadi -270.000!
  if (detailAfter.total_vendor_payable !== 0) throw new Error("Total payable harus menjadi 0");
  if (detailAfter.vendor_remaining_payable !== -270000) {
    throw new Error(`Remaining payable harus -270.000 (Piutang Vendor), tercatat ${detailAfter.vendor_remaining_payable}`);
  }
  if (detailAfter.settlement_status !== "OVERPAID_CLAIM") {
    throw new Error(`Status harus OVERPAID_CLAIM, tercatat ${detailAfter.settlement_status}`);
  }
});

// Skenario 7: Retur Setelah Vendor Dibayar Sebagian (PARTIAL -> Terbentuk Piutang Sebesar Nilai Yang Terlanjur Dibayar)
runTest("7. Retur Vendor: Setelah Vendor Dibayar Sebagian (PARTIAL -> Terbentuk Piutang Sebesar Nilai Terbayar)", () => {
  // Buat penjualan 1 pasang konsinyasi (hutang 270k)
  const sale = SalesService.createSale({
    customer_name: "Customer Retur Partial",
    items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const detail = sale.details[0];

  // Simulasikan pembayaran sebagian (baru ditransfer Rp150.000 ke Dzaki, sisa hutang Rp120.000)
  DatabaseHelper.updateRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detail.sales_detail_id, {
    vendor_paid_amount: 150000,
    vendor_remaining_payable: 120000,
    settlement_status: "PARTIAL"
  });

  // Retur sepatu
  const ret = SalesService.returnSaleItem(sale.salesId, detail.sales_detail_id, 1, "Retur saat status partial", "TESTER");
  if (!ret.success) throw new Error("Retur gagal");

  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detail.sales_detail_id);
  // Hutang sisa Rp120k dibatalkan, dan Rp150k yang sudah ditransfer menjadi piutang (-150.000)
  if (detailAfter.vendor_remaining_payable !== -150000) {
    throw new Error(`Remaining payable harus -150.000, tercatat ${detailAfter.vendor_remaining_payable}`);
  }
  if (detailAfter.settlement_status !== "OVERPAID_CLAIM") {
    throw new Error("Status harus OVERPAID_CLAIM");
  }
});

// Skenario 8: Retur Sebagian dari Transaksi Multi-Item (Hanya Item Yang Diretur Yang Dipotong)
runTest("8. Retur Sebagian dari Transaksi Multi-Item (Item Lain Tidak Terpengaruh)", () => {
  // Customer membeli 3 pasang barang konsinyasi Dzaki seharga 3 * 280.000 = 840.000 (total hutang ke Dzaki = 810.000)
  const sale = SalesService.createSale({
    customer_name: "Customer 3 Pasang",
    items: [{ variant_id: VAR_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 3, actual_price: 280000 }]
  });
  const detail = sale.details[0];

  // Customer hanya meretur 1 pasang (2 pasang tetap dibeli)
  const ret = SalesService.returnSaleItem(sale.salesId, detail.sales_detail_id, 1, "Retur 1 pasang saja", "TESTER");
  if (!ret.success) throw new Error("Retur 1 pasang gagal");

  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detail.sales_detail_id);
  // Total hutang harus berkurang 1 * 270k = dari 810k menjadi 540k!
  if (detailAfter.total_vendor_payable !== 540000) {
    throw new Error(`Total vendor payable harus menjadi 540.000, tercatat ${detailAfter.total_vendor_payable}`);
  }
  if (detailAfter.vendor_remaining_payable !== 540000) {
    throw new Error(`Remaining payable harus 540.000, tercatat ${detailAfter.vendor_remaining_payable}`);
  }
  if (detailAfter.settlement_status !== "UNPAID") {
    throw new Error("Status settlement harus tetap UNPAID untuk sisa 2 pasang");
  }
});

console.log("\n=== HASIL REKAPITULASI PENGUJIAN FINAL REVIEW PHASE 2C ===");
const passedCount = testResults.filter(r => r.passed).length;
console.log(`Total Pengujian : ${testResults.length}`);
console.log(`Berhasil        : ${passedCount}`);
console.log(`Gagal           : ${testResults.length - passedCount}`);

if (passedCount === testResults.length) {
  console.log("\nSEMUA PENGUJIAN FINAL REVIEW PHASE 2C BERHASIL 100%!");
} else {
  console.error("\nBEBERAPA PENGUJIAN GAGAL.");
  process.exit(1);
}
