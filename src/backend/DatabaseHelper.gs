/**
 * CROCSCIRCLE.ID — DATABASE HELPER
 * Version: 1.2.0
 * 
 * Abstraksi akses data berbasis Google Sheets dengan fitur:
 * - Dynamic Header Mapping (kebal terhadap pergeseran urutan kolom)
 * - Safe Idempotent Schema Management (tidak pernah menghapus data saat inisialisasi ulang)
 * - CRUD berdasarkan Primary Key
 * - Audit Trail Logging (`LOG_AKTIVITAS`)
 * - Concurrency Control (`LockService`)
 */

const DatabaseHelper = (function() {
  const BRAND_PRIMARY = "#173B35";
  const BRAND_SURFACE = "#FFFFFF";

  /**
   * Mendapatkan instance spreadsheet aktif atau berdasarkan Spreadsheet ID terkonfigurasi
   */
  function getSpreadsheet() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  /**
   * Mendapatkan sheet berdasarkan nama dengan validasi keberadaan
   */
  function getSheet(tableName) {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(tableName);
    if (!sheet) {
      throw new Error("Tabel '" + tableName + "' tidak ditemukan dalam database spreadsheet.");
    }
    return sheet;
  }

  /**
   * Membaca header baris pertama dan menghasilkan peta nama_kolom -> index_kolom (1-based)
   */
  function getHeaderMap(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return {};
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const map = {};
    headers.forEach((h, idx) => {
      if (h !== null && h !== undefined && String(h).trim() !== "") {
        map[String(h).trim()] = idx + 1;
      }
    });
    return map;
  }

  /**
   * Memastikan tabel ada dan memiliki header yang sesuai TANPA menghapus data yang ada (Idempotent)
   */
  function ensureTable(tableName, expectedHeaders) {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(tableName);
    let status = "";
    const missingAdded = [];

    if (!sheet) {
      // Buat sheet baru jika belum ada
      sheet = ss.insertSheet(tableName);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      
      const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
      headerRange.setBackground(BRAND_PRIMARY);
      headerRange.setFontColor(BRAND_SURFACE);
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      headerRange.setVerticalAlignment("middle");
      sheet.setRowHeight(1, 36);
      sheet.setFrozenRows(1);
      
      for (let c = 1; c <= expectedHeaders.length; c++) {
        sheet.setColumnWidth(c, 160);
      }
      status = "CREATED";
    } else {
      // Sheet sudah ada. Periksa baris 1 header
      const lastCol = sheet.getLastColumn();
      if (lastCol === 0) {
        // Sheet kosong total
        sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
        const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
        headerRange.setBackground(BRAND_PRIMARY);
        headerRange.setFontColor(BRAND_SURFACE);
        headerRange.setFontWeight("bold");
        headerRange.setHorizontalAlignment("center");
        headerRange.setVerticalAlignment("middle");
        sheet.setRowHeight(1, 36);
        sheet.setFrozenRows(1);
        status = "HEADER_POPULATED";
      } else {
        const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
        let currentMaxCol = lastCol;

        // Cari kolom yang belum ada dalam header eksisting, tambahkan di sebelah kanan tanpa mengubah data
        expectedHeaders.forEach(colName => {
          if (!existingHeaders.includes(colName)) {
            currentMaxCol++;
            sheet.getRange(1, currentMaxCol).setValue(colName);
            sheet.getRange(1, currentMaxCol).setBackground(BRAND_PRIMARY).setFontColor(BRAND_SURFACE).setFontWeight("bold");
            missingAdded.push(colName);
          }
        });

        status = missingAdded.length > 0 ? "COLUMNS_EXTENDED" : "EXISTS_UNCHANGED";
      }
    }

    return {
      tableName: tableName,
      status: status,
      missingAdded: missingAdded,
      rowCount: Math.max(0, sheet.getLastRow() - 1)
    };
  }

  /**
   * Mengambil seluruh baris data sebagai array of object
   */
  function getAllRows(tableName, filterFn) {
    const sheet = getSheet(tableName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1 || lastCol === 0) return [];

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    const results = [];
    for (let i = 0; i < dataRange.length; i++) {
      const row = {};
      row._rowIndex = i + 2; // Catat letak baris fisik pada spreadsheet (1-based)
      headers.forEach((h, colIdx) => {
        if (h) row[h] = dataRange[i][colIdx];
      });

      if (!filterFn || filterFn(row)) {
        results.push(row);
      }
    }
    return results;
  }

  /**
   * Mengambil 1 baris berdasarkan Primary Key
   */
  function getRowByPk(tableName, pkColumn, pkValue) {
    const rows = getAllRows(tableName, (row) => String(row[pkColumn]) === String(pkValue));
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Menambahkan baris baru secara aman menggunakan pemetaan header
   */
  function insertRow(tableName, rowData) {
    const sheet = getSheet(tableName);
    const headerMap = getHeaderMap(sheet);
    const maxCol = Math.max(...Object.values(headerMap), 1);
    const rowValues = new Array(maxCol).fill("");

    Object.keys(rowData).forEach(key => {
      const colIdx = headerMap[key];
      if (colIdx) {
        rowValues[colIdx - 1] = rowData[key];
      }
    });

    sheet.appendRow(rowValues);
    return rowData;
  }

  /**
   * Memperbarui baris berdasarkan Primary Key secara aman
   */
  function updateRowByPk(tableName, pkColumn, pkValue, updateData) {
    const sheet = getSheet(tableName);
    const existing = getRowByPk(tableName, pkColumn, pkValue);
    if (!existing) {
      throw new Error("Data dengan " + pkColumn + " = '" + pkValue + "' tidak ditemukan pada tabel '" + tableName + "'.");
    }

    const rowIndex = existing._rowIndex;
    const headerMap = getHeaderMap(sheet);

    Object.keys(updateData).forEach(key => {
      const colIdx = headerMap[key];
      if (colIdx) {
        sheet.getRange(rowIndex, colIdx).setValue(updateData[key]);
      }
    });

    return Object.assign({}, existing, updateData);
  }

  /**
   * Menghapus baris berdasarkan Primary Key
   */
  function deleteRowByPk(tableName, pkColumn, pkValue) {
    const sheet = getSheet(tableName);
    const existing = getRowByPk(tableName, pkColumn, pkValue);
    if (!existing) {
      throw new Error("Data dengan " + pkColumn + " = '" + pkValue + "' tidak ditemukan untuk dihapus.");
    }

    sheet.deleteRow(existing._rowIndex);
    return true;
  }

  /**
   * Membungkus eksekusi fungsi dalam penguncian transaksi LockService
   */
  function withLock(timeoutMs, actionFn) {
    const lock = LockService.getScriptLock();
    const waitTime = timeoutMs || 30000;
    const success = lock.tryLock(waitTime);
    if (!success) {
      throw new Error("Sistem sedang sibuk memproses transaksi lain. Silakan coba beberapa saat lagi.");
    }
    try {
      return actionFn();
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Mencatat aktivitas penting ke tabel LOG_AKTIVITAS
   */
  function logActivity(userId, action, moduleName, referenceId, description) {
    try {
      const now = new Date();
      const logId = "LOG-" + Utilities.formatDate(now, "GMT+7", "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1000);
      insertRow("LOG_AKTIVITAS", {
        log_id: logId,
        user_id: userId || "SYSTEM",
        action: action,
        module: moduleName,
        reference_id: referenceId || "",
        description: description,
        timestamp: now
      });
    } catch (e) {
      Logger.log("Peringatan: Gagal mencatat log aktivitas: " + e.message);
    }
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    getHeaderMap: getHeaderMap,
    ensureTable: ensureTable,
    getAllRows: getAllRows,
    getRowByPk: getRowByPk,
    insertRow: insertRow,
    updateRowByPk: updateRowByPk,
    deleteRowByPk: deleteRowByPk,
    withLock: withLock,
    logActivity: logActivity
  };
})();
