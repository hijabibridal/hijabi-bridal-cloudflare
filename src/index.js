import { CORS_HEADERS } from './utils.js'
import { handleOrderWebhook } from './orderWebhook.js'
import { handleListOrders, handleUpdateOrderStatus } from './adminOrders.js'
import { handleCreateOrder, handleCaptureOrder } from './googlePay.js'
import { handleSendFeedback } from './feedback.js'

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
      default:
        return new Response('Not found', { status: 404 })
    }
  },
}
