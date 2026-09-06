import { CORS_HEADERS } from './utils.js'
import { handleOrderWebhook } from './orderWebhook.js'
import { handleListOrders, handleUpdateOrderStatus } from './adminOrders.js'
import { handleCreateOrder, handleCaptureOrder } from './googlePay.js'
import { handleSendFeedback } from './feedback.js'
import { handleAddressAutocomplete, handleAddressDetails } from './addressAutocomplete.js'
import { handleCapturePartialCheckout, checkAbandonedCarts } from './abandonedCart.js'

export default {
  async fetch(request, env, ctx) {
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
  },

  // Cloudflare calls this automatically on the schedule set in
  // wrangler.toml — this is what actually sends abandoned-cart emails,
  // independent of any customer visiting the site.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAbandonedCarts(env))
  },
}
