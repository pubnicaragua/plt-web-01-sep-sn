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

export function incoexPin(maps: any, fill: string, scale = 1.15) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36"><path d="M12 1C5.9 1 1 5.9 1 12c0 8.2 11 23 11 23s11-14.8 11-23C23 5.9 18.1 1 12 1z" fill="${fill}" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="4.6" fill="#fff" opacity=".95"/><circle cx="12" cy="12" r="2.7" fill="#075cf5"/></svg>`
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, size: new maps.Size(24 * scale, 36 * scale), anchor: new maps.Point(12 * scale, 36 * scale) }
}
