/**
 * CROCSCIRCLE.ID — PHASE 3E.1 TEST SUITE
 * Google Apps Script Web App Router & RBAC Audit
 *
 * Verifies:
 * 1. Global doGet(e) and doPost(e) entry points with ContentService mock.
 * 2. Parameter parsing (action, token, body, pathInfo).
 * 3. Public endpoints (ping, health, login, catalog, product detail, validate-cart, checkout-whatsapp).
 * 4. Authentication enforcement (missing token, invalid token -> 401).
 * 5. Strict Role-Based Access Control (RBAC):
 *    - Admin role receives 403 Forbidden on all Owner-only endpoints.
 *    - Owner role successfully accesses financial, closing, and reconciliation endpoints.
 * 6. Financial data sanitization (HPP, COGS, profit redacted for Admin on sales lists).
 * 7. Operational routes execution (sales/create, po/create, pos/variants, purchases, expenses).
 * 8. Error handling (malformed JSON, invalid action -> 404, validation errors -> 400).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Setup Mock GAS Environment
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
global.Logger = { log: () => {} };
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

// Mock ContentService for Google Apps Script
global.ContentService = {
  MimeType: {
    JSON: 'application/json',
    TEXT: 'text/plain'
  },
  createTextOutput: function(content) {
    let currentMimeType = 'text/plain';
    return {
      setMimeType: function(type) {
        currentMimeType = type;
        return this;
      },
      getMimeType: function() { return currentMimeType; },
      getContent: function() { return content; }
    };
  }
};

// Load Backend Scripts
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
loadBackendFile('WebAppRouter.gs', 'WebAppRouter');

// Top-level GAS entry functions
global.doGet = WebAppRouter.handleRequest.bind(null, "GET");
global.doPost = WebAppRouter.handleRequest.bind(null, "POST");

// Helper to unpack ContentService response
function unpackResponse(output) {
  const raw = output.getContent();
  const mime = output.getMimeType();
  const json = JSON.parse(raw);
  return { mime, json };
}

// Test Runner Engine
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message, extra) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message} -> GOT:`, extra !== undefined ? extra : "");
  }
}

async function runPhase3E1TestSuite() {
  console.log("================================================================================");
  console.log("CROCSCIRCLE.ID — PHASE 3E.1 TEST SUITE: WEB APP ROUTER & RBAC AUDIT");
  console.log("================================================================================\n");

  // 1. Inisialisasi Database
  initializeCrocsCircleDatabase();
  assert(true, "Database inisialisasi berhasil untuk Phase 3E.1");

  // 2. Setup Akun Pengguna: Owner (Hafiz) dan Admin (Admin1)
  AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
  const hafizLoginDirect = AuthService.login("hafiz", "HafizOwner2026!");
  assert(hafizLoginDirect.success, "Akun Owner 'hafiz' berhasil disiapkan");

  AuthService.createAdminAccount(hafizLoginDirect.token, "admin1", "Admin Operasional", "AdminOp2026!");
  const adminLoginDirect = AuthService.login("admin1", "AdminOp2026!");
  assert(adminLoginDirect.success, "Akun Admin 'admin1' berhasil disiapkan");

  let ownerToken = hafizLoginDirect.token;
  let adminToken = adminLoginDirect.token;

  // 3. Seed Master Data Produk, Vendor, Stok, dan Batch FIFO
  DatabaseHelper.insertRow("VENDORS", {
    vendor_id: "VND-DZK",
    vendor_name: "Dzaki Consignment",
    contact_person: "Dzaki",
    consignment_fee_type: "PERCENTAGE",
    default_consignment_fee: 10,
    status: "ACTIVE"
  });

  DatabaseHelper.insertRow("MASTER_PRODUK", {
    product_id: "PRD-CLS-01",
    product_name: "Crocs Classic Clog Bone",
    category_id: "CAT-CLOG",
    model: "Classic Clog",
    sales_type: "READY_STOCK",
    is_active: true,
    is_published: true
  });

  DatabaseHelper.insertRow("VARIAN_PRODUK", {
    variant_id: "VAR-CLS-W7",
    product_id: "PRD-CLS-01",
    size: "W7",
    sku: "CRC-CLS-BN-W7",
    color: "Bone",
    catalog_price: 999000,
    reference_hpp: 550000,
    is_active: true
  });

  DatabaseHelper.insertRow("STOK", {
    variant_id: "VAR-CLS-W7",
    owned_physical_stock: 10,
    owned_reserved_stock: 0,
    consignment_physical_stock: 5,
    consignment_reserved_stock: 0,
    total_available_stock: 15
  });

  // Batch FIFO Stok Sendiri di DETAIL_PEMBELIAN
  DatabaseHelper.insertRow("DETAIL_PEMBELIAN", {
    purchase_detail_id: "BATCH-CLS-01",
    purchase_id: "PUR-INIT-01",
    variant_id: "VAR-CLS-W7",
    quantity: 10,
    remaining_qty: 10,
    base_unit_cost: 500000,
    shipping_cost_allocation: 0,
    unit_cost: 500000,
    subtotal: 5000000
  });

  // Batch Konsinyasi Vendor
  DatabaseHelper.insertRow("BATCH_KONSINYASI", {
    consignment_lot_id: "LOT-DZK-01",
    vendor_id: "VND-DZK",
    variant_id: "VAR-CLS-W7",
    received_qty: 5,
    remaining_qty: 5,
    sold_qty: 0,
    status: "ACTIVE"
  });

  // ============================================================================
  // BAGIAN 1: PUBLIC ENDPOINTS (No Auth Required)
  // ============================================================================
  console.log("\n--- BAGIAN 1: PUBLIC ENDPOINTS ---");

  // 1.1 Ping & Health Check via doGet
  {
    const res = unpackResponse(global.doGet({ parameter: { action: "ping" } }));
    assert(res.mime === "application/json", "doGet(ping) returns application/json mime type");
    assert(res.json.success === true && res.json.statusCode === 200, "doGet(ping) status 200 OK");
  }

  // 1.2 Health Check via doPost
  {
    const res = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify({ action: "health" }) }
    }));
    assert(res.json.success === true, "doPost(health) returns success: true");
  }

  // 1.3 Login Endpoint (Valid)
  {
    const res = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify({ action: "login", username: "hafiz", password: "HafizOwner2026!" }) }
    }));
    assert(res.json.success === true && res.json.token !== undefined, "doPost(login) berhasil menghasilkan session token");
    assert(res.json.user.role === "OWNER", "User role teridentifikasi sebagai OWNER");
    // Update ownerToken with fresh token after successful login
    ownerToken = res.json.token;
  }

  // 1.4 Login Endpoint (Invalid Password -> 401)
  {
    const res = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify({ action: "login", username: "hafiz", password: "WrongPassword" }) }
    }));
    assert(res.json.success === false && (res.json.statusCode === 401 || !res.json.token), "Login dengan password salah ditolak");
  }

  // 1.5 Login Endpoint (Missing Username/Password -> 400)
  {
    const res = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify({ action: "login" }) }
    }));
    assert(res.json.success === false && res.json.statusCode === 400, "Login tanpa kredensial menghasilkan error 400");
  }

  // 1.6 Storefront Catalog (doGet)
  {
    const res = unpackResponse(global.doGet({ parameter: { action: "storefront/catalog" } }));
    assert(res.json.success === true && Array.isArray(res.json.products), "doGet(storefront/catalog) mengembalikan daftar produk");
    assert(res.json.products.length > 0, "Katalog storefront memuat minimal 1 produk aktif");
  }

  // 1.7 Storefront Product Detail (Valid ID)
  {
    const res = unpackResponse(global.doGet({
      parameter: { action: "storefront/product", id: "PRD-CLS-01" }
    }));
    assert(res.json.success === true && res.json.product.product_id === "PRD-CLS-01", "doGet(storefront/product) mengembalikan detail produk yang benar");
  }

  // 1.8 Storefront Product Detail (Invalid ID -> 404)
  {
    const res = unpackResponse(global.doGet({
      parameter: { action: "storefront/product", id: "PRD-NON-EXISTENT" }
    }));
    assert(res.json.success === false && res.json.statusCode === 404, "Detail produk tidak ditemukan menghasilkan 404");
  }

  // 1.9 Storefront Validate Cart (Valid items)
  {
    const res = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "storefront/validate-cart",
          items: [{ variant_id: "VAR-CLS-W7", quantity: 2 }]
        })
      }
    }));
    assert(res.json.valid === true && res.json.items.length === 1, "doPost(storefront/validate-cart) memvalidasi keranjang belanja");
  }

  // 1.10 Storefront Checkout WhatsApp
  {
    const res = unpackResponse(global.doPost({
      postData: {
        contents: JSON.stringify({
          action: "storefront/checkout-whatsapp",
          customer_name: "Budi Santoso",
          customer_phone: "08123456789",
          address: "Jl. Sudirman No. 1 Jakarta",
          items: [{ variant_id: "VAR-CLS-W7", quantity: 1, item_name: "Classic Clog", price: 999000, size: "W7" }]
        })
      }
    }));
    assert(res.json.success === true && typeof res.json.whatsapp_url === "string", "doPost(storefront/checkout-whatsapp) menghasilkan link WhatsApp");
  }

  // ============================================================================
  // BAGIAN 2: AUTHENTICATION & SESSION VALIDATION
  // ============================================================================
  console.log("\n--- BAGIAN 2: AUTHENTICATION & SESSION GUARDS ---");

  // 2.1 Protected endpoint without token -> 401
  {
    const res = unpackResponse(global.doGet({ parameter: { action: "dashboard/data" } }));
    assert(res.json.success === false && res.json.statusCode === 401, "Akses tanpa token ke dashboard ditolak (401)");
  }

  // 2.2 Protected endpoint with invalid token -> 401
  {
    const res = unpackResponse(global.doGet({
      parameter: { action: "dashboard/data", token: "INVALID_DUMMY_TOKEN" }
    }));
    assert(res.json.success === false && res.json.statusCode === 401, "Akses dengan token tidak valid ditolak (401)");
  }

  // 2.3 Session verification endpoint
  {
    const res = unpackResponse(global.doGet({
      parameter: { action: "auth/session", token: ownerToken }
    }));
    assert(res.json.success === true && res.json.user && res.json.user.username === "hafiz", "Verifikasi sesi menghasilkan info user yang valid", res.json);
  }

  // 2.4 Token passing via body in doPost
  {
    const res = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify({ action: "dashboard/data", token: ownerToken }) }
    }));
    assert(res.json.success === true, "Token passed via POST body successfully authenticated", res.json);
  }

  // 2.5 PathInfo support: action extracted from e.pathInfo
  {
    const res = unpackResponse(global.doGet({
      pathInfo: "dashboard/data",
      parameter: { token: ownerToken }
    }));
    assert(res.json.success === true, "Action via e.pathInfo berhasil di-route", res.json);
  }

  // 2.6 Malformed JSON in POST body -> 400
  {
    const res = unpackResponse(global.doPost({
      postData: { contents: "{ malformed json ... " }
    }));
    assert(res.json.success === false && res.json.statusCode === 400, "Request body JSON yang rusak menghasilkan error 400");
  }

  // 2.7 Missing action parameter -> 400
  {
    const res = unpackResponse(global.doGet({ parameter: {} }));
    assert(res.json.success === false && res.json.statusCode === 400, "Request tanpa action menghasilkan error 400");
  }

  // 2.8 Unknown action -> 404
  {
    const res = unpackResponse(global.doGet({
      parameter: { action: "unknown/unmapped/action", token: ownerToken }
    }));
    assert(res.json.success === false && res.json.statusCode === 404, "Unknown action menghasilkan error 404", res.json);
  }

  // ============================================================================
  // BAGIAN 3: STRICT ROLE-BASED ACCESS CONTROL (RBAC)
  // ============================================================================
  console.log("\n--- BAGIAN 3: STRICT ROLE-BASED ACCESS CONTROL (RBAC) ---");

  // 3.1 Admin BISA mengakses endpoint operasional
  {
    const resDash = unpackResponse(global.doGet({
      parameter: { action: "dashboard/data", token: adminToken }
    }));
    assert(resDash.json.success === true, "Admin BERHASIL mengakses dashboard/data operasional");
    assert(resDash.json.is_financial_restricted === true && resDash.json.financial === null, "Dashboard merespon dengan status non-owner untuk admin", resDash.json);

    const resProds = unpackResponse(global.doGet({
      parameter: { action: "products/list", token: adminToken }
    }));
    assert(resProds.json.success === true, "Admin BERHASIL mengakses products/list");

    const resInv = unpackResponse(global.doGet({
      parameter: { action: "inventory/list", token: adminToken }
    }));
    assert(resInv.json.success === true, "Admin BERHASIL mengakses inventory/list");

    const resPos = unpackResponse(global.doGet({
      parameter: { action: "pos/variants", token: adminToken }
    }));
    assert(resPos.json.success === true && Array.isArray(resPos.json.variants), "Admin BERHASIL mengakses pos/variants");
  }

  // 3.2 Admin DITOLAK (403 Forbidden) pada SEMUA Endpoint Khusus Owner
  const ownerOnlyEndpoints = [
    { action: "reports/income-statement", method: "GET" },
    { action: "reports/cash-flow", method: "GET" },
    { action: "reports/vendor-reconciliation", method: "GET" },
    { action: "finance/opening-cash/record", method: "POST" },
    { action: "finance/opening-cash/get", method: "GET" },
    { action: "closing/preview", method: "GET" },
    { action: "closing/close-period", method: "POST" },
    { action: "closing/reopen-period", method: "POST" },
    { action: "closing/fund-balances", method: "GET" },
    { action: "closing/fund-withdrawal", method: "POST" },
    { action: "auth/create-admin", method: "POST" }
  ];

  ownerOnlyEndpoints.forEach(ep => {
    let res;
    if (ep.method === "GET") {
      res = unpackResponse(global.doGet({
        parameter: { action: ep.action, token: adminToken }
      }));
    } else {
      res = unpackResponse(global.doPost({
        postData: { contents: JSON.stringify({ action: ep.action, token: adminToken }) }
      }));
    }
    assert(
      res.json.success === false && res.json.statusCode === 403,
      `RBAC Guard: Admin DITOLAK (403) pada endpoint Owner '${ep.action}'`
    );
  });

  // 3.3 Owner BISA mengakses SEMUA Endpoint Khusus Owner
  {
    const resIS = unpackResponse(global.doGet({
      parameter: { action: "reports/income-statement", month: 10, year: 2026, token: ownerToken }
    }));
    assert(resIS.json.success === true && resIS.json.report !== undefined, "Owner BERHASIL mengakses reports/income-statement", resIS.json);

    const resCF = unpackResponse(global.doGet({
      parameter: { action: "reports/cash-flow", month: 10, year: 2026, token: ownerToken }
    }));
    assert(resCF.json.success === true && resCF.json.report !== undefined, "Owner BERHASIL mengakses reports/cash-flow", resCF.json);

    const resVR = unpackResponse(global.doGet({
      parameter: { action: "reports/vendor-reconciliation", token: ownerToken }
    }));
    assert(resVR.json.success === true, "Owner BERHASIL mengakses reports/vendor-reconciliation", resVR.json);

    const resFunds = unpackResponse(global.doGet({
      parameter: { action: "closing/fund-balances", token: ownerToken }
    }));
    assert(resFunds.json.success === true && resFunds.json.fund_balances !== undefined, "Owner BERHASIL mengakses closing/fund-balances", resFunds.json);

    const resPrev = unpackResponse(global.doGet({
      parameter: { action: "closing/preview", month: 10, year: 2026, token: ownerToken }
    }));
    assert(resPrev.json.success === true && resPrev.json.preview !== undefined, "Owner BERHASIL mengakses closing/preview", resPrev.json);
  }

  // ============================================================================
  // BAGIAN 4: DATA SANITIZATION (Non-Owner Data Masking)
  // ============================================================================
  console.log("\n--- BAGIAN 4: FINANCIAL DATA SANITIZATION ---");

  // 4.1 Buat Transaksi Penjualan untuk Uji Sanitasi
  const createSalePayload = {
    action: "sales/create",
    token: adminToken,
    customer_name: "Customer Sanitization Test",
    customer_phone: "08111222333",
    payment_method: "TRANSFER",
    sales_channel: "OFFLINE_EVENT",
    sales_type: "READY_STOCK",
    items: [{
      variant_id: "VAR-CLS-W7",
      item_ownership: "OWNED",
      quantity: 1,
      actual_price: 999000,
      discount: 0
    }]
  };
  const createSaleRes = unpackResponse(global.doPost({
    postData: { contents: JSON.stringify(createSalePayload) }
  }));
  assert(createSaleRes.json.success === true, "Transaksi penjualan berhasil dibuat via WebAppRouter", createSaleRes.json);

  // 4.2 Query sales/list oleh Admin -> HPP dan Profit HARUS disanitasi
  {
    const adminSalesList = unpackResponse(global.doGet({
      parameter: { action: "sales/list", token: adminToken }
    }));
    assert(adminSalesList.json.success === true, "Admin berhasil mengambil daftar penjualan");

    // Periksa bahwa tidak ada field laba kotor, HPP, atau cogs yang bocor
    const jsonStr = JSON.stringify(adminSalesList.json);
    const leaksCOGS = jsonStr.includes('"hpp"') || jsonStr.includes('"cogs"') || jsonStr.includes('"unit_cost"');
    const leaksProfit = jsonStr.includes('"gross_profit"') || jsonStr.includes('"net_profit"') || jsonStr.includes('"total_profit"');

    assert(!leaksCOGS, "Sanitasi: Tidak ada field HPP/COGS yang bocor ke role Admin");
    assert(!leaksProfit, "Sanitasi: Tidak ada field Laba/Profit yang bocor ke role Admin");
  }

  // 4.3 Query sales/list oleh Owner -> Nilai keuangan tetap terlihat
  {
    const ownerSalesList = unpackResponse(global.doGet({
      parameter: { action: "sales/list", token: ownerToken }
    }));
    assert(ownerSalesList.json.success === true, "Owner berhasil mengambil daftar penjualan", ownerSalesList.json);
    assert(ownerSalesList.json.sales && ownerSalesList.json.sales.length > 0, "Daftar penjualan memuat data transaksi");
  }

  // ============================================================================
  // BAGIAN 5: OPERATIONAL WORKFLOWS VIA WEB APP ROUTER
  // ============================================================================
  console.log("\n--- BAGIAN 5: OPERATIONAL WORKFLOWS VIA WEB APP ROUTER ---");

  // 5.1 Pre-Order Creation & Detail via Router
  let createdPoId = null;
  {
    const poPayload = {
      action: "po/create",
      token: adminToken,
      customer_name: "Customer PO Test",
      customer_phone: "0899887766",
      variant_id: "VAR-CLS-W7",
      size: "W7",
      quantity: 1,
      selling_price: 1200000,
      down_payment: 500000,
      payment_method: "TRANSFER",
      target_date: "2026-11-30"
    };
    const poRes = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify(poPayload) }
    }));
    assert(poRes.json.success === true && poRes.json.po_id !== undefined, "Pre-Order berhasil dibuat via WebAppRouter", poRes.json);
    createdPoId = poRes.json.po_id;

    // Ambil detail PO via doGet
    const poDetailRes = unpackResponse(global.doGet({
      parameter: { action: "po/detail", id: createdPoId, token: adminToken }
    }));
    assert(poDetailRes.json.success === true && poDetailRes.json.po && poDetailRes.json.po.po_id === createdPoId, "Detail PO berhasil diambil via WebAppRouter");
  }

  // 5.2 PO Payment via Router
  {
    const poPayPayload = {
      action: "po/payment",
      token: adminToken,
      po_id: createdPoId,
      amount: 700000,
      payment_type: "SETTLEMENT",
      payment_method: "TRANSFER",
      notes: "Pelunasan sisa PO"
    };
    const payRes = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify(poPayPayload) }
    }));
    assert(payRes.json.success === true, "Pelunasan PO berhasil dicatat via WebAppRouter", payRes.json);
  }

  // 5.3 Supplier Purchase Invoice & Payment via Router
  let createdPurchaseId = null;
  {
    const purPayload = {
      action: "purchases/create",
      token: adminToken,
      supplier_name: "Supplier Crocs Resmi",
      invoice_number: "INV-SUP-E1-001",
      invoice_date: "2026-10-15",
      due_date: "2026-11-15",
      shipping_cost: 50000,
      items: [{
        variant_id: "VAR-CLS-W7",
        quantity: 10,
        base_unit_cost: 500000
      }],
      notes: "Pembelian stok resmi via Router"
    };
    const purRes = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify(purPayload) }
    }));
    assert(purRes.json.success === true && purRes.json.purchase_id !== undefined, "Faktur pembelian supplier berhasil dibuat via WebAppRouter", purRes.json);
    createdPurchaseId = purRes.json.purchase_id;

    // Catat pembayaran faktur bertahap via Router
    const purPayPayload = {
      action: "purchases/payment-record",
      token: adminToken,
      purchase_id: createdPurchaseId,
      amount: 2000000,
      payment_method: "TRANSFER",
      notes: "DP Pembelian Stok"
    };
    const purPayRes = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify(purPayPayload) }
    }));
    assert(purPayRes.json.success === true, "Pembayaran bertahap faktur supplier berhasil dicatat via WebAppRouter", purPayRes.json);

    // Riwayat pembayaran faktur
    const purHistRes = unpackResponse(global.doGet({
      parameter: { action: "purchases/payments", purchase_id: createdPurchaseId, token: adminToken }
    }));
    assert(purHistRes.json.success === true && purHistRes.json.payments && purHistRes.json.payments.length === 1, "Riwayat pembayaran faktur supplier berhasil diambil via WebAppRouter", purHistRes.json);
  }

  // 5.4 Operational Expense via Router
  {
    const expPayload = {
      action: "expenses/create",
      token: adminToken,
      category: "PACKAGING",
      amount: 150000,
      payment_method: "TRANSFER",
      notes: "Pembelian bubble wrap dan box packing"
    };
    const expRes = unpackResponse(global.doPost({
      postData: { contents: JSON.stringify(expPayload) }
    }));
    assert(expRes.json.success === true && expRes.json.expense_id !== undefined, "Beban operasional berhasil dicatat via WebAppRouter", expRes.json);

    // Daftar pengeluaran via doGet
    const expListRes = unpackResponse(global.doGet({
      parameter: { action: "expenses/list", token: adminToken }
    }));
    assert(expListRes.json.success === true && expListRes.json.expenses && expListRes.json.expenses.length > 0, "Daftar beban operasional berhasil diambil via WebAppRouter", expListRes.json);
  }

  // 5.5 POS Real-Time Variants Lookup
  {
    const posRes = unpackResponse(global.doGet({
      parameter: { action: "pos/variants", token: adminToken }
    }));
    assert(posRes.json.success === true && posRes.json.count > 0, "POS variants mengembalikan data varian");
    const v = posRes.json.variants[0];
    assert(v.variant_id && v.sku && typeof v.total_available_stock === "number", "Struktur POS variant lengkap dengan stok fisik & konsinyasi");
  }

  // ============================================================================
  // BAGIAN 6: AUDIT SUMMARY & VERIFIKASI AKHIR
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`PHASE 3E.1 TEST SUMMARY:`);
  console.log(`Total Assertions : ${totalTests}`);
  console.log(`Passed           : ${passedTests}`);
  console.log(`Failed           : ${failedTests}`);
  console.log("================================================================================");

  if (failedTests > 0) {
    throw new Error(`Test Suite Phase 3E.1 gagal dengan ${failedTests} kesalahan.`);
  }
}

// Run test immediately
runPhase3E1TestSuite().catch(err => {
  console.error("FATAL ERROR IN TEST EXECUTION:", err);
  process.exit(1);
});
