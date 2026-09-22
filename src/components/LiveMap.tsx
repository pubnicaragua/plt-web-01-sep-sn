import { useEffect, useRef, useState } from 'react'
import { getApiBase, getTrackingLive } from '../lib/api'
import type { Section, TrackingOverview } from '../types'
import { getDrivingRoute, googleStatusColor, INCOEX_MAP_STYLE, loadGoogleMaps, MANAGUA_CENTER, nicaraguaRestriction, vehicleMarkerIcon } from '../lib/googleMaps'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character))
}

export function LiveMap({ tracking, onNavigate, showDemo = false, demandZone }: { tracking: TrackingOverview; onNavigate: (section: Section) => void; showDemo?: boolean; demandZone?: { lat: number; lng: number; label: string; count: number } }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const objectsRef = useRef<any[]>([])
  const navigateRef = useRef(onNavigate)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  navigateRef.current = onNavigate

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current || !maps) return
      try {
        containerRef.current.replaceChildren()
        const map = new maps.Map(containerRef.current, { center: MANAGUA_CENTER, zoom: 12, disableDefaultUI: true, zoomControl: true, fullscreenControl: false, streetViewControl: false, mapTypeControl: false, gestureHandling: 'greedy', styles: INCOEX_MAP_STYLE, restriction: nicaraguaRestriction() })
        mapRef.current = map
        containerRef.current.addEventListener('click', (event) => {
          const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-go]')
          const section = target?.dataset.go
          if (section === 'drivers' || section === 'trips' || section === 'incidents') navigateRef.current(section)
        })
        setMapState('ready')
      } catch { if (!cancelled) setMapState('error') }
    }).catch(() => { if (!cancelled) setMapState('error') })
    return () => { cancelled = true; objectsRef.current.forEach((object) => object.setMap?.(null)); objectsRef.current = []; mapRef.current = null }
  }, [])

  useEffect(() => {
    const maps = window.google?.maps
    const map = mapRef.current
    if (!maps || !map || mapState !== 'ready') return
    let cancelled = false
    objectsRef.current.forEach((object) => object.setMap?.(null))
    objectsRef.current = []
    const bounds = new maps.LatLngBounds()
    let hasBounds = false
    const add = (object: any) => { object.setMap(map); objectsRef.current.push(object); return object }
    const info = (position: any, content: string) => { const windowInfo = new maps.InfoWindow({ content }); windowInfo.setPosition(position); windowInfo.open({ map }); objectsRef.current.push(windowInfo) }
    const positions = (tracking.live ?? []).filter((item) => showDemo || !item.demo)
    const liveByDriver = new Map(positions.map((position) => [position.driver.trim().toLowerCase(), position]))
    const driverMarkers = tracking.drivers.map((driver) => {
      const live = liveByDriver.get(driver.name.trim().toLowerCase())
      return {
        driver: driver.name,
        latitude: live && Number.isFinite(live.latitude) ? live.latitude : driver.latitude,
        longitude: live && Number.isFinite(live.longitude) ? live.longitude : driver.longitude,
        status: live?.status ?? driver.status,
        vehicle: live?.vehicle || driver.vehicle,
        plate: live?.plate || driver.plate,
        online: live?.online ?? driver.status !== 'Fuera de servicio',
        speedKmh: live?.speedKmh ?? 0,
        ageSeconds: live?.ageSeconds ?? 0,
        demo: live?.demo ?? false,
        hasLivePosition: live !== undefined,
      }
    }).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    const representedDrivers = new Set(driverMarkers.map((item) => item.driver.trim().toLowerCase()))
    const extraMarkers = positions.filter((position) => !representedDrivers.has(position.driver.trim().toLowerCase())).map((position) => ({ ...position, hasLivePosition: true }))
    for (const position of [...driverMarkers, ...extraMarkers]) {
      const point = { lat: position.latitude, lng: position.longitude }
      const color = googleStatusColor(position.status)
      const marker = add(new maps.Marker({ position: point, title: `${position.driver} · ${position.status}`, icon: vehicleMarkerIcon(maps, position.vehicle, color, position.online) }))
      const positionLabel = position.hasLivePosition
        ? position.online ? (position.demo ? 'en línea · referencia' : 'GPS en vivo') : `desconectado · ${position.ageSeconds >= 300 ? 'sin señal' : `hace ${position.ageSeconds} s`}`
        : 'última posición registrada · sin GPS en vivo'
      marker.addListener('click', () => info(point, `<div class="live-popup"><strong class="live-popup-driver">${escapeHtml(position.driver)}</strong><span class="live-popup-plate">${escapeHtml(position.plate || position.vehicle)}</span><span class="live-popup-row"><i style="background:${color}"></i>${escapeHtml(position.status)} · ${positionLabel}</span><span class="live-popup-row">velocidad ${Math.round(position.speedKmh)} km/h</span><button type="button" class="live-popup-action" data-go="drivers">Ver conductores</button></div>`))
      bounds.extend(point)
      hasBounds = true
    }
    const activeTrips = tracking.trips.filter((item) => ['Asignado', 'En camino', 'En entrega'].includes(item.status) && Number.isFinite(item.originLat) && Number.isFinite(item.originLng) && Number.isFinite(item.destinationLat) && Number.isFinite(item.destinationLng)).slice(0, 8)
    const drawRoutes = async () => {
      const routes = await Promise.all(activeTrips.map(async (trip) => {
        const origin = { lat: trip.originLat as number, lng: trip.originLng as number }
        const destination = { lat: trip.destinationLat as number, lng: trip.destinationLng as number }
        let routeOrigin = origin
        try {
          const live = await getTrackingLive(trip.id)
          if (live.routeProvider === 'google' && live.route.length >= 2) {
            return { trip, origin, destination, path: live.route.map((point) => ({ lat: point.latitude, lng: point.longitude })) }
          }
          if (live.driverLocation) routeOrigin = { lat: live.driverLocation.latitude, lng: live.driverLocation.longitude }
        } catch {
          // El cálculo directo de Google Maps queda como respaldo para el panel.
        }
        const calculated = await getDrivingRoute(maps, routeOrigin, destination)
        return { trip, origin, destination, path: calculated?.path ?? [] }
      }))
      if (cancelled) return
      for (const { trip, origin, destination, path } of routes) {
        if (path.length >= 2) {
          const route = add(new maps.Polyline({ path, strokeColor: '#075cf5', strokeOpacity: .94, strokeWeight: 5, icons: trip.status === 'Asignado' ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] : undefined }))
          route.addListener('click', () => info({ lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 }, `<div class="live-popup"><strong class="live-popup-driver">${escapeHtml(trip.id)}</strong><span>${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}</span><span class="live-popup-row">${escapeHtml(trip.client)} · ${escapeHtml(trip.status)}</span><button type="button" class="live-popup-action" data-go="trips">Ver viajes</button></div>`))
        }
        add(new maps.Marker({ position: origin, title: `Recogida · ${trip.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#21c88a', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }))
        add(new maps.Marker({ position: destination, title: `Entrega · ${trip.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#8067dc', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }))
        bounds.extend(origin); bounds.extend(destination); hasBounds = true
      }
      if (hasBounds) map.fitBounds(bounds, { top: 38, right: 38, bottom: 38, left: 38 })
      else map.setCenter(MANAGUA_CENTER)
    }
    for (const incident of tracking.incidents) {
      if (!Number.isFinite(incident.latitude) || !Number.isFinite(incident.longitude)) continue
      const point = { lat: incident.latitude as number, lng: incident.longitude as number }
      const marker = add(new maps.Marker({ position: point, title: `Incidencia ${incident.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#e45d67', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }))
      const evidenceSrc = incident.evidence ? (incident.evidence.startsWith('http') || incident.evidence.startsWith('data:') ? incident.evidence : `${getApiBase()}/uploads/evidence/${incident.evidence}`) : ''
      marker.addListener('click', () => info(point, `<div class="live-popup"><strong class="live-popup-driver">Incidencia ${escapeHtml(incident.priority)} · ${escapeHtml(incident.id)}</strong><span>${escapeHtml(incident.type)}</span><span class="live-popup-row"><i style="background:#e45d67"></i>${escapeHtml(incident.driver)} · ${escapeHtml(incident.status)}</span>${evidenceSrc ? `<img class="live-popup-evidence" src="${escapeHtml(evidenceSrc)}" alt="evidencia" loading="lazy" />` : ''}<button type="button" class="live-popup-action" data-go="incidents">Ver incidencias</button></div>`))
      bounds.extend(point); hasBounds = true
    }
    if (demandZone && Number.isFinite(demandZone.lat) && Number.isFinite(demandZone.lng)) {
      const demand = { lat: demandZone.lat, lng: demandZone.lng }
      const circle = add(new maps.Circle({ center: demand, radius: 850, strokeColor: '#e9a52b', strokeOpacity: .75, strokeWeight: 2, fillColor: '#f2bd55', fillOpacity: .12 }))
      circle.addListener('click', () => info(demand, `<div class="live-popup"><strong class="live-popup-driver">Mayor demanda</strong><span>${escapeHtml(demandZone.label)} · ${demandZone.count} solicitudes activas</span><span class="live-popup-row">Zona calculada desde los pedidos activos</span></div>`))
      add(new maps.Marker({ position: demand, title: `Mayor demanda · ${demandZone.label}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#e9a52b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }, zIndex: 25 }))
      bounds.extend(demand); hasBounds = true
    }
    void drawRoutes()
    return () => { cancelled = true }
  }, [tracking, showDemo, demandZone, mapState])

  return <div className="live-map-container"> <div ref={containerRef} className="google-map-canvas" />{mapState === 'loading' && <div className="map-status"><span className="map-status-card"><span className="map-spinner" />Cargando Google Maps…</span></div>}{mapState === 'error' && <div className="map-status error"><span className="map-status-card"><strong>No se pudo cargar Google Maps</strong><small>Verifica la API key y la conexión.</small></span></div>}</div>
}
