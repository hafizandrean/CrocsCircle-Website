/**
 * CROCSCIRCLE.ID — IDEMPOTENT DATABASE INITIALIZATION
 * Version: 1.2.0 (Production Schema: 21 Tables)
 * 
 * Script ini dirancang agar 100% IDEMPOTENT:
 * 1. Tidak pernah menghapus data (TIDAK menggunakan sheet.clear()).
 * 2. Memeriksa keberadaan setiap sheet dari 21 tabel CROCS_SCHEMA.
 * 3. Memverifikasi header baris 1; jika ada kolom baru pada skema, ditambahkan di kanan tanpa merusak data lama.
 * 4. Mengisi data default KATEGORI, PENGATURAN, dan VENDORS hanya jika tabel tersebut masih kosong.
 * 5. TIDAK MENANAM password default di kode sumber. Menyediakan fungsi `setupOwnerAccount` yang aman.
 */

const CROCS_SCHEMA_V120 = [
  {
    name: "MASTER_PRODUK",
    headers: [
      "product_id", "product_name", "category_id", "model",
      "description", "image_url", "sales_type", "is_active",
      "is_published", "created_at", "updated_at"
    ]
  },
  {
    name: "VARIAN_PRODUK",
    headers: [
      "variant_id", "product_id", "color", "size", "sku",
      "unit", "catalog_price", "reference_hpp", "is_active"
    ]
  },
  {
    name: "VENDORS",
    headers: [
      "vendor_id", "vendor_name", "contact_person", "phone", "address",
      "cooperation_type", "consignment_fee_type", "default_consignment_fee",
      "purchase_incentive_default", "fixed_vendor_share",
      "min_selling_price", "status", "notes", "created_at", "updated_at"
    ]
  },
  {
    name: "STOK",
    headers: [
      "variant_id", "owned_physical_stock", "owned_reserved_stock",
      "owned_available_stock", "consignment_physical_stock",
      "consignment_reserved_stock", "consignment_available_stock",
      "total_available_stock", "minimum_stock", "updated_at"
    ]
  },
  {
    name: "MUTASI_STOK",
    headers: [
      "movement_id", "movement_date", "variant_id", "stock_category",
      "movement_type", "quantity", "reference_type", "reference_id",
      "notes", "created_by", "created_at"
    ]
  },
  {
    name: "PENJUALAN",
    headers: [
      "sales_id", "transaction_date", "sales_channel", "sales_type",
      "customer_name", "payment_method", "payment_status",
      "gross_customer_payment", "owned_sales_amount", "vendor_incentive_amount",
      "net_operational_revenue", "total_hpp", "gross_profit",
      "idempotency_key", "notes", "created_by", "created_at"
    ]
  },
  {
    name: "DETAIL_PENJUALAN",
    headers: [
      "sales_detail_id", "sales_id", "variant_id", "item_ownership",
      "vendor_id", "batch_id", "quantity", "selling_price",
      "hpp_unit", "vendor_payable_unit", "crocs_incentive_unit",
      "subtotal", "total_hpp", "total_vendor_payable",
      "total_crocs_incentive", "vendor_paid_amount",
      "vendor_remaining_payable", "settlement_status"
    ]
  },
  {
    name: "RETUR_PENJUALAN",
    headers: [
      "return_id", "return_date", "sales_id", "sales_detail_id",
      "variant_id", "item_ownership", "vendor_id", "batch_id", "reference_id",
      "quantity", "refund_amount", "hpp_reversal",
      "crocs_incentive_reversal", "vendor_payable_reversal",
      "reason", "created_by", "created_at"
    ]
  },
  {
    name: "SETTLEMENT_VENDOR",
    headers: [
      "settlement_id", "settlement_date", "vendor_id", "total_gross_payable",
      "total_claims_deducted", "total_net_payout", "payment_method",
      "bank_reference", "receipt_url", "notes", "created_by", "created_at"
    ]
  },
  {
    name: "DETAIL_SETTLEMENT_VENDOR",
    headers: [
      "settlement_detail_id", "settlement_id", "allocation_type",
      "sales_detail_id", "claim_id", "amount_allocated", "notes"
    ]
  },
  {
    name: "KLAIM_VENDOR",
    headers: [
      "claim_id", "claim_date", "vendor_id", "source_sales_detail_id",
      "source_sales_id", "claim_amount", "compensated_amount",
      "remaining_claim", "claim_status", "notes", "created_by", "created_at"
    ]
  },
  {
    name: "PRE_ORDER",
    headers: [
      "po_id", "order_date", "customer_name", "customer_contact",
      "variant_id", "quantity", "selling_price", "total_order",
      "supplier", "estimated_arrival", "payment_status",
      "procurement_status", "fulfillment_status", "settlement_date",
      "allocated_hpp", "hpp_status", "notes", "created_by"
    ]
  },
  {
    name: "PEMBAYARAN_PO",
    headers: [
      "payment_id", "po_id", "payment_date", "amount",
      "payment_method", "notes", "created_by"
    ]
  },
  {
    name: "PEMBELIAN_STOK",
    headers: [
      "purchase_id", "purchase_date", "vendor_id", "supplier_name",
      "subtotal", "shipping_cost", "total_purchase", "payment_status",
      "receiving_status", "notes", "created_by"
    ]
  },
  {
    name: "DETAIL_PEMBELIAN",
    headers: [
      "purchase_detail_id", "purchase_id", "variant_id", "quantity",
      "remaining_qty", "base_unit_cost", "vendor_incentive", "shipping_cost_allocation", "unit_cost", "subtotal"
    ]
  },
  {
    name: "PEMBAYARAN_PEMBELIAN",
    headers: [
      "payment_id", "purchase_id", "payment_date", "amount",
      "payment_method", "idempotency_key", "notes", "created_by", "created_at"
    ]
  },
  {
    name: "PENGELUARAN",
    headers: [
      "expense_id", "expense_date", "category", "activity",
      "description", "amount", "payment_method", "paid_by",
      "receipt_url", "notes", "created_by"
    ]
  },
  {
    name: "PEMBAGIAN_KEUNTUNGAN",
    headers: [
      "allocation_id", "period_id", "net_profit",
      "owner1_percentage", "owner1_amount",
      "owner2_percentage", "owner2_amount",
      "emergency_percentage", "emergency_amount",
      "retained_percentage", "retained_amount",
      "allocation_date", "status"
    ]
  },
  {
    name: "PERIODE_KEUANGAN",
    headers: [
      "period_id", "month", "year", "period_status",
      "closing_date", "closed_by", "closing_version",
      "total_omzet", "total_hpp", "gross_profit",
      "operational_expenses", "net_profit", "ending_cash_balance",
      "reopen_reason", "reopened_by", "reopened_at", "notes"
    ]
  },
  {
    name: "CLOSING_BULANAN",
    headers: [
      "closing_id", "period_id", "closing_version", "closing_date", "closed_by",
      "total_omzet", "total_hpp", "gross_profit", "operational_expenses", "net_profit",
      "owner1_amount", "owner2_amount", "emergency_amount", "retained_amount",
      "notes", "created_at"
    ]
  },
  {
    name: "SALDO_DANA",
    headers: [
      "fund_transaction_id", "fund_type", "transaction_date",
      "period_id", "transaction_type", "amount", "reference_id",
      "notes", "created_by"
    ]
  },
  {
    name: "USERS",
    headers: [
      "user_id", "username", "password_hash", "role",
      "full_name", "is_active", "failed_attempts", "locked_until",
      "session_token", "session_expires_at", "last_login_at",
      "created_at", "updated_at"
    ]
  },
  {
    name: "PENGATURAN",
    headers: [
      "setting_key", "setting_value", "description",
      "updated_by", "updated_at"
    ]
  },
  {
    name: "KATEGORI",
    headers: [
      "category_id", "category_name", "description", "is_active"
    ]
  },
  {
    name: "LOG_AKTIVITAS",
    headers: [
      "log_id", "user_id", "action", "module",
      "reference_id", "description", "timestamp"
    ]
  },
  {
    name: "BATCH_KONSINYASI",
    headers: [
      "consignment_lot_id", "vendor_id", "variant_id",
      "received_qty", "remaining_qty", "received_date",
      "reference_id", "created_by", "status"
    ]
  }
];

/**
 * Fungsi utama inisialisasi / sinkronisasi database 21 tabel
 */
function initializeCrocsCircleDatabase() {
  Logger.log("=== Memulai Inisialisasi Idempotent Database CrocsCircle.ID ===");
  const report = [];

  // 1. Pastikan seluruh 21 tabel ada dan headernya konsisten
  CROCS_SCHEMA_V120.forEach(table => {
    const res = DatabaseHelper.ensureTable(table.name, table.headers);
    report.push(res);
  });

  // 2. Isi default KATEGORI jika masih kosong
  seedDefaultCategories();

  // 3. Isi default VENDORS (Dzaki) jika masih kosong
  seedDefaultVendors();

  // 4. Isi default PENGATURAN jika masih kosong
  seedDefaultSettings();

  // 5. Isi default PERIODE_KEUANGAN jika masih kosong
  seedDefaultPeriods();

  // 6. Log aktivitas inisialisasi
  DatabaseHelper.logActivity("SYSTEM", "INITIALIZE_DATABASE", "DATABASE", "V1.2.0", "Inisialisasi/verifikasi database 21 tabel berhasil dijalankan.");

  Logger.log("=== Inisialisasi Database Selesai ===");
  return {
    success: true,
    schemaVersion: "1.2.0",
    totalTables: report.length,
    details: report
  };
}

/**
 * Mengisi default kategori jika tabel KATEGORI masih kosong
 */
function seedDefaultCategories() {
  const existing = DatabaseHelper.getAllRows("KATEGORI");
  if (existing.length === 0) {
    const defaultCategories = [
      { category_id: "CAT-CLOG", category_name: "Classic Clog", description: "Koleksi Crocs Classic reguler berbagai warna", is_active: true },
      { category_id: "CAT-COLLAB", category_name: "Collaboration", description: "Koleksi Crocs edisi kolaborasi spesial", is_active: true },
      { category_id: "CAT-PLATFORM", category_name: "Platform Clog", description: "Koleksi Crocs bersol tinggi / platform", is_active: true },
      { category_id: "CAT-GEO", category_name: "Geometric Clog", description: "Koleksi Crocs Geo Series", is_active: true },
      { category_id: "CAT-ACC", category_name: "Jibbitz & Aksesori", description: "Aksesori hiasan Crocs (Gbits/Jibbitz)", is_active: true }
    ];
    defaultCategories.forEach(c => DatabaseHelper.insertRow("KATEGORI", c));
    Logger.log("Kategori default berhasil diisikan.");
  }
}

/**
 * Mengisi default vendor (Dzaki) jika tabel VENDORS masih kosong
 */
function seedDefaultVendors() {
  const existing = DatabaseHelper.getAllRows("VENDORS");
  if (existing.length === 0) {
    const now = new Date();
    DatabaseHelper.insertRow("VENDORS", {
      vendor_id: "VND-DZAKI",
      vendor_name: "Dzaki (Jaki)",
      contact_person: "Dzaki",
      phone: "-",
      address: "-",
      cooperation_type: "BOTH", // SELLER_FOR_VENDOR & BUY_STOCK_FROM_VENDOR
      consignment_fee_type: "FIXED_PER_UNIT",
      default_consignment_fee: 10000,
      purchase_incentive_default: 10000,
      fixed_vendor_share: 270000,
      min_selling_price: 280000,
      status: "ACTIVE",
      notes: "Partner konsinyasi & supplier stok CrocsCircle. Hak Dzaki Rp270k/unit, Insentif jual Rp10k/unit, Floor jual Rp280k/unit, Insentif beli Rp10k/unit.",
      created_at: now,
      updated_at: now
    });
    Logger.log("Vendor Dzaki berhasil diisikan.");
  }
}

/**
 * Mengisi default pengaturan bisnis jika tabel PENGATURAN masih kosong
 */
function seedDefaultSettings() {
  const existing = DatabaseHelper.getAllRows("PENGATURAN");
  if (existing.length === 0) {
    const now = new Date();
    const defaults = [
      { setting_key: "SCHEMA_VERSION", setting_value: "1.2.0", description: "Versi skema database aktif", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "STORE_NAME", setting_value: "CrocsCircle.ID", description: "Nama Brand Toko", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "WHATSAPP_NUMBER", setting_value: "6281234567890", description: "Nomor WhatsApp Pemesanan Customer", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "OWNER1_NAME", setting_value: "Hafiz", description: "Nama Owner 1", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "OWNER1_PERCENTAGE", setting_value: "20", description: "Persentase Alokasi Laba Bersih Owner 1 (%)", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "OWNER2_NAME", setting_value: "Harits", description: "Nama Owner 2", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "OWNER2_PERCENTAGE", setting_value: "20", description: "Persentase Alokasi Laba Bersih Owner 2 (%)", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "EMERGENCY_PERCENTAGE", setting_value: "10", description: "Persentase Alokasi Laba Bersih Dana Darurat (%)", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "RETAINED_PERCENTAGE", setting_value: "50", description: "Persentase Alokasi Laba Bersih Keuntungan Ditahan (%)", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "HPP_VALUATION_METHOD", setting_value: "FIFO", description: "Metode Penentuan HPP Multi-Batch (FIFO)", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "MINIMUM_STOCK_ALERT", setting_value: "2", description: "Ambang batas stok minimum untuk peringatan", updated_by: "SYSTEM", updated_at: now },
      { setting_key: "CURRENCY_SYMBOL", setting_value: "Rp", description: "Simbol Mata Uang", updated_by: "SYSTEM", updated_at: now }
    ];
    defaults.forEach(s => DatabaseHelper.insertRow("PENGATURAN", s));
    Logger.log("Pengaturan default berhasil diisikan.");
  }
}

/**
 * Mengisi default periode jika tabel PERIODE_KEUANGAN masih kosong
 */
function seedDefaultPeriods() {
  const existing = DatabaseHelper.getAllRows("PERIODE_KEUANGAN");
  if (existing.length === 0) {
    const defaults = [
      {
        period_id: "PER-2026-10",
        month: 10,
        year: 2026,
        period_status: "CLOSED",
        closing_date: new Date("2026-10-31T23:59:59"),
        closed_by: "SYSTEM",
        closing_version: 1,
        notes: "Tutup buku bulan Oktober 2026"
      },
      {
        period_id: "PER-2026-11",
        month: 11,
        year: 2026,
        period_status: "OPEN",
        closing_date: "",
        closed_by: "",
        closing_version: 1,
        notes: "Periode aktif bulan berjalan November 2026"
      }
    ];
    defaults.forEach(p => DatabaseHelper.insertRow("PERIODE_KEUANGAN", p));
    Logger.log("Periode awal (Oktober & November) berhasil diisikan.");
  }
}

/**
 * CROCSCIRCLE.ID — RESET KE NOL (OPTION B)
 * Menghapus seluruh baris transaksi dan produk latihan dari spreadsheet,
 * mengembalikan seluruh sheet ke baris header bersih.
 * 
 * Yang direset:
 * - MASTER_PRODUK & VARIAN_PRODUK
 * - STOK & MUTASI_STOK
 * - PENJUALAN, DETAIL_PENJUALAN, RETUR_PENJUALAN
 * - PEMBELIAN_STOK & DETAIL_PEMBELIAN
 * - PENGELUARAN
 * - BATCH_KONSINYASI & TITIP_JUAL
 * - PRE_ORDER & PEMBAYARAN_PO
 * - SETTLEMENT_VENDOR & DETAIL_SETTLEMENT_VENDOR
 * - PEMBAGIAN_KEUNTUNGAN, CLOSING_BULANAN, SALDO_DANA
 * 
 * Yang dipertahankan:
 * - Header baris 1 setiap tabel
 * - USERS (akun hafiz, harits, admin1)
 * - PENGATURAN (pengaturan toko & persentase bagi hasil)
 * - KATEGORI (kategori produk dasar)
 * - VENDORS (partner konsinyasi default)
 */
function resetDatabaseToZero() {
  Logger.log("=== MEMULAI RESET DATABASE CROCSCIRCLE KE NOL (CLEAN SLATE) ===");
  const tablesToClear = [
    "PENJUALAN",
    "DETAIL_PENJUALAN",
    "RETUR_PENJUALAN",
    "PENGELUARAN",
    "PEMBELIAN_STOK",
    "DETAIL_PEMBELIAN",
    "PENERIMAAN_BARANG",
    "STOK",
    "MUTASI_STOK",
    "BATCH_KONSINYASI",
    "TITIP_JUAL",
    "SETTLEMENT_VENDOR",
    "DETAIL_SETTLEMENT_VENDOR",
    "PRE_ORDER",
    "PEMBAYARAN_PO",
    "PEMBAGIAN_KEUNTUNGAN",
    "CLOSING_BULANAN",
    "SALDO_DANA",
    "MASTER_PRODUK",
    "VARIAN_PRODUK"
  ];

  const ss = (typeof SpreadsheetApp !== 'undefined') ? SpreadsheetApp.getActiveSpreadsheet() : DatabaseHelper.getSpreadsheet();
  tablesToClear.forEach(tableName => {
    const sheet = ss.getSheetByName(tableName);
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        if (typeof sheet.deleteRows === 'function') {
          sheet.deleteRows(2, lastRow - 1);
        } else {
          for (let r = lastRow; r >= 2; r--) {
            sheet.deleteRow(r);
          }
        }
        Logger.log("Sheet " + tableName + ": " + (lastRow - 1) + " baris data berhasil dibersihkan.");
      } else {
        Logger.log("Sheet " + tableName + " sudah kosong.");
      }
    }
  });

  // Pastikan periode aktif November 2026 berstatus OPEN
  const periodSheet = ss.getSheetByName("PERIODE_KEUANGAN");
  if (periodSheet) {
    const lastRow = periodSheet.getLastRow();
    if (lastRow > 1) {
      if (typeof periodSheet.deleteRows === 'function') {
        periodSheet.deleteRows(2, lastRow - 1);
      } else {
        for (let r = lastRow; r >= 2; r--) {
          periodSheet.deleteRow(r);
        }
      }
    }
    // Masukkan periode aktif berjalan
    periodSheet.appendRow(["PER-2026-11", 11, 2026, "OPEN", "", "", 1, "Periode aktif berjalan"]);
  }

  Logger.log("=== RESET DATABASE SELESAI. DATABASE SEKARANG 100% BERSIH DARI DATA LATIHAN ===");
  return { success: true, message: "Seluruh data latihan dan produk berhasil direset ke nol." };
}
