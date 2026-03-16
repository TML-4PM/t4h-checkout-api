const https = require('https');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const SUPA_URL   = process.env.SUPABASE_URL || 'https://lzfgigiyqpuuxslsygjt.supabase.co';
const SUPA_KEY   = process.env.SUPABASE_SERVICE_KEY;

function stripePost(path, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request({
      hostname: 'api.stripe.com', path: `/v1/${path}`, method: 'POST',
      headers: { 'Authorization': `Bearer ${STRIPE_KEY}`,
                 'Content-Type': 'application/x-www-form-urlencoded',
                 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function supaQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request({
      hostname: 'lzfgigiyqpuuxslsygjt.supabase.co',
      path: '/rest/v1/rpc/exec_sql', method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`,
                 'Content-Length': Buffer.byteLength(body) }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// Billing tiers:
//   monthly    → individual recurring
//   one_time   → individual one-time
//   wl_monthly → white-label recurring (reseller)
//   wl_once    → white-label one-time (reseller)
function stripeMode(billing) {
  return billing === 'monthly' || billing === 'wl_monthly' ? 'subscription' : 'payment';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      sku,
      billing = 'one_time',   // monthly | one_time | wl_monthly | wl_once
      success_url,
      cancel_url,
      customer_email,
      source,
      reseller_id             // optional: tag WL orders with reseller reference
    } = req.body;

    if (!sku) return res.status(400).json({ error: 'sku required' });

    const validBillings = ['monthly','one_time','wl_monthly','wl_once'];
    if (!validBillings.includes(billing)) {
      return res.status(400).json({ error: `Invalid billing. Use: ${validBillings.join(', ')}` });
    }

    // Lookup price from t4h_stripe_prices
    const priceRes = await supaQuery(
      `SELECT stripe_price_id, stripe_product_id, price_aud, display_name ` +
      `FROM public.t4h_stripe_prices ` +
      `WHERE sku='${sku}' AND billing='${billing}' AND is_live=true LIMIT 1`
    );

    if (!priceRes.rows || !priceRes.rows.length) {
      return res.status(404).json({
        error: `No Stripe price found for SKU ${sku} / ${billing}`,
        hint: `Available billings: monthly, one_time, wl_monthly, wl_once`
      });
    }

    const { stripe_price_id, price_aud, display_name } = priceRes.rows[0];
    const origin     = req.headers.origin || 'https://t4h-checkout-api.vercel.app';
    const successUrl = success_url || `${origin}/success?sku=${sku}&billing=${billing}`;
    const cancelUrl  = cancel_url  || `${origin}/cancelled`;
    const isWL       = billing.startsWith('wl_');

    const sessionParams = {
      'line_items[0][price]':    stripe_price_id,
      'line_items[0][quantity]': '1',
      mode:                      stripeMode(billing),
      success_url:               `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:                cancelUrl,
      'metadata[sku]':           sku,
      'metadata[billing]':       billing,
      'metadata[source]':        source || 'unknown',
      'metadata[is_wl]':         isWL ? 'true' : 'false',
    };
    if (customer_email)  sessionParams.customer_email  = customer_email;
    if (reseller_id)     sessionParams['metadata[reseller_id]'] = reseller_id;

    const session = await stripePost('checkout/sessions', sessionParams);
    if (session.error) return res.status(400).json({ error: session.error.message });

    // Log to cap_leads (non-blocking)
    supaQuery(
      `INSERT INTO public.cap_leads (source, status, metadata) ` +
      `VALUES ('${source || sku}', 'checkout_initiated', ` +
      `'{"sku":"${sku}","billing":"${billing}","is_wl":${isWL},"amount":${price_aud},"session_id":"${session.id}"}'::jsonb) ` +
      `ON CONFLICT DO NOTHING`
    ).catch(() => {});

    return res.status(200).json({
      url:        session.url,
      session_id: session.id,
      billing,
      price_aud,
      display_name,
      is_wl:      isWL
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
