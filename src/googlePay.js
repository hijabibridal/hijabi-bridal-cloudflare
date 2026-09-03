import { jsonResponse, generatePaypalAccessToken, getPaypalApiBase } from './utils.js'

export async function handleCreateOrder(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  try {
    const orderRequestBody = await request.json()
    const accessToken = await generatePaypalAccessToken(env)

    const response = await fetch(`${getPaypalApiBase(env)}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ intent: 'CAPTURE', ...orderRequestBody }),
    })

    const data = await response.json()
    return jsonResponse(data, response.status)
  } catch (err) {
    console.error('create-order error:', err)
    return jsonResponse({ error: 'Failed to create order' }, 500)
  }
}

export async function handleCaptureOrder(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }
  try {
    const { orderId } = await request.json()
    if (!orderId) {
      return jsonResponse({ error: 'Missing orderId' }, 400)
    }

    const accessToken = await generatePaypalAccessToken(env)
    const response = await fetch(
      `${getPaypalApiBase(env)}/v2/checkout/orders/${orderId}/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    const data = await response.json()
    return jsonResponse(data, response.status)
  } catch (err) {
    console.error('capture-order error:', err)
    return jsonResponse({ error: 'Failed to capture order' }, 500)
  }
}
