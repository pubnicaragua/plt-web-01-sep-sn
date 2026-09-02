import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Section, TrackingOverview } from '../types'

function buildIcon(className: string, html: string): L.DivIcon {
  return L.divIcon({ className: `live-marker ${className}`, html, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16] })
}

const DRIVER_ICON = buildIcon('', '<div class="driver-dot"></div>')
const OFFLINE_ICON = buildIcon('offline', '<div class="driver-dot"></div>')
const ORIGIN_ICON = buildIcon('origin', '<div class="dot-peg">A</div>')
const DEST_ICON = buildIcon('dest', '<div class="dot-peg">B</div>')
const INCIDENT_ICON = buildIcon('incident', '<div class="dot-peg">!</div>')

export function LiveMap({ tracking, onNavigate }: { tracking: TrackingOverview; onNavigate: (section: Section) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<{ drivers: L.LayerGroup; routes: L.LayerGroup; incidents: L.LayerGroup } | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(map)
    map.setView([12.114993, -86.236174], 12)
    layerRef.current = {
      drivers: L.layerGroup().addTo(map),
      routes: L.layerGroup().addTo(map),
      incidents: L.layerGroup().addTo(map),
    }
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layers = layerRef.current
    if (!map || !layers) return
    layers.drivers.clearLayers()
    layers.routes.clearLayers()
    layers.incidents.clearLayers()

    const bounds: L.LatLng[] = []
    const statusColor: Record<string, string> = { Disponible: '#22c97e', 'En viaje': '#3e8bff', 'En entrega': '#8a6be8', 'Fuera de servicio': '#9aa4b5' }

    for (const position of tracking.live ?? []) {
      const latLng: [number, number] = [position.latitude, position.longitude]
      bounds.push(L.latLng(latLng))
      const color = statusColor[position.status] ?? '#22c97e'
      const marker = L.marker(latLng, { icon: position.online ? DRIVER_ICON : OFFLINE_ICON })
      const onlineLabel = position.online ? (position.demo ? 'en línea (demo)' : 'en línea') : `desconectado · ${position.ageSeconds >= 300 ? 'sin señal' : `hace ${position.ageSeconds} s`}`
      marker.bindPopup(`<div class="live-popup"><span class="live-popup-driver">${position.driver}</span><span class="live-popup-plate">${position.plate || position.vehicle}</span><span class="live-popup-row"><i style="background:${color}"></i>${position.status} · ${onlineLabel}</span><span class="live-popup-row">velocidad ${Math.round(position.speedKmh)} km/h${position.demo ? ' · posición de referencia' : ''}</span><button class="live-popup-action" data-go="drivers">Ver conductores</button></div>`, { className: 'live-popup-wrap' })
      marker.on('popupopen', () => {
        marker.getElement()?.querySelector('.live-popup-action')?.addEventListener('click', () => onNavigate('drivers'))
      })
      marker.addTo(layers.drivers)
    }

    const withRoute = tracking.trips.filter((trip) => Number.isFinite(trip.originLat) && Number.isFinite(trip.destinationLat))
    for (const trip of withRoute) {
      const origin: [number, number] = [trip.originLat as number, trip.originLng as number]
      const destination: [number, number] = [trip.destinationLat as number, trip.destinationLng as number]
      bounds.push(L.latLng(origin), L.latLng(destination))
      const dashed = trip.status === 'Pendiente' || trip.status === 'Asignado'
      L.polyline([origin, destination], { color: '#17d3e0', weight: 3, opacity: 0.85, dashArray: dashed ? '6 6' : undefined }).addTo(layers.routes)
      L.marker(origin, { icon: ORIGIN_ICON }).bindPopup(`<div class="live-popup"><span class="live-popup-driver">Recogida · ${trip.id}</span><span>${trip.origin}</span><span class="live-popup-row">${trip.client}</span></div>`).addTo(layers.routes)
      L.marker(destination, { icon: DEST_ICON }).bindPopup(`<div class="live-popup"><span class="live-popup-driver">Entrega · ${trip.id}</span><span>${trip.destination}</span><span class="live-popup-row">${trip.client} · ${trip.driver} · ${trip.status}</span><button class="live-popup-action" data-go="trips">Ver viajes</button></div>`, { className: 'live-popup-wrap' }).on('popupopen', (event) => {
        event.target.getElement()?.querySelector('.live-popup-action')?.addEventListener('click', () => onNavigate('trips'))
      }).addTo(layers.routes)
    }

    for (const incident of tracking.incidents) {
      if (!Number.isFinite(incident.latitude) || !Number.isFinite(incident.longitude)) continue
      const position: [number, number] = [incident.latitude as number, incident.longitude as number]
      bounds.push(L.latLng(position))
      L.marker(position, { icon: INCIDENT_ICON }).bindPopup(`<div class="live-popup"><span class="live-popup-driver">Incidencia ${incident.priority}</span><span>${incident.type}</span><span class="live-popup-row">${incident.driver} · ${incident.status}</span></div>`).addTo(layers.incidents)
    }

    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 })
    }
  }, [tracking, onNavigate])

  return <div className="live-map-container" ref={containerRef} />
}