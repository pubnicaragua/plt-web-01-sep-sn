import { useEffect, useRef, useState } from 'react'
import { getTrackingLive } from './lib/api'
import type { TrackingLive } from './types'
import { getDrivingRoute, incoexPin, INCOEX_MAP_STYLE, loadGoogleMaps, MANAGUA_CENTER, nicaraguaRestriction, vehicleMarkerIcon } from './lib/googleMaps'

function formatMinutes(seconds: number | undefined, distanceKm: number) {
  if (seconds && seconds > 0) return Math.max(1, Math.round(seconds / 60))
  return Math.max(2, Math.round(distanceKm * 2.4))
}

export function PublicTrackingView({ tripId }: { tripId: string }) {
  const [tracking, setTracking] = useState<TrackingLive | null>(null)
  const [error, setError] = useState('')
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [routePath, setRoutePath] = useState<any[]>([])
  const [routeDistanceKm, setRouteDistanceKm] = useState(0)
  const [routeDurationSeconds, setRouteDurationSeconds] = useState(0)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const objectsRef = useRef<any[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const next = await getTrackingLive(tripId)
        if (!cancelled) {
          setTracking(next)
          setError('')
        }
      } catch {
        if (!cancelled) setError('No se pudo cargar este seguimiento. Verifica el enlace o intenta nuevamente.')
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 10000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [tripId])

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return
      try {
        mapContainerRef.current.replaceChildren()
        mapRef.current = new maps.Map(mapContainerRef.current, {
          center: MANAGUA_CENTER,
          zoom: 13,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          styles: INCOEX_MAP_STYLE,
          restriction: nicaraguaRestriction(),
        })
        setMapState('ready')
      } catch {
        if (!cancelled) setMapState('error')
      }
    }).catch(() => { if (!cancelled) setMapState('error') })
    return () => { cancelled = true; objectsRef.current.forEach((object) => object.setMap?.(null)); objectsRef.current = []; mapRef.current = null }
  }, [])

  useEffect(() => {
    const maps = window.google?.maps
    const map = mapRef.current
    if (!maps || !map || mapState !== 'ready' || !tracking) return
    let cancelled = false
    objectsRef.current.forEach((object) => object.setMap?.(null))
    objectsRef.current = []

    const originPoint = tracking.route[0]
    const destinationPoint = tracking.route[tracking.route.length - 1]
    if (!originPoint || !destinationPoint) return
    const origin = { lat: originPoint.latitude, lng: originPoint.longitude }
    const destination = { lat: destinationPoint.latitude, lng: destinationPoint.longitude }
    const driver = tracking.driverLocation
    const driverPoint = driver ? { lat: driver.latitude, lng: driver.longitude } : origin
    const add = (object: any) => { object.setMap(map); objectsRef.current.push(object); return object }

    const render = async () => {
      let path = tracking.routeProvider === 'google' && tracking.route.length >= 2
        ? tracking.route.map((point) => ({ lat: point.latitude, lng: point.longitude }))
        : []
      let distanceKm = tracking.routeDistanceKm ?? tracking.distanceKm ?? 0
      let durationSeconds = tracking.routeDurationSeconds ?? 0
      if (path.length < 2) {
        const calculated = await getDrivingRoute(maps, driverPoint, destination)
        path = calculated?.path ?? []
        distanceKm = calculated?.distanceKm ?? distanceKm
        durationSeconds = calculated?.durationSeconds ?? durationSeconds
      }
      if (cancelled) return
      setRoutePath(path)
      setRouteDistanceKm(distanceKm)
      setRouteDurationSeconds(durationSeconds)
      const bounds = new maps.LatLngBounds()
      if (path.length >= 2) {
        add(new maps.Polyline({ path, strokeColor: '#1264ff', strokeOpacity: .94, strokeWeight: 6, zIndex: 4 }))
        path.forEach((point: any) => bounds.extend(point))
      }
      add(new maps.Marker({ position: driverPoint, title: tracking.driver, icon: vehicleMarkerIcon(maps, tracking.transport || tracking.driverVehicle, '#1264ff', true), zIndex: 10 }))
      add(new maps.Marker({ position: origin, title: 'Recogida', icon: incoexPin(maps, '#21c88a', .9), zIndex: 5 }))
      add(new maps.Marker({ position: destination, title: 'Entrega', icon: incoexPin(maps, '#ef6262', .9), zIndex: 5 }))
      bounds.extend(driverPoint); bounds.extend(destination)
      map.fitBounds(bounds, { top: 92, right: 28, bottom: 110, left: 28 })
    }
    void render()
    return () => { cancelled = true }
  }, [tracking, mapState])

  const distance = routeDistanceKm || tracking?.distanceKm || 0
  const eta = formatMinutes(routeDurationSeconds || tracking?.routeDurationSeconds, distance)
  const status = tracking?.status === 'Asignado' ? 'En camino' : tracking?.status ?? 'Cargando'
  const publicUrl = tracking?.shareUrl || window.location.href

  if (error && !tracking) {
    return <main className="public-tracking-page public-tracking-error"><div className="public-error-card"><span className="public-brand">INCOEX <small>Logistics</small></span><h1>Seguimiento no disponible</h1><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Reintentar</button></div></main>
  }

  return <main className="public-tracking-page">
    <div className="public-tracking-shell">
      <section className="public-map-stage">
        <div ref={mapContainerRef} className="public-map-canvas" />
        {mapState === 'loading' && <div className="public-map-loading"><span className="map-spinner" />Cargando mapa…</div>}
        {mapState === 'error' && <div className="public-map-loading">No se pudo cargar Google Maps</div>}
        <div className="public-map-topbar"><span className="public-brand">INCOEX <small>Logistics</small></span><span className="public-live-badge"><i /> Seguimiento en vivo</span></div>
      </section>
      <section className="public-tracking-card">
        <div className="public-drag-handle" />
        <div className="public-status-line"><i /> <span>{status}</span><small>Actualizado ahora</small></div>
        <h1>Llegada en {eta} minutos ({distance.toFixed(1)} km)</h1>
        <p className="public-location"><span>⌖</span> Aproximándose a {tracking?.currentLocationLabel || 'la ubicación del conductor'}</p>
        <div className="public-progress"><span style={{ width: `${tracking ? tracking.status === 'En entrega' ? 78 : tracking.status === 'En camino' ? 45 : 18 : 8}%` }} /></div>
        <div className="public-code-row"><div><small>CÓDIGO DE SEGUIMIENTO</small><strong>Guía: {tracking?.tripId || tripId}</strong></div><div className="public-actions"><button type="button" onClick={() => void copyPublicUrl(publicUrl)}>▣ Copiar</button><button type="button" className="filled" onClick={() => void sharePublicUrl(publicUrl)}>↗ Compartir</button></div></div>
        <div className="public-driver-row"><div className="public-driver-avatar">{initials(tracking?.driver || 'IX')}</div><div className="public-driver-info"><strong>{tracking?.driver || 'Conductor asignado'}</strong><span>{tracking?.driverVehicle || 'Vehículo en ruta'}</span><em>{tracking?.driverPlate || 'Placa pendiente'}</em></div><div className="public-driver-state"><span /> GPS activo</div></div>
        <h2>Estado de envío</h2>
        <div className="public-steps"><PublicStep active label="Asignado" /><PublicStep active={tracking?.status === 'En camino' || tracking?.status === 'En entrega' || tracking?.status === 'Completado'} label="Recogida" /><PublicStep active={tracking?.status === 'Completado'} label="Entrega" /></div>
        <div className="public-tracking-footer"><span>Ruta calculada con Google Maps</span><span>{routePath.length > 2 ? 'Vial' : 'Calculando ruta…'}</span></div>
      </section>
    </div>
  </main>
}

function PublicStep({ active, label }: { active: boolean; label: string }) {
  return <div className={`public-step ${active ? 'active' : ''}`}><i /><span>{label}</span></div>
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)![0] : parts[0]?.slice(0, 2) || 'IX').toUpperCase()
}

async function copyPublicUrl(value: string) {
  await navigator.clipboard?.writeText(value)
}

async function sharePublicUrl(value: string) {
  if (navigator.share) await navigator.share({ title: 'Seguimiento INCOEX', text: 'Consulta el estado de tu envío', url: value })
  else await copyPublicUrl(value)
}
