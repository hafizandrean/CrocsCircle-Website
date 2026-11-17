/**
 * CROCSCIRCLE.ID — PHASE 2B TEST SUITE RUNNER
 * Verifies all 12 mandatory requirements for Inventory & FIFO Engine:
 * 1. Penerimaan batch baru
 * 2. FIFO satu batch
 * 3. FIFO split-batch
 * 4. Harga modal berbeda antarbatch
 * 5. Stok OWNED dan CONSIGNMENT terpisah
 * 6. Penjualan stok vendor tanpa HPP CrocsCircle
 * 7. Reservasi dan pelepasan reservasi
 * 8. Penyerahan PO (Fulfillment)
 * 9. Retur dan pembatalan
 * 10. Penolakan overselling
 * 11. Idempotency
 * 12. Simulasi kegagalan proses (Rollback Safety)
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

(new Function(dbHelperCode + '\nglobal.DatabaseHelper = DatabaseHelper;'))();
(new Function(initDbCode + '\nglobal.initializeCrocsCircleDatabase = initializeCrocsCircleDatabase; global.CROCS_SCHEMA_V120 = CROCS_SCHEMA_V120;'))();
(new Function(authCode + '\nglobal.AuthService = AuthService;'))();
(new Function(invCode + '\nglobal.InventoryService = InventoryService;'))();

// Initialize 21 tables
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

console.log("=== MEMULAI PENGUJIAN OTOMATIS PHASE 2B (INVENTORY & FIFO) ===\n");

const VARIANT_TEST = "VAR-CLS-BLK-M8";
let batch1Id = "";
let batch2Id = "";

// 1. Penerimaan Batch Baru (Stok OWNED)
runTest("1. Penerimaan Batch Baru (Stock In / Purchase Receipt)", () => {
  // Batch 1: 5 pasang @ Rp150.000 modal dasar + Rp0 insentif
  const res1 = InventoryService.receiveOwnedStockBatch("PUR-001", VARIANT_TEST, 5, 150000, 0, "Batch 1 Supplier A", "USR-OWNER-1");
  batch1Id = res1.batch_id;
  
  if (!res1.success || !batch1Id) throw new Error("Gagal menerima batch 1");
  if (res1.unit_cost !== 150000) throw new Error("Unit cost batch 1 salah");

  const stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_physical_stock !== 5 || stock.owned_available_stock !== 5) {
    throw new Error(`Stok fisik/available harusnya 5, tercatat ${stock.owned_physical_stock}`);
  }

  // Verifikasi Mutasi Tercatat
  const mutations = DatabaseHelper.getAllRows("MUTASI_STOK", m => m.reference_id === batch1Id);
  if (mutations.length !== 1 || mutations[0].movement_type !== "PURCHASE_RECEIPT") {
    throw new Error("Mutasi stok tidak tercatat");
  }
});

// 2. FIFO Satu Batch
runTest("2. FIFO Satu Batch (Depletion dari Batch Tertua)", () => {
  // Jual 2 pasang dari batch 1
  const res = InventoryService.depleteOwnedStockFIFO("SLS-001", VARIANT_TEST, 2, 280000, "USR-OWNER-1", "IDEM-001");
  if (!res.success || res.allocations.length !== 1) throw new Error("Alokasi 1 batch gagal");

  const alloc = res.allocations[0];
  if (alloc.batch_id !== batch1Id) throw new Error("Batch yang digunakan bukan batch 1");
  if (alloc.quantity !== 2) throw new Error("Kuantitas alokasi salah");
  if (alloc.hpp_unit !== 150000) throw new Error("HPP unit bukan 150000");
  if (alloc.total_hpp !== 300000) throw new Error("Total HPP salah");

  // Periksa sisa batch 1 di database
  const batch1Row = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batch1Id);
  if (Number(batch1Row.remaining_qty) !== 3) {
    throw new Error(`Sisa batch harusnya 3, tercatat ${batch1Row.remaining_qty}`);
  }

  const stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_physical_stock !== 3 || stock.owned_available_stock !== 3) {
    throw new Error(`Stok fisik setelah jual 2 harusnya 3, tercatat ${stock.owned_physical_stock}`);
  }
});

// 3 & 4. FIFO Split-Batch & Harga Modal Berbeda Antar Batch
runTest("3 & 4. FIFO Split-Batch & Modal Berbeda (Konsumsi 2 Batch Berbeda Harga)", () => {
  // Masukkan Batch 2: 4 pasang @ Rp160.000 (modal dasar Rp150.000 + insentif Dzaki Rp10.000)
  const res2 = InventoryService.receiveOwnedStockBatch("PUR-002", VARIANT_TEST, 4, 150000, 10000, "Batch 2 Dzaki Beli Putih", "USR-OWNER-1");
  batch2Id = res2.batch_id;

  // Kondisi saat ini:
  // Batch 1: sisa 3 pasang @ Rp150.000
  // Batch 2: sisa 4 pasang @ Rp160.000
  // Total stok sendiri = 7 pasang

  // Customer beli 5 pasang sekaligus! Harus di-split:
  // - 3 pasang dari Batch 1 @ Rp150.000 (Total HPP: 450.000) -> Batch 1 habis (remaining = 0)
  // - 2 pasang dari Batch 2 @ Rp160.000 (Total HPP: 320.000) -> Batch 2 sisa 2 (remaining = 2)
  const splitSale = InventoryService.depleteOwnedStockFIFO("SLS-002", VARIANT_TEST, 5, 270000, "USR-OWNER-1", "IDEM-002");
  if (!splitSale.success || splitSale.allocations.length !== 2) {
    throw new Error(`Alokasi split batch harus menghasilkan 2 baris, tapi ${splitSale.allocations.length}`);
  }

  const alloc1 = splitSale.allocations[0];
  const alloc2 = splitSale.allocations[1];

  if (alloc1.batch_id !== batch1Id || alloc1.quantity !== 3 || alloc1.hpp_unit !== 150000) {
    throw new Error("Alokasi baris 1 (Batch 1) tidak sesuai");
  }
  if (alloc2.batch_id !== batch2Id || alloc2.quantity !== 2 || alloc2.hpp_unit !== 160000) {
    throw new Error("Alokasi baris 2 (Batch 2) tidak sesuai");
  }

  // Verifikasi sisa batch di DB
  const b1 = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batch1Id);
  const b2 = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batch2Id);
  if (Number(b1.remaining_qty) !== 0) throw new Error("Batch 1 harusnya habis (remaining = 0)");
  if (Number(b2.remaining_qty) !== 2) throw new Error("Batch 2 harusnya sisa 2");

  const stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_physical_stock !== 2 || stock.owned_available_stock !== 2) {
    throw new Error(`Sisa stok sendiri harusnya 2, tercatat ${stock.owned_physical_stock}`);
  }
});

// 5 & 6. Stok OWNED vs CONSIGNMENT Terpisah & Penjualan Konsinyasi Tanpa HPP
runTest("5 & 6. Stok OWNED vs CONSIGNMENT Terpisah & Penjualan Konsinyasi (HPP = 0)", () => {
  // Masukkan stok konsinyasi dari Dzaki: 3 pasang
  InventoryService.receiveConsignmentStock("VND-DZAKI", VARIANT_TEST, 3, "Titipan Dzaki", "USR-OWNER-1");

  const stockBefore = InventoryService.getStock(VARIANT_TEST);
  if (stockBefore.owned_physical_stock !== 2) throw new Error("Stok sendiri terganggu");
  if (stockBefore.consignment_physical_stock !== 3) throw new Error("Stok konsinyasi salah");
  if (stockBefore.total_available_stock !== 5) throw new Error("Total available stock salah");

  // Jual 1 pasang barang konsinyasi seharga Rp280.000
  const consSale = InventoryService.depleteConsignmentStock("SLS-003", VARIANT_TEST, "VND-DZAKI", 1, 280000, "USR-OWNER-1", "IDEM-003");
  if (!consSale.success || consSale.allocations.length !== 1) throw new Error("Penjualan konsinyasi gagal");

  const cAlloc = consSale.allocations[0];
  if (cAlloc.item_ownership !== "CONSIGNMENT") throw new Error("Ownership bukan CONSIGNMENT");
  if (cAlloc.hpp_unit !== 0 || cAlloc.total_hpp !== 0) throw new Error("HPP barang konsinyasi HARUS 0");
  if (cAlloc.vendor_payable_unit !== 270000) throw new Error("Hak vendor harus 270.000");
  if (cAlloc.crocs_incentive_unit !== 10000) throw new Error("Insentif CrocsCircle harus 10.000");

  const stockAfter = InventoryService.getStock(VARIANT_TEST);
  if (stockAfter.consignment_physical_stock !== 2 || stockAfter.consignment_available_stock !== 2) {
    throw new Error("Stok konsinyasi tidak berkurang menjadi 2");
  }
  if (stockAfter.owned_physical_stock !== 2) {
    throw new Error("Stok sendiri ikut berkurang saat jual konsinyasi!");
  }
});

// 7. Reservasi dan Pelepasan Reservasi (PO)
runTest("7. Reservasi dan Pelepasan Reservasi PO", () => {
  // Reservasi 1 pasang dari stok sendiri untuk PO-001
  InventoryService.reserveStock("PO-001", VARIANT_TEST, 1, "OWNED", "USR-OWNER-1");
  let stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_physical_stock !== 2) throw new Error("Stok fisik tidak boleh berubah saat reservasi!");
  if (stock.owned_reserved_stock !== 1) throw new Error("Stok reservasi harus 1");
  if (stock.owned_available_stock !== 1) throw new Error("Stok available harus berkurang menjadi 1 (2 - 1)");

  // Batalkan PO: Lepaskan reservasi
  InventoryService.releaseReservation("PO-001", VARIANT_TEST, 1, "OWNED", "USR-OWNER-1");
  stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_reserved_stock !== 0) throw new Error("Reservasi harus kembali 0");
  if (stock.owned_available_stock !== 2) throw new Error("Available stock harus kembali 2");
});

// 8. Penyerahan Barang PO (Fulfillment)
runTest("8. Penyerahan Barang PO (Deduct Physical & Reserved Serentak)", () => {
  // Booking 1 pasang untuk PO-002
  InventoryService.reserveStock("PO-002", VARIANT_TEST, 1, "OWNED", "USR-OWNER-1");
  // Serahkan ke pelanggan
  InventoryService.fulfillReservedStock("PO-002", VARIANT_TEST, 1, "OWNED", "USR-OWNER-1");

  const stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_physical_stock !== 1) throw new Error("Stok fisik harus berkurang menjadi 1");
  if (stock.owned_reserved_stock !== 0) throw new Error("Stok reservasi harus berkurang menjadi 0");
  if (stock.owned_available_stock !== 1) throw new Error("Available stock harus 1");
});

// 9. Retur dan Pembatalan (Pengembalian ke Batch Asal)
runTest("9. Retur Barang Milik Sendiri ke Batch Asal", () => {
  // Retur 1 pasang dari SLS-002 ke Batch 2
  const beforeBatch2 = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batch2Id);
  const remainingBefore = Number(beforeBatch2.remaining_qty);

  const retRes = InventoryService.returnOwnedStockToBatch("SLS-002", VARIANT_TEST, batch2Id, 1, "Ukuran sempit", "USR-OWNER-1");
  if (!retRes.success) throw new Error("Retur gagal");

  const afterBatch2 = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", batch2Id);
  if (Number(afterBatch2.remaining_qty) !== remainingBefore + 1) {
    throw new Error(`Remaining qty batch 2 harus bertambah 1, tercatat ${afterBatch2.remaining_qty}`);
  }

  const stock = InventoryService.getStock(VARIANT_TEST);
  if (stock.owned_physical_stock !== 2 || stock.owned_available_stock !== 2) {
    throw new Error("Stok fisik tidak bertambah setelah retur");
  }
});

// 10. Penolakan Overselling
runTest("10. Penolakan Overselling (Permintaan Melebihi Stok)", () => {
  const stock = InventoryService.getStock(VARIANT_TEST);
  const tooMuch = stock.owned_available_stock + 10;

  let oversellBlocked = false;
  try {
    InventoryService.depleteOwnedStockFIFO("SLS-OVERSELL", VARIANT_TEST, tooMuch, 280000, "USR-OWNER-1", "IDEM-OVER");
  } catch (err) {
    if (err.message.includes("tidak mencukupi")) {
      oversellBlocked = true;
    }
  }

  if (!oversellBlocked) throw new Error("Overselling berhasil, harusnya DITOLAK!");
});

// 11. Idempotency (Permintaan Berulang Tidak Mengurangi Stok Dobel)
runTest("11. Idempotency (Permintaan Transaksi Berulang Tidak Memotong Dobel)", () => {
  const stockBefore = InventoryService.getStock(VARIANT_TEST);
  
  // Panggilan 1 dengan idempotency key unik
  InventoryService.depleteOwnedStockFIFO("SLS-IDEM-TEST", VARIANT_TEST, 1, 280000, "USR-OWNER-1", "IDEM-KEY-UNIQUE-999");
  const stockAfter1 = InventoryService.getStock(VARIANT_TEST);
  if (stockAfter1.owned_physical_stock !== stockBefore.owned_physical_stock - 1) {
    throw new Error("Panggilan 1 gagal mengurangi stok");
  }

  // Panggilan 2 dengan IDEMPOTENCY KEY YANG SAMA (Simulasi jaringan retry / double click kasir)
  const replayRes = InventoryService.depleteOwnedStockFIFO("SLS-IDEM-TEST", VARIANT_TEST, 1, 280000, "USR-OWNER-1", "IDEM-KEY-UNIQUE-999");
  if (!replayRes.idempotentReplay) {
    throw new Error("Panggilan kedua harus terdeteksi sebagai idempotentReplay");
  }

  const stockAfter2 = InventoryService.getStock(VARIANT_TEST);
  if (stockAfter2.owned_physical_stock !== stockAfter1.owned_physical_stock) {
    throw new Error("BAHAYA: Stok terpotong dua kali pada permintaan berulang!");
  }
});

// 12. Simulasi Kegagalan Proses & Atomic Rollback
runTest("12. Simulasi Kegagalan Proses & Atomic Rollback (Tidak Ada Data Setengah Jadi)", () => {
  // Buat 2 batch baru khusus pengujian rollback agar kondisinya terisolasi
  const bA = InventoryService.receiveOwnedStockBatch("PUR-FAIL-A", "VAR-ROLLBACK-TEST", 1, 100000, 0, "Batch Rollback A", "USR-OWNER-1");
  const bB = InventoryService.receiveOwnedStockBatch("PUR-FAIL-B", "VAR-ROLLBACK-TEST", 2, 110000, 0, "Batch Rollback B", "USR-OWNER-1");

  const bARowBefore = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", bA.batch_id);
  const remainingBeforeA = Number(bARowBefore.remaining_qty);

  // Pasang interceptor: biarkan update batch A berhasil (callCount=1), tapi buat crash pada batch B (callCount=2)
  const originalUpdate = DatabaseHelper.updateRowByPk;
  let detailUpdateCount = 0;

  DatabaseHelper.updateRowByPk = function(tableName, pkCol, pkVal, data) {
    if (tableName === "DETAIL_PEMBELIAN") {
      detailUpdateCount++;
      if (detailUpdateCount === 2) {
        throw new Error("Simulasi I/O Disk Crash pada update batch B");
      }
    }
    return originalUpdate(tableName, pkCol, pkVal, data);
  };

  let rollbackCaught = false;
  try {
    // Minta 2 unit (akan mengambil 1 dari batch A dan 1 dari batch B)
    InventoryService.depleteOwnedStockFIFO("SLS-CRASH-TEST", "VAR-ROLLBACK-TEST", 2, 200000, "USR-OWNER-1", "IDEM-CRASH");
  } catch (err) {
    if (err.message.includes("Gagal mengeksekusi alokasi FIFO") || err.message.includes("Simulasi I/O Disk Crash")) {
      rollbackCaught = true;
    }
  } finally {
    DatabaseHelper.updateRowByPk = originalUpdate;
  }

  if (!rollbackCaught) throw new Error("Simulasi crash tidak tertangkap");

  // Periksa apakah batch A berhasil dikembalikan (rollback) ke sisa semula (1)
  const bARowAfter = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", bA.batch_id);
  if (Number(bARowAfter.remaining_qty) !== remainingBeforeA) {
    throw new Error(`Rollback gagal! Remaining qty batch A berubah dari ${remainingBeforeA} menjadi ${bARowAfter.remaining_qty}`);
  }
});

console.log("\n=== HASIL REKAPITULASI PENGUJIAN PHASE 2B ===");
const passedCount = testResults.filter(r => r.passed).length;
console.log(`Total Pengujian : ${testResults.length}`);
console.log(`Berhasil        : ${passedCount}`);
console.log(`Gagal           : ${testResults.length - passedCount}`);

if (passedCount === testResults.length) {
  console.log("\nSEMUA PENGUJIAN PHASE 2B BERHASIL 100%!");
} else {
  console.error("\nBEBERAPA PENGUJIAN GAGAL.");
  process.exit(1);
}
