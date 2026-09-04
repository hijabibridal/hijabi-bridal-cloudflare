import { jsonResponse } from './utils.js'
import { sendEmail, buildFeedbackNotificationEmail } from './email.js'

const BUSINESS_EMAIL = 'bridalhijabi@gmail.com'

export async function handleSendFeedback(request, env) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { customerName, customerEmail, orderSummaryText, message } = await request.json()

    if (!message || !message.trim()) {
      return jsonResponse({ error: 'Message is required' }, 400)
    }

    await sendEmail(env, {
      to: BUSINESS_EMAIL,
      subject: `New message from ${customerName || 'a customer'}`,
      html: buildFeedbackNotificationEmail({ customerName, customerEmail, orderSummaryText, message }),
      // Reversed from the other emails — replying to THIS one should go
      // back to the customer who wrote it, not to the business itself.
      replyTo: customerEmail || undefined,
    })

    return jsonResponse({ success: true })
  } catch (err) {
    console.error('send-feedback error:', err)
    return jsonResponse({ error: 'Failed to send feedback' }, 500)
  }
}
