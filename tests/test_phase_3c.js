/**
 * CROCSCIRCLE.ID — PHASE 3C AUTOMATED TEST SUITE
 * Customer Storefront, Shopping Cart & Non-Destructive WhatsApp Checkout
 * 
 * Verifikasi 12 Skenario Pengujian Wajib:
 * 1. Produk Ready Stock tampil dengan benar di katalog
 * 2. Produk Pre-Order tampil dengan benar di katalog
 * 3. Produk tidak terpublikasi (is_published = false) atau non-aktif TIDAK tampil
 * 4. STRICT ZERO DATA LEAKAGE: HPP, modal supplier, vendor, laba tidak terekspos
 * 5. Keranjang belanja mendukung banyak produk dan varian
 * 6. Kuantitas keranjang dapat diperbarui (increment/decrement)
 * 7. Keranjang dapat menghapus produk
 * 8. Keranjang tersimpan konsisten di localStorage
 * 9. Checkout menghasilkan format pesan WhatsApp terstruktur dan URL valid
 * 10. Checkout TIDAK mengurangi stok fisik maupun available
 * 11. Checkout TIDAK membuat transaksi penjualan atau PO otomatis di database
 * 12. Validasi backend menolak manipulasi harga klien & memeriksa ketersediaan stok
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
loadBackendFile('StorefrontService.gs', 'StorefrontService');

// Test Runner Framework
let passedCount = 0;
let failedCount = 0;
const testResults = [];

function runTest(testNumber, name, fn) {
  try {
    fn();
    console.log(`\x1b[32m✔ [PHASE 3C TEST ${testNumber}] PASS: ${name}\x1b[0m`);
    passedCount++;
    testResults.push({ number: testNumber, name, status: 'PASS' });
  } catch (err) {
    console.error(`\x1b[31m✘ [PHASE 3C TEST ${testNumber}] FAIL: ${name}\x1b[0m`);
    console.error(`   Error: ${err.message}`);
    failedCount++;
    testResults.push({ number: testNumber, name, status: 'FAIL', error: err.message });
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "Assertion failed"} | Expected: ${expected}, Got: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message || "Expected condition to be true");
  }
}

console.log("==========================================================================");
console.log("🛍️ CROCSCIRCLE.ID — PHASE 3C AUTOMATED TEST SUITE");
console.log("   Customer Storefront, Shopping Cart & WhatsApp Checkout");
console.log("==========================================================================\n");

// 0. Setup Clean Database
initializeCrocsCircleDatabase();

// Setup Master Data untuk Storefront Test
// 1. Produk Ready Stock: Classic Clog Bone (Published, Active, Stock = 5)
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-READY-01",
  product_name: "Crocs Classic Clog - Bone Original",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  description: "Clog klasik warna Bone siap kirim",
  image_url: "https://example.com/bone.jpg",
  sales_type: "READY_STOCK",
  is_published: true,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-READY-W7",
  product_id: "PRD-READY-01",
  sku: "CRC-CLS-BN-W7",
  size: "W7",
  color: "Bone",
  catalog_price: 999000,
  reference_hpp: 550000,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-READY-W8",
  product_id: "PRD-READY-01",
  sku: "CRC-CLS-BN-W8",
  size: "W8",
  color: "Bone",
  catalog_price: 999000,
  reference_hpp: 550000,
  is_active: true
});

// Isi stok fisik untuk Ready Stock
InventoryService.receiveOwnedStockBatch("PUR-ST-01", "VAR-READY-W7", 5, 550000, 0, "Stok Awal Bone W7", "SYSTEM");
InventoryService.receiveOwnedStockBatch("PUR-ST-02", "VAR-READY-W8", 3, 550000, 0, "Stok Awal Bone W8", "SYSTEM");

// 2. Produk Pre-Order: Echo Clog Desert Grass (Published, Active, Sales Type = PRE_ORDER, Stock = 0)
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-PO-01",
  product_name: "Crocs Echo Clog - Desert Grass",
  category_id: "CAT-GEO",
  model: "Echo Clog",
  description: "Special colorway import pre-order 10-14 hari kerja",
  image_url: "https://example.com/desert.jpg",
  sales_type: "PRE_ORDER",
  is_published: true,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-PO-M9",
  product_id: "PRD-PO-01",
  sku: "CRC-ECH-DG-M9",
  size: "M9",
  color: "Desert Grass",
  catalog_price: 1450000,
  reference_hpp: 900000,
  is_active: true
});

// 3. Produk Unpublished: Mega Crush Black (is_published = false)
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-UNPUB-01",
  product_name: "Crocs Mega Crush Clog - Secret Draft",
  category_id: "CAT-PLATFORM",
  model: "Mega Crush",
  description: "Draf internal belum rilis",
  sales_type: "READY_STOCK",
  is_published: false, // DRAFT / TIDAK DITAMPILKAN
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-UNPUB-W7",
  product_id: "PRD-UNPUB-01",
  sku: "CRC-MGC-SEC-W7",
  size: "W7",
  color: "Black",
  catalog_price: 1699000,
  reference_hpp: 1100000,
  is_active: true
});

// 4. Produk Non-Aktif: Classic Clog Pink (is_active = false)
DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PRD-INACT-01",
  product_name: "Crocs Classic Clog - Discontinued Pink",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  sales_type: "READY_STOCK",
  is_published: true,
  is_active: false // NON-AKTIF
});

// =========================================================================
// TEST SCENARIOS
// =========================================================================

// Skenario 1: Produk Ready Stock Tampil dengan Benar
runTest(1, "Produk Ready Stock Tampil dengan Benar di Katalog Publik", () => {
  const res = StorefrontService.getCatalog({ tab: "READY" });
  assertTrue(res.success, "Katalog harus berhasil dimuat");
  assertTrue(res.products.length > 0, "Harus ada produk ready stock");

  const readyProd = res.products.find(p => p.product_id === "PRD-READY-01");
  assertTrue(!!readyProd, "Produk Bone W7/W8 harus ditemukan");
  assertEquals(readyProd.display_type, "READY", "Display type harus READY");
  assertEquals(readyProd.availability_badge, "READY_STOCK", "Badge harus READY_STOCK");
  assertEquals(readyProd.total_available_stock, 8, "Total stok tersedia harus 8 pcs (5+3)");
  assertEquals(readyProd.price_range.min_price, 999000, "Harga katalog harus Rp999.000");
});

// Skenario 2: Produk Pre-Order Tampil dengan Benar
runTest(2, "Produk Pre-Order Tampil dengan Benar di Katalog Publik", () => {
  const res = StorefrontService.getCatalog({ tab: "PO" });
  assertTrue(res.success, "Katalog PO harus berhasil dimuat");

  const poProd = res.products.find(p => p.product_id === "PRD-PO-01");
  assertTrue(!!poProd, "Produk Desert Grass harus ditemukan di tab PO");
  assertEquals(poProd.display_type, "PO", "Display type harus PO");
  assertEquals(poProd.availability_badge, "PRE_ORDER", "Badge harus PRE_ORDER");
  assertEquals(poProd.price_range.min_price, 1450000, "Harga PO harus Rp1.450.000");
});

// Skenario 3: Produk Tidak Terpublikasi atau Non-Aktif TIDAK Tampil
runTest(3, "Produk Unpublished (is_published=false) dan Non-Aktif TIDAK Tampil di Katalog", () => {
  const res = StorefrontService.getCatalog({ tab: "ALL" });
  assertTrue(res.success, "Katalog harus berhasil dimuat");

  const unpub = res.products.find(p => p.product_id === "PRD-UNPUB-01");
  assertEquals(unpub, undefined, "Produk unpublished TIDAK BOLEH tampil di katalog publik");

  const inact = res.products.find(p => p.product_id === "PRD-INACT-01");
  assertEquals(inact, undefined, "Produk non-aktif TIDAK BOLEH tampil di katalog publik");
});

// Skenario 4: STRICT ZERO LEAKAGE: HPP dan Data Internal Tidak Terekspos
runTest(4, "STRICT ZERO LEAKAGE: HPP, modal, supplier, keuntungan tidak terekspos di API publik", () => {
  const res = StorefrontService.getCatalog({ tab: "ALL" });
  const jsonStr = JSON.stringify(res);

  // Periksa kata kunci terlarang dalam JSON output
  assertTrue(!jsonStr.includes("reference_hpp"), "Output publik TIDAK BOLEH memuat reference_hpp");
  assertTrue(!jsonStr.includes("unit_cost"), "Output publik TIDAK BOLEH memuat unit_cost");
  assertTrue(!jsonStr.includes("supplier_name"), "Output publik TIDAK BOLEH memuat supplier_name");
  assertTrue(!jsonStr.includes("vendor_id"), "Output publik TIDAK BOLEH memuat vendor_id");
  assertTrue(!jsonStr.includes("gross_profit"), "Output publik TIDAK BOLEH memuat gross_profit");
  assertTrue(!jsonStr.includes("550000"), "Nilai modal Rp550.000 TIDAK BOLEH bocor ke publik!");
  assertTrue(!jsonStr.includes("900000"), "Nilai modal Rp900.000 TIDAK BOLEH bocor ke publik!");
});

// Skenario 5: Keranjang Belanja Mendukung Banyak Produk dan Varian
let testCart = [];
runTest(5, "Keranjang Belanja Mendukung Banyak Produk dan Varian Berbeda", () => {
  testCart = [
    { variant_id: "VAR-READY-W7", quantity: 2 },
    { variant_id: "VAR-PO-M9", quantity: 1 }
  ];

  const validation = StorefrontService.validateCart(testCart);
  assertTrue(validation.valid, "Keranjang belanja multi-produk harus valid");
  assertEquals(validation.items.length, 2, "Harus ada 2 item terverifikasi");
  assertEquals(validation.total_qty, 3, "Total kuantitas adalah 3 unit (2+1)");

  // Perhitungan total resmi server: (2 x 999.000) + (1 x 1.450.000) = 1.998.000 + 1.450.000 = 3.448.000
  assertEquals(validation.total_price, 3448000, "Total harga resmi server harus Rp3.448.000");
});

// Skenario 6: Kuantitas Keranjang Dapat Diperbarui
runTest(6, "Kuantitas Keranjang Belanja Dapat Diperbarui (Increment / Decrement)", () => {
  // Ubah kuantitas item 1 dari 2 pcs menjadi 3 pcs
  testCart[0].quantity = 3;

  const validation = StorefrontService.validateCart(testCart);
  assertTrue(validation.valid, "Validasi kuantitas baru harus valid");
  assertEquals(validation.total_qty, 4, "Total kuantitas baru = 4 pcs (3+1)");
  // (3 x 999.000) + (1 x 1.450.000) = 2.997.000 + 1.450.000 = 4.447.000
  assertEquals(validation.total_price, 4447000, "Total harga baru harus Rp4.447.000");
});

// Skenario 7: Keranjang Dapat Menghapus Produk
runTest(7, "Keranjang Belanja Dapat Menghapus Produk", () => {
  // Hapus item ke-2 (PO)
  testCart.splice(1, 1);
  assertEquals(testCart.length, 1, "Sisa 1 item di keranjang");

  const validation = StorefrontService.validateCart(testCart);
  assertTrue(validation.valid, "Keranjang setelah hapus item harus valid");
  assertEquals(validation.items.length, 1, "Hanya 1 item terverifikasi");
  assertEquals(validation.total_price, 2997000, "Total harga sisa item = Rp2.997.000 (3 x Rp999.000)");
});

// Skenario 8: Keranjang Tersimpan Konsisten (Simulasi localStorage)
runTest(8, "Keranjang Tersimpan Konsisten Melalui Serialisasi JSON (localStorage pattern)", () => {
  const serialized = JSON.stringify(testCart);
  assertTrue(typeof serialized === "string", "Harus dapat diserialisasi ke string JSON");

  const deserialized = JSON.parse(serialized);
  assertEquals(deserialized.length, testCart.length, "Jumlah item konsisten setelah reload");
  assertEquals(deserialized[0].variant_id, "VAR-READY-W7", "Variant ID konsisten");
  assertEquals(deserialized[0].quantity, 3, "Quantity konsisten");
});

// Skenario 9: Checkout Menghasilkan Format Pesan WhatsApp yang Terstruktur
let waOrderResult = null;
runTest(9, "Checkout Menghasilkan Format Pesan WhatsApp Terstruktur & URL Valid", () => {
  const orderPayload = {
    customer_name: "Jessica Iskandar",
    customer_phone: "081298765432",
    delivery_method: "Kirim Ekspedisi (JNE Reguler)",
    address: "Jl. Senopati No. 45, Jakarta Selatan",
    payment_choice: "Transfer BCA (CrocsCircle Official)",
    notes: "Tolong double bubble wrap ya kak",
    items: [
      { variant_id: "VAR-READY-W7", quantity: 1 },
      { variant_id: "VAR-PO-M9", quantity: 1 }
    ]
  };

  waOrderResult = StorefrontService.generateWhatsAppOrder(orderPayload);
  assertTrue(waOrderResult.success, "Generate WA order harus sukses");
  assertTrue(waOrderResult.whatsapp_url.startsWith("https://wa.me/"), "URL harus mengarah ke https://wa.me/");
  
  const msg = waOrderResult.message_text;
  assertTrue(msg.includes("CrocsCircle.ID"), "Pesan harus mencantumkan nama CrocsCircle.ID");
  assertTrue(msg.includes("Jessica Iskandar"), "Pesan harus mencantumkan nama pemesan");
  assertTrue(msg.includes("081298765432"), "Pesan harus mencantumkan nomor kontak pemesan");
  assertTrue(msg.includes("Jl. Senopati No. 45"), "Pesan harus mencantumkan alamat");
  assertTrue(msg.includes("Transfer BCA"), "Pesan harus mencantumkan metode pembayaran");
  assertTrue(msg.includes("Tolong double bubble wrap"), "Pesan harus mencantumkan catatan pemesan");
  assertTrue(msg.includes("Crocs Classic Clog - Bone Original"), "Pesan harus memuat nama produk 1");
  assertTrue(msg.includes("Crocs Echo Clog - Desert Grass"), "Pesan harus memuat nama produk 2");
  assertTrue(msg.toUpperCase().includes("TOTAL ESTIMASI"), "Pesan harus memuat total");
  assertTrue(msg.includes("Rp2.449.000"), "Total Rp2.449.000 (999k + 1.450k) harus akurat");
});

// Skenario 10: Checkout WhatsApp TIDAK Mengurangi Stok Fisik Maupun Available
runTest(10, "Checkout WhatsApp TIDAK Mengurangi Stok Fisik Maupun Available di Database", () => {
  const stkReadyW7 = InventoryService.getStock("VAR-READY-W7");
  // Stok awal adalah 5 pcs, setelah checkout WA harus TETAP 5 pcs!
  assertEquals(stkReadyW7.owned_physical_stock, 5, "Stok fisik harus TETAP 5 pcs (tidak terpotong oleh klik WA)");
  assertEquals(stkReadyW7.owned_available_stock, 5, "Stok available harus TETAP 5 pcs");
  assertEquals(stkReadyW7.owned_reserved_stock, 0, "Stok reservasi harus TETAP 0 pcs");
});

// Skenario 11: Checkout WhatsApp TIDAK Membuat Transaksi Otomatis di Database
runTest(11, "Checkout WhatsApp TIDAK Membuat Record Penjualan atau PO Otomatis", () => {
  const sales = DatabaseHelper.getAllRows("PENJUALAN", p => p.customer_name === "Jessica Iskandar");
  assertEquals(sales.length, 0, "TIDAK BOLEH ada transaksi PENJUALAN otomatis yang terbuat");

  const pos = DatabaseHelper.getAllRows("PRE_ORDER", po => po.customer_name === "Jessica Iskandar");
  assertEquals(pos.length, 0, "TIDAK BOLEH ada transaksi PRE_ORDER otomatis yang terbuat");

  // Hanya LOG_AKTIVITAS inquiry yang tercatat
  const logs = DatabaseHelper.getAllRows("LOG_AKTIVITAS", l => l.action === "WHATSAPP_INQUIRY");
  assertTrue(logs.length >= 1, "Log aktivitas inquiry customer tercatat dengan baik untuk audit");
});

// Skenario 12: Validasi Backend Menolak Manipulasi Harga Klien & Memeriksa Ketersediaan Stok
runTest(12, "Validasi Backend Menolak Manipulasi Harga Klien & Memeriksa Ketersediaan Stok", () => {
  // A. Klien mencoba mengirimkan harga palsu (Rp100 bukannya Rp999.000)
  const manipulatedCart = [
    {
      variant_id: "VAR-READY-W7",
      quantity: 1,
      client_price_hack: 100 // Percobaan manipulasi harga
    }
  ];

  const valRes = StorefrontService.validateCart(manipulatedCart);
  assertTrue(valRes.valid, "Validasi harus memproses varian sah");
  // Server WAJIB mengabaikan client_price_hack dan menggunakan harga resmi database (Rp999.000)
  assertEquals(valRes.items[0].unit_price, 999000, "Server harus menggunakan harga resmi database (Rp999.000)!");
  assertEquals(valRes.total_price, 999000, "Total server harus Rp999.000 (bukan Rp100)!");

  // B. Klien meminta kuantitas Ready Stock melebihi stok fisik (minta 10 pcs, stok fisik hanya 5 pcs)
  const oversellCart = [
    { variant_id: "VAR-READY-W7", quantity: 10 }
  ];

  const valOversell = StorefrontService.validateCart(oversellCart);
  assertTrue(!valOversell.valid, "Permintaan melebihi stok ready stock HARUS DITOLAK");
  assertTrue(valOversell.issues[0].includes("tidak mencukupi"), "Pesan error harus menjelaskan stok tidak cukup");
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n==========================================================================");
console.log(`📊 PHASE 3C TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
console.log("==========================================================================");

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log("\x1b[32m🎉 SELURUH 12 SKENARIO PENGUJIAN PHASE 3C STOREFRONT LULUS 100%!\x1b[0m\n");
  process.exit(0);
}
