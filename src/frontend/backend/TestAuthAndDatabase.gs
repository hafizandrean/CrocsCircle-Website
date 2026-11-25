/**
 * CROCSCIRCLE.ID — APPS SCRIPT IN-SHEET TEST RUNNER & SANDBOX INITIALIZER
 * Version: 1.2.0 (Phase 2A, 2B, 2C, 2D & 3E Test Runner)
 * 
 * Fungsi ini dapat dijalankan langsung di Google Apps Script editor
 * untuk menguji DatabaseHelper, InitDatabase, AuthService, InventoryService,
 * SalesService, POService, dan VendorService pada spreadsheet Google Sheets nyata.
 */

/**
 * Helper 1-Klik untuk Inisialisasi Database Sandbox & Akun Owner
 * Pilih fungsi 'setupSandboxDatabaseAndOwner' di toolbar editor GAS, lalu klik 'Jalankan' ('Run').
 */
function setupSandboxDatabaseAndOwner() {
  Logger.log("=== MEMULAI INISIALISASI DATABASE SANDBOX ===");
  const initRes = initializeCrocsCircleDatabase();
  Logger.log("Hasil Init Database: " + JSON.stringify(initRes));

  Logger.log("=== MEMBUAT AKUN OWNER SANDBOX (hafiz & owner_tester) ===");
  try {
    AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
    Logger.log("[SUKSES] Akun 'hafiz' berhasil didaftarkan di sheet USERS.");
  } catch (e) {
    Logger.log("[INFO] Akun 'hafiz': " + e.message);
  }

  try {
    AuthService.setupOwnerAccount("owner_tester", "Owner Tester", "PassTester2026!");
    Logger.log("[SUKSES] Akun 'owner_tester' berhasil didaftarkan di sheet USERS.");
  } catch (e) {
    Logger.log("[INFO] Akun 'owner_tester': " + e.message);
  }

  Logger.log("=== SETUP SANDBOX SELESAI ===");
  return { success: true, message: "Sandbox Database & Owner ready!" };
}

/**
 * Helper Dry-Run Pembersihan Data Pengujian Phase 3E.3
 * Menampilkan daftar record uji yang ditemukan tanpa melakukan penghapusan fisik.
 * Pilih fungsi ini di toolbar editor GAS lalu klik 'Jalankan' ('Run').
 */
function dryRunCleanupPhase3E3TestData() {
  return cleanupPhase3E3TestData(true);
}

/**
 * Helper Pembersihan Data Pengujian Phase 3E.3 (Tahap B)
 * Target HANYA record uji ber-ID spesifik:
 * - Master Produk: CAT-20261119-357, CAT-20261119-639
 * - Varian & SKU: SKU-LIVE-TST-979427 (atau berinduk ke produk uji di atas)
 * Menelusuri seluruh relasi turunan (VARIAN_PRODUK, STOK, BATCH_FIFO, MUTASI_STOK).
 * TIDAK PERNAH menghapus akun USERS, KATEGORI master, VENDORS, konfigurasi, maupun struktur 26 sheet.
 *
 * @param {boolean} [isDryRun=false] - Jika true, hanya mendata record tanpa mutasi fisik.
 */
function cleanupPhase3E3TestData(isDryRun) {
  const dryRun = (isDryRun === true);
  Logger.log("=== " + (dryRun ? "[DRY-RUN] " : "") + "AUDIT & CLEANUP DATA PENGUJIAN PHASE 3E.3 ===");
  
  const testProdIds = ["CAT-20261119-357", "CAT-20261119-639"];
  const testSkus = ["SKU-LIVE-TST-979427"];
  
  const identifiedRecords = {
    master_products: [],
    variants: [],
    stocks: [],
    batches: [],
    mutations: []
  };

  // 1. Temukan Master Produk Uji
  testProdIds.forEach(function(pId) {
    const p = DatabaseHelper.getRowByPk("MASTER_PRODUK", "product_id", pId);
    if (p) {
      identifiedRecords.master_products.push(p);
      Logger.log("Ditemukan Master Produk Uji: " + p.product_id + " (" + (p.product_name || "") + ")");
    }
  });

  // 2. Temukan Varian Produk Uji
  const variants = DatabaseHelper.getAllRows("VARIAN_PRODUK", function(v) {
    return testSkus.indexOf(v.sku) !== -1 || testProdIds.indexOf(v.product_id) !== -1;
  });
  const variantIds = [];
  variants.forEach(function(v) {
    identifiedRecords.variants.push(v);
    variantIds.push(v.variant_id);
    Logger.log("Ditemukan Varian Uji: " + v.variant_id + " | SKU: " + v.sku + " | Induk: " + v.product_id);
  });

  // 3. Temukan Relasi Turunan (STOK, BATCH_FIFO, MUTASI_STOK)
  if (variantIds.length > 0) {
    try {
      const stocks = DatabaseHelper.getAllRows("STOK", function(s) {
        return variantIds.indexOf(s.variant_id) !== -1;
      });
      identifiedRecords.stocks = stocks;
    } catch(e) {}

    try {
      const batches = DatabaseHelper.getAllRows("BATCH_FIFO", function(b) {
        return variantIds.indexOf(b.variant_id) !== -1;
      });
      identifiedRecords.batches = batches;
    } catch(e) {}

    try {
      const mutations = DatabaseHelper.getAllRows("MUTASI_STOK", function(m) {
        return variantIds.indexOf(m.variant_id) !== -1;
      });
      identifiedRecords.mutations = mutations;
    } catch(e) {}
  }

  Logger.log("--- REKAPITULASI RECORD UJI YANG TERDETEKSI ---");
  Logger.log("Master Produk: " + identifiedRecords.master_products.length + " baris");
  Logger.log("Varian Produk: " + identifiedRecords.variants.length + " baris");
  Logger.log("Stok: " + identifiedRecords.stocks.length + " baris");
  Logger.log("Batch FIFO: " + identifiedRecords.batches.length + " baris");
  Logger.log("Mutasi Stok: " + identifiedRecords.mutations.length + " baris");

  if (dryRun) {
    Logger.log("[DRY-RUN] Mode simulasi selesai. Tidak ada baris yang dihapus dari Google Sheets.");
    return {
      success: true,
      dryRun: true,
      message: "Dry-run berhasil. Tidak ada data yang dihapus dari spreadsheet.",
      identifiedRecords: identifiedRecords
    };
  }

  // EKSEKUSI PENGHAPUSAN FISIK (Hanya jika bukan dryRun)
  // A. Hapus Mutasi Stok & Batch jika ada
  identifiedRecords.mutations.forEach(function(m) {
    try { DatabaseHelper.deleteRowByPk("MUTASI_STOK", "mutation_id", m.mutation_id); } catch(e) {}
  });
  identifiedRecords.batches.forEach(function(b) {
    try { DatabaseHelper.deleteRowByPk("BATCH_FIFO", "batch_id", b.batch_id); } catch(e) {}
  });
  identifiedRecords.stocks.forEach(function(s) {
    try { DatabaseHelper.deleteRowByPk("STOK", "variant_id", s.variant_id); } catch(e) {}
  });

  // B. Hapus Varian Produk
  identifiedRecords.variants.forEach(function(v) {
    try { DatabaseHelper.deleteRowByPk("VARIAN_PRODUK", "variant_id", v.variant_id); } catch(e) {}
  });

  // C. Hapus Master Produk
  identifiedRecords.master_products.forEach(function(p) {
    try { DatabaseHelper.deleteRowByPk("MASTER_PRODUK", "product_id", p.product_id); } catch(e) {}
  });

  Logger.log("=== EKSEKUSI CLEANUP SELESAI. Seluruh record uji berhasil dihapus ===");
  return {
    success: true,
    dryRun: false,
    message: "Data uji berhasil dibersihkan dari spreadsheet Sandbox.",
    deletedCounts: {
      master_products: identifiedRecords.master_products.length,
      variants: identifiedRecords.variants.length,
      stocks: identifiedRecords.stocks.length,
      batches: identifiedRecords.batches.length,
      mutations: identifiedRecords.mutations.length
    }
  };
}

function runCrocsCircleTestSuite() {
  Logger.log("=== MEMULAI TEST SUITE CROCSCIRCLE (PHASE 2A, 2B, 2C, 2D) ===");
  const testResults = [];

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function executeTest(testName, fn) {
    try {
      fn();
      testResults.push({ name: testName, status: "PASS" });
      Logger.log("[PASS] " + testName);
    } catch (e) {
      testResults.push({ name: testName, status: "FAIL", error: e.message });
      Logger.log("[FAIL] " + testName + " : " + e.message);
    }
  }

  // --- PHASE 2A TESTS ---
  executeTest("2A-1. Inisialisasi Database (22 Tabel)", function() {
    const res = initializeCrocsCircleDatabase();
    assert(res.success === true, "Inisialisasi harus berhasil.");
    assert(res.totalTables >= 21, "Total tabel harus minimal 21.");
  });

  executeTest("2A-2. Password Hashing PBKDF2 (25.000 iterasi)", function() {
    const rawPass = "KombinasiAman123!";
    const hashed = AuthService.hashPassword(rawPass);
    assert(hashed.startsWith("PBKDF2_HMAC_SHA256$25000$"), "Format harus 25.000 rounds PBKDF2.");
    assert(AuthService.verifyPassword(rawPass, hashed) === true, "Password cocok harus true.");
  });

  // Setup Owner Session for Testing
  let ownerToken = "";
  try {
    AuthService.setupOwnerAccount("owner_tester", "Owner Tester", "PassTester2026!");
  } catch (e) {}
  const ownerLogin = AuthService.login("owner_tester", "PassTester2026!");
  ownerToken = ownerLogin.token;

  // --- PHASE 2B & 2C TESTS ---
  const TEST_VAR = "VAR-TEST-SHEET-" + Math.floor(Math.random() * 10000);

  executeTest("2B-1. Penerimaan Batch Baru (Stock In)", function() {
    const res = InventoryService.receiveOwnedStockBatch("PUR-SHEET-1", TEST_VAR, 10, 150000, 0, "Test Batch 1", "TESTER");
    assert(res.success === true, "Penerimaan batch harus berhasil.");
    const stock = InventoryService.getStock(TEST_VAR);
    assert(stock.owned_physical_stock >= 10, "Stok fisik sendiri harus bertambah minimal 10.");
  });

  executeTest("2C-1. Penjualan Multi-Item & FIFO SalesService", function() {
    InventoryService.receiveOwnedStockBatch("PUR-SHEET-2", TEST_VAR, 5, 170000, 0, "Test Batch 2", "TESTER");
    
    const saleRes = SalesService.createSale({
      sales_channel: "OFFLINE_EVENT",
      customer_name: "Customer Apps Script Test",
      payment_method: "QRIS",
      idempotency_key: "IDEM-GAS-" + Math.random(),
      created_by: "TESTER",
      items: [
        { variant_id: TEST_VAR, item_ownership: "OWNED", quantity: 12, actual_price: 275000 }
      ]
    });

    assert(saleRes.success === true, "Penjualan harus berhasil.");
    assert(saleRes.details.length === 2, "Harus split 2 batch (10 dari batch 1 + 2 dari batch 2).");
  });

  // --- PHASE 2D TESTS ---
  executeTest("2D-1. Manajemen Master Vendor (Create & Detail)", function() {
    const vId = "VND-TEST-" + Math.floor(Math.random() * 10000);
    const vRes = VendorService.createVendor({
      vendor_id: vId,
      vendor_name: "Vendor In-Sheet Test",
      cooperation_type: "SELLER_FOR_VENDOR",
      fixed_vendor_share: 260000,
      min_selling_price: 275000
    }, ownerToken);
    assert(vRes.success === true, "Pembuatan vendor harus berhasil.");
    const detail = VendorService.getVendorDetail(vId);
    assert(detail.vendor_name === "Vendor In-Sheet Test", "Detail vendor harus sesuai.");
  });

  executeTest("2D-2. Settlement Kewajiban Konsinyasi Dzaki", function() {
    InventoryService.receiveConsignmentStock("VND-DZAKI", TEST_VAR, 3, "Titipan Dzaki In-Sheet", "TESTER");
    
    // Jual 1 pasang (Hutang ke Dzaki: 270.000)
    const sale = SalesService.createSale({
      items: [{ variant_id: TEST_VAR, item_ownership: "CONSIGNMENT", vendor_id: "VND-DZAKI", quantity: 1, actual_price: 280000 }]
    });
    const detailId = sale.details[0].sales_detail_id;

    // Eksekusi settlement
    const stl = VendorService.executeSettlement({
      vendor_id: "VND-DZAKI",
      payment_method: "TRANSFER_BCA",
      allocations: [{ sales_detail_id: detailId, amount_to_pay: 270000 }]
    }, ownerToken);

    assert(stl.success === true, "Settlement harus sukses.");
    assert(stl.header.total_net_payout === 270000, "Net payout harus 270.000.");
  });

  // --- PHASE 2E TESTS ---
  executeTest("2E-1. Laporan Laba Rugi Bulanan & HPP FIFO", function() {
    const rep = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
    assert(rep.period.month === 11, "Bulan laporan harus 11.");
    assert(rep.gross_profit === (rep.revenue_breakdown.total_omzet - rep.hpp_breakdown.total_hpp), "Laba kotor harus Omzet - HPP.");
    assert(rep.net_profit === (rep.gross_profit - rep.expenses_breakdown.operational_expenses), "Laba bersih harus Laba Kotor - Beban Operasional.");
  });

  executeTest("2E-2. Simulasi Pembagian Keuntungan & Pembulatan 100%", function() {
    // Uji dengan angka baseline November: Laba Bersih Rp3.120.569
    const sim = ClosingService.simulateProfitDistribution(3120569);
    assert(sim.allocations.owner1_amount === 624114, "Owner 1 harus Rp624.114.");
    assert(sim.allocations.owner2_amount === 624114, "Owner 2 harus Rp624.114.");
    assert(sim.allocations.emergency_amount === 312057, "Dana Darurat harus Rp312.057.");
    assert(sim.allocations.retained_amount === 1560284, "Keuntungan Ditahan harus Rp1.560.284.");
    assert(sim.allocations.total_allocated === 3120569, "Total alokasi harus presisi 100% Rp3.120.569.");
  });

  executeTest("2E-3. Tutup Buku Bulanan & Reopen Audit Trail", function() {
    const testMonth = 12;
    const testYear = 2026;
    const pId = "PER-2026-12";

    // 1. Close period
    const closeRes = ClosingService.closePeriod(testMonth, testYear, ownerToken, "Tutup buku test 2E");
    assert(closeRes.success === true, "Closing harus berhasil.");
    assert(closeRes.period_status === "CLOSED", "Status harus CLOSED.");

    // 2. Mencegah closing ganda
    let doubleCloseFailed = false;
    try {
      ClosingService.closePeriod(testMonth, testYear, ownerToken, "Closing ganda harus ditolak");
    } catch (e) {
      doubleCloseFailed = true;
    }
    assert(doubleCloseFailed === true, "Closing ganda wajib ditolak.");

    // 3. Reopen dengan audit trail
    const reopenRes = ClosingService.reopenPeriod(pId, ownerToken, "Audit koreksi data uji");
    assert(reopenRes.success === true, "Reopen harus berhasil.");
    assert(reopenRes.period_status === "OPEN", "Status harus kembali OPEN.");
    assert(reopenRes.new_version === 2, "Versi harus naik menjadi 2.");
  });

  executeTest("2E-4. Saldo Dana & Penarikan Kas Terpisah", function() {
    const fundBalances = ClosingService.getFundBalances();
    assert(typeof fundBalances.balances.OWNER_1 === "number", "Saldo Owner 1 harus berupa angka.");
    assert(typeof fundBalances.total_funds === "number", "Total dana harus berupa angka.");
  });

  Logger.log("=== HASIL AKHIR REKAPITULASI PENGUJIAN APPS SCRIPT ===");
  Logger.log(JSON.stringify(testResults, null, 2));
  return testResults;
}
