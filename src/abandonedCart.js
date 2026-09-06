import { jsonResponse, CORS_HEADERS } from './utils.js'
import { sendEmail, buildAbandonedCartEmail } from './email.js'

const THIRTY_MINUTES_MS = 30 * 60 * 1000

// Called when the customer checks "Is this correct?" on the checkout
// page — the first point we're confident we have real, complete info
// worth following up on if they never actually pay.
export async function handleCapturePartialCheckout(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { email, customerName, items } = await request.json()
    if (!email) {
      return jsonResponse({ error: 'Missing email' }, 400)
    }

    const key = `partial:${email}`
    await env.ORDERS_KV.put(key, JSON.stringify({
      email,
      customerName,
      items,
      confirmedAt: Date.now(),
    }))

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('handleCapturePartialCheckout error:', err)
    return jsonResponse({ error: 'Request failed' }, 500)
  }
}

// Called from order-webhook.js the moment a real order actually
// completes — removes the partial record so no abandoned-cart email
// gets sent for a purchase that actually went through.
export async function clearPartialCheckout(env, email) {
  if (!email) return
  try {
    await env.ORDERS_KV.delete(`partial:${email}`)
  } catch (err) {
    console.error('Failed to clear partial checkout:', err)
  }
}

// Runs on a schedule (configured in wrangler.toml) — checks every
// partial-checkout record still sitting around, and sends the
// abandoned-cart email once 30 minutes have passed. Sent once, then
// deleted, so it never repeats.
export async function checkAbandonedCarts(env) {
  const { keys } = await env.ORDERS_KV.list({ prefix: 'partial:' })
  const now = Date.now()

  for (const keyInfo of keys) {
    try {
      const raw = await env.ORDERS_KV.get(keyInfo.name)
      if (!raw) continue
      const record = JSON.parse(raw)

      if (now - record.confirmedAt < THIRTY_MINUTES_MS) {
        continue // not old enough yet
      }

      await sendEmail(env, {
        to: record.email,
        subject: 'You left something beautiful behind 💅',
        html: buildAbandonedCartEmail({ customerName: record.customerName, items: record.items || [] }),
      })

      console.log('Sent abandoned cart email to:', record.email)
      await env.ORDERS_KV.delete(keyInfo.name)
    } catch (err) {
      console.error('Failed processing abandoned cart record:', keyInfo.name, err)
    }
  }
}
