const https = require('https');

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const {
      email, name,
      source = 'website',
      sku_interest = null,
      utm_campaign = null,
      metadata = {}
    } = req.body;

    if (!email) return res.status(400).json({ error: 'email required' });

    const result = await supaRpc('fn_holo_capture_lead', {
      p_email: email,
      p_name: name || email,
      p_source: source,
      p_sku_interest: sku_interest,
      p_utm_campaign: utm_campaign,
      p_metadata: metadata
    });

    return res.status(200).json({
      success: true,
      lead_id: result.lead_id,
      account_id: result.account_id,
      is_new: result.is_new
    });
  } catch(err) {
    console.error('lead capture error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
