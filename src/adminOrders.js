import { jsonResponse, listAllOrders, getOrder, saveOrder } from './utils.js'
import { sendEmail, buildOrderProcessingEmail, buildCustomsHoldEmail, buildShippedEmail } from './email.js'

function checkAdminAuth(request, env) {
  return request.headers.get('x-admin-password') === env.ADMIN_PASSWORD
}

export async function handleListOrders(request, env) {
  if (!checkAdminAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const orders = await listAllOrders(env)
    return jsonResponse({ orders })
  } catch (err) {
    console.error('list-orders error:', err)
    return jsonResponse({ error: 'Failed to list orders' }, 500)
  }
}

const STATUS_HANDLERS = {
  processing: (order) => ({
    subject: 'Your Hijabi Bridal order is being processed',
    html: buildOrderProcessingEmail({ customerName: order.customerName, items: order.items }),
  }),
  customs_hold: (order) => ({
    subject: 'An update on your Hijabi Bridal order',
    html: buildCustomsHoldEmail({ customerName: order.customerName, items: order.items }),
  }),
  shipped: (order) => ({
    subject: 'Your Hijabi Bridal order has shipped!',
    html: buildShippedEmail({
      customerName: order.customerName,
      items: order.items,
      trackingNumber: order.trackingNumber,
      carrier: order.carrier,
      trackingUrl: order.trackingUrl,
    }),
  }),
}

export async function handleUpdateOrderStatus(request, env) {
  if (!checkAdminAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const { orderId, status, trackingNumber, carrier, trackingUrl } = await request.json()

    if (!STATUS_HANDLERS[status]) {
      return jsonResponse({ error: `Unknown status: ${status}` }, 400)
    }

    const order = await getOrder(env, orderId)
    if (!order) {
      return jsonResponse({ error: 'Order not found' }, 404)
    }

    if (status === 'shipped') {
      order.trackingNumber = trackingNumber || order.trackingNumber
      order.carrier = carrier || order.carrier
      order.trackingUrl = trackingUrl || order.trackingUrl
    }

    order.status = status
    order.statusUpdatedAt = new Date().toISOString()
    await saveOrder(env, orderId, order)

    const { subject, html } = STATUS_HANDLERS[status](order)
    await sendEmail(env, { to: order.email, subject, html })

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('update-order-status error:', err)
    return jsonResponse({ error: 'Failed to update status' }, 500)
  }
}
