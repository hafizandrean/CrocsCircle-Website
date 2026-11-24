/**
 * CROCSCIRCLE.ID — SCRIPT AUDIT & DRY RUN MIGRASI DATA EXCEL
 * Menganalisis seluruh dataset dari file CROCSCIRCLE.ID(2).xlsx
 * Melakukan deduplikasi, pemisahan akun, validasi FIFO, dan rekonsiliasi.
 */

const fs = require('fs');
const path = require('path');

// 1. DATASET STOK
const rawStok = [
  { no: 1, tglMasuk: "", jenis: "Collab", nama: "Mcqueen", warna: "Merah", size: "M8/W10 (41-42)", modal: 220000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 2, tglMasuk: "", jenis: "Geo", nama: "Geo", warna: "Hitam", size: "M9/W11 (42-43)", modal: 140000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 3, tglMasuk: "", jenis: "Collab", nama: "Yoda", warna: "Pink", size: "M8/W10 (41-42)", modal: 230000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 4, tglMasuk: "", jenis: "Collab", nama: "NBA", warna: "Hitam", size: "M9/W11 (42-43)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 5, tglMasuk: "", jenis: "Collab", nama: "Loopy", warna: "Pink", size: "M5/W7 (37-38)", modal: 210000, status: "Sold Out", tglKeluar: "2026-01-11", punya: "CrocsCircle" },
  { no: 6, tglMasuk: "", jenis: "Collab", nama: "Bape", warna: "Hitam", size: "M8/W10 (41-42)", modal: 230000, status: "Sold Out", tglKeluar: "2026-08-11", punya: "CrocsCircle" },
  { no: 7, tglMasuk: "", jenis: "Classic", nama: "Classic", warna: "Hitam", size: "", modal: 120000, status: "Sold Out", tglKeluar: "28/10/2026", punya: "CrocsCircle" },
  { no: 8, tglMasuk: "", jenis: "Classic", nama: "Classic", warna: "Pink", size: "M6/W8 (38-39)", modal: 120000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 9, tglMasuk: "", jenis: "Classic", nama: "Classic", warna: "Abu Terang", size: "M8/W10 (41-42)", modal: 120000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 10, tglMasuk: "", jenis: "Classic", nama: "Classic", warna: "Coklat", size: "M5/W7 (37-38)", modal: 120000, status: "Sold Out", tglKeluar: "2026-08-11", punya: "CrocsCircle" },
  { no: 11, tglMasuk: "", jenis: "Platform", nama: "Platform", warna: "Pink", size: "M4/W6 (36-37)", modal: 170000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 12, tglMasuk: "", jenis: "Platform", nama: "Platform", warna: "Pink", size: "M5/W7 (37-38)", modal: 170000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 13, tglMasuk: "", jenis: "Collab", nama: "Bape", warna: "Hitam", size: "M7/W9 (39-40)", modal: 230000, status: "Sold Out", tglKeluar: "2026-01-11", punya: "CrocsCircle" },
  { no: 14, tglMasuk: "", jenis: "Collab", nama: "Bape", warna: "Hijau", size: "", modal: 230000, status: "Sold Out", tglKeluar: "2026-01-11", punya: "CrocsCircle" },
  { no: 15, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Spiderman Neo", warna: "Merah", size: "M7/W9 (39-40)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 16, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Spiderman Neo", warna: "Hitam", size: "M10/W12 (43-44)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 17, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Spiderman Brand New Day", warna: "Merah", size: "M9/W11 (42-43)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 18, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Spiderman Brand New Day", warna: "Merah", size: "M7/W9 (39-40)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 19, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Bape", warna: "Hitam", size: "M10/W12 (43-44)", modal: 230000, status: "Sold Out", tglKeluar: "2026-08-11", punya: "CrocsCircle" },
  { no: 20, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Batman", warna: "Hitam", size: "M8/W10 (41-42)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 21, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Loopy", warna: "Pink", size: "M4/W6 (36-37)", modal: 210000, status: "Sold Out", tglKeluar: "2026-08-11", punya: "CrocsCircle" },
  { no: 22, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Loopy", warna: "Pink", size: "M4/W6 (36-37)", modal: 210000, status: "Sold Out", tglKeluar: "2026-08-11", punya: "CrocsCircle" },
  { no: 23, tglMasuk: "2026-07-11", jenis: "Collab", nama: "Mcqueen", warna: "Merah", size: "M6/W8 (38-39)", modal: 220000, status: "Sold Out", tglKeluar: "2026-08-11", punya: "CrocsCircle" },
  { no: 24, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Mcqueen", warna: "Merah", size: "M4/W6 (36-37)", modal: 220000, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 25, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Loopy", warna: "Pink", size: "M5/W7 (37-38)", modal: 210000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 26, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Loopy", warna: "Pink", size: "M4/W6 (36-37)", modal: 210000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 27, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Bape", warna: "Hitam", size: "M7/W9 (39-40)", modal: 240000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 28, tglMasuk: "14/11/2026", jenis: "Platform", nama: "Platform", warna: "Bone", size: "M6/W8 (38-39)", modal: 170000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  // Barang Titipan Dzaki (Vendor Consignment)
  { no: 29, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Batman", warna: "Hitam", size: "M9/W11 (42-43)", modal: 230000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "Jaki" },
  { no: 30, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Abu Terang", size: "M8/W10 (41-42)", modal: 120000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "Jaki" },
  { no: 31, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Putih", size: "M7/W9 (39-40)", modal: 120000, status: "In Stock", tglKeluar: "", punya: "Jaki" },
  { no: 32, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Bape", warna: "Biru", size: "M7/W9 (39-40)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "Jaki" },
  { no: 33, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Bape", warna: "Hitam", size: "M9/W11 (42-43)", modal: 240000, status: "In Stock", tglKeluar: "", punya: "Jaki" },
  { no: 34, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Mcqueen", warna: "Merah", size: "M8/W10 (41-42)", modal: 220000, status: "In Stock", tglKeluar: "", punya: "Jaki" },
  { no: 35, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Biru", size: "M7/W9 (39-40)", modal: 210000, status: "In Stock", tglKeluar: "", punya: "Jaki" },
  { no: 36, tglMasuk: "14/11/2026", jenis: "Collab", nama: "Bape", warna: "Hitam", size: "M8/W10 (41-42)", modal: 240000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "Jaki" },
  { no: 37, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Pink", size: "M5/W7 (37-38)", modal: 120000, status: "Sold Out", tglKeluar: "15/11/2026", punya: "Jaki" },
  // Pembelian Batch 7 Pasang Crocs Classic (@ 82.857)
  { no: 38, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Abu-abu", size: "M6/W8 (38-39)", modal: 82857, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 39, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Abu-abu", size: "M7/W9 (39-40)", modal: 82857, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 40, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Hitam", size: "M6/W8 (38-39)", modal: 82857, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 41, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Navy", size: "M7/W9 (39-40)", modal: 82857, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 42, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Hitam", size: "M8/W10 (41-42)", modal: 82857, status: "Sold Out", tglKeluar: "15/11/2026", punya: "CrocsCircle" },
  { no: 43, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Putih", size: "M9/W11 (42-43)", modal: 82857, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" },
  { no: 44, tglMasuk: "14/11/2026", jenis: "Classic", nama: "Classic", warna: "Putih", size: "M9/W11 (42-43)", modal: 82857, status: "In Stock", tglKeluar: "", punya: "CrocsCircle" }
];

console.log("=== ANALISIS SHEET STOK ===");
console.log("Total baris stok:", rawStok.length);
const owned = rawStok.filter(s => s.punya === "CrocsCircle");
const jaki = rawStok.filter(s => s.punya === "Jaki");
console.log("Milik CrocsCircle:", owned.length, "(In Stock:", owned.filter(s => s.status === "In Stock").length, ", Sold Out:", owned.filter(s => s.status === "Sold Out").length, ")");
console.log("Milik Vendor Jaki:", jaki.length, "(In Stock:", jaki.filter(s => s.status === "In Stock").length, ", Sold Out:", jaki.filter(s => s.status === "Sold Out").length, ")");

// Total modal stok tersisa di tangan
const inStockOwned = owned.filter(s => s.status === "In Stock");
const totalModalInStockOwned = inStockOwned.reduce((acc, c) => acc + c.modal, 0);
console.log("Total Nilai Modal Persediaan Fisik Milik Sendiri (In Stock): Rp", totalModalInStockOwned.toLocaleString('id-ID'));

// 2. DATASET CRM - PRE ORDER
const rawPO = [
  // Batch 1
  { batch: "Batch 1", no: 1, nama: "Adat", noWa: "", tgl: "28 Oktober 2026", produk: "Crocs Classic", warna: "Hitam", size: "M8", gbits: 0, harga: 280000, bayar: 280000, statusMinat: "Minat", statusBayar: "BAYAR FULL", sisa: 0, jenis: "Qris", statusTF: true, pj: "Harits" },
  { batch: "Batch 1", no: 2, nama: "Adat", noWa: "", tgl: "28 Oktober 2026", produk: "Gbits", warna: "-", size: "-", gbits: 5, harga: 10000, bayar: 10000, statusMinat: "Minat", statusBayar: "BAYAR FULL", sisa: 0, jenis: "Qris", statusTF: true, pj: "Harits" },
  { batch: "Batch 1", no: 3, nama: "Ica", noWa: "", tgl: "2026-11-01", produk: "Crocs Bape", warna: "Hijau", size: "W6", gbits: 0, harga: 390000, bayar: 390000, statusMinat: "Minat", statusBayar: "BAYAR FULL", sisa: 0, jenis: "Qris", statusTF: true, pj: "Hafiz" },
  { batch: "Batch 1", no: 4, nama: "Daniandra", noWa: "", tgl: "2026-11-01", produk: "Crocs Bape", warna: "Hitam", size: "M8", gbits: 0, harga: 390000, bayar: 0, statusMinat: "Minat", statusBayar: "Belum Bayar", sisa: 390000, jenis: "Belum Bayar", statusTF: false, pj: "Hafiz" },

  // Batch 2
  { batch: "Batch 2", no: 1, nama: "bu desi", noWa: "08562027827", tgl: "2026-11-03", produk: "Crocs Bape", warna: "Hitam", size: "M10", gbits: 0, harga: 380000, bayar: 380000, statusMinat: "Minat", statusBayar: "BAYAR FULL", sisa: 0, jenis: "Qris", statusTF: true, pj: "Harits" },
  { batch: "Batch 2", no: 2, nama: "Bu Ira", noWa: "081779149831", tgl: "2026-11-03", produk: "Crocs Classic", warna: "Taupe", size: "M8", gbits: 0, harga: 280000, bayar: 140000, statusMinat: "Minat", statusBayar: "DP 50%", sisa: 140000, jenis: "Qris", statusTF: true, pj: "Hafiz" },
  { batch: "Batch 2", no: 3, nama: "cintya", noWa: "081384401791", tgl: "", produk: "snoopy", warna: "-", size: "-", gbits: 0, harga: 380000, bayar: 0, statusMinat: "Tidak Respon", statusBayar: "", sisa: 380000, jenis: "", statusTF: false, pj: "Harits" },
  { batch: "Batch 2", no: 4, nama: "Johanes", noWa: "081330267436", tgl: "", produk: "bape", warna: "hitam", size: "m7", gbits: 0, harga: 380000, bayar: 0, statusMinat: "Tidak Respon", statusBayar: "", sisa: 380000, jenis: "", statusTF: false, pj: "Harits" },
  { batch: "Batch 2", no: 5, nama: "bu novia", noWa: "082117861510", tgl: "", produk: "", warna: "", size: "", gbits: 0, harga: 0, bayar: 0, statusMinat: "Belum Chat", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "Harits" },
  { batch: "Batch 2", no: 6, nama: "bu indah", noWa: "08986835898", tgl: "", produk: "", warna: "", size: "", gbits: 0, harga: 0, bayar: 0, statusMinat: "Belum Chat", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "Harits" },
  { batch: "Batch 2", no: 7, nama: "bu amel", noWa: "089673919367", tgl: "", produk: "", warna: "", size: "", gbits: 0, harga: 0, bayar: 0, statusMinat: "Belum Chat", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "Harits" },
  { batch: "Batch 2", no: 8, nama: "ka lintang", noWa: "085284682454", tgl: "", produk: "", warna: "", size: "", gbits: 0, harga: 0, bayar: 0, statusMinat: "Belum Chat", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "Harits" },
  { batch: "Batch 2", no: 9, nama: "ka arinda", noWa: "083824094599", tgl: "", produk: "platform", warna: "putih", size: "w6", gbits: 0, harga: 350000, bayar: 0, statusMinat: "Tidak Respon", statusBayar: "", sisa: 350000, jenis: "", statusTF: false, pj: "Harits" },

  // Batch 3
  { batch: "Batch 3", no: 1, nama: "ka hasbi", noWa: "081383120858", tgl: "2026-10-11", produk: "crocs classic", warna: "hitam", size: "M8", gbits: 0, harga: 280000, bayar: 140000, statusMinat: "Minat", statusBayar: "BAYAR FULL (Data Tertulis DP 140k)", sisa: 140000, jenis: "Qris", statusTF: true, pj: "Harits" },
  { batch: "Batch 3", no: 2, nama: "bu ii", noWa: "085722072270", tgl: "2026-10-11", produk: "platform", warna: "bone", size: "W7", gbits: 0, harga: 350000, bayar: 175000, statusMinat: "Minat", statusBayar: "DP 50%", sisa: 175000, jenis: "Qris", statusTF: true, pj: "Harits" },
  { batch: "Batch 3", no: 3, nama: "ka as'ad", noWa: "089508053495", tgl: "2026-10-11", produk: "mcqueen", warna: "merah", size: "M4", gbits: 0, harga: 380000, bayar: 0, statusMinat: "", statusBayar: "", sisa: 380000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 3", no: 4, nama: "Pak rahmat", noWa: "08975582437", tgl: "2026-10-11", produk: "classic", warna: "hitam", size: "M7", gbits: 0, harga: 280000, bayar: 0, statusMinat: "", statusBayar: "", sisa: 280000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 3", no: 5, nama: "pak asep", noWa: "081224115829", tgl: "2026-10-11", produk: "spiderman neo", warna: "merah", size: "M4", gbits: 0, harga: 450000, bayar: 0, statusMinat: "Bingung", statusBayar: "", sisa: 450000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 3", no: 6, nama: "ka nanda", noWa: "081380073229", tgl: "2026-10-11", produk: "spiderman neo", warna: "merah", size: "M8", gbits: 0, harga: 450000, bayar: 0, statusMinat: "", statusBayar: "", sisa: 450000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 3", no: 7, nama: "ka nanda", noWa: "081380073229", tgl: "2026-10-11", produk: "spiderman neo", warna: "merah", size: "M5", gbits: 0, harga: 450000, bayar: 0, statusMinat: "", statusBayar: "", sisa: 450000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 3", no: 8, nama: "ka fahira", noWa: "081990057820", tgl: "2026-10-11", produk: "model cewe", warna: "-", size: "W9", gbits: 0, harga: 0, bayar: 0, statusMinat: "Bingung", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 3", no: 9, nama: "bu vidi", noWa: "081910107062", tgl: "2026-10-11", produk: "model cewe", warna: "-", size: "-", gbits: 0, harga: 0, bayar: 0, statusMinat: "Bingung", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "" },

  // Batch 4
  { batch: "Batch 4", no: 1, nama: "Ka rida", noWa: "081936305633", tgl: "15/11/2026", produk: "Platform", warna: "bone", size: "W7", gbits: 0, harga: 350000, bayar: 350000, statusMinat: "Minat", statusBayar: "BAYAR FULL", sisa: 0, jenis: "Qris", statusTF: true, pj: "Harits" },
  { batch: "Batch 4", no: 2, nama: "bu vonti", noWa: "085778457833", tgl: "15/11/2026", produk: "-", warna: "-", size: "-", gbits: 0, harga: 0, bayar: 0, statusMinat: "", statusBayar: "", sisa: 0, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 4", no: 3, nama: "Kani (cina)", noWa: "085284369671", tgl: "15/11/2026", produk: "Spiderman BND", warna: "merah", size: "W7", gbits: 0, harga: 410000, bayar: 0, statusMinat: "Minat", statusBayar: "Belum Bayar", sisa: 410000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 4", no: 4, nama: "ibu koko", noWa: "081394650320", tgl: "15/11/2026", produk: "Mcqueen (2 pasang: M7 & M3)", warna: "Merah", size: "M7 & M3", gbits: 0, harga: 760000, bayar: 700000, statusMinat: "Minat", statusBayar: "DP Tapi ga 50%", sisa: 60000, jenis: "Qris", statusTF: false, pj: "" },
  { batch: "Batch 4", no: 5, nama: "bu imey", noWa: "081299007799", tgl: "15/11/2026", produk: "classic", warna: "hitam/hiijau tua", size: "M7", gbits: 0, harga: 270000, bayar: 0, statusMinat: "Minat", statusBayar: "Belum Bayar", sisa: 270000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 4", no: 6, nama: "bu imey", noWa: "081299007799", tgl: "15/11/2026", produk: "classic", warna: "bone", size: "M4", gbits: 0, harga: 270000, bayar: 0, statusMinat: "Minat", statusBayar: "Belum Bayar", sisa: 270000, jenis: "", statusTF: false, pj: "" },
  { batch: "Batch 4", no: 7, nama: "ka ozi", noWa: "-", tgl: "15/11/2026", produk: "spiderman neo", warna: "hitam", size: "M9", gbits: 0, harga: 450000, bayar: 240000, statusMinat: "Minat", statusBayar: "DP 50%", sisa: 210000, jenis: "", statusTF: false, pj: "" }
];

console.log("\n=== ANALISIS SHEET CRM - PRE ORDER ===");
console.log("Total baris prospek & PO:", rawPO.length);
const paidOrDp = rawPO.filter(p => p.bayar > 0);
console.log("Baris dengan pembayaran aktual (DP / Full):", paidOrDp.length);
paidOrDp.forEach(p => {
  console.log(`  - [${p.batch}] ${p.nama} (${p.produk}): Harga Rp${p.harga.toLocaleString('id-ID')} | Bayar: Rp${p.bayar.toLocaleString('id-ID')} | Status: ${p.statusBayar}`);
});

const totalUangMasukPO = paidOrDp.reduce((acc, c) => acc + c.bayar, 0);
console.log("Total uang masuk tercatat di sheet PO: Rp", totalUangMasukPO.toLocaleString('id-ID'));

// 3. DATASET PEMASUKAN KESELURUHAN & SHEET NGEBALANCE IN
const rawPemasukan = [
  { nama: "Uang Modal (Hafiz)", jenis: "-", tgl: "22 Oktober 2026", jumlah: 1500000, pj: "Langsung Rekening CrocsCircle", tf: true, sumber: "Dana Modal", kategori: "MODAL_PEMILIK" },
  { nama: "Uang Modal (Harits)", jenis: "-", tgl: "23 Oktober 2026", jumlah: 1500000, pj: "Langsung Rekening CrocsCircle", tf: true, sumber: "Dana Modal", kategori: "MODAL_PEMILIK" },
  { nama: "Adat", jenis: "Crocs Classic", tgl: "28 Oktober 2026", jumlah: 280000, pj: "Qris", tf: true, sumber: "Pre Order Batch 1", kategori: "OMZET_PO_LUNAS" },
  { nama: "Adat", jenis: "Gbits", tgl: "28 Oktober 2026", jumlah: 10000, pj: "Qris", tf: true, sumber: "Pre Order Batch 1", kategori: "OMZET_PO_LUNAS" },
  { nama: "Bunga Bank Oktober", jenis: "-", tgl: "28 Oktober 2026", jumlah: 494, pj: "Langsung Rekening CrocsCircle", tf: true, sumber: "Pemasukan Tambahan", kategori: "PENDAPATAN_LAIN" },
  { nama: "Ica", jenis: "Crocs Bape", tgl: "2026-11-01", jumlah: 390000, pj: "Qris", tf: true, sumber: "Pre Order Batch 1", kategori: "OMZET_PO_LUNAS" },
  { nama: "Daniandra", jenis: "Crocs Bape", tgl: "2026-11-01", jumlah: 380000, pj: "Qris", tf: true, sumber: "Pre Order Batch 1", kategori: "OMZET_PO_LUNAS" },
  { nama: "Penjualan Offline 2", jenis: "Crocs Loopy", tgl: "2026-11-01", jumlah: 380000, pj: "Cash Harits", tf: true, sumber: "Jualan Mingguan 2", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline -Gbits", jenis: "Gbits", tgl: "2026-11-01", jumlah: 20000, pj: "Cash Harits", tf: true, sumber: "Jualan Mingguan 2", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline -Gbits", jenis: "Gbits", tgl: "2026-11-01", jumlah: 20000, pj: "Cash Hafiz", tf: true, sumber: "Jualan Mingguan 2", kategori: "OMZET_OFFLINE" },
  { nama: "DP - bu desi", jenis: "Crocs Bape", tgl: "2026-11-03", jumlah: 380000, pj: "Qris", tf: true, sumber: "Pre Order Batch 2", kategori: "OMZET_PO_LUNAS" },
  { nama: "DP - Bu Ira", jenis: "Crocs Classic", tgl: "2026-11-03", jumlah: 140000, pj: "Qris", tf: true, sumber: "Pre Order Batch 2", kategori: "PENERIMAAN_DP_PO" },
  { nama: "Penjualan Offline 3", jenis: "Crocs Loopy", tgl: "2026-11-08", jumlah: 380000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Crocs Loopy", tgl: "2026-11-08", jumlah: 380000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Crocs Mcqueen", tgl: "2026-11-08", jumlah: 380000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Crocs Bape", tgl: "2026-11-08", jumlah: 380000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Crocs Classic", tgl: "2026-11-08", jumlah: 280000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Gbits", tgl: "2026-11-08", jumlah: 20000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Gbits", tgl: "2026-11-08", jumlah: 20000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Gbits", tgl: "2026-11-08", jumlah: 20000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Gbits", tgl: "2026-11-08", jumlah: 20000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Gbits", tgl: "2026-11-08", jumlah: 20000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "Penjualan Offline 3", jenis: "Gbits", tgl: "2026-11-08", jumlah: 10000, pj: "Qris", tf: true, sumber: "Jualan Mingguan 3", kategori: "OMZET_OFFLINE" },
  { nama: "DP - ka hasbi", jenis: "Crocs Classic", tgl: "2026-11-10", jumlah: 140000, pj: "Qris", tf: true, sumber: "Pre Order November", kategori: "PENERIMAAN_DP_PO" },
  { nama: "DP - bu ii", jenis: "Crocs Platform", tgl: "2026-11-10", jumlah: 175000, pj: "Qris", tf: true, sumber: "Pre Order November", kategori: "PENERIMAAN_DP_PO" },
  { nama: "Gbits Ozan", jenis: "Gbits", tgl: "2026-11-13", jumlah: 40000, pj: "Qris", tf: true, sumber: "Pre Order November", kategori: "OMZET_PO_LUNAS" },
  { nama: "kelebihan uang dani", jenis: "-", tgl: "2026-11-14", jumlah: 10000, pj: "Qris", tf: true, sumber: "Pemasukan Tambahan", kategori: "PENDAPATAN_LAIN" }
];

console.log("\n=== ANALISIS PEMASUKAN KESELURUHAN ===");
const totalPemasukanSemua = rawPemasukan.reduce((acc, c) => acc + c.jumlah, 0);
console.log("Total Pemasukan Kas Tercatat: Rp", totalPemasukanSemua.toLocaleString('id-ID'));
const modal = rawPemasukan.filter(p => p.kategori === "MODAL_PEMILIK").reduce((acc, c) => acc + c.jumlah, 0);
const omzetOffline = rawPemasukan.filter(p => p.kategori === "OMZET_OFFLINE").reduce((acc, c) => acc + c.jumlah, 0);
const omzetPOLunas = rawPemasukan.filter(p => p.kategori === "OMZET_PO_LUNAS").reduce((acc, c) => acc + c.jumlah, 0);
const dpPO = rawPemasukan.filter(p => p.kategori === "PENERIMAAN_DP_PO").reduce((acc, c) => acc + c.jumlah, 0);
const pendapatanLain = rawPemasukan.filter(p => p.kategori === "PENDAPATAN_LAIN").reduce((acc, c) => acc + c.jumlah, 0);

console.log("  - Modal Pemilik (Bukan Omzet): Rp", modal.toLocaleString('id-ID'));
console.log("  - Omzet Offline Murni: Rp", omzetOffline.toLocaleString('id-ID'));
console.log("  - Omzet PO Lunas Murni: Rp", omzetPOLunas.toLocaleString('id-ID'));
console.log("  - Uang Muka / DP PO (Kewajiban / Kas Terikat): Rp", dpPO.toLocaleString('id-ID'));
console.log("  - Pendapatan Bunga / Lain-lain: Rp", pendapatanLain.toLocaleString('id-ID'));

// 4. DATASET PENGELUARAN KESELURUHAN & SHEET NGEBALANCE IN
const rawPengeluaran = [
  { nama: "Gbits 100pcs", tgl: "20 Oktober 2026", jumlah: 78568, pj: "Hafiz", sumber: "Barang Belanja", jenis: "PEMBELIAN_STOK" },
  { nama: "Ongkir Pemesanan 1", tgl: "21 Oktober 2026", jumlah: 50440, pj: "Harits", sumber: "Barang Belanja", jenis: "ONGKIR_KAPITALISASI_STOK" },
  { nama: "Crocs 10 Pasang Pemesanan 1", tgl: "23 Oktober 2026", jumlah: 1825000, pj: "Langsung Rekening CrocsCircle", sumber: "Barang Belanja", jenis: "PEMBELIAN_STOK" },
  { nama: "Bensin Mobil (Daniandra)", tgl: "25 Oktober 2026", jumlah: 50000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 1", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Tol (emoney Harits)", tgl: "25 Oktober 2026", jumlah: 11000, pj: "Harits", sumber: "Jualan Mingguan 1", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Pajak Bunga Bank Oktober", tgl: "28 Oktober 2026", jumlah: 98, pj: "Langsung Rekening CrocsCircle", sumber: "Pengeluaran Tambahan", jenis: "BEBAN_ADMIN_BANK" },
  { nama: "Bensin Mobil (Daniandra)", tgl: "2026-11-01", jumlah: 100000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 2", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Sewa Lapak", tgl: "2026-11-01", jumlah: 20000, pj: "Hafiz", sumber: "Jualan Mingguan 2", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Uang Kebersihan", tgl: "2026-11-01", jumlah: 15000, pj: "Hafiz", sumber: "Jualan Mingguan 2", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Uang Keamanan", tgl: "2026-11-01", jumlah: 5000, pj: "Hafiz", sumber: "Jualan Mingguan 2", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Tol (emoney Harits)", tgl: "2026-11-01", jumlah: 11000, pj: "Harits", sumber: "Jualan Mingguan 2", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Pemesanan 2 + ongkir", tgl: "2026-11-04", jumlah: 815000, pj: "Langsung Rekening CrocsCircle", sumber: "Barang Belanja", jenis: "PEMBELIAN_STOK" },
  { nama: "Meja + Payung", tgl: "2026-11-04", jumlah: 200000, pj: "Hafiz", sumber: "Pembelian Alat", jenis: "PEMBELIAN_ASET_PERLENGKAPAN" },
  { nama: "Crocs Spiderman 4 pasang Shopee", tgl: "2026-11-06", jumlah: 940530, pj: "Hafiz", sumber: "Pemesanan via vendor shopee", jenis: "PEMBELIAN_STOK" },
  { nama: "Print Banner", tgl: "2026-11-07", jumlah: 45000, pj: "Hafiz", sumber: "Operasional", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Ongkir Pemesanan Dzaki 3", tgl: "2026-11-07", jumlah: 34320, pj: "Langsung Rekening CrocsCircle", sumber: "Barang Belanja", jenis: "ONGKIR_KAPITALISASI_STOK" },
  { nama: "Kerugian ditipu vendor averocs", tgl: "2026-11-07", jumlah: 120000, pj: "Hafiz", sumber: "Kerugian", jenis: "BEBAN_KERUGIAN_PENIPUAN" },
  { nama: "Bensin Mobil (Daniandra)", tgl: "2026-11-08", jumlah: 100000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Sewa Lapak", tgl: "2026-11-08", jumlah: 20000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Uang Kebersihan", tgl: "2026-11-08", jumlah: 15000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Uang Keamanan", tgl: "2026-11-08", jumlah: 5000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Tol (emoney Harits)", tgl: "2026-11-08", jumlah: 11000, pj: "Harits", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Pemesanan Dzaki 3", tgl: "2026-11-13", jumlah: 900000, pj: "Langsung Rekening CrocsCircle", sumber: "Barang Belanja", jenis: "PEMBELIAN_STOK" },
  { nama: "Beli Gbits 200pcs", tgl: "2026-11-13", jumlah: 122494, pj: "Hafiz", sumber: "Barang Belanja", jenis: "PEMBELIAN_STOK" },
  { nama: "Beli Crocs Classic 7pasang", tgl: "2026-11-13", jumlah: 580000, pj: "Hafiz", sumber: "Barang Belanja", jenis: "PEMBELIAN_STOK" },
  { nama: "dana darurat dari hasil oktober", tgl: "2026-11-13", jumlah: 6960, pj: "Langsung Rekening CrocsCircle", sumber: "Alokasi Laba", jenis: "ALOKASI_DANA_DARURAT_INTERNAL" },
  { nama: "Ongkir Pemesanan Dzaki 4", tgl: "2025-11-14", jumlah: 30000, pj: "Langsung Rekening CrocsCircle", sumber: "Barang Belanja", jenis: "ONGKIR_KAPITALISASI_STOK" },
  { nama: "Bensin Mobil (Dani)", tgl: "2026-11-15", jumlah: 100000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Parttime (adenya harits)", tgl: "2026-11-15", jumlah: 50000, pj: "Langsung Rekening CrocsCircle", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "Tol (emoney Harits)", tgl: "2026-11-15", jumlah: 11000, pj: "Harits", sumber: "Jualan Mingguan 3", jenis: "BEBAN_OPERASIONAL" },
  { nama: "gaji oktober (hafiz)", tgl: "2026-11-16", jumlah: 21000, pj: "Langsung Rekening CrocsCircle", sumber: "Penarikan Owner", jenis: "PENARIKAN_LABA_OWNER" },
  { nama: "gaji oktober (harits)", tgl: "2026-11-16", jumlah: 21000, pj: "Langsung Rekening CrocsCircle", sumber: "Penarikan Owner", jenis: "PENARIKAN_LABA_OWNER" }
];

console.log("\n=== ANALISIS PENGELUARAN KESELURUHAN ===");
const totalPengeluaranSemua = rawPengeluaran.reduce((acc, c) => acc + c.jumlah, 0);
console.log("Total Pengeluaran Kas Tercatat: Rp", totalPengeluaranSemua.toLocaleString('id-ID'));
const pembelianStok = rawPengeluaran.filter(p => p.jenis === "PEMBELIAN_STOK").reduce((acc, c) => acc + c.jumlah, 0);
const ongkirStok = rawPengeluaran.filter(p => p.jenis === "ONGKIR_KAPITALISASI_STOK").reduce((acc, c) => acc + c.jumlah, 0);
const bebanOperasional = rawPengeluaran.filter(p => p.jenis === "BEBAN_OPERASIONAL").reduce((acc, c) => acc + c.jumlah, 0);
const bebanPenipuan = rawPengeluaran.filter(p => p.jenis === "BEBAN_KERUGIAN_PENIPUAN").reduce((acc, c) => acc + c.jumlah, 0);
const bebanBank = rawPengeluaran.filter(p => p.jenis === "BEBAN_ADMIN_BANK").reduce((acc, c) => acc + c.jumlah, 0);
const asetAlat = rawPengeluaran.filter(p => p.jenis === "PEMBELIAN_ASET_PERLENGKAPAN").reduce((acc, c) => acc + c.jumlah, 0);
const penarikanOwner = rawPengeluaran.filter(p => p.jenis === "PENARIKAN_LABA_OWNER").reduce((acc, c) => acc + c.jumlah, 0);
const danaDarurat = rawPengeluaran.filter(p => p.jenis === "ALOKASI_DANA_DARURAT_INTERNAL").reduce((acc, c) => acc + c.jumlah, 0);

console.log("  - Pembelian Persediaan Stok (Bukan Beban): Rp", pembelianStok.toLocaleString('id-ID'));
console.log("  - Ongkir Kapitalisasi Batch FIFO (Bukan Beban): Rp", ongkirStok.toLocaleString('id-ID'));
console.log("  - Pembelian Aset / Meja Payung (Bukan Beban Langsung): Rp", asetAlat.toLocaleString('id-ID'));
console.log("  - Beban Operasional Riil (Bensin, Sewa, Kebersihan, Keamanan, Banner, Tol, Parttime): Rp", bebanOperasional.toLocaleString('id-ID'));
console.log("  - Beban Kerugian Kasus Averocs: Rp", bebanPenipuan.toLocaleString('id-ID'));
console.log("  - Pajak / Admin Bank: Rp", bebanBank.toLocaleString('id-ID'));
console.log("  - Penarikan Laba Owner Oktober (Bukan Beban Operasional): Rp", penarikanOwner.toLocaleString('id-ID'));
console.log("  - Alokasi Internal Dana Darurat: Rp", danaDarurat.toLocaleString('id-ID'));


