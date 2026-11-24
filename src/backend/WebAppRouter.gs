/**
 * CROCSCIRCLE.ID — GOOGLE APPS SCRIPT WEB APP ROUTER
 * Version: 1.0.0 (Phase 3E.1)
 *
 * Universal Web App Entry Point for Google Apps Script & Google Sheets backend.
 * Provides unified routing, authentication, role-based access control (RBAC),
 * request parsing, input validation, error handling, audit logging, and JSON response formatting.
 *
 * Standard Access Levels:
 * 1. PUBLIC: Accessible by anyone (Customers, Storefront, Login, Health Check).
 * 2. AUTHENTICATED: Accessible by logged-in users (Role: ADMIN or OWNER).
 * 3. OWNER: Strictly restricted to Role: OWNER (Owners 1 & 2). Non-owners receive 403 Forbidden.
 */

const WebAppRouter = (function() {

  /**
   * Helper: Standard response formatter using GAS ContentService
   * @param {Object} payload
   * @param {number} [statusCode]
   * @return {GoogleAppsScript.Content.TextOutput}
   */
  function formatResponse(payload, statusCode) {
    if (statusCode && payload.statusCode === undefined) {
      payload.statusCode = statusCode;
    }
    const jsonOutput = JSON.stringify(payload);
    if (typeof ContentService !== 'undefined' && ContentService.createTextOutput) {
      const output = ContentService.createTextOutput(jsonOutput);
      if (ContentService.MimeType && ContentService.MimeType.JSON) {
        output.setMimeType(ContentService.MimeType.JSON);
      }
      return output;
    }
    // Fallback for mock/test environments
    return {
      getContent: function() { return jsonOutput; },
      getMimeType: function() { return "application/json"; },
      payload: payload
    };
  }

  /**
   * Helper: Parse request parameters and body
   * @param {string} method "GET" or "POST"
   * @param {Object} e Google Apps Script event object
   * @return {Object} { action, token, params, body, error }
   */
  function parseRequest(method, e) {
    e = e || {};
    const parameter = e.parameter || {};
    let body = {};
    let parseError = null;

    if (method === "POST" && e.postData && e.postData.contents) {
      try {
        if (typeof e.postData.contents === "string" && e.postData.contents.trim().length > 0) {
          body = JSON.parse(e.postData.contents);
        } else if (typeof e.postData.contents === "object") {
          body = e.postData.contents;
        }
      } catch (err) {
        parseError = "Format JSON tidak valid pada request body: " + err.message;
      }
    }

    // Resolve action from e.pathInfo, query parameter, or POST body
    let action = parameter.action || body.action || e.pathInfo || "";
    if (action.startsWith("/")) action = action.substring(1);
    if (action.startsWith("api/")) action = action.substring(4);
    if (action.endsWith("/")) action = action.substring(0, action.length - 1);

    // Extract authentication token: prioritize request body over URL parameter for security
    let token = null;
    let tokenLocation = "NONE";

    if (body && (body.token || body.auth_token)) {
      token = body.token || body.auth_token;
      tokenLocation = "BODY";
    } else if (parameter && (parameter.token || parameter.auth_token)) {
      token = parameter.token || parameter.auth_token;
      tokenLocation = "URL";
    }

    return {
      action: action.trim(),
      token: token ? String(token).trim() : null,
      tokenLocation: tokenLocation,
      params: parameter,
      body: body,
      error: parseError
    };
  }

  /**
   * Helper: Extract and verify POS variants with stock and consignment lots
   * @return {Object} { success, count, variants }
   */
  function getPOSVariantsInternal() {
    return DatabaseHelper.withLock(15000, function() {
      const allProds = DatabaseHelper.getAllRows("MASTER_PRODUK", function(p) {
        return p.is_active === true || p.is_active === "true" || p.is_active === 1 || p.is_active === undefined;
      });
      const allVars = DatabaseHelper.getAllRows("VARIAN_PRODUK", function(v) {
        return v.is_active === true || v.is_active === "true" || v.is_active === 1 || v.is_active === undefined;
      });
      const allStocks = DatabaseHelper.getAllRows("STOK");
      const allLots = DatabaseHelper.getAllRows("BATCH_KONSINYASI", function(l) {
        return (l.status === "ACTIVE" || !l.status) && Number(l.remaining_qty) > 0;
      });
      const allVendors = DatabaseHelper.getAllRows("VENDORS");

      const prodMap = {};
      allProds.forEach(function(p) { prodMap[p.product_id] = p; });

      const stockMap = {};
      allStocks.forEach(function(s) { stockMap[s.variant_id] = s; });

      const vendorMap = {};
      allVendors.forEach(function(v) { vendorMap[v.vendor_id] = v; });

      const posVariants = allVars.map(function(v) {
        const p = prodMap[v.product_id] || {};
        const stk = stockMap[v.variant_id] || {};

        const ownedPhys = Number(stk.owned_physical_stock) || 0;
        const ownedRes = Number(stk.owned_reserved_stock) || 0;
        const ownedAvail = Math.max(0, ownedPhys - ownedRes);

        const consPhys = Number(stk.consignment_physical_stock) || 0;
        const consRes = Number(stk.consignment_reserved_stock) || 0;
        const consAvail = Math.max(0, consPhys - consRes);

        const varLots = allLots.filter(function(l) {
          return String(l.variant_id) === String(v.variant_id);
        }).map(function(l) {
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

      return {
        success: true,
        count: posVariants.length,
        variants: posVariants
      };
    });
  }

  /**
   * Data Sanitizer: Redacts sensitive HPP, unit costs, and profit calculations for non-Owner users
   * @param {Object} data
   * @param {boolean} isOwner
   * @return {Object} Sanitized data
   */
  function sanitizeFinancialData(data, isOwner) {
    if (isOwner) return data;
    if (!data || typeof data !== 'object') return data;

    const copy = JSON.parse(JSON.stringify(data));
    const redactKeys = ['hpp', 'cogs', 'gross_profit', 'net_profit', 'total_cogs', 'profit', 'unit_cost', 'base_unit_cost', 'total_profit'];

    function sanitizeItem(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(function(item) { sanitizeItem(item); });
      } else {
        redactKeys.forEach(function(k) {
          if (k in obj) {
            delete obj[k];
          }
        });
        Object.keys(obj).forEach(function(k) {
          if (typeof obj[k] === 'object' && obj[k] !== null) {
            sanitizeItem(obj[k]);
          }
        });
      }
    }

    sanitizeItem(copy);
    return copy;
  }

  /**
   * Main Request Router
   * @param {string} method "GET" or "POST"
   * @param {Object} e Google Apps Script event object
   * @return {GoogleAppsScript.Content.TextOutput}
   */
  function handleRequest(method, e) {
    const req = parseRequest(method, e);

    if (req.error) {
      return formatResponse({
        success: false,
        statusCode: 400,
        error: req.error
      }, 400);
    }

    const action = req.action;
    const token = req.token;
    const params = req.params;
    const body = req.body;

    if (!action) {
      return formatResponse({
        success: false,
        statusCode: 400,
        error: "Parameter 'action' wajib disertakan dalam request."
      }, 400);
    }

    // -------------------------------------------------------------
    // ROUTE DEFINITIONS & ACCESS CONTROL
    // -------------------------------------------------------------

    // 1. PUBLIC ROUTES
    switch (action) {
      case "ping":
      case "health":
        return formatResponse({
          success: true,
          statusCode: 200,
          timestamp: new Date().toISOString(),
          message: "CrocsCircle.ID Web App Router is operational."
        }, 200);

      case "auth/login":
      case "login":
        try {
          const username = body.username || params.username;
          const password = body.password || params.password;
          if (!username || !password) {
            return formatResponse({
              success: false,
              statusCode: 400,
              error: "Username dan password wajib diisi."
            }, 400);
          }
          const loginRes = (typeof AdminController !== 'undefined' && AdminController.login)
            ? AdminController.login(username, password)
            : AuthService.login(username, password);
          return formatResponse(loginRes, loginRes.success ? 200 : 401);
        } catch (err) {
          return formatResponse({ success: false, statusCode: 400, error: err.message }, 400);
        }

      case "storefront/catalog":
      case "getCatalog":
        try {
          const catalogRes = StorefrontService.getCatalog(params);
          return formatResponse(catalogRes, catalogRes.success ? 200 : 400);
        } catch (err) {
          return formatResponse({ success: false, statusCode: 400, error: err.message }, 400);
        }

      case "storefront/product":
      case "getProductDetail":
        try {
          const prodId = params.id || params.product_id || body.id || body.product_id;
          if (!prodId) {
            return formatResponse({ success: false, statusCode: 400, error: "ID produk wajib disertakan." }, 400);
          }
          const prodRes = StorefrontService.getProductDetail(prodId);
          return formatResponse(prodRes, prodRes.success ? 200 : 404);
        } catch (err) {
          return formatResponse({ success: false, statusCode: 404, error: err.message }, 404);
        }

      case "storefront/validate-cart":
      case "validateCart":
        try {
          const items = body.items || (params.items ? JSON.parse(params.items) : []);
          const cartRes = StorefrontService.validateCart(items);
          return formatResponse(cartRes, cartRes.valid ? 200 : 400);
        } catch (err) {
          return formatResponse({ success: false, statusCode: 400, error: err.message }, 400);
        }

      case "storefront/checkout-whatsapp":
      case "generateWhatsAppOrder":
        try {
          const orderPayload = Object.keys(body).length > 0 ? body : params;
          const waRes = StorefrontService.generateWhatsAppOrder(orderPayload);
          return formatResponse(waRes, waRes.success ? 200 : 400);
        } catch (err) {
          return formatResponse({ success: false, statusCode: 400, error: err.message }, 400);
        }
    }

    // -------------------------------------------------------------
    // PROTECTED ROUTES (AUTHENTICATION REQUIRED)
    // -------------------------------------------------------------
    if (!token) {
      return formatResponse({
        success: false,
        statusCode: 401,
        error: "Akses ditolak: Token autentikasi tidak ditemukan. Harap login terlebih dahulu."
      }, 401);
    }

    const session = AuthService.validateSession(token);
    if (!session.valid) {
      return formatResponse({
        success: false,
        statusCode: 401,
        error: session.error || "Akses ditolak: Sesi tidak valid atau telah kedaluwarsa."
      }, 401);
    }

    const user = session.user;
    const isOwner = user.role === "OWNER";

    // 2. AUTHENTICATED ROUTES (Role: ADMIN or OWNER)
    try {
      switch (action) {
        case "auth/session":
        case "getSessionUser":
          return formatResponse({
            success: true,
            statusCode: 200,
            user: user
          }, 200);

        case "auth/logout":
        case "logout":
          const logoutRes = (typeof AdminController !== 'undefined' && AdminController.logout)
            ? AdminController.logout(token)
            : AuthService.logout(token);
          return formatResponse(logoutRes, 200);

        case "dashboard/data":
        case "getDashboardData":
          const month = params.month || body.month;
          const year = params.year || body.year;
          const dashRes = AdminController.getDashboardData(token, month, year);
          return formatResponse(dashRes, dashRes.success ? 200 : (dashRes.statusCode || 400));

        // Master Produk & Varian (Admin)
        case "products/list":
        case "getProducts":
          const prodListRes = AdminController.getProducts(token, params);
          return formatResponse(prodListRes, prodListRes.success ? 200 : (prodListRes.statusCode || 400));

        case "products/detail":
        case "getProductDetailAdmin":
          const adminProdId = params.id || params.product_id || body.id || body.product_id;
          const adminProdRes = AdminController.getProductDetail(token, adminProdId);
          return formatResponse(adminProdRes, adminProdRes.success ? 200 : (adminProdRes.statusCode || 400));

        case "products/save":
        case "saveProduct":
          const saveProdRes = AdminController.saveProduct(token, body);
          return formatResponse(saveProdRes, saveProdRes.success ? 200 : (saveProdRes.statusCode || 400));

        case "variants/save":
        case "saveVariant":
          const saveVarRes = AdminController.saveVariant(token, body);
          return formatResponse(saveVarRes, saveVarRes.success ? 200 : (saveVarRes.statusCode || 400));

        case "inventory/list":
        case "getInventory":
          const invRes = AdminController.getInventory(token, params);
          return formatResponse(invRes, invRes.success ? 200 : (invRes.statusCode || 400));

        case "stock/receive":
        case "receiveStock":
          const rcvRes = AdminController.receiveStock(token, body);
          return formatResponse(rcvRes, rcvRes.success ? 200 : (rcvRes.statusCode || 400));

        case "stock/movements":
        case "getStockMovements":
          const movRes = AdminController.getStockMovements(token, params);
          return formatResponse(movRes, movRes.success ? 200 : (movRes.statusCode || 400));

        case "metadata/master":
        case "getMasterMetadata":
          const metaRes = AdminController.getMasterMetadata(token);
          return formatResponse(metaRes, metaRes.success ? 200 : (metaRes.statusCode || 400));

        case "admin/cleanup-test-data":
        case "cleanupTestData":
          if (!isOwner) {
            return formatResponse({ success: false, statusCode: 403, error: "Akses ditolak: Hanya Owner yang berhak melakukan cleanup data pengujian." }, 403);
          }
          const isCleanDryRun = (body.dry_run === true || params.dry_run === "true");
          let cleanRes = { success: false, message: "Fungsi cleanup tidak ditemukan." };
          if (typeof cleanupPhase3E3TestData === 'function') {
            cleanRes = cleanupPhase3E3TestData(isCleanDryRun);
          } else {
            cleanRes = { success: false, message: "Modul cleanupPhase3E3TestData tidak ditemukan di lingkungan GAS." };
          }
          return formatResponse(cleanRes, cleanRes.success ? 200 : 400);

        case "admin/seed-real-data":
        case "seedRealData":
          if (!isOwner) {
            return formatResponse({ success: false, statusCode: 403, error: "Akses ditolak: Hanya Owner yang berhak melakukan import data valid." }, 403);
          }
          const isSeedDryRun = (body.dry_run === true || params.dry_run === "true");
          let seedRes = { success: false, message: "Fungsi seeder tidak ditemukan." };
          if (typeof seedRealCrocsCircleData === 'function') {
            seedRes = seedRealCrocsCircleData(isSeedDryRun);
          } else {
            seedRes = { success: false, message: "Modul SeedRealCrocsData belum diunggah ke Google Apps Script." };
          }
          return formatResponse(seedRes, seedRes.success ? 200 : 400);

        // Sales / Kasir POS
        case "sales/create":
        case "createSale":
          body.created_by = user.username;
          if (Array.isArray(body.items)) {
            body.items = body.items.map(function(it) {
              return {
                variant_id: it.variant_id,
                item_ownership: it.item_ownership || it.stock_type || "OWNED",
                vendor_id: it.vendor_id || it.vendorId,
                quantity: parseInt(it.quantity || it.qty || 1, 10),
                actual_price: it.actual_price !== undefined ? parseFloat(it.actual_price) : (it.unit_price !== undefined ? parseFloat(it.unit_price) : parseFloat(it.price || 0)),
                discount: parseFloat(it.discount || 0)
              };
            });
          }
          if (!body.sales_channel) body.sales_channel = "OFFLINE_EVENT";
          if (!body.sales_type) body.sales_type = "READY_STOCK";
          const saleCreateRes = SalesService.createSale(body);
          return formatResponse(saleCreateRes, saleCreateRes.success ? 200 : 400);

        case "sales/list":
        case "getSalesList":
          const salesListRes = SalesService.getSalesList(params, token);
          const sanitizedSales = sanitizeFinancialData(salesListRes, isOwner);
          return formatResponse(sanitizedSales, 200);

        case "sales/detail":
        case "getSaleById":
          const sId = params.id || params.sales_id || body.id || body.sales_id;
          const saleDetailRes = SalesService.getSaleById(sId);
          if (!saleDetailRes) {
            return formatResponse({ success: false, statusCode: 404, error: "Transaksi penjualan tidak ditemukan." }, 404);
          }
          const formattedSaleDetail = {
            success: true,
            sale: saleDetailRes.header,
            details: saleDetailRes.details
          };
          return formatResponse(sanitizeFinancialData(formattedSaleDetail, isOwner), 200);

        case "sales/return":
        case "returnSaleItem":
          const retRes = SalesService.returnSaleItem(
            body.sales_id,
            body.sales_detail_id || body.detail_id,
            body.quantity,
            body.reason,
            user.username,
            body.return_date,
            body.idempotency_key
          );
          return formatResponse(retRes, retRes.success ? 200 : 400);

        case "sales/parse-wa":
        case "parseWhatsAppOrderText":
          const parsedWa = StorefrontService.parseWhatsAppOrderText(body.raw_text || params.raw_text || "");
          return formatResponse(parsedWa, parsedWa.success ? 200 : 400);

        case "pos/variants":
        case "getPOSVariants":
          const posVariantsRes = getPOSVariantsInternal();
          return formatResponse(posVariantsRes, 200);

        // Pre-Order (PO) Module
        case "po/create":
        case "createPreOrder":
          body.created_by = user.username;
          const poCreateRes = POService.createPreOrder(body);
          return formatResponse(poCreateRes, poCreateRes.success ? 200 : 400);

        case "po/list":
        case "getPOList":
          const poListFilters = {
            payment_status: params.payment_status || body.payment_status,
            procurement_status: params.procurement_status || body.procurement_status,
            fulfillment_status: params.fulfillment_status || body.fulfillment_status,
            startDate: params.startDate || body.startDate,
            endDate: params.endDate || body.endDate,
            search: params.search || body.search
          };
          const poListRes = POService.getPOList(poListFilters, token);
          return formatResponse(sanitizeFinancialData(poListRes, isOwner), 200);

        case "po/detail":
        case "getPOById":
          const poId = params.id || params.po_id || body.id || body.po_id;
          const poDetailRes = POService.getPOById(poId);
          if (!poDetailRes) {
            return formatResponse({ success: false, statusCode: 404, error: "Pre-Order tidak ditemukan." }, 404);
          }
          return formatResponse(sanitizeFinancialData({ success: true, ...poDetailRes }, isOwner), 200);

        case "po/payment":
        case "recordPOPayment":
          body.created_by = user.username;
          const poPayRes = POService.recordPayment(body.po_id, body);
          return formatResponse(poPayRes, poPayRes.success ? 200 : 400);

        case "po/procurement":
        case "updatePOProcurement":
          const poProcRes = POService.updateProcurementStatus(body.po_id, body.status, user.username);
          return formatResponse(poProcRes, poProcRes.success ? 200 : 400);

        case "po/allocate":
        case "allocatePOStock":
          const poAllocRes = POService.allocateStockForPO(body.po_id, body.stock_category, user.username);
          return formatResponse(poAllocRes, poAllocRes.success ? 200 : 400);

        case "po/fulfill":
        case "fulfillPO":
          const poFulfillRes = POService.fulfillPO(body.po_id, body.stock_category, user.username);
          return formatResponse(poFulfillRes, poFulfillRes.success ? 200 : 400);

        case "po/cancel":
        case "cancelPO":
          const poCancelRes = POService.cancelPO(
            body.po_id,
            body.reason,
            body.refund_amount,
            body.payment_method,
            body.stock_category,
            user.username,
            body.idempotency_key
          );
          return formatResponse(poCancelRes, poCancelRes.success ? 200 : 400);

        // Purchases & Supplier Invoices
        case "purchases/create":
        case "createPurchaseInvoice":
          body.created_by = user.username;
          if (Array.isArray(body.items)) {
            body.items = body.items.map(function(it) {
              return {
                variant_id: it.variant_id,
                quantity: parseInt(it.quantity || it.qty || 1, 10),
                base_unit_cost: it.base_unit_cost !== undefined ? parseFloat(it.base_unit_cost) : (it.unit_cost !== undefined ? parseFloat(it.unit_cost) : parseFloat(it.cost || 0))
              };
            });
          }
          const purCreateRes = InventoryService.createPurchaseInvoice(body);
          return formatResponse(purCreateRes, purCreateRes.success ? 200 : 400);

        case "purchases/receive":
        case "receivePurchaseShipment":
          body.created_by = user.username;
          if (!body.received_items && body.items) {
            body.received_items = body.items;
          }
          if (!body.idempotency_key) {
            body.idempotency_key = "IDEMP-REC-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
          }
          const purRecRes = InventoryService.receivePurchaseShipment(body);
          return formatResponse(purRecRes, purRecRes.success ? 200 : 400);

        case "purchases/payment":
        case "updatePurchasePaymentStatus":
          const purPayStatRes = InventoryService.updatePurchasePaymentStatus(
            body.purchase_id,
            body.payment_status,
            body.notes,
            user.username
          );
          return formatResponse(purPayStatRes, purPayStatRes.success ? 200 : 400);

        case "purchases/payment-record":
        case "recordPurchasePayment":
          body.created_by = user.username;
          const purPayRecRes = InventoryService.recordPurchasePayment(body);
          return formatResponse(purPayRecRes, purPayRecRes.success ? 200 : 400);

        case "purchases/payments":
        case "getPurchasePayments":
          const purId = params.purchase_id || body.purchase_id || params.id || body.id;
          const purPaymentsRes = InventoryService.getPurchasePayments(purId);
          return formatResponse(purPaymentsRes, 200);

        case "purchases/list":
        case "getPurchasesList":
          const purFilters = {
            payment_status: params.payment_status || body.payment_status,
            receiving_status: params.receiving_status || body.receiving_status,
            vendor_id: params.vendor_id || body.vendor_id,
            date_from: params.date_from || body.date_from,
            date_to: params.date_to || body.date_to
          };
          Object.keys(purFilters).forEach(function(k) { if (!purFilters[k]) delete purFilters[k]; });
          const purListRes = InventoryService.getPurchasesList(purFilters);
          return formatResponse(purListRes, 200);

        // Operational Expenses
        case "expenses/create":
        case "recordOperationalExpense":
          body.created_by = user.username;
          const expCreateRes = FinancialService.recordOperationalExpense(body);
          return formatResponse(expCreateRes, expCreateRes.success ? 200 : 400);

        case "expenses/list":
        case "getExpensesList":
          const expFilters = {
            month: params.month || body.month,
            year: params.year || body.year,
            category: params.category || body.category,
            payment_method: params.payment_method || body.payment_method,
            date_from: params.date_from || body.date_from,
            date_to: params.date_to || body.date_to
          };
          Object.keys(expFilters).forEach(function(k) { if (!expFilters[k]) delete expFilters[k]; });
          const expListRes = FinancialService.getExpensesList(expFilters);
          return formatResponse(expListRes, 200);

        // ---------------------------------------------------------
        // 3. OWNER-ONLY ROUTES (Strict RBAC Guard)
        // ---------------------------------------------------------
        case "reports/income-statement":
        case "getIncomeStatement":
        case "reports/cash-flow":
        case "getCashFlow":
        case "reports/vendor-reconciliation":
        case "getVendorReconciliation":
        case "finance/opening-cash/record":
        case "recordOpeningCash":
        case "finance/opening-cash/get":
        case "getOpeningCash":
        case "closing/preview":
        case "getClosingPreview":
        case "closing/close-period":
        case "closePeriod":
        case "closing/reopen-period":
        case "reopenPeriod":
        case "closing/fund-balances":
        case "getFundBalances":
        case "closing/fund-withdrawal":
        case "recordFundWithdrawal":
        case "auth/create-admin":
        case "createAdminAccount":
          if (!isOwner) {
            return formatResponse({
              success: false,
              statusCode: 403,
              error: "Akses ditolak: Endpoint ini memerlukan wewenang Owner (Role OWNER)."
            }, 403);
          }

          // Execute Owner Actions
          if (action === "reports/income-statement" || action === "getIncomeStatement") {
            const now = new Date();
            const repMonth = parseInt(params.month || body.month || (now.getMonth() + 1), 10);
            const repYear = parseInt(params.year || body.year || now.getFullYear(), 10);
            const incRes = FinancialService.calculateMonthlyIncomeStatement(repMonth, repYear);
            return formatResponse({ success: true, report: incRes }, 200);
          }

          if (action === "reports/cash-flow" || action === "getCashFlow") {
            const now = new Date();
            const cfMonth = parseInt(params.month || body.month || (now.getMonth() + 1), 10);
            const cfYear = parseInt(params.year || body.year || now.getFullYear(), 10);
            const cfRes = FinancialService.getMonthlyCashFlowStatement(cfMonth, cfYear);
            return formatResponse({ success: true, report: cfRes }, 200);
          }

          if (action === "reports/vendor-reconciliation" || action === "getVendorReconciliation") {
            const vendorId = params.vendor_id || body.vendor_id;
            if (!vendorId) {
              const vendors = VendorService.getVendorList("ACTIVE");
              const summaries = vendors.map(function(v) {
                return VendorService.getVendorDashboardSummary(v.vendor_id);
              });
              return formatResponse({ success: true, count: summaries.length, vendors: summaries }, 200);
            }
            const vrRes = VendorService.getVendorDashboardSummary(vendorId);
            return formatResponse({ success: true, report: vrRes }, 200);
          }

          if (action === "finance/opening-cash/record" || action === "recordOpeningCash") {
            const opRecRes = FinancialService.recordOpeningCashBalance(body, token);
            return formatResponse(opRecRes, 200);
          }

          if (action === "finance/opening-cash/get" || action === "getOpeningCash") {
            const targetDate = params.date || body.date || '2026-10-01';
            const opGetRes = FinancialService.getOpeningCashBalance(targetDate);
            return formatResponse({ success: true, opening_balance: opGetRes }, 200);
          }

          if (action === "closing/preview" || action === "getClosingPreview") {
            const now = new Date();
            const clMonth = parseInt(params.month || body.month || (now.getMonth() + 1), 10);
            const clYear = parseInt(params.year || body.year || now.getFullYear(), 10);
            const clPrevRes = ClosingService.previewMonthlyReport(clMonth, clYear);
            return formatResponse({ success: true, preview: clPrevRes }, 200);
          }

          if (action === "closing/close-period" || action === "closePeriod") {
            const clRes = ClosingService.closePeriod(
              body.month,
              body.year,
              token,
              body.notes,
              body.custom_percentages
            );
            return formatResponse(clRes, 200);
          }

          if (action === "closing/reopen-period" || action === "reopenPeriod") {
            const roRes = ClosingService.reopenPeriod(
              body.period_id,
              token,
              body.reason
            );
            return formatResponse(roRes, 200);
          }

          if (action === "closing/fund-balances" || action === "getFundBalances") {
            const fundBalancesRes = ClosingService.getFundBalances();
            return formatResponse({ success: true, fund_balances: fundBalancesRes }, 200);
          }

          if (action === "closing/fund-withdrawal" || action === "recordFundWithdrawal") {
            const fundWdRes = ClosingService.recordFundWithdrawal(
              body.fund_type,
              body.amount,
              token,
              body.notes
            );
            return formatResponse(fundWdRes, 200);
          }

          if (action === "auth/create-admin" || action === "createAdminAccount") {
            const caRes = AuthService.createAdminAccount(
              token,
              body.username,
              body.full_name,
              body.password
            );
            return formatResponse(caRes, caRes.success ? 200 : 400);
          }

          break;

        // Default: Unknown protected action
        default:
          return formatResponse({
            success: false,
            statusCode: 404,
            error: "Aksi tidak dikenali atau endpoint tidak ditemukan: " + action
          }, 404);
      }
    } catch (err) {
      return formatResponse({
        success: false,
        statusCode: 400,
        error: err.message || String(err)
      }, 400);
    }

    // Default 404 if no case matched
    return formatResponse({
      success: false,
      statusCode: 404,
      error: "Aksi tidak dikenali atau endpoint tidak ditemukan: " + action
    }, 404);
  }

  return {
    handleRequest: handleRequest,
    formatResponse: formatResponse,
    parseRequest: parseRequest,
    sanitizeFinancialData: sanitizeFinancialData,
    getPOSVariantsInternal: getPOSVariantsInternal
  };

})();

/**
 * Global Web App Entry Point: HTTP GET
 * @param {Object} e Google Apps Script event object
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  return WebAppRouter.handleRequest("GET", e);
}

/**
 * Global Web App Entry Point: HTTP POST
 * @param {Object} e Google Apps Script event object
 * @return {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  return WebAppRouter.handleRequest("POST", e);
}
