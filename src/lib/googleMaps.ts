export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? 'AIzaSyCMwxArmM-BEJuxgbjOiON8KdH_IsNH1F4'

export const MANAGUA_CENTER = { lat: 12.114993, lng: -86.236174 }

declare global {
  interface Window {
    google?: { maps?: any }
    gm_authFailure?: () => void
  }
}

let mapsPromise: Promise<any | null> | null = null

export function loadGoogleMaps(): Promise<any | null> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-js') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google?.maps ?? null), { once: true })
      existing.addEventListener('error', () => { mapsPromise = null; reject(new Error('Google Maps no pudo cargarse')) }, { once: true })
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps-js'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&libraries=places&loading=async`
    script.async = true
    script.defer = true
    const timeout = window.setTimeout(() => {
      mapsPromise = null
      script.remove()
      reject(new Error('Google Maps tardó demasiado en cargar'))
    }, 20000)
    script.onload = () => {
      window.clearTimeout(timeout)
      if (window.google?.maps) resolve(window.google.maps)
      else { mapsPromise = null; reject(new Error('Google Maps no está disponible')) }
    }
    script.onerror = () => {
      window.clearTimeout(timeout)
      mapsPromise = null
      reject(new Error('Google Maps no pudo cargarse; revisa la API key o la conexión'))
    }
    document.head.appendChild(script)
  })
  return mapsPromise
}

export function resetGoogleMapsLoader() {
  mapsPromise = null
  document.getElementById('google-maps-js')?.remove()
}

export function googleStatusColor(status: string): string {
  if (status === 'Fuera de servicio') return '#ef6262'
  if (status === 'Disponible') return '#22b77a'
  if (status === 'En entrega') return '#8067dc'
  return '#075cf5'
}

export const INCOEX_MAP_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f8fc' }] },
  { elementType: 'geometry.stroke', stylers: [{ color: '#dce5ef' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#edf3f7' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d8e2ec' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e5f2ff' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#c8dcec' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dff1f8' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c4d2df' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

export const ROUTE_COLOR = '#075cf5'

export function curvedPath(maps: any, from: { lat: number; lng: number }, to: { lat: number; lng: number }, bend = 0.12) {
  const dx = to.lng - from.lng
  const dy = to.lat - from.lat
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-6) return [new maps.LatLng(from.lat, from.lng)]
  const nx = -dy / dist
  const ny = dx / dist
  const points: any[] = []
  for (let index = 0; index <= 28; index += 1) {
    const t = index / 28
    const arc = Math.sin(t * Math.PI) * bend * dist
    points.push(new maps.LatLng(from.lat + dy * t + ny * arc, from.lng + dx * t + nx * arc))
  }
  return points
}

export function nicaraguaRestriction() {
  return { latLngBounds: { north: 15.5, south: 10.6, east: -82.5, west: -88 }, strictBounds: true }
}

export function rationalizePoint(point: { lat: number; lng: number }): { lat: number; lng: number } {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return MANAGUA_CENTER
  if (Math.abs(point.lat) < 0.1 && Math.abs(point.lng) < 0.1) return MANAGUA_CENTER
  return point
}

function haversineMeters(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const radius = 6371000
  const toRad = (value: number) => value * Math.PI / 180
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const latFrom = toRad(from.lat)
  const latTo = toRad(to.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(latFrom) * Math.cos(latTo) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function routeDistanceMeters(route: any) {
  return (route?.legs ?? []).reduce((total: number, leg: any) => total + Number(leg?.distance?.value ?? Number.POSITIVE_INFINITY), 0)
}

function routeEndpoints(route: any) {
  const firstLeg = route?.legs?.[0]
  const lastLeg = route?.legs?.[route.legs.length - 1]
  const start = firstLeg?.start_location
  const end = lastLeg?.end_location
  if (!start || !end) return null
  return {
    start: { lat: typeof start.lat === 'function' ? start.lat() : start.lat, lng: typeof start.lng === 'function' ? start.lng() : start.lng },
    end: { lat: typeof end.lat === 'function' ? end.lat() : end.lat, lng: typeof end.lng === 'function' ? end.lng() : end.lng },
  }
}

function chooseRoadRoute(result: any, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const routes = Array.isArray(result?.routes) ? result.routes.filter((route: any) => routeDistanceMeters(route) < Number.POSITIVE_INFINITY) : []
  if (!routes.length) return null
  const directDistance = Math.max(1, haversineMeters(origin, destination))
  return routes.reduce((best: any, route: any) => {
    const distance = routeDistanceMeters(route)
    const directness = distance / directDistance
    const bestDistance = routeDistanceMeters(best)
    const bestDirectness = bestDistance / directDistance
    // Prefer the shortest route, with a small penalty for an unusually indirect detour.
    const score = distance * (directness > 2.35 ? 1.2 : 1)
    const bestScore = bestDistance * (bestDirectness > 2.35 ? 1.2 : 1)
    return score < bestScore ? route : best
  })
}

/**
 * Requests a driving route while keeping endpoints on the nearest usable road.
 * Google Directions already performs road matching, but retrying once with the
 * matched endpoints avoids large access-road returns when a point was clicked
 * inside a property or parking area.
 */
export function requestRoadRoute(maps: any, origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<any | null> {
  const service = new maps.DirectionsService()
  const request = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => new Promise<any | null>((resolve) => {
    service.route({
      origin: from,
      destination: to,
      travelMode: maps.TravelMode.DRIVING,
      provideRouteAlternatives: true,
      avoidFerries: true,
      region: 'ni',
      unitSystem: maps.UnitSystem?.METRIC,
    }, (result: any, status: any) => resolve(status === 'OK' && result ? result : null))
  })

  return request(origin, destination).then(async (result) => {
    if (!result) return null
    const selected = chooseRoadRoute(result, origin, destination)
    if (!selected) return null
    const endpoints = routeEndpoints(selected)
    if (!endpoints || haversineMeters(origin, endpoints.start) <= 120 && haversineMeters(destination, endpoints.end) <= 120) {
      return { ...result, routes: [selected] }
    }
    const rematched = await request(endpoints.start, endpoints.end)
    if (!rematched) return { ...result, routes: [selected] }
    const rematchedSelected = chooseRoadRoute(rematched, endpoints.start, endpoints.end)
    return rematchedSelected ? { ...rematched, routes: [rematchedSelected] } : { ...result, routes: [selected] }
  })
}

export function incoexPin(maps: any, fill: string, scale = 1.15) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 1C5.9 1 1 5.9 1 12c0 8.2 11 23 11 23s11-14.8 11-23C23 5.9 18.1 1 12 1z" fill="${fill}" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="4.6" fill="#fff" opacity=".95"/><circle cx="12" cy="12" r="2.7" fill="#075cf5"/></svg>`
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, size: new maps.Size(24 * scale, 36 * scale), anchor: new maps.Point(12 * scale, 36 * scale) }
}

export function vehicleMarkerIcon(maps: any, vehicle = '', color = ROUTE_COLOR, online = true) {
  const normalized = vehicle.toLowerCase()
  const glyph = normalized.includes('moto') || normalized.includes('scooter')
    ? '<path d="M10.4 28.6h3.2l2.8-6.1h3.2a4.2 4.2 0 0 1 4.2 4.2v1.9h-1.8a3.2 3.2 0 0 0-6.3.6H9.1a3.2 3.2 0 0 0-6.3-.6H1.1v-1.9a4.2 4.2 0 0 1 4.2-4.2h3.7l1.4 3.1Zm-5.1 1.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm13.9 0a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM8.5 20.3h7.2l-2-4.3h-4l-1.2 4.3Z"/> '
    : normalized.includes('camion') || normalized.includes('truck') || normalized.includes('sprinter')
      ? '<path d="M3 13.2h13.4v11.1H3V13.2Zm13.4 4h4.4l3.1 3.2v3.9h-7.5v-7.1Zm-9.9 9.4a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm12.3 0a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM18 18.8v2.1h3.2L19.4 19H18Z"/> '
      : '<path d="M4.2 17.4 6 12.5h13.7l2.2 4.9h1.4a1.7 1.7 0 0 1 1.7 1.7v7.4h-2.7a3.1 3.1 0 0 0-6.2 0H10a3.1 3.1 0 0 0-6.2 0H1.2v-7.4a1.7 1.7 0 0 1 1.7-1.7h1.3Zm4-3.1-1.1 3.1h11.6l-1.4-3.1H8.2ZM6.9 27a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm11.7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/> '
  const muted = online ? color : '#8090aa'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="25" fill="#071b4f" fill-opacity=".82" stroke="#fff" stroke-opacity=".92" stroke-width="2.4"/><circle cx="28" cy="28" r="21" fill="${muted}"/><g fill="#fff" transform="translate(15 13) scale(.92)">${glyph}</g><circle cx="42" cy="12" r="4.2" fill="${online ? '#21c88a' : '#aab3c2'}" stroke="#071b4f" stroke-width="2"/></svg>`
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new maps.Size(56, 56), anchor: new maps.Point(28, 28) }
}

export type DrivingRouteResult = { path: any[]; distanceKm: number; durationSeconds: number }

const routePromises = new Map<string, Promise<DrivingRouteResult | null>>()

export function getDrivingRoute(maps: any, from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<DrivingRouteResult | null> {
  const key = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}:${to.lat.toFixed(5)},${to.lng.toFixed(5)}`
  const existing = routePromises.get(key)
  if (existing) return existing
  const pending = new Promise<DrivingRouteResult | null>((resolve) => {
    if (!maps.DirectionsService) { resolve(null); return }
    const service = new maps.DirectionsService()
    service.route({
      origin: from,
      destination: to,
      travelMode: maps.TravelMode?.DRIVING ?? 'DRIVING',
      provideRouteAlternatives: false,
      drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
    }, (result: any, status: string) => {
      if (status !== 'OK' || !result?.routes?.[0]) { resolve(null); return }
      const route = result.routes[0]
      const legs = Array.isArray(route.legs) ? route.legs : []
      const distanceMeters = legs.reduce((sum: number, leg: any) => sum + Number(leg.distance?.value ?? 0), 0)
      const durationSeconds = legs.reduce((sum: number, leg: any) => sum + Number(leg.duration_in_traffic?.value ?? leg.duration?.value ?? 0), 0)
      resolve({ path: route.overview_path ?? [], distanceKm: distanceMeters / 1000, durationSeconds })
    })
  }).catch(() => null)
  routePromises.set(key, pending)
  return pending
}
