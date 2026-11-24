# PANDUAN PERSIAPAN & SETUP SANDBOX GOOGLE APPS SCRIPT (PHASE 3E.3A)

**CrocsCircle.ID — Sistem Manajemen Finansial, Inventaris, dan Etalase Digital**  
**Tanggal:** 19 November 2026  
**Status:** **PHASE 3E.3A READY — MENUNGGU SETUP SANDBOX OLEH OWNER**  
**Tujuan:** Memberikan panduan langkah demi langkah yang aman, terisolasi, dan tanpa risiko untuk menghubungkan backend CrocsCircle ke **Google Sheets Sandbox Riil** dan **Google Apps Script Live**.

---

## 1. Klarifikasi Temuan Audit: Masa Berlaku Session (TTL)

Berdasarkan audit langsung pada kode sumber [`src/backend/AuthService.gs:15`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/AuthService.gs#L15):
```javascript
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 Jam
```

- **Masa Berlaku Aktual:** **Tepat 8 Jam (8 Hours)**.
- **Konsistensi dengan Phase 2A:** Nilai ini konsisten sejak awal implementasi Phase 2A dan tidak pernah diubah di kode backend.
- **Penyebab Keraguan:** Pada pengujian `test_phase_3e2_gas_sheets_integration.js`, penguji memajukan waktu 25 jam untuk memastikan token kadaluwarsa, lalu narasi laporan secara tidak sengaja menuliskan "24 jam". Asersi dan komentar pengujian kini telah diselaraskan kembali ke **8 Jam**.
- **Mekanisme Keamanan:**
  1. Masa berlaku dihitung saat login: `expiresAt = new Date(now.getTime() + SESSION_TTL_MS)`.
  2. Disimpan di kolom `session_expires_at` pada tabel `USERS`.
  3. Divalidasi di backend GAS pada setiap request melalui `AuthService.validateSession(token)`.
  4. Pencabutan (`logout`) menghapus token dari database secara seketika.

---

## 2. Prinsip Keamanan & Otorisasi Akun Google

> [!CAUTION]
> **ATURAN KEAMANAN UTAMA:**
> 1. **JANGAN PERNAH** membagikan password akun Google, password email, atau API token ke dalam percakapan chat.
> 2. Seluruh proses otorisasi dilakukan secara mandiri oleh Owner langsung melalui antarmuka web resmi Google ([https://accounts.google.com](https://accounts.google.com)).
> 3. Spreadsheet yang digunakan adalah **Spreadsheet Sandbox Baru**, bukan spreadsheet produksi CrocsCircle.

---

## 3. Langkah-Langkah Setup Sandbox Google Sheets & Apps Script

### Langkah 1: Buat Spreadsheet Sandbox di Google Drive
1. Buka browser dan kunjungi: [https://sheets.new](https://sheets.new).
2. Beri nama spreadsheet: **`CrocsCircle - DB Sandbox Test`**.
3. Salin **Spreadsheet ID** dari URL di address bar browser Anda:
   ```
   https://docs.google.com/spreadsheets/d/[SALIN_SPREADSHEET_ID_DI_SINI]/edit
   ```
   *(Spreadsheet ID adalah rangkaian panjang karakter acak di antara `/d/` dan `/edit`).*

---

### Langkah 2: Buka Editor Google Apps Script (Container-Bound)
1. Di dalam spreadsheet `CrocsCircle - DB Sandbox Test` yang baru dibuat, klik menu:
   **Ekstensi (Extensions)** $\rightarrow$ **Apps Script**.
2. Tab baru editor Google Apps Script akan terbuka, otomatis terikat (*container-bound*) ke spreadsheet sandbox ini.
3. Beri nama proyek di kiri atas: **`CrocsCircle Backend (Sandbox)`**.

---

### Langkah 3: Konfigurasi Manifest (`appsscript.json`)
1. Di editor Apps Script, klik ikon roda gigi **Project Settings** di bilah kiri.
2. Centang opsi: **"Show 'appsscript.json' manifest file in editor"**.
3. Kembali ke tab editor berkas (ikon `< >` di bilah kiri), klik berkas **`appsscript.json`**, lalu ganti isinya dengan konfigurasi resmi dari [`appsscript.json`](file:///d:/Documents/GitHub/CrocsCircle-Website/appsscript.json):
   ```json
   {
     "timeZone": "Asia/Jakarta",
     "dependencies": {
       "enabledAdvancedServices": []
     },
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8",
     "webapp": {
       "executeAs": "USER_DEPLOYING",
       "access": "ANYONE"
     },
     "oauthScopes": [
       "https://www.googleapis.com/auth/spreadsheets",
       "https://www.googleapis.com/auth/script.external_request",
       "https://www.googleapis.com/auth/script.scriptapp"
     ]
   }
   ```
4. Klik tombol **Save** (ikon disket).

---

### Langkah 4: Salin Berkas Backend `.gs` ke Editor Apps Script
Buat berkas skrip baru di editor Apps Script (klik tombol `+` di sebelah Files $\rightarrow$ pilih **Script**), lalu salin kode dari repositori lokal:

| No | Nama Berkas di Apps Script | Sumber Berkas Lokal |
| :---: | :--- | :--- |
| 1 | `DatabaseHelper` | [`src/backend/DatabaseHelper.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/DatabaseHelper.gs) |
| 2 | `InitDatabase` | [`src/backend/InitDatabase.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/InitDatabase.gs) |
| 3 | `AuthService` | [`src/backend/AuthService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/AuthService.gs) |
| 4 | `InventoryService` | [`src/backend/InventoryService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/InventoryService.gs) |
| 5 | `SalesService` | [`src/backend/SalesService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/SalesService.gs) |
| 6 | `POService` | [`src/backend/POService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/POService.gs) |
| 7 | `VendorService` | [`src/backend/VendorService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/VendorService.gs) |
| 8 | `FinancialService` | [`src/backend/FinancialService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/FinancialService.gs) |
| 9 | `ClosingService` | [`src/backend/ClosingService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/ClosingService.gs) |
| 10 | `ProductService` | [`src/backend/ProductService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/ProductService.gs) |
| 11 | `AdminController` | [`src/backend/AdminController.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/AdminController.gs) |
| 12 | `StorefrontService` | [`src/backend/StorefrontService.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/StorefrontService.gs) |
| 13 | `WebAppRouter` | [`src/backend/WebAppRouter.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/WebAppRouter.gs) |

*(Klik **Save All** setelah seluruh berkas selesai disalin).*

---

### Langkah 5: Jalankan Inisialisasi Database Pertama Kali
1. Buka berkas `InitDatabase` di editor Apps Script.
2. Pada dropdown pilihan fungsi di toolbar atas (sebelah tombol "Debug"), pilih fungsi: **`initializeCrocsCircleDatabase`**.
3. Klik tombol **Run** (Jalankan).
4. **Layar Otorisasi Google akan muncul:**
   - Google akan menampilkan jendela pop-up: *"Authorization Required / Perlu Otorisasi"*.
   - Klik **Review permissions** (Tinjau izin) $\rightarrow$ pilih akun Google Anda.
   - Jika muncul peringatan *"Google hasn't verified this app"*, klik **Advanced (Lanjutan)** di kiri bawah $\rightarrow$ klik **Go to CrocsCircle Backend (unsafe)**.
   - Layar izin akan menampilkan 3 scope:
     1. *See, edit, create, and delete your Google Sheets spreadsheets* (Untuk operasi baca/tulis database spreadsheet).
     2. *Connect to an external service* (Untuk fetch API).
     3. *Allow this application to run when you are not present* (Untuk script execution).
   - Klik **Allow (Izinkan)**.
5. Fungsi `initializeCrocsCircleDatabase()` akan berjalan sekitar 10–20 detik.
6. Buka kembali tab Google Sheets `CrocsCircle - DB Sandbox Test`.
7. **Verifikasi Visual:** Anda akan melihat **seluruh 26 tab tabel** terbentuk rapi dengan baris header berwarna hijau tua (`#173B35`) dan teks putih tebal!

---

### Langkah 6: Deploy Web App Sandbox (Versi Pengujian)
1. Di editor Apps Script, klik tombol biru **Deploy** di kanan atas $\rightarrow$ pilih **New deployment**.
2. Klik ikon gerigi (Select type) di sebelah kiri $\rightarrow$ pilih **Web app**.
3. Isi parameter deployment:
   - **Description:** `CrocsCircle Sandbox Test V1`
   - **Execute as:** `Me (email Anda)`
   - **Who has access:** `Anyone` *(Penting agar browser dapat mengakses endpoint tanpa login akun Google)*
4. Klik tombol **Deploy**.
5. Salin **Web app URL** yang muncul (contoh format: `https://script.google.com/macros/s/AKfycbx.../exec`).

---

### Langkah 7: Hubungkan Web App URL ke Frontend Lokal
Buka berkas [`src/frontend/js/api_client.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/frontend/js/api_client.js) di repositori lokal Anda, lalu masukkan Web App URL yang baru disalin pada konfigurasi:
```javascript
const API_CONFIG = {
  TOKEN_KEY: "crocscircle_admin_token",
  USER_KEY: "crocscircle_admin_user",
  MODE: "GAS", // Ganti mode ke "GAS" untuk live testing
  LOCAL_GATEWAY: "/exec",
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbx.../exec" // Tempel URL Sandbox di sini
};
```

---

## 4. Rencana Pengujian Phase 3E.3B (Live Verification Checklist)

Setelah Langkah 1 s/d 7 selesai dilakukan oleh Owner, kita akan melakukan pengujian live berikut:

- [ ] **Test Live 1 (Login & User):** Setup akun Owner pertama via `AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!")`, lalu login dari browser dan periksa tabel `USERS` di Google Sheets riil apakah baris user dan token terisi.
- [ ] **Test Live 2 (Master Produk):** Tambah 1 produk dan varian ukuran, periksa apakah baris baru muncul di sheet `MASTER_PRODUK` dan `VARIAN_PRODUK`.
- [ ] **Test Live 3 (Pembelian Supplier):** Catat faktur pembelian, terima barang fisik, periksa apakah stok bertambah di sheet `STOK` dan mutasi tercatat di `MUTASI_STOK` serta `DETAIL_PEMBELIAN`.
- [ ] **Test Live 4 (Kasir POS & FIFO):** Lakukan penjualan tunai di browser, verifikasi apakah stok berkurang di sheet `STOK` dan baris penjualan masuk di sheet `PENJUALAN` serta `DETAIL_PENJUALAN`.
- [ ] **Test Live 5 (Pre-Order):** Buat 1 PO, catat DP, alokasikan stok, dan catat pelunasan. Periksa sheet `PRE_ORDER` dan `PEMBAYARAN_PO`.
- [ ] **Test Live 6 (Beban Operasional):** Catat pengeluaran operasional dan periksa sheet `PENGELUARAN`.
- [ ] **Test Live 7 (Tutup Buku Bulanan):** Eksekusi Tutup Buku dari browser, periksa snapshot di sheet `CLOSING_BULANAN`, penguncian status di `PERIODE_KEUANGAN`, dan pembagian laba di `PEMBAGIAN_KEUNTUNGAN`.

---

## 5. Status & Menunggu Aksi Owner

> [!IMPORTANT]
> **Tahap Phase 3E.3A (Persiapan Teknis & Dokumentasi Setup) SELESAI.**
> Silakan ikuti **Langkah 1 s/d 6** di atas untuk membuat spreadsheet sandbox dan deploy Web App.
> 
> Setelah selesai, cukup berikan **Web App URL Sandbox** Anda di sini agar kita dapat melanjutkan eksekusi **Phase 3E.3B (Pengujian Live Google Sheets & Browser)**.
