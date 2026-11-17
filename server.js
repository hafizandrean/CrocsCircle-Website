// CrocsCircle.ID — Local Web Server & API Bridge
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'src', 'frontend');

// Setup Mock GAS Environment for Backend Execution
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

// Load Backend Scripts
const backendDir = path.join(__dirname, 'src', 'backend');
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

// Initialize Database & Default Accounts
initializeCrocsCircleDatabase();

// Seed initial Owner 1 (Hafiz), Owner 2 (Harits), and Admin 1 (Admin Operasional)
try {
  AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
} catch (e) {}

try {
  AuthService.setupOwnerAccount("harits", "Harits Owner", "HaritsOwner2026!");
} catch (e) {}

try {
  const hafizLogin = AuthService.login("hafiz", "HafizOwner2026!");
  if (hafizLogin.success) {
    AuthService.createAdminAccount(hafizLogin.token, "admin1", "Admin Operasional", "AdminOperasional2026!");
  }
} catch (e) {}

// Seed Sample Real Stock & Transaction Data for Realistic Dashboard Experience
try {
  // Master Produk & Varian (Lengkap dengan is_published & catalog_price untuk Etalase Storefront)
  DatabaseHelper.insertRow("MASTER_PRODUK", {
    product_id: "PRD-CLS-01",
    product_name: "Crocs Classic Clog - Bone",
    category_id: "CAT-CLOG",
    model: "Classic Clog",
    sales_type: "READY_STOCK",
    image_url: "https://images.unsplash.com/photo-1560769629-975ec94e6a86",
    is_active: true,
    is_published: true
  });
  DatabaseHelper.insertRow("MASTER_PRODUK", {
    product_id: "PRD-ECH-01",
    product_name: "Crocs Echo Clog - Stucco",
    category_id: "CAT-CLOG",
    model: "Echo Clog",
    sales_type: "READY_STOCK",
    image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
    is_active: true,
    is_published: true
  });
  DatabaseHelper.insertRow("MASTER_PRODUK", {
    product_id: "PRD-MGC-01",
    product_name: "Crocs Mega Crush Clog - Black",
    category_id: "CAT-CLOG",
    model: "Mega Crush",
    sales_type: "READY_STOCK",
    image_url: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a",
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
  DatabaseHelper.insertRow("VARIAN_PRODUK", {
    variant_id: "VAR-CLS-W8",
    product_id: "PRD-CLS-01",
    size: "W8",
    sku: "CRC-CLS-BN-W8",
    color: "Bone",
    catalog_price: 999000,
    reference_hpp: 550000,
    is_active: true
  });
  DatabaseHelper.insertRow("VARIAN_PRODUK", {
    variant_id: "VAR-ECH-M9",
    product_id: "PRD-ECH-01",
    size: "M9",
    sku: "CRC-ECH-ST-M9",
    color: "Stucco",
    catalog_price: 1399000,
    reference_hpp: 820000,
    is_active: true
  });
  DatabaseHelper.insertRow("VARIAN_PRODUK", {
    variant_id: "VAR-MGC-W7",
    product_id: "PRD-MGC-01",
    size: "W7",
    sku: "CRC-MGC-BK-W7",
    color: "Black",
    catalog_price: 1599000,
    reference_hpp: 900000,
    is_active: true
  });

  // Stock Batches
  InventoryService.receiveOwnedStockBatch("PUR-01", "VAR-CLS-W7", 10, 550000, 0, "Batch Bone W7", "SYSTEM");
  InventoryService.receiveOwnedStockBatch("PUR-02", "VAR-CLS-W8", 2, 550000, 0, "Batch Bone W8", "SYSTEM"); // Low stock
  InventoryService.receiveOwnedStockBatch("PUR-03", "VAR-ECH-M9", 6, 820000, 0, "Batch Echo M9", "SYSTEM");
  InventoryService.receiveConsignmentStock("VND-DZAKI", "VAR-MGC-W7", 5, "Konsinyasi Dzaki Mega Crush", "SYSTEM");

  // Sample Sales
  SalesService.createSale({
    transaction_date: new Date(),
    customer_name: "Budi Santoso",
    sales_channel: "WHATSAPP",
    payment_method: "TRANSFER_BCA",
    items: [{ variant_id: "VAR-CLS-W7", item_ownership: "OWNED", quantity: 1, actual_price: 999000 }]
  });

  // Sample Pre-Order
  POService.createPreOrder({
    order_date: new Date(),
    customer_name: "Jessica Iskandar",
    customer_contact: "0812345678",
    items: [{ variant_id: "VAR-ECH-M9", quantity: 1, selling_price: 1399000 }]
  });

} catch (e) {}

// Static File Mime Types
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // -------------------------------------------------------------
  // API ROUTING
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');

    // Helper: Parse POST Body
    function getRequestBody(cb) {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          cb(json);
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: "Invalid JSON body" }));
        }
      });
    }

    // Helper: Extract Token from Authorization Header or Query (Header is prioritized for security)
    function extractToken() {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7).trim();
      }
      if (req.headers['x-session-token']) {
        return req.headers['x-session-token'].trim();
      }
      return parsedUrl.query.token || null;
    }

    // 1. POST /api/login
    if (pathname === '/api/login' && req.method === 'POST') {
      getRequestBody(data => {
        const result = AdminController.login(data.username, data.password);
        res.writeHead(result.success ? 200 : 401);
        res.end(JSON.stringify(result));
      });
      return;
    }

    // 2. GET /api/session
    if (pathname === '/api/session' && req.method === 'GET') {
      const token = extractToken();
      const result = AdminController.getSessionUser(token);
      res.writeHead(result.success ? 200 : 401);
      res.end(JSON.stringify(result));
      return;
    }

    // 3. POST /api/logout
    if (pathname === '/api/logout' && req.method === 'POST') {
      getRequestBody(data => {
        const token = data.token || extractToken();
        const result = AdminController.logout(token);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      });
      return;
    }

    // 4. GET /api/dashboard
    if (pathname === '/api/dashboard' && req.method === 'GET') {
      const token = extractToken();
      const month = parsedUrl.query.month;
      const year = parsedUrl.query.year;
      const result = AdminController.getDashboardData(token, month, year);
      res.writeHead(result.success ? 200 : (result.statusCode || 400));
      res.end(JSON.stringify(result));
      return;
    }

    // 5. GET /api/products
    if (pathname === '/api/products' && req.method === 'GET') {
      const token = extractToken();
      const result = AdminController.getProducts(token, parsedUrl.query);
      res.writeHead(result.success ? 200 : (result.statusCode || 400));
      res.end(JSON.stringify(result));
      return;
    }

    // 6. GET /api/products/detail
    if (pathname === '/api/products/detail' && req.method === 'GET') {
      const token = extractToken();
      const result = AdminController.getProductDetail(token, parsedUrl.query.id);
      res.writeHead(result.success ? 200 : (result.statusCode || 400));
      res.end(JSON.stringify(result));
      return;
    }

    // 7. POST /api/products (Create / Update Product)
    if (pathname === '/api/products' && req.method === 'POST') {
      getRequestBody(data => {
        const token = extractToken();
        const result = AdminController.saveProduct(token, data);
        res.writeHead(result.success ? 200 : (result.statusCode || 400));
        res.end(JSON.stringify(result));
      });
      return;
    }

    // 8. POST /api/variants (Create / Update Variant)
    if (pathname === '/api/variants' && req.method === 'POST') {
      getRequestBody(data => {
        const token = extractToken();
        const result = AdminController.saveVariant(token, data);
        res.writeHead(result.success ? 200 : (result.statusCode || 400));
        res.end(JSON.stringify(result));
      });
      return;
    }

    // 9. GET /api/inventory
    if (pathname === '/api/inventory' && req.method === 'GET') {
      const token = extractToken();
      const result = AdminController.getInventory(token, parsedUrl.query);
      res.writeHead(result.success ? 200 : (result.statusCode || 400));
      res.end(JSON.stringify(result));
      return;
    }

    // 10. POST /api/stock/receive (Receive Stock In: Owned / Consignment)
    if (pathname === '/api/stock/receive' && req.method === 'POST') {
      getRequestBody(data => {
        const token = extractToken();
        const result = AdminController.receiveStock(token, data);
        res.writeHead(result.success ? 200 : (result.statusCode || 400));
        res.end(JSON.stringify(result));
      });
      return;
    }

    // 11. GET /api/stock/movements
    if (pathname === '/api/stock/movements' && req.method === 'GET') {
      const token = extractToken();
      const result = AdminController.getStockMovements(token, parsedUrl.query);
      res.writeHead(result.success ? 200 : (result.statusCode || 400));
      res.end(JSON.stringify(result));
      return;
    }

    // 12. GET /api/metadata (Categories & Vendors)
    if (pathname === '/api/metadata' && req.method === 'GET') {
      const token = extractToken();
      const result = AdminController.getMasterMetadata(token);
      res.writeHead(result.success ? 200 : (result.statusCode || 400));
      res.end(JSON.stringify(result));
      return;
    }

    // 13. GET /api/storefront/catalog (Public Customer Catalog)
    if (pathname === '/api/storefront/catalog' && req.method === 'GET') {
      const result = StorefrontService.getCatalog(parsedUrl.query);
      res.writeHead(result.success ? 200 : 400);
      res.end(JSON.stringify(result));
      return;
    }

    // 14. GET /api/storefront/product (Public Product Detail)
    if (pathname === '/api/storefront/product' && req.method === 'GET') {
      try {
        const prodId = parsedUrl.query.id || parsedUrl.query.product_id;
        const result = StorefrontService.getProductDetail(prodId);
        res.writeHead(result.success ? 200 : 404);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 15. POST /api/storefront/validate-cart (Server-Side Cart Price & Availability Verification)
    if (pathname === '/api/storefront/validate-cart' && req.method === 'POST') {
      getRequestBody(data => {
        const result = StorefrontService.validateCart(data.items);
        res.writeHead(result.valid ? 200 : 400);
        res.end(JSON.stringify(result));
      });
      return;
    }

    // 16. POST /api/storefront/checkout-whatsapp (WhatsApp Order Inquiry Generator)
    if (pathname === '/api/storefront/checkout-whatsapp' && req.method === 'POST') {
      getRequestBody(data => {
        try {
          const result = StorefrontService.generateWhatsAppOrder(data);
          res.writeHead(result.success ? 200 : 400);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 17. POST /api/sales/create (Kasir & POS Transaction Recording)
    if (pathname === '/api/sales/create' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid atau telah kedaluwarsa." }));
        return;
      }
      getRequestBody(data => {
        try {
          data.created_by = session.user.username;
          const result = SalesService.createSale(data);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 18. GET /api/sales/list (Sales History with RBAC Sanitization)
    if (pathname === '/api/sales/list' && req.method === 'GET') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      try {
        const result = SalesService.getSalesList(parsedUrl.query, token);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 19. GET /api/sales/detail (Sales Detail by ID)
    if (pathname === '/api/sales/detail' && req.method === 'GET') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      try {
        const salesId = parsedUrl.query.id || parsedUrl.query.sales_id;
        const result = SalesService.getSaleById(salesId);
        res.writeHead(result ? 200 : 404);
        res.end(JSON.stringify(result ? { success: true, sale: result.header, details: result.details } : { success: false, error: "Transaksi tidak ditemukan" }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 20. POST /api/sales/return (Process Sale Item Return)
    if (pathname === '/api/sales/return' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          const result = SalesService.returnSaleItem(
            data.sales_id,
            data.sales_detail_id || data.detail_id,
            data.quantity,
            data.reason,
            session.user.username,
            data.return_date,
            data.idempotency_key
          );
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 21. POST /api/sales/parse-wa (Parse & Validate Pasted WhatsApp Order Text)
    if (pathname === '/api/sales/parse-wa' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          const result = StorefrontService.parseWhatsAppOrderText(data.raw_text);
          res.writeHead(result.success ? 200 : 400);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 22. GET /api/pos/variants (Real-Time Variants & Stock Lookup for POS Terminal)
    if (pathname === '/api/pos/variants' && req.method === 'GET') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      try {
        const allProds = DatabaseHelper.getAllRows("MASTER_PRODUK", p => p.is_active === true || p.is_active === "true" || p.is_active === 1 || p.is_active === undefined);
        const allVars = DatabaseHelper.getAllRows("VARIAN_PRODUK", v => v.is_active === true || v.is_active === "true" || v.is_active === 1 || v.is_active === undefined);
        const allStocks = DatabaseHelper.getAllRows("STOK");
        const allLots = DatabaseHelper.getAllRows("BATCH_KONSINYASI", l => (l.status === "ACTIVE" || !l.status) && Number(l.remaining_qty) > 0);
        const allVendors = DatabaseHelper.getAllRows("VENDORS");

        const prodMap = {};
        allProds.forEach(p => { prodMap[p.product_id] = p; });

        const stockMap = {};
        allStocks.forEach(s => { stockMap[s.variant_id] = s; });

        const vendorMap = {};
        allVendors.forEach(v => { vendorMap[v.vendor_id] = v; });

        const posVariants = allVars.map(v => {
          const p = prodMap[v.product_id] || {};
          const stk = stockMap[v.variant_id] || {};

          const ownedPhys = Number(stk.owned_physical_stock) || 0;
          const ownedRes = Number(stk.owned_reserved_stock) || 0;
          const ownedAvail = Math.max(0, ownedPhys - ownedRes);

          const consPhys = Number(stk.consignment_physical_stock) || 0;
          const consRes = Number(stk.consignment_reserved_stock) || 0;
          const consAvail = Math.max(0, consPhys - consRes);

          const varLots = allLots.filter(l => String(l.variant_id) === String(v.variant_id)).map(l => {
            const vnd = vendorMap[l.vendor_id] || {};
            return {
              lot_id: l.consignment_lot_id,
              vendor_id: l.vendor_id,
              vendor_name: vnd.vendor_name || l.vendor_id,
              remaining_qty: Number(l.remaining_qty) || 0,
              fixed_share: Number(vnd.fixed_vendor_share) || 0,
              min_selling_price: Number(vnd.min_selling_price) || 0,
              fee_type: vnd.consignment_fee_type,
              fee_value: Number(vnd.default_consignment_fee)
            };
          });

          return {
            variant_id: v.variant_id,
            sku: v.sku,
            product_id: v.product_id,
            product_name: p.product_name || "Produk",
            model: p.model || "",
            image_url: p.image_url || "",
            color: v.color || "-",
            size: v.size || "-",
            catalog_price: Number(v.catalog_price) || 0,
            owned_available_stock: ownedAvail,
            consignment_available_stock: consAvail,
            total_available_stock: ownedAvail + consAvail,
            consignment_lots: varLots
          };
        });

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, count: posVariants.length, variants: posVariants }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 23. POST /api/po/create (Create Pre-Order)
    if (pathname === '/api/po/create' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          data.created_by = session.user.username;
          const result = POService.createPreOrder(data);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 24. GET /api/po/list (Filterable Pre-Order List)
    if (pathname === '/api/po/list' && req.method === 'GET') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      try {
        const filters = {
          payment_status: parsedUrl.query.payment_status,
          procurement_status: parsedUrl.query.procurement_status,
          fulfillment_status: parsedUrl.query.fulfillment_status,
          startDate: parsedUrl.query.startDate,
          endDate: parsedUrl.query.endDate,
          search: parsedUrl.query.search
        };
        const result = POService.getPOList(filters, token);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 25. GET /api/po/detail (Pre-Order Detail with Payments)
    if (pathname === '/api/po/detail' && req.method === 'GET') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      try {
        const poId = parsedUrl.query.id || parsedUrl.query.po_id;
        const result = POService.getPOById(poId);
        res.writeHead(result ? 200 : 404);
        res.end(JSON.stringify(result ? { success: true, ...result } : { success: false, error: "PO tidak ditemukan" }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // 26. POST /api/po/payment (Record PO Down Payment or Settlement)
    if (pathname === '/api/po/payment' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          data.created_by = session.user.username;
          const result = POService.recordPayment(data.po_id, data);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 27. POST /api/po/procurement (Update Procurement Status)
    if (pathname === '/api/po/procurement' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          const result = POService.updateProcurementStatus(data.po_id, data.status, session.user.username);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 28. POST /api/po/allocate (Reserve/Allocate Stock for PO)
    if (pathname === '/api/po/allocate' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          const result = POService.allocateStockForPO(data.po_id, data.stock_category, session.user.username);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 29. POST /api/po/fulfill (Fulfill/Deliver Item to Customer)
    if (pathname === '/api/po/fulfill' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          const result = POService.fulfillPO(data.po_id, data.stock_category, session.user.username);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 30. POST /api/po/cancel (Cancel Pre-Order with Refund Validation)
    if (pathname === '/api/po/cancel' && req.method === 'POST') {
      const token = extractToken();
      const session = AuthService.validateSession(token);
      if (!session.valid) {
        res.writeHead(401);
        res.end(JSON.stringify({ success: false, error: "Sesi tidak valid." }));
        return;
      }
      getRequestBody(data => {
        try {
          const result = POService.cancelPO(
            data.po_id,
            data.reason,
            data.refund_amount,
            data.payment_method,
            data.stock_category,
            session.user.username,
            data.idempotency_key
          );
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // API Not Found
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: "API endpoint not found" }));
    return;
  }

  // -------------------------------------------------------------
  // STATIC FILES SERVING
  // -------------------------------------------------------------
  let reqPath = pathname;
  if (reqPath === '/') {
    reqPath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, reqPath);

  // Security check: ensure path is within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 CrocsCircle.ID Full Web Platform & API is RUNNING!`);
  console.log(`----------------------------------------------------`);
  console.log(`🛒 Customer Storefront : http://localhost:${PORT}/index.html`);
  console.log(`🔐 Admin Login Screen  : http://localhost:${PORT}/login.html`);
  console.log(`📊 Admin Portal        : http://localhost:${PORT}/admin.html`);
  console.log(`----------------------------------------------------`);
  console.log(`👑 Owner 1 Kredensial  : hafiz   / HafizOwner2026!`);
  console.log(`👑 Owner 2 Kredensial  : harits  / HaritsOwner2026!`);
  console.log(`👤 Admin Kredensial    : admin1  / AdminOperasional2026!`);
  console.log(`====================================================`);
});
