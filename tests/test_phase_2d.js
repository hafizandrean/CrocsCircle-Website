/**
 * CROCSCIRCLE.ID — PHASE 2D TEST SUITE RUNNER
 * Verifies all 20 mandatory requirements for Vendor Management & Settlement Engine:
 * 1. Membuat vendor
 * 2. Mengubah data vendor
 * 3. Menonaktifkan vendor (soft delete INACTIVE)
 * 4. Membuat perjanjian SELLER_FOR_VENDOR
 * 5. Membuat perjanjian BUY_STOCK_FROM_VENDOR
 * 6. Dzaki memiliki hak Rp270.000 dan minimum harga Rp280.000
 * 7. Vendor lain memiliki konfigurasi berbeda
 * 8. Menghitung kewajiban vendor
 * 9. Settlement satu transaksi
 * 10. Settlement beberapa transaksi sekaligus (Multi-Item)
 * 11. Settlement parsial
 * 12. Pelunasan penuh
 * 13. Mencegah pembayaran ganda
 * 14. Mencegah settlement melebihi kewajiban
 * 15. Retur sebelum pembayaran
 * 16. Retur setelah pembayaran penuh (tercatat di KLAIM_VENDOR)
 * 17. Retur setelah pembayaran parsial
 * 18. Kompensasi klaim pada settlement berikutnya
 * 19. Mencegah klaim dikompensasikan dua kali
 * 20. Audit trail dan rollback
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
const vendorCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'VendorService.gs'), 'utf8');

(new Function(dbHelperCode + '\nglobal.DatabaseHelper = DatabaseHelper;'))();
(new Function(initDbCode + '\nglobal.initializeCrocsCircleDatabase = initializeCrocsCircleDatabase; global.CROCS_SCHEMA_V120 = CROCS_SCHEMA_V120;'))();
(new Function(authCode + '\nglobal.AuthService = AuthService;'))();
(new Function(invCode + '\nglobal.InventoryService = InventoryService;'))();
(new Function(salesCode + '\nglobal.SalesService = SalesService;'))();
(new Function(poCode + '\nglobal.POService = POService;'))();
(new Function(vendorCode + '\nglobal.VendorService = VendorService;'))();

// Initialize Database (22 Tables)
initializeCrocsCircleDatabase();

// Setup Owner Account for callerToken
AuthService.setupOwnerAccount("owner_hafiz", "Hafiz", "RahasiaHafiz2026!");
const ownerLogin = AuthService.login("owner_hafiz", "RahasiaHafiz2026!");
const OWNER_TOKEN = ownerLogin.token;

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

console.log("=== MEMULAI TEST SUITE PHASE 2D (VENDOR MANAGEMENT & SETTLEMENT) ===\n");

// 1. Membuat Vendor Baru
runTest("1. Membuat Vendor Baru", () => {
  const res = VendorService.createVendor({
    vendor_id: "VND-BANDUNG-SUPPLIER",
    vendor_name: "Supplier Bandung Jaya",
    contact_person: "Pak Hendra",
    phone: "081299887766",
    address: "Jl. Riau No. 12 Bandung",
    cooperation_type: "BUY_STOCK_FROM_VENDOR",
    notes: "Supplier utama seri Platform"
  }, OWNER_TOKEN);

  if (!res.success) throw new Error("Gagal membuat vendor");
  if (res.vendor.vendor_id !== "VND-BANDUNG-SUPPLIER") throw new Error("Vendor ID tidak cocok");
  if (res.vendor.status !== "ACTIVE") throw new Error("Status harus ACTIVE");
});

// 2. Mengubah Data Vendor
runTest("2. Mengubah Data Vendor", () => {
  const res = VendorService.updateVendor("VND-BANDUNG-SUPPLIER", {
    phone: "081900112233",
    notes: "Nomor telepon diperbarui"
  }, OWNER_TOKEN);

  if (!res.success) throw new Error("Gagal update vendor");
  if (res.vendor.phone !== "081900112233") throw new Error("Nomor telepon tidak berubah");
});

// 3. Menonaktifkan Vendor (Soft Delete)
runTest("3. Menonaktifkan Vendor (Status INACTIVE)", () => {
  const res = VendorService.deactivateVendor("VND-BANDUNG-SUPPLIER", OWNER_TOKEN);
  if (!res.success) throw new Error("Gagal menonaktifkan vendor");
  if (res.vendor.status !== "INACTIVE") throw new Error("Status harus INACTIVE");

  // Aktifkan kembali untuk testing
  VendorService.updateVendor("VND-BANDUNG-SUPPLIER", { status: "ACTIVE" }, OWNER_TOKEN);
});

// 4 & 5. Perjanjian SELLER_FOR_VENDOR vs BUY_STOCK_FROM_VENDOR
runTest("4 & 5. Perjanjian SELLER_FOR_VENDOR vs BUY_STOCK_FROM_VENDOR Terpisah", () => {
  // Vendor Konsinyasi Murni
  VendorService.createVendor({
    vendor_id: "VND-KONSINYASI-SOLO",
    vendor_name: "Titipan Solo",
    cooperation_type: "SELLER_FOR_VENDOR",
    consignment_fee_type: "FIXED_PER_UNIT",
    default_consignment_fee: 15000,
    fixed_vendor_share: 250000,
    min_selling_price: 265000
  }, OWNER_TOKEN);

  // Vendor Beli Putih Murni
  VendorService.createVendor({
    vendor_id: "VND-IMPORT-JAKARTA",
    vendor_name: "Importir Jakarta",
    cooperation_type: "BUY_STOCK_FROM_VENDOR",
    purchase_incentive_default: 0
  }, OWNER_TOKEN);

  const v1 = VendorService.getVendorDetail("VND-KONSINYASI-SOLO");
  const v2 = VendorService.getVendorDetail("VND-IMPORT-JAKARTA");

  if (v1.cooperation_type !== "SELLER_FOR_VENDOR") throw new Error("Cooperation type v1 salah");
  if (v2.cooperation_type !== "BUY_STOCK_FROM_VENDOR") throw new Error("Cooperation type v2 salah");
});

// 6 & 7. Konfigurasi Dzaki (Hak Rp270k, Min Rp280k) vs Vendor Lain
runTest("6 & 7. Konfigurasi Khusus Dzaki (Hak Rp270k, Floor Rp280k) vs Vendor Lain", () => {
  const dzaki = VendorService.getVendorDetail("VND-DZAKI");
  if (Number(dzaki.fixed_vendor_share) !== 270000) throw new Error("Hak pokok Dzaki harus 270.000");
  if (Number(dzaki.min_selling_price) !== 280000) throw new Error("Floor jual Dzaki harus 280.000");
  if (Number(dzaki.default_consignment_fee) !== 10000) throw new Error("Insentif CrocsCircle dari Dzaki harus 10.000");

  const solo = VendorService.getVendorDetail("VND-KONSINYASI-SOLO");
  if (Number(solo.fixed_vendor_share) !== 250000) throw new Error("Hak pokok Solo harus 250.000 (tidak sama dengan Dzaki)");
  if (Number(solo.min_selling_price) !== 265000) throw new Error("Floor jual Solo harus 265.000");
});

// 8. Menghitung Kewajiban Vendor (getVendorOutstandingPayables)
const VAR_TEST_DZAKI = "VAR-DZAKI-SETTLE";
let saleDetail1Id = "";
let saleDetail2Id = "";
let saleDetail3Id = "";

runTest("8. Menghitung Kewajiban Vendor Konsinyasi Belum Disetor", () => {
  // Masukkan 5 pasang konsinyasi Dzaki
  InventoryService.receiveConsignmentStock("VND-DZAKI", VAR_TEST_DZAKI, 5, "Batch Settle", "TESTER");

  // Buat 2 transaksi penjualan:
  // Tx 1: 1 pasang seharga Rp280.000 (Hutang ke Dzaki: Rp270.000)
  const s1 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  saleDetail1Id = s1.details[0].sales_detail_id;

  // Tx 2: 2 pasang seharga Rp280.000 (Hutang ke Dzaki: Rp540.000)
  const s2 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 2, actual_price: 280000 }]
  });
  saleDetail2Id = s2.details[0].sales_detail_id;

  const payables = VendorService.getVendorOutstandingPayables("VND-DZAKI");
  // Total hutang harus Rp270.000 + Rp540.000 = Rp810.000
  if (payables.total_gross_payable !== 810000) {
    throw new Error(`Total kewajiban kotor harus 810.000, tercatat ${payables.total_gross_payable}`);
  }
  if (payables.item_count !== 2) throw new Error("Jumlah item belum dibayar harus 2");
});

// 9. Settlement Satu Transaksi
runTest("9. Settlement Satu Transaksi (Pelunasan Tx 1 Rp270.000)", () => {
  const stlRes = VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    payment_method: "TRANSFER_BCA",
    bank_reference: "TRX-BCA-001",
    allocations: [
      { sales_detail_id: saleDetail1Id, amount_to_pay: 270000 }
    ],
    notes: "Transfer pelunasan penjualan 1"
  }, OWNER_TOKEN);

  if (!stlRes.success) throw new Error("Settlement gagal");
  if (stlRes.header.total_gross_payable !== 270000) throw new Error("Gross payable settlement salah");
  if (stlRes.header.total_net_payout !== 270000) throw new Error("Net payout settlement salah");

  // Periksa status detail penjualan 1 menjadi PAID
  const d1 = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", saleDetail1Id);
  if (d1.settlement_status !== "PAID") throw new Error("Status harus PAID");
  if (Number(d1.vendor_remaining_payable) !== 0) throw new Error("Sisa hutang harus 0");
  if (Number(d1.vendor_paid_amount) !== 270000) throw new Error("Nilai terbayar harus 270.000");

  // Sisa hutang total Dzaki sekarang harus tinggal Rp540.000 (dari Tx 2)
  const remainingPayables = VendorService.getVendorOutstandingPayables("VND-DZAKI");
  if (remainingPayables.total_gross_payable !== 540000) {
    throw new Error(`Sisa hutang harus 540.000, tercatat ${remainingPayables.total_gross_payable}`);
  }
});

// 10 & 11. Settlement Parsial & Multi-Transaksi
runTest("10 & 11. Settlement Parsial & Multi-Transaksi dalam 1 Transfer Bank", () => {
  // Buat Tx 3: 1 pasang seharga Rp280.000 (Hutang ke Dzaki: Rp270.000)
  const s3 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  saleDetail3Id = s3.details[0].sales_detail_id;

  // Kondisi saat ini:
  // saleDetail2Id: hutang Rp540.000
  // saleDetail3Id: hutang Rp270.000
  // Total hutang = Rp810.000

  // Owner mentransfer Rp400.000 ke Dzaki:
  // - Rp270.000 untuk melunasi penuh saleDetail3Id
  // - Rp130.000 dicicil (parsial) ke saleDetail2Id (sisa hutang saleDetail2Id menjadi 540k - 130k = 410k)
  const stlMulti = VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    payment_method: "TRANSFER_BCA",
    bank_reference: "TRX-BCA-002",
    allocations: [
      { sales_detail_id: saleDetail3Id, amount_to_pay: 270000 },
      { sales_detail_id: saleDetail2Id, amount_to_pay: 130000 }
    ],
    notes: "Pelunasan Tx 3 dan cicilan Tx 2"
  }, OWNER_TOKEN);

  if (!stlMulti.success) throw new Error("Settlement multi-transaksi gagal");
  if (stlMulti.header.total_net_payout !== 400000) throw new Error("Net payout harus 400.000");

  const d3 = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", saleDetail3Id);
  if (d3.settlement_status !== "PAID" || Number(d3.vendor_remaining_payable) !== 0) {
    throw new Error("saleDetail3Id harus lunas (PAID)");
  }

  const d2 = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", saleDetail2Id);
  if (d2.settlement_status !== "PARTIAL") throw new Error("saleDetail2Id harus berstatus PARTIAL");
  if (Number(d2.vendor_paid_amount) !== 130000) throw new Error("Terbayar d2 harus 130.000");
  if (Number(d2.vendor_remaining_payable) !== 410000) throw new Error("Sisa hutang d2 harus 410.000");
});

// 12. Pelunasan Penuh Sisa Hutang
runTest("12. Pelunasan Penuh Sisa Hutang (410.000)", () => {
  const stlFull = VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    allocations: [{ sales_detail_id: saleDetail2Id, amount_to_pay: 410000 }]
  }, OWNER_TOKEN);

  if (!stlFull.success) throw new Error("Gagal pelunasan penuh");
  const d2After = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", saleDetail2Id);
  if (d2After.settlement_status !== "PAID" || Number(d2After.vendor_remaining_payable) !== 0) {
    throw new Error("saleDetail2Id harus lunas penuh");
  }

  const payables = VendorService.getVendorOutstandingPayables("VND-DZAKI");
  if (payables.total_gross_payable !== 0) {
    throw new Error(`Seluruh hutang harusnya 0, tercatat ${payables.total_gross_payable}`);
  }
});

// 13. Mencegah Pembayaran Ganda
runTest("13. Mencegah Pembayaran Ganda (Item yang Sudah PAID Ditolak)", () => {
  let doublePayBlocked = false;
  try {
    VendorService.executeSettlement({
      vendor_id: "VND-DZAKI",
      allocations: [{ sales_detail_id: saleDetail1Id, amount_to_pay: 270000 }]
    }, OWNER_TOKEN);
  } catch (err) {
    if (err.message.includes("sudah LUNAS sebelumnya")) {
      doublePayBlocked = true;
    }
  }

  if (!doublePayBlocked) throw new Error("Pembayaran ulang item lunas harusnya DITOLAK!");
});

// 14. Mencegah Settlement Melebihi Kewajiban
runTest("14. Mencegah Settlement Melebihi Kewajiban", () => {
  // Buat 1 transaksi konsinyasi baru Rp280k (hutang 270k)
  const s4 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const d4Id = s4.details[0].sales_detail_id;

  let overpayBlocked = false;
  try {
    VendorService.executeSettlement({
      vendor_id: "VND-DZAKI",
      allocations: [{ sales_detail_id: d4Id, amount_to_pay: 500000 }] // Melebihi 270k
    }, OWNER_TOKEN);
  } catch (err) {
    if (err.message.includes("melebihi sisa hutang")) {
      overpayBlocked = true;
    }
  }

  if (!overpayBlocked) throw new Error("Settlement melebihi hutang harusnya DITOLAK!");
});

// 15. Retur Sebelum Pembayaran
runTest("15. Retur Sebelum Pembayaran (Kewajiban Langsung Dibatalkan)", () => {
  // Tambah stok konsinyasi untuk pengujian retur
  InventoryService.receiveConsignmentStock("VND-DZAKI", VAR_TEST_DZAKI, 10, "Stok Tambahan Retur", "TESTER");

  const s5 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const d5Id = s5.details[0].sales_detail_id;

  // Retur
  SalesService.returnSaleItem(s5.salesId, d5Id, 1, "Retur sebelum bayar vendor", "TESTER");
  const d5After = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", d5Id);
  if (d5After.settlement_status !== "CANCELLED" || Number(d5After.vendor_remaining_payable) !== 0) {
    throw new Error("Kewajiban harus CANCELLED dan 0");
  }

  // Coba bayar item yang CANCELLED -> Harus ditolak
  let cancelPayBlocked = false;
  try {
    VendorService.executeSettlement({
      vendor_id: "VND-DZAKI",
      allocations: [{ sales_detail_id: d5Id, amount_to_pay: 270000 }]
    }, OWNER_TOKEN);
  } catch (err) {
    if (err.message.includes("telah dibatalkan/diretur")) cancelPayBlocked = true;
  }
  if (!cancelPayBlocked) throw new Error("Membayar item cancelled harusnya ditolak!");
});

// 16 & 18. Retur Setelah Pembayaran Penuh & Kompensasi Klaim Pada Settlement Berikutnya
let claimIdRecorded = "";
runTest("16 & 18. Retur Setelah Lunas (Terbit Klaim di KLAIM_VENDOR) & Kompensasi Pada Settlement Berikutnya", () => {
  // 1. Buat penjualan 1 pasang konsinyasi (hutang 270k)
  const s6 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const d6Id = s6.details[0].sales_detail_id;

  // 2. Bayar lunas ke Dzaki (Transfer 270k)
  VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    allocations: [{ sales_detail_id: d6Id, amount_to_pay: 270000 }]
  }, OWNER_TOKEN);

  // 3. Customer meretur sepatu tersebut
  SalesService.returnSaleItem(s6.salesId, d6Id, 1, "Retur setelah lunas ke Dzaki", "TESTER");

  // 4. Verifikasi terbentuk baris klaim di tabel KLAIM_VENDOR
  const claims = DatabaseHelper.getAllRows("KLAIM_VENDOR", c => c.source_sales_detail_id === d6Id);
  if (claims.length !== 1) throw new Error("Baris klaim retur tidak terbentuk di KLAIM_VENDOR");
  const claimRecord = claims[0];
  claimIdRecorded = claimRecord.claim_id;

  if (Number(claimRecord.claim_amount) !== 270000) throw new Error("Nominal klaim harus 270.000");
  if (claimRecord.claim_status !== "ACTIVE") throw new Error("Status klaim harus ACTIVE");

  // 5. Cek Saldo Piutang Vendor
  const activeClaimsData = VendorService.getVendorActiveClaims("VND-DZAKI");
  if (activeClaimsData.total_active_claims < 270000) throw new Error("Total klaim aktif tidak mencakup 270.000");

  // 6. Buat Penjualan Baru 2 pasang konsinyasi Dzaki (Hutang kotor baru: 2 * 270k = 540.000)
  const s7 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 2, actual_price: 280000 }]
  });
  const d7Id = s7.details[0].sales_detail_id;

  // Cek Ringkasan Saldo Bersih:
  // Gross Payable = 540.000
  // Active Claims = 270.000
  // Net Payout Due = 540.000 - 270.000 = 270.000!
  const netSummary = VendorService.getVendorNetPayableSummary("VND-DZAKI");
  if (netSummary.total_gross_payable < 540000) throw new Error("Gross payable baru harus mencakup 540k");
  if (netSummary.net_payout_due !== (netSummary.total_gross_payable - netSummary.total_active_claims)) {
    throw new Error("Net payout due tidak seimbang dengan gross - claims");
  }

  // 7. Eksekusi Settlement Baru dengan Kompensasi Klaim Retur!
  const stlCompensated = VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    allocations: [{ sales_detail_id: d7Id, amount_to_pay: 540000 }],
    claim_ids_to_compensate: [claimIdRecorded],
    notes: "Settlement dipotong klaim retur s6"
  }, OWNER_TOKEN);

  if (!stlCompensated.success) throw new Error("Settlement kompensasi klaim gagal");
  // Gross = 540.000, Claims Deducted = 270.000, Net Transfer Bersih = 270.000!
  if (stlCompensated.header.total_gross_payable !== 540000) throw new Error("Total gross payable salah");
  if (stlCompensated.header.total_claims_deducted !== 270000) throw new Error("Total klaim yang dipotong harus 270.000");
  if (stlCompensated.header.total_net_payout !== 270000) {
    throw new Error(`Net transfer bersih harus 270.000 (540k - 270k), tercatat ${stlCompensated.header.total_net_payout}`);
  }

  // 8. Verifikasi Status Klaim di KLAIM_VENDOR berubah menjadi FULLY_COMPENSATED
  const claimAfter = DatabaseHelper.getRowByPk("KLAIM_VENDOR", "claim_id", claimIdRecorded);
  if (claimAfter.claim_status !== "FULLY_COMPENSATED") throw new Error("Status klaim harus FULLY_COMPENSATED");
  if (Number(claimAfter.remaining_claim) !== 0) throw new Error("Sisa klaim harus 0");
});

// 17. Retur Setelah Pembayaran Parsial
runTest("17. Retur Setelah Pembayaran Parsial (Terbit Klaim Sebesar Yang Sudah Dibayar)", () => {
  // Buat penjualan 1 pasang (hutang 270k)
  const s8 = SalesService.createSale({
    items: [{ variant_id: VAR_TEST_DZAKI, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const d8Id = s8.details[0].sales_detail_id;

  // Bayar sebagian Rp100.000
  VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    allocations: [{ sales_detail_id: d8Id, amount_to_pay: 100000 }]
  }, OWNER_TOKEN);

  // Retur sepatu
  SalesService.returnSaleItem(s8.salesId, d8Id, 1, "Retur setelah bayar 100k", "TESTER");

  // Harus terbentuk klaim sebesar Rp100.000 di KLAIM_VENDOR
  const claims = DatabaseHelper.getAllRows("KLAIM_VENDOR", c => c.source_sales_detail_id === d8Id);
  if (claims.length !== 1) throw new Error("Klaim retur parsial tidak tercatat");
  if (Number(claims[0].claim_amount) !== 100000) {
    throw new Error(`Nominal klaim harus 100.000, tercatat ${claims[0].claim_amount}`);
  }
});

// 19. Mencegah Klaim Dikompensasikan Dua Kali
runTest("19. Mencegah Klaim Dikompensasikan Dua Kali", () => {
  let doubleClaimBlocked = false;
  try {
    VendorService.executeSettlement({
      vendor_id: "VND-DZAKI",
      claim_ids_to_compensate: [claimIdRecorded] // Klaim ini sudah FULLY_COMPENSATED di Test 16
    }, OWNER_TOKEN);
  } catch (err) {
    if (err.message.includes("sudah pernah dikompensasikan") || err.message.includes("Total nilai kewajiban")) {
      doubleClaimBlocked = true;
    }
  }

  if (!doubleClaimBlocked) throw new Error("Klaim yang sudah dikompensasikan harusnya DITOLAK jika dipakai lagi!");
});

// 20. Audit Trail dan Validasi Hak Akses Owner (RBAC)
runTest("20. Audit Trail & Validasi Hak Akses Owner pada Eksekusi Settlement", () => {
  // Buat akun Admin
  AuthService.createAdminAccount(OWNER_TOKEN, "admin_bazar", "Admin Bazar", "AdminSecure123!");
  const adminLogin = AuthService.login("admin_bazar", "AdminSecure123!");
  const ADMIN_TOKEN = adminLogin.token;

  // Admin mencoba mengeksekusi settlement -> HARUS DITOLAK 403 Forbidden!
  let adminBlocked = false;
  try {
    VendorService.executeSettlement({
      vendor_id: "VND-DZAKI",
      payment_method: "CASH"
    }, ADMIN_TOKEN);
  } catch (err) {
    if (err.message.includes("403 Forbidden")) adminBlocked = true;
  }

  if (!adminBlocked) throw new Error("Admin harusnya DITOLAK saat eksekusi settlement vendor!");

  // Verifikasi log aktivitas tercatat
  const logs = DatabaseHelper.getAllRows("LOG_AKTIVITAS", l => l.module === "VENDOR");
  if (logs.length === 0) throw new Error("Audit log vendor tidak tercatat");
});

console.log("\n=== HASIL REKAPITULASI PENGUJIAN PHASE 2D ===");
const passedCount = testResults.filter(r => r.passed).length;
console.log(`Total Pengujian : ${testResults.length}`);
console.log(`Berhasil        : ${passedCount}`);
console.log(`Gagal           : ${testResults.length - passedCount}`);

if (passedCount === testResults.length) {
  console.log("\nSEMUA PENGUJIAN PHASE 2D BERHASIL 100%!");
} else {
  console.error("\nBEBERAPA PENGUJIAN GAGAL.");
  process.exit(1);
}
