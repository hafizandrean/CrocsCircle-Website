const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: headers
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: headers
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const login = await post('/api/login', { username: 'hafiz', password: 'HafizOwner2026!' });
  const token = login.data.token;

  // Test Vendor Reconciliation
  const recon = await get('/api/reports/vendor-reconciliation?vendor_id=VND-DZAKI', token);
  console.log('Vendor Recon status:', recon.status, 'Total Gross Payable:', recon.data.report?.summary?.total_gross_payable);

  // Test Vendor Settlement
  const settlement = await post('/api/vendors/settlement', {
    vendor_id: 'VND-DZAKI',
    payment_method: 'TRANSFER_BCA',
    bank_reference: 'TRF-TEST-2026',
    notes: 'Uji coba settlement vendor'
  }, token);
  console.log('Vendor Settlement status:', settlement.status, 'Settlement ID:', settlement.data.settlementId, 'Success:', settlement.data.success);
})();
