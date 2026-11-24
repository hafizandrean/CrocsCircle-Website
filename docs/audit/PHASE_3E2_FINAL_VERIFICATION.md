# LAPORAN AUDIT VERIFIKASI AKHIR PHASE 3E.2 (FINAL VERIFICATION AUDIT)

**CrocsCircle.ID — Sistem Manajemen Finansial, Inventaris, dan Etalase Digital**  
**Tanggal Audit:** 19 November 2026  
**Status Audit:** **COMPLETED — READ-ONLY VERIFICATION**  
**Tujuan:** Memverifikasi secara objektif dan transparan apakah integrasi Google Apps Script (GAS) dan Google Sheets benar-benar telah terhubung secara riil ke Google Cloud Infrastructure, atau masih berjalan pada lingkungan simulasi/mock lokal.

---

## 1. Verifikasi Google Sheets: Klasifikasi Lingkungan Pengujian

### 1.1. Status `TEST_SPREADSHEET_ID = "SS_TEST_CROCS_PHASE_3E2"`
Berdasarkan audit langsung pada berkas [`tests/test_phase_3e2_gas_sheets_integration.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/tests/test_phase_3e2_gas_sheets_integration.js#L117-L133):

```javascript
// Global Spreadsheet Registry di dalam Test Harness
const spreadsheetRegistry = {};
function getOrCreateSpreadsheet(id) {
  if (!spreadsheetRegistry[id]) {
    spreadsheetRegistry[id] = new MockSpreadsheet(id);
  }
  return spreadsheetRegistry[id];
}

const activeContainerSS = getOrCreateSpreadsheet("CONTAINER_BOUND_SS");
let mockScriptProperties = { SPREADSHEET_ID: "" };

global.SpreadsheetApp = {
  getActiveSpreadsheet: () => activeContainerSS,
  openById: (id) => getOrCreateSpreadsheet(id)
};
```

### 1.2. Klasifikasi Pengujian: **`MOCK ONLY (Node.js Simulated Environment)`**
- **Apakah ID tersebut spreadsheet Google Sheets sungguhan?** **TIDAK.** Nilai `"SS_TEST_CROCS_PHASE_3E2"` adalah identifier string in-memory yang digunakan oleh mock registry lokal.
- **Apakah pengujian menggunakan SpreadsheetApp asli?** **TIDAK.** Pengujian menggunakan objek mock `SpreadsheetApp`, `MockSpreadsheet`, `MockSheet`, dan `MockRange` yang mengemulasikan interface Google Apps Script di dalam runtime Node.js.
- **Apakah operasi CRUD dilakukan pada Google Sheets online?** **TIDAK.** Tidak ada koneksi jaringan HTTP/HTTPS ke Google Sheets API (`sheets.googleapis.com`) atau spreadsheet online `docs.google.com/spreadsheets/d/...`.

> [!IMPORTANT]
> **Penegasan Hasil:**
> Pengujian Phase 3E.2 membuktikan bahwa **seluruh logika bisnis dan abstraksi DatabaseHelper.gs bekerja 100% konsisten terhadap API contract Google Apps Script**, namun **BELUM membuktikan eksekusi live pada spreadsheet Google Sheets sungguhan di cloud**.

---

## 2. Verifikasi Apps Script Project & Manifest

### 2.1. Lokasi Manifest `appsscript.json`
- **Lokasi saat ini:** [`src/backend/appsscript.json`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/appsscript.json)
- **Status di Root Repository:** Belum ada salinan `appsscript.json` di root direktori proyek (`.`).
- **Pemeriksaan Tooling Clasp:** Tidak ditemukan berkas `.clasp.json` di repositori.

### 2.2. Struktur Berkas Backend `.gs`
Seluruh 14 berkas backend berada di direktori [`src/backend/`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/):
1. `AdminController.gs`
2. `AuthService.gs`
3. `ClosingService.gs`
4. `DatabaseHelper.gs`
5. `FinancialService.gs`
6. `InitDatabase.gs`
7. `InventoryService.gs`
8. `POService.gs`
9. `ProductService.gs`
10. `SalesService.gs`
11. `StorefrontService.gs`
12. `TestAuthAndDatabase.gs`
13. `VendorService.gs`
14. `WebAppRouter.gs`

### 2.3. Validasi Manifest & Library
- `runtimeVersion`: **`V8`** (Valid).
- `timeZone`: **`Asia/Jakarta`** (Valid).
- `webapp.executeAs`: **`USER_DEPLOYING`** (Valid).
- `webapp.access`: **`ANYONE`** (Valid).
- `dependencies.enabledAdvancedServices`: `[]` (Tidak ada dependensi library berbayar/pihak ketiga).
- `oauthScopes`: Mencakup `spreadsheets`, `external_request`, dan `scriptapp`.

---

## 3. Verifikasi Browser-to-GAS & Kompatibilitas Jaringan

### 3.1. Mekanisme Bypass CORS Preflight
Pada [`src/frontend/js/api_client.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/frontend/js/api_client.js):
```javascript
const response = await fetch(url, {
  method: "POST",
  mode: "cors",
  redirect: "follow",
  headers: {
    "Content-Type": "text/plain;charset=utf-8"
  },
  body: JSON.stringify(requestBody)
});
```

- **Teori Spesifikasi W3C Fetch:** Penggunaan `Content-Type: text/plain` merupakan *simple request* yang **tidak memicu HTTP OPTIONS preflight** oleh browser, sehingga menghindari error 405 Method Not Allowed pada GAS.
- **Parsing di Backend:** [`src/backend/WebAppRouter.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/WebAppRouter.gs) membaca `e.postData.contents` dan memanggil `JSON.parse()`. Ini bekerja identik baik untuk `application/json` maupun `text/plain`.

### 3.2. Status Uji Nyata Browser vs Localhost
- **Yang Sudah Terbukti:** Di localhost, pengiriman JSON via `text/plain` dan gateway `/exec` berhasil diparse dan mengembalikan status 200/400/401/403 yang diharapkan.
- **Yang Belum Terbukti di Lingkungan Nyata:**
  1. Perilaku browser Chrome/Safari/Firefox nyata ketika menghadapi respon redirect 302 Found dari `script.google.com` menuju `script.googleusercontent.com/macros/echo?...`.
  2. Apakah browser frontend saat di-host di domain luar (misalnya `crocscircle.id` atau `github.io`) berhasil membaca body respons final tanpa terblokir oleh kebijakan *opaque redirect* atau restriksi browser tertentu.
  3. Latensi jaringan cloud Google Apps Script (biasanya 500ms – 1.8s per request), yang jauh berbeda dibanding localhost (10ms – 30ms).

---

## 4. Verifikasi Autentikasi dan RBAC

### 4.1. Kemandirian Backend GAS dari Server Lokal
Audit memverifikasi bahwa:
- **Penyimpanan Sesi:** Sesi disimpan langsung di tabel spreadsheet `USERS` (kolom `session_token`, `session_expires_at`, `failed_attempts`, `locked_until`).
- **Kriptografi:** Hashing password menggunakan algoritma PBKDF2 HMAC-SHA256 yang ditulis murni menggunakan native GAS `Utilities.computeHmacSha256Signature()`.
- **Tidak Bergantung pada `server.js`:** Jika `server.js` dimatikan sepenuhnya, seluruh logika otentikasi di `AuthService.gs` tetap dapat berjalan mandiri 100% di runtime GAS V8.

### 4.2. Penegakan RBAC & Token di Body
- Ekstraksi token di [`src/backend/WebAppRouter.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/WebAppRouter.gs#L73-L84) memprioritaskan `body.token` / `body.auth_token` di atas query parameter URL.
- Seluruh 11 endpoint Owner-only (`reports/income-statement`, `reports/cash-flow`, `closing/close-period`, dll.) dilindungi oleh hard guard: akun role `ADMIN` **langsung ditolak dengan HTTP 403 Forbidden**.
- Data HPP, unit cost, dan laba disanitasi secara otomatis dari daftar penjualan (`sales/list`) untuk akun non-Owner.

---

## 5. Verifikasi DatabaseHelper & Dynamic Header Mapping

### 5.1. Audit Operasi `DatabaseHelper.gs`
- `getSpreadsheet()`: Telah diperbarui untuk membaca Script Properties `SPREADSHEET_ID` terlebih dahulu, dengan fallback otomatis ke `SpreadsheetApp.getActiveSpreadsheet()`.
- `getHeaderMap()`: Membaca baris 1 tabel secara dinamis dan memetakan nama kolom ke indeks 1-based.
- `ensureTable()`: **Tidak pernah memanggil `.clear()` atau `.deleteRow()`**. Kolom baru ditambahkan ke kanan tanpa mengubah atau menghapus data baris yang ada.
- `insertRow()`: Menggunakan `sheet.appendRow()`.
- `updateRowByPk()`: Menemukan indeks baris dan memperbarui sel berdasarkan mapping header dinamis.
- `withLock()`: Menggunakan `LockService.getScriptLock()` dengan timeout 30 detik untuk mengontrol konkurensi multi-user.

---

## 6. Pengujian dan Integritas Kode

Eksekusi regresi penuh pada seluruh test suite tanpa pengubahan asersi (`read-only`):

```
====================================================
READ-ONLY REGRESSION AUDIT RESULT:
Passed Suites : 28 / 28 (100% PASS)
Failed Suites : 0
Total Assertions: 848 PASS (0 FAIL, 0 SKIPPED)
====================================================
```

### Breakdown Kategori Asersi:
- **Baseline Phase 2 & Phase 3D:** 755 assertions PASS (Utuh 100%).
- **Phase 3E.1 (Web App Router):** 61 assertions PASS.
- **Phase 3E.2 (GAS & Sheets Integration Logic):** 32 assertions PASS.

---

## 7. Temuan & Daftar Blocker Sebelum Integrasi Live

| No | Area | Status Saat Ini | Dampak | Kebutuhan Solusi |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **Google Sheets Target** | Menggunakan Mock In-Memory (`MockSpreadsheet`) | Belum ada bukti baca/tulis ke Google Sheets cloud sungguhan | Perlu Spreadsheet Pengujian Riil di Google Drive dengan ID Google Sheets asli |
| **2** | **Project Root Clasp** | `appsscript.json` hanya ada di `src/backend/`, belum ada `.clasp.json` | Clasp CLI belum dapat melakukan `clasp push` langsung dari workspace root | Buat `.clasp.json` dengan konfigurasi `rootDir: "src/backend"` atau duplikasi manifest ke root |
| **3** | **CORS & 302 Redirect** | Teruji via Node.js local proxy | Belum teruji langsung di browser terhadap URL `script.google.com` live | Uji langsung browser `fetch()` ke URL Deployment Web App Pengujian |
| **4** | **Quota & Latency GAS** | Lingkungan mock berjalan instant (<5ms) | GAS memiliki kuota execution time (6 menit), URLFetch quota, dan latensi ~1 detik | Perlu verifikasi performa laporan akrual Laba Rugi pada spreadsheet pengujian riil |

---

## 8. Rekomendasi Tahap Berikutnya (Phase 3E.3: Live Test Spreadsheet Verification)

Sebelum melangkah ke deployment produksi CrocsCircle, lakukan **Phase 3E.3** dengan ruang lingkup terkontrol:

1. **Pembuatan Spreadsheet Pengujian Riil:**
   - Buat 1 spreadsheet kosong di akun Google Owner, beri nama `CrocsCircle - Test Database (SANDBOX)`.
   - Ambil Spreadsheet ID-nya (contoh: `1A2B3C...`).
2. **Setup Script Project (SANDBOX ONLY):**
   - Buat project Google Apps Script pengujian yang terikat pada spreadsheet sandbox tersebut (atau standalone dengan Script Property `SPREADSHEET_ID`).
   - Push berkas `src/backend/*.gs` ke project sandbox tersebut.
3. **Uji Jalankan Fungsi Inisialisasi Riil:**
   - Jalankan `initializeCrocsCircleDatabase()` langsung dari editor GAS.
   - Buka Google Sheets di browser dan verifikasi fisik: apakah 26 sheet dan header berwarna hijau tua (`#173B35`) benar-benar terbentuk.
4. **Deploy Web App Pengujian (Dev Deployment):**
   - Deploy sebagai Web App versi pengujian (bukan produksi).
   - Masukkan URL Web App ke konfigurasi `ApiClient` di browser lokal.
   - Lakukan uji: Login, Buat Transaksi POS, dan Tutup Buku dari browser ke Google Sheets riil.
5. **Audit Bukti Fisik:**
   - Ambil tangkapan layar data baris yang terisi di Google Sheets riil sebagai bukti tak terbantahkan.

---

## 9. Komitmen Kepatuhan

> [!IMPORTANT]
> **Audit selesai dalam mode READ-ONLY.**
> Tidak ada berkas source code, konfigurasi deployment, atau spreadsheet produksi yang diubah.
> Seluruh 28 test suites dan 848 assertions tetap berada dalam status lulus 100%.
