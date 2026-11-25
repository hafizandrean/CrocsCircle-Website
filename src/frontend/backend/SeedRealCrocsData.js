/**
 * CROCSCIRCLE.ID — SEEDER DATA VALID DARI CROCSCIRCLE.ID(2).xlsx
 * Version: 2.1.0 (Strict Schema Table Names & 100% Idempotent)
 * 
 * Mengimpor seluruh produk riil, varian, penerimaan batch persediaan FIFO,
 * penjualan offline mingguan, pesanan pre-order, beban operasional, dan vendor konsinyasi.
 * Menggunakan nama tabel 100% selaras dengan InitDatabase.gs:
 * - MASTER_PRODUK
 * - VARIAN_PRODUK
 * - PENGATURAN
 * - PEMBELIAN_STOK & DETAIL_PEMBELIAN
 * - STOK & MUTASI_STOK
 * - PENJUALAN & DETAIL_PENJUALAN
 * - PRE_ORDER & PEMBAYARAN_PO
 * - PENGELUARAN
 */

/**
 * Helper Dry-Run Seeder Data Riil CrocsCircle
 * Menampilkan ringkasan data yang akan diimpor tanpa mengubah database spreadsheet.
 * Pilih fungsi ini di toolbar editor Apps Script lalu klik 'Jalankan' ('Run').
 */
function dryRunSeedRealCrocsCircleData() {
  return seedRealCrocsCircleData(true);
}

/**
 * Fungsi Utama Seeder Data Riil CrocsCircle
 * 
 * @param {boolean} [isDryRun=false] - Jika true, hanya menampilkan log rencana import tanpa mutasi.
 */
function seedRealCrocsCircleData(isDryRun) {
  const dryRun = (isDryRun === true);
  Logger.log("=== " + (dryRun ? "[DRY-RUN] " : "") + "MEMULAI IMPORT DATA VALID CROCSCIRCLE (EXCEL SEEDER) ===");

  const summary = {
    dryRun: dryRun,
    products_created: 0,
    products_skipped: 0,
    variants_created: 0,
    variants_skipped: 0,
    capital_tx_created: 0,
    stock_batches_created: 0,
    consignments_created: 0,
    sales_created: 0,
    pos_created: 0,
    expenses_created: 0
  };

  // 1. MASTER PRODUK (12 PRODUK RIIL EXCEL)
  const realProducts = [
    {
      product_id: "PRD-CLG-CLASSIC",
      product_name: "Crocs Classic Clog",
      category_id: "CAT-CLOG",
      model: "Classic Clog",
      description: "Iconic comfort clog original dari CrocsCircle. Ringan, tahan air, dan fleksibel.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1560769629-975ec94e6a86",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-CLG-PLATFORM",
      product_name: "Crocs Platform Clog",
      category_id: "CAT-PLATFORM",
      model: "Classic Platform",
      description: "Crocs dengan elevated outsole stylish dan siluet tinggi khas perempuan.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-CLG-GEO",
      product_name: "Crocs Geo Clog",
      category_id: "CAT-CLOG",
      model: "Geo Clog",
      description: "Desain geometris futuristik dengan ventilasi optimal untuk penggunaan harian.",
      sales_type: "READY_STOCK",
      image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-MCQUEEN",
      product_name: "Crocs Collab Lightning McQueen",
      category_id: "CAT-COLLAB",
      model: "Lightning McQueen",
      description: "Edisi kolaborasi Disney Pixar Cars Lightning McQueen dengan aksen merah ikonik.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-YODA",
      product_name: "Crocs Collab Star Wars Yoda",
      category_id: "CAT-COLLAB",
      model: "Baby Yoda",
      description: "Edisi spesial kolaborasi Star Wars Mandalorian Baby Yoda.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1551107696-a4b0c5a0d9a2",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-NBA",
      product_name: "Crocs Collab NBA All-Star",
      category_id: "CAT-COLLAB",
      model: "NBA All-Star",
      description: "Edisi resmi kolaborasi National Basketball Association (NBA).",
      sales_type: "READY_STOCK",
      image_url: "https://images.unsplash.com/photo-1514989940723-e8e51635b782",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-LOOPY",
      product_name: "Crocs Collab Zanmang Loopy",
      category_id: "CAT-COLLAB",
      model: "Zanmang Loopy Pink",
      description: "Koleksi paling dicari, kolaborasi karakter viral Korea Zanmang Loopy.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-BAPE",
      product_name: "Crocs Collab BAPE Camo",
      category_id: "CAT-COLLAB",
      model: "A Bathing Ape Camo",
      description: "Streetwear fashion statement kolaborasi A Bathing Ape (BAPE).",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1608231387042-66d1773070a5",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-BATMAN",
      product_name: "Crocs Collab DC Batman Batmobile",
      category_id: "CAT-COLLAB",
      model: "DC Batman",
      description: "Edisi pahlawan legendaris The Dark Knight Batman serba hitam.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-SPIDERMAN-NEO",
      product_name: "Crocs Collab Marvel Spiderman Neo",
      category_id: "CAT-COLLAB",
      model: "Spiderman Neo",
      description: "Kolaborasi Marvel Universe Spiderman Neo dengan jaring khas merah & hitam.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1635863138275-d9b33299680b",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-COL-SPIDERMAN-BND",
      product_name: "Crocs Collab Marvel Spiderman Brand New Day",
      category_id: "CAT-COLLAB",
      model: "Spiderman Brand New Day",
      description: "Edisi komik Marvel Spiderman Brand New Day aksen vibrant.",
      sales_type: "ALL",
      image_url: "https://images.unsplash.com/photo-1604200213928-ba3cf4fc8436",
      is_active: true,
      is_published: true
    },
    {
      product_id: "PRD-ACC-GBITS",
      product_name: "Jibbitz / Gbits Charm Crocs",
      category_id: "CAT-JIBBITZ",
      model: "Charm Aksesoris",
      description: "Pin karakter lucu untuk mempercantik lubang ventilasi Crocs Anda.",
      sales_type: "READY_STOCK",
      image_url: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990",
      is_active: true,
      is_published: true
    }
  ];

  realProducts.forEach(function(p) {
    const existing = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", p.product_id);
    if (!existing) {
      if (!dryRun) DatabaseHelper.insertRow("MASTER_PRODUK", p);
      summary.products_created++;
    } else {
      summary.products_skipped++;
    }
  });

  // 2. VARIAN PRODUK (40 VARIAN LENGKAP DARI EXCEL STOK)
  const realVariants = [
    // Classic Clog Variants (13 varian)
    { variant_id: "VAR-CLS-BLK-M8", product_id: "PRD-CLG-CLASSIC", color: "Hitam", size: "M8", sku: "CRC-CLS-BLK-M8", catalog_price: 280000, reference_hpp: 120000 },
    { variant_id: "VAR-CLS-BLK-M6", product_id: "PRD-CLG-CLASSIC", color: "Hitam", size: "M6", sku: "CRC-CLS-BLK-M6", catalog_price: 280000, reference_hpp: 82857 },
    { variant_id: "VAR-CLS-PNK-M6", product_id: "PRD-CLG-CLASSIC", color: "Pink", size: "M6", sku: "CRC-CLS-PNK-M6", catalog_price: 280000, reference_hpp: 120000 },
    { variant_id: "VAR-CLS-PNK-M5", product_id: "PRD-CLG-CLASSIC", color: "Pink", size: "M5", sku: "CRC-CLS-PNK-M5", catalog_price: 280000, reference_hpp: 120000 },
    { variant_id: "VAR-CLS-GRY-M6", product_id: "PRD-CLG-CLASSIC", color: "Abu-abu", size: "M6", sku: "CRC-CLS-GRY-M6", catalog_price: 280000, reference_hpp: 82857 },
    { variant_id: "VAR-CLS-GRY-M7", product_id: "PRD-CLG-CLASSIC", color: "Abu-abu", size: "M7", sku: "CRC-CLS-GRY-M7", catalog_price: 280000, reference_hpp: 82857 },
    { variant_id: "VAR-CLS-LGR-M8", product_id: "PRD-CLG-CLASSIC", color: "Abu Terang", size: "M8", sku: "CRC-CLS-LGR-M8", catalog_price: 280000, reference_hpp: 120000 },
    { variant_id: "VAR-CLS-NVY-M7", product_id: "PRD-CLG-CLASSIC", color: "Navy", size: "M7", sku: "CRC-CLS-NVY-M7", catalog_price: 280000, reference_hpp: 82857 },
    { variant_id: "VAR-CLS-WHT-M7", product_id: "PRD-CLG-CLASSIC", color: "Putih", size: "M7", sku: "CRC-CLS-WHT-M7", catalog_price: 280000, reference_hpp: 120000 },
    { variant_id: "VAR-CLS-WHT-M9", product_id: "PRD-CLG-CLASSIC", color: "Putih", size: "M9", sku: "CRC-CLS-WHT-M9", catalog_price: 280000, reference_hpp: 82857 },
    { variant_id: "VAR-CLS-BLU-M7", product_id: "PRD-CLG-CLASSIC", color: "Biru", size: "M7", sku: "CRC-CLS-BLU-M7", catalog_price: 280000, reference_hpp: 210000 },
    { variant_id: "VAR-CLS-BRN-M5", product_id: "PRD-CLG-CLASSIC", color: "Coklat", size: "M5", sku: "CRC-CLS-BRN-M5", catalog_price: 280000, reference_hpp: 120000 },
    { variant_id: "VAR-CLS-TPE-M8", product_id: "PRD-CLG-CLASSIC", color: "Taupe", size: "M8", sku: "CRC-CLS-TPE-M8", catalog_price: 280000, reference_hpp: 120000 },

    // Platform Variants (4 varian)
    { variant_id: "VAR-PLT-PNK-M4", product_id: "PRD-CLG-PLATFORM", color: "Pink", size: "M4", sku: "CRC-PLT-PNK-M4", catalog_price: 350000, reference_hpp: 170000 },
    { variant_id: "VAR-PLT-PNK-M5", product_id: "PRD-CLG-PLATFORM", color: "Pink", size: "M5", sku: "CRC-PLT-PNK-M5", catalog_price: 350000, reference_hpp: 170000 },
    { variant_id: "VAR-PLT-BNE-M6", product_id: "PRD-CLG-PLATFORM", color: "Bone", size: "M6", sku: "CRC-PLT-BNE-M6", catalog_price: 350000, reference_hpp: 170000 },
    { variant_id: "VAR-PLT-BNE-W7", product_id: "PRD-CLG-PLATFORM", color: "Bone", size: "W7", sku: "CRC-PLT-BNE-W7", catalog_price: 350000, reference_hpp: 170000 },

    // Geo Clog (1 varian)
    { variant_id: "VAR-GEO-BLK-M9", product_id: "PRD-CLG-GEO", color: "Hitam", size: "M9", sku: "CRC-GEO-BLK-M9", catalog_price: 320000, reference_hpp: 140000 },

    // Collab McQueen (3 varian)
    { variant_id: "VAR-MCQ-RED-M4", product_id: "PRD-COL-MCQUEEN", color: "Merah", size: "M4", sku: "CRC-MCQ-RED-M4", catalog_price: 380000, reference_hpp: 220000 },
    { variant_id: "VAR-MCQ-RED-M6", product_id: "PRD-COL-MCQUEEN", color: "Merah", size: "M6", sku: "CRC-MCQ-RED-M6", catalog_price: 380000, reference_hpp: 220000 },
    { variant_id: "VAR-MCQ-RED-M8", product_id: "PRD-COL-MCQUEEN", color: "Merah", size: "M8", sku: "CRC-MCQ-RED-M8", catalog_price: 380000, reference_hpp: 220000 },

    // Collab Loopy (3 varian)
    { variant_id: "VAR-LPY-PNK-M4", product_id: "PRD-COL-LOOPY", color: "Pink", size: "M4", sku: "CRC-LPY-PNK-M4", catalog_price: 380000, reference_hpp: 210000 },
    { variant_id: "VAR-LPY-PNK-M5", product_id: "PRD-COL-LOOPY", color: "Pink", size: "M5", sku: "CRC-LPY-PNK-M5", catalog_price: 380000, reference_hpp: 210000 },
    { variant_id: "VAR-LPY-PNK-W6", product_id: "PRD-COL-LOOPY", color: "Pink", size: "W6", sku: "CRC-LPY-PNK-W6", catalog_price: 380000, reference_hpp: 210000 },

    // Collab Bape (6 varian)
    { variant_id: "VAR-BAP-BLK-M7", product_id: "PRD-COL-BAPE", color: "Hitam", size: "M7", sku: "CRC-BAP-BLK-M7", catalog_price: 380000, reference_hpp: 230000 },
    { variant_id: "VAR-BAP-BLK-M8", product_id: "PRD-COL-BAPE", color: "Hitam", size: "M8", sku: "CRC-BAP-BLK-M8", catalog_price: 380000, reference_hpp: 230000 },
    { variant_id: "VAR-BAP-BLK-M9", product_id: "PRD-COL-BAPE", color: "Hitam", size: "M9", sku: "CRC-BAP-BLK-M9", catalog_price: 380000, reference_hpp: 240000 },
    { variant_id: "VAR-BAP-BLK-M10", product_id: "PRD-COL-BAPE", color: "Hitam", size: "M10", sku: "CRC-BAP-BLK-M10", catalog_price: 380000, reference_hpp: 230000 },
    { variant_id: "VAR-BAP-BLU-M7", product_id: "PRD-COL-BAPE", color: "Biru", size: "M7", sku: "CRC-BAP-BLU-M7", catalog_price: 380000, reference_hpp: 240000 },
    { variant_id: "VAR-BAP-GRN-W6", product_id: "PRD-COL-BAPE", color: "Hijau", size: "W6", sku: "CRC-BAP-GRN-W6", catalog_price: 390000, reference_hpp: 230000 },

    // Collab Batman (2 varian)
    { variant_id: "VAR-BTM-BLK-M8", product_id: "PRD-COL-BATMAN", color: "Hitam", size: "M8", sku: "CRC-BTM-BLK-M8", catalog_price: 380000, reference_hpp: 240000 },
    { variant_id: "VAR-BTM-BLK-M9", product_id: "PRD-COL-BATMAN", color: "Hitam", size: "M9", sku: "CRC-BTM-BLK-M9", catalog_price: 380000, reference_hpp: 230000 },

    // Collab Spiderman Neo (3 varian)
    { variant_id: "VAR-SPD-RED-M7", product_id: "PRD-COL-SPIDERMAN-NEO", color: "Merah", size: "M7", sku: "CRC-SPD-RED-M7", catalog_price: 450000, reference_hpp: 240000 },
    { variant_id: "VAR-SPD-BLK-M10", product_id: "PRD-COL-SPIDERMAN-NEO", color: "Hitam", size: "M10", sku: "CRC-SPD-BLK-M10", catalog_price: 450000, reference_hpp: 240000 },
    { variant_id: "VAR-SPD-BLK-M9", product_id: "PRD-COL-SPIDERMAN-NEO", color: "Hitam", size: "M9", sku: "CRC-SPD-BLK-M9", catalog_price: 450000, reference_hpp: 240000 },

    // Collab Spiderman BND (2 varian)
    { variant_id: "VAR-BND-RED-M9", product_id: "PRD-COL-SPIDERMAN-BND", color: "Merah", size: "M9", sku: "CRC-BND-RED-M9", catalog_price: 410000, reference_hpp: 240000 },
    { variant_id: "VAR-BND-RED-M7", product_id: "PRD-COL-SPIDERMAN-BND", color: "Merah", size: "M7", sku: "CRC-BND-RED-M7", catalog_price: 410000, reference_hpp: 240000 },

    // Collab Yoda & NBA (2 varian)
    { variant_id: "VAR-YOD-PNK-M8", product_id: "PRD-COL-YODA", color: "Pink", size: "M8", sku: "CRC-YOD-PNK-M8", catalog_price: 380000, reference_hpp: 230000 },
    { variant_id: "VAR-NBA-BLK-M9", product_id: "PRD-COL-NBA", color: "Hitam", size: "M9", sku: "CRC-NBA-BLK-M9", catalog_price: 380000, reference_hpp: 240000 },

    // Gbits (1 varian)
    { variant_id: "VAR-GBIT-STD", product_id: "PRD-ACC-GBITS", color: "Multicolor", size: "ALL", sku: "CRC-GBIT-STD", catalog_price: 4000, reference_hpp: 800 }
  ];

  realVariants.forEach(function(v) {
    const existing = DatabaseHelper.getRowByPk("VARIAN_PRODUK", "variant_id", v.variant_id);
    if (!existing) {
      if (!dryRun) {
        DatabaseHelper.insertRow("VARIAN_PRODUK", {
          variant_id: v.variant_id,
          product_id: v.product_id,
          size: v.size,
          sku: v.sku,
          color: v.color,
          catalog_price: v.catalog_price,
          reference_hpp: v.reference_hpp,
          unit: v.variant_id === "VAR-GBIT-STD" ? "PCS" : "PASANG",
          is_active: true
        });
      }
      summary.variants_created++;
    } else {
      summary.variants_skipped++;
    }
  });

  // 3. SETORAN MODAL AWAL (EKUITAS PEMILIK - BUKAN OMZET)
  // Dicatat pada tabel PENGATURAN sebagai opening cash balance resmi
  const openingSettingKey = "OPENING_CASH_20261001";
  const existingOpening = DatabaseHelper.getRowByPk("PENGATURAN", "setting_key", openingSettingKey);
  if (!existingOpening) {
    const openingPayload = {
      opening_date: "2026-10-01",
      physical_cash: 0,
      bank_cash: 3000000,
      total_opening_cash: 3000000,
      verified_by_owner: true,
      notes: "Modal Disetor Awal: Hafiz Rp1.500.000 + Harits Rp1.500.000",
      verified_at: "2026-10-22",
      verified_by: "hafiz"
    };
    if (!dryRun) {
      DatabaseHelper.insertRow("PENGATURAN", {
        setting_key: openingSettingKey,
        setting_value: JSON.stringify(openingPayload),
        description: "Saldo Pembukaan Kas terverifikasi Owner per 2026-10-01",
        updated_by: "SYSTEM",
        updated_at: new Date()
      });
    }
    summary.capital_tx_created += 2;
  }

  // 4. PENERIMAAN BATCH PEMBELIAN PERSADAAN (PURCHASE INVENTORY & FIFO)
  // Memeriksa idempotency batch di DETAIL_PEMBELIAN
  function receiveBatchIfAbsent(purchaseId, variantId, qty, baseCost, shippingAlloc, notes) {
    const existing = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
      return b.purchase_id === purchaseId && b.variant_id === variantId;
    });
    if (!existing || existing.length === 0) {
      if (!dryRun) {
        InventoryService.receiveOwnedStockBatch(purchaseId, variantId, qty, baseCost, 0, notes, "SYSTEM", shippingAlloc);
      }
      summary.stock_batches_created++;
    }
  }

  // A. 20 Okt 2026: Gbits 100 pcs
  receiveBatchIfAbsent("PUR-OCT-GBIT", "VAR-GBIT-STD", 100, 786, 0, "Beli Gbits 100pcs 20 Okt");

  // B. 23 Okt 2026: Pemesanan 1 (Classic Hitam Adat, Mcqueen, Geo, NBA, Yoda, Loopy, Bape, dll.)
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-CLS-BLK-M8", 1, 120000, 0, "Pemesanan 1 (Adat PO)");
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-MCQ-RED-M8", 1, 220000, 0, "Pemesanan 1 No 1");
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-GEO-BLK-M9", 1, 140000, 0, "Pemesanan 1 No 2");
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-NBA-BLK-M9", 1, 240000, 0, "Pemesanan 1 No 4");
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-CLS-PNK-M6", 1, 120000, 0, "Pemesanan 1 No 8");
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-PLT-PNK-M4", 1, 170000, 0, "Pemesanan 1 No 11");
  receiveBatchIfAbsent("PUR-OCT-01", "VAR-PLT-PNK-M5", 1, 170000, 0, "Pemesanan 1 No 12");

  // C. Batch November: Pemesanan 2, Shopee, dan Pemesanan 3:
  receiveBatchIfAbsent("PUR-NOV-02", "VAR-SPD-RED-M7", 1, 240000, 0, "Pemesanan Shopee No 15");
  receiveBatchIfAbsent("PUR-NOV-02", "VAR-SPD-BLK-M10", 1, 240000, 0, "Pemesanan Shopee No 16");
  receiveBatchIfAbsent("PUR-NOV-02", "VAR-BND-RED-M9", 1, 240000, 0, "Pemesanan Shopee No 17");
  receiveBatchIfAbsent("PUR-NOV-02", "VAR-BND-RED-M7", 1, 240000, 0, "Pemesanan Shopee No 18");
  receiveBatchIfAbsent("PUR-NOV-02", "VAR-BTM-BLK-M8", 1, 240000, 0, "Pemesanan 2 No 20");
  receiveBatchIfAbsent("PUR-NOV-02", "VAR-MCQ-RED-M4", 1, 220000, 0, "Pemesanan 3 No 24");

  // D. Batch 7 Pasang Classic @ Rp 82.857 (13 Nov 2026):
  receiveBatchIfAbsent("PUR-NOV-CLS7", "VAR-CLS-BLK-M6", 1, 82857, 0, "Beli Classic 7 Pasang No 40");
  receiveBatchIfAbsent("PUR-NOV-CLS7", "VAR-CLS-NVY-M7", 1, 82857, 0, "Beli Classic 7 Pasang No 41");
  receiveBatchIfAbsent("PUR-NOV-CLS7", "VAR-CLS-WHT-M9", 2, 82857, 0, "Beli Classic 7 Pasang No 43-44");

  // E. Penerimaan Konsinyasi Vendor Dzaki (9 Pasang: 4 Terjual 15 Nov, 5 In Stock):
  function receiveConsignmentIfAbsent(variantId, noteSnippet) {
    const existing = DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", function(b) {
      return b.vendor_id === "VND-DZAKI" && b.variant_id === variantId && (b.notes || "").indexOf(noteSnippet) !== -1;
    });
    if (!existing || existing.length === 0) {
      if (!dryRun) {
        InventoryService.receiveConsignmentStock("VND-DZAKI", variantId, 1, "Konsinyasi Dzaki: " + noteSnippet, "SYSTEM");
      }
      summary.consignments_created++;
    }
  }

  // 4 Pasang Konsinyasi Terjual 15 Nov:
  receiveConsignmentIfAbsent("VAR-BTM-BLK-M9", "No 29 (Terjual 15 Nov)");
  receiveConsignmentIfAbsent("VAR-CLS-LGR-M8", "No 30 (Terjual 15 Nov)");
  receiveConsignmentIfAbsent("VAR-BAP-BLK-M8", "No 36 (Terjual 15 Nov)");
  receiveConsignmentIfAbsent("VAR-CLS-PNK-M5", "No 37 (Terjual 15 Nov)");

  // 5 Pasang Konsinyasi In Stock Aktif:
  receiveConsignmentIfAbsent("VAR-CLS-WHT-M7", "No 31 (In Stock)");
  receiveConsignmentIfAbsent("VAR-BAP-BLU-M7", "No 32 (In Stock)");
  receiveConsignmentIfAbsent("VAR-BAP-BLK-M9", "No 33 (In Stock)");
  receiveConsignmentIfAbsent("VAR-MCQ-RED-M8", "No 34 (In Stock)");
  receiveConsignmentIfAbsent("VAR-CLS-BLU-M7", "No 35 (In Stock)");

  // 5. TRANSAKSI BULAN OKTOBER 2026 (PO ADAT LUNAS - HISTORIS PERIODE CLOSED)
  // Dimasukkan langsung ke ledger PENJUALAN & DETAIL_PENJUALAN agar tidak terblokir ClosingService
  const existingSaleOkt = DatabaseHelper.getRowByPk("PENJUALAN", "sales_id", "SALES-OKT-01");
  if (!existingSaleOkt) {
    if (!dryRun) {
      DatabaseHelper.insertRow("PENJUALAN", {
        sales_id: "SALES-OKT-01",
        transaction_date: "2026-10-28",
        sales_channel: "PRE_ORDER",
        sales_type: "OWNED",
        customer_name: "Adat",
        payment_method: "QRIS",
        payment_status: "PAID",
        gross_customer_payment: 290000,
        owned_sales_amount: 290000,
        vendor_incentive_amount: 0,
        net_operational_revenue: 290000,
        total_hpp: 124000,
        gross_profit: 166000,
        idempotency_key: "MIG-OKT-01",
        notes: "Migrasi Historis Lunas PO Adat Oktober 2026",
        created_by: "SYSTEM",
        created_at: new Date("2026-10-28")
      });

      DatabaseHelper.insertRow("DETAIL_PENJUALAN", {
        sales_detail_id: "SD-OKT-01-01",
        sales_id: "SALES-OKT-01",
        variant_id: "VAR-CLS-BLK-M8",
        item_ownership: "OWNED",
        vendor_id: "",
        batch_id: "BATCH-OCT-01",
        quantity: 1,
        selling_price: 280000,
        hpp_unit: 120000,
        vendor_payable_unit: 0,
        crocs_incentive_unit: 0,
        subtotal: 280000,
        total_hpp: 120000,
        total_vendor_payable: 0,
        total_crocs_incentive: 0,
        vendor_paid_amount: 0,
        vendor_remaining_payable: 0,
        settlement_status: "SETTLED"
      });

      DatabaseHelper.insertRow("DETAIL_PENJUALAN", {
        sales_detail_id: "SD-OKT-01-02",
        sales_id: "SALES-OKT-01",
        variant_id: "VAR-GBIT-STD",
        item_ownership: "OWNED",
        vendor_id: "",
        batch_id: "BATCH-OCT-GBIT",
        quantity: 5,
        selling_price: 2000,
        hpp_unit: 800,
        vendor_payable_unit: 0,
        crocs_incentive_unit: 0,
        subtotal: 10000,
        total_hpp: 4000,
        total_vendor_payable: 0,
        total_crocs_incentive: 0,
        vendor_paid_amount: 0,
        vendor_remaining_payable: 0,
        settlement_status: "SETTLED"
      });
    }
    summary.sales_created++;
  }

  // Beban Operasional Oktober (Bensin 50k, Tol 11k) pada sheet PENGELUARAN
  const oktExpenses = [
    { id: "EXP-2026-10-01", date: "2026-10-25", cat: "TRANSPORTASI", desc: "Bensin Mobil (Daniandra)", amt: 50000, by: "Langsung Rekening CrocsCircle" },
    { id: "EXP-2026-10-02", date: "2026-10-25", cat: "TRANSPORTASI", desc: "Tol (emoney Harits)", amt: 11000, by: "Cash Harits" }
  ];
  oktExpenses.forEach(function(exp) {
    const existing = DatabaseHelper.getRowByPk("PENGELUARAN", "expense_id", exp.id);
    if (!existing) {
      if (!dryRun) {
        DatabaseHelper.insertRow("PENGELUARAN", {
          expense_id: exp.id,
          expense_date: exp.date,
          category: exp.cat,
          activity: "OPERASIONAL",
          description: exp.desc,
          amount: exp.amt,
          payment_method: "TRANSFER",
          paid_by: exp.by,
          receipt_url: "",
          notes: "Migrasi pengeluaran Oktober",
          created_by: "SYSTEM"
        });
      }
      summary.expenses_created++;
    }
  });

  // 6. PENJUALAN KONSINYASI DZAKI (15 Nov 2026)
  // 4 Pasang: Total Pembayaran Rp 1.310.000 | Hak Dzaki: Rp 1.270.000 | Omzet Insentif: Rp 40.000
  const existingSaleDzaki = DatabaseHelper.getRowByPk("PENJUALAN", "sales_id", "SALES-NOV-DZAKI-01");
  if (!existingSaleDzaki) {
    if (!dryRun) {
      SalesService.createSale({
        sales_id: "SALES-NOV-DZAKI-01",
        transaction_date: "2026-11-15",
        customer_name: "Pelanggan Event 15 Nov (Dzaki)",
        sales_channel: "OFFLINE_EVENT",
        payment_method: "QRIS",
        items: [
          { variant_id: "VAR-CLS-LGR-M8", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 },
          { variant_id: "VAR-BTM-BLK-M9", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 380000 },
          { variant_id: "VAR-BAP-BLK-M8", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 370000 },
          { variant_id: "VAR-CLS-PNK-M5", item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }
        ]
      });
    }
    summary.sales_created++;
  }

  // 7. PRE-ORDER BULAN NOVEMBER 2026 (PADA TABEL PRE_ORDER & PEMBAYARAN_PO)
  // A. PO Lunas (Omzet diakui saat pelunasan 15 Nov):
  // Bu Ira & Ka Hasbi diimpor sebagai LUNAS sesuai Keputusan Owner Poin 1
  const lunasOrders = [
    { id: "PO-NOV-01", cust: "Daniandra", phone: "0812000001", varId: "VAR-BAP-BLK-M8", price: 380000, date: "2026-11-01" },
    { id: "PO-NOV-02", cust: "Ica", phone: "0812000002", varId: "VAR-BAP-GRN-W6", price: 390000, date: "2026-11-01" },
    { id: "PO-NOV-03", cust: "Bu Desi", phone: "08562027827", varId: "VAR-BAP-BLK-M10", price: 380000, date: "2026-11-06" },
    { id: "PO-NOV-04", cust: "Bu Ira", phone: "081779149831", varId: "VAR-CLS-TPE-M8", price: 280000, date: "2026-11-06" },
    { id: "PO-NOV-05", cust: "Ka Hasbi", phone: "081383120858", varId: "VAR-CLS-BLK-M8", price: 280000, date: "2026-11-10" },
    { id: "PO-NOV-06", cust: "Ka Rida", phone: "081936305633", varId: "VAR-PLT-BNE-W7", price: 350000, date: "2026-11-15" }
  ];

  lunasOrders.forEach(function(o) {
    const existing = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", o.id);
    if (!existing) {
      if (!dryRun) {
        DatabaseHelper.insertRow("PRE_ORDER", {
          po_id: o.id,
          order_date: o.date,
          customer_name: o.cust,
          customer_contact: o.phone,
          batch_number: "BATCH-NOV",
          variant_id: o.varId,
          quantity: 1,
          selling_price: o.price,
          target_fulfillment_date: "2026-11-15",
          total_price: o.price,
          dp_amount: o.price / 2,
          settlement_amount: o.price / 2,
          payment_status: "PAID",
          fulfillment_status: "DELIVERED",
          settlement_date: "2026-11-15",
          notes: "Migrasi PO Lunas CROCSCIRCLE.ID(2).xlsx",
          created_by: "SYSTEM"
        });

        // Catat termin pembayaran di PEMBAYARAN_PO
        DatabaseHelper.insertRow("PEMBAYARAN_PO", {
          payment_id: "PAY-" + o.id + "-01",
          po_id: o.id,
          payment_date: o.date,
          amount: o.price / 2,
          payment_method: "QRIS",
          notes: "DP 50%",
          created_by: "SYSTEM"
        });
        DatabaseHelper.insertRow("PEMBAYARAN_PO", {
          payment_id: "PAY-" + o.id + "-02",
          po_id: o.id,
          payment_date: "2026-11-15",
          amount: o.price / 2,
          payment_method: "QRIS",
          notes: "Pelunasan Penuh (Omzet Diakui)",
          created_by: "SYSTEM"
        });
      }
      summary.pos_created++;
    }
  });

  // B. PO Status DP (Belum Lunas / Kas Terikat / Kewajiban Pelanggan):
  // Bu Ii: DP Rp 175.000
  const existingPoIi = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", "PO-DP-01");
  if (!existingPoIi) {
    if (!dryRun) {
      DatabaseHelper.insertRow("PRE_ORDER", {
        po_id: "PO-DP-01",
        order_date: "2026-11-10",
        customer_name: "Bu Ii",
        customer_contact: "085722072270",
        batch_number: "BATCH-NOV",
        variant_id: "VAR-PLT-BNE-W7",
        quantity: 1,
        selling_price: 350000,
        target_fulfillment_date: "2026-11-20",
        total_price: 350000,
        dp_amount: 175000,
        settlement_amount: 0,
        payment_status: "PARTIAL",
        fulfillment_status: "NOT_DELIVERED",
        settlement_date: "",
        notes: "DP 50% Pre-Order Bone W7",
        created_by: "SYSTEM"
      });
      DatabaseHelper.insertRow("PEMBAYARAN_PO", {
        payment_id: "PAY-PO-DP-01-01",
        po_id: "PO-DP-01",
        payment_date: "2026-11-10",
        amount: 175000,
        payment_method: "QRIS",
        notes: "DP 50% (Kas Terikat / Kewajiban Pelanggan)",
        created_by: "SYSTEM"
      });
    }
    summary.pos_created++;
  }

  // Ka Ozi: DP Rp 170.000 sesuai Keputusan Owner Poin 2
  const existingPoOzi = DatabaseHelper.getRowByPk("PRE_ORDER", "po_id", "PO-DP-02");
  if (!existingPoOzi) {
    if (!dryRun) {
      DatabaseHelper.insertRow("PRE_ORDER", {
        po_id: "PO-DP-02",
        order_date: "2026-11-15",
        customer_name: "Ka Ozi",
        customer_contact: "081299000000",
        batch_number: "BATCH-NOV",
        variant_id: "VAR-SPD-BLK-M9",
        quantity: 1,
        selling_price: 450000,
        target_fulfillment_date: "2026-11-25",
        total_price: 450000,
        dp_amount: 170000,
        settlement_amount: 0,
        payment_status: "PARTIAL",
        fulfillment_status: "NOT_DELIVERED",
        settlement_date: "",
        notes: "DP Ka Ozi Rp170.000 (Kas Terikat / Kewajiban Pelanggan sesuai keputusan Owner; catatan CRM lama tertulis Rp240.000, selisih Rp70.000 disimpan untuk catatan audit)",
        created_by: "SYSTEM"
      });
      DatabaseHelper.insertRow("PEMBAYARAN_PO", {
        payment_id: "PAY-PO-DP-02-01",
        po_id: "PO-DP-02",
        payment_date: "2026-11-15",
        amount: 170000,
        payment_method: "QRIS",
        notes: "DP Ka Ozi Rp170.000 (Kas Terikat / Kewajiban Pelanggan)",
        created_by: "SYSTEM"
      });
    }
    summary.pos_created++;
  }

  // 8. BEBAN OPERASIONAL NOVEMBER 2026 (PADA TABEL PENGELUARAN)
  // Total: Rp 497.260 + Rp 120.000 Kerugian Averocs
  const realExpensesNov = [
    { date: "2026-11-01", cat: "TRANSPORTASI", desc: "Bensin Mobil (Daniandra)", amt: 100000, by: "Langsung Rekening CrocsCircle" },
    { date: "2026-11-01", cat: "SEWA", desc: "Sewa Lapak", amt: 20000, by: "Cash Hafiz" },
    { date: "2026-11-01", cat: "ADMINISTRASI", desc: "Uang Kebersihan", amt: 15000, by: "Cash Hafiz" },
    { date: "2026-11-01", cat: "ADMINISTRASI", desc: "Uang Keamanan", amt: 5000, by: "Cash Hafiz" },
    { date: "2026-11-01", cat: "TRANSPORTASI", desc: "Tol (emoney Harits)", amt: 11000, by: "Cash Harits" },
    { date: "2026-11-07", cat: "MARKETING", desc: "Print Banner", amt: 45000, by: "Cash Hafiz" },
    // Keputusan Owner Poin 3: Kerugian Averocs dicatat sebagai pengeluaran khusus
    { date: "2026-11-07", cat: "KERUGIAN_PENIPUAN_VENDOR", desc: "Kerugian ditipu vendor averocs", amt: 120000, by: "Cash Hafiz" },
    { date: "2026-11-08", cat: "TRANSPORTASI", desc: "Bensin Mobil (Dani)", amt: 100000, by: "Langsung Rekening CrocsCircle" },
    { date: "2026-11-08", cat: "SEWA", desc: "Lapak Pak Haji", amt: 20000, by: "Cash CrocsCircle" },
    { date: "2026-11-08", cat: "ADMINISTRASI", desc: "Kebersihan", amt: 15000, by: "Cash CrocsCircle" },
    { date: "2026-11-08", cat: "ADMINISTRASI", desc: "Keamanan", amt: 5000, by: "Cash CrocsCircle" },
    { date: "2026-11-08", cat: "TRANSPORTASI", desc: "Tol (emoney Harits)", amt: 11000, by: "Cash Harits" },
    { date: "2026-11-15", cat: "ADMINISTRASI", desc: "Keamanan Lapak", amt: 10000, by: "Cash CrocsCircle" },
    { date: "2026-11-15", cat: "ADMINISTRASI", desc: "Preman / Parkir", amt: 20000, by: "Cash CrocsCircle" },
    { date: "2026-11-15", cat: "TRANSPORTASI", desc: "Bensin Mobil (Dani)", amt: 100000, by: "Langsung Rekening CrocsCircle" },
    { date: "2026-11-15", cat: "KARYAWAN", desc: "Parttime (Adik Harits)", amt: 50000, by: "Langsung Rekening CrocsCircle" },
    { date: "2026-11-15", cat: "ADMINISTRASI", desc: "Biaya Gopay Merchant", amt: 4260, by: "Cash Harits" },
    { date: "2026-11-15", cat: "TRANSPORTASI", desc: "Tol (emoney Harits)", amt: 11000, by: "Cash Harits" }
  ];

  realExpensesNov.forEach(function(exp, idx) {
    const expId = "EXP-2026-11-" + (idx + 1 < 10 ? "0" + (idx + 1) : (idx + 1));
    const existing = DatabaseHelper.getRowByPk("PENGELUARAN", "expense_id", expId);
    if (!existing) {
      if (!dryRun) {
        DatabaseHelper.insertRow("PENGELUARAN", {
          expense_id: expId,
          expense_date: exp.date,
          category: exp.cat,
          activity: "OPERASIONAL",
          description: exp.desc,
          amount: exp.amt,
          payment_method: "TRANSFER",
          paid_by: exp.by,
          receipt_url: "",
          notes: "Migrasi pengeluaran operasional November",
          created_by: "SYSTEM"
        });
      }
      summary.expenses_created++;
    }
  });

  Logger.log("=== " + (dryRun ? "[DRY-RUN] " : "") + "SEED DATA REAL CROCSCIRCLE SELESAI ===");
  Logger.log("Ringkasan Seeder: " + JSON.stringify(summary));
  return {
    success: true,
    dryRun: dryRun,
    message: dryRun ? "Dry-run berhasil. Tidak ada data yang ditulis ke spreadsheet." : "Seluruh data valid Excel berhasil di-seed secara idempotent!",
    summary: summary
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { seedRealCrocsCircleData, dryRunSeedRealCrocsCircleData };
}
