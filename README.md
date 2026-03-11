# The Brief — Launch Guide

**Stack:** Vercel (hosting + serverless) · Supabase (auth + usage) · Stripe (subscriptions)  
**Time to launch:** ~30 minutes

---

## What you're deploying

```
the-brief-launch/
  public/
    index.html       ← The full app (update 2 lines for Supabase)
    manifest.json    ← PWA config
    sw.js            ← Service worker (offline support)
  api/
    generate.js      ← Secure AI proxy — enforces free limit + subscription
    checkout.js      ← Creates Stripe checkout sessions
    webhook.js       ← Keeps Supabase in sync when subscriptions change
  vercel.json        ← Routing config
  package.json       ← Dependencies (Anthropic, Supabase, Stripe SDKs)
  supabase-setup.sql ← Run once in Supabase SQL editor
  .env.example       ← All environment variables you need
```

**How the paywall works:**
- User signs up → gets 1 free campaign generation (no credit card)
- On the 2nd generation attempt → paywall modal → Stripe checkout
- Stripe webhook fires → Supabase `is_subscribed` flips to `true` → unlimited access
- Everything enforced **server-side** in `api/generate.js` — cannot be bypassed

---

## Step 1 — Supabase (10 min)

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Once created, go to **SQL Editor** → **New query** → paste and run `supabase-setup.sql`
3. Go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_KEY` *(keep this secret — never expose in browser)*
4. Go to **Authentication → Providers** → confirm **Email** is enabled (it is by default)
5. **Optional:** Under **Authentication → URL Configuration**, set your site URL to your Vercel domain once you have it

**Then update `public/index.html`** — find these two lines near the top of the `<script>` block and replace with your values:
```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

---

## Step 2 — Stripe (10 min)

1. Go to [stripe.com](https://stripe.com) → create account if needed
2. **Create your product:**
   - Dashboard → **Products** → **Add product**
   - Name: `The Brief — Monthly`
   - Price: `$9.00` / month (recurring)
   - Copy the **Price ID** (starts with `price_...`) → `STRIPE_PRICE_ID`
3. **Get your API key:**
   - **Developers → API Keys** → copy **Secret key** → `STRIPE_SECRET_KEY`
   - ⚠️ Start with `sk_test_...` keys to test first, switch to `sk_live_...` for real payments
4. **Set up webhook** *(do this after Vercel deploy so you have a URL):*
   - **Developers → Webhooks → Add endpoint**
   - URL: `https://YOUR-APP.vercel.app/api/webhook`
   - Select these events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

**Test card:** `4242 4242 4242 4242` · any future expiry · any CVC

---

## Step 3 — Vercel (5 min)

1. Push this folder to a **GitHub repo**
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. Go to **Settings → Environment Variables** and add all of these:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API (service_role) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys |
| `STRIPE_PRICE_ID` | Stripe → Products → your product → Price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint |
| `APP_URL` | Your Vercel domain e.g. `https://the-brief.vercel.app` |

4. **Deploy** — Vercel auto-detects the `api/` folder as serverless functions

5. Once deployed, go back to Stripe and **add the webhook** using your real Vercel URL (Step 2, point 4)

---

## Step 4 — Test end-to-end

1. Open your Vercel URL → auth modal should appear
2. Create an account → confirm email → sign in
3. Fill in 3+ brief sections → generate ideas → **first generation should work free**
4. Try generating again → **paywall modal should appear**
5. Click Subscribe → Stripe test checkout → use card `4242 4242 4242 4242`
6. Should redirect back to app → now subscribed → unlimited generations

**Check the data:** Supabase → Table Editor → `usage` table → should show your user with `is_subscribed = true`

---

## Going live checklist

- [ ] Supabase SQL schema applied
- [ ] `index.html` updated with real Supabase URL + anon key
- [ ] All 8 environment variables set in Vercel
- [ ] Stripe webhook endpoint pointing to your real URL
- [ ] Tested full flow with test cards
- [ ] Switch Stripe keys from `sk_test_...` to `sk_live_...`
- [ ] Set `APP_URL` to your final domain
- [ ] (Optional) Add custom domain in Vercel → Settings → Domains

---

## Pricing

Current price: **$9/month**. To change it:
- Create a new price in Stripe on the same product
- Update `STRIPE_PRICE_ID` in Vercel environment variables
- Redeploy

## Free tier

Currently: **1 free generation**. To change it:
- Open `api/generate.js`
- Find: `usage.generations >= 1`
- Change `1` to however many free generations you want
