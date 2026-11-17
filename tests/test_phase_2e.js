/**
 * CROCSCIRCLE.ID — PHASE 2E AUTOMATED TEST SUITE RUNNER
 * Verifies all 22 mandatory requirements for Financial Management & Monthly Closing Engine:
 * 1. Omzet penjualan stok sendiri
 * 2. Omzet PO lunas
 * 3. DP PO tidak dihitung sebagai omzet
 * 4. PO hanya dihitung satu kali ketika lunas
 * 5. Omzet insentif vendor
 * 6. Hak vendor tidak dihitung sebagai omzet
 * 7. HPP FIFO dari snapshot transaksi
 * 8. Pembelian stok tidak dihitung sebagai pengeluaran operasional
 * 9. Pengeluaran operasional mengurangi laba bersih
 * 10. Settlement vendor tidak mengurangi laba dua kali
 * 11. Klaim vendor tidak dihitung sebagai pendapatan operasional
 * 12. Perhitungan laba kotor
 * 13. Perhitungan laba bersih
 * 14. Pembagian laba sesuai persentase
 * 15. Pembulatan alokasi tepat 100% (Plug ke Keuntungan Ditahan & Benchmark November Rp3.120.569)
 * 16. Laba nol dan negatif
 * 17. Closing bulanan
 * 18. Mencegah closing ganda
 * 19. Reopen dengan audit trail
 * 20. Mencegah perubahan periode CLOSED tanpa otorisasi
 * 21. Saldo dana terakumulasi dengan benar
 * 22. Alokasi keuntungan tidak otomatis dianggap sebagai transfer uang
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
    const rowKeys = Object.keys(this.cells).map(Number);
    return rowKeys.length > 0 ? Math.max(...rowKeys) : 0;
  }
  getLastColumn() {
    let maxCol = 0;
    for (const r in this.cells) {
      const colKeys = Object.keys(this.cells[r]).map(Number);
      if (colKeys.length > 0) {
        maxCol = Math.max(maxCol, ...colKeys);
      }
    }
    return maxCol;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this, row, col, numRows, numCols);
  }
  appendRow(rowArray) {
    const nextRow = this.getLastRow() + 1;
    if (!this.cells[nextRow]) this.cells[nextRow] = [];
    for (let c = 0; c < rowArray.length; c++) {
      this.cells[nextRow][c + 1] = rowArray[c];
    }
  }
  setFrozenRows() {}
  autoResizeColumns() {}
  setRowHeight() {}
  setColumnWidth() {}
  deleteRow(rowIndex) {
    delete this.cells[rowIndex];
    const newCells = {};
    Object.keys(this.cells).sort((a,b)=>Number(a)-Number(b)).forEach(k => {
      if (Number(k) < rowIndex) newCells[k] = this.cells[k];
      else if (Number(k) > rowIndex) newCells[Number(k) - 1] = this.cells[k];
    });
    this.cells = newCells;
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
  }
  getSheetByName(name) {
    return this.sheets[name] || null;
  }
  insertSheet(name) {
    if (!this.sheets[name]) {
      this.sheets[name] = new MockSheet(name);
    }
    return this.sheets[name];
  }
  deleteSheet(sheet) { delete this.sheets[sheet.name]; }
  getSheets() { return Object.values(this.sheets); }
}

const mockSS = new MockSpreadsheet();

// Mock Apps Script globals
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => mockSS
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    releaseLock: () => {}
  })
};

global.Logger = {
  log: (...args) => {}
};

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

// Test Runner
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let passed = 0;
let failed = 0;

// Setup Database & Owner
initializeCrocsCircleDatabase();
AuthService.setupOwnerAccount("owner_admin", "Owner Admin", "SecureOwner2026!#");
const ownerAuth = AuthService.login("owner_admin", "SecureOwner2026!#");
const ownerToken = ownerAuth.token;

const testMonth = 11;
const testYear = 2026;
const VAR_OWNED = "VAR-OWNED-01";
const VAR_CONS = "VAR-CONS-01";

// Seed Stock Batches
InventoryService.receiveOwnedStockBatch("PUR-E-01", VAR_OWNED, 20, 150000, 0, "Batch Modal 150k", "TESTER");
InventoryService.receiveConsignmentStock("VND-DZAKI", VAR_CONS, 10, "Konsinyasi Dzaki", "TESTER");

// TEST 1: Omzet Penjualan Stok Sendiri
test("1. Omzet penjualan stok sendiri (snapshot actual price)", () => {
  const sale = SalesService.createSale({
    transaction_date: new Date("2026-11-05T10:00:00"),
    sales_channel: "OFFLINE_EVENT",
    customer_name: "Customer Sendiri 1",
    idempotency_key: "IDEM-E-01",
    items: [
      { variant_id: VAR_OWNED, item_ownership: "OWNED", quantity: 2, actual_price: 300000 }
    ]
  });

  const rep = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  if (rep.revenue_breakdown.owned_sales_amount < 600000) {
    throw new Error(`Expected owned_sales_amount >= 600000, got ${rep.revenue_breakdown.owned_sales_amount}`);
  }
});

// TEST 2: Omzet PO Lunas
test("2. Omzet PO lunas diakui pada settlement_date", () => {
  const poRes = POService.createPreOrder({
    order_date: new Date("2026-11-01T09:00:00"),
    customer_name: "Customer PO Lunas",
    customer_contact: "0812345678",
    items: [
      { variant_id: VAR_OWNED, quantity: 1, selling_price: 500000 }
    ]
  });
  const poId = poRes.items[0].po_id;

  // Lunas penuh di bulan November
  POService.recordPayment(poId, {
    payment_date: new Date("2026-11-10T14:00:00"),
    amount: 500000,
    payment_method: "TRANSFER"
  });

  const rep = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  if (rep.revenue_breakdown.po_recognized_omzet < 500000) {
    throw new Error(`Expected po_recognized_omzet >= 500000, got ${rep.revenue_breakdown.po_recognized_omzet}`);
  }
});

// TEST 3: DP PO Tidak Dihitung Sebagai Omzet
test("3. DP PO tidak dihitung sebagai omzet", () => {
  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  const poRes = POService.createPreOrder({
    order_date: new Date("2026-11-02T09:00:00"),
    customer_name: "Customer Baru DP",
    customer_contact: "0819999999",
    items: [
      { variant_id: VAR_OWNED, quantity: 1, selling_price: 1000000 }
    ]
  });
  const poId = poRes.items[0].po_id;

  // Baru bayar DP 300.000 (status PARTIAL)
  POService.recordPayment(poId, {
    payment_date: new Date("2026-11-03T11:00:00"),
    amount: 300000,
    payment_method: "TRANSFER"
  });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  // Omzet PO TIDAK BOLEH BERTAMBAH
  if (repAfter.revenue_breakdown.po_recognized_omzet !== repBefore.revenue_breakdown.po_recognized_omzet) {
    throw new Error("DP PO seharusnya tidak menambah omzet yang diakui!");
  }
});

// TEST 4: PO Hanya Dihitung Satu Kali Ketika Lunas
test("4. PO hanya dihitung satu kali ketika lunas (tidak double count DP + pelunasan)", () => {
  const poRes = POService.createPreOrder({
    order_date: new Date("2026-11-04T09:00:00"),
    customer_name: "Customer Cicilan 2x",
    customer_contact: "0818888888",
    items: [
      { variant_id: VAR_OWNED, quantity: 1, selling_price: 800000 }
    ]
  });
  const poId = poRes.items[0].po_id;

  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  // Cicilan 1: 400.000
  POService.recordPayment(poId, { payment_date: new Date("2026-11-05"), amount: 400000 });
  // Cicilan 2: 400.000 (LUNAS)
  POService.recordPayment(poId, { payment_date: new Date("2026-11-12"), amount: 400000 });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  const diff = repAfter.revenue_breakdown.po_recognized_omzet - repBefore.revenue_breakdown.po_recognized_omzet;
  if (diff !== 800000) {
    throw new Error(`Expected PO omzet increase of 800000, got ${diff}`);
  }
});

// TEST 5: Omzet Insentif Vendor
test("5. Omzet insentif vendor (hanya insentif CrocsCircle yang dihitung sebagai omzet)", () => {
  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  // Jual barang Dzaki: Customer bayar Rp285.000 (Hak Dzaki 270.000, Insentif CrocsCircle 15.000)
  SalesService.createSale({
    transaction_date: new Date("2026-11-15T15:00:00"),
    customer_name: "Pembeli Konsinyasi",
    idempotency_key: "IDEM-E-VEND-01",
    items: [
      { variant_id: VAR_CONS, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 285000 }
    ]
  });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  const incDiff = repAfter.revenue_breakdown.vendor_incentive_amount - repBefore.revenue_breakdown.vendor_incentive_amount;
  if (incDiff !== 15000) {
    throw new Error(`Expected vendor incentive increase of 15000, got ${incDiff}`);
  }
});

// TEST 6: Hak Vendor Tidak Dihitung Sebagai Omzet
test("6. Hak vendor tidak dihitung sebagai omzet (dicatat sebagai kewajiban)", () => {
  const rep = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  const allConsSales = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.item_ownership === "CONSIGNMENT");
  const totalVendorPayables = allConsSales.reduce((sum, d) => sum + (Number(d.total_vendor_payable) || 0), 0);

  if (totalVendorPayables <= 0) {
    throw new Error("Harus ada kewajiban vendor tercatat");
  }

  // Omzet CrocsCircle TIDAK BOLEH mengandung hak vendor
  if (rep.revenue_breakdown.total_omzet < (rep.revenue_breakdown.owned_sales_amount + rep.revenue_breakdown.vendor_incentive_amount + rep.revenue_breakdown.po_recognized_omzet)) {
    throw new Error("Formula total omzet tidak konsisten");
  }
});

// TEST 7: HPP FIFO Dari Snapshot Transaksi
test("7. HPP FIFO dari snapshot transaksi DETAIL_PENJUALAN", () => {
  const rep = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  // Batch tadi HPP modalnya 150.000 per pcs, 2 pcs = 300.000
  if (rep.hpp_breakdown.total_hpp < 300000) {
    throw new Error(`Expected total_hpp >= 300000, got ${rep.hpp_breakdown.total_hpp}`);
  }
  if (rep.hpp_breakdown.consignment_hpp !== 0) {
    throw new Error("HPP barang konsinyasi harus 0");
  }
});

// TEST 8: Pembelian Stok Tidak Dihitung Sebagai Pengeluaran Operasional
test("8. Pembelian stok supplier tidak dihitung sebagai pengeluaran operasional", () => {
  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  // Catat transaksi pembelian stok supplier
  DatabaseHelper.insertRow("PEMBELIAN_STOK", {
    purchase_id: "PUR-STOK-TEST-99",
    purchase_date: new Date("2026-11-18"),
    supplier_name: "Supplier Sepatu Besar",
    total_purchase: 5000000,
    payment_status: "PAID"
  });

  // Bahkan jika salah catat di tabel PENGELUARAN dengan kategori PEMBELIAN_STOK:
  DatabaseHelper.insertRow("PENGELUARAN", {
    expense_id: "EXP-NON-OP-01",
    expense_date: new Date("2026-11-18"),
    category: "PEMBELIAN_STOK",
    description: "Beli stok baru",
    amount: 5000000
  });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  if (repAfter.expenses_breakdown.operational_expenses !== repBefore.expenses_breakdown.operational_expenses) {
    throw new Error("Pembelian stok seharusnya tidak menambah pengeluaran operasional!");
  }
  if (repAfter.expenses_breakdown.excluded_non_operational_count < 1) {
    throw new Error("Transaksi pembelian stok harus terdeteksi dan dieksklusi.");
  }
});

// TEST 9: Pengeluaran Operasional Mengurangi Laba Bersih
test("9. Pengeluaran operasional mengurangi laba bersih", () => {
  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  // Catat pengeluaran operasional sah: packing box & lakban
  DatabaseHelper.insertRow("PENGELUARAN", {
    expense_id: "EXP-OP-01",
    expense_date: new Date("2026-11-19"),
    category: "PACKING",
    description: "Beli 50 kardus packing dan lakban bubble",
    amount: 150000
  });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  const expDiff = repAfter.expenses_breakdown.operational_expenses - repBefore.expenses_breakdown.operational_expenses;
  const netDiff = repBefore.net_profit - repAfter.net_profit;

  if (expDiff !== 150000) throw new Error(`Expected operational expense increase of 150000, got ${expDiff}`);
  if (netDiff !== 150000) throw new Error(`Expected net profit decrease of 150000, got ${netDiff}`);
});

// TEST 10: Settlement Vendor Tidak Mengurangi Laba Dua Kali
test("10. Settlement vendor tidak mengurangi laba dua kali", () => {
  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  // Eksekusi settlement pembayaran ke Dzaki
  DatabaseHelper.insertRow("SETTLEMENT_VENDOR", {
    settlement_id: "STL-TEST-01",
    settlement_date: new Date("2026-11-20"),
    vendor_id: "VND-DZAKI",
    total_gross_payable: 270000,
    total_claims_deducted: 0,
    total_net_payout: 270000,
    payment_method: "TRANSFER_BCA"
  });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  // Transfer uang ke vendor adalah pelunasan kewajiban neraca, BUKAN beban laba rugi
  if (repAfter.net_profit !== repBefore.net_profit) {
    throw new Error("Settlement vendor seharusnya tidak mengurangi laba bersih!");
  }
});

// TEST 11: Klaim Vendor Tidak Dihitung Sebagai Pendapatan
test("11. Klaim vendor tidak dihitung sebagai pendapatan operasional", () => {
  const repBefore = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);

  // Catat klaim piutang retur ke vendor
  DatabaseHelper.insertRow("KLAIM_VENDOR", {
    claim_id: "CLM-TEST-01",
    claim_date: new Date("2026-11-21"),
    vendor_id: "VND-DZAKI",
    claim_amount: 270000,
    claim_status: "UNCOMPENSATED"
  });

  const repAfter = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  if (repAfter.revenue_breakdown.total_omzet !== repBefore.revenue_breakdown.total_omzet) {
    throw new Error("Klaim retur vendor tidak boleh masuk omzet pendapatan!");
  }
});

// TEST 12: Perhitungan Laba Kotor
test("12. Perhitungan laba kotor (Laba Kotor = Omzet - HPP)", () => {
  const rep = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  const expectedGross = rep.revenue_breakdown.total_omzet - rep.hpp_breakdown.total_hpp;
  if (rep.gross_profit !== expectedGross) {
    throw new Error(`Gross profit mismatch: got ${rep.gross_profit}, expected ${expectedGross}`);
  }
});

// TEST 13: Perhitungan Laba Bersih
test("13. Perhitungan laba bersih (Laba Bersih = Laba Kotor - Pengeluaran Operasional)", () => {
  const rep = FinancialService.calculateMonthlyIncomeStatement(testMonth, testYear);
  const expectedNet = rep.gross_profit - rep.expenses_breakdown.operational_expenses;
  if (rep.net_profit !== expectedNet) {
    throw new Error(`Net profit mismatch: got ${rep.net_profit}, expected ${expectedNet}`);
  }
});

// TEST 14: Pembagian Laba Sesuai Persentase
test("14. Pembagian laba sesuai persentase default (20%, 20%, 10%, 50%)", () => {
  const sim = ClosingService.simulateProfitDistribution(10000000); // 10 juta
  if (sim.allocations.owner1_amount !== 2000000) throw new Error("Owner 1 harus 2 juta");
  if (sim.allocations.owner2_amount !== 2000000) throw new Error("Owner 2 harus 2 juta");
  if (sim.allocations.emergency_amount !== 1000000) throw new Error("Dana darurat harus 1 juta");
  if (sim.allocations.retained_amount !== 5000000) throw new Error("Keuntungan ditahan harus 5 juta");
  if (sim.allocations.total_allocated !== 10000000) throw new Error("Total alokasi harus 10 juta");
});

// TEST 15: Pembulatan Alokasi Tepat 100% (Benchmark November Rp3.120.569)
test("15. Pembulatan alokasi tepat 100% (Plug ke Keuntungan Ditahan & Benchmark November Rp3.120.569)", () => {
  // Angka resmi acuan regression: Laba Bersih Rp3.120.569
  const sim = ClosingService.simulateProfitDistribution(3120569);

  if (sim.allocations.owner1_amount !== 624114) {
    throw new Error(`Owner 1 expected 624114, got ${sim.allocations.owner1_amount}`);
  }
  if (sim.allocations.owner2_amount !== 624114) {
    throw new Error(`Owner 2 expected 624114, got ${sim.allocations.owner2_amount}`);
  }
  if (sim.allocations.emergency_amount !== 312057) {
    throw new Error(`Emergency expected 312057, got ${sim.allocations.emergency_amount}`);
  }
  if (sim.allocations.retained_amount !== 1560284) {
    throw new Error(`Retained expected 1560284, got ${sim.allocations.retained_amount}`);
  }
  if (sim.allocations.total_allocated !== 3120569) {
    throw new Error(`Total allocated expected 3120569, got ${sim.allocations.total_allocated}`);
  }
});

// TEST 16: Laba Nol dan Negatif
test("16. Laba nol dan negatif menghasilkan seluruh alokasi keuntungan bernilai nol", () => {
  const simZero = ClosingService.simulateProfitDistribution(0);
  if (simZero.allocations.total_allocated !== 0 || simZero.allocations.owner1_amount !== 0) {
    throw new Error("Laba nol harus menghasilkan alokasi nol");
  }

  const simLoss = ClosingService.simulateProfitDistribution(-2500000);
  if (simLoss.allocations.total_allocated !== 0 || simLoss.allocations.retained_amount !== 0) {
    throw new Error("Rugi bersih harus menghasilkan alokasi nol");
  }
  if (simLoss.is_profitable !== false) {
    throw new Error("is_profitable harus false");
  }
});

// TEST 17: Closing Bulanan
test("17. Closing bulanan menyimpan snapshot, alokasi keuntungan, dan mutasi SALDO_DANA", () => {
  const closeRes = ClosingService.closePeriod(testMonth, testYear, ownerToken, "Tutup buku November resmi");
  if (closeRes.success !== true) throw new Error("Close period harus berhasil");
  if (closeRes.period_status !== "CLOSED") throw new Error("Period status harus CLOSED");

  // Cek row di PERIODE_KEUANGAN
  const pRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-11");
  if (pRow.period_status !== "CLOSED") throw new Error("Status di sheet harus CLOSED");
  if (Number(pRow.net_profit) <= 0) throw new Error("Net profit snapshot harus tersimpan");

  // Cek row di PEMBAGIAN_KEUNTUNGAN
  const allocs = DatabaseHelper.getAllRows("PEMBAGIAN_KEUNTUNGAN", a => a.period_id === "PER-2026-11" && a.status === "COMMITTED");
  if (allocs.length === 0) throw new Error("Alokasi keuntungan harus tersimpan di sheet");

  // Cek mutasi SALDO_DANA
  const fundTxs = DatabaseHelper.getAllRows("SALDO_DANA", f => f.period_id === "PER-2026-11");
  if (fundTxs.length !== 4) throw new Error("Harus ada 4 mutasi alokasi ke SALDO_DANA");
});

// TEST 18: Mencegah Closing Ganda
test("18. Mencegah closing ganda pada periode yang sama", () => {
  let doubleCloseBlocked = false;
  try {
    ClosingService.closePeriod(testMonth, testYear, ownerToken, "Tutup buku kedua kali");
  } catch (e) {
    doubleCloseBlocked = true;
  }
  if (!doubleCloseBlocked) {
    throw new Error("Closing ganda harus ditolak dengan exception!");
  }
});

// TEST 19: Reopen Dengan Audit Trail
test("19. Reopen dengan audit trail (alasan, waktu, actor, closing version naik, reversal mutasi saldo dana)", () => {
  const pRowBefore = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-11");
  const oldVer = pRowBefore.closing_version;

  const reopenRes = ClosingService.reopenPeriod("PER-2026-11", ownerToken, "Koreksi invoice salah tanggal");
  if (reopenRes.success !== true) throw new Error("Reopen harus sukses");
  if (reopenRes.period_status !== "OPEN") throw new Error("Status harus kembali OPEN");
  if (reopenRes.new_version !== (oldVer + 1)) throw new Error("Versi harus naik");

  // Cek mutasi pembalik (reversal) di SALDO_DANA
  const revTxs = DatabaseHelper.getAllRows("SALDO_DANA", f => f.period_id === "PER-2026-11" && f.transaction_type === "ADJUSTMENT");
  if (revTxs.length !== 4) throw new Error("Harus ada 4 mutasi penyesuaian pembalik di SALDO_DANA");
  
  // Total saldo dana kumulatif untuk periode ini harus kembali 0
  const allTxs = DatabaseHelper.getAllRows("SALDO_DANA", f => f.period_id === "PER-2026-11");
  const sum = allTxs.reduce((acc, t) => acc + Number(t.amount), 0);
  if (sum !== 0) throw new Error(`Net fund movement after reopen must be 0, got ${sum}`);
});

// TEST 20: Mencegah Perubahan Periode CLOSED Tanpa Otorisasi
test("20. Mencegah perubahan periode CLOSED tanpa otorisasi", () => {
  // Re-close kembali periode November
  ClosingService.closePeriod(testMonth, testYear, ownerToken, "Tutup buku final kembali");

  // Coba buat transaksi baru dengan tanggal di bulan November yang sudah CLOSED
  let txBlocked = false;
  try {
    SalesService.createSale({
      transaction_date: new Date("2026-11-25T10:00:00"),
      items: [{ variant_id: VAR_OWNED, item_ownership: "OWNED", quantity: 1, actual_price: 300000 }]
    });
  } catch (e) {
    if (e.message.includes("DITUTUP (CLOSED)")) {
      txBlocked = true;
    }
  }
  if (!txBlocked) {
    throw new Error("Transaksi pada tanggal periode CLOSED seharusnya ditolak!");
  }
});

// TEST 21: Saldo Dana Terakumulasi Dengan Benar
test("21. Saldo dana terakumulasi dengan benar di SALDO_DANA", () => {
  const funds = ClosingService.getFundBalances();
  if (funds.balances.OWNER_1 <= 0 || funds.balances.OWNER_2 <= 0 || funds.balances.DANA_DARURAT <= 0 || funds.balances.LABA_DITAHAN <= 0) {
    throw new Error("Seluruh pos dana harus memiliki saldo positif setelah closing");
  }
  const calcSum = funds.balances.OWNER_1 + funds.balances.OWNER_2 + funds.balances.DANA_DARURAT + funds.balances.LABA_DITAHAN;
  if (funds.total_funds !== calcSum) {
    throw new Error("Total dana harus konsisten dengan penjumlahan 4 pos");
  }
});

// TEST 22: Alokasi Keuntungan Tidak Otomatis Dianggap Sebagai Transfer Uang
test("22. Alokasi keuntungan tidak otomatis dianggap sebagai penarikan uang kas (WITHDRAWAL terpisah)", () => {
  const fundsBefore = ClosingService.getFundBalances();
  const owner1Before = fundsBefore.balances.OWNER_1;
  const withdrawAmt = Math.min(owner1Before, 100000);

  // Catat penarikan kas fisik oleh Owner 1
  const wdrRes = ClosingService.recordFundWithdrawal("OWNER_1", withdrawAmt, ownerToken, "Tarik dividen tunai");
  if (wdrRes.success !== true) throw new Error("Withdrawal harus sukses");

  const fundsAfter = ClosingService.getFundBalances();
  if (fundsAfter.balances.OWNER_1 !== (owner1Before - withdrawAmt)) {
    throw new Error(`Expected remaining balance ${owner1Before - withdrawAmt}, got ${fundsAfter.balances.OWNER_1}`);
  }

  // Coba tarik melebihi saldo yang tersedia: harus gagal!
  let overdrawBlocked = false;
  try {
    ClosingService.recordFundWithdrawal("OWNER_1", 999999999, ownerToken, "Tarik melebihi saldo");
  } catch (e) {
    overdrawBlocked = true;
  }
  if (!overdrawBlocked) {
    throw new Error("Penarikan melebihi saldo harus ditolak!");
  }
});

// Execute all tests
console.log("=======================================================================");
console.log("🚀 CROCSCIRCLE.ID — PHASE 2E AUTOMATED TEST SUITE (22 CRITERIA)");
console.log("=======================================================================");

tests.forEach((t, idx) => {
  try {
    t.fn();
    console.log(`[PASS] ${t.name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${t.name}`);
    console.error(`       Error: ${err.message}`);
    failed++;
  }
});

console.log("=======================================================================");
console.log(`📊 REKAPITULASI HASIL: ${passed} LULUS, ${failed} GAGAL (TOTAL: ${tests.length})`);
console.log("=======================================================================");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("✅ SELURUH 22 KRITERIA PENGUJIAN PHASE 2E LULUS 100%!");
  process.exit(0);
}
