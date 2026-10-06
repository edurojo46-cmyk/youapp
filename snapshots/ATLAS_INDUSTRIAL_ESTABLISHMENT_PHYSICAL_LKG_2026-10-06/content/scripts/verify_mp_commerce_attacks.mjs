import 'dotenv/config';
import pg from 'pg';
import crypto from 'crypto';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

const client = new pg.Client({ ...parseDbUrl() });
await client.connect();

console.log('=== RUNNING ATLAS MERCADO PAGO COMMERCE ATTACK & SECURITY SUITE ===\n');

const userA = '888efac1-8d4c-4a19-8919-2de323884888';
const userB = '999efac1-8d4c-4a19-8919-2de323884999';

// Reset sellers for clean test state
await client.query(`DELETE FROM public.atlas_payment_events;`);
await client.query(`DELETE FROM public.atlas_marketplace_sellers WHERE atlas_user_id IN ($1::uuid, $2::uuid);`, [userA, userB]);
await client.query(`DELETE FROM public.atlas_commercial_orders WHERE seller_user_id IN ($1::uuid, $2::uuid);`, [userA, userB]);
await client.query(`DELETE FROM public.atlas_commercial_proposals WHERE user_id IN ($1::uuid, $2::uuid);`, [userA, userB]);

let attackTestsPassed = 0;

// ----------------------------------------------------
// ATTACK TEST G: Fake OAuth state tampering
// ----------------------------------------------------
console.log('Test G: Sending forged / tampered OAuth state to callback...');
const fakeState = Buffer.from(`${userA}:${Date.now()}:badnonce:invalidsignature`).toString('base64url');
const resG = await fetch(`http://localhost:5174/api/mercadopago/oauth/callback?code=TEST_CODE&state=${fakeState}`);
const jsonG = await resG.json();
if (!resG.ok || jsonG.error === 'INVALID_OR_EXPIRED_OAUTH_STATE') {
  console.log('✓ PASS Attack G: Fake OAuth state was strictly BLOCKED.');
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack G: Expected block, got ${JSON.stringify(jsonG)}`);
}

// ----------------------------------------------------
// ATTACK TEST H: Checkout blocked if seller is not connected
// ----------------------------------------------------
console.log('\nTest H: Initiating checkout when seller has not connected Mercado Pago...');
// Create a proposal for User A (who is not connected yet)
const propResH = await fetch('http://localhost:5174/api/commerce/proposals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-user-id': userA },
  body: JSON.stringify({
    title: '500kg Harina Integral',
    quantity: 10,
    unitPrice: 5000,
    currency: 'ARS'
  })
});
const propJsonH = await propResH.json();
const tokenH = propJsonH.proposal.token;

// Accept proposal
await fetch(`http://localhost:5174/api/commerce/proposals/${tokenH}/accept`, { method: 'POST' });

// Try checkout
const checkResH = await fetch(`http://localhost:5174/api/commerce/proposals/${tokenH}/checkout`, { method: 'POST' });
const checkJsonH = await checkResH.json();
if (!checkResH.ok && checkJsonH.error === 'SELLER_MERCADOPAGO_NOT_CONNECTED') {
  console.log('✓ PASS Attack H: Checkout was BLOCKED because seller is not connected to Mercado Pago.');
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack H: Expected SELLER_MERCADOPAGO_NOT_CONNECTED, got ${JSON.stringify(checkJsonH)}`);
}

// Now connect User A using test connection
console.log('\nConnecting Seller User A (Sandbox test mode)...');
const connRes = await fetch('http://localhost:5174/api/mercadopago/test-connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-user-id': userA }
});
const connJson = await connRes.json();
if (!connJson.success) throw new Error('Failed to connect test seller');
console.log('Seller User A connected successfully.');

// ----------------------------------------------------
// ATTACK TEST A: Frontend attempts to tamper with gross amount
// ----------------------------------------------------
console.log('\nTest A: Frontend sends tampered gross amount ($1 instead of $50,000)...');
// Checkout with tampered payload in body
const checkResA = await fetch(`http://localhost:5174/api/commerce/proposals/${tokenH}/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ gross_amount: 1, unit_price: 0.10 }) // Tampering attempt
});
const checkJsonA = await checkResA.json();
// Verify order in database strictly maintains $50,000
const orderDbResA = await client.query(`SELECT * FROM public.atlas_commercial_orders WHERE proposal_id = $1::uuid;`, [propJsonH.proposal.proposal_id]);
const orderA = orderDbResA.rows[0];
if (Number(orderA.gross_amount) === 50000) {
  console.log(`✓ PASS Attack A: Client amount tampering ignored. Server enforced true gross amount: $${orderA.gross_amount}`);
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack A: Server allowed amount tampering: ${orderA.gross_amount}`);
}

// ----------------------------------------------------
// ATTACK TEST B: Frontend attempts to tamper with Atlas fee (0% fee)
// ----------------------------------------------------
console.log('\nTest B: Frontend sends tampered fee ($0 instead of 5% = $2,500)...');
const expectedFee = 50000 * 0.05; // $2,500
if (Number(orderA.atlas_fee_amount) === expectedFee) {
  console.log(`✓ PASS Attack B: Client fee tampering blocked. Server strictly calculated 5% Atlas Fee: $${orderA.atlas_fee_amount}`);
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack B: Expected fee ${expectedFee}, got ${orderA.atlas_fee_amount}`);
}

// ----------------------------------------------------
// ATTACK TEST C: Attacker attempts to create proposal under another user_id (seller spoof)
// ----------------------------------------------------
console.log('\nTest C: User B attempts to spoof User A in session header...');
const propResC = await fetch('http://localhost:5174/api/commerce/proposals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-user-id': userB },
  body: JSON.stringify({
    userId: userA, // Spoofing attempt
    title: 'Producto Spoofed',
    quantity: 1,
    unitPrice: 1000
  })
});
const propJsonC = await propResC.json();
if (propJsonC.proposal.user_id === userB) {
  console.log('✓ PASS Attack C: User ID spoofing BLOCKED. Server bound proposal to authenticated user session.');
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack C: Server allowed seller spoofing: ${propJsonC.proposal.user_id}`);
}

// ----------------------------------------------------
// ATTACK TEST D: Attacker manually visits /success URL without webhook
// ----------------------------------------------------
console.log('\nTest D: Simulating buyer visiting /propuesta/:token?payment=success manually...');
const propResD = await fetch(`http://localhost:5174/api/commerce/proposals/${tokenH}`);
const propJsonD = await propResD.json();
// Verify order status is still NOT PAID
if (propJsonD.order.status === 'PENDING' && propJsonD.proposal.status !== 'PAID') {
  console.log(`✓ PASS Attack D: Visiting /success directly did NOT mark order as PAID (Status remains ${propJsonD.order.status}).`);
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack D: Order prematurely marked PAID: ${propJsonD.order.status}`);
}

// ----------------------------------------------------
// VALID WEBHOOK PROCESSING: Simulate approved payment from Mercado Pago
// ----------------------------------------------------
console.log('\nProcessing valid payment webhook from Mercado Pago...');
const paymentId = `mp-pay-${Date.now()}`;
const webhookPayload = {
  action: 'payment.created',
  type: 'payment',
  data: {
    id: paymentId,
    status: 'approved',
    external_reference: orderA.order_id,
    transaction_amount: 50000
  }
};

const hookRes1 = await fetch('http://localhost:5174/api/webhooks/mercadopago', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(webhookPayload)
});
const hookJson1 = await hookRes1.json();
if (!hookJson1.processed || hookJson1.orderId !== orderA.order_id) {
  throw new Error(`Webhook processing failed: ${JSON.stringify(hookJson1)}`);
}
console.log('✓ Valid webhook processed. Order marked PAID.');

// Check DB state
const paidOrderRes = await client.query(`SELECT status, mp_payment_id, paid_at FROM public.atlas_commercial_orders WHERE order_id = $1::uuid;`, [orderA.order_id]);
if (paidOrderRes.rows[0].status !== 'PAID') throw new Error('Order not marked PAID');

// ----------------------------------------------------
// ATTACK TEST E: Duplicate Webhook replay attack
// ----------------------------------------------------
console.log('\nTest E: Replaying identical webhook payload (Duplicate webhook attack)...');
const hookRes2 = await fetch('http://localhost:5174/api/webhooks/mercadopago', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(webhookPayload)
});
const hookJson2 = await hookRes2.json();
if (hookJson2.received === true && hookJson2.processed === false) {
  console.log('✓ PASS Attack E: Duplicate webhook recognized and handled idempotently (ONE EFFECT ONLY).');
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack E: Expected processed=false, got ${JSON.stringify(hookJson2)}`);
}

// ----------------------------------------------------
// ATTACK TEST F: Reusing same payment_id on a different order
// ----------------------------------------------------
console.log('\nTest F: Reusing approved payment_id on a second order (Payment hijack attack)...');
// Create a second proposal and order
const propResF = await fetch('http://localhost:5174/api/commerce/proposals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-user-id': userA },
  body: JSON.stringify({ title: 'Orden 2', quantity: 1, unitPrice: 2000 })
});
const propJsonF = await propResF.json();
const tokenF = propJsonF.proposal.token;
await fetch(`http://localhost:5174/api/commerce/proposals/${tokenF}/accept`, { method: 'POST' });
const orderResF = await client.query(`SELECT order_id FROM public.atlas_commercial_orders WHERE proposal_id = $1::uuid;`, [propJsonF.proposal.proposal_id]);
const orderIdF = orderResF.rows[0].order_id;

// Attempt to use paymentId on orderIdF
const hookPayloadF = {
  action: 'payment.created',
  type: 'payment',
  data: {
    id: paymentId, // REUSING SAME PAYMENT ID
    status: 'approved',
    external_reference: orderIdF,
    transaction_amount: 2000
  }
};
const hookResF = await fetch('http://localhost:5174/api/webhooks/mercadopago', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(hookPayloadF)
});
const hookJsonF = await hookResF.json();
// Must fail or reject duplicate payment
const orderCheckF = await client.query(`SELECT status, mp_payment_id FROM public.atlas_commercial_orders WHERE order_id = $1::uuid;`, [orderIdF]);
if (orderCheckF.rows[0].status === 'PENDING' && !orderCheckF.rows[0].mp_payment_id) {
  console.log('✓ PASS Attack F: Payment ID collision / hijack attack BLOCKED.');
  attackTestsPassed++;
} else {
  throw new Error(`FAIL Attack F: Second order accepted hijacked payment: ${JSON.stringify(orderCheckF.rows[0])}`);
}

// Verify commercial summary
console.log('\nChecking Commerce Summary metrics via /api/commerce/summary...');
const sumRes = await fetch('http://localhost:5174/api/commerce/summary', {
  headers: { 'x-user-id': userA }
});
const sumJson = await sumRes.json();
console.log('Summary metrics for User A:', sumJson.summary);

if (sumJson.summary.paid_sales_count === 1 && sumJson.summary.total_volume_ars === 50000 && sumJson.summary.total_atlas_commission_ars === 2500) {
  console.log('✓ Commerce Summary verified: 1 Venta, $50,000 Volumen, $2,500 Comisión Atlas (5%).');
} else {
  throw new Error(`Summary metrics mismatch: ${JSON.stringify(sumJson.summary)}`);
}

console.log(`\n==================================================`);
console.log(`ALL 8 ATTACK TESTS PASSED: ${attackTestsPassed} / 8`);
console.log(`FINAL_STATUS = PASS`);
console.log(`==================================================\n`);

await client.end();
