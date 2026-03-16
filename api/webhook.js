const https = require('https');
const crypto = require('crypto');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPA_HOST = 'lzfgigiyqpuuxslsygjt.supabase.co';

function supaRpc(fnName, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const req = https.request({
      hostname: SUPA_HOST,
      path: `/rest/v1/rpc/${fnName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(d); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function verifyStripeSignature(payload, sig, secret) {
  const parts = sig.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts['t'];
  const signed = `${timestamp}.${payload}`;
  const expected = 'v1=' + crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return parts['v1'] === expected;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Read raw body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');

  // Verify signature if secret is set
  const sig = req.headers['stripe-signature'];
  if (STRIPE_WEBHOOK_SECRET && sig) {
    if (!verifyStripeSignature(rawBody, sig, STRIPE_WEBHOOK_SECRET)) {
      console.error('Webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch(e) { return res.status(400).json({ error: 'Invalid JSON' }); }

  const type = event.type;
  console.log('Stripe event:', type, event.id);

  // Handle checkout.session.completed
  if (type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email || session.customer_details?.email;
    const sku = session.metadata?.sku;
    const amountAud = (session.amount_total || 0) / 100;
    const billing = session.mode === 'subscription' ? 'monthly' : 'one_time';
    const paymentIntent = session.payment_intent || session.subscription;

    if (!email || !sku) {
      console.error('Missing email or sku in session', { email, sku });
      return res.status(200).json({ received: true, skipped: 'missing email or sku' });
    }

    try {
      const result = await supaRpc('fn_holo_record_purchase', {
        p_email: email,
        p_sku: sku,
        p_amount_aud: amountAud,
        p_stripe_payment_intent: paymentIntent,
        p_stripe_event_id: event.id,
        p_billing: billing
      });
      console.log('fn_holo_record_purchase result:', JSON.stringify(result));
      return res.status(200).json({ received: true, result });
    } catch(err) {
      console.error('fn_holo_record_purchase error:', err.message);
      return res.status(200).json({ received: true, error: err.message });
    }
  }

  // Handle payment_intent.succeeded (fallback for direct payment intents)
  if (type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const email = pi.receipt_email || pi.metadata?.email;
    const sku = pi.metadata?.sku;
    if (email && sku) {
      await supaRpc('fn_holo_record_purchase', {
        p_email: email,
        p_sku: sku,
        p_amount_aud: (pi.amount || 0) / 100,
        p_stripe_payment_intent: pi.id,
        p_stripe_event_id: event.id,
        p_billing: 'one_time'
      }).catch(console.error);
    }
    return res.status(200).json({ received: true });
  }

  return res.status(200).json({ received: true, type });
};
