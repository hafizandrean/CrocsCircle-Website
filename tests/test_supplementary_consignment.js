/**
 * CROCSCIRCLE.ID — SUPPLEMENTARY CONSIGNMENT LOT AUDIT SCRIPT
 * Menguji simulasi nyata multi-vendor pada satu SKU yang sama dan memeriksa batas arsitektur saat ini.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock GAS Spreadsheet Environment
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
loadBackendFile('InventoryService.gs', 'InventoryService');
loadBackendFile('SalesService.gs', 'SalesService');
loadBackendFile('POService.gs', 'POService');
loadBackendFile('VendorService.gs', 'VendorService');
loadBackendFile('FinancialService.gs', 'FinancialService');
loadBackendFile('ClosingService.gs', 'ClosingService');
loadBackendFile('ProductService.gs', 'ProductService');
loadBackendFile('AdminController.gs', 'AdminController');

initializeCrocsCircleDatabase();

// Setup Users
AuthService.setupOwnerAccount("hafiz_owner", "Hafiz Owner", "HafizPass2026!");
const ownerLogin = AuthService.login("hafiz_owner", "HafizPass2026!");
const ownerToken = ownerLogin.token;

// Daftarkan Vendor B (Vendor Konsinyasi Kedua)
VendorService.createVendor({
  vendor_id: "VND-VENDOR-B",
  vendor_name: "Vendor B Consignment",
  contact_person: "Budi Vendor B",
  cooperation_type: "SELLER_FOR_VENDOR",
  consignment_fee_type: "PERCENTAGE",
  default_consignment_fee: 10, // Komisi CrocsCircle 10%
  status: "ACTIVE"
}, ownerToken);

console.log("=======================================================================");
console.log("🔍 SIMULASI & AUDIT TAMBAHAN: MULTI-VENDOR PADA SATU SKU");
console.log("=======================================================================\n");

// 1. Buat Produk & Varian
ProductService.createProduct({
  product_id: "PRD-MULTI-01",
  product_name: "Crocs Classic Multi-Vendor Clog",
  category_id: "CLOG"
}, "hafiz_owner");

ProductService.createVariant({
  variant_id: "VAR-MULTI-01",
  product_id: "PRD-MULTI-01",
  color: "Multi Color",
  size: "M9",
  sku: "CRC-AUDIT-MULTI-VENDOR",
  catalog_price: 1000000,
  reference_hpp: 600000
}, "hafiz_owner");

// 2. Terima 5 pcs OWN_STOCK
ProductService.createPurchaseOrder({
  purchase_id: "PUR-MULTI-001",
  supplier_name: "Supplier Jakarta",
  receiving_status: "RECEIVED"
}, [{
  variant_id: "VAR-MULTI-01",
  quantity: 5,
  base_unit_cost: 600000
}], "hafiz_owner");

// 3. Terima 3 pcs Konsinyasi Dzaki (VND-DZAKI)
ProductService.receiveConsignment("VND-DZAKI", "VAR-MULTI-01", 3, "Penerimaan Dzaki 3 pcs", "hafiz_owner");

// 4. Terima 4 pcs Konsinyasi Vendor B (VND-VENDOR-B)
ProductService.receiveConsignment("VND-VENDOR-B", "VAR-MULTI-01", 4, "Penerimaan Vendor B 4 pcs", "hafiz_owner");

// Periksa kondisi tabel STOK
const currentStock = InventoryService.getStock("VAR-MULTI-01");
console.log("HASIL PENERIMAAN:");
console.log("- Owned Physical Stock       :", currentStock.owned_physical_stock);
console.log("- Consignment Physical Stock :", currentStock.consignment_physical_stock);
console.log("- Total Available Stock      :", currentStock.total_available_stock);

// Periksa apakah tabel STOK membedakan Dzaki vs Vendor B
console.log("\nPERIKSA TABEL STOK:");
console.log("Apakah ada kolom kuantitas Dzaki terpisah di STOK?", currentStock.dzaki_stock !== undefined);
console.log("Apakah ada kolom kuantitas Vendor B terpisah di STOK?", currentStock.vendor_b_stock !== undefined);

// Periksa tabel DETAIL_PEMBELIAN
const batches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.variant_id === "VAR-MULTI-01");
console.log("\nPERIKSA TABEL DETAIL_PEMBELIAN (BATCH PERSATUAN):");
console.log("Jumlah baris batch persediaan di DETAIL_PEMBELIAN:", batches.length);
batches.forEach((b, i) => {
  console.log(` Batch ${i+1}: ID=${b.purchase_detail_id}, Qty=${b.quantity}, Remaining=${b.remaining_qty}, Cost=${b.unit_cost}`);
});

// Periksa tabel MUTASI_STOK
const movements = DatabaseHelper.getAllRows("MUTASI_STOK", m => m.variant_id === "VAR-MULTI-01");
console.log("\nPERIKSA TABEL MUTASI_STOK:");
movements.forEach((m, i) => {
  console.log(` Mutasi ${i+1}: Tipe=${m.movement_type}, Cat=${m.stock_category}, Qty=${m.quantity}, RefType=${m.reference_type}, RefID=${m.reference_id}, Notes=${m.notes}`);
});

// 5. Uji Penjualan 1 pcs Dzaki
console.log("\n--- UJI PENJUALAN 1 PCS DZAKI ---");
const saleDzaki = SalesService.createSale({
  transaction_date: new Date(),
  customer_name: "Pembeli Barang Dzaki",
  items: [{
    variant_id: "VAR-MULTI-01",
    quantity: 1,
    actual_price: 300000,
    item_ownership: "CONSIGNMENT",
    vendor_id: "VND-DZAKI"
  }]
}, "hafiz_owner");

const dzakiDetail = saleDzaki.details[0];
console.log("Penjualan Dzaki Detail:");
console.log("- Item Ownership          :", dzakiDetail.item_ownership);
console.log("- Vendor ID               :", dzakiDetail.vendor_id);
console.log("- Batch ID tercatat       :", dzakiDetail.batch_id);
console.log("- Hak Pokok Dzaki         :", dzakiDetail.vendor_remaining_payable);
console.log("- Insentif CrocsCircle    :", dzakiDetail.vendor_incentive_amount);
console.log("- HPP CrocsCircle         :", dzakiDetail.total_hpp);

// 6. Uji Penjualan 1 pcs Vendor B
console.log("\n--- UJI PENJUALAN 1 PCS VENDOR B ---");
const saleVendorB = SalesService.createSale({
  transaction_date: new Date(),
  customer_name: "Pembeli Barang Vendor B",
  items: [{
    variant_id: "VAR-MULTI-01",
    quantity: 1,
    actual_price: 1000000,
    item_ownership: "CONSIGNMENT",
    vendor_id: "VND-VENDOR-B"
  }]
}, "hafiz_owner");

const vendorBDetail = saleVendorB.details[0];
console.log("Penjualan Vendor B Detail:");
console.log("- Item Ownership          :", vendorBDetail.item_ownership);
console.log("- Vendor ID               :", vendorBDetail.vendor_id);
console.log("- Batch ID tercatat       :", vendorBDetail.batch_id);
console.log("- Hak Vendor B (90%)      :", vendorBDetail.vendor_remaining_payable);
console.log("- Komisi CrocsCircle (10%):", vendorBDetail.vendor_incentive_amount);
console.log("- HPP CrocsCircle         :", vendorBDetail.total_hpp);

// 7. Uji Penjualan 1 pcs OWN_STOCK
console.log("\n--- UJI PENJUALAN 1 PCS OWN_STOCK ---");
const saleOwn = SalesService.createSale({
  transaction_date: new Date(),
  customer_name: "Pembeli Barang Sendiri",
  items: [{
    variant_id: "VAR-MULTI-01",
    quantity: 1,
    actual_price: 1000000,
    item_ownership: "OWNED"
  }]
}, "hafiz_owner");

const ownDetail = saleOwn.details[0];
console.log("Penjualan OWNED Detail:");
console.log("- Item Ownership          :", ownDetail.item_ownership);
console.log("- Batch ID FIFO           :", ownDetail.batch_id);
console.log("- HPP FIFO CrocsCircle    :", ownDetail.total_hpp);
console.log("- Hak Vendor              :", ownDetail.vendor_remaining_payable);

// 8. Periksa Sisa Stok Fisik Setelah 3 Penjualan
const finalStock = InventoryService.getStock("VAR-MULTI-01");
console.log("\nSISA STOK FISIK SETELAH 3 TRANSAKSI:");
console.log("- Owned Physical Stock       :", finalStock.owned_physical_stock, "(Ekspektasi: 5 - 1 = 4)");
console.log("- Consignment Physical Stock :", finalStock.consignment_physical_stock, "(Ekspektasi: (3 + 4) - 2 = 5)");
console.log("- Total Available Stock      :", finalStock.total_available_stock, "(Ekspektasi: 4 + 5 = 9)");

// 9. Uji Celah Overselling Konsinyasi per Vendor:
// Dzaki awalnya hanya titip 3 pcs. Sudah terjual 1 pcs. Sisa hakiki Dzaki = 2 pcs.
// Apa yang terjadi jika kasir menjual 3 pcs lagi atas nama Dzaki?
console.log("\n--- UJI CELAH: PENJUALAN MELEBIHI TITIPAN AWAL VENDOR DZAKI ---");
let oversellDzakiError = null;
try {
  SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Pembeli 3 pcs Dzaki",
    items: [{
      variant_id: "VAR-MULTI-01",
      quantity: 3, // Dzaki sisa 2, tapi consignment_available_stock masih 5 (karena ada 4 milik Vendor B)
      actual_price: 300000,
      item_ownership: "CONSIGNMENT",
      vendor_id: "VND-DZAKI"
    }]
  }, "hafiz_owner");
} catch (e) {
  oversellDzakiError = e.message;
}

if (oversellDzakiError) {
  console.log("HASIL: Ditolak dengan pesan:", oversellDzakiError);
} else {
  console.log("HASIL: TERJUAL BEBAS! Sistem mengizinkan Dzaki menjual 3 pcs padahal sisa titipan Dzaki hanya 2 pcs!");
  console.log("PENYEBAB: Sistem memvalidasi consignment_available_stock secara global (5 pcs), bukan per-vendor!");
}

// 10. Uji Retur Penjualan Konsinyasi
console.log("\n--- UJI RETUR PENJUALAN KONSINYASI ---");
// Retur 1 pcs barang Dzaki yang tadi terjual pada saleDzaki
const returRes = SalesService.returnSaleItem(
  saleDzaki.salesId,
  dzakiDetail.sales_detail_id,
  1,
  "Customer ukuran tidak cocok",
  "hafiz_owner"
);
console.log("Hasil Retur Konsinyasi Dzaki:");
console.log("- Success            :", returRes.success);
console.log("- Return Category    :", returRes.item_ownership);
console.log("- Vendor ID terbalik :", returRes.vendor_id);
console.log("- Status Hutang      :", returRes.reversal_type);

const stockAfterRetur = InventoryService.getStock("VAR-MULTI-01");
console.log("- Consignment Physical Stock Setelah Retur:", stockAfterRetur.consignment_physical_stock);
console.log("=======================================================================");
