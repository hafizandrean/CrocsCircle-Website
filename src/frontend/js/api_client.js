/**
 * CROCSCIRCLE.ID — UNIFIED CLIENT API BRIDGE
 * Version: 1.0.0 (Phase 3E.2)
 *
 * Provides a unified communication bridge between browser frontend and backend.
 * Compatible with both Local Node.js Development Server and Production Google Apps Script Web App.
 *
 * Key Features:
 * 1. Automatic Session Token Injection into JSON Request Body (Never in URL!).
 * 2. CORS Preflight Bypass for Google Apps Script Web App using 'text/plain;charset=utf-8'.
 * 3. Automatic 302 Redirect Handling for GAS ContentService responses.
 * 4. Graceful Error Handling & Automatic Session Expired Redirect (401 -> login.html).
 */

const API_CONFIG = {
  TOKEN_KEY: "crocscircle_admin_token",
  USER_KEY: "crocscircle_admin_user",
  // Mode: "LOCAL" (uses local /exec or /api) or "GAS" (uses GAS_WEBAPP_URL)
  MODE: (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "LOCAL" : "GAS",
  LOCAL_GATEWAY: "/exec",
  // Production GAS Web App URL configured via Script Deployment
  GAS_WEBAPP_URL: window.CROCS_GAS_URL || "https://script.google.com/macros/s/AKfycbxhEp0EFcoCbQuqjsX3MeEgSPQFboBbQgxySRnb3ypOJWdZMuHBmhwxaWQpyoskByBPFg/exec"
};

const ApiClient = (function() {

  /**
   * Retrieves active session token from sessionStorage
   * @return {string|null}
   */
  function getToken() {
    return sessionStorage.getItem(API_CONFIG.TOKEN_KEY) || null;
  }

  /**
   * Universal API Caller
   * 
   * @param {string} action Nama aksi endpoint (contoh: "dashboard/data", "sales/create", "reports/income-statement")
   * @param {Object} [payload] Data body/parameter
   * @param {string} [method] "GET" atau "POST" (default: "POST" untuk keamanan token di body)
   * @return {Promise<Object>} Response payload terurai
   */
  async function call(action, payload, method) {
    payload = payload || {};
    method = (method || (action.startsWith("storefront/catalog") || action.startsWith("storefront/product") ? "GET" : "POST")).toUpperCase();

    const token = getToken();
    const isGas = API_CONFIG.MODE === "GAS" && API_CONFIG.GAS_WEBAPP_URL;
    let url = isGas ? API_CONFIG.GAS_WEBAPP_URL : API_CONFIG.LOCAL_GATEWAY;

    // Untuk GET request publik (seperti katalog produk)
    if (method === "GET") {
      const queryParams = new URLSearchParams();
      queryParams.set("action", action);
      Object.keys(payload).forEach(k => {
        if (payload[k] !== undefined && payload[k] !== null) {
          queryParams.set(k, payload[k]);
        }
      });
      url += (url.includes("?") ? "&" : "?") + queryParams.toString();

      try {
        const response = await fetch(url, {
          method: "GET",
          redirect: "follow"
        });
        return await response.json();
      } catch (err) {
        return { success: false, statusCode: 500, error: "Gagal terhubung ke server: " + err.message };
      }
    }

    // Untuk POST request (Autentikasi, Mutasi, dan Laporan Owner)
    // Token SELALU dimasukkan ke dalam body JSON (bukan URL) demi keamanan produksi
    const requestBody = Object.assign({}, payload, {
      action: action
    });
    if (token && !requestBody.token) {
      requestBody.token = token;
    }

    try {
      /**
       * Catatan Penting Kompatibilitas GAS:
       * Menggunakan Content-Type: 'text/plain;charset=utf-8' mencegah browser mengirimkan
       * OPTIONS preflight request yang tidak didukung oleh GAS Web App. GAS tetap membaca
       * JSON string tersebut secara sempurna melalui e.postData.contents.
       */
      const response = await fetch(url, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json();

      // Penanganan sesi kedaluwarsa secara otomatis
      if (result.statusCode === 401 || (result.error && result.error.includes("Sesi tidak valid"))) {
        sessionStorage.removeItem(API_CONFIG.TOKEN_KEY);
        sessionStorage.removeItem(API_CONFIG.USER_KEY);
        if (!window.location.pathname.endsWith("login.html") && !window.location.pathname.endsWith("index.html")) {
          alert("Sesi Anda telah berakhir. Silakan masuk kembali.");
          window.location.href = "login.html";
        }
      }

      return result;
    } catch (err) {
      return {
        success: false,
        statusCode: 500,
        error: "Kendala komunikasi jaringan dengan server: " + err.message
      };
    }
  }

  return {
    call: call,
    getToken: getToken,
    config: API_CONFIG
  };

})();

// Expose globally
if (typeof window !== "undefined") {
  window.ApiClient = ApiClient;
}
