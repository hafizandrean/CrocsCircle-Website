/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 4 TEST SUITE
 * Pelaporan Keuangan Komprehensif, Kapitalisasi Ongkir Supplier, HPP Pre-Order,
 * Rekonsiliasi Kas, Rekonsiliasi Vendor, Month-End Closing & Prosedur Reopen.
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

global.Utilities = {
  formatDate: (date, tz, fmt) => {
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    if (fmt === "yyyy-MM-dd") return `${yyyy}-${MM}-${dd}`;
    if (fmt === "yyyyMMdd") return `${yyyy}${MM}${dd}`;
    if (fmt === "yyyyMMdd-HHmmss") return `${yyyy}${MM}${dd}-${HH}${mm}${ss}`;
    return d.toISOString();
  },
  base64Encode: (str) => Buffer.from(str).toString('base64'),
  base64Decode: (str) => Buffer.from(str, 'base64').toString('utf8'),
  computeDigest: (algo, str) => {
    const hash = crypto.createHash('sha256').update(str).digest();
    return Array.from(hash);
  },
  DigestAlgorithm: { SHA_256: "SHA_256" }
};

global.Logger = {
  log: () => {},
  warn: () => {},
  error: () => {}
};

global.LockService = {
  getScriptLock: () => ({
    tryLock: () => true,
    waitLock: () => true,
    releaseLock: () => true
  })
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
loadBackendFile('ClosingService.gs', 'ClosingService');
loadBackendFile('InventoryService.gs', 'InventoryService');
loadBackendFile('SalesService.gs', 'SalesService');
loadBackendFile('POService.gs', 'POService');
loadBackendFile('VendorService.gs', 'VendorService');
loadBackendFile('FinancialService.gs', 'FinancialService');
loadBackendFile('ProductService.gs', 'ProductService');
loadBackendFile('AdminController.gs', 'AdminController');
loadBackendFile('StorefrontService.gs', 'StorefrontService');

// Inisialisasi Database
initializeCrocsCircleDatabase();

// Pastikan periode Oktober OPEN untuk pengujian pembuatan transaksi PO dan pembukaan kas awal
DatabaseHelper.updateRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-10", {
  period_status: "OPEN"
});

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

console.log("\n==========================================================================");
console.log("CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 4 COMPREHENSIVE TEST SUITE");
console.log("Financial Reporting, Capitalized Shipping, PO HPP, Cash Flow & Closing");
console.log("==========================================================================");

// Setup Master Data
const testVariantId = "VAR-SM4-01";
DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: testVariantId,
  product_id: "PROD-SM4-01",
  color: "Black",
  size: "M9W11",
  catalog_price: 350000,
  reference_hpp: 200000,
  is_active: true
});
DatabaseHelper.insertRow("STOK", {
  variant_id: testVariantId,
  owned_physical_stock: 0,
  owned_reserved_stock: 0,
  owned_available_stock: 0,
  consignment_physical_stock: 0,
  consignment_reserved_stock: 0,
  consignment_available_stock: 0,
  total_available_stock: 0,
  minimum_stock: 2
});

const ownerToken = "MOCK-OWNER-TOKEN-SM4";
global.AuthService.requireOwner = () => ({ username: "hafiz", role: "OWNER" });

// -------------------------------------------------------------------------
// SKENARIO 1: Kapitalisasi Ongkir Supplier ke HPP FIFO Batch (Alternatif 2)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 1 & 7: Kapitalisasi Ongkir Supplier ke HPP FIFO Batch");

// Buat Faktur Pembelian 10 unit dengan ongkir Rp50.000
const invoice1 = InventoryService.createPurchaseInvoice({
  vendor_id: "VND-GLOBAL",
  supplier_name: "Supplier Utama",
  purchase_date: "2026-11-05",
  shipping_cost: 50000,
  notes: JSON.stringify({
    user_notes: "Faktur 10 unit dengan ongkir 50k",
    planned_items: [{ variant_id: testVariantId, quantity: 10, base_unit_cost: 200000, vendor_incentive: 10000 }]
  }),
  items: [
    { variant_id: testVariantId, quantity: 10, base_unit_cost: 200000, vendor_incentive: 10000 }
  ]
});

assert(invoice1.success === true, "Faktur pembelian dibuat dengan ongkir Rp50.000");
assert(invoice1.total_purchase === 2050000, "Total faktur = 10 x 200.000 + 50.000 = Rp2.050.000");

// Terima bertahap: Tahap 1 terima 6 unit
const receipt1 = InventoryService.receivePurchaseShipment({
  purchase_id: invoice1.purchase_id,
  idempotency_key: "IDEM-SM4-RCV-01",
  notes: "Penerimaan tahap 1: 6 unit",
  created_by: "admin1",
  received_items: [
    { variant_id: testVariantId, quantity: 6, base_unit_cost: 200000, vendor_incentive: 10000 }
  ]
});

assert(receipt1.success === true, "Penerimaan tahap 1 (6 unit) berhasil");
const batch1 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === invoice1.purchase_id)[0];
// 50.000 / 10 unit = 5.000 ongkir per unit.
// unit_cost = 200.000 (base) + 10.000 (incentive) + 5.000 (ongkir) = 215.000
assert(Number(batch1.unit_cost) === 215000, "HPP unit Batch 1 terkapitalisasi tepat Rp215.000 (200k base + 10k insentif + 5k ongkir)");
assert(Number(batch1.shipping_cost_allocation) === 30000, "Alokasi ongkir untuk 6 unit adalah tepat Rp30.000 (proporsional 6/10 x 50.000)");

// Sisa ongkir 20.000 tetap tercatat sebagai biaya pengadaan belum dialokasikan
const remainingUnallocatedShipping = 50000 - Number(batch1.shipping_cost_allocation);
assert(remainingUnallocatedShipping === 20000, "Sisa ongkir 20.000 untuk 4 unit belum dialokasikan dan belum dibebankan");

// Terima Tahap 2: 4 unit sisa
const receipt2 = InventoryService.receivePurchaseShipment({
  purchase_id: invoice1.purchase_id,
  idempotency_key: "IDEM-SM4-RCV-02",
  notes: "Penerimaan tahap 2: 4 unit",
  created_by: "admin1",
  received_items: [
    { variant_id: testVariantId, quantity: 4, base_unit_cost: 200000, vendor_incentive: 10000 }
  ]
});

assert(receipt2.new_receiving_status === "FULLY_RECEIVED", "Status faktur kini FULLY_RECEIVED");
const batch2 = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.purchase_id === invoice1.purchase_id)[1];
assert(Number(batch2.unit_cost) === 215000, "HPP unit Batch 2 terkapitalisasi tepat Rp215.000");
assert(Number(batch2.shipping_cost_allocation) === 20000, "Alokasi ongkir untuk 4 unit sisa adalah tepat Rp20.000");

// -------------------------------------------------------------------------
// SKENARIO 2: Penjualan POS Stok Sendiri & Pengakuan HPP FIFO Terkapitalisasi
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 2: Penjualan POS Stok Sendiri & Pengakuan HPP FIFO");

const sale1 = SalesService.recordSalesTransaction({
  sales_channel: "STORE_OFFLINE",
  sales_type: "RETAIL",
  customer_name: "Customer Retail 1",
  transaction_date: "2026-11-06",
  payment_method: "CASH",
  items: [
    { variant_id: testVariantId, quantity: 2, actual_price: 350000, item_ownership: "OWNED" }
  ],
  created_by: "admin1"
});

assert(sale1.success === true, "Penjualan POS stok sendiri berhasil dicatat");
assert(sale1.financial_breakdown.grand_total === 700000, "Kas masuk penjualan = 2 x 350.000 = Rp700.000");
// HPP 2 unit x 215.000 = Rp430.000
assert(sale1.financial_breakdown.total_hpp === 430000, "HPP FIFO diakui Rp430.000 (2 x Rp215.000 termasuk kapitalisasi ongkir)");
assert(sale1.financial_breakdown.gross_profit === 270000, "Laba Kotor = 700.000 - 430.000 = Rp270.000");

// -------------------------------------------------------------------------
// SKENARIO 3: Penjualan Barang Konsinyasi Vendor (Omzet = Insentif, HPP = 0)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 3: Penjualan Barang Konsinyasi Vendor (HPP = Rp0, Hak Vendor = Kewajiban)");

// Terima 5 unit barang titipan vendor Dzaki
const consVariantId = "VAR-SM4-CONS-01";
DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: consVariantId,
  product_id: "PROD-SM4-02",
  color: "Navy",
  size: "M8W10",
  catalog_price: 280000,
  reference_hpp: 0,
  is_active: true
});
DatabaseHelper.insertRow("STOK", {
  variant_id: consVariantId,
  owned_physical_stock: 0,
  owned_reserved_stock: 0,
  owned_available_stock: 0,
  consignment_physical_stock: 0,
  consignment_reserved_stock: 0,
  consignment_available_stock: 0,
  total_available_stock: 0,
  minimum_stock: 1
});

InventoryService.receiveConsignmentStock("VND-DZAKI", consVariantId, 5, 270000, "Titip jual Dzaki", "admin1");

const saleCons = SalesService.recordSalesTransaction({
  sales_channel: "STORE_OFFLINE",
  sales_type: "RETAIL",
  customer_name: "Customer Konsinyasi",
  transaction_date: "2026-11-08",
  payment_method: "TRANSFER_BCA",
  items: [
    { variant_id: consVariantId, quantity: 2, actual_price: 280000, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI" }
  ],
  created_by: "admin1"
});

assert(saleCons.success === true, "Penjualan konsinyasi 2 unit berhasil");
assert(saleCons.financial_breakdown.grand_total === 560000, "Total kas diterima dari pelanggan = 2 x 280.000 = Rp560.000");
assert(saleCons.financial_breakdown.net_operational_revenue === 20000, "Pendapatan CrocsCircle murni insentif = 2 x (280k - 270k) = Rp20.000");
assert(saleCons.financial_breakdown.total_hpp === 0, "HPP CrocsCircle untuk barang konsinyasi adalah Rp0");
assert(saleCons.financial_breakdown.gross_profit === 20000, "Laba kotor CrocsCircle tepat Rp20.000");

// Verifikasi kewajiban utang vendor bertambah 2 x 270.000 = Rp540.000
const dzakiPayables = VendorService.getVendorOutstandingPayables("VND-DZAKI");
assert(dzakiPayables.total_gross_payable === 540000, "Kewajiban utang ke vendor Dzaki tercatat tepat Rp540.000");

// -------------------------------------------------------------------------
// SKENARIO 4 & 5: Pre-Order (DP, Pelunasan, Pengakuan HPP PO, Fulfillment)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 4 & 5: Pre-Order (DP, Pelunasan, Pengakuan HPP PO pada settlement_date, Fulfillment)");

// Buat PO di Bulan Oktober (10 Oktober) dengan DP 500k dari total 1.400k
const po1 = POService.createPreOrder({
  customer_name: "Pelanggan PO SM4",
  customer_contact: "08123456789",
  order_date: "2026-10-10",
  initial_payment: {
    amount: 500000,
    payment_method: "TRANSFER_BCA",
    payment_date: "2026-10-10",
    notes: "DP Awal PO"
  },
  items: [
    { variant_id: testVariantId, quantity: 4, selling_price: 350000, total_order: 1400000 }
  ],
  created_by: "admin1"
});

assert(po1.success === true, "PO berhasil dibuat di bulan Oktober dengan DP Rp500.000");

// Verifikasi Laporan Laba Rugi Oktober: DP BUKAN omzet!
const octIncomeBeforeSettlement = FinancialService.calculateMonthlyIncomeStatement(10, 2026);
const octPOOmzet = octIncomeBeforeSettlement.revenue_breakdown.po_recognized_omzet;
assert(octPOOmzet === 0, "Omzet PO di bulan Oktober adalah Rp0 (DP bukan omzet)");

// Pelunasan PO dilakukan pada 12 November (Bulan 11)
const payPO = POService.recordPayment(po1.po_id, {
  amount: 900000,
  payment_method: "TRANSFER_BCA",
  payment_date: "2026-11-12",
  notes: "Pelunasan sisa tagihan PO",
  created_by: "admin1"
});

assert(payPO.payment_status === "PAID", "PO berstatus PAID setelah pelunasan Rp900.000");
assert(payPO.settlement_date === "2026-11-12", "settlement_date tercatat 2026-11-12");

// Alokasi stok untuk PO: 4 unit dialokasikan dari persediaan
const allocPO = POService.allocateStockForPO(po1.po_id, "OWNED", "admin1");
assert(allocPO.success === true, "Stok 4 unit berhasil di-booking untuk PO");
assert(allocPO.allocated_hpp === 4 * 215000, "HPP PO dialokasikan Rp860.000 (4 unit x Rp215.000 unit cost FIFO)");

// Verifikasi Pengakuan Omzet & HPP PO di Bulan November
const novIncomeStatement = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(novIncomeStatement.revenue_breakdown.po_recognized_omzet === 1400000, "Omzet PO diakui penuh Rp1.400.000 pada bulan November (settlement_date)");
assert(novIncomeStatement.hpp_breakdown.po_recognized_hpp === 860000, "HPP PO diakui tepat Rp860.000 pada bulan November");

// Fulfillment PO: Penyerahan barang kepada pelanggan
const fulfill = POService.fulfillPO(po1.po_id, "OWNED", "admin1");
assert(fulfill.fulfillment_status === "DELIVERED", "Fulfillment PO berhasil (DELIVERED)");

// Verifikasi fulfillment TIDAK menciptakan omzet atau HPP ganda
const novIncomeAfterFulfill = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(novIncomeAfterFulfill.revenue_breakdown.po_recognized_omzet === 1400000, "Omzet PO tetap Rp1.400.000 (tidak ada omzet ganda saat fulfillment)");
assert(novIncomeAfterFulfill.hpp_breakdown.total_hpp === (430000 + 860000), "Total HPP = HPP Retail (430k) + HPP PO (860k) = Rp1.290.000 (HPP tidak dihitung dua kali)");

// -------------------------------------------------------------------------
// SKENARIO 6: Saldo Awal Kas Pembukaan & Rekonsiliasi Kas (2026-10-01)
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 6: Saldo Awal Kas Pembukaan & Rekonsiliasi Kas (2026-10-01)");

// Sebelum saldo pembukaan diverifikasi: status adalah NEEDS_RECONCILIATION
const octCashBeforeVerification = FinancialService.getMonthlyCashFlowStatement(10, 2026);
assert(octCashBeforeVerification.reconciliation_status === "NEEDS_RECONCILIATION", "Sebelum verifikasi Owner, status kas adalah NEEDS_RECONCILIATION");
assert(octCashBeforeVerification.ending_cash === null, "Ending cash bernilai null karena saldo awal belum diverifikasi");

// Owner memverifikasi saldo pembukaan kas per 1 Oktober 2026:
// Kas Tunai: Rp5.000.000, Rekening Bank: Rp20.000.000, E-Wallet: Rp0 -> Total: Rp25.000.000
const verifyOpening = FinancialService.recordOpeningCashBalance({
  opening_date: "2026-10-01",
  cash_in_hand: 5000000,
  bank_balance: 20000000,
  ewallet_balance: 0,
  source_evidence: "Rekening koran BCA & Brankas Toko",
  notes: "Saldo pembukaan awal per 1 Oktober 2026 disetujui Owner"
}, ownerToken);

assert(verifyOpening.success === true, "Saldo pembukaan kas per 1 Oktober 2026 berhasil diverifikasi");
assert(verifyOpening.opening_data.total_opening_cash === 25000000, "Total saldo awal kas = Rp25.000.000");

// Verifikasi Laporan Arus Kas Oktober setelah diverifikasi
const octCashFlow = FinancialService.getMonthlyCashFlowStatement(10, 2026);
assert(octCashFlow.reconciliation_status === "RECONCILED", "Status arus kas Oktober kini RECONCILED");
assert(octCashFlow.beginning_cash === 25000000, "Saldo awal kas Oktober = Rp25.000.000");
// Kas Masuk Oktober: DP PO Rp500.000
assert(octCashFlow.cash_inflows.total_cash_inflow === 500000, "Total kas masuk Oktober = Rp500.000 (DP PO)");
// Saldo Akhir Oktober = 25.000.000 + 500.000 = Rp25.500.000
assert(octCashFlow.ending_cash === 25500000, "Saldo akhir kas Oktober = Rp25.500.000");

// Verifikasi Estafet ke Saldo Awal November:
const novCashFlow = FinancialService.getMonthlyCashFlowStatement(11, 2026);
assert(novCashFlow.beginning_cash === 25500000, "Saldo awal November otomatis mengambil saldo akhir Oktober (Rp25.500.000)");

// -------------------------------------------------------------------------
// SKENARIO 7: Pembayaran Supplier Bertahap & Settlement Vendor
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 7: Pembayaran Supplier Bertahap & Settlement Vendor");

// Bayar faktur pembelian invoice1 secara bertahap via recordPurchasePayment: DP 1.000.000
const paySupplier1 = InventoryService.recordPurchasePayment({
  purchase_id: invoice1.purchase_id,
  amount: 1000000,
  payment_date: "2026-11-10",
  payment_method: "TRANSFER_BCA",
  idempotency_key: "IDEM-PUR-PAY-SM4-01",
  created_by: "hafiz"
});
assert(paySupplier1.success === true, "Pembayaran DP faktur supplier Rp1.000.000 berhasil");
assert(paySupplier1.remaining_bill === 1050000, "Sisa tagihan supplier = 2.050.000 - 1.000.000 = Rp1.050.000");

// Bayar kewajiban vendor Dzaki via VendorService.executeSettlement: transfer 540.000
const dzakiSettlement = VendorService.executeSettlement({
  vendor_id: "VND-DZAKI",
  settlement_date: "2026-11-14",
  payment_method: "TRANSFER_BCA",
  notes: "Pelunasan hak konsinyasi Dzaki 2 unit"
}, ownerToken);
assert(dzakiSettlement.success === true, "Settlement kewajiban vendor Dzaki Rp540.000 berhasil");
assert(dzakiSettlement.total_net_payout === 540000, "Net transfer ke Dzaki = Rp540.000");

// Catat Beban Operasional: Sewa Gudang Rp500.000
const exp1 = FinancialService.recordOperationalExpense({
  expense_date: "2026-11-15",
  category: "SEWA_TEMPAT",
  description: "Sewa tempat & gudang November",
  amount: 500000,
  payment_method: "TRANSFER_BCA",
  created_by: "hafiz"
});
assert(exp1.success === true, "Beban operasional sewa gudang Rp500.000 berhasil dicatat");

// -------------------------------------------------------------------------
// SKENARIO 8: Komparasi Laba Rugi vs Arus Kas November
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 8: Komparasi Laba Rugi vs Arus Kas November");

const novPnlFinal = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
// Total Omzet = 700.000 (Retail) + 20.000 (Insentif Konsinyasi) + 1.400.000 (PO) = Rp2.120.000
assert(novPnlFinal.revenue_breakdown.total_omzet === 2120000, "Total Omzet November = Rp2.120.000");
// Total HPP = 430.000 (Retail) + 860.000 (PO) = Rp1.290.000
assert(novPnlFinal.hpp_breakdown.total_hpp === 1290000, "Total HPP November = Rp1.290.000");
// Laba Kotor = 2.120.000 - 1.290.000 = Rp830.000
assert(novPnlFinal.gross_profit === 830000, "Laba Kotor November = Rp830.000");
// Beban Operasional = Rp500.000
assert(novPnlFinal.expenses_breakdown.operational_expenses === 500000, "Beban Operasional November = Rp500.000");
// Laba Bersih = 830.000 - 500.000 = Rp330.000
assert(novPnlFinal.net_profit === 330000, "Laba Bersih Operasional November = Rp330.000");

const novCashFlowFinal = FinancialService.getMonthlyCashFlowStatement(11, 2026);
// Kas Masuk November = 700.000 (Retail) + 560.000 (Konsinyasi Bruto) + 900.000 (Pelunasan PO) = Rp2.160.000
assert(novCashFlowFinal.cash_inflows.total_cash_inflow === 2160000, "Total Kas Masuk November = Rp2.160.000");
// Kas Keluar November = 1.000.000 (Supplier) + 540.000 (Vendor Settlement) + 500.000 (Beban) = Rp2.040.000
assert(novCashFlowFinal.cash_outflows.total_cash_outflow === 2040000, "Total Kas Keluar November = Rp2.040.000");
// Net Cash Flow November = 2.160.000 - 2.040.000 = +Rp120.000
assert(novCashFlowFinal.net_cash_flow === 120000, "Net Cash Flow November = +Rp120.000");
// Saldo Akhir Kas = 25.500.000 + 120.000 = Rp25.620.000
assert(novCashFlowFinal.ending_cash === 25620000, "Saldo Akhir Kas November = Rp25.620.000");
assert(novCashFlowFinal.net_cash_flow !== novPnlFinal.net_profit, "Terbukti Saldo Kas Bersih (+120k) != Laba Bersih (+330k)");

// UJI REMEDIASI 2: Klasifikasi Kewajiban Setoran Vendor Berjalan (Bukan Restricted Cash)
assert(novCashFlowFinal.vendor_payables_liability !== undefined, "Laporan arus kas memiliki objek vendor_payables_liability");
assert(novCashFlowFinal.vendor_payables_liability.title === "Kewajiban Setoran Vendor Berjalan", "Judul klasifikasi: 'Kewajiban Setoran Vendor Berjalan'");
assert(novCashFlowFinal.vendor_payables_liability.vendor_payables_outstanding === 0, "Setelah settlement Rp540.000 dibayarkan di Skenario 7, sisa kewajiban vendor berjalan tepat Rp0");
assert(novCashFlowFinal.vendor_payables_liability.operating_cash_after_vendor_obligations === 25620000, "Estimasi kas operasional setelah kewajiban vendor lunas = Rp25.620.000");
assert(novCashFlowFinal.ending_cash === 25620000, "Saldo kas akhir aktual tetap tepat Rp25.620.000 (tidak berubah)");

// -------------------------------------------------------------------------
// SKENARIO 9: Month-End Closing November & Pembagian Keuntungan 4 Pos
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 9: Month-End Closing November & Pembagian Keuntungan 4 Pos");

// UJI REMEDIASI 1: Hard Guard pada ClosingService.closePeriod()
// Simulasikan ada PO lunas yang HPP-nya masih PENDING_ALLOCATION
DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", po1.po_id, {
  allocated_hpp: 0,
  hpp_status: "PENDING_ALLOCATION"
});

// a. Verifikasi Laba Rugi mendeteksi po_pending_hpp_count === 1
const pnlPendingCheck = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(pnlPendingCheck.hpp_breakdown.po_pending_hpp_count === 1, "Laba Rugi mendeteksi 1 PO lunas dengan HPP belum lengkap (PENDING_ALLOCATION)");

// b. Verifikasi Preview Closing menandai NEEDS_RECONCILIATION
const prevPendingCheck = ClosingService.previewMonthlyReport(11, 2026);
assert(prevPendingCheck.closing_readiness === "NEEDS_RECONCILIATION", "Preview closing menandai closing_readiness: NEEDS_RECONCILIATION");

// c. Eksekusi closePeriod() langsung di backend: HARUS DITOLAK KERAS!
let hardGuardError = null;
const snapshotsBeforeReject = DatabaseHelper.getAllRows("CLOSING_BULANAN").length;
try {
  ClosingService.closePeriod(11, 2026, ownerToken, "Mencoba closing saat PO pending HPP");
} catch (err) {
  hardGuardError = err.message;
}
assert(hardGuardError !== null, "closePeriod() menolak keras eksekusi penutupan buku saat ada PO pending HPP");
assert(hardGuardError.includes("PENDING_ALLOCATION"), "Pesan error memuat penjelasan PENDING_ALLOCATION");

// d. Verifikasi penolakan tidak membuat snapshot baru dan tidak mengubah status periode
const snapshotsAfterReject = DatabaseHelper.getAllRows("CLOSING_BULANAN").length;
assert(snapshotsAfterReject === snapshotsBeforeReject, "Zero snapshot dibuat di CLOSING_BULANAN saat penutupan ditolak");
const periodStatusBeforeAlloc = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", "PER-2026-11").period_status;
assert(periodStatusBeforeAlloc === "OPEN", "Status PER-2026-11 tetap OPEN saat penutupan ditolak");

// e. Kembalikan alokasi HPP po1 secara sah (4 unit x Rp215.000 = Rp860.000)
DatabaseHelper.updateRowByPk("PRE_ORDER", "po_id", po1.po_id, {
  allocated_hpp: 860000,
  hpp_status: "RECOGNIZED"
});
const pnlResolvedCheck = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
assert(pnlResolvedCheck.hpp_breakdown.po_pending_hpp_count === 0, "po_pending_hpp_count kembali 0 setelah HPP dialokasikan");

// Preview Closing
const previewNov = ClosingService.previewMonthlyReport(11, 2026);
assert(previewNov.closing_readiness === "READY_TO_CLOSE", "Status preview closing adalah READY_TO_CLOSE");
// Alokasi Laba Bersih Rp330.000:
// Owner 1: 20% = 66.000
// Owner 2: 20% = 66.000
// Dana Darurat: 10% = 33.000
// Retained Profit: 50% = 165.000
assert(previewNov.profit_distribution.allocations.owner1_amount === 66000, "Alokasi Owner 1 = Rp66.000");
assert(previewNov.profit_distribution.allocations.owner2_amount === 66000, "Alokasi Owner 2 = Rp66.000");
assert(previewNov.profit_distribution.allocations.emergency_amount === 33000, "Alokasi Dana Darurat = Rp33.000");
assert(previewNov.profit_distribution.allocations.retained_amount === 165000, "Alokasi Retained Profit = Rp165.000");

// Eksekusi Tutup Buku November
const closeNov = ClosingService.closePeriod(11, 2026, ownerToken, "Tutup buku resmi November 2026 V1");
assert(closeNov.success === true, "Tutup buku November 2026 V1 berhasil");
assert(closeNov.period_status === "CLOSED", "Status periode berubah menjadi CLOSED");

// Verifikasi Mencegah Closing Ganda
let doubleCloseError = null;
try {
  ClosingService.closePeriod(11, 2026, ownerToken, "Mencoba closing ganda");
} catch (err) {
  doubleCloseError = err.message;
}
assert(doubleCloseError !== null, "Closing ganda pada periode CLOSED berhasil ditolak");

// Verifikasi Mencegah Transaksi Baru pada Periode CLOSED
let closedTxError = null;
try {
  ClosingService.assertPeriodOpenForTransaction("2026-11-20");
} catch (err) {
  closedTxError = err.message;
}
assert(closedTxError !== null, "Transaksi pada tanggal periode CLOSED berhasil ditolak");

// -------------------------------------------------------------------------
// SKENARIO 10: Penarikan Kas Owner (Withdrawal) & Prosedur Reopen Multi-Versi
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 10: Penarikan Kas Owner (Withdrawal) & Prosedur Reopen");

// Owner 1 menarik dana Rp60.000 dari hak alokasinya (66.000)
const withdraw1 = ClosingService.recordFundWithdrawal("OWNER_1", 60000, ownerToken, "Tarik dividen Owner 1");
assert(withdraw1.success === true, "Penarikan kas fisik Owner 1 Rp60.000 berhasil");
assert(withdraw1.remaining_balance === 6000, "Sisa saldo pos Owner 1 adalah Rp6.000");

// Owner melakukan Reopen Periode November karena koreksi transaksi
const reopenNov = ClosingService.reopenPeriod("PER-2026-11", ownerToken, "Koreksi pencatatan operasional tertinggal");
assert(reopenNov.success === true, "Reopen periode PER-2026-11 berhasil");
assert(reopenNov.new_version === 2, "Versi closing naik menjadi V2");
assert(reopenNov.period_status === "OPEN", "Status periode kembali menjadi OPEN");

// Snapshot V1 di CLOSING_BULANAN tetap utuh tersimpan (tidak terhapus)
const snapshots = DatabaseHelper.getAllRows("CLOSING_BULANAN", c => c.period_id === "PER-2026-11");
assert(snapshots.length >= 1, "Snapshot lama di CLOSING_BULANAN tetap tersimpan utuh sebagai audit trail");

// Cek Saldo Dana: Karena alokasi V1 (66.000) dibalik via ADJUSTMENT (-66.000), sedangkan penarikan fisik (60.000) sudah keluar,
// maka saldo Owner 1 kini mencatat defisit -Rp60.000 (Piutang Bisnis kepada Owner)
const balancesAfterReopen = ClosingService.getFundBalances();
assert(balancesAfterReopen.balances.OWNER_1 === -60000, "Saldo Owner 1 mencatat defisit -Rp60.000 akibat penarikan sebelum reopen");
assert(balancesAfterReopen.has_overdrawn_owner === true, "Sistem mendeteksi has_overdrawn_owner: true (piutang modal)");

// Tutup Ulang Periode (Re-Closing V2):
const recloseNov = ClosingService.closePeriod(11, 2026, ownerToken, "Tutup buku ulang November 2026 V2");
assert(recloseNov.success === true, "Tutup buku ulang (V2) berhasil");
assert(recloseNov.closing_version === 2, "Versi closing terkonfirmasi V2");

// Setelah alokasi V2 masuk kembali (+66.000), saldo Owner 1 otomatis pulih: -60.000 + 66.000 = +Rp6.000
const balancesAfterReclose = ClosingService.getFundBalances();
assert(balancesAfterReclose.balances.OWNER_1 === 6000, "Saldo Owner 1 otomatis pulih menjadi +Rp6.000 tanpa dobel alokasi atau dobel penarikan");

// -------------------------------------------------------------------------
// SKENARIO 11: Validasi RBAC Owner vs Admin
// -------------------------------------------------------------------------
console.log("\n▶ Skenario 11: Validasi RBAC Owner vs Admin");

// Simulasi token Admin
global.AuthService.requireOwner = () => {
  throw new Error("Akses ditolak: Hanya Owner yang berwenang.");
};

let adminCloseError = null;
try {
  ClosingService.closePeriod(12, 2026, "TOKEN-ADMIN", "Admin mencoba tutup buku");
} catch (err) {
  adminCloseError = err.message;
}
assert(adminCloseError !== null, "Admin ditolak keras saat mencoba menjalankan closing bulanan");

let adminReopenError = null;
try {
  ClosingService.reopenPeriod("PER-2026-11", "TOKEN-ADMIN", "Admin mencoba reopen");
} catch (err) {
  adminReopenError = err.message;
}
assert(adminReopenError !== null, "Admin ditolak keras saat mencoba menjalankan reopen periode");

// =========================================================================
// REKAPITULASI HASIL PENGUJIAN
// =========================================================================
console.log("\n==========================================================================");
console.log("REKAPITULASI HASIL PENGUJIAN PHASE 3D SUB-MODUL 4");
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
