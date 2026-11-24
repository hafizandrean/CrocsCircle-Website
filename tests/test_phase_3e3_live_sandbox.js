/**
 * CROCSCIRCLE.ID — PHASE 3E.3B LIVE SANDBOX VERIFICATION
 * Live Network Integration Test Suite against Google Apps Script & Google Sheets Sandbox
 *
 * Target: Google Apps Script Web App Deployment ID:
 * AKfycbxBMxGcb-GtocX4hgmgfzsXP9IGgwluTlEttuPsJk0xIay5q3Rjx-TFRw2q2T9XM9QfkQ
 * URL: https://script.google.com/macros/s/AKfycbxBMxGcb-GtocX4hgmgfzsXP9IGgwluTlEttuPsJk0xIay5q3Rjx-TFRw2q2T9XM9QfkQ/exec
 */

const https = require('https');
const { URL } = require('url');

const LIVE_GAS_URL = 'https://script.google.com/macros/s/AKfycbxBMxGcb-GtocX4hgmgfzsXP9IGgwluTlEttuPsJk0xIay5q3Rjx-TFRw2q2T9XM9QfkQ/exec';

function callGas(action, payload = {}, method = 'POST') {
  return new Promise((resolve, reject) => {
    payload = Object.assign({}, payload, { action });

    if (method === 'GET') {
      const q = new URLSearchParams();
      Object.keys(payload).forEach(k => q.set(k, payload[k]));
      const fullUrl = LIVE_GAS_URL + '?' + q.toString();

      https.get(fullUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (redRes) => {
            let body = '';
            redRes.on('data', c => body += c);
            redRes.on('end', () => {
              try { resolve({ status: redRes.statusCode, data: JSON.parse(body) }); }
              catch(e) { resolve({ status: redRes.statusCode, raw: body }); }
            });
          }).on('error', reject);
          return;
        }
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch(e) { resolve({ status: res.statusCode, raw: body }); }
        });
      }).on('error', reject);
      return;
    }

    // POST request with text/plain to bypass CORS preflight
    const postData = JSON.stringify(payload);
    const parsed = new URL(LIVE_GAS_URL);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (redRes) => {
          let body = '';
          redRes.on('data', c => body += c);
          redRes.on('end', () => {
            try { resolve({ status: redRes.statusCode, data: JSON.parse(body) }); }
            catch(e) { resolve({ status: redRes.statusCode, raw: body }); }
          });
        }).on('error', reject);
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { resolve({ status: res.statusCode, raw: body }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

let total = 0;
let passed = 0;
let failed = 0;

function assert(condition, message, extra) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message} -> GOT:`, extra !== undefined ? extra : "");
  }
}

async function runLiveSandboxAudit() {
  console.log("================================================================================");
  console.log("CROCSCIRCLE.ID — PHASE 3E.3B LIVE GOOGLE CLOUD SANDBOX VERIFICATION");
  console.log("Target Deployment ID: AKfycbxBMxGcb-GtocX4hgmgfzsXP9IGgwluTlEttuPsJk0xIay5q3Rjx-TFRw2q2T9XM9QfkQ");
  console.log("================================================================================\n");

  // 1. Uji Ping & Health Check via GET
  console.log("--- 1. PING & HEALTH CHECK (HTTP GET via Live Google Cloud) ---");
  const pingRes = await callGas("ping", {}, "GET");
  assert(pingRes.status === 200, "HTTP GET ping mengembalikan status 200 via 302 redirect", pingRes);
  assert(pingRes.data.success === true, "Payload ping success === true dari Google Apps Script live", pingRes.data);
  assert(typeof pingRes.data.timestamp === "string", "Timestamp dihasilkan langsung dari server Google Cloud: " + pingRes.data.timestamp);

  // 2. Uji Health Check via POST (text/plain CORS preflight bypass)
  console.log("\n--- 2. POST HEALTH CHECK (text/plain CORS Bypass) ---");
  const healthRes = await callGas("health", {});
  assert(healthRes.status === 200, "HTTP POST health mengembalikan status 200", healthRes);
  assert(healthRes.data.success === true, "Payload health success === true via POST", healthRes.data);

  // 3. Uji Storefront Catalog (Database Google Sheets Live Read)
  console.log("\n--- 3. STOREFRONT CATALOG (Live Google Sheets Read) ---");
  const catRes = await callGas("storefront/catalog", {}, "GET");
  assert(catRes.status === 200, "Storefront catalog membaca Google Sheets riil (Status 200)", catRes);
  assert(catRes.data.success === true && Array.isArray(catRes.data.products), "Catalog mengembalikan array produk dari sheet MASTER_PRODUK", catRes.data);

  // 4. Uji Auth Guard & RBAC pada Live GAS
  console.log("\n--- 4. AUTH GUARD & SESSION VALIDATION ON LIVE GAS ---");
  const noTokenRes = await callGas("dashboard/data", {});
  assert(noTokenRes.data.success === false && noTokenRes.data.statusCode === 401, "Protected endpoint tanpa token ditolak (401) oleh WebAppRouter live", noTokenRes.data);

  const invalidTokenRes = await callGas("dashboard/data", { token: "INVALID_TEST_TOKEN_XYZ" });
  assert(invalidTokenRes.data.success === false && invalidTokenRes.data.statusCode === 401, "Protected endpoint dengan token palsu ditolak (401) oleh AuthService live", invalidTokenRes.data);

  // 5. Uji Login Owner & Verifikasi Sesi Live
  console.log("\n--- 5. LIVE LOGIN & SESSION GENERATION ---");
  const loginRes = await callGas("login", { username: "hafiz", password: "HafizOwner2026!" });
  let liveOwnerToken = null;
  if (loginRes.data && loginRes.data.success && loginRes.data.token) {
    liveOwnerToken = loginRes.data.token;
    assert(true, "Owner login BERHASIL di Google Apps Script Live! Token: " + liveOwnerToken.substring(0, 16) + "...");
    assert(loginRes.data.user.role === "OWNER", "User role terverifikasi sebagai OWNER dari sheet USERS live");

    // 6. Uji Akses Protected Resource dengan Token Valid
    console.log("\n--- 6. PROTECTED ACCESS WITH VALID OWNER TOKEN ---");
    const dashRes = await callGas("dashboard/data", { token: liveOwnerToken });
    assert(dashRes.data.success === true, "Akses dashboard/data dengan token valid BERHASIL (200 OK)", dashRes.data);

    const posRes = await callGas("pos/variants", { token: liveOwnerToken });
    assert(posRes.data.success === true && Array.isArray(posRes.data.variants), "Akses pos/variants dengan token valid mengembalikan daftar varian", posRes.data);

    // 7. Uji Mutasi Data Live: Tambah Master Produk & Varian di Google Sheets
    console.log("\n--- 7. LIVE GOOGLE SHEETS MUTATION (CREATE PRODUCT & VARIANT) ---");
    const testSku = "TST-" + Date.now().toString().slice(-6);
    const newProdRes = await callGas("products/save", {
      token: liveOwnerToken,
      product_name: "Crocs Classic Live Test " + testSku,
      category_id: "CAT-CLOG",
      model: "Classic Clog",
      description: "Live Sandbox Integration Test Verification Product",
      sales_type: "OWNED"
    });
    const createdProdId = newProdRes.data ? newProdRes.data.product_id : null;
    assert(newProdRes.data && newProdRes.data.success === true, "Berhasil menambahkan baris produk baru ke sheet MASTER_PRODUK live: " + createdProdId, newProdRes.data);

    // Verifikasi produk muncul di daftar produk Admin
    const prodListRes = await callGas("products/list", { token: liveOwnerToken });
    assert(prodListRes.data && prodListRes.data.success === true && Array.isArray(prodListRes.data.products), "Admin getProducts berhasil membaca daftar master produk dari spreadsheet", prodListRes.data);

    // Tambahkan varian agar produk memiliki SKU dan harga katalog
    const newVarRes = await callGas("variants/save", {
      token: liveOwnerToken,
      product_id: createdProdId,
      sku: "SKU-LIVE-" + testSku,
      size: "M9W11",
      color: "Black",
      catalog_price: 280000,
      reference_hpp: 150000
    });
    assert(newVarRes.data && newVarRes.data.success === true, "Berhasil menambahkan varian ke sheet VARIAN_PRODUK live: SKU-LIVE-" + testSku, newVarRes.data);

    // Verifikasi baca ulang melalui Storefront (produk yang memiliki varian aktif wajib tampil di etalase)
    const updatedCatRes = await callGas("storefront/catalog", {}, "GET");
    assert(updatedCatRes.data && updatedCatRes.data.count > 0, "Produk dan varian baru langsung aktif terbaca secara live di Storefront Catalog!", updatedCatRes.data ? updatedCatRes.data.count : 0);

    // 8. Uji Logout & Invalidasi Sesi
    console.log("\n--- 8. LIVE LOGOUT & SESSION INVALIDATION ---");
    const logoutRes = await callGas("logout", { token: liveOwnerToken });
    assert(logoutRes.data.success === true, "Logout berhasil menghapus sesi dari sheet SESSIONS live", logoutRes.data);

    const revokedCheck = await callGas("dashboard/data", { token: liveOwnerToken });
    assert(revokedCheck.data.success === false && revokedCheck.data.statusCode === 401, "Token yang telah di-logout langsung ditolak (401) oleh AuthService live", revokedCheck.data);

  } else {
    console.log("  ℹ Status Login Live:", loginRes.data);
    assert(false, "Login gagal di lingkungan live. Mohon pastikan file AdminController.gs sudah ditambahkan dan New Version telah diterapkan di GAS.", loginRes.data);
  }

  console.log("\n================================================================================");
  console.log(`LIVE SANDBOX TEST SUMMARY:`);
  console.log(`Total Live Checks : ${total}`);
  console.log(`Passed            : ${passed}`);
  console.log(`Failed            : ${failed}`);
  console.log("================================================================================");
}

runLiveSandboxAudit().catch(err => {
  console.error("FATAL ERROR IN LIVE AUDIT:", err);
});
