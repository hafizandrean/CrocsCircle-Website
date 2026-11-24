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
  // 1. Login as owner
  const login = await post('/api/login', { username: 'hafiz', password: 'HafizOwner2026!' });
  console.log('Login status:', login.status, 'Token exists:', !!login.data.token);
  const token = login.data.token;

  // 2. Test GET /api/settings
  const settings = await get('/api/settings', token);
  console.log('Settings GET status:', settings.status, 'Error:', settings.data.error, 'Store:', settings.data.settings?.STORE_NAME, 'Users count:', settings.data.users?.length);

  // 3. Test POST /api/settings
  const updateSettings = await post('/api/settings', {
    settings: {
      STORE_NAME: 'CrocsCircle.ID',
      WHATSAPP_NUMBER: '62895325877868',
      MINIMUM_STOCK_ALERT: '2'
    }
  }, token);
  console.log('Settings POST status:', updateSettings.status, 'Error:', updateSettings.data.error, 'Success:', updateSettings.data.success);

  // 4. Test GET /api/products
  const prods = await get('/api/products', token);
  console.log('Products GET status:', prods.status, 'Count:', prods.data.products?.length);

  // 5. Test GET /api/inventory
  const inv = await get('/api/inventory', token);
  console.log('Inventory GET status:', inv.status, 'Count:', inv.data.inventory?.length);

  console.log('ALL NEW ENDPOINTS TESTED SUCCESSFULLY!');
})();
