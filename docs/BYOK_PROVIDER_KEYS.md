# Bring Your Own Keys

Customers connect their own model-provider credentials. Generations and Director
chat turns on a connected provider are billed to them by that provider directly
and cost no studio credits. Providers they have not connected keep spending
credits exactly as before.

## The three layers

| | No key connected | Key connected |
| :--- | :--- | :--- |
| Default | Studio credits | Their key, 0 credits |
| **Only my own keys** | **Refused** — nothing runs | Their key, 0 credits |

The separation is **per provider and absolute**. Connecting BytePlus makes
Seedance free while an OpenAI keyframe still costs credits. There is no blended
bill and no silent fallback in either direction: a key that stops working fails
the job rather than quietly spending studio credits.

`decideBilling()` in `src/lib/byok/billing.ts` is the whole rule, and every path
that can charge reads it.

## Where the secret lives

Credentials sit in a `byok` schema that PostgREST does not expose, so no browser
can reach the tables at all. Each secret is sealed under its own AES-256-GCM
data encryption key, and that key is wrapped by Google Cloud KMS — the rows
alone decrypt to nothing. Tampering with any of the ciphertext, nonce, tag or
wrapped key fails loudly rather than returning something.

The schema being unexposed applies to the service role too, which is what
supabase-js speaks through. Exposing it would have fixed the symptom and given
away the property, so the vault is reached through seven `SECURITY DEFINER`
functions in `public`, each doing one thing, with execute revoked from `public`,
`anon` and `authenticated` and granted to `service_role` alone. That grant is
the entire control: `byok_read_credential` is the only path to ciphertext in the
system, and without the revoke it would hand ciphertext to any signed-in browser
that guessed the function name.

There is no reveal. Replacement is supported; retrieval is not, and no endpoint
exists that could serve one.

## A credential is an object, not a string

Providers do not agree on what a credential is. OpenAI, Gemini and fal.ai are
one token each. BytePlus needs three parts — the ARK API key for generation,
plus an access/secret pair and an asset group for the Asset Library, which is
what clears Seedance's real-person check, so character work fails without them.
Every part travels under one key and one authentication tag.

A BytePlus key missing its access/secret pair refuses character shots rather
than registering the customer's reference images to the platform's own Asset
Library, which would put their pictures on our account and hand them an asset id
their key cannot resolve.

## Which account a call runs on

The credential is carried in async-local storage for the duration of one job or
one chat turn, and the provider modules read it at the single point where they
used to read `process.env`. Threading a parameter through instead would mean
every call site is a chance to forget one — and a forgotten one does not fail,
it falls back to the platform key, so the customer's work is billed to us and
the feature is wrong in the direction nobody notices.

`byteplus.ts` alone reads ARK secrets in five places. One choke point per secret
makes the mistake unrepresentable, and a test asserts every provider offered for
BYOK actually reads the active credential.

## Provider names, in two catalogues

The generation catalogue labels Google's models `google`; the credential is
called `gemini` — the same account named differently in two files written at
different times. Compared directly, a connected Gemini key never matched a
Google image model, so it silently charged credits and ran on the platform
account. `byokProviderFor()` maps between them, and a test asserts every
provider in the generation catalogue has a mapping: one without cannot run on a
customer key at all, and under only-my-own-keys becomes unusable rather than
merely billed.

## Every charge path asks

There are three, written at different times, and for a while only one asked.
The Director's `submit_generation` consulted the rule; the direct image and
video routes billed straight from the rate card. So a user who had chosen to run
on their own keys still had credits taken, and a user who had connected a key
was charged anyway and rendered on the platform account. The setting looked
enforced because the path everyone tested was the one that enforced it.

The same applies to refunds. `credits_used || estimated_credits` is correct only
while every job charges; a BYOK job has `credits_used` of zero, so it falls
through to the estimate and refunds money nobody paid — repeat a failing
generation and it prints credits. Each refund site had its own copy of that
expression. `refundableCredits()` reads the recorded `billing_mode` instead, and
a test walks all three paths rather than trusting that the last one found was
the last one.

## Chat is metered

Generation was metered from the day it shipped; the agent never was. A Director
turn is six or seven model round trips, each carrying a context that grows as it
goes, and all of it was free.

Priced from published provider rates, converted at the studio's existing
1 credit = $0.01 and marked up 2x — note the generation rate card uses 2.2x, so
chat sitting at 2.0 is deliberate and is one constant, `CHAT_MARKUP`.

Charged after the turn, never before: a failed turn produced no reply, and the
token count is not known until it is done. Not charged at all when the
customer's own key served it. A failed deduction is logged and swallowed —
losing the reply the user is reading over a billing write is the worse outcome.

Usage is summed across steps rather than assigned. Keeping only the last round
trip's tokens, which is what assignment does, reported a fraction of the cost
and undercharged by roughly that factor while looking perfectly reasonable.

## Configuration

Server-side only, never `NEXT_PUBLIC_*`:

```
GOOGLE_KMS_PROJECT_ID
GOOGLE_KMS_LOCATION
GOOGLE_KMS_KEY_RING
GOOGLE_KMS_KEY_NAME
GOOGLE_KMS_SERVICE_ACCOUNT_JSON
```

`byokIsConfigured()` requires every part. A half-configured server would accept
a customer's key on the way in and fail to unwrap it at generation time, which
is the worst moment to find out. Without them every BYOK endpoint returns 503
and nothing else changes.

The key name may be a bare key with the other three composing the path, or a
full resource path on its own. **In a `.env` file the service account JSON must
be on one line** — dotenv stops a value at the first newline, so a
pretty-printed paste silently becomes a truncated value plus a scattering of
stray lines. Netlify stores values whole, so a multi-line paste is fine there.

## Files

| Path | |
| :--- | :--- |
| `src/lib/byok/envelope.ts` | Seal and open a credential; KMS wrap injected |
| `src/lib/byok/kms.ts` | Cloud KMS as the key wrapper, and readable failures |
| `src/lib/byok/credential-service.ts` | The only code that touches the vault |
| `src/lib/byok/providers.ts` | Credential shapes and the outbound host allowlist |
| `src/lib/byok/billing.ts` | Who pays, what a failure refunds |
| `src/lib/byok/active-credential.ts` | The credential in force for this work |
| `src/lib/byok/chat-pricing.ts` | Token rates and what a turn costs |
| `src/lib/byok/preferences.ts` | "Only my own keys" |
| `supabase/migrations/20260819180000_byok_credential_vault.sql` | The vault |
| `supabase/migrations/20260819200000_byok_vault_access.sql` | Reaching it safely |

## Still to verify

BytePlus BYOK end to end, including the Asset Library path. Video generation on
a customer key. Chat metering actually deducting, which needs a turn on a
provider the user has not connected. See the 2026-08-20 handoff.
