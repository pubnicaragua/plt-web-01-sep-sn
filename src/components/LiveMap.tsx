import { useEffect, useRef, useState } from 'react'
import { getApiBase } from '../lib/api'
import type { Section, TrackingOverview } from '../types'
import { googleStatusColor, INCOEX_MAP_STYLE, loadGoogleMaps, MANAGUA_CENTER, nicaraguaRestriction } from '../lib/googleMaps'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character))
}

export function LiveMap({ tracking, onNavigate, showDemo = false }: { tracking: TrackingOverview; onNavigate: (section: Section) => void; showDemo?: boolean }) {
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
    objectsRef.current.forEach((object) => object.setMap?.(null))
    objectsRef.current = []
    const bounds = new maps.LatLngBounds()
    let hasBounds = false
    const add = (object: any) => { object.setMap(map); objectsRef.current.push(object); return object }
    const info = (position: any, content: string) => { const windowInfo = new maps.InfoWindow({ content }); windowInfo.setPosition(position); windowInfo.open({ map }); objectsRef.current.push(windowInfo) }
    const positions = (tracking.live ?? []).filter((item) => showDemo || !item.demo)
    for (const position of positions) {
      const point = { lat: position.latitude, lng: position.longitude }
      const color = googleStatusColor(position.status)
      const marker = add(new maps.Marker({ position: point, title: `${position.driver} · ${position.status}`, icon: { path: maps.SymbolPath.CIRCLE, scale: position.online ? 8 : 7, fillColor: position.online ? color : '#9aa4b5', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }))
      const onlineLabel = position.online ? (position.demo ? 'en línea · referencia' : 'en línea') : `desconectado · ${position.ageSeconds >= 300 ? 'sin señal' : `hace ${position.ageSeconds} s`}`
      marker.addListener('click', () => info(point, `<div class="live-popup"><strong class="live-popup-driver">${escapeHtml(position.driver)}</strong><span class="live-popup-plate">${escapeHtml(position.plate || position.vehicle)}</span><span class="live-popup-row"><i style="background:${color}"></i>${escapeHtml(position.status)} · ${onlineLabel}</span><span class="live-popup-row">velocidad ${Math.round(position.speedKmh)} km/h</span><button type="button" class="live-popup-action" data-go="drivers">Ver conductores</button></div>`))
      bounds.extend(point)
      hasBounds = true
    }
    for (const trip of tracking.trips.filter((item) => ['Asignado', 'En camino', 'En entrega'].includes(item.status) && Number.isFinite(item.originLat) && Number.isFinite(item.originLng) && Number.isFinite(item.destinationLat) && Number.isFinite(item.destinationLng)).slice(0, 8)) {
      const origin = { lat: trip.originLat as number, lng: trip.originLng as number }
      const destination = { lat: trip.destinationLat as number, lng: trip.destinationLng as number }
      const route = add(new maps.Polyline({ path: [origin, destination], strokeColor: '#13a8da', strokeOpacity: .86, strokeWeight: 4, icons: trip.status === 'Asignado' ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] : undefined }))
      route.addListener('click', () => info({ lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 }, `<div class="live-popup"><strong class="live-popup-driver">${escapeHtml(trip.id)}</strong><span>${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}</span><span class="live-popup-row">${escapeHtml(trip.client)} · ${escapeHtml(trip.status)}</span><button type="button" class="live-popup-action" data-go="trips">Ver viajes</button></div>`))
      add(new maps.Marker({ position: origin, title: `Recogida · ${trip.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#22b77a', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }))
      add(new maps.Marker({ position: destination, title: `Entrega · ${trip.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#8067dc', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }))
      bounds.extend(origin); bounds.extend(destination); hasBounds = true
    }
    for (const incident of tracking.incidents) {
      if (!Number.isFinite(incident.latitude) || !Number.isFinite(incident.longitude)) continue
      const point = { lat: incident.latitude as number, lng: incident.longitude as number }
      const marker = add(new maps.Marker({ position: point, title: `Incidencia ${incident.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#e45d67', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } }))
      const evidenceSrc = incident.evidence ? (incident.evidence.startsWith('http') || incident.evidence.startsWith('data:') ? incident.evidence : `${getApiBase()}/uploads/evidence/${incident.evidence}`) : ''
      marker.addListener('click', () => info(point, `<div class="live-popup"><strong class="live-popup-driver">Incidencia ${escapeHtml(incident.priority)} · ${escapeHtml(incident.id)}</strong><span>${escapeHtml(incident.type)}</span><span class="live-popup-row"><i style="background:#e45d67"></i>${escapeHtml(incident.driver)} · ${escapeHtml(incident.status)}</span>${evidenceSrc ? `<img class="live-popup-evidence" src="${escapeHtml(evidenceSrc)}" alt="evidencia" loading="lazy" />` : ''}<button type="button" class="live-popup-action" data-go="incidents">Ver incidencias</button></div>`))
      bounds.extend(point); hasBounds = true
    }
    if (hasBounds) map.fitBounds(bounds, { top: 38, right: 38, bottom: 38, left: 38 })
    else map.setCenter(MANAGUA_CENTER)
  }, [tracking, showDemo, mapState])

  return <div className="live-map-container" ref={containerRef}>{mapState === 'loading' && <div className="map-status"><span className="map-status-card"><span className="map-spinner" />Cargando Google Maps…</span></div>}{mapState === 'error' && <div className="map-status error"><span className="map-status-card"><strong>No se pudo cargar Google Maps</strong><small>Verifica la API key y la conexión.</small></span></div>}</div>
}
