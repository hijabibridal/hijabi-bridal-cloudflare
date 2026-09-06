import { jsonResponse, CORS_HEADERS } from './utils.js'

// Server-side proxy for Google Places Autocomplete (New) — the browser
// calls US, we call Google. This is what actually fixes the ad-blocker
// problem: nothing in the customer's browser ever talks to a Google
// domain directly, so there's nothing for a blocklist to catch.
//
// Needs its own Cloudflare secret: GOOGLE_PLACES_SERVER_KEY. This should
// be a SEPARATE key from the one used in the old client-side widget —
// that one was restricted by HTTP referrer (only works for browser
// calls), but a server-to-server call from a Worker doesn't send a
// matching referrer, so a referrer-restricted key would fail here. This
// new key needs no referrer restriction at all, since it's protected by
// simply never being exposed to the browser in the first place.

export async function handleAddressAutocomplete(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { input, countryCode, sessionToken } = await request.json()
    if (!input || input.length < 3) {
      return jsonResponse({ suggestions: [] })
    }

    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': env.GOOGLE_PLACES_SERVER_KEY,
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: countryCode ? [countryCode.toLowerCase()] : undefined,
        includedPrimaryTypes: ['street_address'],
        sessionToken,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Places autocomplete error:', data)
      return jsonResponse({ suggestions: [], error: data?.error?.message }, 200)
    }

    const suggestions = (data.suggestions || []).map((s) => ({
      placeId: s.placePrediction?.placeId,
      text: s.placePrediction?.text?.text,
    })).filter((s) => s.placeId && s.text)

    return jsonResponse({ suggestions })
  } catch (err) {
    console.error('handleAddressAutocomplete error:', err)
    return jsonResponse({ suggestions: [], error: 'Request failed' }, 500)
  }
}

export async function handleAddressDetails(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { placeId, sessionToken } = await request.json()
    if (!placeId) {
      return jsonResponse({ error: 'Missing placeId' }, 400)
    }

    const url = new URL(`https://places.googleapis.com/v1/places/${placeId}`)
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken)

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': env.GOOGLE_PLACES_SERVER_KEY,
        'X-Goog-FieldMask': 'addressComponents',
      },
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('Place details error:', data)
      return jsonResponse({ error: data?.error?.message }, 200)
    }

    const components = data.addressComponents || []
    const getComponent = (type, useShort = false) => {
      const found = components.find((c) => c.types.includes(type))
      if (!found) return ''
      return useShort ? found.shortText : found.longText
    }

    let line1 = ''
    const streetNumber = getComponent('street_number')
    const route = getComponent('route', true)
    if (streetNumber) line1 = `${streetNumber} `
    line1 += route

    const city = getComponent('locality') || getComponent('postal_town')
    const state = getComponent('administrative_area_level_1', true)
    const postalCode = getComponent('postal_code')

    return jsonResponse({ line1: line1.trim(), city, state, postalCode })
  } catch (err) {
    console.error('handleAddressDetails error:', err)
    return jsonResponse({ error: 'Request failed' }, 500)
  }
}
