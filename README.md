# t4h-checkout-api

Centralized Stripe checkout + products API for T4H portfolio.

Endpoints:
- `GET /api/products?brand=HOLO` — list live products
- `POST /api/checkout` — create Stripe checkout session
- `GET /public/buy-widget.js` — inject buy widget on any T4H site
