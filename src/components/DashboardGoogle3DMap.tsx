import { useEffect, useRef, useState } from 'react'
import type { Driver, Trip } from '../types'
import { getTrackingLive } from '../lib/api'
import { loadGoogleMaps, NICARAGUA_CENTER, resetGoogleMapsLoader } from '../lib/googleMaps'

type DemandZone = { lat: number; lng: number; label: string; count: number }
type MapPoint = { lat: number; lng: number }

function getOperationsCamera(drivers: Driver[], trips: Trip[], demandZone?: DemandZone, highlightDriver = '') {
  const driverPoints = drivers
    .filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude))
    .map((driver) => ({ lat: driver.latitude, lng: driver.longitude, name: driver.name }))
  const selectedPoint = driverPoints.find((point) => point.name.trim().toLowerCase() === highlightDriver.trim().toLowerCase())
  const tripPoints: MapPoint[] = trips.flatMap((trip) => [
    Number.isFinite(trip.originLat) && Number.isFinite(trip.originLng) ? { lat: trip.originLat as number, lng: trip.originLng as number } : null,
    Number.isFinite(trip.destinationLat) && Number.isFinite(trip.destinationLng) ? { lat: trip.destinationLat as number, lng: trip.destinationLng as number } : null,
  ]).filter((point): point is MapPoint => point !== null)
  const demandPoint = demandZone && Number.isFinite(demandZone.lat) && Number.isFinite(demandZone.lng) ? [{ lat: demandZone.lat, lng: demandZone.lng }] : []
  const points: MapPoint[] = selectedPoint ? [selectedPoint] : driverPoints.length > 0 ? driverPoints : [...tripPoints, ...demandPoint]
  if (points.length === 0) return { center: NICARAGUA_CENTER, range: 520000 }
  if (selectedPoint || points.length === 1) return { center: points[0], range: 18000 }
  const minLat = Math.min(...points.map((point) => point.lat))
  const maxLat = Math.max(...points.map((point) => point.lat))
  const minLng = Math.min(...points.map((point) => point.lng))
  const maxLng = Math.max(...points.map((point) => point.lng))
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
  const latitudeKm = (maxLat - minLat) * 111
  const longitudeKm = (maxLng - minLng) * 111 * Math.cos((center.lat * Math.PI) / 180)
  const spanKm = Math.max(latitudeKm, longitudeKm, 4)
  return { center, range: Math.max(18000, Math.min(140000, spanKm * 2400)) }
}

function markerColor(status: Driver['status']) {
  if (status === 'Disponible') return '#21c88a'
  if (status === 'En entrega') return '#8067dc'
  if (status === 'Fuera de servicio') return '#e45d67'
  return '#075cf5'
}

export function DashboardGoogle3DMap({ drivers, trips, highlightDriver = '', demandZone, mode = 'all', onDriverSelect }: { drivers: Driver[]; trips: Trip[]; highlightDriver?: string; demandZone?: DemandZone; mode?: 'all' | 'routes' | 'demand'; onDriverSelect?: (driverName: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerConstructorRef = useRef<any>(null)
  const polylineConstructorRef = useRef<any>(null)
  const overlaysRef = useRef<Map<string, any>>(new Map())
  const cameraInitializedRef = useRef(false)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  const rotateFromCompass = () => {
    const map = mapRef.current
    if (!map) return
    const heading = Number(map.heading ?? 0)
    map.heading = (heading + 45) % 360
  }

  useEffect(() => {
    let cancelled = false
    const container = containerRef.current
    setMapState('loading')
    if (!container) return () => { cancelled = true }
    void (async () => {
      try {
        const maps = await loadGoogleMaps()
        if (!maps || cancelled || !container) return
        const { Map3DElement, Marker3DInteractiveElement, Polyline3DInteractiveElement } = await maps.importLibrary('maps3d')
        if (cancelled) return
        container.replaceChildren()
        const camera = getOperationsCamera(drivers, trips, demandZone, highlightDriver)
        const map = new Map3DElement({ center: { lat: camera.center.lat, lng: camera.center.lng, altitude: 0 }, range: camera.range, tilt: 58, heading: 330, mode: 'HYBRID', gestureHandling: 'GREEDY', defaultUIHidden: false })
        map.setAttribute('aria-label', 'Mapa 3D interactivo de Nicaragua con operaciones en vivo')
        container.appendChild(map)
        mapRef.current = map
        markerConstructorRef.current = Marker3DInteractiveElement
        polylineConstructorRef.current = Polyline3DInteractiveElement
        setMapState('ready')
      } catch {
        if (!cancelled) setMapState('error')
      }
    })()
    return () => {
      cancelled = true
      overlaysRef.current.forEach((overlay) => overlay.remove?.())
      overlaysRef.current.clear()
      mapRef.current = null
      markerConstructorRef.current = null
      polylineConstructorRef.current = null
      cameraInitializedRef.current = false
      container.replaceChildren()
    }
  }, [attempt])

  useEffect(() => {
    const map = mapRef.current
    const Marker3DInteractiveElement = markerConstructorRef.current
    const Polyline3DInteractiveElement = polylineConstructorRef.current
    if (mapState !== 'ready' || !map || !Marker3DInteractiveElement || !Polyline3DInteractiveElement) return
    let cancelled = false
    const hasOperationalPoints = drivers.some((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude)) || trips.some((trip) => Number.isFinite(trip.originLat) && Number.isFinite(trip.originLng)) || Boolean(demandZone && Number.isFinite(demandZone.lat) && Number.isFinite(demandZone.lng))
    if (!cameraInitializedRef.current && hasOperationalPoints) {
      const camera = getOperationsCamera(drivers, trips, demandZone, highlightDriver)
      map.center = { lat: camera.center.lat, lng: camera.center.lng, altitude: 0 }
      map.range = camera.range
      cameraInitializedRef.current = true
    }
    const desiredKeys = new Set<string>()
    const upsertOverlay = (key: string, create: () => any, update: (overlay: any) => void) => {
      desiredKeys.add(key)
      const existing = overlaysRef.current.get(key)
      if (existing) { update(existing); return existing }
      const overlay = create()
      update(overlay)
      map.append(overlay)
      overlaysRef.current.set(key, overlay)
      return overlay
    }
    void (async () => {
      if (mode !== 'demand') {
        const routeTrips = trips.filter((item) => Number.isFinite(item.originLat) && Number.isFinite(item.originLng) && Number.isFinite(item.destinationLat) && Number.isFinite(item.destinationLng))
        const routes = await Promise.all(routeTrips.map(async (trip) => {
          let path: Array<{ lat: number; lng: number; altitude: number }> = [{ lat: trip.originLat as number, lng: trip.originLng as number, altitude: 25 }, { lat: trip.destinationLat as number, lng: trip.destinationLng as number, altitude: 25 }]
          try {
            const live = await getTrackingLive(trip.id)
            if (live.route.length >= 2) path = live.route.map((point) => ({ lat: point.latitude, lng: point.longitude, altitude: 25 }))
          } catch {
            // El tramo directo conserva la ruta visible si el endpoint de tracking está frío.
          }
          return { trip, path }
        }))
        if (cancelled) return
        for (const { trip, path } of routes) {
          upsertOverlay(`route:${trip.id}`, () => {
            const route = new Polyline3DInteractiveElement({ outerColor: '#8edbff', outerWidth: .22, drawsOccludedSegments: true, geodesic: true, zIndex: 5 })
            route.addEventListener('gmp-click', () => onDriverSelect?.(trip.driver))
            return route
          }, (route) => {
            route.path = path
            route.strokeColor = trip.status === 'En entrega' ? '#8067dc' : '#075cf5'
            route.strokeWidth = 7
          })
        }
      }
      if (cancelled) return
      if (demandZone && Number.isFinite(demandZone.lat) && Number.isFinite(demandZone.lng)) {
        upsertOverlay('demand', () => {
          const demandMarker = new Marker3DInteractiveElement({ extruded: true, drawsWhenOccluded: true, sizePreserved: true, zIndex: 30 })
          demandMarker.addEventListener('gmp-click', () => onDriverSelect?.(''))
          return demandMarker
        }, (demandMarker) => {
          demandMarker.position = { lat: demandZone.lat, lng: demandZone.lng, altitude: 70 }
          demandMarker.label = `Mayor demanda · ${demandZone.label} · ${demandZone.count} solicitudes`
        })
      }
      for (const driver of drivers.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))) {
        const selected = driver.name.trim().toLowerCase() === highlightDriver.trim().toLowerCase()
        upsertOverlay(`driver:${driver.id}`, () => {
          const marker = new Marker3DInteractiveElement({ extruded: true, drawsWhenOccluded: true, sizePreserved: true })
          marker.addEventListener('gmp-click', () => onDriverSelect?.(driver.name))
          return marker
        }, (marker) => {
          marker.position = { lat: driver.latitude, lng: driver.longitude, altitude: selected ? 80 : 35 }
          marker.label = `${driver.name} · ${driver.status} · ${driver.vehicle}`
          marker.zIndex = selected ? 40 : 20
          marker.style.setProperty('--dashboard-driver-color', markerColor(driver.status))
        })
      }
      if (mode === 'demand' && demandZone) {
        map.center = { lat: demandZone.lat, lng: demandZone.lng, altitude: 0 }
        map.range = 18000
      }
      for (const [key, overlay] of overlaysRef.current) {
        if (!desiredKeys.has(key)) { overlay.remove?.(); overlaysRef.current.delete(key) }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [drivers, trips, highlightDriver, demandZone, mode, mapState, onDriverSelect])

  return <div className="dashboard-google-map dashboard-google-map-3d dashboard-google-map-3d-real"><div ref={containerRef} className="google-map-3d-canvas" /><button type="button" className="map-compass-click-layer" onClick={rotateFromCompass} aria-label="Girar el mapa 45 grados" title="Girar el mapa" />{mapState === 'loading' && <div className="map-status"><span className="map-status-card"><span className="map-spinner" />Cargando mapa 3D de Nicaragua…</span></div>}{mapState === 'error' && <div className="map-status error"><span className="map-status-card"><strong>No se pudo cargar el mapa 3D</strong><small>Verifica la API key, la conexión y la aceleración gráfica del navegador.</small><button type="button" onClick={() => { resetGoogleMapsLoader(); setAttempt((current) => current + 1) }}>Reintentar</button></span></div>}</div>
}
