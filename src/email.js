// ─── Sending (Resend HTTP API — replaces nodemailer/SMTP, which cannot
// work in Workers at all since raw TCP sockets aren't available here) ──
const REPLY_TO_EMAIL = 'bridalhijabi@gmail.com'

export async function sendEmail(env, { to, subject, html, replyTo }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM, // e.g. "Halal Nails <orders@halalnails.vip>"
      to,
      subject,
      html,
      reply_to: replyTo || REPLY_TO_EMAIL,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Resend send failed:', errorText)
    throw new Error('EMAIL_SEND_FAILED')
  }

  return response.json()
}

// ─── Templates (unchanged from the Netlify version — pure functions,
// no platform-specific code, so nothing needed to change here) ─────────
const PRODUCT_IMAGES = {
  hnb1001: 'https://hijabibridal.github.io/images/halal-nails/attachments/pink-neutrals-halal-nails-solo.webp',
  hnb1002: 'https://hijabibridal.github.io/images/halal-nails/attachments/cool-neutrals-halal-nails-solo.webp',
  hnb1003: 'https://hijabibridal.github.io/images/halal-nails/attachments/berries-halal-nails-solo.webp',
}

function getProductImage(sku) {
  return PRODUCT_IMAGES[sku] || ''
}

function wrapEmail(bodyHtml) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #1a1a1a;">
    <h1 style="color: #db2777; font-size: 22px; text-transform: uppercase; letter-spacing: -0.5px;">
      Halal Nails
    </h1>
    ${bodyHtml}
    <p style="font-size: 12px; color: #888; margin-top: 32px;">
      Halal Nails — hijabibridal.github.io
    </p>
  </div>`
}

function itemsHtml(items) {
  return items.map((item) => `
    <div style="display: flex; gap: 12px; margin-bottom: 16px; align-items: center;">
      ${getProductImage(item.sku) ? `<img src="${getProductImage(item.sku)}" width="70" height="70" style="border-radius: 8px; object-fit: cover;" alt="" />` : ''}
      <p style="margin: 0; font-weight: bold;">${item.quantity} × ${item.sku}</p>
    </div>`).join('')
}

export function buildOrderProcessingEmail({ customerName, items }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">Your order is being processed 📦</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>Just confirming that we have your order and are processing it now! Please give us three days to ship your order.</p>
    ${itemsHtml(items)}
    <p>On it's way soon!</p>
    <p>With love,<br/>Halal Nails</p>
    <p>Questions? Write us at bridalhijabi@gmail.com</p>
  `)
}

export function buildCustomsHoldEmail({ customerName, items }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">A quick update on your order</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>Your order is currently in customs clearance. This is a routine step for international shipments and does not require any action from you.</p>
    ${itemsHtml(items)}
    <p>We'll notify you as soon as it clears and is on its way to you.</p>
    <p>With love,<br/>Halal Nails</p>
  `)
}

// ⚠️ TRANSIT_TIMES duplicated here from the frontend's paypal-countries.ts
// — the frontend and this Cloudflare Worker are separate codebases/repos
// with no shared import path, so this data has to live in both places.
// If the frontend's transit times ever change, this needs a matching
// update, or the two will drift out of sync.
const TRANSIT_TIMES = {
  US: { days: '5–9 business days', carrier: 'USPS' },
  DE: { days: '8–12 business days', carrier: 'DHL' },
  FR: { days: '8–10 business days', carrier: 'La Poste / Colissimo' },
  NL: { days: '8–12 business days', carrier: 'PostNL' },
  BE: { days: '8–12 business days', carrier: 'bpost' },
  GB: { days: '4–7 business days', carrier: 'Royal Mail / Evri' },
  CA: { days: '7–12 business days', carrier: 'Canada Post' },
  AU: { days: '6–9 business days', carrier: 'Australia Post' },
  NZ: { days: '6–9 business days', carrier: 'Local Courier' },
  JP: { days: '3–6 business days', carrier: 'Local Courier' },
  KR: { days: '3–6 business days', carrier: 'Local Courier' },
  SG: { days: '4–7 business days', carrier: 'SingPost' },
  MY: { days: '4–7 business days', carrier: 'Pos Malaysia' },
  AT: { days: '5–10 calendar days', carrier: 'DPD Austria' },
  ES: { days: '7–13 calendar days', carrier: 'Correos' },
  IT: { days: '10–20 calendar days', carrier: 'Local Courier' },
  CH: { days: '14–18 calendar days', carrier: 'Local Courier' },
}

export function buildShippedEmail({ customerName, items, trackingNumber, carrier, trackingUrl, countryCode }) {
  const transitInfo = countryCode ? TRANSIT_TIMES[countryCode] : null
  const transitLine = transitInfo
    ? `<p>Estimated delivery: ${transitInfo.days} via ${transitInfo.carrier} — should be sooner!</p>`
    : ''

  return wrapEmail(`
    <h2 style="font-size: 18px;">Your Halal Nails are on the way! 📦</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>Thanks so much for choosing Halal Nais. Your order has shipped!</p>
    ${itemsHtml(items)}
    ${trackingNumber ? `<p><strong>Tracking number:</strong> ${trackingNumber}</p>` : ''}
    ${carrier ? `<p><strong>Carrier:</strong> ${carrier}</p>` : ''}
    ${transitLine}
    ${trackingUrl ? `<p><a href="${trackingUrl}" style="color: #db2777;">Track your package →</a></p>` : ''}
    <p>Can't wait for you to try them!</p>
    <p>With love,<br/>Halal Nails</p>
  `)
}

export function buildRefundEmail({ customerName, items, amount }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">Your refund has been processed</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>We've processed a refund of $${amount} for your order.</p>
    ${itemsHtml(items)}
    <p>Please allow a few business days for it to appear on your original payment method.</p>
    <p>With love,<br/>Halal Nails</p>
  `)
}

export function buildAbandonedCartEmail({ customerName, items }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">You left something beautiful behind 💅</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>We noticed you didn't finish checking out — your Halal Nails are still waiting for you!</p>
    ${itemsHtml(items)}
    <p style="text-align: center; margin: 24px 0;">
      <a href="https://hijabibridal.github.io/cart" style="background: #db2777; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: bold; text-transform: uppercase; font-size: 13px;">
        Return to Cart
      </a>
    </p>
    <p>With love,<br/>Halal Nails</p>
  `)
}

// New — review request, sent 10 days after an order ships.
export function buildReviewRequestEmail({ customerName }) {
  return wrapEmail(`
    <p>Hellow again! Got your stuff? We'd love to see how you wear them!</p>
    <p>Snap a few pictures to share on our website! Send them to bridalhijabi@gmail.com and let us know your thoughts!</p>
    <p>New nails coming soon. Ready?? <a href="https://hijabibridal.github.io/shop/category/halal-nails" style="color: #db2777;">Click here!</a></p>
  `)
}

// New — internal alert to the business inbox the moment a real order
// comes in. Everything except actual payment/card data, but including
// which method was used (currently always "PayPal").
export function buildNewOrderAlertEmail({
  customerName, email, phone,
  addressLine1, city, state, postalCode, country,
  deliveryInstructions, items, total,
  paymentMethod, paypalTxnId, lingxingOrderNo,
}) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">You have an order!</h2>
    <p><strong>Payment method:</strong> ${paymentMethod}</p>
    <p><strong>PayPal transaction ID:</strong> ${paypalTxnId || 'N/A'}</p>
    <p><strong>LingXing order number:</strong> ${lingxingOrderNo || 'N/A — check LingXing directly if this is missing'}</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
    <p><strong>Customer:</strong> ${customerName || 'Not provided'}</p>
    <p><strong>Email:</strong> ${email || 'Not provided'}</p>
    <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
    <p><strong>Address:</strong> ${addressLine1 || ''}, ${city || ''}${state ? `, ${state}` : ''} ${postalCode || ''} — ${country || ''}</p>
    ${deliveryInstructions ? `<p><strong>Delivery instructions:</strong> ${deliveryInstructions}</p>` : ''}
    <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
    ${itemsHtml(items)}
    <p><strong>Order total:</strong> $${total}</p>
  `)
}

// This one flows the opposite direction — customer to business, via the
// thank-you page's feedback box.
export function buildFeedbackNotificationEmail({ customerName, customerEmail, orderSummaryText, message }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">New message from a customer</h2>
    <p><strong>From:</strong> ${customerName || 'Unknown'} (${customerEmail || 'no email provided'})</p>
    ${orderSummaryText ? `<p><strong>Order:</strong> ${orderSummaryText}</p>` : ''}
    <p><strong>Message:</strong></p>
    <p style="background: #fdf2f8; padding: 12px; border-radius: 8px;">${message}</p>
    <p style="font-size: 12px; color: #888;">Reply directly to this email to respond to the customer.</p>
  `)
}
