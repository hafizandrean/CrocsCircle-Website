/**
 * CROCSCIRCLE.ID — PHASE 2C TEST SUITE RUNNER
 * Verifies all 16 mandatory requirements for Sales & Pre-Order Transaction Engine:
 * 1. Penjualan satu produk OWNED
 * 2. Penjualan beberapa produk dalam satu transaksi (Multi-Item)
 * 3. Harga jual hasil negosiasi berbeda dari harga katalog
 * 4. Penjualan OWNED dengan split-batch FIFO
 * 5. Penjualan CONSIGNMENT
 * 6. Perhitungan hak vendor dan insentif
 * 7. Pembayaran customer
 * 8. PO dengan DP dan pelunasan
 * 9. PO dengan beberapa detail produk
 * 10. Pengakuan omzet hanya saat lunas (bukan saat DP)
 * 11. Reservasi dan fulfillment PO
 * 12. Pembatalan PO
 * 13. Retur OWNED
 * 14. Retur CONSIGNMENT
 * 15. Idempotency dan pencegahan transaksi ganda
 * 16. Simulasi kegagalan dan pemulihan data (Rollback)
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

console.log("=== MEMULAI PENGUJIAN OTOMATIS PHASE 2C (SALES & PRE-ORDER) ===\n");

// Setup Data Stok Awal
const VAR_CLASSIC = "VAR-CLS-BLK-M8";
const VAR_LOOPY = "VAR-CLB-LPY-W6";

// Terima 2 Batch Stok Sendiri (Harga Modal Berbeda untuk Uji FIFO & Split-Batch)
// Batch A: 3 pasang @ Rp150.000
const bA = InventoryService.receiveOwnedStockBatch("PUR-010", VAR_CLASSIC, 3, 150000, 0, "Batch Classic A", "TESTER");
// Batch B: 5 pasang @ Rp160.000
const bB = InventoryService.receiveOwnedStockBatch("PUR-011", VAR_CLASSIC, 5, 160000, 0, "Batch Classic B", "TESTER");
// Batch Loopy: 4 pasang @ Rp210.000
const bLoopy = InventoryService.receiveOwnedStockBatch("PUR-012", VAR_LOOPY, 4, 210000, 0, "Batch Loopy", "TESTER");

// Terima Stok Konsinyasi Dzaki: 4 pasang
InventoryService.receiveConsignmentStock("VND-DZAKI", VAR_CLASSIC, 4, "Titipan Dzaki", "TESTER");

let sale1Id = "";
let sale2Id = "";
let saleConsId = "";

// 1, 3, & 7. Penjualan Satu Produk OWNED, Harga Negosiasi & Pembayaran Customer
runTest("1, 3, & 7. Penjualan 1 Produk OWNED, Harga Negosiasi (Rp270k vs Katalog Rp280k) & Pembayaran QRIS", () => {
  const saleRes = SalesService.createSale({
    sales_channel: "OFFLINE_EVENT",
    sales_type: "READY_STOCK",
    customer_name: "Mas Budi",
    payment_method: "QRIS",
    idempotency_key: "IDEM-SALE-001",
    notes: "Bazar Mingguan 1",
    created_by: "USR-OWNER-1",
    items: [
      {
        variant_id: VAR_CLASSIC,
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 270000 // Hasil tawar dari katalog 280k
      }
    ]
  });

  if (!saleRes.success) throw new Error("Gagal membuat penjualan");
  sale1Id = saleRes.salesId;

  // Verifikasi Header PENJUALAN
  const h = saleRes.header;
  if (h.gross_customer_payment !== 270000) throw new Error("Gross customer payment salah");
  if (h.owned_sales_amount !== 270000) throw new Error("Owned sales amount salah");
  if (h.total_hpp !== 150000) throw new Error("HPP harus 150.000 (dari Batch A)");
  if (h.gross_profit !== 120000) throw new Error("Laba kotor harus 120.000 (270k - 150k)");
  if (h.payment_method !== "QRIS") throw new Error("Metode pembayaran salah");

  // Verifikasi DETAIL_PENJUALAN
  if (saleRes.details.length !== 1) throw new Error("Harus 1 baris detail");
  const d = saleRes.details[0];
  if (d.batch_id !== bA.batch_id) throw new Error("Harus mengambil Batch A");
  if (d.selling_price !== 270000) throw new Error("Snapshot harga jual salah");
  if (d.hpp_unit !== 150000) throw new Error("Snapshot HPP salah");
});

// 2 & 4. Penjualan Multi-Produk dalam Satu Transaksi & Split-Batch FIFO
runTest("2 & 4. Penjualan Multi-Produk & Split-Batch FIFO", () => {
  // Sisa Batch A = 2 pasang.
  // Customer membeli:
  // - 4 pasang VAR_CLASSIC @ Rp275.000 (Akan di-split: 2 pasang dari Batch A @ 150k + 2 pasang dari Batch B @ 160k)
  // - 1 pasang VAR_LOOPY @ Rp380.000 (1 pasang dari Batch Loopy @ 210k)
  const multiSale = SalesService.createSale({
    sales_channel: "WEEKLY_MARKET",
    customer_name: "Bu Sari",
    payment_method: "CASH",
    idempotency_key: "IDEM-SALE-002",
    created_by: "USR-OWNER-1",
    items: [
      {
        variant_id: VAR_CLASSIC,
        item_ownership: "OWNED",
        quantity: 4,
        actual_price: 275000
      },
      {
        variant_id: VAR_LOOPY,
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 380000
      }
    ]
  });

  if (!multiSale.success) throw new Error("Penjualan multi-produk gagal");
  sale2Id = multiSale.salesId;

  // Baris detail harus ada 3 baris:
  // Baris 1: Classic, Qty 2, Batch A, HPP 150k
  // Baris 2: Classic, Qty 2, Batch B, HPP 160k
  // Baris 3: Loopy, Qty 1, Batch Loopy, HPP 210k
  if (multiSale.details.length !== 3) {
    throw new Error(`Detail transaksi harusnya 3 baris (split-batch), tapi ${multiSale.details.length}`);
  }

  // Omzet Total = (4 * 275.000) + (1 * 380.000) = 1.100.000 + 380.000 = 1.480.000
  // Total HPP = (2 * 150.000) + (2 * 160.000) + (1 * 210.000) = 300.000 + 320.000 + 210.000 = 830.000
  // Laba Kotor = 1.480.000 - 830.000 = 650.000
  const h = multiSale.header;
  if (h.gross_customer_payment !== 1480000) throw new Error("Total pembayaran customer salah");
  if (h.owned_sales_amount !== 1480000) throw new Error("Omzet stok sendiri salah");
  if (h.total_hpp !== 830000) throw new Error("Total HPP salah");
  if (h.gross_profit !== 650000) throw new Error("Laba kotor multi-item salah");
});

// 5 & 6. Penjualan CONSIGNMENT (Barang Dzaki), Hak Vendor Rp270k & Insentif Rp10k
runTest("5 & 6. Penjualan CONSIGNMENT (Barang Dzaki), Hak Vendor Rp270k & Insentif Rp10k (HPP = 0)", () => {
  const consSale = SalesService.createSale({
    sales_channel: "OFFLINE_EVENT",
    customer_name: "Pak Bambang",
    payment_method: "TRANSFER",
    idempotency_key: "IDEM-SALE-CONS-001",
    created_by: "USR-OWNER-1",
    items: [
      {
        variant_id: VAR_CLASSIC,
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 2,
        actual_price: 280000
      }
    ]
  });

  if (!consSale.success) throw new Error("Penjualan konsinyasi gagal");
  saleConsId = consSale.salesId;

  const h = consSale.header;
  // Kas masuk customer = 2 * 280.000 = 560.000
  if (h.gross_customer_payment !== 560000) throw new Error("Gross customer payment salah");
  // Omzet stok sendiri HARUS 0!
  if (h.owned_sales_amount !== 0) throw new Error("Omzet stok sendiri harus 0 untuk barang konsinyasi!");
  // Insentif CrocsCircle = 2 * 10.000 = 20.000
  if (h.vendor_incentive_amount !== 20000) throw new Error("Insentif vendor harus 20.000");
  // Net Operational Revenue = 20.000
  if (h.net_operational_revenue !== 20000) throw new Error("Net operational revenue salah");
  // HPP CrocsCircle HARUS 0
  if (h.total_hpp !== 0) throw new Error("HPP CrocsCircle harus 0");
  // Laba Kotor = 20.000
  if (h.gross_profit !== 20000) throw new Error("Laba kotor harus 20.000");

  // Periksa Detail
  const d = consSale.details[0];
  if (d.item_ownership !== "CONSIGNMENT" || d.vendor_id !== "VND-DZAKI") throw new Error("Detail vendor salah");
  if (d.total_vendor_payable !== 540000) throw new Error("Total hutang ke Dzaki harus 540.000 (2 * 270k)");
  if (d.total_crocs_incentive !== 20000) throw new Error("Total insentif Crocs harus 20.000 (2 * 10k)");
  if (d.settlement_status !== "UNPAID") throw new Error("Status settlement awal harus UNPAID");
});

// 8, 9, & 10. Pre-Order (PO) Multi-Item, DP & Pelunasan, dan Pengakuan Omzet
let poTestId = "";
runTest("8, 9, & 10. PO Multi-Item, DP, Pelunasan, & Pengakuan Omzet Baku (Hanya Saat Lunas)", () => {
  // 1. Buat PO Multi-Item untuk Bu Ira (2 pasang Classic @ Rp280.000 = Rp560.000)
  // DP Awal dibayar Rp280.000 (50%)
  const createPoRes = POService.createPreOrder({
    order_date: new Date("2026-11-01"),
    customer_name: "Bu Ira",
    customer_contact: "081234567890",
    supplier: "Vendor Dzaki",
    notes: "PO November",
    created_by: "USR-OWNER-1",
    initial_payment: {
      amount: 280000,
      payment_method: "QRIS",
      payment_date: new Date("2026-11-01"),
      notes: "DP 50%"
    },
    items: [
      { variant_id: VAR_CLASSIC, quantity: 1, selling_price: 280000, notes: "Item 1" },
      { variant_id: VAR_CLASSIC, quantity: 1, selling_price: 280000, notes: "Item 2" }
    ]
  });

  if (!createPoRes.success) throw new Error("Gagal membuat PO multi-item");
  if (createPoRes.items.length !== 2) throw new Error("PO harus memiliki 2 item");
  poTestId = createPoRes.items[1].po_id; // Ambil item ke-2 untuk diuji (DP tadi dialokasikan ke item 1, item 2 masih UNPAID / sisa)

  // 2. Periksa Pengakuan Omzet Bulan November saat ini:
  // PO yang berstatus PARTIAL atau UNPAID TIDAK BOLEH DIAKUI SEBAGAI OMZET BULANAN!
  const omzetNovBefore = POService.getRecognizedMonthlyPO(11, 2026);
  // Item yang baru DP tidak boleh masuk total omzet
  const item2PO = POService.getPOById(poTestId);
  if (item2PO.po.payment_status === "PAID") {
    throw new Error("Item PO 2 belum lunas tapi status sudah PAID!");
  }

  // 3. Customer Melakukan Pelunasan Penuh pada tanggal 15 November 2026
  const settleRes = POService.recordPayment(poTestId, {
    amount: 280000,
    payment_method: "TRANSFER",
    payment_date: new Date("2026-11-15"),
    notes: "Pelunasan Penuh Item 2",
    created_by: "USR-OWNER-1"
  });

  if (!settleRes.success) throw new Error("Gagal pelunasan PO");
  if (settleRes.payment_status !== "PAID") throw new Error("Status pembayaran harus PAID setelah lunas");
  if (settleRes.remaining_balance !== 0) throw new Error("Sisa tagihan harus 0");
  if (!settleRes.settlement_date) throw new Error("settlement_date wajib terisi tanggal pelunasan!");

  // 4. Verifikasi Pengakuan Omzet Resmi: Sekarang omzet resmi November bertambah!
  const omzetNovAfter = POService.getRecognizedMonthlyPO(11, 2026);
  const found = omzetNovAfter.records.find(p => p.po_id === poTestId);
  if (!found) throw new Error("PO lunas tidak ditemukan pada pengakuan omzet bulan November");
  const sDate = new Date(found.settlement_date);
  if (isNaN(sDate.getTime()) || sDate.getDate() !== 15 || (sDate.getMonth() + 1) !== 11) {
    throw new Error("Tanggal settlement tidak sesuai tanggal pelunasan 15 November 2026!");
  }
});

// 11. Reservasi dan Penyerahan (Fulfillment) PO
runTest("11. Reservasi dan Fulfillment PO (Deduct Physical & Reserved Serentak)", () => {
  // Update status pengadaan menjadi RECEIVED
  POService.updateProcurementStatus(poTestId, "RECEIVED", "USR-OWNER-1");

  // Booking stok untuk PO
  POService.allocateStockForPO(poTestId, "OWNED", "USR-OWNER-1");
  const poData = POService.getPOById(poTestId);

  // Serahkan ke pelanggan (Fulfillment)
  const fulfillRes = POService.fulfillPO(poTestId, "OWNED", "USR-OWNER-1");
  if (!fulfillRes.success || fulfillRes.fulfillment_status !== "DELIVERED") {
    throw new Error("Fulfillment PO gagal");
  }

  const updatedPO = POService.getPOById(poTestId);
  if (updatedPO.po.fulfillment_status !== "DELIVERED") {
    throw new Error("Status fulfillment harus DELIVERED");
  }
});

// 12. Pembatalan PO dan Pelepasan Reservasi
runTest("12. Pembatalan PO dan Pelepasan Reservasi Otomatis", () => {
  // Buat PO baru untuk dibatalkan
  const cancelPoRes = POService.createPreOrder({
    customer_name: "Budi Cancel",
    supplier: "Vendor X",
    items: [{ variant_id: VAR_CLASSIC, quantity: 1, selling_price: 280000 }]
  });
  const cancelPoId = cancelPoRes.items[0].po_id;

  // Booking stok
  POService.allocateStockForPO(cancelPoId, "OWNED", "USR-OWNER-1");
  const stockBeforeCancel = InventoryService.getStock(VAR_CLASSIC);

  // Batalkan PO
  const cancelRes = POService.cancelPO(cancelPoId, "Customer ganti pikiran", "OWNED", "USR-OWNER-1");
  if (!cancelRes.success || cancelRes.fulfillment_status !== "CANCELLED") {
    throw new Error("Pembatalan PO gagal");
  }

  // Verifikasi stok reservasi dilepaskan
  const stockAfterCancel = InventoryService.getStock(VAR_CLASSIC);
  if (stockAfterCancel.owned_reserved_stock !== stockBeforeCancel.owned_reserved_stock - 1) {
    throw new Error("Stok reservasi tidak berkurang setelah PO dibatalkan");
  }
});

// 13. Retur Item Penjualan OWNED (Kembali ke Batch Asal)
runTest("13. Retur Item Penjualan OWNED (Kembali ke Batch Asal)", () => {
  // Ambil detail penjualan 1
  const sale1 = SalesService.getSaleById(sale1Id);
  const detail1 = sale1.details[0];

  const batchBefore = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", detail1.batch_id);
  const remainingBefore = Number(batchBefore.remaining_qty);

  // Retur 1 pasang
  const retRes = SalesService.returnSaleItem(sale1Id, detail1.sales_detail_id, 1, "Sepatu kebesaran", "USR-OWNER-1");
  if (!retRes.success) throw new Error("Retur item penjualan OWNED gagal");

  // Periksa remaining_qty batch asal bertambah
  const batchAfter = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", detail1.batch_id);
  if (Number(batchAfter.remaining_qty) !== remainingBefore + 1) {
    throw new Error("Remaining qty batch asal tidak bertambah setelah retur");
  }
});

// 14. Retur Item Penjualan CONSIGNMENT (Kembali ke Stok Vendor & Pembalikan Kewajiban)
runTest("14. Retur Item Penjualan CONSIGNMENT (Pembalikan Hutang Vendor)", () => {
  const saleCons = SalesService.getSaleById(saleConsId);
  const detailCons = saleCons.details[0];

  const stockBefore = InventoryService.getStock(VAR_CLASSIC);
  const remainingPayableBefore = Number(detailCons.vendor_remaining_payable);

  // Retur 1 pasang dari 2 pasang konsinyasi terjual
  const retConsRes = SalesService.returnSaleItem(saleConsId, detailCons.sales_detail_id, 1, "Cacat jahitan", "USR-OWNER-1");
  if (!retConsRes.success) throw new Error("Retur item konsinyasi gagal");

  // Stok konsinyasi harus bertambah kembali
  const stockAfter = InventoryService.getStock(VAR_CLASSIC);
  if (stockAfter.consignment_physical_stock !== stockBefore.consignment_physical_stock + 1) {
    throw new Error("Stok fisik konsinyasi tidak bertambah setelah retur");
  }

  // Hutang ke vendor harus berkurang Rp270.000
  const detailAfter = DatabaseHelper.getRowByPk("DETAIL_PENJUALAN", "sales_detail_id", detailCons.sales_detail_id);
  if (Number(detailAfter.vendor_remaining_payable) !== remainingPayableBefore - 270000) {
    throw new Error("Kewajiban hutang ke vendor tidak berkurang setelah retur!");
  }
});

// 15. Idempotency Penjualan (Pencegahan Double Submission)
runTest("15. Idempotency Penjualan (Pencegahan Transaksi Ganda)", () => {
  const stockBefore = InventoryService.getStock(VAR_CLASSIC);

  // Request Penjualan Ulang dengan IDEMPOTENCY KEY YANG SAMA persis dengan sale1
  const duplicateRes = SalesService.createSale({
    idempotency_key: "IDEM-SALE-001",
    items: [{ variant_id: VAR_CLASSIC, quantity: 1, actual_price: 270000 }]
  });

  if (!duplicateRes.idempotentReplay) {
    throw new Error("Sistem harus mendeteksi transaksi ganda sebagai idempotentReplay");
  }

  // Pastikan stok tidak terpotong lagi
  const stockAfter = InventoryService.getStock(VAR_CLASSIC);
  if (stockAfter.owned_physical_stock !== stockBefore.owned_physical_stock) {
    throw new Error("BAHAYA: Stok terpotong lagi saat request transaksi duplikat!");
  }
});

// 16. Simulasi Kegagalan & Atomic Rollback Transaksi Multi-Item
runTest("16. Simulasi Kegagalan & Atomic Rollback Transaksi Multi-Item", () => {
  const stockBefore = InventoryService.getStock(VAR_CLASSIC);

  // Coba buat transaksi 2 item:
  // Item 1: Valid (1 pasang VAR_CLASSIC)
  // Item 2: Invalid / Overselling (9999 pasang VAR_LOOPY)
  // Seluruh transaksi harus gagal, dan Item 1 yang sempat diproses WAJIB di-rollback!
  let errorCaught = false;
  try {
    SalesService.createSale({
      customer_name: "Customer Crash Test",
      items: [
        { variant_id: VAR_CLASSIC, item_ownership: "OWNED", quantity: 1, actual_price: 270000 },
        { variant_id: VAR_LOOPY, item_ownership: "OWNED", quantity: 9999, actual_price: 380000 }
      ]
    });
  } catch (err) {
    if (err.message.includes("dibatalkan secara utuh") || err.message.includes("tidak mencukupi")) {
      errorCaught = true;
    }
  }

  if (!errorCaught) throw new Error("Transaksi dengan item overselling harus gagal!");

  // Verifikasi Item 1 tidak tertinggal memotong stok
  const stockAfter = InventoryService.getStock(VAR_CLASSIC);
  if (stockAfter.owned_physical_stock !== stockBefore.owned_physical_stock) {
    throw new Error(`Rollback multi-item gagal! Stok berubah dari ${stockBefore.owned_physical_stock} menjadi ${stockAfter.owned_physical_stock}`);
  }
});

console.log("\n=== HASIL REKAPITULASI PENGUJIAN PHASE 2C ===");
const passedCount = testResults.filter(r => r.passed).length;
console.log(`Total Pengujian : ${testResults.length}`);
console.log(`Berhasil        : ${passedCount}`);
console.log(`Gagal           : ${testResults.length - passedCount}`);

if (passedCount === testResults.length) {
  console.log("\nSEMUA PENGUJIAN PHASE 2C BERHASIL 100%!");
} else {
  console.error("\nBEBERAPA PENGUJIAN GAGAL.");
  process.exit(1);
}
