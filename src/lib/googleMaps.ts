export const GOOGLE_MAPS_API_KEY = 'AIzaSyCMwxArmM-BEJuxgbjOiON8KdH_IsNH1F4'

export const MANAGUA_CENTER = { lat: 12.114993, lng: -86.236174 }

declare global {
  interface Window {
    google?: { maps?: any }
  }
}

let mapsPromise: Promise<any | null> | null = null

export function loadGoogleMaps(): Promise<any | null> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (mapsPromise) return mapsPromise
  mapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('google-maps-js') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google?.maps ?? null))
      existing.addEventListener('error', () => { mapsPromise = null; reject(new Error('Google Maps no pudo cargarse')) })
      return
    }
    const script = document.createElement('script')
    script.id = 'google-maps-js'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly&libraries=places&loading=async`
    script.async = true
    script.defer = true
    const timeout = window.setTimeout(() => {
      mapsPromise = null
      script.remove()
      reject(new Error('Google Maps tardó demasiado en cargar'))
    }, 20000)
    script.onload = () => {
      window.clearTimeout(timeout)
      resolve(window.google?.maps ?? null)
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
  switch (status) {
    case 'Fuera de servicio':
      return '#ef6262'
    case 'Disponible':
      return '#22c783'
    case 'En entrega':
      return '#14b8d4'
    default:
      return '#1d5cff'
  }
}

export const INCOEX_MAP_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#3065cd' }] },
  { elementType: 'geometry.stroke', stylers: [{ color: '#2b59c0' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#22469e' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#3968cf' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#86aaf0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dfecff' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#24529f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1e449e' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#88a7ec' }] },
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

export const ROUTE_COLOR = '#4ff0ff'

export function curvedPath(maps: any, from: { lat: number; lng: number }, to: { lat: number; lng: number }, bend = 0.12) {
  const dx = to.lng - from.lng
  const dy = to.lat - from.lat
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-6) return [new maps.LatLng(from.lat, from.lng)]
  const nx = -dy / dist
  const ny = dx / dist
  const points: any[] = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const arc = Math.sin(t * Math.PI) * bend * dist
    points.push(new maps.LatLng(from.lat + dy * t + ny * arc, from.lng + dx * t + nx * arc))
  }
  return points
}

export const NICARAGUA_BOUNDS = { south: 10.6, west: -88.0, north: 15.5, east: -82.5 }

export function nicaraguaRestriction() {
  return {
    north: NICARAGUA_BOUNDS.north,
    south: NICARAGUA_BOUNDS.south,
    east: NICARAGUA_BOUNDS.east,
    west: NICARAGUA_BOUNDS.west,
    strictBounds: true,
  }
}

export function rationalizePoint(point: { lat: number; lng: number }): { lat: number; lng: number } {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return MANAGUA_CENTER
  if (Math.abs(point.lat) < 0.1 && Math.abs(point.lng) < 0.1) return MANAGUA_CENTER
  return point
}

export function incoexPin(maps: any, fill: string, scale = 1.15) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 1C5.9 1 1 5.9 1 12c0 8.2 11 23 11 23s11-14.8 11-23C23 5.9 18.1 1 12 1z" fill="' + fill + '" stroke="#ffffff" stroke-width="1.8"/><circle cx="12" cy="12" r="4.6" fill="#ffffff" opacity=".95"/><circle cx="12" cy="12" r="2.7" fill="#f1b84c"/></svg>'
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    size: new maps.Size(24 * scale, 36 * scale),
    anchor: new maps.Point(12 * scale, 36 * scale),
  }
}
