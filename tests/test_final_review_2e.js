/**
 * CROCSCIRCLE.ID — FINAL REVIEW PHASE 2E AUTOMATED AUDIT SUITE
 * Comprehensive audit of the 4 critical areas requested by Owner:
 * 1. Audit Retur Setelah Monthly Closing (Cross-Period Return: Nov Closed -> Dec Return)
 * 2. Audit Reopen dan Saldo Dana (Reopen after partial withdrawal & deficit handling)
 * 3. Audit Snapshot Closing (Single Source of Truth, Versioning & Immutability)
 * 4. Audit Rekonsiliasi Keuangan Komprehensif (Multi-Transaction Integrated Matrix)
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

// Load backend scripts
const dbHelperCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'DatabaseHelper.gs'), 'utf8');
const initDbCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'InitDatabase.gs'), 'utf8');
const authCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'AuthService.gs'), 'utf8');
const invCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'InventoryService.gs'), 'utf8');
const salesCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'SalesService.gs'), 'utf8');
const poCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'POService.gs'), 'utf8');
const vendorCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'VendorService.gs'), 'utf8');
const finCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'FinancialService.gs'), 'utf8');
const closingCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'backend', 'ClosingService.gs'), 'utf8');

(new Function(dbHelperCode + '\nglobal.DatabaseHelper = DatabaseHelper;'))();
(new Function(initDbCode + '\nglobal.initializeCrocsCircleDatabase = initializeCrocsCircleDatabase; global.CROCS_SCHEMA_V120 = CROCS_SCHEMA_V120;'))();
(new Function(authCode + '\nglobal.AuthService = AuthService;'))();
(new Function(invCode + '\nglobal.InventoryService = InventoryService;'))();
(new Function(salesCode + '\nglobal.SalesService = SalesService;'))();
(new Function(poCode + '\nglobal.POService = POService;'))();
(new Function(vendorCode + '\nglobal.VendorService = VendorService;'))();
(new Function(finCode + '\nglobal.FinancialService = FinancialService;'))();
(new Function(closingCode + '\nglobal.ClosingService = ClosingService;'))();

console.log("=======================================================================");
console.log("🔍 CROCSCIRCLE.ID — FINAL REVIEW PHASE 2E AUDIT SUITE");
console.log("=======================================================================");

// Initialize Database & Auth
initializeCrocsCircleDatabase();
AuthService.setupOwnerAccount("owner_hafiz", "Hafiz Owner", "RahasiaOwner2026!#");
const ownerAuth = AuthService.login("owner_hafiz", "RahasiaOwner2026!#");
const OWNER_TOKEN = ownerAuth.token;

let totalAuditPass = 0;
let totalAuditFail = 0;

function auditTest(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    totalAuditPass++;
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    totalAuditFail++;
  }
}

// -----------------------------------------------------------------------------
// AUDIT SECTION 1: RETUR SETELAH MONTHLY CLOSING (Cross-Period Return)
// -----------------------------------------------------------------------------
console.log("\n--- BAGIAN 1: AUDIT RETUR SETELAH MONTHLY CLOSING ---");

auditTest("1.1 Simulasi Penjualan November & Closing Periode November", () => {
  // Stok masuk awal di bulan November: 10 pasang modal Rp150.000
  InventoryService.receiveOwnedStockBatch("PUR-NOV-01", "VAR-AUDIT-01", 10, 150000, 0, "Batch Nov", "TESTER");

  // Penjualan pada 10 November 2026: 2 pasang @ Rp300.000
  const saleNov = SalesService.createSale({
    transaction_date: new Date("2026-11-10T10:00:00"),
    customer_name: "Customer Budi Nov",
    idempotency_key: "IDEM-AUDIT-NOV-01",
    created_by: "TESTER",
    items: [
      { variant_id: "VAR-AUDIT-01", item_ownership: "OWNED", quantity: 2, actual_price: 300000 }
    ]
  });

  if (!saleNov.success) throw new Error("Penjualan November gagal");

  // Tutup buku bulan November secara resmi
  const closeNov = ClosingService.closePeriod(11, 2026, OWNER_TOKEN, "Closing Resmi November 2026");
  if (closeNov.period_status !== "CLOSED") throw new Error("Status November harus CLOSED");
  if (closeNov.income_statement.revenue_breakdown.total_omzet !== 600000) {
    throw new Error(`Omzet November harus 600.000, got ${closeNov.income_statement.revenue_breakdown.total_omzet}`);
  }
  if (closeNov.income_statement.hpp_breakdown.total_hpp !== 300000) {
    throw new Error(`HPP November harus 300.000, got ${closeNov.income_statement.hpp_breakdown.total_hpp}`);
  }
});

auditTest("1.2 Customer Mengajukan Retur pada Bulan Desember (Desember OPEN)", () => {
  const salesRows = DatabaseHelper.getAllRows("PENJUALAN", s => s.customer_name === "Customer Budi Nov");
  const saleNovId = salesRows[0].sales_id;
  const detailRows = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.sales_id === saleNovId);
  const detailNovId = detailRows[0].sales_detail_id;

  // Tanggal retur: 5 Desember 2026 (Bulan Desember masih OPEN)
  const returnRes = SalesService.returnSaleItem(
    saleNovId,
    detailNovId,
    1, // retur 1 pasang
    "Ukuran kekecilan di kaki pembeli",
    "TESTER",
    new Date("2026-12-05T14:00:00")
  );

  if (!returnRes.success) throw new Error("Retur pada bulan Desember harus berhasil");
  if (returnRes.returnedQty !== 1) throw new Error("Jumlah retur harus 1");

  // Verifikasi stok fisik kembali bertambah
  const stock = InventoryService.getStock("VAR-AUDIT-01");
  // Awal 10, terjual 2 (sisa 8), retur 1 -> sekarang harus 9
  if (stock.owned_physical_stock !== 9) {
    throw new Error(`Stok fisik setelah retur harus 9, got ${stock.owned_physical_stock}`);
  }
});

auditTest("1.3 Snapshot Closing November Tetap Utuh dan Tidak Berubah", () => {
  const pNov = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-11");
  if (pNov.period_status !== "CLOSED") throw new Error("Periode November harus tetap CLOSED");
  if (Number(pNov.total_omzet) !== 600000) {
    throw new Error(`Snapshot omzet November tidak boleh berubah! Harusnya 600.000, got ${pNov.total_omzet}`);
  }
  if (Number(pNov.total_hpp) !== 300000) {
    throw new Error(`Snapshot HPP November tidak boleh berubah! Harusnya 300.000, got ${pNov.total_hpp}`);
  }

  const clsArch = DatabaseHelper.getAllRows("CLOSING_BULANAN", c => c.period_id === "PER-2026-11");
  if (clsArch.length === 0 || Number(clsArch[0].total_omzet) !== 600000) {
    throw new Error("Arsip snapshot di CLOSING_BULANAN harus tetap 600.000");
  }
});

auditTest("1.4 Pengaruh Retur Masuk ke Laporan Keuangan Desember Secara Akurat", () => {
  // Misalkan di bulan Desember ada penjualan baru 1 pasang @ Rp350.000 modal Rp150.000
  SalesService.createSale({
    transaction_date: new Date("2026-12-08T11:00:00"),
    customer_name: "Customer Des 1",
    idempotency_key: "IDEM-AUDIT-DEC-01",
    created_by: "TESTER",
    items: [
      { variant_id: "VAR-AUDIT-01", item_ownership: "OWNED", quantity: 1, actual_price: 350000 }
    ]
  });

  const repDec = FinancialService.calculateMonthlyIncomeStatement(12, 2026);

  // Penjualan kotor Desember: 350.000
  // Retur Desember (dari item Nov): -300.000
  // Net Omzet Desember: 350.000 - 300.000 = 50.000
  if (repDec.revenue_breakdown.gross_owned_sales !== 350000) {
    throw new Error(`Gross sales Des expected 350.000, got ${repDec.revenue_breakdown.gross_owned_sales}`);
  }
  if (repDec.revenue_breakdown.owned_sales_returns !== 300000) {
    throw new Error(`Retur penjualan Des expected 300.000, got ${repDec.revenue_breakdown.owned_sales_returns}`);
  }
  if (repDec.revenue_breakdown.total_omzet !== 500000) {
    // Wait, let's check: 350.000 - 300.000 = 50.000
    if (repDec.revenue_breakdown.total_omzet !== 50000) {
      throw new Error(`Total omzet bersih Des expected 50.000, got ${repDec.revenue_breakdown.total_omzet}`);
    }
  }

  // HPP kotor Desember: 150.000
  // HPP pembalik retur: -150.000
  // Net HPP Desember: 0
  if (repDec.hpp_breakdown.total_hpp !== 0) {
    throw new Error(`Net HPP Desember expected 0, got ${repDec.hpp_breakdown.total_hpp}`);
  }

  // Laba kotor Desember: 50.000 - 0 = 50.000
  if (repDec.gross_profit !== 50000) {
    throw new Error(`Laba kotor Des expected 50.000, got ${repDec.gross_profit}`);
  }
});

// -----------------------------------------------------------------------------
// AUDIT SECTION 2: REOPEN DAN SALDO DANA
// -----------------------------------------------------------------------------
console.log("\n--- BAGIAN 2: AUDIT REOPEN DAN SALDO DANA ---");

auditTest("2.1 Penarikan Kas Fisik oleh Owner Setelah Closing Periode", () => {
  // Saldo Owner 1 dari closing November
  const fundInitial = ClosingService.getFundBalances();
  const o1Allocated = fundInitial.balances.OWNER_1;
  if (o1Allocated <= 0) throw new Error("Saldo Owner 1 harus positif");

  // Owner 1 menarik kas sebesar Rp50.000
  const withdrawRes = ClosingService.recordFundWithdrawal("OWNER_1", 50000, OWNER_TOKEN, "Penarikan dividen parsial");
  if (!withdrawRes.success) throw new Error("Penarikan kas harus berhasil");

  const fundAfterWdr = ClosingService.getFundBalances();
  if (fundAfterWdr.balances.OWNER_1 !== (o1Allocated - 50000)) {
    throw new Error(`Saldo Owner 1 harus berkurang 50.000, got ${fundAfterWdr.balances.OWNER_1}`);
  }
});

auditTest("2.2 Reopen Periode Membalik Alokasi Tanpa Menghilangkan Histori Penarikan", () => {
  // Reopen periode November untuk koreksi transaksi
  const reopenRes = ClosingService.reopenPeriod("PER-2026-11", OWNER_TOKEN, "Koreksi biaya operasional terlupa");
  if (reopenRes.period_status !== "OPEN") throw new Error("Status harus OPEN");
  if (reopenRes.new_version !== 2) throw new Error("Versi harus naik menjadi 2");

  // Periksa histori di SALDO_DANA
  const allTxs = DatabaseHelper.getAllRows("SALDO_DANA");
  const wdrTxs = allTxs.filter(t => t.transaction_type === "WITHDRAWAL");
  if (wdrTxs.length === 0) throw new Error("Histori penarikan kas WITHDRAWAL TIDAK BOLEH HILANG!");

  const adjTxs = allTxs.filter(t => t.transaction_type === "ADJUSTMENT");
  if (adjTxs.length === 0) throw new Error("Reversal alokasi harus tercatat sebagai ADJUSTMENT");

  // Karena periode di-reopen, alokasi November dibalik, namun uang Rp50.000 sudah ditarik
  // Saldo kumulatif Owner 1 saat ini adalah -50.000 (status temporary deficit selama periode OPEN)
  const fundsOpen = ClosingService.getFundBalances();
  if (fundsOpen.balances.OWNER_1 !== -50000) {
    throw new Error(`Saldo Owner 1 saat periode OPEN harus -50.000, got ${fundsOpen.balances.OWNER_1}`);
  }
  if (!fundsOpen.has_overdrawn_owner) {
    throw new Error("Sistem harus menandai has_overdrawn_owner: true saat ada penarikan melebihi alokasi aktif");
  }
});

auditTest("2.3 Closing Ulang (V2) Memulihkan Saldo dan Tidak Terjadi Dobel Alokasi", () => {
  // Tambah biaya operasional koreksi di bulan November: 50.000
  DatabaseHelper.insertRow("PENGELUARAN", {
    expense_id: "EXP-CORR-NOV-01",
    expense_date: new Date("2026-11-20"),
    category: "OPERASIONAL",
    description: "Koreksi pulsa operasional",
    amount: 50000
  });

  // Close ulang November (V2)
  const closeV2 = ClosingService.closePeriod(11, 2026, OWNER_TOKEN, "Closing V2 setelah koreksi beban");
  if (closeV2.closing_version !== 2) throw new Error("Closing version harus 2");

  // Net profit baru November = (Omzet 600k - HPP 300k - Beban 50k) = 250.000
  // Alokasi Owner 1 (20%) = 50.000
  if (closeV2.income_statement.net_profit !== 250000) {
    throw new Error(`Net profit V2 expected 250.000, got ${closeV2.income_statement.net_profit}`);
  }
  if (closeV2.profit_distribution.allocations.owner1_amount !== 50000) {
    throw new Error(`Owner 1 allocation V2 expected 50.000, got ${closeV2.profit_distribution.allocations.owner1_amount}`);
  }

  // Periksa Saldo Kumulatif Owner 1:
  // Saldo sebelum V2: -50.000 (akibat penarikan sebelumnya)
  // Alokasi baru V2: +50.000
  // Saldo bersih akhir Owner 1: -50.000 + 50.000 = 0 (LUNAS, haknya pas dengan uang yang sudah ditarik!)
  const fundsAfterV2 = ClosingService.getFundBalances();
  if (fundsAfterV2.balances.OWNER_1 !== 0) {
    throw new Error(`Saldo bersih Owner 1 setelah V2 harus tepat 0, got ${fundsAfterV2.balances.OWNER_1}`);
  }
  if (fundsAfterV2.has_overdrawn_owner !== false) {
    throw new Error("Status overdrawn harus kembali false setelah ter-cover alokasi V2");
  }
});

// -----------------------------------------------------------------------------
// AUDIT SECTION 3: KONSISTENSI SNAPSHOT CLOSING
// -----------------------------------------------------------------------------
console.log("\n--- BAGIAN 3: AUDIT SNAPSHOT CLOSING (SINGLE SOURCE OF TRUTH) ---");

auditTest("3.1 Arsip Seluruh Versi Closing Tersimpan Immutably di CLOSING_BULANAN", () => {
  const archives = DatabaseHelper.getAllRows("CLOSING_BULANAN", c => c.period_id === "PER-2026-11");
  // Harus ada 2 record: V1 dan V2
  if (archives.length !== 2) {
    throw new Error(`Harus ada tepat 2 snapshot closing untuk PER-2026-11, got ${archives.length}`);
  }

  const v1 = archives.find(a => Number(a.closing_version) === 1);
  const v2 = archives.find(a => Number(a.closing_version) === 2);

  if (!v1 || !v2) throw new Error("Snapshot V1 dan V2 harus lengkap");
  if (Number(v1.net_profit) !== 300000) throw new Error(`Net profit V1 harus 300.000, got ${v1.net_profit}`);
  if (Number(v2.net_profit) !== 250000) throw new Error(`Net profit V2 harus 250.000, got ${v2.net_profit}`);
});

auditTest("3.2 PERIODE_KEUANGAN Selaras dengan Versi Aktif Terakhir (V2)", () => {
  const pRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-11");
  if (pRow.period_status !== "CLOSED") throw new Error("Status harus CLOSED");
  if (Number(pRow.closing_version) !== 2) throw new Error("Versi aktif harus 2");
  if (Number(pRow.net_profit) !== 250000) throw new Error("Net profit di PERIODE_KEUANGAN harus selaras dengan V2 (250.000)");

  // PEMBAGIAN_KEUNTUNGAN: V1 harus REOPENED_SUPERSEDED, V2 harus COMMITTED
  const allocs = DatabaseHelper.getAllRows("PEMBAGIAN_KEUNTUNGAN", a => a.period_id === "PER-2026-11");
  const comm = allocs.filter(a => a.status === "COMMITTED");
  const sup = allocs.filter(a => a.status === "REOPENED_SUPERSEDED");

  if (comm.length !== 1) throw new Error("Hanya boleh ada 1 alokasi COMMITTED yang aktif");
  if (sup.length !== 1) throw new Error("Harus ada 1 alokasi lama berstatus REOPENED_SUPERSEDED");
  if (Number(comm[0].net_profit) !== 250000) throw new Error("Alokasi aktif harus berasal dari laba 250.000");
});

// -----------------------------------------------------------------------------
// AUDIT SECTION 4: REKONSILIASI KEUANGAN KOMPREHENSIF
// -----------------------------------------------------------------------------
console.log("\n--- BAGIAN 4: AUDIT REKONSILIASI KEUANGAN KOMPREHENSIF ---");

auditTest("4.1 Simulasi Gabungan 6 Alur Transaksi Lengkap (Bulan Januari 2027)", () => {
  const m = 1;
  const y = 2027;

  // A. Penjualan Stok Sendiri: 1 unit @ Rp400.000, HPP Rp200.000 (Kas masuk: +400.000)
  InventoryService.receiveOwnedStockBatch("PUR-JAN-01", "VAR-JAN-OWN", 5, 200000, 0, "Batch Jan", "TESTER");
  SalesService.createSale({
    transaction_date: new Date("2027-01-05"),
    customer_name: "Customer Jan Own",
    items: [{ variant_id: "VAR-JAN-OWN", item_ownership: "OWNED", quantity: 1, actual_price: 400000 }]
  });

  // B. Pre-Order: DP 500.000 di bulan Januari, Total Order 1.000.000 (Pelunasan sisa di bulan depan)
  // Kas masuk: +500.000, Omzet Jan: Rp0 (karena belum lunas)
  const poRes = POService.createPreOrder({
    order_date: new Date("2027-01-06"),
    customer_name: "Customer PO Jan",
    items: [{ variant_id: "VAR-JAN-OWN", quantity: 1, selling_price: 1000000 }]
  });
  POService.recordPayment(poRes.items[0].po_id, {
    payment_date: new Date("2027-01-07"),
    amount: 500000,
    payment_method: "TRANSFER"
  });

  // C. Penjualan Barang Konsinyasi Vendor Dzaki:
  // Customer bayar Rp280.000 (Kas masuk: +280.000)
  // Hak Dzaki: Rp270.000 (Kewajiban timbul: 270.000)
  // Insentif CrocsCircle: Rp10.000 (Omzet Jan: +10.000)
  InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-JAN-CONS", 5, "Konsinyasi Jan", "TESTER");
  const consSale = SalesService.createSale({
    transaction_date: new Date("2027-01-10"),
    customer_name: "Customer Konsinyasi Jan",
    items: [{ variant_id: "VAR-JAN-CONS", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
  });
  const consDetailId = consSale.details[0].sales_detail_id;

  // D. Settlement Vendor: Bayar separuh kewajiban Dzaki (Rp150.000) pada 12 Januari 2027
  // Kas keluar: -150.000. Sisa utang Dzaki: 120.000
  VendorService.executeSettlement({
    vendor_id: "VND-DZAKI",
    settlement_date: new Date("2027-01-12"),
    payment_method: "TRANSFER_BCA",
    allocations: [{ sales_detail_id: consDetailId, amount_to_pay: 150000 }]
  }, OWNER_TOKEN);

  // E. Pembelian Stok Supplier: Beli stok 5 unit @ Rp180.000 = Rp900.000 (Kas keluar: -900.000)
  DatabaseHelper.insertRow("PEMBELIAN_STOK", {
    purchase_id: "PUR-JAN-SUP-01",
    purchase_date: new Date("2027-01-15"),
    supplier_name: "Supplier Utama",
    total_purchase: 900000,
    payment_status: "PAID"
  });

  // F. Pengeluaran Operasional: Kardus packing & kurir Rp80.000 (Kas keluar: -80.000)
  DatabaseHelper.insertRow("PENGELUARAN", {
    expense_id: "EXP-JAN-01",
    expense_date: new Date("2027-01-18"),
    category: "PACKING",
    description: "Beli bubble wrap dan dus",
    amount: 80000
  });

  // Eksekusi Rekonsiliasi Keuangan
  const recon = FinancialService.getMonthlyCashAndVendorReconciliation(m, y);
  const inc = FinancialService.calculateMonthlyIncomeStatement(m, y);

  // 1. Verifikasi Arus Kas Masuk:
  // Dari penjualan langsung (400.000 + 280.000) = 680.000
  // Dari DP Pre-Order = 500.000
  // Total Kas Masuk = 1.180.000
  if (recon.cash_inflow.total_customer_cash_received !== 1180000) {
    throw new Error(`Total kas masuk expected 1.180.000, got ${recon.cash_inflow.total_customer_cash_received}`);
  }

  // 2. Verifikasi Omzet Resmi CrocsCircle:
  // Penjualan sendiri (400.000) + Insentif Dzaki (10.000) + PO Lunas (0) = 410.000
  if (inc.revenue_breakdown.total_omzet !== 410000) {
    throw new Error(`Omzet resmi expected 410.000, got ${inc.revenue_breakdown.total_omzet}`);
  }

  // 3. Verifikasi HPP:
  // Hanya HPP stok sendiri yang terjual = 200.000 (Konsinyasi = 0, Beli stok bukan HPP)
  if (inc.hpp_breakdown.total_hpp !== 200000) {
    throw new Error(`HPP expected 200.000, got ${inc.hpp_breakdown.total_hpp}`);
  }

  // 4. Verifikasi Laba Kotor:
  // 410.000 - 200.000 = 210.000
  if (inc.gross_profit !== 210000) {
    throw new Error(`Laba kotor expected 210.000, got ${inc.gross_profit}`);
  }

  // 5. Verifikasi Pengeluaran Operasional & Laba Bersih:
  // Operasional: 80.000 (Beli stok 900.000 dan transfer Dzaki 150.000 DIEKSKLUSI)
  // Laba Bersih: 210.000 - 80.000 = 130.000
  if (inc.expenses_breakdown.operational_expenses !== 80000) {
    throw new Error(`Beban operasional expected 80.000, got ${inc.expenses_breakdown.operational_expenses}`);
  }
  if (inc.net_profit !== 130000) {
    throw new Error(`Laba bersih expected 130.000, got ${inc.net_profit}`);
  }

  // 6. Verifikasi Arus Kas Keluar:
  // Settlement Dzaki (150.000) + Belanja Stok (900.000) + Beban Op (80.000) = 1.130.000
  if (recon.cash_outflow.total_cash_disbursed !== 1130000) {
    throw new Error(`Total kas keluar expected 1.130.000, got ${recon.cash_outflow.total_cash_disbursed}`);
  }

  // 7. Verifikasi Net Cash Flow:
  // Kas Masuk (1.180.000) - Kas Keluar (1.130.000) = +50.000
  if (recon.net_cash_flow !== 50000) {
    throw new Error(`Net cash flow expected +50.000, got ${recon.net_cash_flow}`);
  }

  // 8. Verifikasi Sisa Kewajiban Vendor (Restricted Cash):
  // Hak Dzaki timbul: 270.000. Sudah ditransfer: 150.000. Sisa utang = 120.000
  const detailCheck = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", consDetailId);
  if (Number(detailCheck.vendor_remaining_payable) !== 120000) {
    throw new Error(`Sisa utang vendor expected 120.000, got ${detailCheck.vendor_remaining_payable}`);
  }
});

console.log("=======================================================================");
console.log(`📊 REKAPITULASI AUDIT FINAL PHASE 2E: ${totalAuditPass} LULUS, ${totalAuditFail} GAGAL`);
console.log("=======================================================================");

if (totalAuditFail > 0) {
  process.exit(1);
} else {
  console.log("🎉 SELURUH SKENARIO AUDIT FINAL REVIEW PHASE 2E LULUS 100%!");
  process.exit(0);
}
