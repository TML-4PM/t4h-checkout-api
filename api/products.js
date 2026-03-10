const https = require('https');
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

function supaQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: query.replace(/\n/g,' ') });
    const req = https.request({
      hostname: 'lzfgigiyqpuuxslsygjt.supabase.co',
      path: '/rest/v1/rpc/exec_sql', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const brand = req.query.brand || '';
  const brandFilter = brand ? `AND sp.brand_code='${brand}'` : '';

  const result = await supaQuery(`
    SELECT sp.sku, sp.brand_code, sp.display_name, sp.billing, sp.price_aud, sp.stripe_price_id,
           sk.description, sk.tier_code
    FROM public.t4h_stripe_prices sp
    JOIN public.t4h_sku sk ON sk.sku = sp.sku
    WHERE sp.is_live=true ${brandFilter}
    ORDER BY sp.brand_code, sp.price_aud
  `);

  res.setHeader('Cache-Control', 's-maxage=300');
  return res.status(200).json({ products: result.rows || [], count: result.count });
};
