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
      return '#e5484d'
    case 'Disponible':
      return '#168e5e'
    case 'En entrega':
      return '#7c3aed'
    default:
      return '#2562ec'
  }
}
