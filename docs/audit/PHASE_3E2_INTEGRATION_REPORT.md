# LAPORAN IMPLEMENTASI PHASE 3E.2: GOOGLE APPS SCRIPT & GOOGLE SHEETS INTEGRATION

**CrocsCircle.ID — Sistem Manajemen Finansial, Inventaris, dan Etalase Digital**  
**Tanggal:** 19 November 2026  
**Status:** **APPROVED & COMPLETED (TEST SPREADSHEET ONLY — ZERO LIVE MUTATION)**  
**Cakupan:** Audit Kompatibilitas V8 Runtime, Manifest `appsscript.json`, Abstraksi Koneksi Google Sheets (`PropertiesService` & Container-bound), Token Security in Request Body, Dynamic Header Mapping, Safe Idempotency (No `.clear()`), Browser CORS Preflight Bypass (`text/plain`), dan Integration Test Suite Phase 3E.2.

---

## 1. Executive Summary

Phase 3E.2 memvalidasi kesiapan integrasi seluruh backend `.gs` CrocsCircle.ID pada lingkungan **Google Apps Script (GAS) Runtime V8** dan **Google Sheets Database** dengan memisahkan pengujian secara ketat pada spreadsheet pengujian terisolasi (`TEST_SPREADSHEET_ID = "SS_TEST_CROCS_PHASE_3E2"`).

Seluruh temuan dan instruksi Owner pada review Phase 3E.1 telah diimplementasikan:
1. **Prioritas Token di Request Body:** Token autentikasi untuk aksi mutasi (POST) dan endpoint sensitif kini diekstraksi dan diprioritaskan dari request body JSON (`body.token` / `body.auth_token`), bukan URL query parameter, mencegah kebocoran riwayat browser atau server access log.
2. **Kompabilitas Browser & CORS Preflight Bypass:** Dibangun client adapter [`src/frontend/js/api_client.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/frontend/js/api_client.js) yang menggunakan header `Content-Type: text/plain;charset=utf-8` saat memanggil GAS Web App, mencegah browser mengirimkan `OPTIONS` preflight request yang tidak didukung oleh GAS.
3. **Abstraksi Koneksi Spreadsheet Ganda:** [`src/backend/DatabaseHelper.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/DatabaseHelper.gs) kini mendukung Standalone GAS Script (melalui Script Properties `SPREADSHEET_ID`) maupun Container-bound Script (`SpreadsheetApp.getActiveSpreadsheet()`).
4. **Manifest Proyek GAS:** Berkas [`src/backend/appsscript.json`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/appsscript.json) telah dibuat dengan runtime V8, zona waktu `Asia/Jakarta`, dan izin OAuth minimal.

### Ringkasan Hasil Pengujian:
- **Total Test Suites:** **28 / 28 Test Suites PASS (100%)**
- **Total Assertions:** **848 Assertions PASS (0 Fail, 0 Skipped)**
  - *Baseline Phase 3E.1:* 816 assertions dipertahankan utuh.
  - *Phase 3E.2 Integration Test:* 32 assertions baru lulus 100% pada [`tests/test_phase_3e2_gas_sheets_integration.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/tests/test_phase_3e2_gas_sheets_integration.js).
- **Integritas Spreadsheet Produksi:** **TIDAK ADA mutasi data riil atau koneksi ke spreadsheet produksi CrocsCircle.** Seluruh pengujian berjalan pada instance pengujian terisolasi.

---

## 2. Dokumentasi Konfigurasi Google Apps Script

### 2.1. Manifest Proyek (`appsscript.json`)
File manifest resmi disimpan pada [`src/backend/appsscript.json`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/appsscript.json):
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

### 2.2. Mode Deployment Web App
- **Execute As:** `USER_DEPLOYING` (Script berjalan menggunakan akun Google pengembang/pemilik, sehingga pengguna frontend tidak memerlukan akun Google untuk belanja atau input kasir).
- **Access:** `ANYONE` (Membuka akses untuk etalase publik pelanggan dan aplikasi web; keamanan login internal dilindungi oleh token HMAC-SHA256 sesi CrocsCircle).

---

## 3. Dokumentasi Koneksi Google Sheets & DatabaseHelper

### 3.1. Abstraksi Koneksi Hybrid
Modul [`src/backend/DatabaseHelper.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/DatabaseHelper.gs) dirancang agar fleksibel dan aman:

```javascript
function getSpreadsheet() {
  if (typeof PropertiesService !== "undefined" && PropertiesService.getScriptProperties) {
    try {
      const propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
      if (propId && propId.trim() !== "") {
        return SpreadsheetApp.openById(propId.trim());
      }
    } catch (e) {}
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  
  throw new Error("Spreadsheet database tidak dapat diakses...");
}
```

- **Standalone Script:** Mengambil ID Spreadsheet dari Script Properties Google Apps Script (`Project Settings > Script Properties > SPREADSHEET_ID`).
- **Container-bound Script:** Otomatis mendeteksi spreadsheet tempat script terikat.
- **Isolasi Pengujian:** Pengujian unit dan integrasi menggunakan ID terisolasi (`SS_TEST_CROCS_PHASE_3E2`) tanpa menyentuh spreadsheet produksi.

### 3.2. Dynamic Header Mapping & Safe Idempotency
- **Dynamic Header Mapping:** Kolom tabel dibaca baris per baris menggunakan nama kolom header (1-based index). Pergeseran posisi kolom fisik di spreadsheet tidak akan mematahkan pembacaan atau penulisan data.
- **No `.clear()` Guard:** Fungsi `ensureTable()` memeriksa keberadaan sheet dan kolom. Jika sheet sudah ada dan memiliki data, sistem **TIDAK PERNAH** memanggil `.clear()` atau menghapus baris. Jika ada kolom baru pada schema, kolom baru ditambahkan di paling kanan secara aman.

---

## 4. Analisis Kompatibilitas Runtime V8

Audit menyeluruh telah dilakukan pada seluruh 14 berkas backend `.gs`:

| Nama Berkas | Kompatibilitas V8 | Dependensi Node.js | Keterangan |
| :--- | :---: | :---: | :--- |
| `DatabaseHelper.gs` | **100% Kompatibel** | TIDAK ADA | Menggunakan `SpreadsheetApp`, `LockService`, `PropertiesService` native GAS |
| `InitDatabase.gs` | **100% Kompatibel** | TIDAK ADA | Schema skrip murni JavaScript V8 |
| `AuthService.gs` | **100% Kompatibel** | TIDAK ADA | PBKDF2 menggunakan `Utilities.computeHmacSha256Signature` |
| `InventoryService.gs`| **100% Kompatibel** | TIDAK ADA | Logika FIFO, validasi batch, dan mutasi stok murni V8 |
| `SalesService.gs` | **100% Kompatibel** | TIDAK ADA | Integrasi kasir POS dan split-batch FIFO murni V8 |
| `POService.gs` | **100% Kompatibel** | TIDAK ADA | Logika alokasi dan pelunasan PO murni V8 |
| `VendorService.gs` | **100% Kompatibel** | TIDAK ADA | Rekonsiliasi vendor murni V8 |
| `FinancialService.gs`| **100% Kompatibel** | TIDAK ADA | Perhitungan akrual Laba Rugi & Arus Kas murni V8 |
| `ClosingService.gs` | **100% Kompatibel** | TIDAK ADA | Tutup buku, reopen, dan pos dana murni V8 |
| `ProductService.gs` | **100% Kompatibel** | TIDAK ADA | Manajemen master katalog produk murni V8 |
| `AdminController.gs` | **100% Kompatibel** | TIDAK ADA | Controller sesi dan dashboard operasional murni V8 |
| `StorefrontService.gs`| **100% Kompatibel** | TIDAK ADA | Etalase digital dan validasi keranjang murni V8 |
| `WebAppRouter.gs` | **100% Kompatibel** | TIDAK ADA | Entri `doGet`/`doPost` dan `ContentService` murni V8 |
| `TestAuthAndDatabase.gs`| **100% Kompatibel**| TIDAK ADA | Runner script internal GAS |

**Kesimpulan:** Seluruh kode backend adalah **Vanilla JavaScript ECMAScript 6+ murni** yang didukung secara penuh oleh Google Apps Script V8 Runtime. Tidak ada panggilan `require()`, `process`, `Buffer`, atau `__dirname`.

---

## 5. Autentikasi dan Keamanan Produksi

### 5.1. Prioritas Token di Request Body
Pada [`src/backend/WebAppRouter.gs`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/backend/WebAppRouter.gs), parser request memprioritaskan ekstraksi token dari payload body:
```javascript
let token = null;
let tokenLocation = "NONE";

if (body && (body.token || body.auth_token)) {
  token = body.token || body.auth_token;
  tokenLocation = "BODY";
} else if (parameter && (parameter.token || parameter.auth_token)) {
  token = parameter.token || parameter.auth_token;
  tokenLocation = "URL";
}
```
Client frontend [`src/frontend/js/api_client.js`](file:///d:/Documents/GitHub/CrocsCircle-Website/src/frontend/js/api_client.js) secara otomatis menyematkan token ke dalam payload JSON `body.token` untuk seluruh permintaan terotentikasi.

### 5.2. Verifikasi Masa Berlaku & Pencabutan Sesi
- **Session TTL:** 24 jam sejak waktu login terakhir.
- **Session Expiration Test:** Sesi yang telah lewat dari 24 jam ditolak dengan `401 Unauthorized`.
- **Session Revocation (Logout):** Memanggil aksi `auth/logout` menghapus token dari database spreadsheet, sehingga token tersebut tidak dapat digunakan lagi.
- **Brute-Force Lockout:** 5 kali percobaan password salah berturut-turut memicu penguncian akun selama 15 menit.

### 5.3. Role-Based Access Control (RBAC) & Sanitasi HPP
- Seluruh 11 endpoint laporan dan aksi finansial Owner (`reports/income-statement`, `reports/cash-flow`, `closing/close-period`, dll.) terlindungi oleh hard guard di router: role selain `OWNER` **langsung ditolak dengan 403 Forbidden**.
- Pada riwayat penjualan (`sales/list`), data HPP, COGS, unit cost, dan laba kotor disanitasi (dihapus) secara rekursif untuk akun role `ADMIN`.

---

## 6. Kompatibilitas Browser & API Gateway

```mermaid
sequenceDiagram
    autonumber
    actor Browser as Browser Client (Frontend / POS)
    participant GAS as Google Apps Script (doPost)
    participant GDrive as Google Redirect Storage (googleusercontent.com)
    participant Backend as Backend Engine & DatabaseHelper
    participant Sheets as Google Sheets (Test Spreadsheet)

    Note over Browser,GAS: Menggunakan Content-Type: text/plain;charset=utf-8<br/>untuk Mencegah OPTIONS Preflight CORS
    Browser->>GAS: POST /exec (body: JSON { action, token, ... })
    GAS->>Backend: WebAppRouter.handleRequest("POST", e)
    Backend->>Sheets: DatabaseHelper CRUD via SpreadsheetApp API
    Sheets-->>Backend: Data Spreadsheet
    Backend-->>GAS: Payload Response JSON
    GAS-->>GDrive: ContentService.createTextOutput(JSON) (302 Found)
    GDrive-->>Browser: 200 OK (Access-Control-Allow-Origin: *) + JSON Data
```

### Penanganan Khusus GAS Web App:
1. **CORS Preflight:** Menggunakan `Content-Type: text/plain;charset=utf-8` pada `fetch` browser. GAS tetap dapat membaca JSON string melalui `e.postData.contents`, dan browser tidak mengirimkan preflight `OPTIONS` yang menyebabkan error 405.
2. **302 Redirect Handling:** Response `ContentService` secara otomatis memicu redirect 302 ke `script.googleusercontent.com`. `ApiClient` mengonfigurasi `redirect: "follow"` sehingga browser menerima hasil JSON akhir secara transparan.

---

## 7. Bukti Verifikasi Pengujian (Test Suite Evidence)

### 7.1. Hasil Eksekusi `tests/test_phase_3e2_gas_sheets_integration.js`
```
================================================================================
CROCSCIRCLE.ID — PHASE 3E.2 INTEGRATION TEST SUITE
Google Apps Script V8 Runtime & Google Sheets Integration
================================================================================

--- BAGIAN 1: AUDIT RUNTIME V8 & SPREADSHEET CONNECTION ---
  ✓ PASS: Manifest appsscript.json tersedia di src/backend/
  ✓ PASS: Manifest mengonfigurasi runtimeVersion: V8
  ✓ PASS: Manifest mengonfigurasi timeZone: Asia/Jakarta
  ✓ PASS: Manifest mengonfigurasi webapp access: ANYONE
  ✓ PASS: Manifest mengonfigurasi webapp executeAs: USER_DEPLOYING
  ✓ PASS: DatabaseHelper terhubung ke SPREADSHEET_ID terkonfigurasi (Script Properties)
  ✓ PASS: DatabaseHelper fallback ke Container-bound spreadsheet saat properti kosong

--- BAGIAN 2: DATABASE HELPER & SCHEMA INTEGRITY ---
  ✓ PASS: Inisialisasi database awal pada spreadsheet pengujian berhasil
  ✓ PASS: Semua 26 tabel schema.json terverifikasi ada di spreadsheet
  ✓ PASS: HeaderMap membaca kolom USERS secara dinamis
  ✓ PASS: Idempotent Re-Init: Data eksisting tetap utuh tanpa terhapus (No .clear())

--- BAGIAN 3: AUTHENTICATION & SESSION IN BODY ---
  ✓ PASS: Owner login berhasil
  ✓ PASS: Admin login berhasil
  ✓ PASS: Token di Request BODY berhasil diverifikasi
  ✓ PASS: Sesi kedaluwarsa (>24 jam) ditolak dengan 401
  ✓ PASS: Sesi berhasil dicabut melalui logout
  ✓ PASS: Token yang telah di-logout tidak dapat digunakan lagi
  ✓ PASS: Proteksi Lockout aktif setelah 5x gagal login

--- BAGIAN 4: BROWSER & API COMPATIBILITY ---
  ✓ PASS: Response ContentService menghasilkan MIME type application/json
  ✓ PASS: Browser text/plain payload berhasil diurai oleh doPost
  ✓ PASS: Admin DITOLAK (403) pada Laporan Laba Rugi Owner
  ✓ PASS: Owner BERHASIL mengakses Laporan Laba Rugi (200 OK)

--- BAGIAN 5: END-TO-END LIFECYCLE PADA SPREADSHEET PENGUJIAN ---
  ✓ PASS: Faktur pembelian dibuat pada spreadsheet pengujian
  ✓ PASS: Penerimaan fisik barang dicatat dan stok bertambah
  ✓ PASS: Stok fisik di STOK bertambah menjadi 10 pasang
  ✓ PASS: Pembayaran termin dicatat di PEMBAYARAN_PEMBELIAN
  ✓ PASS: Transaksi penjualan POS berhasil memotong stok FIFO
  ✓ PASS: Stok fisik berkurang menjadi 8 pasang
  ✓ PASS: Beban operasional dicatat di spreadsheet pengujian
  ✓ PASS: Preview Tutup Buku berhasil dihasilkan
  ✓ PASS: Tutup buku berhasil dieksekusi pada spreadsheet pengujian
  ✓ PASS: Status PERIODE_KEUANGAN terkunci (CLOSED)

================================================================================
PHASE 3E.2 TEST SUMMARY:
Total Assertions : 32
Passed           : 32
Failed           : 0
================================================================================
```

### 7.2. Hasil Eksekusi Seluruh Suite Regresi (28 Test Suites)
```
====================================================
FULL REGRESSION RESULT:
Passed Suites : 28 / 28
Failed Suites : 0
Total Assertions: 848 PASS
====================================================
```

---

## 8. Status & Komitmen

> [!IMPORTANT]
> **Tahap Phase 3E.2 telah SELESAI SECARA SEMPURNA.**
> Sesuai arahan Owner:
> 1. Pengerjaan **BERHENTI DI SINI**.
> 2. **TIDAK ADA deployment ke Google Apps Script produksi.**
> 3. **TIDAK ADA mutasi data pada spreadsheet produksi CrocsCircle.**
> 
> Tahap deployment produksi hanya akan dilakukan setelah peninjauan dan izin tertulis dari Owner.
