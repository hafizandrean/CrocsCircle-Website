# PURCHASES UX & WORKFLOW REDESIGN PLAN
**CrocsCircle.ID — Halaman Pembelian Stok Supplier**
**Status:** Draft untuk Review Owner | **Tanggal:** 2026-11-20 | **Dibuat oleh:** Audit Internal

> ⚠️ **Dokumen ini adalah hasil audit dan rencana — tidak ada kode yang diubah.**
> Seluruh perubahan hanya dilaksanakan setelah Owner menyetujui rencana ini.

---

## 1. ALUR SAAT INI (AS-IS)

### 1.1 Struktur Halaman Sekarang

Halaman `purchases.html` terdiri dari **2 tab utama** dalam satu halaman panjang:

```
purchases.html
├── Tab 1: Faktur Pembelian Stok
│   ├── [Form] Buat Faktur Pembelian Baru
│   │   ├── Nama Supplier (input teks bebas)
│   │   ├── ID Vendor (input teks bebas, opsional)
│   │   ├── Tanggal Pembelian
│   │   ├── Ongkos Kirim
│   │   ├── Item(s): [Variant ID teks bebas | Qty | Harga Pokok | Insentif Vendor]
│   │   └── [Tombol] Buat Faktur
│   ├── [Form] Penerimaan Barang Fisik
│   │   ├── Nomor Faktur (input teks — diisi manual)
│   │   ├── Idempotency Key (input readonly, ada tombol Buat Ulang)
│   │   ├── Item(s): [Variant ID teks bebas | Qty Diterima | Harga Pokok | Insentif]
│   │   └── [Tombol] Proses Penerimaan Barang
│   └── [Tabel] Daftar Faktur Pembelian
│       ├── Filter: Status Penerimaan | Status Bayar
│       └── Kolom: ID Faktur | Tanggal | Supplier | Total | Dibayar | Sisa | Status | Aksi
│           └── Aksi: [Bayar] (modal) | [Riwayat] (modal)
└── Tab 2: Pengeluaran Operasional
    ├── [Form] Catat Pengeluaran Baru
    └── [Tabel] Daftar Pengeluaran
```

### 1.2 Alur Pengguna Saat Ini

```
BUAT FAKTUR                    TERIMA BARANG
Ketik nama supplier    →       Ketik ID faktur (PUR-...)
Ketik ID vendor        →       Generate idempotency key
Ketik Variant ID       →       Ketik Variant ID lagi
Isi qty & harga        →       Isi qty & harga lagi
Tekan Buat Faktur      →       Tekan Proses Penerimaan
                       →
                       BAYAR SUPPLIER
                       Klik tombol [Bayar] di tabel
                       Isi nominal di modal
                       Tekan Simpan Pembayaran
```

---

## 2. MASALAH UX DAN FUNGSIONAL

### 2.1 Masalah KRITIS (Langsung Mempengaruhi Operasional)

#### ❌ MASALAH-01: Supplier diketik bebas, tidak terhubung ke data vendor
**File:** `purchases.html` L357-363, `purchases.js` L237-241  
**Dampak:** Nama supplier bisa beda-beda untuk vendor yang sama (`"Crocs Ind"`, `"PT Crocs"`, `"crocs ind"`). Filter per vendor di tabel tidak bisa berjalan konsisten.  
**Keterangan backend:** `createPurchaseInvoice()` menerima `supplier_name` dan `vendor_id` sebagai input terpisah — backend sudah siap untuk dropdown, tapi frontend tidak menggunakannya.

#### ❌ MASALAH-02: Variant ID harus diketik manual
**File:** `purchases.js` L152-191, L292-326  
**Dampak:** Admin harus hafal kode seperti `VAR-CLG-CLASSIC-BLACK-M8W10`. Sangat rentan salah ketik. Jika variant ID tidak valid, backend melempar error tapi tidak informatif untuk pengguna awam.  
**Keterangan backend:** `createPurchaseInvoice()` di baris 1022 melempar `"variant_id wajib untuk setiap item"` — tidak ada lookup nama produk.

#### ❌ MASALAH-03: Form penerimaan barang terpisah dari faktur, tidak ada referensi kontekstual
**File:** `purchases.js` L292-396  
**Dampak:** Pengguna harus ingat atau copy-paste ID faktur (`PUR-20261117-...`) ke form penerimaan. Tidak ada tampilan "barang apa yang dipesan vs sudah diterima" sebelum mengisi penerimaan.  
**Keterangan backend:** `receivePurchaseShipment()` di L1109 memparsing `planned_items` dari kolom `notes` — data sudah ada, hanya tidak ditampilkan ke pengguna.

#### ❌ MASALAH-04: Idempotency Key terekspos sebagai input pengguna
**File:** `purchases.html` L413-417, `purchases.js` L101-110  
**Dampak:** Pengguna tidak memahami fungsi field ini. Ada risiko:
- Pengguna tidak menekan "Buat Ulang" → penerimaan berbeda memakai key yang sama → sistem anggap duplikat, stok tidak bertambah
- Pengguna mengubah key → sistem kehilangan perlindungan duplikat  
**Keterangan backend:** Idempotency check di L1131-1143 sudah benar secara teknis. Tapi secara UX, key ini seharusnya **tidak terlihat** oleh pengguna.

#### ❌ MASALAH-05: Harga Pokok diisi ulang di form penerimaan, padahal sudah ada di faktur
**File:** `purchases.js` L292-348  
**Dampak:** Inkonsistensi — faktur dan penerimaan bisa punya harga pokok berbeda. Ini berpengaruh langsung ke kalkulasi HPP FIFO.  
**Keterangan backend:** `receiveOwnedStockBatch()` di L93 menerima `baseUnitCost` dari input penerimaan, bukan dari faktur asli. Idealnya ambil dari `planned_items` di `notes`.

### 2.2 Masalah PENTING (Mempengaruhi Pengalaman Pengguna)

#### ⚠️ MASALAH-06: Metrik di header tidak lengkap
**File:** `purchases.js` L612-617  
**Saat ini:** Total Faktur | Belum Diterima | Diterima Sebagian | Diterima Penuh  
**Kurang:** Total nilai pembelian bulan ini, Total tagihan belum dibayar (Rp), Total barang transit  
**Keterangan backend:** `getPurchasesList()` mengembalikan semua data termasuk `total_purchase`, `remaining_bill` — tinggal diagregasi di frontend.

#### ⚠️ MASALAH-07: Tidak ada filter tanggal di daftar faktur
**File:** `purchases.js` L401-421  
**Saat ini:** Filter hanya status penerimaan dan status bayar  
**Backend mendukung:** `getPurchasesList()` L1287 menerima `date_from` dan `date_to` — sudah ada, tapi tidak dipakai di frontend.

#### ⚠️ MASALAH-08: Tidak ada rincian item dalam tabel faktur
**File:** `purchases.js` L444-479  
**Saat ini:** Tabel hanya menampilkan supplier, total, status — tidak ada detail item yang dipesan/diterima per faktur.  
**Keterangan backend:** `planned_items` tersimpan di kolom `notes` sebagai JSON — data ada, hanya tidak ditampilkan.

#### ⚠️ MASALAH-09: Tidak ada filter supplier di tabel faktur
**File:** `purchases.js` L401-421  
**Backend mendukung:** `getPurchasesList()` L1294 menerima `vendor_id` — sudah ada, belum dipakai di frontend.

#### ⚠️ MASALAH-10: Konfirmasi logout pakai `confirm()` browser
**File:** `purchases.js` L65  
**Saat ini:** `if (!confirm('Apakah Anda yakin...'))`  
**Masalah:** Tidak konsisten dengan desain modal sistem yang lain.

### 2.3 Masalah MINOR (Teknis/Kosmetik)

#### 📋 MASALAH-11: Rincian biaya pembelian tidak transparan
**Saat ini:** Hanya tampil "Estimasi Total Pembelian"  
**Seharusnya:** Harga Barang + Ongkir + Total = rincian yang jelas

#### 📋 MASALAH-12: Tidak ada informasi insentif vendor di tampilan tabel
**Keterangan:** `vendor_incentive` tersimpan di `DETAIL_PEMBELIAN` tapi tidak ditampilkan di manapun.

#### 📋 MASALAH-13: Pesan error variant ID tidak informatif
**Saat ini:** `"variant_id wajib untuk setiap item"` — pengguna tidak tahu cara mencari variant ID yang benar.

---

## 3. ALUR PENGGUNA YANG DIREKOMENDASIKAN (TO-BE)

### 3.1 Alur Utama

```
LANGKAH 1: Buat Faktur Pembelian
  ↓ Pilih Supplier dari dropdown (data dari VENDORS)
  ↓ ID Vendor terisi otomatis
  ↓ Pilih Produk dari dropdown (data dari MASTER_PRODUK)
  ↓ Pilih Varian dari dropdown (data dari VARIAN_PRODUK, filter per produk)
  ↓ Isi Qty Dipesan + Harga Pokok per unit
  ↓ Tambah item berikutnya (opsional)
  ↓ Isi Ongkos Kirim
  ↓ [Buat Faktur] → Faktur tersimpan, stok BELUM bertambah

LANGKAH 2: Catat Pembayaran (opsional, bisa dilakukan kapan saja)
  ↓ Klik [Catat Pembayaran] di baris faktur
  ↓ Sistem menampilkan total faktur + sudah dibayar + sisa tagihan
  ↓ Isi nominal + metode bayar + tanggal
  ↓ [Simpan] → Status bayar terupdate (UNPAID → PARTIAL → PAID)
  ↓ Bisa diulang untuk cicilan berikutnya

LANGKAH 3: Terima Barang Fisik
  ↓ Klik [Terima Barang] di baris faktur
  ↓ Sistem menampilkan item yang dipesan + qty yang belum diterima
  ↓ Isi qty yang benar-benar datang (bisa lebih sedikit dari pesanan)
  ↓ [Proses Penerimaan] → Stok bertambah, batch FIFO dibuat
  ↓ Status receiving terupdate (UNRECEIVED → PARTIAL → FULLY_RECEIVED)
```

### 3.2 Navigasi Halaman yang Direkomendasikan

```
purchases.html
├── [Header] Metrik Ringkasan (4 kartu: Total Faktur, Belum Bayar Rp, Transit, Sudah Diterima)
├── [Tab/Nav] Faktur Pembelian | Pengeluaran Operasional
│
└── Tab: Faktur Pembelian
    ├── [Tombol Aksi] + Buat Faktur Baru  (buka modal/drawer)
    ├── [Filter] Tanggal | Supplier | Status Penerimaan | Status Bayar
    └── [Tabel] Daftar Faktur
        └── Per baris: ID | Supplier | Tanggal | Total | Bayar | Sisa | Status | Aksi
            └── Aksi: [Catat Bayar] | [Terima Barang] | [Detail]
                                                           ↓
                                               [Panel/Modal Detail Faktur]
                                               Item yang dipesan vs diterima
                                               Riwayat pembayaran
                                               Riwayat penerimaan
```

---

## 4. WIREFRAME KOMPONEN HALAMAN BARU

### 4.1 Header Metrik (Kartu Ringkasan)

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│  📄 TOTAL       │  💸 BELUM BAYAR │  🚚 DALAM       │  ✅ SUDAH       │
│  FAKTUR         │  (Rp)           │  PENGIRIMAN     │  DITERIMA       │
│  [angka]        │  Rp[angka]      │  [angka] faktur │  [angka] faktur │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

### 4.2 Form Buat Faktur (Modal / Drawer)

```
╔══════════════════════════════════════════════════════╗
║  📦 Buat Faktur Pembelian Baru                   [×] ║
╠══════════════════════════════════════════════════════╣
║  Supplier *         │ Tanggal Pembelian *             ║
║  [Dropdown ▼]       │ [date picker]                   ║
║  (dari data VENDORS)│                                 ║
╠══════════════════════════════════════════════════════╣
║  Item Pembelian #1                            [Hapus] ║
║  ┌─────────────────┬──────────────────────────────┐  ║
║  │ Produk *        │ [Dropdown ▼ cari produk]      │  ║
║  │ Varian *        │ [Dropdown ▼ warna & ukuran]   │  ║
║  │ Qty Dipesan *   │ [input angka]                 │  ║
║  │ Harga Pokok *   │ Rp [input angka]              │  ║
║  │ Insentif Vendor │ Rp [input angka] (opsional)   │  ║
║  │ Subtotal        │ Rp [kalkulasi otomatis]        │  ║
║  └─────────────────┴──────────────────────────────┘  ║
║  [+ Tambah Item]                                      ║
╠══════════════════════════════════════════════════════╣
║  Ongkos Kirim       │ Catatan                         ║
║  Rp [input]         │ [text]                          ║
╠══════════════════════════════════════════════════════╣
║  Rincian Biaya:                                       ║
║  Harga Barang: Rp[x]  Ongkir: Rp[x]  Total: Rp[x]   ║
╠══════════════════════════════════════════════════════╣
║  [Batal]                        [📄 Buat Faktur]      ║
╚══════════════════════════════════════════════════════╝
```

### 4.3 Panel Penerimaan Barang (dari klik di tabel)

```
╔══════════════════════════════════════════════════════╗
║  📦 Terima Barang — Faktur PUR-20261117-xxx      [×] ║
║  Supplier: PT Crocs Indonesia | Tgl: 17 Nov 2026     ║
╠══════════════════════════════════════════════════════╣
║  Daftar Item yang Dipesan:                           ║
║  ┌────────────────┬──────┬──────────┬──────────────┐ ║
║  │ Produk/Varian  │Pesan │ Diterima │ Sisa (otom.) │ ║
║  │ Classic Clog   │  10  │    6     │       4      │ ║
║  │ M8/W10 Black   │      │          │              │ ║
║  │ ───────────────│──────│──────────│──────────────│ ║
║  │ Platform Clog  │   5  │    5     │       0 ✅   │ ║
║  │ W8 White       │      │          │              │ ║
║  └────────────────┴──────┴──────────┴──────────────┘ ║
║                                                      ║
║  Penerimaan Baru Ini:                                ║
║  Classic Clog M8/W10 Black:  [4] unit   (sisa: 4)   ║
║  [+ Tambah item penerimaan lain jika diperlukan]     ║
║                                                      ║
║  Catatan Penerimaan: [text input]                    ║
╠══════════════════════════════════════════════════════╣
║  [Batal]            [📦 Proses Penerimaan Barang]    ║
╚══════════════════════════════════════════════════════╝
```
> Idempotency Key **tidak terlihat pengguna** — dibuat otomatis di background.

### 4.4 Panel Detail Faktur (read-only)

```
╔══════════════════════════════════════════════════════╗
║  🔍 Detail Faktur PUR-20261117-xxx               [×] ║
║  Status Bayar: [PARTIAL] | Status Terima: [PARTIAL]  ║
╠══════════════════════════════════════════════════════╣
║  Supplier: PT Crocs Indonesia                        ║
║  Tanggal: 17 Nov 2026 | Total: Rp2.550.000           ║
║                                                      ║
║  Item Pembelian:                                     ║
║  Classic Clog M8/W10 Black — 10 unit @ Rp250.000     ║
║  Platform Clog W8 White    —  5 unit @ Rp290.000     ║
║  + Ongkir: Rp50.000                                  ║
║                                                      ║
║  Riwayat Pembayaran:                                 ║
║  12 Nov — Rp1.000.000 — Transfer BCA                 ║
║  Sisa Tagihan: Rp1.550.000                           ║
║                                                      ║
║  Riwayat Penerimaan:                                 ║
║  17 Nov — 6 Classic Clog M8/W10 + 5 Platform White  ║
║  Belum diterima: 4 Classic Clog M8/W10              ║
╚══════════════════════════════════════════════════════╝
```

---

## 5. PEMETAAN FITUR UI KE API DAN SERVICE BACKEND

| Fitur UI Baru | API Endpoint | Service Function | Status |
|---|---|---|---|
| Dropdown Supplier | `GET /api/metadata` atau `GET /api/vendors` | `DatabaseHelper.getAllRows("VENDORS")` | ✅ Ada (data ada, belum ada endpoint khusus daftar vendor) |
| Dropdown Produk | `GET /api/products` | `DatabaseHelper.getAllRows("MASTER_PRODUK")` | ✅ Ada |
| Dropdown Varian per Produk | `GET /api/products/detail?product_id=` | `DatabaseHelper.getAllRows("VARIAN_PRODUK", filter)` | ✅ Ada |
| Buat Faktur | `POST /api/purchases/create` | `InventoryService.createPurchaseInvoice()` | ✅ Ada |
| Daftar Faktur + Filter | `GET /api/purchases/list` | `InventoryService.getPurchasesList()` | ✅ Ada (filter date_from/to sudah didukung backend) |
| Catat Pembayaran | `POST /api/purchases/payment-record` | `InventoryService.recordPurchasePayment()` | ✅ Ada |
| Riwayat Pembayaran per Faktur | `GET /api/purchases/payments?purchase_id=` | `InventoryService.getPurchasePayments()` | ✅ Ada |
| Terima Barang (dari referensi faktur) | `POST /api/purchases/receive` | `InventoryService.receivePurchaseShipment()` | ✅ Ada |
| Tampilkan planned_items di modal terima | `GET /api/purchases/list` | `notesObj.planned_items` sudah ada di response | ✅ Ada (data ada di response, belum ditampilkan) |
| Tampilkan qty sudah diterima per item | _Perlu endpoint baru_ | `DatabaseHelper.getAllRows("DETAIL_PEMBELIAN", filter)` | ⚠️ Butuh endpoint baru: `GET /api/purchases/detail?purchase_id=` |
| Metrik Rp total belum bayar | `GET /api/purchases/list` | Agregasi dari `remaining_bill` di response | ✅ Ada (data ada, tinggal diagregasi di frontend) |
| Filter tanggal di tabel | `GET /api/purchases/list?date_from=&date_to=` | Sudah didukung di `getPurchasesList()` | ✅ Ada |
| Filter supplier di tabel | `GET /api/purchases/list?vendor_id=` | Sudah didukung di `getPurchasesList()` | ✅ Ada |

---

## 6. FITUR YANG SUDAH ADA vs BELUM ADA

### ✅ Sudah Ada di Backend (Tinggal Dipakai di Frontend)

| # | Fitur | Keterangan |
|---|---|---|
| 1 | Filter `date_from`/`date_to` di daftar faktur | Backend L1295-1304 sudah handle, frontend belum pakai |
| 2 | Filter `vendor_id` di daftar faktur | Backend L1294 sudah handle, frontend belum pakai |
| 3 | `planned_items` di response daftar faktur | Sudah diparsing di L1313-1315, sudah ada di response sebagai `planned_items_count` |
| 4 | `remaining_bill` per faktur | Sudah dihitung di L1319-1352, sudah di response |
| 5 | Idempotency otomatis (payment) | Modal `openPaymentModal()` sudah generate key otomatis di L496-498 ✅ |
| 6 | Riwayat pembayaran per faktur | `GET /api/purchases/payments` sudah ada |
| 7 | Pembayaran multi-cicilan | `recordPurchasePayment()` sudah bisa diulang per faktur |
| 8 | Validasi penerimaan tidak melebihi pesanan | Backend L1184-1193 sudah handle |
| 9 | Alokasi ongkir proporsional ke HPP | Backend L1196-1200 sudah handle |
| 10 | List vendors | `GET /api/metadata` sudah return vendor list |

### ⚠️ Belum Ada — Perlu Ditambahkan

| # | Fitur | Effort | Resiko |
|---|---|---|---|
| 1 | `GET /api/purchases/detail?purchase_id=` — detail per faktur termasuk item + riwayat terima | Sedang | Rendah (hanya read, tidak ubah data) |
| 2 | Dropdown produk → varian di form faktur (lookup di frontend) | Rendah | Rendah |
| 3 | Idempotency key penerimaan barang dibuat otomatis, tidak ditampilkan ke pengguna | Rendah | Rendah |
| 4 | Pre-fill form penerimaan dari data faktur (qty dipesan, harga dari `planned_items`) | Sedang | Rendah (hanya read dari response yang sudah ada) |
| 5 | Modal konfirmasi logout (ganti `confirm()`) | Rendah | Sangat rendah |

### ❌ Tidak Perlu / Tidak Akan Diubah

| # | Item | Keterangan |
|---|---|---|
| 1 | Logika FIFO di `InventoryService` | Tidak disentuh |
| 2 | Kalkulasi HPP dan alokasi ongkir | Tidak disentuh |
| 3 | Schema database | Tidak disentuh |
| 4 | Validasi akuntansi (periode aktif, dsb) | Tidak disentuh |
| 5 | `payment_status` dan `receiving_status` logic | Tidak disentuh |

---

## 7. RISIKO PERUBAHAN

### 7.1 Terhadap FIFO

| Perubahan UI | Risiko ke FIFO | Mitigasi |
|---|---|---|
| Dropdown produk/varian → kirim `variant_id` yang valid | **Rendah** — backend tetap menerima `variant_id`, hanya cara inputnya berubah | Validasi `variant_id` exists di backend tetap jalan |
| Pre-fill harga dari `planned_items` di form penerimaan | **Sedang** — jika pengguna tidak bisa override harga, fleksibilitas berkurang | Tetap izinkan override, tapi tampilkan harga default dari faktur |
| Idempotency key tersembunyi | **Rendah** — key tetap dikirim dan divalidasi backend, hanya tidak ditampilkan | Generate dan kirim key yang proper di background |

### 7.2 Terhadap Pembayaran

| Perubahan UI | Risiko | Mitigasi |
|---|---|---|
| Tombol [Bayar] pindah ke baris tabel | **Sangat Rendah** — hanya posisi UI | Tidak ada |
| Modal bayar diperkaya dengan histori | **Sangat Rendah** — tambah informasi, tidak ubah logika | Tidak ada |

### 7.3 Terhadap Penerimaan Parsial

| Perubahan UI | Risiko | Mitigasi |
|---|---|---|
| Tampilkan "qty dipesan vs qty diterima" | **Sangat Rendah** — hanya display | Ambil dari `planned_items` yang sudah ada |
| Form penerimaan dari konteks faktur | **Rendah** — `purchase_id` masih dikirim ke backend | Pastikan `purchase_id` auto-fill dari faktur yang diklik |

### 7.4 Terhadap Vendor dan Akuntansi

| Perubahan UI | Risiko | Mitigasi |
|---|---|---|
| Dropdown supplier ambil dari VENDORS | **Rendah** — hanya memastikan `vendor_id` valid | Supplier tanpa vendor_id tetap bisa diinput manual sebagai fallback |
| Rincian biaya (harga + ongkir) di form | **Sangat Rendah** — hanya display | Tidak ada perubahan kalkulasi backend |

---

## 8. RENCANA IMPLEMENTASI BERTAHAP

### Tahap 1 — Perbaikan Tanpa Backend Baru (Estimasi: 1-2 hari)
> Semua perubahan hanya di `purchases.html` dan `purchases.js`. Tidak ada perubahan backend.

| # | Item | Detail |
|---|---|---|
| 1 | Dropdown Supplier | Load dari `GET /api/metadata` (endpoint sudah ada, return vendors). Jika tidak ada vendor terpilih, tetap bisa ketik manual. |
| 2 | Dropdown Produk + Varian | Load dari `GET /api/products` dan `GET /api/products/detail`. Cascading dropdown: pilih produk → load varian. |
| 3 | Idempotency Key tersembunyi di penerimaan barang | Hapus field dari tampilan. Key tetap digenerate di JS background, dikirim ke API. |
| 4 | Metrik Rp di header | Agregasi `remaining_bill` dari response `loadPurchaseList()` |
| 5 | Filter tanggal di tabel | Tambah dua input date, kirim ke `?date_from=&date_to=` |
| 6 | Filter supplier di tabel | Tambah dropdown supplier, kirim ke `?vendor_id=` |
| 7 | Rincian biaya di form | Tampilkan baris: Subtotal Item + Ongkir = Total |
| 8 | Ganti `confirm()` logout | Gunakan modal konfirmasi |

### Tahap 2 — Tambah Endpoint Detail Faktur (Estimasi: 1 hari)
> Tambah 1 endpoint baru di `server.js` + 1 fungsi di `InventoryService.gs`. Tidak mengubah logika yang sudah ada.

| # | Item | Detail |
|---|---|---|
| 1 | `GET /api/purchases/detail?purchase_id=` | Return: data faktur + `planned_items` + `DETAIL_PEMBELIAN` per item (qty dipesan, qty sudah diterima, sisa) + riwayat pembayaran |
| 2 | Modal Detail Faktur | Tampilkan item-item dengan status penerimaan per varian |

### Tahap 3 — Redesign Form Penerimaan (Estimasi: 1 hari)
> Gunakan data dari Tahap 2 untuk membuat form penerimaan berbasis konteks faktur.

| # | Item | Detail |
|---|---|---|
| 1 | Tombol [Terima Barang] di tabel | Buka modal penerimaan yang sudah pre-filled dari data faktur |
| 2 | Tampilkan qty dipesan vs diterima | Dari `DETAIL_PEMBELIAN` via endpoint detail |
| 3 | Input qty per item default = sisa yang belum diterima | Dari kalkulasi `dipesan - sudah_diterima` |
| 4 | Harga pokok default dari `planned_items` | Dapat di-override jika diperlukan |

### Tahap 4 — QA dan Regresi (Estimasi: 0.5 hari)
> Jalankan seluruh test suite + test manual alur lengkap.

---

## 9. TEST CASE REGRESI

### 9.1 Test Fungsional (harus tetap PASS setelah redesign)

| # | Skenario | Expected Result |
|---|---|---|
| R01 | Buat faktur dengan dropdown supplier valid | `purchase_id` terbuat, `payment_status=UNPAID`, `receiving_status=UNRECEIVED` |
| R02 | Buat faktur dengan 2+ item varian berbeda | Semua item tersimpan di `planned_items` dalam `notes` |
| R03 | Penerimaan penuh semua item | `receiving_status` → `FULLY_RECEIVED`, stok bertambah sesuai qty |
| R04 | Penerimaan parsial (kirim 6 dari 10) | `receiving_status` → `PARTIAL_RECEIVED`, stok bertambah 6, sisa 4 dicatat |
| R05 | Penerimaan kedua untuk faktur yang sama | Stok bertambah lagi, `receiving_status` → `FULLY_RECEIVED` jika genap |
| R06 | Penerimaan melebihi qty dipesan | Ditolak backend dengan pesan error yang jelas |
| R07 | Penerimaan duplikat (key sama) | Idempotent — stok tidak bertambah, tidak error |
| R08 | Bayar faktur penuh sekaligus | `payment_status` → `PAID` |
| R09 | Bayar faktur cicilan (2x) | Setelah cicilan 1: `PARTIAL`. Setelah cicilan 2 genap: `PAID` |
| R10 | Bayar melebihi sisa tagihan | Ditolak dengan pesan error |
| R11 | Riwayat pembayaran menampilkan semua cicilan | Semua baris di `PEMBAYARAN_PEMBELIAN` untuk faktur tersebut |
| R12 | Filter status bayar `UNPAID` | Hanya faktur belum lunas yang tampil |
| R13 | Filter status penerimaan `PARTIAL_RECEIVED` | Hanya faktur penerimaan sebagian yang tampil |
| R14 | Filter tanggal range | Hanya faktur dalam rentang tanggal yang tampil |
| R15 | Metrik header menampilkan nilai Rp benar | Jumlah `remaining_bill` semua faktur = nilai metrik "Belum Bayar" |
| R16 | HPP FIFO tidak berubah setelah redesign | Jalankan `test_phase_3d_supplier_purchase.js` — semua 86 PASS |
| R17 | Penjualan setelah pembelian ambil HPP benar | Jalankan `test_phase_3d_submodule_4_financial.js` — semua 88 PASS |
| R18 | Pembayaran supplier terekam di laporan arus kas | Cek `GET /api/reports/cash-flow` |

### 9.2 Test Keamanan

| # | Skenario | Expected Result |
|---|---|---|
| S01 | Akses purchases.html tanpa login | Redirect ke `login.html` |
| S02 | Request API tanpa token | HTTP 401 |
| S03 | ADMIN akses purchases.html | Berhasil (Pembelian Stok bukan owner-only) |
| S04 | ADMIN tidak lihat menu "Laporan Keuangan" di sidebar | Menu disembunyikan |

---

## 10. RINGKASAN KEPUTUSAN UNTUK OWNER

Sebelum implementasi dimulai, Owner perlu memutuskan:

| # | Pertanyaan | Pilihan |
|---|---|---|
| Q1 | Apakah supplier tanpa data di VENDORS tetap boleh diinput manual? | (a) Ya, ada field input bebas sebagai fallback  (b) Tidak, wajib pilih dari data vendor |
| Q2 | Apakah harga pokok di form penerimaan bisa di-override dari harga di faktur? | (a) Ya, pengguna bisa ubah  (b) Tidak, harus sama dengan faktur asli |
| Q3 | Apakah Tab "Pengeluaran Operasional" tetap di halaman yang sama dengan Pembelian Stok? | (a) Ya, tetap satu halaman (tab)  (b) Pisahkan ke halaman sendiri |
| Q4 | Prioritas Tahap 1 saja, atau langsung Tahap 1-3? | Rekomendasi: mulai Tahap 1 dulu, lanjut Tahap 2-3 setelah direview |

---

## CATATAN TEKNIS TAMBAHAN

### Tentang `planned_items` dalam kolom `notes`

Saat ini backend menyimpan rencana item pembelian (qty, harga) dalam format JSON di kolom `notes` di `PEMBELIAN_STOK`. Contoh:

```json
{
  "user_notes": "Pembelian rutin",
  "planned_items": [
    { "variant_id": "VAR-CLG-CLASSIC-BLACK-M8W10", "quantity": 10, "base_unit_cost": 250000, "vendor_incentive": 0 }
  ]
}
```

Data ini sudah tersedia di response `GET /api/purchases/list` (via `planned_items_count`). Untuk menampilkan detail item per faktur, perlu endpoint `GET /api/purchases/detail` yang mengekstrak dan menampilkan `planned_items` ini beserta data penerimaan aktual dari `DETAIL_PEMBELIAN`.

### Tentang Kapitalisasi Ongkir ke HPP

Backend sudah mengalokasikan ongkir secara proporsional ke `unit_cost` per item di `DETAIL_PEMBELIAN`. Ini **tidak boleh diubah**. UI baru hanya menampilkan kalkulasi ini untuk transparansi.

### Tentang Idempotency Key Penerimaan

Backend `receivePurchaseShipment()` menggunakan `idempotency_key` untuk mencegah duplikasi. Dalam redesign, key ini tetap dikirim ke backend, hanya tidak ditampilkan ke pengguna. Key akan digenerate ulang otomatis setiap kali modal penerimaan dibuka.

---

*Dokumen ini siap untuk direview oleh Owner. Setelah keputusan di Bagian 10 dijawab, implementasi dapat dimulai dari Tahap 1.*
