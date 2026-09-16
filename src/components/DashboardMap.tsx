import { useEffect, useRef, useState } from 'react'
import type { Driver, Trip } from '../types'
import { googleStatusColor, INCOEX_MAP_STYLE, loadGoogleMaps, MANAGUA_CENTER, resetGoogleMapsLoader } from '../lib/googleMaps'

type DemandZone = { lat: number; lng: number; label: string; count: number }
type MapMode = 'all' | 'routes' | 'demand'

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character))
}

function popupHtml(title: string, rows: string[]) {
  return `<div class="dashboard-map-popup"><strong>${escapeHtml(title)}</strong>${rows.map((row) => `<span>${row}</span>`).join('')}</div>`
}

function driverIcon(maps: any, color: string, selected: boolean) {
  return { path: maps.SymbolPath.CIRCLE, scale: selected ? 9 : 7, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: selected ? 4 : 3 }
}

export function DashboardMap({ drivers, trips, highlightDriver = '', demandZone, mode = 'all' }: { drivers: Driver[]; trips: Trip[]; highlightDriver?: string; demandZone?: DemandZone; mode?: MapMode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const objectsRef = useRef<any[]>([])
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setMapState('loading')
    loadGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current || !maps) return
      try {
        const map = new maps.Map(containerRef.current, {
          center: MANAGUA_CENTER,
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: 'greedy',
          styles: INCOEX_MAP_STYLE,
          restriction: { north: 15.5, south: 10.6, east: -82.5, west: -88, strictBounds: false },
        })
        mapRef.current = map
        setMapState('ready')
        window.requestAnimationFrame(() => maps.event.trigger(map, 'resize'))
      } catch {
        if (!cancelled) setMapState('error')
      }
    }).catch(() => { if (!cancelled) setMapState('error') })
    return () => {
      cancelled = true
      objectsRef.current.forEach((object) => object.setMap?.(null))
      objectsRef.current = []
      mapRef.current = null
    }
  }, [attempt])

  useEffect(() => {
    const maps = window.google?.maps
    const map = mapRef.current
    if (!maps || !map || mapState !== 'ready') return
    objectsRef.current.forEach((object) => object.setMap?.(null))
    objectsRef.current = []
    const bounds = new maps.LatLngBounds()
    let hasBounds = false
    const add = (object: any) => { object.setMap(map); objectsRef.current.push(object); return object }
    const openInfo = (position: any, content: string) => {
      const info = new maps.InfoWindow({ content })
      info.setPosition(position)
      info.open({ map })
      objectsRef.current.push(info)
    }

    for (const driver of drivers.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))) {
      const position = { lat: driver.latitude, lng: driver.longitude }
      const color = googleStatusColor(driver.status)
      const marker = add(new maps.Marker({ position, title: `${driver.name} · ${driver.status}`, icon: driverIcon(maps, color, driver.name === highlightDriver), zIndex: driver.name === highlightDriver ? 20 : 10 }))
      marker.addListener('click', () => openInfo(position, popupHtml(driver.name, [`${escapeHtml(driver.vehicle)} · ${escapeHtml(driver.plate)}`, `<i class="dashboard-popup-dot" style="background:${color}"></i>${escapeHtml(driver.status)}`, 'Posición recibida desde la API'])))
      bounds.extend(position)
      hasBounds = true
    }

    if (mode !== 'demand') {
      for (const trip of trips.filter((item) => Number.isFinite(item.originLat) && Number.isFinite(item.originLng) && Number.isFinite(item.destinationLat) && Number.isFinite(item.destinationLng))) {
        const origin = { lat: trip.originLat as number, lng: trip.originLng as number }
        const destination = { lat: trip.destinationLat as number, lng: trip.destinationLng as number }
        const color = trip.status === 'En entrega' ? '#8067dc' : '#075cf5'
        const route = add(new maps.Polyline({ path: [origin, destination], strokeColor: color, strokeOpacity: .86, strokeWeight: 4, icons: trip.status === 'Asignado' ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] : undefined }))
        route.addListener('click', () => openInfo({ lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 }, popupHtml(`Ruta ${trip.id}`, [`${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}`, `${escapeHtml(trip.client)} · ${escapeHtml(trip.status)}`])))
        add(new maps.Marker({ position: origin, title: `Recogida · ${trip.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#13a8da', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } })).addListener('click', () => openInfo(origin, popupHtml(`Recogida · ${trip.id}`, [escapeHtml(trip.origin), `${escapeHtml(trip.client)} · ${escapeHtml(trip.status)}`])))
        add(new maps.Marker({ position: destination, title: `Entrega · ${trip.id}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#8067dc', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } })).addListener('click', () => openInfo(destination, popupHtml(`Entrega · ${trip.id}`, [escapeHtml(trip.destination), `${escapeHtml(trip.client)} · ${escapeHtml(trip.driver)}`])))
        bounds.extend(origin)
        bounds.extend(destination)
        hasBounds = true
      }
    }

    if (demandZone && Number.isFinite(demandZone.lat) && Number.isFinite(demandZone.lng)) {
      const demand = { lat: demandZone.lat, lng: demandZone.lng }
      const circle = add(new maps.Circle({ center: demand, radius: 850, strokeColor: '#e9a52b', strokeOpacity: .75, strokeWeight: 2, fillColor: '#f2bd55', fillOpacity: .12 }))
      circle.addListener('click', () => openInfo(demand, popupHtml('Mayor demanda', [`${escapeHtml(demandZone.label)} · ${demandZone.count} solicitudes activas`, 'Zona calculada desde los pedidos activos'])))
      add(new maps.Marker({ position: demand, title: `Mayor demanda · ${demandZone.label}`, icon: { path: maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#e9a52b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 }, zIndex: 25 }))
      bounds.extend(demand)
      hasBounds = true
      if (mode === 'demand') map.setCenter(demand)
    }

    if (mode === 'demand' && demandZone) map.setZoom(14)
    else if (hasBounds) map.fitBounds(bounds, { top: 88, right: 38, bottom: 76, left: 38 })
    else map.setCenter(MANAGUA_CENTER)
  }, [drivers, trips, highlightDriver, demandZone, mode, mapState])

  return <div className="dashboard-google-map" ref={containerRef} aria-label="Mapa operativo de Google Maps con posiciones, rutas y demanda de la API">
    {mapState === 'loading' && <div className="map-status"><span className="map-status-card"><span className="map-spinner" />Cargando Google Maps…</span></div>}
    {mapState === 'error' && <div className="map-status error"><span className="map-status-card"><strong>No se pudo cargar Google Maps</strong><small>Verifica la API key de Google Maps y la conexión.</small><button type="button" onClick={() => { resetGoogleMapsLoader(); setAttempt((current) => current + 1) }}>Reintentar</button></span></div>}
  </div>
}
