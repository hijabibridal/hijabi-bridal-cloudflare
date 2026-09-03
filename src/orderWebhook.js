import { saveOrder, getOrder, signXlwmsRequest, getLogisticsChannel } from './utils.js'
import { sendEmail, buildRefundEmail } from './email.js'

export async function handleOrderWebhook(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const rawBody = await request.text()
  // querystring.parse (Node) isn't available — URLSearchParams handles
  // the same x-www-form-urlencoded format natively in Workers.
  const ipnData = Object.fromEntries(new URLSearchParams(rawBody).entries())
  console.log('Raw IPN received:', ipnData)

  const PAYPAL_IPN_VERIFY_URL =
    env.PAYPAL_ENV === 'live'
      ? 'https://ipnpb.paypal.com/cgi-bin/webscr'
      : 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'

  const verifyBody = 'cmd=_notify-validate&' + rawBody
  const verifyResponse = await fetch(PAYPAL_IPN_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyBody,
  })
  const verifyText = await verifyResponse.text()

  if (verifyText !== 'VERIFIED') {
    console.error('IPN verification failed:', verifyText)
    return new Response('Invalid IPN', { status: 400 })
  }

  // ─── Refund branch ───────────────────────────────────────────────
  if (ipnData.payment_status === 'Refunded') {
    const originalOrderId = ipnData.parent_txn_id
    if (!originalOrderId) {
      console.error('Refund IPN missing parent_txn_id')
      return new Response('Refund ignored — no parent_txn_id', { status: 200 })
    }

    const order = await getOrder(env, originalOrderId)
    if (!order) {
      console.error('No stored order found for refunded transaction:', originalOrderId)
      return new Response('Refund ignored — original order not found', { status: 200 })
    }

    order.status = 'refunded'
    order.statusUpdatedAt = new Date().toISOString()
    await saveOrder(env, originalOrderId, order)

    const refundAmount = Math.abs(parseFloat(ipnData.mc_gross || '0')).toFixed(2)

    await sendEmail(env, {
      to: order.email,
      subject: 'Your Hijabi Bridal refund has been processed',
      html: buildRefundEmail({ customerName: order.customerName, items: order.items, amount: refundAmount }),
    })

    console.log('Refund email sent for order:', originalOrderId)
    return new Response('Refund processed', { status: 200 })
  }

  // ─── New order branch ────────────────────────────────────────────
  if (ipnData.payment_status !== 'Completed') {
    return new Response('Ignored — not a completed payment', { status: 200 })
  }

  const customField = ipnData.custom || ''
  const skusMatch = customField.match(/SKUS:(.*?)\|PHONE:/)
  const phoneMatch = customField.match(/\|PHONE:(.*?)\|NOTE:/)
  const noteMatch = customField.match(/\|NOTE:(.*)$/)

  const skuPart = skusMatch ? skusMatch[1] : ''
  const phone = phoneMatch ? phoneMatch[1] : ''
  const notePart = noteMatch ? noteMatch[1] : ''

  const skuList = skuPart.split(',').filter(Boolean)
  const productList = skuList.map((entry) => {
    const [sku, qty] = entry.split('x')
    return { sku, quantity: parseInt(qty, 10) || 1 }
  })

  const orderData = {
    whCode: 'SP01',
    thirdOrderNo: ipnData.txn_id,
    subOrderType: 1,
    logisticsChannel: getLogisticsChannel(ipnData.address_country_code),
    remark: notePart || undefined,
    receiver: ipnData.address_name,
    telephone: phone,
    email: ipnData.payer_email,
    countryRegionCode: ipnData.address_country_code,
    provinceCode: ipnData.address_state,
    provinceName: ipnData.address_state,
    cityName: ipnData.address_city,
    postCode: ipnData.address_zip,
    addressOne: ipnData.address_street,
    residential: '0',
    productList,
  }

  const reqTime = String(Math.floor(Date.now() / 1000))
  // NOTE: now async (Web Crypto), unlike the Node version — must await.
  const authCode = await signXlwmsRequest(env.XLWMS_APP_KEY, env.XLWMS_APP_SECRET, [orderData], reqTime)

  const xlwmsResponse = await fetch(
    `https://api.xlwms.com/openapi/v1/outboundOrder/create?authcode=${authCode}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appKey: env.XLWMS_APP_KEY, reqTime, data: [orderData] }),
    }
  )
  const xlwmsResult = await xlwmsResponse.json()
  console.log('XLWMS response:', xlwmsResult)

  try {
    await saveOrder(env, ipnData.txn_id, {
      orderId: ipnData.txn_id,
      customerName: ipnData.address_name,
      email: ipnData.payer_email,
      phone,
      items: skuList.map((entry) => {
        const [sku, qty] = entry.split('x')
        return { sku, quantity: parseInt(qty, 10) || 1 }
      }),
      deliveryInstructions: notePart,
      addressLine1: ipnData.address_street,
      city: ipnData.address_city,
      state: ipnData.address_state,
      postalCode: ipnData.address_zip,
      country: ipnData.address_country_code,
      total: ipnData.mc_gross,
      capturedAt: new Date().toISOString(),
      status: 'paid',
      xlwmsSuccess: xlwmsResult?.data?.[0]?.success ?? false,
    })
  } catch (err) {
    console.error('Failed to save order to store:', err)
  }

  return new Response(JSON.stringify({ received: true, xlwmsResult }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
