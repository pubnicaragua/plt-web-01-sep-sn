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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly&loading=async`
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

const _f = (featureType: string, elementType: string | undefined, color: string) => ({
  ...(featureType ? { featureType } : {}),
  ...(elementType ? { elementType } : {}),
  stylers: elementType === 'labels.text.stroke' ? [{ color }] : [{ color }],
})

export const INCOEX_MAP_STYLE: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#f7f9fd' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f7f9fd' }] },
  _f('poi', 'geometry', '#e9eef7'),
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  _f('road', 'geometry', '#ffffff'),
  _f('road', 'geometry.stroke', '#e3ebf7'),
  _f('road.highway', 'geometry', '#bed2f4'),
  _f('road.highway', 'geometry.stroke', '#f7f9fd'),
  _f('road.highway', 'labels', '#41609c'),
  _f('water', 'geometry', '#b7d6f3'),
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  _f('administrative', 'geometry.stroke', '#d8e2f2'),
  { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

export const NICARAGUA_BOUNDS = { south: 10.6, west: -88.0, north: 15.5, east: -82.5 }

export function nicaraguaRestriction(maps: any) {
  return {
    bounds: new maps.LatLngBounds(
      new maps.LatLng(NICARAGUA_BOUNDS.south, NICARAGUA_BOUNDS.west),
      new maps.LatLng(NICARAGUA_BOUNDS.north, NICARAGUA_BOUNDS.east),
    ),
    strictBounds: false,
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
