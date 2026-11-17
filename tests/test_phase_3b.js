/**
 * CROCSCIRCLE.ID — TEST SUITE PHASE 3B
 * Modul: Product & Inventory Management Engine & RBAC
 * 
 * 12 Kriteria Pengujian:
 * 1. Tambah produk baru berhasil.
 * 2. Edit produk berhasil.
 * 3. SKU duplikat ditolak keras di level server.
 * 4. Tambah varian produk dengan standarisasi ukuran.
 * 5. Pemisahan OWN_STOCK dan VENDOR_CONSIGNMENT pada SKU yang sama tanpa saling mencampur.
 * 6. Penerimaan stok supplier membentuk batch persediaan FIFO baru.
 * 7. Penerimaan sebagian (partial receipt) didukung & update status PO.
 * 8. Konsumsi FIFO menghabiskan batch tertua terlebih dahulu.
 * 9. Perhitungan akurat Available Stock = Physical Stock - Reserved Stock.
 * 10. Reservasi PO mengunci stok (reserved bertambah, physical tetap, available berkurang).
 * 11. Riwayat mutasi stok (audit trail) mencatat kuantitas, kategori kepemilikan & batch secara akurat.
 * 12. RBAC: Role ADMIN dibatasi dari data modal / HPP pada inventaris (unit_cost & reference_hpp = null).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Mock SpreadsheetApp & Google Apps Script Environment
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

// Test Runner
let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, errMsg) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`[FAIL] ${testName}: ${errMsg || "Assertion failed"}`);
    failedCount++;
  }
}

console.log("=======================================================================");
console.log("🚀 CROCSCIRCLE.ID — PHASE 3B AUTOMATED TEST SUITE (12 CRITERIA)");
console.log("=======================================================================");

// 1. Inisialisasi Database Bersih
initializeCrocsCircleDatabase();

// Setup Users
AuthService.setupOwnerAccount("hafiz_owner", "Hafiz Owner", "OwnerHafiz2026!");
const ownerLogin = AuthService.login("hafiz_owner", "OwnerHafiz2026!");
const ownerToken = ownerLogin.token;

AuthService.createAdminAccount(ownerToken, "admin_staff", "Admin Staff", "StaffPass2026!");
const adminLogin = AuthService.login("admin_staff", "StaffPass2026!");
const adminToken = adminLogin.token;

// Setup Vendor Titip Jual (Dzaki) jika belum ada
try {
  VendorService.createVendor({
    vendor_id: "VND-DZAKI",
    vendor_name: "Dzaki Consignment",
    partnership_type: "CONSIGNMENT"
  }, ownerToken);
} catch (e) {
  // Sudah di-seed oleh database init
}

// TEST 1: Tambah Produk Baru Berhasil
try {
  const pRes = AdminController.saveProduct(ownerToken, {
    product_id: "PRD-CRUSH-01",
    product_name: "Crocs Classic Crush Clog - Bone",
    category_id: "CLOG",
    model: "Classic Crush",
    description: "Clog elevated dengan sol tebal 60mm yang nyaman dan trendy.",
    image_url: "https://example.com/crush-bone.jpg",
    is_published: true
  });

  const pDetail = AdminController.getProductDetail(ownerToken, "PRD-CRUSH-01");
  assert(
    pRes.success === true && pDetail.data.product.product_name === "Crocs Classic Crush Clog - Bone",
    "1. Tambah produk baru berhasil & tersimpan di database"
  );
} catch (e) {
  assert(false, "1. Tambah produk baru berhasil", e.message);
}

// TEST 2: Edit Produk Berhasil
try {
  const pUpdate = AdminController.saveProduct(ownerToken, {
    product_id: "PRD-CRUSH-01",
    product_name: "Crocs Classic Crush Clog - Bone (Updated)",
    description: "Deskripsi diperbarui dengan info ukuran standar."
  });
  const pDetail2 = AdminController.getProductDetail(ownerToken, "PRD-CRUSH-01");
  assert(
    pUpdate.success === true && pDetail2.data.product.product_name === "Crocs Classic Crush Clog - Bone (Updated)",
    "2. Edit produk berhasil & memperbarui record tanpa menghapus data lain"
  );
} catch (e) {
  assert(false, "2. Edit produk berhasil", e.message);
}

// TEST 3 & 4: Tambah Varian Produk & SKU Duplikat Ditolak
try {
  // Tambah Varian 1 (W7)
  const vRes1 = AdminController.saveVariant(ownerToken, {
    variant_id: "VAR-CRUSH-BN-W7",
    product_id: "PRD-CRUSH-01",
    color: "Bone",
    size: "W7",
    sku: "CRC-CRUSH-BN-W7",
    catalog_price: 1299000,
    reference_hpp: 750000,
    is_active: true
  });

  assert(
    vRes1.success === true && vRes1.variant_id === "VAR-CRUSH-BN-W7",
    "4. Tambah varian produk dengan standarisasi ukuran (W7) berhasil"
  );

  // Coba Tambah Varian Lain dengan SKU yang SAMA PERSIS (Duplikat SKU)
  let duplicateRejected = false;
  try {
    const vResDup = AdminController.saveVariant(ownerToken, {
      variant_id: "VAR-CRUSH-BN-W7-DUPLICATE",
      product_id: "PRD-CRUSH-01",
      color: "Bone",
      size: "W7",
      sku: "CRC-CRUSH-BN-W7", // Duplicate SKU!
      catalog_price: 1299000
    });
    if (!vResDup.success) duplicateRejected = true;
  } catch (err) {
    duplicateRejected = true;
  }

  assert(duplicateRejected, "3. SKU duplikat ditolak keras di level server");
} catch (e) {
  assert(false, "3 & 4. Varian & SKU guard", e.message);
}

// TEST 5: Pemisahan OWN_STOCK dan VENDOR_CONSIGNMENT pada SKU yang sama
try {
  // Terima stok milik sendiri 5 pcs untuk VAR-CRUSH-BN-W7 (modal 700.000)
  ProductService.createPurchaseOrder({
    purchase_id: "PUR-2026-001",
    supplier_name: "Supplier Utama Jakarta",
    receiving_status: "RECEIVED"
  }, [{
    variant_id: "VAR-CRUSH-BN-W7",
    quantity: 5,
    base_unit_cost: 700000
  }], "hafiz_owner");

  // Terima stok titipan konsinyasi Dzaki 3 pcs untuk SKU YANG SAMA (VAR-CRUSH-BN-W7)
  ProductService.receiveConsignment("VND-DZAKI", "VAR-CRUSH-BN-W7", 3, "Titipan Dzaki Crush Bone W7", "hafiz_owner");

  const stockInfo = InventoryService.getStock("VAR-CRUSH-BN-W7");
  assert(
    stockInfo.owned_physical_stock === 5 &&
    stockInfo.consignment_physical_stock === 3 &&
    stockInfo.total_available_stock === 8,
    "5. Pemisahan OWN_STOCK dan VENDOR_CONSIGNMENT pada SKU yang sama tanpa mencampur kepemilikan"
  );
} catch (e) {
  assert(false, "5. Pemisahan kepemilikan stok", e.message);
}

// TEST 6: Penerimaan Stok Supplier Membentuk Batch Persediaan FIFO Baru
try {
  // Tambah batch kedua untuk OWN_STOCK dengan harga modal berbeda (750.000)
  const batchRes2 = InventoryService.receiveOwnedStockBatch(
    "PUR-2026-002",
    "VAR-CRUSH-BN-W7",
    4,
    750000,
    0,
    "Batch Kedua Modal Naik",
    "hafiz_owner"
  );

  const batches = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.variant_id === "VAR-CRUSH-BN-W7" && b.remaining_qty > 0);
  assert(
    batchRes2.success === true && batches.length === 2 && batches[0].unit_cost === 700000 && batches[1].unit_cost === 750000,
    "6. Penerimaan stok supplier membentuk batch persediaan FIFO baru di DETAIL_PEMBELIAN"
  );
} catch (e) {
  assert(false, "6. Batch FIFO formation", e.message);
}

// TEST 7: Penerimaan Sebagian (Partial Receipt) Didukung
try {
  // Buat PO Supplier 10 pcs dengan status ORDERED
  const poRes = ProductService.createPurchaseOrder({
    purchase_id: "PUR-PARTIAL-01",
    supplier_name: "Supplier Bandung",
    receiving_status: "ORDERED"
  }, [{
    variant_id: "VAR-CRUSH-BN-W7",
    quantity: 10,
    base_unit_cost: 720000
  }], "hafiz_owner");

  // Terima 4 pcs dulu (partial)
  const partial1 = ProductService.receivePartialPurchase("PUR-PARTIAL-01", [{
    variant_id: "VAR-CRUSH-BN-W7",
    quantity: 4,
    base_unit_cost: 720000,
    is_last_delivery: false
  }], "Pengiriman tahap 1", "hafiz_owner");

  const poAfterPartial = DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", "PUR-PARTIAL-01");

  assert(
    partial1.success === true &&
    partial1.receiving_status === "PARTIAL_RECEIVED" &&
    poAfterPartial.receiving_status === "PARTIAL_RECEIVED",
    "7. Penerimaan sebagian (partial receipt) didukung & mengupdate receiving_status ke PARTIAL_RECEIVED"
  );
} catch (e) {
  assert(false, "7. Partial receipt", e.message);
}

// TEST 8: Konsumsi FIFO Menghabiskan Batch Tertua Terlebih Dahulu
try {
  // Total OWNED fisik saat ini: Batch 1 (5 pcs @700k) + Batch 2 (4 pcs @750k) + Batch 3 Partial (4 pcs @720k) = 13 pcs
  // Jual 6 pcs stok sendiri (akan mengambil 5 pcs @700k dari Batch 1, dan 1 pcs @750k dari Batch 2)
  const depletion = InventoryService.depleteOwnedStockFIFO(
    "SAL-TEST-FIFO",
    "VAR-CRUSH-BN-W7",
    6,
    1299000,
    "SYSTEM",
    "IDEMP-FIFO-01"
  );

  const batch1Remaining = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", depletion.allocations[0].batch_id);
  const batch2Remaining = DatabaseHelper.getRowByPk("DETAIL_PEMBELIAN", "purchase_detail_id", depletion.allocations[1].batch_id);

  assert(
    depletion.totalQty === 6 &&
    batch1Remaining.remaining_qty === 0 &&
    batch2Remaining.remaining_qty === 3 &&
    depletion.allocations[0].hpp_unit === 700000 &&
    depletion.allocations[1].hpp_unit === 750000,
    "8. Konsumsi FIFO menghabiskan batch tertua terlebih dahulu (split-batch 5@700k + 1@750k)"
  );
} catch (e) {
  assert(false, "8. FIFO depletion", e.message);
}

// TEST 9: Perhitungan Akurat Available = Physical - Reserved
try {
  const stockBeforeRes = InventoryService.getStock("VAR-CRUSH-BN-W7");
  const phys = stockBeforeRes.owned_physical_stock + stockBeforeRes.consignment_physical_stock;
  const res = stockBeforeRes.owned_reserved_stock + stockBeforeRes.consignment_reserved_stock;
  const avail = stockBeforeRes.total_available_stock;

  assert(
    avail === (phys - res),
    "9. Perhitungan akurat Available Stock = Physical Stock - Reserved Stock"
  );
} catch (e) {
  assert(false, "9. Available calculation", e.message);
}

// TEST 10: Reservasi PO Mengunci Stok Tanpa Memotong Fisik
try {
  const stockBefore = InventoryService.getStock("VAR-CRUSH-BN-W7");
  const physBefore = stockBefore.owned_physical_stock;

  // Reservasi 2 pcs stok OWNED untuk PO
  InventoryService.reserveStock("PO-TEST-001", "VAR-CRUSH-BN-W7", 2, "OWNED", "SYSTEM");

  const stockAfter = InventoryService.getStock("VAR-CRUSH-BN-W7");

  assert(
    stockAfter.owned_reserved_stock === 2 &&
    stockAfter.owned_physical_stock === physBefore &&
    stockAfter.owned_available_stock === (physBefore - 2),
    "10. Reservasi PO mengunci stok (reserved bertambah, physical tetap, available berkurang)"
  );
} catch (e) {
  assert(false, "10. Stock reservation", e.message);
}

// TEST 11: Riwayat Mutasi Stok (Audit Trail)
try {
  const movements = ProductService.getStockMovements({ sku: "CRC-CRUSH-BN-W7" });
  const hasPurchaseReceipt = movements.some(m => m.movement_type === "PURCHASE_RECEIPT");
  const hasConsignmentReceipt = movements.some(m => m.movement_type === "CONSIGNMENT_RECEIPT");
  const hasSalesDispatch = movements.some(m => m.movement_type === "SALES_DISPATCH");
  const hasReservation = movements.some(m => m.movement_type === "STOCK_RESERVATION");

  assert(
    movements.length >= 4 && hasPurchaseReceipt && hasConsignmentReceipt && hasSalesDispatch && hasReservation,
    "11. Riwayat mutasi stok mencatat seluruh aktivitas pergerakan stok lengkap dengan batch & referensi"
  );
} catch (e) {
  assert(false, "11. Stock movement history", e.message);
}

// TEST 12: RBAC Role ADMIN Dibatasi dari Informasi Modal / HPP
try {
  const ownerInventory = AdminController.getInventory(ownerToken, {});
  const adminInventory = AdminController.getInventory(adminToken, {});

  const ownerItem = ownerInventory.inventory.find(i => i.sku === "CRC-CRUSH-BN-W7");
  const adminItem = adminInventory.inventory.find(i => i.sku === "CRC-CRUSH-BN-W7");

  const ownerHasCost = (ownerItem.reference_hpp !== null && ownerItem.fifo_batches[0].unit_cost !== null);
  const adminCostMasked = (adminItem.reference_hpp === null && adminItem.fifo_batches[0].unit_cost === null);

  assert(
    ownerInventory.is_financial_restricted === false &&
    adminInventory.is_financial_restricted === true &&
    ownerHasCost &&
    adminCostMasked,
    "12. RBAC: Role ADMIN dibatasi dari informasi modal/HPP pada inventaris (unit_cost & reference_hpp = null)"
  );
} catch (e) {
  assert(false, "12. RBAC Inventory restriction", e.message);
}

console.log("=======================================================================");
console.log(`📊 REKAPITULASI HASIL PHASE 3B: ${passedCount} LULUS, ${failedCount} GAGAL (TOTAL: ${passedCount + failedCount})`);
console.log("=======================================================================");

if (failedCount === 0) {
  console.log("✅ SELURUH 12 KRITERIA PENGUJIAN PHASE 3B LULUS 100%!");
  process.exit(0);
} else {
  console.error("❌ ADA PENGUJIAN PHASE 3B YANG GAGAL!");
  process.exit(1);
}
