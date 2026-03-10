/* T4H BUY WIDGET v1.0
   Inject via: <script src="https://t4h-checkout-api.vercel.app/buy-widget.js?brand=HOLO&source=holo-org"></script>
   OR inline this snippet with brand/source hardcoded.
*/
(function() {
  const CHECKOUT_API = 'https://t4h-checkout-api.vercel.app';
  const cfg = window.T4H_BUY_CONFIG || {};
  const BRAND = cfg.brand || new URLSearchParams(document.currentScript?.src?.split('?')[1]||'').get('brand') || 'HOLO';
  const SOURCE = cfg.source || new URLSearchParams(document.currentScript?.src?.split('?')[1]||'').get('source') || document.location.hostname.split('.')[0];

  const CSS = `
#t4h-buy-btn{position:fixed;bottom:80px;right:22px;z-index:9999;background:#1a1a2e;color:#fff;border:none;border-radius:50px;padding:12px 20px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.35);display:flex;align-items:center;gap:8px;transition:transform .15s}
#t4h-buy-btn:hover{transform:scale(1.05)}
#t4h-buy-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;align-items:center;justify-content:center}
#t4h-buy-overlay.open{display:flex}
#t4h-buy-modal{background:#0f0f1a;border:1px solid rgba(255,255,255,.1);border-radius:16px;width:min(780px,96vw);max-height:88vh;overflow-y:auto;padding:28px;color:#e8e8f0;position:relative}
#t4h-buy-close{position:absolute;top:16px;right:18px;background:none;border:none;color:#888;font-size:22px;cursor:pointer;line-height:1}
.t4h-buy-title{font-size:22px;font-weight:700;margin-bottom:6px}
.t4h-buy-sub{color:#888;font-size:13px;margin-bottom:20px}
.t4h-buy-tabs{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.t4h-buy-tab{background:#1a1a2e;border:1px solid rgba(255,255,255,.1);color:#aaa;padding:6px 14px;border-radius:20px;font-size:12px;cursor:pointer;transition:all .15s}
.t4h-buy-tab.active,.t4h-buy-tab:hover{background:#6366f1;border-color:#6366f1;color:#fff}
.t4h-buy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.t4h-buy-card{background:#1a1a2e;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;cursor:pointer;transition:all .15s;position:relative}
.t4h-buy-card:hover{border-color:#6366f1;transform:translateY(-2px)}
.t4h-buy-card-name{font-weight:600;font-size:14px;margin-bottom:6px;line-height:1.3}
.t4h-buy-card-desc{font-size:11px;color:#888;margin-bottom:12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.t4h-buy-card-price{font-size:18px;font-weight:700;color:#a5b4fc}
.t4h-buy-card-billing{font-size:10px;color:#666;margin-top:2px}
.t4h-buy-card-btn{position:absolute;bottom:14px;right:14px;background:#6366f1;border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;cursor:pointer;opacity:0;transition:opacity .15s}
.t4h-buy-card:hover .t4h-buy-card-btn{opacity:1}
.t4h-buy-loading{text-align:center;padding:40px;color:#666}
.t4h-buy-empty{text-align:center;padding:40px;color:#555;font-size:13px}
`;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Button
  const btn = document.createElement('button');
  btn.id = 't4h-buy-btn';
  btn.innerHTML = '🛒 Products';
  document.body.appendChild(btn);

  // Modal
  const overlay = document.createElement('div');
  overlay.id = 't4h-buy-overlay';
  overlay.innerHTML = `
<div id="t4h-buy-modal">
  <button id="t4h-buy-close">×</button>
  <div class="t4h-buy-title">Products</div>
  <div class="t4h-buy-sub">Secure checkout powered by Stripe</div>
  <div class="t4h-buy-tabs" id="t4h-buy-tabs"></div>
  <div class="t4h-buy-grid" id="t4h-buy-grid"><div class="t4h-buy-loading">Loading products...</div></div>
</div>`;
  document.body.appendChild(overlay);

  let allProducts = [];
  let activeTab = 'all';

  function formatPrice(p, billing) {
    const n = parseFloat(p);
    return billing === 'monthly' ? `$${n % 1 === 0 ? n : n.toFixed(2)}/mo` : `$${n % 1 === 0 ? n : n.toFixed(2)}`;
  }

  function renderGrid(products) {
    const grid = document.getElementById('t4h-buy-grid');
    if (!products.length) { grid.innerHTML = '<div class="t4h-buy-empty">No products available</div>'; return; }
    grid.innerHTML = products.map(p => `
      <div class="t4h-buy-card" data-sku="${p.sku}" data-billing="${p.billing}">
        <div class="t4h-buy-card-name">${p.display_name}</div>
        <div class="t4h-buy-card-desc">${p.description || ''}</div>
        <div class="t4h-buy-card-price">${formatPrice(p.price_aud, p.billing)}</div>
        <div class="t4h-buy-card-billing">${p.billing === 'monthly' ? 'Monthly subscription' : 'One-time purchase'}</div>
        <button class="t4h-buy-card-btn">Buy Now →</button>
      </div>`).join('');

    grid.querySelectorAll('.t4h-buy-card').forEach(card => {
      card.addEventListener('click', () => startCheckout(card.dataset.sku, card.dataset.billing));
    });
  }

  function renderTabs(products) {
    const billings = [...new Set(products.map(p => p.billing))];
    const tabs = document.getElementById('t4h-buy-tabs');
    const all = [{label:'All', val:'all'}, ...billings.map(b => ({label: b === 'monthly' ? 'Monthly' : 'One-time', val: b}))];
    tabs.innerHTML = all.map(t => `<button class="t4h-buy-tab${t.val===activeTab?' active':''}" data-val="${t.val}">${t.label}</button>`).join('');
    tabs.querySelectorAll('.t4h-buy-tab').forEach(t => {
      t.addEventListener('click', () => {
        activeTab = t.dataset.val;
        tabs.querySelectorAll('.t4h-buy-tab').forEach(x => x.classList.toggle('active', x === t));
        renderGrid(activeTab === 'all' ? allProducts : allProducts.filter(p => p.billing === activeTab));
      });
    });
  }

  async function loadProducts() {
    try {
      const res = await fetch(`${CHECKOUT_API}/api/products?brand=${BRAND}`);
      const data = await res.json();
      allProducts = data.products || [];
      renderTabs(allProducts);
      renderGrid(allProducts);
    } catch(e) {
      document.getElementById('t4h-buy-grid').innerHTML = '<div class="t4h-buy-empty">Unable to load products. Please try again.</div>';
    }
  }

  async function startCheckout(sku, billing) {
    try {
      const res = await fetch(`${CHECKOUT_API}/api/checkout`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ sku, billing, source: SOURCE, success_url: window.location.href, cancel_url: window.location.href })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert('Checkout error: ' + (data.error || 'Unknown error'));
    } catch(e) {
      alert('Unable to start checkout. Please try again.');
    }
  }

  btn.addEventListener('click', () => { overlay.classList.add('open'); loadProducts(); });
  document.getElementById('t4h-buy-close').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

})();
