import { CORS_HEADERS } from './utils.js'
import { handleOrderWebhook } from './orderWebhook.js'
import { handleListOrders, handleUpdateOrderStatus } from './adminOrders.js'
import { handleCreateOrder, handleCaptureOrder } from './googlePay.js'
import { handleSendFeedback } from './feedback.js'
import { handleAddressAutocomplete, handleAddressDetails } from './addressAutocomplete.js'
import { handleCapturePartialCheckout, checkAbandonedCarts, checkReviewRequestEmails } from './abandonedCart.js'

// Sites allowed to call this Worker from a browser. A browser accepts only
// one address per response, so the Worker answers with whichever of these
// is asking.
const ALLOWED_ORIGINS = [
  'https://hijabibridal.com',
  'https://www.hijabibridal.com',
  'https://hijabibridal.github.io',
]

async function routeRequest(request, env) {
  const url = new URL(request.url)

  // Handle CORS preflight for every route at once.
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  switch (url.pathname) {
    case '/order-webhook':
      return handleOrderWebhook(request, env)
    case '/list-orders':
      return handleListOrders(request, env)
    case '/update-order-status':
      return handleUpdateOrderStatus(request, env)
    case '/create-order':
      return handleCreateOrder(request, env)
    case '/capture-order':
      return handleCaptureOrder(request, env)
    case '/send-feedback':
      return handleSendFeedback(request, env)
    case '/address-autocomplete':
      return handleAddressAutocomplete(request, env)
    case '/address-details':
      return handleAddressDetails(request, env)
    case '/capture-partial-checkout':
      return handleCapturePartialCheckout(request, env)
    default:
      return new Response('Not found', { status: 404 })
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await routeRequest(request, env)

    // Swap in the asking site's address on the way out. Requests with no
    // Origin header (like PayPal's webhook) pass through untouched.
    const origin = request.headers.get('Origin')
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', origin)
      headers.set('Vary', 'Origin')
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
    return response
  },

  // Cloudflare calls this automatically on the schedule set in
  // wrangler.toml — this is what actually sends abandoned-cart emails
  // AND the 10-day review-request emails, independent of any customer
  // visiting the site.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAbandonedCarts(env))
    ctx.waitUntil(checkReviewRequestEmails(env))
  },
}
