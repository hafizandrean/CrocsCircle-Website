# LAPORAN AUDIT TAMBAHAN: STRUKTUR STOK KONSINYASI & MULTI-VENDOR
**Phase 3B Supplementary Consignment Lot Audit — CrocsCircle.ID**

- **Tanggal Audit:** 17 November 2026
- **Status Audit:** SELESAI (Temuan & Celah Arsitektural Terdokumentasi Lengkap)
- **Test File Audit:** [`tests/test_supplementary_consignment.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/tests/test_supplementary_consignment.js)
- **Total Regression Test:** **113 / 113 PASS (Phase 2A – 3B Final)**

---

## 1. AUDIT STRUKTUR PENYIMPANAN KONSINYASI SAAT INI

Berdasarkan penelusuran kode sumber pada [`InventoryService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/InventoryService.gs), [`SalesService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/SalesService.gs), [`ProductService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/ProductService.gs), dan [`database/schema.json`](file:///d:/Documents/GitHub/CrocsCircle-Website/database/schema.json), berikut adalah jawaban eksplisit atas 7 pertanyaan kunci arsitektur:

### 1. Apakah `consignment_physical_stock` hanya ringkasan stok atau sumber data utama?
**JAWABAN:** **Sumber data utama sekaligus ringkasan.**  
Saat ini, tabel `STOK` hanya menyediakan satu kolom agregat per varian: `consignment_physical_stock`. Ketika penerimaan konsinyasi dilakukan, kuantitas langsung ditambahkan ke kolom tersebut. Tidak ada tabel sub-ledger khusus untuk saldo stok per vendor.

### 2. Apakah setiap penerimaan konsinyasi mempunyai batch/lot ID unik?
**JAWABAN:** **TIDAK memiliki entity Batch ID tersendiri di tabel persediaan.**  
Penerimaan konsinyasi hanya menghasilkan satu nomor mutasi di tabel `MUTASI_STOK` (contoh: `MOV-20261117-151132-123`). Tidak ada baris yang dicatat di tabel `DETAIL_PEMBELIAN` karena `DETAIL_PEMBELIAN` sejak Phase 2A dirancang khusus untuk pembelian stok milik sendiri (`OWNED`) yang memiliki harga beli (`unit_cost`).

### 3. Apakah setiap batch menyimpan `vendor_id`?
**JAWABAN:** **Hanya tersimpan di log mutasi dan transaksi penjualan, bukan di tabel batch persediaan.**  
- Saat penerimaan: `vendor_id` disimpan pada kolom `MUTASI_STOK.reference_id`.
- Saat penjualan: `vendor_id` disimpan pada kolom `DETAIL_PENJUALAN.vendor_id`.
- Namun, **tidak ada tabel batch persediaan konsinyasi** yang mengaitkan sisa unit fisik dengan `vendor_id`.

### 4. Apakah setiap batch menyimpan tanggal penerimaan dan referensi transaksi?
**JAWABAN:** Ya, informasi tanggal dan referensi penerimaan tersimpan di tabel `MUTASI_STOK` (`movement_date`, `reference_type = "CONSIGNMENT_IN"`, `reference_id = vendor_id`). Namun sifatnya adalah *historical log* (append-only), bukan tabel saldo berjalan.

### 5. Apakah kuantitas awal dan `remaining_qty` dapat dilacak per lot konsinyasi?
**JAWABAN:** **BELUM DAPAT DILACAK SECARA NATIVE.**  
Kuantitas awal tercatat pada baris `MUTASI_STOK.quantity`. Namun, kolom `remaining_qty` (sisa unit aktif per penerimaan) **tidak ada** untuk barang konsinyasi. Seluruh kuantitas konsinyasi terakumulasi menjadi satu angka di `STOK.consignment_physical_stock`.

### 6. Apakah dua vendor dapat memiliki SKU yang sama tanpa mencampur stok?
**JAWABAN:** **BELUM TERPISAH DI LEVEL INVENTARIS FISIK.**  
Jika Dzaki menitipkan 3 unit dan Vendor B menitipkan 4 unit pada SKU yang sama, tabel `STOK.consignment_physical_stock` mencatat total **7 unit**. Sistem belum memisahkan saldo fisik Dzaki (3 pcs) dan Vendor B (4 pcs) di database inventaris.

### 7. Apakah penjualan dapat ditelusuri sampai batch dan vendor asal?
**JAWABAN:**  
- **Vendor asal:** **BISA DITELUSURI.** Saat kasir menjual barang konsinyasi, kasir wajib memilih `vendor_id`. Transaksi mencatat `vendor_id`, hak vendor, dan insentif CrocsCircle di `DETAIL_PENJUALAN`.
- **Batch/Lot penerimaan:** **BELUM BISA DITELUSURI KE LOT SPESIFIK.** Kolom `batch_id` di `DETAIL_PENJUALAN` saat ini hanya diisi string generik: `"CONSIGNMENT-" + vendorId`, bukan ID lot penerimaan fisik.

---

## 2. HASIL SIMULASI MULTI-VENDOR PADA SATU SKU (`CRC-AUDIT-MULTI-VENDOR`)

Pengujian simulasi dilakukan menggunakan file [`tests/test_supplementary_consignment.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/tests/test_supplementary_consignment.js):
- **SKU Uji:** `CRC-AUDIT-MULTI-VENDOR` (Harga Jual Katalog: Rp1.000.000)
- **Komposisi Awal:**
  - `OWN_STOCK` (Stok Sendiri): 5 pcs @ Rp600.000 modal.
  - `VENDOR_CONSIGNMENT` Dzaki (`VND-DZAKI`): 3 pcs (Perjanjian: Hak tetap Rp270.000).
  - `VENDOR_CONSIGNMENT` Vendor B (`VND-VENDOR-B`): 4 pcs (Perjanjian: Komisi CrocsCircle 10%, Hak Vendor 90%).
- **Kondisi Tabel `STOK`:**
  - `owned_physical_stock`: **5 pcs**
  - `consignment_physical_stock`: **7 pcs** (gabungan 3 pcs Dzaki + 4 pcs Vendor B)
  - `total_available_stock`: **12 pcs**

### Hasil Uji Transaksi Penjualan:
1. **Penjualan 1 pcs Dzaki (@ Rp300.000):**
   - Mengurangi `consignment_physical_stock` dari 7 menjadi 6 pcs.
   - Stok `OWNED` tetap 5 pcs.
   - HPP CrocsCircle = **Rp0**.
   - Hak Dzaki = **Rp270.000** (Kewajiban vendor tercatat di `DETAIL_PENJUALAN`).
   - Insentif CrocsCircle = **Rp30.000**.
2. **Penjualan 1 pcs Vendor B (@ Rp1.000.000):**
   - Mengurangi `consignment_physical_stock` dari 6 menjadi 5 pcs.
   - Stok `OWNED` tetap 5 pcs.
   - HPP CrocsCircle = **Rp0**.
   - Hak Vendor B (90%) = **Rp900.000**.
   - Komisi CrocsCircle (10%) = **Rp100.000**.
3. **Penjualan 1 pcs `OWN_STOCK` (@ Rp1.000.000):**
   - Mengurangi `owned_physical_stock` dari 5 menjadi 4 pcs.
   - Mengambil unit dari batch FIFO `PURD-20261117-151156-151`.
   - HPP FIFO CrocsCircle = **Rp600.000**.
   - Hak vendor = **Rp0**.

---

## 3. TEMUAN KRITIS: CELAH OVERSELLING KONSINYASI PER VENDOR

Simulasi langkah ke-9 pada pengujian audit mengungkap **celah logis nyata**:
- **Skenario:**
  - Dzaki awalnya hanya menitipkan **3 pcs**.
  - Transaksi pertama sudah menjual **1 pcs** milik Dzaki.
  - Sisa titipan aktual Dzaki seharusnya tinggal **2 pcs**.
  - Namun di rak gudang, masih ada 4 pcs milik Vendor B, sehingga `consignment_available_stock` bernilai **5 pcs**.
  - Kasir kemudian mencoba menjual **3 pcs lagi** atas nama Dzaki (`vendor_id = VND-DZAKI`).
- **Hasil Eksekusi:**
  - **SISTEM MENGIZINKAN PENJUALAN TERSEBUT (LOLOS VALIDASI)!**
  - Karena sistem hanya mengecek apakah `currentStock.consignment_available_stock >= 3` (di mana $5 \ge 3$), sistem memotong stok konsinyasi menjadi tersisa 2 pcs.
- **Dampak Bisnis Celah Ini:**
  1. Dzaki tercatat menjual total **4 pcs** (padahal Dzaki hanya pernah menitipkan 3 pcs).
  2. CrocsCircle mencatat utang kewajiban Rp270.000 $\times$ 4 = Rp1.080.000 kepada Dzaki (lebih bayar 1 unit hak vendor).
  3. Barang milik Vendor B terpotong secara fisik dan diakui secara keliru sebagai penjualan Dzaki.

> [!WARNING]
> **Penyebab Utama Celah:** Validasi ketersediaan stok konsinyasi pada [`InventoryService.depleteConsignmentStock`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/InventoryService.gs) baris 349 saat ini hanya mengecek saldo konsinyasi global pada varian, **bukan saldo sisa titipan per vendor**.

---

## 4. HASIL AUDIT RETUR PENJUALAN KONSINYASI

Diuji retur 1 pcs atas transaksi penjualan barang Dzaki:
1. **Identifikasi Vendor:** Baris retur pada [`SalesService.returnSaleItem`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/SalesService.gs) berhasil mengidentifikasi `vendor_id = "VND-DZAKI"` dari `DETAIL_PENJUALAN`.
2. **Pembalikan Keuangan:**
   - Kewajiban pembayaran ke Dzaki dibatalkan / dikoreksi sebesar Rp270.000.
   - Jika pembayaran settlement sudah terlanjur disetor ke Dzaki, sistem otomatis menerbitkan klaim pengembalian dana di tabel `KLAIM_VENDOR` (teruji sejak Phase 2D).
3. **Pembalikan Stok Fisik:**
   - Kuantitas stok konsinyasi di `STOK.consignment_physical_stock` bertambah kembali (+1 pcs).
   - Tercatat mutasi `RETURN_IN` di `MUTASI_STOK`.
4. **Batasan:** Stok yang dikembalikan masuk ke saldo global `consignment_physical_stock`, bukan ke lot penerimaan spesifik.

---

## 5. MEKANISME PEMILIHAN SUMBER STOK PADA PENJUALAN

Berdasarkan arsitektur backend yang aktif saat ini:
1. **Kasir Menentukan Kepemilikan Secara Eksplisit:**
   - Pada saat kasir memasukkan item ke keranjang belanja, kasir wajib menentukan `item_ownership`:
     - Opsi A: `OWNED` (Barang Milik Toko) $\rightarrow$ sistem memotong batch FIFO di `DETAIL_PEMBELIAN`.
     - Opsi B: `CONSIGNMENT` (Barang Titipan Vendor) $\rightarrow$ kasir wajib memilih `vendor_id` (misal: Dzaki atau Vendor B).
2. **Tidak Ada Pengurangan Acak Antara Toko vs Konsinyasi:**
   - Sistem **tidak pernah** secara otomatis mengubah barang titipan vendor menjadi stok toko, atau sebaliknya.
3. **Kelemahan Saat Ini Antar-Vendor:**
   - Jika kasir memilih `CONSIGNMENT` dengan vendor Dzaki, sistem memotong stok konsinyasi secara umum tanpa membatasi kuantitas yang tersisa milik Dzaki secara spesifik.

---

## 6. STATUS DATA PENGUJIAN BROWSER (`PRD-LIVE-TEST` & `CRC-STOMP-CK-W8`)

- **Verifikasi Lingkungan:**
  Data produk `PRD-LIVE-TEST`, SKU `CRC-STOMP-CK-W8`, serta penerimaan 4 unit stok sendiri dan 3 unit konsinyasi **hanya dibuat di dalam memori runtime Node.js server lokal (`server.js`)**.
- **Integritas Database:**
  Data pengujian browser tersebut **tidak pernah menyentuh Google Sheets produksi** karena integrasi Google Workspace baru akan dieksekusi pada Phase 4.
- **Kondisi Database Uji:**
  Database in-memory lokal dapat di-reset kapan saja dengan me-restart proses `server.js`.

---

## 7. REKOMENDASI SOLUSI UNTUK PHASE 3C

Untuk menutup celah overselling antar-vendor konsinyasi tanpa membongkar 24 tabel skema database yang sudah ada:

### Solusi Rekomendasi: *Sub-Ledger Virtual Per Vendor*
Tanpa perlu membuat tabel baru, kita dapat menambahkan fungsi validasi saldo per vendor di [`InventoryService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/InventoryService.gs):
$$\text{Available Stock Vendor } V = \sum \text{Penerimaan } (V) - \sum \text{Penjualan } (V) + \sum \text{Retur } (V)$$
- Sebelum `depleteConsignmentStock` menyetujui penjualan konsinyasi untuk Vendor $V$, sistem menghitung sisa unit milik Vendor $V$.
- Jika sisa unit Vendor $V < \text{qtyNeeded}$, sistem akan menolak transaksi dengan pesan:
  *"Stok konsinyasi untuk vendor [Nama Vendor] tidak mencukupi (Tersisa X unit, diminta Y unit)."*

Solusi ini dapat diterapkan secara bersih pada Phase 3C (saat modul Kasir Penjualan dibangun).

---

## 8. REKAPITULASI REGRESSION TEST (113/113 PASS)

Seluruh test suite dari Phase 2A hingga Phase 3B tetap lulus 100%:
- `test_phase_2a.js`: **8 / 8 PASS**
- `test_phase_2b.js`: **10 / 10 PASS**
- `test_phase_2c.js`: **10 / 10 PASS**
- `test_phase_2d.js`: **16 / 16 PASS**
- `test_phase_2e.js`: **22 / 22 PASS**
- `test_final_review_2e.js`: **10 / 10 PASS**
- `test_phase_3a.js`: **12 / 12 PASS**
- `test_phase_3b.js`: **12 / 12 PASS**
- `test_final_review_3b.js`: **13 / 13 PASS**
- **TOTAL: 113 / 113 (100% HIJAU)**

---

## 9. STATUS PEKERJAAN

Sesuai instruksi:
- **Phase 3C (Sales, Pre-Order & Vendor Management UI) BELUM dimulai.**
- Tidak ada data produksi yang dihapus.
- Sistem saat ini berhenti dan menunggu evaluasi serta arahan persetujuan Anda mengenai hasil audit struktur konsinyasi ini.
