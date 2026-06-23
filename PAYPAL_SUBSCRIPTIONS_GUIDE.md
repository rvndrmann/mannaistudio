# PayPal Subscriptions Integration Guide

## Can Indian Users Pay via PayPal?

**Short answer: NO for your use case.**

PayPal **cannot** be used for domestic INR payments in India. Here's the breakdown:

### What Works
- Indian Visa/Mastercard/Amex debit & credit cards **can** be linked to PayPal
- Indian buyers **can** pay on **international** (foreign) websites via PayPal
- Cross-border payments in USD/EUR/GBP work fine

### What Does NOT Work
- **Domestic (India-to-India) payments** — blocked since April 2021
- **INR currency subscriptions** — PayPal India does not support INR transactions
- **RuPay cards** — not supported by PayPal
- **Indian PayPal business accounts** — restricted to cross-border export transactions only (RBI approval is for exports only)

### RBI Restrictions on Recurring Payments
- Auto-debits up to Rs 15,000 need no OTP
- Above Rs 15,000 require additional factor authentication
- 24-hour pre-debit notification is mandatory
- Card tokenization enforced (no raw card storage)

### Verdict for AI Director Hub
Since your platform charges **INR 799/month** to **Indian users**, PayPal is **not viable**. Your existing **PayU integration is the correct choice** — it fully supports INR recurring payments with RBI e-mandate compliance.

PayPal would only make sense if you want to accept **international payments in USD** from non-Indian users in the future (as a secondary payment option alongside PayU).

---

## How PayPal Subscriptions Work (Reference)

If you ever need PayPal for international users, here's the flow:

### Prerequisites
1. PayPal Business account (non-India for domestic acceptance)
2. Developer Dashboard credentials (Client ID, Secret)
3. Sandbox accounts for testing

### Step 1: Create a Product

```bash
curl -v -X POST https://api-m.sandbox.paypal.com/v1/catalogs/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS-TOKEN" \
  -H "PayPal-Request-Id: UNIQUE-REQUEST-ID" \
  -d '{
    "name": "AI Director Hub Pro",
    "description": "Monthly membership for premium AI video courses",
    "type": "SERVICE",
    "category": "SOFTWARE",
    "image_url": "https://aidirectorhub.com/logo.png",
    "home_url": "https://aidirectorhub.com"
  }'
```

**Response** returns a `product_id` like `PROD-XXXX`.

### Step 2: Create a Subscription Plan

```bash
curl -v -X POST https://api-m.sandbox.paypal.com/v1/billing/plans \
  -H "Accept: application/json" \
  -H "Authorization: Bearer ACCESS-TOKEN" \
  -H "Content-Type: application/json" \
  -H "PayPal-Request-Id: UNIQUE-REQUEST-ID" \
  -d '{
    "product_id": "PROD-XXXX",
    "name": "AI Director Hub Pro - Monthly",
    "description": "Monthly access to premium courses and expanded portfolio",
    "billing_cycles": [
      {
        "frequency": {
          "interval_unit": "MONTH",
          "interval_count": 1
        },
        "tenure_type": "REGULAR",
        "sequence": 1,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": {
            "value": "9.99",
            "currency_code": "USD"
          }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "setup_fee": {
        "value": "0",
        "currency_code": "USD"
      },
      "setup_fee_failure_action": "CONTINUE",
      "payment_failure_threshold": 3
    }
  }'
```

**Note:** Only one `currency_code` per plan. Create separate plans for different currencies.

**Response** returns a `plan_id` like `P-XXXX`.

### Step 3: Add PayPal Button to Website

```html
<!-- Add to your subscription page -->
<script src="https://www.paypal.com/sdk/js?client-id=YOUR_CLIENT_ID&vault=true&intent=subscription"></script>

<div id="paypal-button-container"></div>

<script>
  paypal.Buttons({
    createSubscription: function(data, actions) {
      return actions.subscription.create({
        'plan_id': 'YOUR_PLAN_ID'
      });
    },
    onApprove: function(data, actions) {
      // data.subscriptionID contains the subscription ID
      // Send this to your server to activate membership
      fetch('/api/paypal/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: data.subscriptionID,
          userId: currentUserId
        })
      });
    },
    onError: function(err) {
      console.error('PayPal error:', err);
    }
  }).render('#paypal-button-container');
</script>
```

### Step 4: Server-Side Verification

Create an API route to verify the subscription with PayPal:

```typescript
// src/app/api/paypal/activate/route.ts (example)
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { subscriptionId, userId } = await req.json()

  // Get access token
  const auth = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64')
  const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })
  const { access_token } = await tokenRes.json()

  // Verify subscription
  const subRes = await fetch(
    `https://api-m.paypal.com/v1/billing/subscriptions/${subscriptionId}`,
    { headers: { 'Authorization': `Bearer ${access_token}` } }
  )
  const subscription = await subRes.json()

  if (subscription.status === 'ACTIVE') {
    // Activate membership in your database
    // Similar to your PayU webhook logic
  }

  return NextResponse.json({ ok: true })
}
```

### Step 5: Handle Webhooks

Subscribe to these webhook events in PayPal Developer Dashboard:
- `BILLING.SUBSCRIPTION.ACTIVATED` — subscription started
- `BILLING.SUBSCRIPTION.CANCELLED` — user cancelled
- `BILLING.SUBSCRIPTION.SUSPENDED` — payment failed
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED` — payment attempt failed
- `PAYMENT.SALE.COMPLETED` — recurring payment received

### Testing
1. Use sandbox at `https://api-m.sandbox.paypal.com`
2. Use sandbox JS SDK: add `&debug=true` to script URL
3. Log into `https://www.sandbox.paypal.com/billing/subscriptions` with business sandbox account to see subscriptions
4. Switch to `https://api-m.paypal.com` for production

---

## Summary: Which Payment Gateway to Use

| Scenario | Gateway | Currency |
|----------|---------|----------|
| Indian users paying in INR | **PayU** (current) | INR |
| International users paying in USD | PayPal Subscriptions | USD |
| Indian users with UPI/Net Banking | **PayU** or Razorpay | INR |

**Current recommendation:** Keep PayU as your primary gateway. Only add PayPal if you expand to international users paying in USD.

## Environment Variables (if adding PayPal later)

```env
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_SECRET=your_secret
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your_client_id
# Sandbox: https://api-m.sandbox.paypal.com
# Live: https://api-m.paypal.com
PAYPAL_API_URL=https://api-m.sandbox.paypal.com
```
