import 'dotenv/config';
import pg from 'pg';

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

console.log('=== ATLAS MERCADO PAGO COMMERCE — SECTION 13 E2E MANDATORY TEST ===\n');

const testUserId = '768efac1-8d4c-4a19-8919-2de323884569';

// 1. Connect Seller Mercado Pago
console.log('1. Connecting seller Mercado Pago account...');
const connRes = await fetch('http://localhost:5174/api/mercadopago/test-connect', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId }
});
const connData = await connRes.json();
if (!connData.success) throw new Error(`Failed to connect seller: ${JSON.stringify(connData)}`);
console.log('✓ Seller Mercado Pago connected in Sandbox mode.');

// 2. Select a prospect from user's Mi Base
console.log('\n2. Selecting a prospect from Mi Base...');
const savedApiRes = await fetch('http://localhost:5174/api/user/saved-relations', {
  headers: { 'x-user-id': testUserId }
});
const savedApiData = await savedApiRes.json();
if (!savedApiData.items || savedApiData.items.length === 0) throw new Error('No prospects in user Mi Base. Please run save search first.');
const prospect = savedApiData.items[0];
console.log(`✓ Prospect selected: ${prospect.company_name} (Saved ID: ${prospect.saved_id})`);

// 3. Create Proposal as requested in prompt:
// - Producto: Molino industrial
// - Cantidad: 1
// - Precio: 100000 ARS
// - Vigencia: 15 días
console.log('\n3. Creating proposal: Molino industrial, Cant: 1, Precio: $100,000 ARS, Vigencia: 15 días...');
const propRes = await fetch('http://localhost:5174/api/commerce/proposals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-user-id': testUserId },
  body: JSON.stringify({
    savedRelationId: prospect.saved_id,
    buyerCompanyId: prospect.company_id,
    buyerName: prospect.company_name,
    buyerContactEmail: prospect.public_email || 'comprador.prueba@industrial.ar',
    title: 'Molino industrial',
    description: 'Molino de martillos para molienda de granos secos. Capacidad 500 kg/h. Motor trifásico.',
    quantity: 1,
    unitPrice: 100000,
    currency: 'ARS',
    validDays: 15,
    termsConditions: 'Garantía 12 meses. Entrega en planta. Factura A.'
  })
});
const propData = await propRes.json();
if (!propData.success || !propData.proposal) {
  throw new Error(`Failed to create proposal: ${JSON.stringify(propData)}`);
}
const proposal = propData.proposal;
const token = proposal.token;
console.log(`✓ Proposal created successfully.`);
console.log(`  Proposal ID: ${proposal.proposal_id}`);
console.log(`  Initial Status: ${proposal.status}`);
console.log(`  Public Token: ${token}`);
console.log(`  Public Link: http://localhost:5173/propuesta/${token}`);

// 4. Retrieve proposal via Buyer View (simulated incognito / unauthenticated)
console.log('\n4 & 5. Retrieving proposal via public buyer view (/api/commerce/proposals/:token)...');
const buyerRes = await fetch(`http://localhost:5174/api/commerce/proposals/${token}`);
const buyerData = await buyerRes.json();
if (!buyerRes.ok || !buyerData.proposal) {
  throw new Error(`Failed to retrieve buyer proposal: ${JSON.stringify(buyerData)}`);
}
console.log(`✓ Buyer view loaded correctly.`);
console.log(`  Title: ${buyerData.proposal.title}`);
console.log(`  Unit Price: $${buyerData.proposal.unit_price} ${buyerData.proposal.currency}`);
console.log(`  Total: $${buyerData.proposal.quantity * buyerData.proposal.unit_price} ${buyerData.proposal.currency}`);

// 6. Buyer accepts the proposal
console.log('\n6. Buyer clicks [Aceptar propuesta]...');
const acceptRes = await fetch(`http://localhost:5174/api/commerce/proposals/${token}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
const acceptData = await acceptRes.json();
if (!acceptData.success || !acceptData.order) {
  throw new Error(`Failed to accept proposal: ${JSON.stringify(acceptData)}`);
}
console.log(`✓ Proposal accepted. Order generated: ${acceptData.order.order_id}`);
console.log(`  Order Status: ${acceptData.order.status}`);
console.log(`  Gross Amount: $${acceptData.order.gross_amount} ARS`);
console.log(`  Atlas Fee (5%): $${acceptData.order.atlas_fee_amount} ARS`);

// 7. Verify checkout preference generation
console.log('\n7. Buyer clicks [Pagar con Mercado Pago] -> Generating preference with split fee...');
const checkRes = await fetch(`http://localhost:5174/api/commerce/proposals/${token}/checkout`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
const checkData = await checkRes.json();
if (!checkData.success || !checkData.preferenceId) {
  throw new Error(`Failed to create checkout preference: ${JSON.stringify(checkData)}`);
}
console.log(`✓ Preference generated successfully: ${checkData.preferenceId}`);
console.log(`  Checkout URL: ${checkData.checkoutUrl}`);

// 8. Simulate approved webhook payment from Mercado Pago
console.log('\n8. Simulating Mercado Pago webhook payment notification (Approved)...');
const e2ePaymentId = `mp-pay-e2e-${Date.now()}`;
const hookPayload = {
  action: 'payment.created',
  type: 'payment',
  data: {
    id: e2ePaymentId,
    status: 'approved',
    external_reference: acceptData.order.order_id,
    transaction_amount: 100000,
    fee_details: [{ type: 'marketplace_fee', amount: 5000 }]
  }
};
const hookRes = await fetch('http://localhost:5174/api/webhooks/mercadopago', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(hookPayload)
});
const hookData = await hookRes.json();
if (!hookData.processed) {
  throw new Error(`Webhook failed to process: ${JSON.stringify(hookData)}`);
}
console.log(`✓ Webhook processed and reconciled successfully.`);

// 9. Verify Final State and Invariants in Database
console.log('\n9. Verifying final state and mathematical invariants in database...');
const finalOrderRes = await client.query(
  `SELECT * FROM public.atlas_commercial_orders WHERE order_id = $1::uuid;`,
  [acceptData.order.order_id]
);
const finalOrder = finalOrderRes.rows[0];

const finalPropRes = await client.query(
  `SELECT status FROM public.atlas_commercial_proposals WHERE proposal_id = $1::uuid;`,
  [proposal.proposal_id]
);
const finalProposalStatus = finalPropRes.rows[0].status;

console.log(`  Proposal Status: ${finalProposalStatus} (Expected: PAID)`);
console.log(`  Order Status: ${finalOrder.status} (Expected: PAID)`);
console.log(`  MP Payment ID: ${finalOrder.mp_payment_id} (Expected: ${e2ePaymentId})`);
console.log(`  Gross Amount: $${finalOrder.gross_amount} ARS`);
const sellerAmountBeforeMpFees = Number(finalOrder.gross_amount) - Number(finalOrder.atlas_fee_amount);
console.log(`  Seller Amount Before MP Fees: $${sellerAmountBeforeMpFees} ARS`);
console.log(`  * Final Seller Net: Neto sujeto a costos de procesamiento de Mercado Pago`);

if (finalProposalStatus !== 'PAID') throw new Error(`Expected proposal PAID, got ${finalProposalStatus}`);
if (finalOrder.status !== 'PAID') throw new Error(`Expected order PAID, got ${finalOrder.status}`);
if (finalOrder.mp_payment_id !== e2ePaymentId) throw new Error(`Payment ID mismatch`);
if (Number(finalOrder.atlas_fee_amount) !== 5000) throw new Error(`Fee mismatch: ${finalOrder.atlas_fee_amount}`);
if (sellerAmountBeforeMpFees !== 95000) throw new Error(`Amount before MP fees mismatch: ${sellerAmountBeforeMpFees}`);
console.log(`✓ Invariant Check: 100,000 ARS (Gross) = 95,000 ARS (Seller before MP Fees) + 5,000 ARS (Atlas Fee). MATCH!`);

// 10. Verify Seller Summary in Mi Base
console.log('\n10. Verifying Seller summary metrics in /api/commerce/summary...');
const summaryRes = await fetch('http://localhost:5174/api/commerce/summary', {
  headers: { 'x-user-id': testUserId }
});
const summaryData = await summaryRes.json();
console.log('Current Seller Metrics:', summaryData.summary);

if (summaryData.summary.paid_sales_count < 1) throw new Error('paid_sales_count < 1');
if (summaryData.summary.total_volume_ars < 100000) throw new Error('total_volume_ars < 100000');
if (summaryData.summary.total_atlas_commission_ars < 5000) throw new Error('total_atlas_commission_ars < 5000');
console.log(`✓ Seller metrics verified: Sales, Volume ($${summaryData.summary.total_volume_ars}), and Commission ($${summaryData.summary.total_atlas_commission_ars}) registered.`);

// 11. Verify Buyer View reflects PAID state
console.log('\n11. Verifying public buyer view reflects PAID confirmation...');
const paidBuyerViewRes = await fetch(`http://localhost:5174/api/commerce/proposals/${token}`);
const paidBuyerViewData = await paidBuyerViewRes.json();
if (paidBuyerViewData.proposal.status !== 'PAID' || paidBuyerViewData.order.status !== 'PAID') {
  throw new Error('Buyer view does not reflect PAID');
}
console.log('✓ Buyer view reflects status: PAID with confirmed payment message.');

console.log('\n==================================================');
console.log('SECTION 13 E2E MANDATORY TEST: PASS');
console.log('ATLAS MERCADO PAGO COMMERCE V1 CERTIFIED');
console.log('==================================================\n');

await client.end();
