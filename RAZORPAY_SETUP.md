# Razorpay Subscriptions — Setup Guide

The membership ("AI Director Hub Pro", ₹799/month) uses **Razorpay Subscriptions**
for automated recurring billing. PayU has been removed.

## 1. Razorpay Dashboard setup

1. Create / log in to a [Razorpay account](https://dashboard.razorpay.com).
2. Complete KYC and activate the account (live mode needs approval; use **Test mode** first).
3. **Account & Settings → Checkout Features → enable Flash Checkout.**
4. Create a **Plan**: Subscriptions → Plans → Create Plan
   - Billing frequency: **Monthly**, interval **1**
   - Amount: **₹799** (₹999 if no offer — match the billing page price)
   - Copy the **Plan ID** (`plan_XXXXXXXX`).
5. Create a **Webhook**: Settings → Webhooks → Add New Webhook
   - URL: `https://www.aidirectorhub.com/api/razorpay/webhook`
   - Secret: choose any strong string (you'll reuse it as `RAZORPAY_WEBHOOK_SECRET`)
   - Active events: `subscription.charged`, `subscription.activated`,
     `subscription.cancelled`, `subscription.halted`, `subscription.completed`
6. Get **API keys**: Settings → API Keys → Generate (Key ID + Key Secret).

## 2. Environment variables

Set these in `.env.local` (local) **and** in Netlify (Site settings → Environment variables):

| Variable | Value |
|----------|-------|
| `RAZORPAY_KEY_ID` | `rzp_test_...` or `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | from API Keys |
| `RAZORPAY_PLAN_ID` | `plan_...` from step 1.4 |
| `RAZORPAY_WEBHOOK_SECRET` | the secret from step 1.5 |

> `RAZORPAY_KEY_ID` is returned to the browser by the subscription API for
> Checkout — that is expected and safe (it is the public key id). The **secret**
> and **webhook secret** stay server-side only.

## 3. Turn payments on

In the **Admin panel → Plan & Offers**, toggle **Enable Payments** ON. The billing
page will then show the "Subscribe Now" button (Razorpay Checkout).

## 4. How it works

- User clicks **Subscribe Now** → `POST /api/razorpay/subscription` creates a
  subscription against the plan, tagged with the user's `profile_id`.
- Razorpay Checkout opens; the user authorises the mandate (UPI / card / netbanking).
- Razorpay sends `subscription.charged` each cycle → `/api/razorpay/webhook`
  verifies the signature and calls `activate_membership_by_profile`, which extends
  `membership_expires_at` by one month and sets `membership_status = active`.
- `subscription.cancelled` / `halted` clears the stored subscription id; the user
  keeps access until `membership_expires_at`, then drops to the free plan.

## 5. Test mode

Use Razorpay **test** keys and the [test UPI / cards](https://razorpay.com/docs/payments/payments/test-card-details/)
to verify the full flow before going live. Switch the env vars to `rzp_live_*`
keys (and the live Plan ID + webhook) when ready.
