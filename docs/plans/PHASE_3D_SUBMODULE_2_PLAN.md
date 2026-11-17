# RENCANA KERJA & ARSITEKTUR IMPLEMENTASI
## PHASE 3D — SUB-MODUL 2: MANAJEMEN PRE-ORDER (PO)
**CrocsCircle.ID Management Portal & Transaction Engine**  
**Versi:** 1.0.0  
**Status:** DRAFT UNTUK REVIEW IMPLEMENTASI  
**Scope Boundary:** Dikerjakan **HANYA** Sub-Modul 2 (Pre-Order). Sub-Modul 3 (Pembelian Stok) dan Sub-Modul 4 (Beban Operasional) **DILARANG DIMULAI**.

---

## 1. Audit Fungsi Backend Eksisting

Berdasarkan audit terhadap `src/backend/POService.gs`, fondasi engine Pre-Order telah dibangun pada Phase 2C dan siap diintegrasikan:

| Fungsi Backend | Berkas Asal | Status Eksisting | Kebutuhan Sub-Modul 2 |
| :--- | :--- | :---: | :--- |
| `createPreOrder(poData)` | `POService.gs` | **Siap** | Mendukung multi-item PO dan DP awal (`initial_payment`). |
| `recordPayment(poId, paymentData)` | `POService.gs` | **Siap** | Menghitung akumulasi pembayaran, memisahkan status `PARTIAL` (DP) vs `PAID` (Lunas). Mengunci `settlement_date` hanya saat pelunasan penuh. |
| `getPOById(poId)` | `POService.gs` | **Siap** | Mengambil detail PO, riwayat pembayaran, total terbayar, dan sisa tagihan. |
| `updateProcurementStatus(poId, newStatus)` | `POService.gs` | **Siap** | Transisi status: `NOT_ORDERED` $\to$ `ORDERED` $\to$ `IN_TRANSIT` $\to$ `RECEIVED`. |
| `allocateStockForPO(poId, category)` | `POService.gs` | **Siap** | Menghubungkan ke `InventoryService.reserveStock` untuk mengunci barang saat tiba. |
| `fulfillPO(poId, category)` | `POService.gs` | **Siap** | Menyerahkan barang via `InventoryService.fulfillReservedStock`. Penyerahan **tidak mencatat omzet baru**. |
| `cancelPO(poId, reason)` | `POService.gs` | **Perlu Penyempurnaan** | Menambahkan validasi refund akumulatif, pelepasan reservasi jika barang sudah tiba, dan pencatatan audit kas keluar. |
| `getRecognizedMonthlyPO(month, year)` | `POService.gs` | **Siap** | Mengambil omzet resmi yang diakui murni berdasarkan `settlement_date` pada periode laporan. |
| `getPOList(filters, callerToken)` | *Baru* | **Akan Ditambahkan** | Query daftar PO terfilter (status bayar, status pengadaan, tanggal, pencarian) untuk tabel antarmuka admin. |

---

## 2. Aturan Bisnis & Guardrails Akuntansi yang Dikunci

### A. Pengakuan Omzet Baku (DP Bukan Omzet)
1. Pembayaran Uang Muka (DP) dicatat sebagai **Liabilitas / Uang Muka Pelanggan**, bukan pendapatan/omzet.
2. Omzet penjualan PO **HANYA DIAKUI KETIKA PELANGGAN TELAH LUNAS (`PAID`)**, berdasarkan tanggal pelunasan (`settlement_date`).
3. Ketika barang diserahkan kepada pelanggan (`fulfillment_status = DELIVERED`), penyerahan fisik tersebut **TIDAK BOLEH MENCIPTAKAN OMZET KEDUA** karena omzet telah diakui pada tanggal pelunasan.

### B. Tiga Dimensi Status Independen
Setiap PO memiliki 3 status yang berdiri sendiri dan tidak saling menimpa:
1. `payment_status`: `UNPAID` $\to$ `PARTIAL` (DP) $\to$ `PAID` (Lunas) $\to$ `REFUNDED`.
2. `procurement_status`: `NOT_ORDERED` $\to$ `ORDERED` $\to$ `IN_TRANSIT` $\to$ `RECEIVED`.
3. `fulfillment_status`: `NOT_DELIVERED` $\to$ `READY_FOR_PICKUP` $\to$ `DELIVERED` (atau `CANCELLED`).

### C. Formula Validasi Refund Akumulatif
Apabila terjadi pembatalan PO dengan pengembalian uang kepada pelanggan:
$$\text{Refund Maksimal} = \text{Total Pembayaran Diterima} - \text{Total Refund Sebelumnya}$$
Sistem menolak nominal refund yang melebihi hak sisa pembayaran pelanggan.

### D. Penanganan Pembatalan PO Berdasarkan Status Fisik Barang
1. **Jika barang belum tiba dari supplier (`procurement_status` $\neq$ `RECEIVED`):**
   - Pembatalan tidak memengaruhi stok fisik (`physical_stock` tidak berubah).
   - Menghitung hak refund pelanggan dan menandai PO sebagai `CANCELLED`.
2. **Jika barang sudah tiba dan telah direservasi (`procurement_status = RECEIVED` & `reserved_stock` > 0):**
   - Pembatalan melepaskan reservasi (`reserved_stock` berkurang).
   - Barang fisik **tetap berada di toko** dan dialihkan menjadi barang ready stock siap jual (`available_stock` bertambah).
   - Menghitung hak refund pelanggan dan menandai PO sebagai `CANCELLED`.

---

## 3. Spesifikasi API Endpoints (`server.js`)

| Method | Endpoint | Fungsi | Autentikasi |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/po/create` | Membuat pesanan PO baru (mendukung multi-item & DP awal). | Bearer Token |
| `GET` | `/api/po/list` | Mengambil daftar PO dengan filter status, tanggal, dan pencarian. | Bearer Token |
| `GET` | `/api/po/detail` | Mengambil rincian PO, histori pembayaran, dan histori mutasi stok. | Bearer Token |
| `POST` | `/api/po/payment` | Mencatat pembayaran tambahan (DP lanjutan atau Pelunasan). | Bearer Token |
| `POST` | `/api/po/procurement` | Mengubah status pengadaan supplier (`ORDERED`, `RECEIVED`). | Bearer Token |
| `POST` | `/api/po/allocate` | Mem-booking stok fisik yang telah tiba untuk PO tersebut. | Bearer Token |
| `POST` | `/api/po/fulfill` | Menyerahkan barang ke pelanggan (`DELIVERED`). | Bearer Token |
| `POST` | `/api/po/cancel` | Membatalkan PO, melepaskan reservasi stok, dan mencatat refund. | Bearer Token |

---

## 4. Rancang Bangun Antarmuka (`preorder.html` & `preorder.js`)

1. **Dashboard Metrik PO:**
   - Total PO Aktif (Berjalan).
   - Total Dana Titipan DP (Liabilitas).
   - Total PO Siap Serah (`READY_FOR_PICKUP`).
   - Total Omzet PO Diakui Bulan Berjalan.
2. **Tabel Manajemen Pre-Order:**
   - Kolom: No. PO, Tanggal, Pelanggan, Varian Produk, Qty, Total Tagihan, Terbayar, Sisa, Status Bayar, Status Pengadaan, Status Penyerahan, Aksi.
   - Filter cepat berdasarkan: Status Bayar (`UNPAID`, `PARTIAL`, `PAID`), Status Pengadaan, dan Status Penyerahan.
3. **Modal Aksi Operasional:**
   - **Modal Tambah PO:** Formulir pelanggan, pilihan varian, estimasi kedatangan, target supplier, dan opsi pembayaran DP langsung.
   - **Modal Catat Pembayaran:** Input nominal bayar, metode pembayaran (QRIS, Transfer BCA, Cash), dan otomatisasi deteksi lunas.
   - **Modal Update Status Pengadaan:** Tombol 1-klik transisi dari `NOT_ORDERED` $\to$ `ORDERED` $\to$ `RECEIVED`.
   - **Modal Serah Terima Barang:** Konfirmasi penyerahan barang dengan validasi pelunasan (peringatan jika belum lunas).
   - **Modal Pembatalan & Refund:** Input alasan pembatalan dan kalkulasi otomatis batas maksimal refund.
   - **Generator Pesan WhatsApp:** Menghasilkan template pesan WhatsApp resmi untuk mengabari customer mengenai DP diterima, barang telah tiba, atau instruksi pelunasan.

---

## 5. Rencana Pengujian Otomatis (10 Skenario Kritis)

Akan dibuat berkas test suite khusus: `tests/test_phase_3d_preorder.js` yang menguji:
1. Pembuatan PO dengan DP awal (pencatatan status `PARTIAL`, omzet belum diakui).
2. Pembuatan PO tanpa DP (`UNPAID`).
3. Pelunasan PO bertahap (pembayaran kedua mencapai total tagihan, status menjadi `PAID`, `settlement_date` tercatat).
4. Pengakuan omzet bulanan murni pada bulan pelunasan (`settlement_date`), bukan saat DP.
5. Pembaruan status pengadaan supplier (`ORDERED` $\to$ `RECEIVED`).
6. Alokasi stok fisik: `reserveStock` mengunci stok (`reserved_stock` bertambah, `available_stock` berkurang).
7. Penyerahan barang (`fulfillPO`): memotong fisik dan melepaskan reservasi, **tanpa pengakuan omzet ganda**.
8. Pembatalan PO sebelum barang tiba (hanya memproses refund, stok fisik tidak berubah).
9. Pembatalan PO setelah barang tiba (melepaskan reservasi, memulihkan `available_stock`, refund sesuai batas hak bayar).
10. Validasi batas refund kumulatif (menolak pengembalian dana melebihi total pembayaran riil).

---

## 6. Batasan Kerja (Boundary Enforcement)
Pekerjaan dilaksanakan **HANYA** untuk Sub-Modul 2. Sub-Modul 3 (Pembelian Stok Supplier) dan Sub-Modul 4 (Beban Operasional) tidak akan disentuh sebelum Sub-Modul 2 diverifikasi dan disetujui.
