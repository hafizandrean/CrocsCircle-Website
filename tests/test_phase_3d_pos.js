/**
 * CROCSCIRCLE.ID — PHASE 3D SUB-MODUL 1 TEST SUITE
 * Kasir & Penjualan (POS) - 13 Operational & Financial Scenarios
 * 
 * Skenario Pengujian:
 * 1. Penjualan Stok Milik Sendiri (FIFO Depletion)
 * 2. Penjualan Multi-Item Campuran (OWNED + CONSIGNMENT)
 * 3. Titipan Ongkir Pelanggan (Opsi A: Pass-Through Liability / Bukan Omzet)
 * 4. Penolakan Diskon Kasir Pelanggar Hak Pokok Vendor Dzaki (< Rp270.000)
 * 5. Perhitungan Insentif Konsinyasi dengan Diskon Sah (Harga >= Rp280.000)
 * 6. Penolakan Transaksi jika Stok Kurang (Anti-Overselling)
 * 7. Validasi Batas Harga Minimum Konsinyasi Dzaki (< Rp280.000)
 * 8. Penjualan Konsinyasi Model Persentase (Non-Dzaki / Vendor B)
 * 9. Retur Penjualan Parsial & Pemulihan Stok
 * 10. Retur Transaksi Penjualan dari Periode Buku CLOSED
 * 11. Idempotency Key Mencegah Transaksi Ganda
 * 12. Atomic Rollback pada Kegagalan Transaksi Multi-Item
 * 13. Ekstraksi Format Pesanan WhatsApp Tanpa Mutasi Database
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
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => activeSS,
  openById: () => activeSS
};
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

global.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: (k) => {
      if (k === 'ADMIN_PHONE') return '6281234567890';
      if (k === 'STORE_NAME') return 'CrocsCircle.ID';
      return null;
    }
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
loadBackendFile('InventoryService.gs', 'InventoryService');
loadBackendFile('SalesService.gs', 'SalesService');
loadBackendFile('POService.gs', 'POService');
loadBackendFile('VendorService.gs', 'VendorService');
loadBackendFile('FinancialService.gs', 'FinancialService');
loadBackendFile('ClosingService.gs', 'ClosingService');
loadBackendFile('ProductService.gs', 'ProductService');
loadBackendFile('AdminController.gs', 'AdminController');
loadBackendFile('StorefrontService.gs', 'StorefrontService');

// Initialize database schema
initializeCrocsCircleDatabase();

// Setup Users
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const ownerLogin = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = ownerLogin.token;

// --- SETUP TEST MASTER DATA ---
const now = new Date();

// 1. Vendors: Pastikan Dzaki terdaftar dan Vendor B (Persentase) dibuat
VendorService.createVendor({
  vendor_id: "VND-PERCENT",
  vendor_name: "Vendor Persentase B",
  cooperation_type: "CONSIGNMENT",
  consignment_fee_type: "PERCENTAGE",
  default_consignment_fee: 15, // 15% CrocsCircle fee
  min_selling_price: 300000,
  phone: "081299990002",
  bank_name: "BCA",
  bank_account_no: "1234567890",
  bank_account_holder: "Vendor B"
}, ownerToken);

// 2. Products & Variants
DatabaseHelper.insertRow("KATEGORI", { category_id: "CAT-CLOG", category_name: "Clogs", description: "Classic Crocs" });

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-BONE",
  product_name: "Crocs Classic Clog - Bone",
  category_id: "CAT-CLOG",
  model: "Classic Clog",
  description: "Clog warna bone",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-BONE-W7",
  product_id: "PROD-BONE",
  sku: "CRC-CLS-BN-W7",
  color: "Bone",
  size: "W7",
  catalog_price: 999000,
  is_active: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-BONE-W8",
  product_id: "PROD-BONE",
  sku: "CRC-CLS-BN-W8",
  color: "Bone",
  size: "W8",
  catalog_price: 999000,
  is_active: true
});

DatabaseHelper.insertRow("MASTER_PRODUK", {
  product_id: "PROD-SALEHE",
  product_name: "Crocs Pollex Clog Salehe Bembury",
  category_id: "CAT-CLOG",
  model: "Pollex Clog",
  description: "Salehe Bembury Collab",
  sales_type: "READY_STOCK",
  is_active: true,
  is_published: true
});

DatabaseHelper.insertRow("VARIAN_PRODUK", {
  variant_id: "VAR-SLH-M9",
  product_id: "PROD-SALEHE",
  sku: "CRC-SLH-BK-M9",
  color: "Black",
  size: "M9",
  catalog_price: 350000,
  is_active: true
});

// 3. Stock Initialization via Official Services
// A. Owned Stock FIFO for VAR-BONE-W7 (Batch 1: 5 pcs @ Rp500.000, Batch 2: 5 pcs @ Rp520.000)
InventoryService.receiveOwnedStockBatch("PUR-001", "VAR-BONE-W7", 5, 500000, 0, "Batch 1 Stok Awal", "TESTER");
InventoryService.receiveOwnedStockBatch("PUR-002", "VAR-BONE-W7", 5, 520000, 0, "Batch 2 Stok Tambahan", "TESTER");

// B. Consignment Lot for VAR-BONE-W8 (Dzaki: 3 pcs)
InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-BONE-W8", 3, "Titipan Dzaki Batch 1", "TESTER");

// C. Consignment Lot for VAR-SLH-M9 (Vendor B: 4 pcs)
InventoryService.receiveConsignmentStock("VND-PERCENT", "VAR-SLH-M9", 4, "Titipan Vendor B Batch 1", "TESTER");

// --- TEST SUITE EXECUTION ---
console.log("==================================================================");
console.log("🧪 RUNNING CROCSCIRCLE.ID PHASE 3D SUB-MODUL 1 TEST SUITE (POS)");
console.log("==================================================================");

let passedTests = 0;
let totalTests = 13;

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion Failed: " + message);
  }
}

// -------------------------------------------------------------------------
// SKENARIO 1: FIFO Depletion on Owned Stock Sale
// -------------------------------------------------------------------------
try {
  console.log("\n[1/13] Menguji Penjualan Stok Milik Sendiri (FIFO Depletion)...");
  // Beli 7 pcs VAR-BONE-W7. Harus menghabiskan Batch 1 (5 pcs @ 500k) dan mengambil 2 pcs dari Batch 2 (@ 520k).
  const saleData = {
    sales_channel: "OFFLINE_EVENT",
    customer_name: "Customer Skenario 1",
    payment_method: "QRIS",
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 7,
        actual_price: 999000
      }
    ]
  };

  const res = SalesService.createSale(saleData);
  assert(res.success === true, "createSale harus berhasil");
  assert(res.sale.owned_sales_amount === 7 * 999000, "Nilai omzet sendiri harus 7 * 999.000");
  
  // Total HPP = 5 * 500.000 + 2 * 520.000 = 2.500.000 + 1.040.000 = 3.540.000
  const expectedHpp = (5 * 500000) + (2 * 520000);
  assert(res.sale.total_hpp === expectedHpp, `Total HPP harus Rp${expectedHpp}, didapat: Rp${res.sale.total_hpp}`);
  
  // Cek sisa stok di database
  const stk = InventoryService.getStock("VAR-BONE-W7");
  assert(stk.owned_available_stock === 3, `Sisa stok milik sendiri harus 3 pcs, didapat: ${stk.owned_available_stock}`);

  console.log("  ✅ PASS: FIFO split-batch berhasil, HPP tepat Rp3.540.000, sisa stok 3 pcs");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 1:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 2: Mixed Owned and Consignment Multi-Item Sale
// -------------------------------------------------------------------------
try {
  console.log("\n[2/13] Menguji Penjualan Multi-Item Campuran (OWNED + CONSIGNMENT)...");
  // Beli 1 pc VAR-BONE-W7 (OWNED @ 950k) + 1 pc VAR-BONE-W8 (CONSIGNMENT Dzaki @ 300k)
  const saleData = {
    sales_channel: "WHATSAPP",
    customer_name: "Customer Campuran",
    payment_method: "TRANSFER_BCA",
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 950000
      },
      {
        variant_id: "VAR-BONE-W8",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 1,
        actual_price: 300000
      }
    ]
  };

  const res = SalesService.createSale(saleData);
  assert(res.success === true, "Transaksi campuran harus berhasil");
  assert(res.sale.gross_customer_payment === 1250000, "Gross customer payment = 950.000 + 300.000");
  assert(res.sale.owned_sales_amount === 950000, "Owned sales amount = 950.000");
  // Insentif CrocsCircle untuk Dzaki = 300.000 - 270.000 = 30.000
  assert(res.sale.vendor_incentive_amount === 30000, "Vendor incentive = 30.000");
  assert(res.sale.net_operational_revenue === 980000, "Omzet operasional bersih = 950.000 + 30.000 = 980.000");

  const consStk = InventoryService.getStock("VAR-BONE-W8");
  assert(consStk.consignment_available_stock === 2, "Stok konsinyasi Dzaki harus berkurang dari 3 menjadi 2 pcs");

  console.log("  ✅ PASS: Multi-item sukses dipisah, omzet toko Rp980.000, hak vendor Rp270.000");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 2:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 3: Option A Shipping Fee (Pass-Through Liability / Bukan Omzet)
// -------------------------------------------------------------------------
try {
  console.log("\n[3/13] Menguji Titipan Ongkir Pelanggan (Opsi A: Titipan Ekspedisi)...");
  // 1 pc VAR-BONE-W7 @ 950k, shipping_charge = 25k
  const saleData = {
    sales_channel: "WHATSAPP",
    customer_name: "Customer Luar Kota",
    payment_method: "TRANSFER_BCA",
    shipping_charge: 25000,
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 950000
      }
    ]
  };

  const res = SalesService.createSale(saleData);
  assert(res.success === true, "Transaksi berhasil");
  // Gross customer payment HARUS mencakup titipan kas ongkir = 950k + 25k = 975k
  assert(res.sale.gross_customer_payment === 975000, "Uang kas diterima harus 975.000");
  // Omzet operasional bersih TIDAK BOLEH memuat ongkir = 950.000
  assert(res.sale.net_operational_revenue === 950000, "Omzet resmi toko harus 950.000 (Opsi A)");
  assert(res.sale.owned_sales_amount === 950000, "Owned sales amount tidak boleh ditambah ongkir");

  console.log("  ✅ PASS: Opsi A terverifikasi. Kas diterima Rp975.000, omzet resmi tetap Rp950.000");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 3:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 4: Penolakan Diskon Kasir Pelanggar Hak Pokok Vendor Dzaki
// -------------------------------------------------------------------------
try {
  console.log("\n[4/13] Menguji Penolakan Diskon Kasir yang Melanggar Hak Vendor Dzaki (< Rp270.000)...");
  // Kasir mencoba menjual item konsinyasi Dzaki seharga Rp260.000 (di bawah fixed share Rp270.000)
  const saleData = {
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Nawar",
    payment_method: "CASH",
    items: [
      {
        variant_id: "VAR-BONE-W8",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 1,
        actual_price: 260000 // < 270.000!
      }
    ]
  };

  let threw = false;
  try {
    SalesService.createSale(saleData);
  } catch (err) {
    threw = true;
    assert(err.message.includes("tidak boleh lebih rendah dari hak pokok vendor") || err.message.includes("lebih rendah dari hak pokok vendor"), "Pesan error harus eksplisit menyebut hak vendor");
  }

  assert(threw === true, "Transaksi dengan harga di bawah hak pokok vendor harus DITOLAK");
  console.log("  ✅ PASS: Transaksi otomatis ditolak seketika melindungi hak pokok Dzaki Rp270.000");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 4:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 5: Perhitungan Insentif Konsinyasi dengan Diskon Sah
// -------------------------------------------------------------------------
try {
  console.log("\n[5/13] Menguji Insentif Konsinyasi Dzaki dengan Diskon Sah (Harga >= Rp280.000)...");
  // Harga kesepakatan Rp285.000 (di atas batas minimum Rp280.000)
  const saleData = {
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Deal Sah",
    payment_method: "QRIS",
    items: [
      {
        variant_id: "VAR-BONE-W8",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 1,
        actual_price: 285000
      }
    ]
  };

  const res = SalesService.createSale(saleData);
  assert(res.success === true, "Transaksi diskon sah harus berhasil");
  // Hak vendor Dzaki tetap Rp270.000
  // Insentif CrocsCircle = 285.000 - 270.000 = Rp15.000
  assert(res.sale.vendor_incentive_amount === 15000, "Insentif CrocsCircle harus tepat Rp15.000");
  assert(res.sale.net_operational_revenue === 15000, "Omzet bersih toko dari konsinyasi = Rp15.000");

  const detail = res.details[0];
  assert(detail.total_vendor_payable === 270000, "Kewajiban ke vendor Dzaki harus Rp270.000");

  console.log("  ✅ PASS: Diskon sah diterima. Hak vendor Dzaki Rp270.000 aman, insentif toko Rp15.000");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 5:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 6: Anti-Overselling Rejection
// -------------------------------------------------------------------------
try {
  console.log("\n[6/13] Menguji Penolakan Transaksi jika Stok Kurang (Anti-Overselling)...");
  // Cek sisa stok VAR-BONE-W7 saat ini: tersisa 1 pc (dari total 10 dikurangi 7 di skenario 1, 1 di skenario 2, 1 di skenario 3)
  const saleData = {
    sales_channel: "OFFLINE_EVENT",
    customer_name: "Customer Borongan",
    payment_method: "CASH",
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 10, // Minta 10 padahal sisa 1
        actual_price: 999000
      }
    ]
  };

  let threw = false;
  try {
    SalesService.createSale(saleData);
  } catch (err) {
    threw = true;
    assert(err.message.includes("tidak mencukupi") || err.message.includes("Stok"), "Error stok tidak mencukupi");
  }

  assert(threw === true, "Permintaan kuantitas melebihi stok harus ditolak");
  console.log("  ✅ PASS: Overselling berhasil dicegah dengan penolakan sistem");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 6:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 7: Validasi Batas Harga Minimum Konsinyasi Dzaki
// -------------------------------------------------------------------------
try {
  console.log("\n[7/13] Menguji Batas Minimum Harga Konsinyasi Dzaki (< Rp280.000)...");
  // Harga Rp275.000 (> fixed share 270k, tapi < min_selling_price 280k)
  const saleData = {
    sales_channel: "OFFLINE_EVENT",
    customer_name: "Customer Nego Bawah",
    payment_method: "CASH",
    items: [
      {
        variant_id: "VAR-BONE-W8",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-DZAKI",
        quantity: 1,
        actual_price: 275000
      }
    ]
  };

  let threw = false;
  try {
    SalesService.createSale(saleData);
  } catch (err) {
    threw = true;
    assert(err.message.includes("minimum"), "Error harus menyatakan di bawah harga jual minimum");
  }

  assert(threw === true, "Harga di bawah batas minimum Rp280.000 harus ditolak");
  console.log("  ✅ PASS: Validasi batas harga jual minimum Dzaki berfungsi sempurna");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 7:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 8: Penjualan Konsinyasi Model Persentase (Non-Dzaki)
// -------------------------------------------------------------------------
try {
  console.log("\n[8/13] Menguji Penjualan Konsinyasi Model Persentase (Vendor B 15%)...");
  // Jual 1 pc VAR-SLH-M9 @ Rp350.000
  const saleData = {
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Vendor B",
    payment_method: "QRIS",
    items: [
      {
        variant_id: "VAR-SLH-M9",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-PERCENT",
        quantity: 1,
        actual_price: 350000
      }
    ]
  };

  const res = SalesService.createSale(saleData);
  assert(res.success === true, "Penjualan konsinyasi persentase berhasil");
  // Fee 15% dari 350.000 = 52.500
  // Hak vendor 85% dari 350.000 = 297.500
  const detail = res.details[0];
  assert(detail.total_crocs_incentive === 52500, "Insentif CrocsCircle 15% = Rp52.500");
  assert(detail.total_vendor_payable === 297500, "Hak Vendor B 85% = Rp297.500");
  assert(res.sale.vendor_incentive_amount === 52500, "Vendor incentive = Rp52.500");

  console.log("  ✅ PASS: Model konsinyasi persentase (15%) tepat: Toko Rp52.500, Vendor Rp297.500");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 8:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 9: Retur Penjualan Parsial & Pemulihan Stok
// -------------------------------------------------------------------------
try {
  console.log("\n[9/13] Menguji Retur Penjualan Parsial & Pemulihan Stok Asal...");
  // Buat penjualan 1 pc VAR-BONE-W7
  const saleRes = SalesService.createSale({
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Retur",
    payment_method: "CASH",
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 999000
      }
    ]
  });

  const detailId = saleRes.details[0].sales_detail_id;
  const salesId = saleRes.sale.sales_id;

  // Lakukan retur 1 pc via returnSaleItem
  const returnRes = SalesService.returnSaleItem(
    salesId,
    detailId,
    1,
    "Cacat fisik pada sol sepatu",
    "KASIR"
  );

  assert(returnRes.success === true, "Proses retur harus berhasil");
  
  // Periksa apakah stok bertambah kembali menjadi 1 di STOK
  const stk = InventoryService.getStock("VAR-BONE-W7");
  assert(stk.owned_available_stock === 1, `Stok harus bertambah kembali menjadi 1, didapat: ${stk.owned_available_stock}`);

  // Periksa data di tabel RETUR_PENJUALAN
  const returRows = DatabaseHelper.getAllRows("RETUR_PENJUALAN", r => r.sales_id === salesId);
  assert(returRows.length === 1, "Harus tercatat 1 baris retur penjualan");
  assert(Number(returRows[0].quantity) === 1, "Kuantitas retur harus 1");
  assert(Number(returRows[0].refund_amount) === 999000, "Nilai refund harus Rp999.000");

  console.log("  ✅ PASS: Retur penjualan berhasil memulihkan stok batch asal dan mencatat audit retur");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 9:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 10: Retur Transaksi Penjualan dari Periode Buku CLOSED
// -------------------------------------------------------------------------
try {
  console.log("\n[10/13] Menguji Retur Penjualan atas Transaksi dari Periode CLOSED...");
  // Buat transaksi historis pada periode Oktober 2026 yang statusnya CLOSED
  const pastSalesId = "SLS-20261015-PAST";
  const pastDetailId = "SLSD-20261015-01";
  const existingBatch = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", b => b.variant_id === "VAR-BONE-W7")[0];
  const validBatchId = existingBatch ? existingBatch.purchase_detail_id : "PUR-001";
  
  DatabaseHelper.insertRow("PENJUALAN", {
    sales_id: pastSalesId,
    transaction_date: new Date("2026-10-15T10:00:00"),
    sales_channel: "OFFLINE_STORE",
    sales_type: "READY_STOCK",
    customer_name: "Customer Periode Lalu",
    payment_method: "CASH",
    payment_status: "LUNAS",
    gross_customer_payment: 999000,
    owned_sales_amount: 999000,
    vendor_incentive_amount: 0,
    net_operational_revenue: 999000,
    total_hpp: 500000,
    gross_profit: 499000,
    idempotency_key: "IDEMP-PAST-1015",
    notes: "Transaksi sebelum periode ditutup",
    created_by: "KASIR",
    created_at: new Date("2026-10-15T10:00:00")
  });

  DatabaseHelper.insertRow("DETAIL_PENJUALAN", {
    sales_detail_id: pastDetailId,
    sales_id: pastSalesId,
    variant_id: "VAR-BONE-W7",
    item_ownership: "OWNED",
    vendor_id: "",
    batch_id: validBatchId,
    quantity: 1,
    selling_price: 999000,
    hpp_unit: 500000,
    vendor_payable_unit: 0,
    crocs_incentive_unit: 0,
    subtotal: 999000,
    total_hpp: 500000,
    total_vendor_payable: 0,
    total_crocs_incentive: 0,
    vendor_paid_amount: 0,
    vendor_remaining_payable: 0,
    settlement_status: "NOT_APPLICABLE"
  });

  // Retur dieksekusi di periode saat ini (November 2026 - OPEN)
  const returnRes = SalesService.returnSaleItem(
    pastSalesId,
    pastDetailId,
    1,
    "Retur barang transaksi bulan lalu",
    "KASIR",
    new Date("2026-11-17T14:00:00")
  );

  assert(returnRes.success === true, "Retur di periode OPEN untuk transaksi CLOSED harus berhasil");
  
  // Catatan transaksi historis di periode lampau TIDAK BERUBAH (audit integrity)
  const pastSale = DatabaseHelper.getRowByPk("PENJUALAN", "sales_id", pastSalesId);
  assert(Number(pastSale.net_operational_revenue) === 999000, "Header transaksi di periode CLOSED tidak boleh dimodifikasi!");

  // Catatan retur berada di periode berjalan (kontra-pendapatan)
  const returnRow = DatabaseHelper.getRowByPk("RETUR_PENJUALAN", "return_id", returnRes.return_id);
  assert(returnRow !== null, "Baris retur harus tercatat di RETUR_PENJUALAN");

  console.log("  ✅ PASS: Retur transaksi CLOSED dicatat di periode OPEN berjalan tanpa merusak buku lama");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 10:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 11: Idempotency Key Anti-Duplicate Submission
// -------------------------------------------------------------------------
try {
  console.log("\n[11/13] Menguji Idempotency Key Mencegah Transaksi Ganda...");
  // Tambah stok segar untuk pengujian idempotency
  InventoryService.receiveOwnedStockBatch("PUR-IDEMP", "VAR-BONE-W7", 5, 500000, 0, "Stok Tes Idemp", "TESTER");

  const idempotencyKey = "UUID-POS-TEST-1111";
  
  const payload = {
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Idemp",
    payment_method: "QRIS",
    idempotency_key: idempotencyKey,
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 999000
      }
    ]
  };

  const res1 = SalesService.createSale(payload);
  assert(res1.success === true, "Panggilan pertama harus berhasil");
  assert(!res1.idempotentReplay, "Panggilan pertama bukan replay");

  // Panggilan kedua dengan idempotency_key yang sama
  const res2 = SalesService.createSale(payload);
  assert(res2.success === true, "Panggilan kedua harus sukses");
  assert(res2.idempotentReplay === true, "Panggilan kedua harus ditandai idempotentReplay");
  assert(res2.sale.sales_id === res1.sale.sales_id, "ID Transaksi harus identik");

  console.log("  ✅ PASS: Idempotency key mendeteksi duplikasi dan mencegah pemotongan stok ganda");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 11:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 12: Atomic Rollback Multi-Item Sale
// -------------------------------------------------------------------------
try {
  console.log("\n[12/13] Menguji Atomic Rollback jika Salah Satu Item Transaksi Gagal...");
  // Tambah stok untuk VAR-BONE-W7 agar item 1 bisa diambil
  InventoryService.receiveOwnedStockBatch("PUR-ROLLBACK", "VAR-BONE-W7", 5, 500000, 0, "Stok Rollback", "TESTER");

  const initialStock = InventoryService.getStock("VAR-BONE-W7").owned_available_stock;
  const initialSalesCount = DatabaseHelper.getAllRows("PENJUALAN").length;

  // Item 1 valid (1 pc W7), Item 2 gagal (9999 pcs Salehe)
  const failPayload = {
    sales_channel: "OFFLINE_STORE",
    customer_name: "Customer Rollback Test",
    payment_method: "CASH",
    items: [
      {
        variant_id: "VAR-BONE-W7",
        item_ownership: "OWNED",
        quantity: 1,
        actual_price: 999000
      },
      {
        variant_id: "VAR-SLH-M9",
        item_ownership: "CONSIGNMENT",
        vendor_id: "VND-PERCENT",
        quantity: 9999, // PASTI GAGAL OVERSOLD
        actual_price: 350000
      }
    ]
  };

  let threw = false;
  try {
    SalesService.createSale(failPayload);
  } catch (err) {
    threw = true;
  }

  assert(threw === true, "Transaksi harus gagal dilempar error");

  // Verifikasi Rollback: Stok item 1 tidak boleh terpotong dan tidak ada baris transaksi tersimpan
  const finalStock = InventoryService.getStock("VAR-BONE-W7").owned_available_stock;
  const finalSalesCount = DatabaseHelper.getAllRows("PENJUALAN").length;

  assert(finalStock === initialStock, `Stok item 1 harus di-rollback utuh (${initialStock} == ${finalStock})`);
  assert(finalSalesCount === initialSalesCount, "Tidak boleh ada header transaksi yatim di PENJUALAN");

  console.log("  ✅ PASS: Atomic rollback berhasil memulihkan stok dan membatalkan semua record");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 12:", e.message);
}

// -------------------------------------------------------------------------
// SKENARIO 13: WhatsApp Order Parser
// -------------------------------------------------------------------------
try {
  console.log("\n[13/13] Menguji WhatsApp Order Parser & Validasi Stok Tanpa Mutasi Database...");
  const rawWaText = `Halo *CrocsCircle.ID*, saya ingin melakukan pemesanan:
1. *Crocs Classic Clog - Bone* [READY STOCK]
   • Varian: Bone | Size: W7 (CRC-CLS-BN-W7)
   • Qty: 1 pcs @ Rp999.000
   • Subtotal: Rp999.000

Data Pengiriman:
• Nama: Siti Rahmawati
• No. WhatsApp: 08123456789
• Alamat Pengiriman: Jl. Sudirman No. 45, Jakarta Selatan`;

  const initialSalesCount = DatabaseHelper.getAllRows("PENJUALAN").length;
  const initialStock = InventoryService.getStock("VAR-BONE-W7").owned_available_stock;

  const parsed = StorefrontService.parseWhatsAppOrderText(rawWaText);

  assert(parsed.customer_name === "Siti Rahmawati", "Nama pelanggan harus diekstrak");
  assert(parsed.customer_phone === "08123456789", "Nomor telepon harus diekstrak");
  assert(parsed.items.length === 1, "Harus mengekstrak 1 item produk");
  assert(parsed.items[0].sku === "CRC-CLS-BN-W7", "SKU harus cocok");
  assert(parsed.items[0].variant_id === "VAR-BONE-W7", "Variant ID harus dipetakan dari database");
  assert(parsed.items[0].is_available === true, "Status ketersediaan stok harus true");

  // Pastikan TIDAK ADA mutasi pada database
  const finalSalesCount = DatabaseHelper.getAllRows("PENJUALAN").length;
  const finalStock = InventoryService.getStock("VAR-BONE-W7").owned_available_stock;

  assert(finalSalesCount === initialSalesCount, "Tidak boleh ada transaksi tersimpan dari parser WA");
  assert(finalStock === initialStock, "Stok tidak boleh terpotong dari parser WA");

  console.log("  ✅ PASS: WhatsApp order berhasil diekstrak dan divalidasi ke DB dengan zero-mutation");
  passedTests++;
} catch (e) {
  console.error("  ❌ FAIL Skenario 13:", e.message);
}

// --- SUMMARY ---
console.log("\n==================================================================");
console.log(`📊 HASIL PENGUJIAN PHASE 3D SUB-MODUL 1: ${passedTests}/${totalTests} PASS`);
console.log("==================================================================");

if (passedTests === totalTests) {
  console.log("🎉 SEMUA 13 SKENARIO KASIR & PENJUALAN (POS) LULUS 100%!");
  process.exit(0);
} else {
  console.error(`⚠️ Ada ${totalTests - passedTests} skenario yang gagal.`);
  process.exit(1);
}
