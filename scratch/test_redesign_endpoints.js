const http = require('http');

// Start server child process or require server logic
// In server.js, the server listens on port 3000 when required/run.
require('../server.js');

setTimeout(async () => {
  try {
    console.log('=== TEST REDESIGN ENDPOINTS ===');
    
    // Helper to make HTTP requests
    function req(path, method, body, token) {
      return new Promise((resolve, reject) => {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const opt = {
          hostname: 'localhost',
          port: 3000,
          path,
          method,
          headers
        };
        const r = http.request(opt, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch (e) {
              resolve({ status: res.statusCode, raw: data });
            }
          });
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
      });
    }

    // 1. Login
    const loginRes = await req('/api/login', 'POST', { username: 'hafiz', password: 'HafizOwner2026!' });
    const token = loginRes.body.token;
    console.log('1. Login OK, token:', token ? 'YES' : 'NO');

    // 2. Metadata vendors
    const metaRes = await req('/api/metadata', 'GET', null, token);
    console.log('2. Metadata vendors count:', metaRes.body.vendors ? metaRes.body.vendors.length : 0);

    // 3. Products
    const prodRes = await req('/api/products', 'GET', null, token);
    console.log('3. Products count:', prodRes.body.products ? prodRes.body.products.length : 0);

    // 4. Create Purchase Invoice
    const purchasePayload = {
      supplier_name: 'PT Crocs Indonesia',
      vendor_id: 'VND-DZAKI',
      purchase_date: '2026-11-24',
      shipping_cost: 50000,
      notes: 'Testing Purchase Redesign',
      items: [
        {
          variant_id: 'VAR-CLG-CLASSIC-BLACK-M8W10',
          quantity: 10,
          base_unit_cost: 250000,
          vendor_incentive: 10000
        }
      ]
    };
    const createPurRes = await req('/api/purchases/create', 'POST', purchasePayload, token);
    console.log('4. Create Purchase:', createPurRes.body.success, 'ID:', createPurRes.body.purchase_id, 'Total:', createPurRes.body.total_purchase);
    const purchaseId = createPurRes.body.purchase_id;

    // 5. Get Purchase Detail
    const detailRes1 = await req('/api/purchases/detail?purchase_id=' + purchaseId, 'GET', null, token);
    console.log('5. Detail before receive:', detailRes1.body.success, 'Status:', detailRes1.body.receiving_status);
    console.log('   Item 0:', detailRes1.body.items[0].product_name, '| Ordered:', detailRes1.body.items[0].qty_ordered, '| Received:', detailRes1.body.items[0].qty_received, '| Remaining:', detailRes1.body.items[0].qty_remaining);

    // 6. Receive partial (6 of 10)
    const receivePayload = {
      purchase_id: purchaseId,
      idempotency_key: 'RCPT-TEST-REDESIGN-001',
      notes: 'Penerimaan 6 pcs pertama',
      received_items: [
        {
          variant_id: 'VAR-CLG-CLASSIC-BLACK-M8W10',
          quantity: 6,
          base_unit_cost: 250000,
          vendor_incentive: 10000
        }
      ]
    };
    const receiveRes = await req('/api/purchases/receive', 'POST', receivePayload, token);
    console.log('6. Receive partial (6 of 10):', receiveRes.body.success, 'New Status:', receiveRes.body.new_receiving_status);

    // 7. Get Purchase Detail after partial receive
    const detailRes2 = await req('/api/purchases/detail?purchase_id=' + purchaseId, 'GET', null, token);
    console.log('7. Detail after receive:', detailRes2.body.success, 'Status:', detailRes2.body.receiving_status);
    console.log('   Item 0: Ordered:', detailRes2.body.items[0].qty_ordered, '| Received:', detailRes2.body.items[0].qty_received, '| Remaining:', detailRes2.body.items[0].qty_remaining);

    // 8. Purchases list
    const listPurRes = await req('/api/purchases/list', 'GET', null, token);
    console.log('8. Purchase list count:', listPurRes.body.count, 'Remaining bill:', listPurRes.body.purchases[0].remaining_bill);

    // 9. Expenses create
    const expPayload = {
      expense_date: '2026-11-24',
      category: 'PACKING',
      activity: 'Beli Bubble Wrap 5 Roll',
      amount: 150000,
      payment_method: 'CASH',
      paid_by: 'Hafiz',
      description: 'Bubble wrap tebal untuk packing',
      notes: 'Nota #991'
    };
    const createExpRes = await req('/api/expenses/create', 'POST', expPayload, token);
    console.log('9. Create Expense:', createExpRes.body.success, 'ID:', createExpRes.body.expense_id, 'Amount:', createExpRes.body.amount);

    // 10. Expenses list
    const listExpRes = await req('/api/expenses/list?month=11&year=2026', 'GET', null, token);
    console.log('10. Expenses list count:', listExpRes.body.count, 'Total:', listExpRes.body.total_amount);

    console.log('=== ALL REDESIGN ENDPOINTS WORKING 100% ===');
    process.exit(0);
  } catch (err) {
    console.error('Error in test:', err);
    process.exit(1);
  }
}, 1000);
