/**
 * CROCSCIRCLE.ID — ADMIN CONTROLLER & DASHBOARD API BRIDGE
 * Version: 1.2.0 (Phase 3A)
 * 
 * Modul Pengontrol Autentikasi Admin, Session Management, dan Data Dashboard:
 * 1. Endpoint Autentikasi: Login, Session Verification, Logout.
 * 2. Role-Based Access Control (RBAC):
 *    - Role OWNER (Owner 1 & Owner 2): Akses penuh ke seluruh data finansial, omzet, HPP,
 *      laba kotor, laba bersih, beban operasional, restricted cash, dan pembagian laba.
 *    - Role ADMIN: Akses terbatas hanya pada data operasional (stok tersedia, PO aktif,
 *      daftar transaksi terbaru, peringatan stok menipis). Data keuangan sensitif (HPP,
 *      Laba Bersih, Alokasi Laba) disembunyikan/dibatasi secara ketat di sisi server.
 * 3. Tidak ada data dummy: Jika belum ada transaksi/stok, mengembalikan empty state yang bersih.
 */

var AdminController = (function() {

  /**
   * Endpoint Login Admin
   * 
   * @param {string} username
   * @param {string} password
   * @return {Object} { success, token, user, error }
   */
  function login(username, password) {
    if (!username || !password) {
      return { success: false, error: "Username dan password wajib diisi." };
    }
    return AuthService.login(username, password);
  }

  /**
   * Endpoint Verifikasi Sesi Aktif
   * 
   * @param {string} token
   * @return {Object} { success, valid, user, error }
   */
  function getSessionUser(token) {
    const session = AuthService.validateSession(token);
    if (!session.valid) {
      return { success: false, error: session.error };
    }
    return {
      success: true,
      user: session.user
    };
  }

  /**
   * Endpoint Logout
   * 
   * @param {string} token
   * @return {Object} { success, message }
   */
  function logout(token) {
    return AuthService.logout(token);
  }

  /**
   * Endpoint Data Dashboard Admin
   * Memvalidasi token, memeriksa role, dan menyajikan metrik dashboard sesuai RBAC.
   * 
   * @param {string} token
   * @param {number|string} [targetMonth] (1 - 12)
   * @param {number|string} [targetYear]
   * @return {Object} Data dashboard terstruktur
   */
  function getDashboardData(token, targetMonth, targetYear) {
    // 1. Verifikasi Session Token di Server
    const session = AuthService.validateSession(token);
    if (!session.valid) {
      return {
        success: false,
        statusCode: 401,
        error: session.error || "Akses ditolak. Sesi tidak valid atau telah kedaluwarsa."
      };
    }

    const user = session.user;
    const isOwner = user.role === "OWNER";

    const now = new Date();
    const month = targetMonth ? parseInt(targetMonth, 10) : (now.getMonth() + 1);
    const year = targetYear ? parseInt(targetYear, 10) : now.getFullYear();

    return DatabaseHelper.withLock(30000, function() {
      // 2. Data Operasional: Stok Produk
      const allStocks = DatabaseHelper.getAllRows("STOK");
      const allVariants = DatabaseHelper.getAllRows("VARIAN_PRODUK");
      const allProducts = DatabaseHelper.getAllRows("MASTER_PRODUK");

      let totalPhysicalStock = 0;
      let totalAvailableStock = 0;
      let totalReservedStock = 0;
      const lowStockAlerts = [];

      allStocks.forEach(stk => {
        const physical = (Number(stk.owned_physical_stock) || 0) + (Number(stk.consignment_physical_stock) || 0);
        const reserved = (Number(stk.owned_reserved_stock) || 0) + (Number(stk.consignment_reserved_stock) || 0);
        const available = (Number(stk.total_available_stock) || (physical - reserved));
        const minStock = Number(stk.minimum_stock) || 2;

        totalPhysicalStock += physical;
        totalReservedStock += reserved;
        totalAvailableStock += available;

        // Cek peringatan stok menipis
        if (available <= minStock) {
          const variant = allVariants.find(v => v.variant_id === stk.variant_id) || {};
          const product = allProducts.find(p => p.product_id === variant.product_id) || {};
          lowStockAlerts.push({
            variant_id: stk.variant_id,
            product_name: product.product_name || "Produk",
            color: variant.color || "-",
            size: variant.size || "-",
            sku: variant.sku || stk.variant_id,
            available_stock: available,
            minimum_stock: minStock
          });
        }
      });

      // 3. Data Operasional: Pre-Order Aktif
      const allPOs = DatabaseHelper.getAllRows("PRE_ORDER");
      const activePOs = [];
      allPOs.forEach(po => {
        // PO aktif = belum lunas ATAU belum diserahkan
        if (po.payment_status !== "PAID" || po.fulfillment_status !== "DELIVERED") {
          if (po.fulfillment_status !== "CANCELLED") {
            const variant = allVariants.find(v => v.variant_id === po.variant_id) || {};
            const product = allProducts.find(p => p.product_id === variant.product_id) || {};
            activePOs.push({
              po_id: po.po_id,
              order_date: po.order_date,
              customer_name: po.customer_name,
              product_name: (product.product_name || "Produk") + " (" + (variant.size || "-") + ")",
              quantity: po.quantity,
              total_order: Number(po.total_order) || 0,
              payment_status: po.payment_status,
              fulfillment_status: po.fulfillment_status,
              estimated_arrival: po.estimated_arrival || "-"
            });
          }
        }
      });

      // 4. Data Operasional: Transaksi Penjualan Terbaru (10 Terakhir)
      const allSales = DatabaseHelper.getAllRows("PENJUALAN");
      // Urutkan transaksi terbaru
      allSales.sort((a, b) => new Date(b.created_at || b.transaction_date).getTime() - new Date(a.created_at || a.transaction_date).getTime());
      
      const recentSales = allSales.slice(0, 10).map(s => {
        const item = {
          sales_id: s.sales_id,
          transaction_date: s.transaction_date,
          customer_name: s.customer_name,
          sales_channel: s.sales_channel,
          payment_method: s.payment_method,
          payment_status: s.payment_status,
          gross_customer_payment: Number(s.gross_customer_payment) || 0
        };

        // HANYA sertakan HPP & Laba Kotor jika user adalah OWNER
        if (isOwner) {
          item.total_hpp = Number(s.total_hpp) || 0;
          item.gross_profit = Number(s.gross_profit) || 0;
        }

        return item;
      });

      // 5. Data Keuangan Sensitif (Hanya untuk Role OWNER)
      let financialData = null;
      if (isOwner) {
        try {
          const incomeStatement = FinancialService.calculateMonthlyIncomeStatement(month, year);
          const profitDist = ClosingService.simulateProfitDistribution(incomeStatement.net_profit);

          // Hitung kewajiban vendor belum disetor (Restricted Cash)
          const allConsignmentDetails = DatabaseHelper.getAllRows("DETAIL_PENJUALAN", d => d.item_ownership === "CONSIGNMENT");
          const totalVendorPayablesOutstanding = allConsignmentDetails.reduce((sum, d) => sum + (Number(d.vendor_remaining_payable) || 0), 0);

          // Cek status periode
          const periodId = incomeStatement.period.period_id;
          const periodRow = DatabaseHelper.getRowByPk("PERIODE_KEUANGAN", "period_id", periodId);

          financialData = {
            period_id: periodId,
            month: month,
            year: year,
            period_status: periodRow ? periodRow.period_status : "OPEN",
            total_omzet: incomeStatement.revenue_breakdown.total_omzet,
            owned_sales_amount: incomeStatement.revenue_breakdown.net_owned_sales,
            po_recognized_omzet: incomeStatement.revenue_breakdown.po_recognized_omzet,
            vendor_incentive_amount: incomeStatement.revenue_breakdown.net_vendor_incentive,
            total_hpp: incomeStatement.hpp_breakdown.total_hpp,
            gross_profit: incomeStatement.gross_profit,
            operational_expenses: incomeStatement.expenses_breakdown.operational_expenses,
            net_profit: incomeStatement.net_profit,
            vendor_payables_outstanding: totalVendorPayablesOutstanding,
            profit_distribution: profitDist.allocations
          };
        } catch (e) {
          financialData = {
            error: "Gagal menghitung data keuangan: " + e.message
          };
        }
      }

      return {
        success: true,
        user: {
          user_id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        },
        is_financial_restricted: !isOwner,
        operational: {
          total_available_stock: totalAvailableStock,
          total_physical_stock: totalPhysicalStock,
          total_reserved_stock: totalReservedStock,
          active_po_count: activePOs.length,
          low_stock_count: lowStockAlerts.length,
          low_stock_alerts: lowStockAlerts,
          active_pos: activePOs,
          recent_sales: recentSales
        },
        financial: financialData
      };
    });
  }

  // =========================================================================
  // ENDPOINTS PHASE 3B: PRODUCT & INVENTORY MANAGEMENT
  // =========================================================================

  /**
   * Endpoint Mengambil Daftar Produk
   */
  function getProducts(token, filters) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      const list = ProductService.listProducts(filters);
      return { success: true, products: list };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Mengambil Detail Satu Produk
   */
  function getProductDetail(token, productId) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      const data = ProductService.getProductDetail(productId);
      return { success: true, data: data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Simpan / Update Produk
   */
  function saveProduct(token, productData) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      if (productData.product_id) {
        const existing = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", productData.product_id);
        if (existing) {
          return ProductService.updateProduct(productData.product_id, productData, session.user.username);
        }
      }
      return ProductService.createProduct(productData, session.user.username);
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Simpan / Update Varian Produk
   */
  function saveVariant(token, variantData) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      if (variantData.variant_id) {
        const existing = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", variantData.variant_id);
        if (existing) {
          return ProductService.updateVariant(variantData.variant_id, variantData, session.user.username);
        }
      }
      return ProductService.createVariant(variantData, session.user.username);
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Inventaris & Batch Tracking (Dengan Masking RBAC untuk Admin)
   */
  function getInventory(token, filters) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      const list = ProductService.listInventory(filters, session.user.role);
      return {
        success: true,
        is_financial_restricted: session.user.role !== "OWNER",
        inventory: list
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Penerimaan Stok (Stock In: OWN_STOCK atau VENDOR_CONSIGNMENT)
   */
  function receiveStock(token, stockData) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      if (!stockData || !stockData.ownership_type) {
        throw new Error("Tipe kepemilikan stok (OWN_STOCK atau VENDOR_CONSIGNMENT) wajib ditentukan.");
      }

      if (stockData.ownership_type === "VENDOR_CONSIGNMENT") {
        return ProductService.receiveConsignment(
          stockData.vendor_id,
          stockData.variant_id,
          stockData.quantity,
          stockData.notes,
          session.user.username
        );
      } else {
        // OWN_STOCK: Dukungan Pembelian Lengkap atau Sebagian
        if (stockData.is_partial) {
          const existingPo = stockData.purchase_id ? DatabaseHelper.getRowByPk("PEMBELIAN_STOK", "purchase_id", stockData.purchase_id) : null;
          if (!existingPo) {
            // Buat header PO baru dengan status PARTIAL_RECEIVED
            const poHeader = Object.assign({}, stockData.purchase_header || {}, {
              purchase_id: stockData.purchase_id || undefined,
              receiving_status: "ORDERED",
              notes: stockData.notes || ""
            });
            const created = ProductService.createPurchaseOrder(poHeader, stockData.items, session.user.username);
            // Terima kuantitas tahap pertama
            const partialRes = ProductService.receivePartialPurchase(created.purchase_id, stockData.items, stockData.notes, session.user.username);
            return {
              success: true,
              purchase_id: created.purchase_id,
              receiving_status: "PARTIAL_RECEIVED",
              received_items: partialRes.received_items
            };
          } else {
            return ProductService.receivePartialPurchase(
              stockData.purchase_id,
              stockData.items,
              stockData.notes,
              session.user.username
            );
          }
        } else {
          return ProductService.createPurchaseOrder(
            stockData.purchase_header || {},
            stockData.items || [{
              variant_id: stockData.variant_id,
              quantity: stockData.quantity,
              base_unit_cost: stockData.base_unit_cost || 0,
              vendor_incentive: stockData.vendor_incentive || 0
            }],
            session.user.username
          );
        }
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Riwayat Mutasi Stok (Audit Trail)
   */
  function getStockMovements(token, filters) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      const movements = ProductService.getStockMovements(filters);
      return { success: true, movements: movements };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Endpoint Metadata Master Kategori & Vendor Aktif
   */
  function getMasterMetadata(token) {
    const session = AuthService.validateSession(token);
    if (!session.valid) return { success: false, statusCode: 401, error: session.error };

    try {
      return {
        success: true,
        categories: ProductService.getCategories(),
        vendors: ProductService.getVendors()
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  return {
    login: login,
    getSessionUser: getSessionUser,
    logout: logout,
    getDashboardData: getDashboardData,
    // Phase 3B Methods
    getProducts: getProducts,
    getProductDetail: getProductDetail,
    saveProduct: saveProduct,
    saveVariant: saveVariant,
    getInventory: getInventory,
    receiveStock: receiveStock,
    getStockMovements: getStockMovements,
    getMasterMetadata: getMasterMetadata
  };

})();
