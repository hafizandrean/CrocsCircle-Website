# RENCANA IMPLEMENTASI PHASE 3D (FINAL REFINED): MODUL OPERASIONAL ADMIN
**CrocsCircle.ID — Sistem E-Commerce, Inventaris Konsinyasi Multi-Vendor & Finansial Terpadu**  
*Dokumen ID: `docs/plans/PHASE_3D_IMPLEMENTATION_PLAN.md`*  
*Versi Dokumen: 2.2.0 (Final Locked Specification Sebelum Implementasi)*  
*Tanggal: 17 November 2026*  
*Status: USULAN PERENCANAAN FINAL (LOCKED & SIAP EKSEKUSI)*

---

## 1. KEPUTUSAN BISNIS YANG SUDAH FINAL & MENGIKAT

Berdasarkan kesepakatan arsitektur dan arahan Owner, seluruh keputusan bisnis berikut telah bersifat **final dan terkunci**:

1. **Kebijakan Resmi Ongkos Kirim Pelanggan: OPSI A (Titipan Ekspedisi / Pass-Through Liability)**:
   - Ongkos kirim yang dibayarkan oleh pembeli dicatat sebagai dana titipan ekspedisi (liabilitas jangka pendek) dan langsung dikeluarkan saat membayar pihak kurir (JNE/SiCepat/J&T).
   - Ongkos kirim **MUTLAK TIDAK DIHITUNG sebagai omzet produk CrocsCircle**, tidak masuk HPP, dan tidak menggembungkan laba kotor.
   - Simulasi Kasus: Sepatu Rp280.000 + Ongkir Rp15.000 $\rightarrow$ Uang Diterima Rp295.000, Bayar Kurir Rp15.000, **Omzet CrocsCircle Tetap Rp280.000**.
2. **Pengakuan Omzet Pre-Order (PO) Mutlak Berbasis Pelunasan**:
   - Pembayaran uang muka (DP) atau cicilan parsial **BUKAN omzet** ($Rp0$).
   - Omzet diakui penuh saat status pembayaran menjadi **LUNAS (`PAID`)**, dengan tanggal pengakuan omzet = **tanggal pelunasan (`settlement_date`)**.
   - Serah terima barang (*fulfillment*) **TIDAK mengakui omzet untuk kedua kalinya**. Fulfillment murni mengubah status penyerahan barang (`fulfillment_status: "DELIVERED"`) dan melepaskan reservasi stok fisik.
3. **Pemisahan Tiga Status PO yang Berdiri Sendiri**:
   - **Payment Status**: `UNPAID` | `PARTIAL` | `PAID`
   - **Procurement Status**: `NOT_ORDERED` | `ORDERED` | `IN_TRANSIT` | `RECEIVED`
   - **Fulfillment Status**: `NOT_DELIVERED` | `DELIVERED` | `CANCELLED`
   Ketiga status berdiri sendiri dan tidak saling menimpa tanpa aturan transaksi yang jelas.
4. **Mekanisme Penanganan Pesanan WhatsApp (Non-Destruktif)**:
   - Checkout WhatsApp dari Storefront Phase 3C murni merupakan inquiry pemesanan publik, **bukan transaksi sah dan tidak memotong stok**.
   - Admin di kasir POS / form PO dapat menempelkan teks format WhatsApp pesanan pelanggan.
   - Modul parser mengekstrak data pesanan, lalu backend memvalidasi ulang keaslian SKU, varian aktif, harga resmi katalog, dan stok fisik yang tersedia secara *real-time*.
   - Stok fisik hanya terpotong saat Admin menekan tombol konfirmasi pembuatan transaksi di kasir POS (`SalesService.createSale`) atau pembuatan PO (`POService.createPreOrder`).
5. **Pemisahan Faktur Pembelian dan Penerimaan Barang Fisik**:
   - Pembuatan faktur pembelian supplier (`PEMBELIAN_STOK`) **TIDAK langsung menambah stok fisik**. Status faktur awal adalah `receiving_status: "UNRECEIVED"`.
   - Status pembayaran pembelian (`payment_status`: `UNPAID`, `PARTIAL`, `PAID`) terpisah dari status penerimaan barang fisik (`receiving_status`: `UNRECEIVED`, `PARTIAL_RECEIVED`, `FULLY_RECEIVED`).
   - Stok fisik dan batch persediaan FIFO baru (`DETAIL_PEMBELIAN`) **hanya dibuat saat barang fisik benar-benar diterima** di gudang (mendukung penerimaan bertahap / *partial reception*).
6. **Perlindungan Hak Pokok Vendor Konsinyasi terhadap Diskon Kasir**:
   - Diskon yang diberikan kasir pada barang konsinyasi **mutlak dilarang membuat harga bersih berada di bawah hak pokok vendor**:
     $$\mathbf{Harga\ Bersih\ Produk} = \mathbf{Harga\ Jual\ Aktual} - \mathbf{Diskon\ Item} \ge \mathbf{fixed\_vendor\_share}$$
   - Untuk Dzaki (`VND-DZAKI`): Hak pokok vendor adalah **Rp270.000/unit**.
   - Contoh: Jika harga jual Rp280.000 dan diskon Rp15.000 $\rightarrow$ Hasil bersih Rp265.000 (< Rp270.000). **Sistem WAJIB MENOLAK transaksi ini**.
   - Diskon kasir murni memotong insentif CrocsCircle ($\text{Insentif Bersih} = \text{Harga} - \text{Rp270.000} - \text{Diskon}$) dan tidak pernah mengurangi hak pokok Dzaki Rp270.000.
7. **Formula Validasi Akumulasi Refund Pre-Order**:
   - Pengembalian dana pembatalan PO dibatasi dengan rumus akumulatif ketat:
     $$\mathbf{Refund\ Maksimal} = \mathbf{Total\ Pembayaran\ Aktual\ Diterima} - \mathbf{Total\ Refund\ Sebelumnya}$$
   - Setiap pengajuan refund wajib menyertakan `idempotency_key` untuk mencegah eksekusi ganda jika tombol ditekan berulang kali.
   - Refund wajib tertaut ke ID pembayaran PO asal di `PEMBAYARAN_PO` dan tercatat sebagai arus kas keluar.
8. **Aturan Pembatalan PO Saat Barang Sudah Diterima vs Sudah Diserahkan**:
   - **Kondisi A (Barang sudah diterima, belum diserahkan ke customer: `procurement: RECEIVED`, `fulfillment: NOT_DELIVERED`)**:
     - Mengurangi `reserved_stock` sebesar kuantitas pesanan.
     - **Mempertahankan `physical_stock`** utuh karena fisik sepatu sudah berada di gudang CrocsCircle.
     - Mengembalikan kuantitas ke stok tersedia ($\text{available} = \text{physical} - \text{reserved}$).
     - Riwayat penerimaan supplier dan mutasi stok fisik `PURCHASE_RECEIPT` **tidak boleh dihapus**.
   - **Kondisi B (Barang sudah diserahkan ke customer: `fulfillment: DELIVERED`)**:
     - Pembatalan PO biasa **DITOLAK KERAS**.
     - Proses wajib melalui alur retur resmi (`SalesService.returnSaleItem`) dengan inspeksi fisik kondisi barang.
9. **Kekebalan Periode Buku Tertutup (`CLOSED`) & Isolasi Beban**:
   - Retur atas transaksi dari periode yang sudah `CLOSED` dicatat sebagai penyesuaian (*contra-revenue & contra-HPP*) pada periode `OPEN` berjalan. Snapshot laporan laba rugi periode `CLOSED` lampau **tidak disentuh dan tidak berubah**.
   - Pembelian persediaan (`PEMBELIAN_STOK`) dan pembayaran utang vendor (`SETTLEMENT_VENDOR`) **dilarang keras masuk tabel pengeluaran operasional (`PENGELUARAN`)**.
10. **Prinsip *Zero New Transaction Engine***:
    - Tidak ada pembuatan engine akuntansi baru di sisi browser. Frontend murni bertindak sebagai antarmuka input dan presentasi data ke backend Phase 2.

---

## 2. STRUKTUR NILAI TRANSAKSI KASIR (POS BREAKDOWN)

Struktur data nilai transaksi kasir POS dipecah menjadi 4 komponen terpisah:
$$\mathbf{Grand\ Total} = \mathbf{Product\ Subtotal} - \mathbf{Discount} + \mathbf{Shipping\ Charge}$$

| Komponen | Penjelasan Teknis | Perlakuan Akuntansi & Laba Rugi |
| :--- | :--- | :--- |
| **`product_subtotal`** | Total harga kotor seluruh item produk ($\sum \text{actual\_price} \times \text{qty}$). | Basis omzet bruto penjualan barang dagangan. |
| **`discount`** | Potongan harga transaksi yang diberikan kasir kepada pelanggan. | Mengurangi omzet penjualan bersih. **Tidak mengubah nilai HPP FIFO** dan **tidak memotong hak pokok vendor konsinyasi**. |
| **`shipping_charge`** | Ongkos kirim ekspedisi yang dibayar oleh pelanggan kepada CrocsCircle. | **Opsi A (Titipan Ekspedisi)**: Masuk sebagai liabilitas titipan ongkir, langsung keluar saat bayar kurir. **Bukan omzet CrocsCircle**. |
| **`grand_total`** | Kas riil yang dibayar pelanggan ke kasir. | Nominal arus kas masuk ke rekening/kas toko (`SALDO_DANA`). |

---

## 3. PEMISAHAN FAKTUR PEMBELIAN DENGAN PENERIMAAN BARANG

```
┌──────────────────────────────────┐
│      1. Buat Faktur Pembelian    │ ──> Dicatat di PEMBELIAN_STOK
│      (Kuantitas Dipesan: 10 pcs) │     receiving_status = "UNRECEIVED"
└──────────────────────────────────┘     Stok fisik BELUM bertambah
                 │
                 ▼
┌──────────────────────────────────┐
│     2. Penerimaan Fisik Tahap 1  │ ──> Diterbitkan Batch 1 di DETAIL_PEMBELIAN (6 pcs)
│     (Barang Tiba: 6 pcs)         │     Stok Fisik bertambah +6 pcs
└──────────────────────────────────┘     receiving_status = "PARTIAL_RECEIVED"
                 │
                 ▼
┌──────────────────────────────────┐
│     3. Penerimaan Fisik Tahap 2  │ ──> Diterbitkan Batch 2 di DETAIL_PEMBELIAN (4 pcs)
│     (Barang Tiba: 4 pcs)         │     Stok Fisik bertambah +4 pcs
└──────────────────────────────────┘     receiving_status = "FULLY_RECEIVED"
```

### Aturan Baku Pembelian:
1. Header pembelian disimpan di tabel `PEMBELIAN_STOK` dengan nomor faktur supplier.
2. Setiap kali ada penerimaan fisik, diterbitkan baris detail di `DETAIL_PEMBELIAN` dengan `remaining_qty = quantity_diterima`, harga modal satuan riil (`unit_cost`), dan mutasi stok fisik `PURCHASE_RECEIPT` di tabel `MUTASI_STOK`.
3. Total kuantitas yang diterima dari seluruh tahapan **tidak boleh melebihi kuantitas yang tertera pada faktur pembelian**.
4. Pembayaran utang supplier dicatat pada `payment_status` (`UNPAID`, `PARTIAL`, `PAID`) secara terpisah dari status logistik barang.

---

## 4. PENANGANAN PEMBATALAN DAN REFUND PRE-ORDER

| Status PO saat Batal | Total Pembayaran Diterima | Omzet yang Pernah Diakui | Tindakan Pembatalan & Refund | Dampak Akuntansi & Kas |
| :--- | :---: | :---: | :--- | :--- |
| **A. PO Belum Bayar (`UNPAID`)** | Rp0 | Rp0 | Ubah `fulfillment_status: "CANCELLED"`. Lepas reservasi stok jika ada. Tidak ada refund uang. | Tidak ada mutasi kas. Tidak ada dampak omzet. |
| **B. PO dengan DP (`PARTIAL`)** | Rp500.000 (contoh) | Rp0 | Ubah `fulfillment_status: "CANCELLED"`. Lepas reservasi stok (stok fisik gudang tetap aman). Admin input nominal refund ($\le \text{Rp500.000} - \text{Refund Sebelumnya}$). | Kas Keluar tercatat di `SALDO_DANA` dengan referensi ID pembayaran PO. **Omzet tidak berubah** (karena DP memang belum diakui sebagai omzet). |
| **C. PO Lunas (`PAID`)** | Rp1.400.000 (contoh) | Rp1.400.000 | Ubah `fulfillment_status: "CANCELLED"`. Lepas reservasi stok. Admin input nominal refund ($\le \text{Rp1.400.000} - \text{Refund Sebelumnya}$). | Reversal omzet resmi (*contra-revenue*) pada periode berjalan. Kas Keluar dicatat di `SALDO_DANA`. |
| **D. Refund Parsial / Bertahap** | Sesuai porsi batal | Tergantung status | Sistem memvalidasi akumulasi seluruh refund tidak melebihi total uang yang pernah dibayarkan customer. | Kas Keluar dicatat sesuai nilai pengembalian aktual. |

---

## 5. DEPENDENSI TERHADAP BACKEND PHASE 2

Implementasi Phase 3D memiliki dependensi langsung pada modul backend Phase 2 yang telah teruji:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND ENGINE PHASE 2                          │
├───────────────────┬───────────────────┬────────────────────────────────┤
│ File Service      │ Fitur yang Dipakai│ Kondisi & Jaminan Integritas   │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ SalesService.gs   │ createSale        │ Multi-Item, FIFO Depletion,    │
│                   │ returnSaleItem    │ Atomic Rollback, Idempotency   │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ InventoryService  │ receiveOwnedBatch │ FIFO Batching, Lot Konsinyasi, │
│                   │ depleteConsignment│ Proteksi Overselling           │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ POService.gs      │ createPreOrder    │ DP vs Pelunasan, Omzet saat    │
│                   │ recordPayment     │ PAID, 3 Dimensi Status PO,     │
│                   │ fulfillPO/cancelPO│ Reservasi Stok Fisik           │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ FinancialService  │ calculateIncome...│ Matching Principle HPP FIFO,   │
│                   │ CashReconciliation│ Isolasi Beban Operasional      │
├───────────────────┼───────────────────┼────────────────────────────────┤
│ ClosingService.gs │ assertPeriodOpen..│ Mencegah mutasi pada periode   │
│                   │ getFundBalances   │ buku yang sudah CLOSED         │
└───────────────────┴───────────────────┴────────────────────────────────┘
```

---

## 6. DAFTAR ENDPOINT DAN FUNGSI BACKEND

### A. 7 Fungsi Pendukung Integrasi UI dan Backend

| No | Tipe Fungsi | Service | Nama Fungsi | Deskripsi Teknis |
| :---: | :---: | :--- | :--- | :--- |
| **1** | **Query** | `SalesService.gs` | `getSalesList(filters)` | Mengambil daftar riwayat transaksi penjualan terfilter (tanggal, kanal, status) untuk tabel kasir. Menghilangkan kolom modal HPP/margin bagi non-Owner. |
| **2** | **Query** | `POService.gs` | `getPOList(filters)` | Mengambil daftar pesanan Pre-Order terfilter berdasarkan `payment_status`, `procurement_status`, dan `fulfillment_status`. |
| **3** | **Transaksi** | `InventoryService.gs` | `createPurchaseInvoice(purchaseData)` | Mencatat header faktur pembelian stok toko di `PEMBELIAN_STOK` dengan status `UNRECEIVED`, tanpa langsung memotong/menambah stok fisik. |
| **4** | **Transaksi** | `InventoryService.gs` | `receivePurchaseShipment(receiptData)` | Menerima pengiriman fisik bertahap/penuh dari nomor faktur pembelian, menambah stok fisik, dan menerbitkan batch persediaan FIFO baru. |
| **5** | **Query** | `InventoryService.gs` | `getPurchasesList(filters)` | Mengambil daftar riwayat faktur pembelian supplier dan status penerimaannya. |
| **6** | **Transaksi** | `FinancialService.gs` | `recordOperationalExpense(expenseData)` | Memvalidasi kategori beban (menolak keras pembelian stok atau utang vendor), mencatat ke `PENGELUARAN`, dan memotong saldo kas toko. |
| **7** | **Query** | `FinancialService.gs` | `getExpensesList(filters)` | Mengambil daftar riwayat beban operasional terfilter per bulan/kategori. |

*Fungsi Tambahan Parser (Client/Utility)*:  
`StorefrontService.parseWhatsAppOrderText(rawText)` — Membaca teks pesanan WhatsApp pelanggan hasil checkout Phase 3C, mem-parsing detail customer dan item, serta memvalidasi keaslian varian dan stok sebelum dimuat ke antarmuka kasir.

---

### B. Rute REST API Baru yang Didaftarkan di `server.js`

| No | Endpoint | Metode | Akses | Parameter / Payload | Fungsi Backend |
| :---: | :--- | :---: | :---: | :--- | :--- |
| 1 | `/api/sales/create` | `POST` | Admin & Owner | `saleData` (items, payment, discount, shipping, channel) | `SalesService.createSale` |
| 2 | `/api/sales/list` | `GET` | Admin & Owner | `startDate`, `endDate`, `channel`, `page` | `SalesService.getSalesList` |
| 3 | `/api/sales/detail` | `GET` | Admin & Owner | `id` (sales_id) | `SalesService.getSaleById` |
| 4 | `/api/sales/return` | `POST` | Admin & Owner | `salesId`, `salesDetailId`, `quantity`, `reason` | `SalesService.returnSaleItem` |
| 5 | `/api/preorder/create` | `POST` | Admin & Owner | `poData` (customer, items, initial_payment, supplier) | `POService.createPreOrder` |
| 6 | `/api/preorder/list` | `GET` | Admin & Owner | `payment_status`, `procurement_status`, `fulfillment_status` | `POService.getPOList` |
| 7 | `/api/preorder/payment` | `POST` | Admin & Owner | `poId`, `amount`, `payment_method`, `notes` | `POService.recordPayment` |
| 8 | `/api/preorder/procurement`| `POST` | Admin & Owner | `poId`, `status` (`ORDERED`, `IN_TRANSIT`, `RECEIVED`) | `POService.updateProcurementStatus` |
| 9 | `/api/preorder/fulfill` | `POST` | Admin & Owner | `poId`, `stockCategory` | `POService.fulfillPO` |
| 10 | `/api/preorder/cancel` | `POST` | Admin & Owner | `poId`, `reason`, `refund_amount`, `idempotency_key` | `POService.cancelPO` |
| 11 | `/api/purchases/create` | `POST` | Admin & Owner | `purchaseData` (supplier, invoice, items, total) | `InventoryService.createPurchaseInvoice` |
| 12 | `/api/purchases/receive` | `POST` | Admin & Owner | `purchaseId`, `receivedItems: [{ variant_id, qty }]`, `idempotency_key` | `InventoryService.receivePurchaseShipment` |
| 13 | `/api/purchases/list` | `GET` | Admin & Owner | `startDate`, `endDate`, `status` | `InventoryService.getPurchasesList` |
| 14 | `/api/expenses/create` | `POST` | Admin & Owner | `expenseData` (category, description, amount) | `FinancialService.recordOperationalExpense` |
| 15 | `/api/expenses/list` | `GET` | Admin & Owner | `month`, `year`, `category` | `FinancialService.getExpensesList` |
| 16 | `/api/storefront/parse-wa` | `POST` | Admin & Owner | `raw_text` (teks pesanan WhatsApp) | `StorefrontService.parseWhatsAppOrderText` |

---

## 7. RENCANA PENGUJIAN OTOMATIS FINAL (30 SKENARIO PENGUJIAN)

Satu test suite komprehensif baru akan dibuat di [`tests/test_phase_3d.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/tests/test_phase_3d.js) mencakup **30 skenario pengujian**:

### A. Kasir & Penjualan (POS) — 13 Skenario
1. **Penjualan Stok Sendiri (`OWN_STOCK`)**: Memotong persediaan pada batch FIFO pertama secara otomatis dan mencatat kas masuk.
2. **Penjualan Multi-Item Campuran**: Menggabungkan item `OWN_STOCK` dan `VENDOR_CONSIGNMENT` (`BATCH_KONSINYASI`) dalam 1 transaksi atomik.
3. **Pemisahan Akuntansi Diskon & Ongkir (Opsi A)**: Menghitung `product_subtotal`, `discount`, `shipping_charge`, dan `grand_total`. Ongkir dicatat sebagai titipan kurir dan **tidak masuk omzet toko**.
4. **Proteksi Diskon Barang Konsinyasi Dzaki**: Menolak transaksi jika harga setelah diskon berada di bawah hak pokok Dzaki Rp270.000 (contoh: harga Rp280.000 diskon Rp15.000 = Rp265.000 $\rightarrow$ Ditolak).
5. **Insentif CrocsCircle Konsinyasi Dzaki dengan Diskon**: Jika harga Rp300.000 dan diskon Rp10.000 (hasil Rp290.000), hak Dzaki tetap Rp270.000 dan insentif CrocsCircle berkurang menjadi Rp20.000.
6. **Pencegahan Overselling Kasir**: Menolak transaksi kasir jika kuantitas melebihi stok yang tersedia.
7. **Validasi Konsinyasi Dzaki (Batas Kesepakatan Rp280.000)**: Transaksi di bawah Rp280.000 ditolak kecuali ada persetujuan Owner.
8. **Penjualan Konsinyasi Vendor Lain (Model Persentase)**: Menguji perhitungan bagi hasil vendor non-Dzaki berdasarkan persentase kesepakatan tabel `VENDORS`.
9. **Alur Retur Kasir Parsial**: Mengembalikan kuantitas barang ke lot/batch penerimaan asal dan membalik piutang/kewajiban vendor secara akurat.
10. **Retur Penjualan atas Transaksi Periode `CLOSED`**: Dicatat sebagai penyesuaian (*contra-revenue & contra-HPP*) di periode `OPEN` berjalan tanpa mengubah snapshot masa lalu.
11. **Idempotency Key Kasir**: Mencegah pemotongan stok ganda saat kasir menekan tombol bayar berulang kali.
12. **Rollback Atomik Kasir Multi-Item**: Kegagalan pada item terakhir membatalkan seluruh mutasi item sebelumnya.
13. **Parser Pesanan WhatsApp ke POS**: Menguraikan teks pesanan WhatsApp, memvalidasi varian dan stok, tanpa membuat transaksi atau mutasi stok otomatis sebelum konfirmasi Admin.

### B. Manajemen Pre-Order (PO) — 7 Skenario
14. **Pencatatan Pre-Order dengan Pembayaran DP**: Uang DP masuk ke kas, namun **omzet diakui Rp0**.
15. **Pelunasan PO Lintas Bulan (Kasus November vs Desember)**:
    - DP Oktober $\rightarrow$ Omzet Rp0.
    - Pelunasan November $\rightarrow$ Status `PAID`, `settlement_date` November, **omzet diakui penuh Rp1.400.000 pada periode November**.
    - Fulfillment Desember $\rightarrow$ Status `DELIVERED`, fisik stok dikeluarkan, **omzet Desember Rp0**.
16. **Independensi Tiga Status PO**: Pembaruan status pengadaan (`IN_TRANSIT` atau `RECEIVED`) terbukti tidak mengubah status pembayaran (`PARTIAL` atau `PAID`) secara sepihak.
17. **Fulfillment PO Tepat Sasaran**: Menyerahkan barang dan melepaskan reservasi stok fisik tanpa memicu pencatatan omzet ganda.
18. **Pembatalan PO Saat Barang Sudah Diterima di Gudang**: Melepaskan `reserved_stock`, mempertahankan `physical_stock` utuh di gudang, dan mengembalikan barang ke status siap jual.
19. **Penolakan Pembatalan Biasa untuk PO yang Sudah DELIVERED**: PO yang sudah diserahkan wajib diarahkan ke alur retur penjualan resmi.
20. **Validasi Akumulasi Refund & Idempotensi Refund**: Sistem menolak refund yang melebihi $(\text{Total Bayar} - \text{Refund Sebelumnya})$ dan menolak duplikasi eksekusi refund.

### C. Pembelian Stok Supplier — 4 Skenario
21. **Pembuatan Faktur Pembelian Supplier Tanpa Menambah Stok**: Faktur dicatat di `PEMBELIAN_STOK` dengan status `UNRECEIVED`, stok fisik gudang tidak bertambah.
22. **Penerimaan Fisik Bertahap (Partial Reception)**: Faktur 10 unit diterima 6 unit pada tahap pertama (batch FIFO baru 6 unit, stok +6), lalu 4 unit pada tahap kedua (batch FIFO baru 4 unit, stok +4).
23. **Idempotensi Penerimaan Barang**: Mencegah penambahan batch FIFO ganda jika panggilan API penerimaan dikirim ulang dengan idempotency key yang sama.
24. **Pemisahan Akuntansi Pembelian Stok**: Nominal pembelian stok terbukti **TIDAK masuk** ke tabel pengeluaran operasional di laporan laba rugi.

### D. Pengeluaran Operasional & Kas — 3 Skenario
25. **Pencatatan Beban Operasional Sah**: Mengurangi kas toko (`SALDO_DANA`) dan masuk ke akun beban laporan laba rugi.
26. **Penolakan Kategori Beban Non-Operasional**: Sistem menolak keras input beban operasional dengan kategori terlarang (pembelian stok atau pembayaran utang vendor).
27. **Konsolidasi & Sinkronisasi Arus Kas**: Saldo kas toko di `SALDO_DANA` merekonsiliasi penerimaan penjualan kasir, DP PO, pelunasan PO, dikurangi titipan ongkir, pembelian stok, beban operasional, dan refund.

### E. Keamanan, Concurrency & Regresi — 3 Skenario
28. **Proteksi Hak Akses RBAC Kasir vs Owner**: Kasir operasional tidak dapat melihat nilai HPP modal dan margin laba kotor pada tabel riwayat penjualan.
29. **Penanganan Concurrency (LockService)**: Dua kasir memproses pesanan varian dengan sisa 1 unit secara bersamaan; 1 transaksi berhasil dan 1 transaksi ditolak karena stok habis.
30. **Regresi Penuh Sistem**: Seluruh 13 test suite sebelumnya (Phase 2A s.d. Phase 3C) + 30 test Phase 3D lulus 100% tanpa regresi.

---

## 8. RENCANA URUTAN IMPLEMENTASI KERJA (STEP-BY-STEP)

Pengerjaan kode implementasi Phase 3D akan dilaksanakan dalam **6 langkah terstruktur**:

1. **Langkah 1**: Menerapkan 7 fungsi pendukung integrasi backend pada service terkait (`SalesService.gs`, `POService.gs`, `InventoryService.gs`, `FinancialService.gs`, `StorefrontService.gs`).
2. **Langkah 2**: Mendaftarkan rute REST API operasional baru pada `server.js`.
3. **Langkah 3**: Membangun antarmuka kasir dan parser WhatsApp pada `src/frontend/sales.html` & `sales.js`.
4. **Langkah 4**: Membangun antarmuka manajemen Pre-Order pada `src/frontend/preorder.html` & `preorder.js`.
5. **Langkah 5**: Membangun antarmuka pembelian stok supplier (`purchases.html` & `purchases.js`) dan beban operasional (`expenses.html` & `expenses.js`).
6. **Langkah 6**: Mengaktifkan tautan navigasi sidebar admin di `admin.html` dan `products.html`, menjalankan test suite otomatis `tests/test_phase_3d.js` (30 skenario), serta menyusun laporan implementasi resmi.

---

> [!NOTE]
> **STATUS: DOKUMEN PERENCANAAN FINAL TERKUNCI (LOCKED).**  
> Pengerjaan dihentikan di sini. Tidak ada file kode yang dibuat atau diubah sebelum mendapatkan persetujuan eksplisit dari Owner.
