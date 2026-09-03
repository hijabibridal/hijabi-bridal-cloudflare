// ─── CORS ──────────────────────────────────────────────────────────────
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://hijabibridal.github.io',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

// ─── Order storage (Cloudflare KV — replaces Netlify Blobs) ────────────
export async function saveOrder(env, orderId, data) {
  await env.ORDERS_KV.put(orderId, JSON.stringify(data))
}

export async function getOrder(env, orderId) {
  const raw = await env.ORDERS_KV.get(orderId)
  return raw ? JSON.parse(raw) : null
}

export async function listAllOrders(env) {
  const { keys } = await env.ORDERS_KV.list()
  const orders = await Promise.all(
    keys.map(async (k) => {
      const raw = await env.ORDERS_KV.get(k.name)
      return raw ? JSON.parse(raw) : null
    })
  )
  return orders.filter(Boolean).sort((a, b) => (b.capturedAt || '').localeCompare(a.capturedAt || ''))
}

// ─── LingXing/XLWMS signature ────────────────────────────────────────
// Rewritten for Workers' native Web Crypto API — Node's crypto.createHmac
// isn't available here. This is async (Web Crypto is Promise-based),
// unlike the Node version, so every caller must await it.
function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep)
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortKeysDeep(obj[key])
        return sorted
      }, {})
  }
  return obj
}

export async function signXlwmsRequest(appKey, appSecret, data, reqTime) {
  const dataJson = JSON.stringify(sortKeysDeep(data))
  const stringToSign = appKey + dataJson + reqTime

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(stringToSign))
  const hashArray = Array.from(new Uint8Array(signatureBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── PayPal OAuth (server-side, for create-order/capture-order) ────────
export function getPaypalApiBase(env) {
  return env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

export async function generatePaypalAccessToken(env) {
  // btoa() is Workers-native — no Buffer needed, unlike the Node version.
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)
  const response = await fetch(`${getPaypalApiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    body: 'grant_type=client_credentials',
    headers: { Authorization: `Basic ${auth}` },
  })
  const data = await response.json()
  if (!data.access_token) {
    console.error('Failed to get PayPal access token:', data)
    throw new Error('PAYPAL_AUTH_FAILED')
  }
  return data.access_token
}

// ─── Logistics channels (unchanged data from the Netlify version) ──────
export const LOGISTICS_CHANNELS = {
  US: 'US small parcel-General Cargo',
  AU: 'AU_direct line general cargo',
  TH: 'TH-YT 5-7 Days',
  SG: 'SG-YT 5-7 Days',
  KR: 'KR-YT 5-7 Days',
  CA: 'CA-YT 7-9 Days',
  PL: 'PL-YT 6-9 Days',
  NL: 'NL-YT 6-9 Days',
  IT: 'IT-YT 6-9 Days',
  FR: 'FR-YT 6-9 Days',
  DE: 'DE-YT 6-9 Days',
  GB: 'GB-YT 6-9 Days',
  LV: 'LV-YT 6-9 Days',
  BE: 'BE-YT 6-9 Days',
  JP: 'JP-YT 6-9 Days',
  ES: 'ES-YT 6-9 Days',
  RO: 'RO-YT 6-9 Days',
  CY: 'Cyprus-YT 7-12 Days',
  DK: 'Denmark-YT 6-9 Days',
  AT: 'AT YT-ELE',
  NZ: 'NZ 6-10 DAYS YT',
  QA: 'QA YT 7-12 DAYS',
  SA: 'SA-YT',
  CH: 'CH YT 6-9 DAYS',
  MY: 'MY YT 7-12 DAYS',
  PT: 'PT YT 6-9 DAYS',
  HU: 'HU YT 6-10 DAYS',
  IE: 'IE-YT 6-9 DAYS',
}

export function getLogisticsChannel(countryCode) {
  const channel = LOGISTICS_CHANNELS[countryCode]
  if (!channel) {
    throw new Error(`No logistics channel configured for country: ${countryCode}`)
  }
  return channel
}
