/**
 * CROCSCIRCLE.ID — TEST SEED & FINANCIAL RECONCILIATION
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Setup Mock GAS Environment
class MockRange {
  constructor(sheet, startRow, startCol, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.startRow = startRow;
    this.startCol = startCol;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rowIndex = this.startRow + r;
      if (!this.sheet.cells[rowIndex]) this.sheet.cells[rowIndex] = [];
      for (let c = 0; c < values[r].length; c++) {
        const colIndex = this.startCol + c;
        this.sheet.cells[rowIndex][colIndex] = values[r][c];
      }
    }
    return this;
  }
  setValue(val) { return this.setValues([[val]]); }
  setBackground() { return this; }
  setFontColor() { return this; }
  setFontWeight() { return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
  getValues() {
    const result = [];
    for (let r = 0; r < this.numRows; r++) {
      const row = [];
      const rowIndex = this.startRow + r;
      for (let c = 0; c < this.numCols; c++) {
        const colIndex = this.startCol + c;
        row.push(this.sheet.cells[rowIndex] ? this.sheet.cells[rowIndex][colIndex] : "");
      }
      result.push(row);
    }
    return result;
  }
}

class MockSheet {
  constructor(name) { this.name = name; this.cells = {}; }
  getLastRow() {
    const rowKeys = Object.keys(this.cells).map(Number).filter(k => k > 0);
    return rowKeys.length > 0 ? Math.max(...rowKeys) : 0;
  }
  getLastColumn() {
    let maxCol = 0;
    Object.values(this.cells).forEach(rowObj => {
      const colKeys = Object.keys(rowObj).map(Number).filter(k => k > 0);
      if (colKeys.length > 0) maxCol = Math.max(maxCol, ...colKeys);
    });
    return maxCol;
  }
  getRange(row, col, numRows = 1, numCols = 1) { return new MockRange(this, row, col, numRows, numCols); }
  appendRow(rowValues) {
    const nextRow = this.getLastRow() + 1;
    this.cells[nextRow] = {};
    rowValues.forEach((val, idx) => { this.cells[nextRow][idx + 1] = val; });
  }
  deleteRow(rowIndex) {
    delete this.cells[rowIndex];
    const newCells = {};
    Object.keys(this.cells).sort((a,b)=>Number(a)-Number(b)).forEach(k => {
      if (Number(k) < rowIndex) newCells[k] = this.cells[k];
      else if (Number(k) > rowIndex) newCells[Number(k) - 1] = this.cells[k];
    });
    this.cells = newCells;
  }
  setRowHeight() {}
  setFrozenRows() {}
  setColumnWidth() {}
  autoResizeColumns() {}
}

class MockSpreadsheet {
  constructor() { this.sheets = {}; }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
}

const activeSS = new MockSpreadsheet();
global.SpreadsheetApp = { getActiveSpreadsheet: () => activeSS };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
global.Logger = { log: (...args) => {} };
global.Utilities = {
  computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v).digest()),
  formatDate: (d, tz, f) => {
    const dt = new Date(d);
    const pad = n => n < 10 ? '0' + n : n;
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
};

const backendDir = path.join(__dirname, '..', 'src', 'backend');
function load(fn, gn) {
  const code = fs.readFileSync(path.join(backendDir, fn), 'utf8');
  (new Function(code + (gn ? `\nglobal.${gn} = ${gn};` : '')))();
}

load('DatabaseHelper.gs', 'DatabaseHelper');
load('InitDatabase.gs', 'initializeCrocsCircleDatabase');
load('AuthService.gs', 'AuthService');
load('InventoryService.gs', 'InventoryService');
load('SalesService.gs', 'SalesService');
load('POService.gs', 'POService');
load('VendorService.gs', 'VendorService');
load('FinancialService.gs', 'FinancialService');
load('ClosingService.gs', 'ClosingService');
load('ProductService.gs', 'ProductService');
load('SeedRealCrocsData.js', 'seedRealCrocsCircleData');

initializeCrocsCircleDatabase();
AuthService.setupOwnerAccount("hafiz", "Hafiz Owner", "HafizOwner2026!");
const login = AuthService.login("hafiz", "HafizOwner2026!");
const ownerToken = login.token;

console.log("=== EXECUTING SEED REAL DATA ===");
seedRealCrocsCircleData();

console.log("\n=== VERIFYING OKTOBER 2026 INCOME STATEMENT ===");
const repOkt = FinancialService.calculateMonthlyIncomeStatement(10, 2026);
console.log("Omzet Okt:", repOkt.revenue_breakdown.total_omzet, "(Target: 290.000)");
console.log("HPP Okt  :", repOkt.hpp_breakdown.total_hpp, "(Target: 124.000)");
console.log("Beban Okt:", repOkt.expenses_breakdown.operational_expenses, "(Target: 61.000)");
console.log("Laba Okt :", repOkt.net_profit, "(Target: 105.000)");

console.log("\n=== VERIFYING NOVEMBER 2026 INCOME STATEMENT ===");
const repNov = FinancialService.calculateMonthlyIncomeStatement(11, 2026);
console.log("Omzet Offline Nov:", repNov.revenue_breakdown.owned_sales_omzet, "(Target: 4.970.000)");
console.log("Omzet PO Lunas Nov:", repNov.revenue_breakdown.po_recognized_omzet, "(Target: 2.200.000)");
console.log("Omzet Insentif Dzaki:", repNov.revenue_breakdown.vendor_incentive_omzet, "(Target: 40.000)");
console.log("TOTAL OMZET NOV   :", repNov.revenue_breakdown.total_omzet);
console.log("TOTAL HPP NOV     :", repNov.hpp_breakdown.total_hpp);
console.log("LABA KOTOR NOV    :", repNov.gross_profit);
console.log("BEBAN OPERASIONAL :", repNov.expenses_breakdown.operational_expenses);
console.log("LABA BERSIH NOV   :", repNov.net_profit);

console.log("\n=== VERIFYING VENDOR PAYABLES (DZAKI) ===");
const dzakiRecon = FinancialService.getVendorReconciliationReport("VND-DZAKI", 11, 2026);
console.log("Kewajiban ke Dzaki:", dzakiRecon.summary.total_vendor_share, "(Target: 1.270.000)");

console.log("\n=== VERIFYING RESTRICTED CASH (PO DP & DZAKI) ===");
const cfNov = FinancialService.generateCashFlowStatement(11, 2026);
console.log("Restricted Cash:", cfNov.cash_breakdown.restricted_cash.total_restricted);
console.log("  - PO Advance DP:", cfNov.cash_breakdown.restricted_cash.customer_advances_po);
console.log("  - Vendor Dzaki :", cfNov.cash_breakdown.restricted_cash.vendor_liabilities);
