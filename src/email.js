// ─── Sending (Resend HTTP API — replaces nodemailer/SMTP, which cannot
// work in Workers at all since raw TCP sockets aren't available here) ──
export async function sendEmail(env, { to, subject, html }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM, // e.g. "Hijabi Bridal <orders@halalnails.vip>"
      to,
      subject,
      html,
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
      Hijabi Bridal
    </h1>
    ${bodyHtml}
    <p style="font-size: 12px; color: #888; margin-top: 32px;">
      Hijabi Bridal — hijabibridal.github.io
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
    <p>Your Hijabi Bridal order is now being prepared for shipment.</p>
    ${itemsHtml(items)}
    <p>We'll let you know as soon as it's on its way!</p>
    <p>With love,<br/>Hijabi Bridal</p>
  `)
}

export function buildCustomsHoldEmail({ customerName, items }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">A quick update on your order</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>Your order is currently in customs clearance. This is a routine step for international shipments and does not require any action from you.</p>
    ${itemsHtml(items)}
    <p>We'll notify you as soon as it clears and is on its way to you.</p>
    <p>With love,<br/>Hijabi Bridal</p>
  `)
}

export function buildShippedEmail({ customerName, items, trackingNumber, carrier, trackingUrl }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">Your Halal Nails are on the way! 📦</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>Good news — your order has shipped!</p>
    ${itemsHtml(items)}
    ${trackingNumber ? `<p><strong>Tracking number:</strong> ${trackingNumber}</p>` : ''}
    ${carrier ? `<p><strong>Carrier:</strong> ${carrier}</p>` : ''}
    ${trackingUrl ? `<p><a href="${trackingUrl}" style="color: #db2777;">Track your package →</a></p>` : ''}
    <p>Can't wait for you to try them!</p>
    <p>With love,<br/>Hijabi Bridal</p>
  `)
}

export function buildRefundEmail({ customerName, items, amount }) {
  return wrapEmail(`
    <h2 style="font-size: 18px;">Your refund has been processed</h2>
    <p>Hi ${customerName || 'there'},</p>
    <p>We've processed a refund of $${amount} for your order.</p>
    ${itemsHtml(items)}
    <p>Please allow a few business days for it to appear on your original payment method.</p>
    <p>With love,<br/>Hijabi Bridal</p>
  `)
}
