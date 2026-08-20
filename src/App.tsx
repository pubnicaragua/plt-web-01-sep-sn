import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  assignTrip,
  createTrip,
  getApiBase,
  getClients,
  getDashboardSummary,
  getDeliverables,
  getDeliverablesSummary,
  getDrivers,
  getHistory,
  getIncidents,
  getReportsSummary,
  getTrackingOverview,
  getTrips,
  updateDeliverableStatus,
} from './lib/api'
import type { Client, DashboardSummary, Deliverable, DeliverableStatus, DeliverableSummary, Driver, HistoryEvent, Incident, ReportsSummary, Section, TrackingOverview, Trip, TripStatus } from './types'

const emptySummary: DashboardSummary = {
  tripsToday: 0,
  activeTrips: 0,
  pendingTrips: 0,
  completedTrips: 0,
  activeDrivers: 0,
  registeredClients: 0,
  packagesInTransit: 0,
  openIncidents: 0,
}

const navItems: Array<{ id: Section; label: string; icon: string; group?: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'trips', label: 'Viajes', icon: '↗', group: 'Operaciones' },
  { id: 'requests', label: 'Solicitudes', icon: '◌', group: 'Operaciones' },
  { id: 'assignment', label: 'Asignar conductor', icon: '⇄', group: 'Operaciones' },
  { id: 'drivers', label: 'Conductores', icon: '◉' },
  { id: 'clients', label: 'Clientes', icon: '▦' },
  { id: 'packages', label: 'Paquetes', icon: '◇' },
  { id: 'tracking', label: 'Mapa / Tracking', icon: '⌖' },
  { id: 'history', label: 'Historial', icon: '↺' },
  { id: 'incidents', label: 'Incidencias', icon: '△' },
  { id: 'reports', label: 'Reportes', icon: '▥' },
  { id: 'deliverables', label: 'Entregables', icon: '✦' },
  { id: 'settings', label: 'Configuración', icon: '⚙' },
]

type ConnectionState = 'loading' | 'connected' | 'error'

function App() {
  const [section, setSection] = useState<Section>('dashboard')
  const [summary, setSummary] = useState(emptySummary)
  const [trips, setTrips] = useState<Trip[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [history, setHistory] = useState<HistoryEvent[]>([])
  const [reports, setReports] = useState<ReportsSummary | null>(null)
  const [tracking, setTracking] = useState<TrackingOverview | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [deliverableSummary, setDeliverableSummary] = useState<DeliverableSummary>({ total: 0, backlog: 0, in_progress: 0, review: 0, done: 0 })
  const [connection, setConnection] = useState<ConnectionState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [newTripOpen, setNewTripOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      getDashboardSummary(),
      getTrips(),
      getDrivers(),
      getClients(),
      getIncidents(),
      getHistory(),
      getReportsSummary(),
      getTrackingOverview(),
      getDeliverables(),
      getDeliverablesSummary(),
    ])
      .then(([nextSummary, nextTrips, nextDrivers, nextClients, nextIncidents, nextHistory, nextReports, nextTracking, nextDeliverables, nextDeliverableSummary]) => {
        setSummary(nextSummary)
        setTrips(nextTrips)
        setDrivers(nextDrivers)
        setClients(nextClients)
        setIncidents(nextIncidents)
        setHistory(nextHistory)
        setReports(nextReports)
        setTracking(nextTracking)
        setDeliverables(nextDeliverables)
        setDeliverableSummary(nextDeliverableSummary)
        setConnection('connected')
      })
      .catch((error: unknown) => {
        setConnection('error')
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo conectar con la API')
      })
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const currentPage = navItems.find((item) => item.id === section)

  function navigate(next: Section) {
    setSection(next)
    setSearch('')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">X</div>
          <div>
            <div className="brand-name">INCOEX</div>
            <div className="brand-subtitle">Logistics / Command</div>
          </div>
        </div>

        <div className="sidebar-section-label">Centro de operaciones</div>
        <nav className="nav-list" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button className={`nav-item ${section === item.id ? 'active' : ''}`} key={item.id} onClick={() => navigate(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'incidents' && summary.openIncidents > 0 && <span className="nav-badge">{summary.openIncidents}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className={`health-card ${connection === 'error' ? 'health-error' : ''}`}>
            <span className="pulse-dot" />
            <div>
              <strong>{connection === 'connected' ? 'Sistema operativo' : connection === 'loading' ? 'Conectando API' : 'API no disponible'}</strong>
              <small>{connection === 'connected' ? 'Última sincronización · ahora' : getApiBase()}</small>
            </div>
          </div>
          <div className="user-card">
            <div className="avatar">SA</div>
            <div className="user-info">
              <strong>Superadministrador</strong>
              <small>Cuenta de plataforma</small>
            </div>
            <button className="icon-button" aria-label="Cerrar sesión">↪</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>INCOEX</span><b>/</b><strong>{currentPage?.label ?? 'Dashboard'}</strong></div>
          <div className="topbar-actions">
            <div className="search-box">
              <span>⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar viajes, conductores, clientes..." />
              <kbd>⌘ K</kbd>
            </div>
            <div className="live-pill"><span className="pulse-dot" /> {summary.activeTrips} operaciones activas</div>
            <button className="round-button" aria-label="Notificaciones" onClick={() => setNotice('No hay notificaciones nuevas')}>♧<span className="notification-dot">{summary.openIncidents}</span></button>
            <button className="round-button" aria-label="Ayuda">?</button>
            <div className="profile-menu"><div className="avatar small">SA</div><span>Superadministrador</span><span className="chevron">⌄</span></div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className={`eyebrow ${connection === 'error' ? 'eyebrow-error' : ''}`}>{connection === 'connected' ? 'Datos conectados' : connection === 'loading' ? 'Conectando datos' : 'Conexión requerida'}</div>
              <h1>{currentPage?.label ?? 'Dashboard'}</h1>
              <p>{sectionDescription(section)}</p>
            </div>
            <div className="heading-actions">
              <span className="region-label">Managua · Nicaragua <span className="tiny-flag">●</span></span>
              {section === 'trips' && <button className="primary-button" onClick={() => setNewTripOpen(true)}>＋ Nuevo viaje</button>}
              {section === 'drivers' && <button className="primary-button" onClick={() => setNotice('El alta de conductores se conectará al endpoint de administración')}>＋ Agregar conductor</button>}
              {(section === 'reports' || section === 'history') && <button className="secondary-button" onClick={() => setNotice('La exportación usará los datos recibidos de la API')}>↧ Exportar</button>}
            </div>
          </div>

          {connection === 'error' && <div className="connection-banner error"><strong>No hay datos locales de respaldo.</strong> Conecta la API en <code>{getApiBase()}</code> para cargar la operación. <span>{errorMessage}</span></div>}
          {connection === 'loading' && <div className="connection-banner"><strong>Sincronizando operación…</strong> Consultando dashboard, viajes, conductores, clientes, incidencias, reportes y tracking.</div>}

          {section === 'dashboard' && <Dashboard summary={summary} trips={trips} drivers={drivers} history={history} onNavigate={navigate} />}
          {section === 'trips' && <TripsView trips={trips} search={search} onNotice={setNotice} />}
          {section === 'requests' && <RequestsView trips={trips} onNavigate={navigate} />}
          {section === 'assignment' && <AssignmentView trips={trips} drivers={drivers} onAssigned={(trip) => { setTrips((current) => current.map((item) => item.id === trip.id ? trip : item)); void refreshDrivers(setDrivers, setNotice); void refreshSummary(setSummary, setNotice) }} onNotice={setNotice} />}
          {section === 'drivers' && <DriversView drivers={drivers} onNotice={setNotice} />}
          {section === 'clients' && <ClientsView clients={clients} search={search} />}
          {section === 'incidents' && <IncidentsView incidents={incidents} onNotice={setNotice} />}
          {section === 'reports' && <ReportsView reports={reports} />}
          {section === 'packages' && <PackagesView trips={trips} />}
          {section === 'tracking' && <TrackingView tracking={tracking} />}
          {section === 'history' && <HistoryView history={history} />}
          {section === 'deliverables' && <DeliverablesView deliverables={deliverables} summary={deliverableSummary} onStatusChange={async (id, status) => { try { const updated = await updateDeliverableStatus(id, status); setDeliverables((current) => current.map((item) => item.id === id ? updated : item)); setDeliverableSummary(await getDeliverablesSummary()); setNotice('Entregable actualizado en SQLite local') } catch { setNotice('No se pudo guardar el estado del entregable') } }} />}
          {section === 'settings' && <SettingsView apiBase={getApiBase()} connection={connection} />}
        </div>
      </main>
      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
      {newTripOpen && <NewTripDialog onClose={() => setNewTripOpen(false)} onCreated={(trip) => { setTrips((current) => [trip, ...current]); setNewTripOpen(false); setNotice(`Solicitud ${trip.id} creada en la API`); void refreshSummary(setSummary, setNotice) }} onError={setNotice} />}
    </div>
  )
}

async function refreshDrivers(setDrivers: (drivers: Driver[]) => void, setNotice: (notice: string) => void) {
  try {
    setDrivers(await getDrivers())
  } catch {
    setNotice('El viaje se actualizó, pero no se pudo refrescar la flota')
  }
}

async function refreshSummary(setSummary: (summary: DashboardSummary) => void, setNotice: (notice: string) => void) {
  try {
    setSummary(await getDashboardSummary())
  } catch {
    setNotice('La operación se actualizó, pero no se pudo refrescar el resumen')
  }
}

function sectionDescription(section: Section) {
  const descriptions: Record<Section, string> = {
    dashboard: 'Monitoreo en tiempo real de la flota e incidencias de despacho.',
    trips: 'Historial y asignación de despachos metropolitanos.',
    requests: 'Revisión y aprobación de nuevas solicitudes de viaje.',
    assignment: 'Asignación inmediata de transportistas disponibles.',
    drivers: 'Registro de operadores, vehículos y disponibilidad.',
    clients: 'Gestión de cuentas corporativas y particulares con acceso logístico.',
    packages: 'Inventario operativo y seguimiento de paquetes en tránsito.',
    tracking: 'Vista geográfica de operaciones activas y recorridos de entrega.',
    history: 'Bitácora en tiempo real de despachos, asignaciones e incidencias.',
    incidents: 'Seguimiento de contingencias metropolitanas reportadas por la flota.',
    reports: 'Analítica agregada del rendimiento de viajes y entregas.',
    deliverables: 'Alcance, avance tangible y próximos hitos del proyecto.',
    settings: 'Configuración de la plataforma, integraciones y seguridad.',
  }
  return descriptions[section]
}

function Dashboard({ summary, trips, drivers, history, onNavigate }: { summary: DashboardSummary; trips: Trip[]; drivers: Driver[]; history: HistoryEvent[]; onNavigate: (section: Section) => void }) {
  return <>
    <div className="metrics-grid">
      <MetricCard label="Viajes de hoy" value={summary.tripsToday} delta="API" tone="blue" icon="↗" />
      <MetricCard label="Viajes en curso" value={summary.activeTrips} delta="activo" tone="cyan" icon="◒" />
      <MetricCard label="Pendientes" value={summary.pendingTrips} delta="Atención" tone="gold" icon="◷" />
      <MetricCard label="Entregas completadas" value={summary.completedTrips} delta="API" tone="mint" icon="✓" />
      <MetricCard label="Conductores activos" value={summary.activeDrivers} delta="activo" tone="mint" icon="◉" />
      <MetricCard label="Clientes registrados" value={summary.registeredClients} delta="API" tone="blue" icon="▦" />
      <MetricCard label="Paquetes en tránsito" value={summary.packagesInTransit} delta="Normal" tone="slate" icon="◇" />
      <MetricCard label="Incidencias abiertas" value={summary.openIncidents} delta="Atención" tone="red" icon="△" />
    </div>
    <div className="dashboard-grid">
      <section className="panel map-panel">
        <PanelHeader title="Mapa de operaciones" action="Ver mapa completo" onAction={() => onNavigate('tracking')} />
        <div className="operations-map">
          <div className="map-glow glow-one" /><div className="map-glow glow-two" />
          <span className="map-road road-one" /><span className="map-road road-two" /><span className="map-road road-three" />
          {drivers.slice(0, 6).map((driver, index) => <MapPin key={driver.id} x={`${17 + (index * 13) % 68}%`} y={`${29 + (index * 17) % 42}%`} tone={driver.status === 'Fuera de servicio' ? 'red' : driver.status === 'Disponible' ? 'mint' : 'blue'} />)}
          <div className="map-label label-one">Conductores en ruta</div><div className="map-label label-two">Recogidas</div><div className="map-label label-three">Alertas</div>
          <div className="map-legend"><span><i className="legend blue" />En ruta</span><span><i className="legend mint" />Disponibles</span><span><i className="legend gold" />Pendientes</span><span><i className="legend red" />Alertas</span></div>
        </div>
      </section>
      <section className="panel activity-panel">
        <PanelHeader title="Actividad reciente" action="Ver historial" onAction={() => onNavigate('history')} />
        <div className="activity-list">{history.slice(0, 6).map((event) => <Activity key={event.id} time={event.time} color={event.color} title={event.title} detail={event.detail} />)}</div>
      </section>
    </div>
    <section className="quick-actions">
      <div><span className="eyebrow">Acciones rápidas</span><h2>Lo importante, a un clic.</h2></div>
      <button onClick={() => onNavigate('trips')}><span>↗</span><strong>Revisar solicitudes</strong><small>{summary.pendingTrips} pendientes</small></button>
      <button onClick={() => onNavigate('tracking')}><span>⌖</span><strong>Abrir tracking</strong><small>{summary.activeTrips} operaciones</small></button>
      <button onClick={() => onNavigate('incidents')}><span>△</span><strong>Atender incidencias</strong><small>{summary.openIncidents} abiertas</small></button>
    </section>
    <div className="data-source-note">Datos de esta vista: <strong>{trips.length} viajes</strong> y <strong>{drivers.length} conductores</strong> recibidos desde NestJS.</div>
  </>
}

function MetricCard({ label, value, delta, tone, icon }: { label: string; value: number; delta: string; tone: string; icon: string }) {
  return <div className={`metric-card tone-${tone}`}><div className="metric-top"><span className="metric-label">{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value.toLocaleString('es-NI')}</div><div className="metric-delta"><span>↑ {delta}</span><small>dato del servicio</small></div></div>
}

function PanelHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-header"><h2>{title}</h2>{action && <button onClick={onAction}>{action} <span>↗</span></button>}</div>
}

function Activity({ time, color, title, detail }: { time: string; color: string; title: string; detail: string }) {
  return <div className="activity-row"><span className="activity-time">{time}</span><span className={`activity-marker ${color}`} /><div><strong>{title}</strong><small>{detail}</small></div><span className="activity-arrow">›</span></div>
}

function MapPin({ x, y, tone }: { x: string; y: string; tone: string }) {
  return <span className={`map-pin ${tone}`} style={{ left: x, top: y }} />
}

function NewTripDialog({ onClose, onCreated, onError }: { onClose: () => void; onCreated: (trip: Trip) => void; onError: (message: string) => void }) {
  const [client, setClient] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [packages, setPackages] = useState(1)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const trip = await createTrip({ client, origin, destination, packages, description })
      onCreated(trip)
    } catch {
      onError('No se pudo crear el viaje; revisa la conexión con la API')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="modal-card" onSubmit={submit}><div className="modal-header"><div><span className="eyebrow">Nueva solicitud · API</span><h2>Crear viaje</h2><p>Los datos se guardarán en el servicio de operaciones.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div><div className="form-grid"><label>Cliente<input required value={client} onChange={(event) => setClient(event.target.value)} placeholder="Nombre o empresa" /></label><label>Paquetes<input required type="number" min="1" value={packages} onChange={(event) => setPackages(Math.max(1, Number(event.target.value)))} /></label><label>Recogida<input required value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Dirección de recogida" /></label><label>Destino<input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Dirección de entrega" /></label><label className="full-field">Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Características o instrucciones de la carga" rows={3} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={submitting}>{submitting ? 'Guardando…' : 'Crear solicitud'}</button></div></form></div>
}

function TripsView({ trips, search, onNotice }: { trips: Trip[]; search: string; onNotice: (message: string) => void }) {
  const filtered = useMemo(() => trips.filter((trip) => `${trip.id} ${trip.client} ${trip.driver} ${trip.origin} ${trip.destination}`.toLowerCase().includes(search.toLowerCase())), [trips, search])
  return <section className="panel table-panel"><div className="table-toolbar"><div className="filter-row"><button className="filter-chip active">Todas <b>{trips.length}</b></button><button className="filter-chip">Pendientes <b>{trips.filter((trip) => trip.status === 'Pendiente').length}</b></button><button className="filter-chip">En curso <b>{trips.filter((trip) => trip.status === 'En camino' || trip.status === 'En entrega').length}</b></button><button className="filter-chip">Completadas</button></div><button className="secondary-button" onClick={() => onNotice('Los filtros avanzados se enviarán al endpoint de consulta')}>Filtros <span>⌄</span></button></div><DataTable columns={['ID', 'Cliente', 'Conductor', 'Origen', 'Destino', 'Fecha', 'Paquetes', 'Estado', '']} rows={filtered.map((trip) => [<strong className="linkish" key={`${trip.id}-id`}>{trip.id}</strong>, <strong key={`${trip.id}-client`}>{trip.client}</strong>, <span className={trip.driver === 'Sin asignar' ? 'muted' : ''} key={`${trip.id}-driver`}>{trip.driver}</span>, trip.origin, trip.destination, trip.date, trip.packages, <StatusPill key={`${trip.id}-status`} status={trip.status} />, <button className="row-action" key={`${trip.id}-action`} onClick={() => onNotice(`Detalle de ${trip.id}`)}>•••</button>])} /><div className="table-footer"><span>Mostrando {filtered.length} de {trips.length} viajes</span><Pagination /></div></section>
}

function RequestsView({ trips, onNavigate }: { trips: Trip[]; onNavigate: (section: Section) => void }) {
  const pending = trips.filter((trip) => trip.status === 'Pendiente')
  return <div className="request-grid">{pending.map((trip) => <article className="panel request-card" key={trip.id}><div className="request-head"><span className="status-pill pendiente">Pendiente</span><strong>Solicitud {trip.id}</strong></div><h2>{trip.client}</h2><div className="route-detail"><span><b>RECOGIDA</b>{trip.origin}</span><span><b>DESTINO</b>{trip.destination}</span></div><div className="request-meta">{trip.date} · {trip.packages} paquetes</div><button className="primary-button" onClick={() => onNavigate('assignment')}>Asignar conductor</button></article>)}</div>
}

function AssignmentView({ trips, drivers, onAssigned, onNotice }: { trips: Trip[]; drivers: Driver[]; onAssigned: (trip: Trip) => void; onNotice: (message: string) => void }) {
  const [assigning, setAssigning] = useState('')
  const request = trips.find((trip) => trip.status === 'Pendiente')
  const available = drivers.filter((driver) => driver.status === 'Disponible')
  if (!request) return <EmptyState title="No hay solicitudes pendientes" detail="La API no tiene viajes pendientes para asignar." />
  const selectedRequest = request
  async function assign(driver: Driver) {
    setAssigning(driver.id)
    try {
      const trip = await assignTrip(selectedRequest.id, driver.id)
      onAssigned(trip)
      onNotice(`${driver.name} fue asignado a ${selectedRequest.id}`)
    } catch {
      onNotice(`No se pudo asignar ${driver.name}; revisa la API`)
    } finally {
      setAssigning('')
    }
  }
  return <div className="assignment-layout"><section className="panel assignment-detail"><span className="eyebrow">Solicitud pendiente</span><h2>{request.id} · {request.client}</h2><p>Información del viaje recibida desde la API.</p><div className="assignment-route"><span><b>RECOGIDA</b>{request.origin}</span><span><b>DESTINO</b>{request.destination}</span></div><div className="assignment-load"><span>{request.packages} paquetes</span><span>Estado · {request.status}</span></div></section><section className="panel assignment-list"><PanelHeader title="Asignar conductor" action={`${available.length} disponibles`} />{available.length === 0 && <EmptyState title="Sin conductores disponibles" detail="La API no reporta conductores libres en este momento." />}{available.map((driver) => <div className="assignment-driver" key={driver.id}><div className="driver-avatar mint">{initials(driver.name)}</div><div><strong>{driver.name}</strong><small>{driver.vehicle} · {driver.plate}</small></div><button className="primary-mini" disabled={assigning !== ''} onClick={() => void assign(driver)}>{assigning === driver.id ? 'Asignando…' : 'Asignar'}</button></div>)}</section></div>
}

function DriversView({ drivers, onNotice }: { drivers: Driver[]; onNotice: (message: string) => void }) {
  return <><div className="driver-summary"><SummaryValue label="Total conductores" value={String(drivers.length)} /><SummaryValue label="Disponibles" value={String(drivers.filter((driver) => driver.status === 'Disponible').length)} tone="mint" /><SummaryValue label="En viaje" value={String(drivers.filter((driver) => driver.status === 'En viaje' || driver.status === 'En entrega').length)} tone="blue" /><SummaryValue label="Fuera de servicio" value={String(drivers.filter((driver) => driver.status === 'Fuera de servicio').length)} tone="slate" /></div><div className="drivers-grid">{drivers.map((driver, index) => <article className="driver-card" key={driver.id}><div className="driver-card-top"><div className={`driver-avatar ${['blue', 'cyan', 'violet', 'mint', 'gold', 'slate'][index % 6]}`}>{initials(driver.name)}</div><div><h3>{driver.name}</h3><p>{driver.phone}</p></div><StatusPill status={driver.status} /></div><div className="vehicle-line"><span>VEHÍCULO</span><strong>{driver.vehicle} <em>— {driver.plate}</em></strong></div><div className="route-line"><span>RUTA / ACTIVIDAD ACTUAL</span><strong>{driver.route}</strong></div><div className="driver-actions"><button onClick={() => onNotice(`Perfil de ${driver.name}`)}>Ver perfil</button><button className="primary-mini" onClick={() => onNotice(`Asignación preparada para ${driver.name}`)}>Asignar viaje</button></div></article>)}</div></>
}

function ClientsView({ clients, search }: { clients: Client[]; search: string }) {
  const filtered = useMemo(() => clients.filter((client) => `${client.name} ${client.email} ${client.phone}`.toLowerCase().includes(search.toLowerCase())), [clients, search])
  return <section className="panel table-panel"><div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> {clients.length} clientes cargados desde la API</div><button className="primary-button">＋ Nuevo cliente</button></div><DataTable columns={['Nombre / Empresa', 'Teléfono', 'Email', 'Viajes', 'Solicitudes act.', 'Estado', 'Acciones']} rows={filtered.map((client) => [<div className="client-cell" key={`${client.id}-cell`}><span className="client-avatar">{initials(client.name)}</span><div><strong>{client.name}</strong><small>{client.type}</small></div></div>, client.phone, client.email, client.trips, client.activeRequests, <StatusPill key={`${client.id}-status`} status={client.status} />, <button className="row-action" key={`${client.id}-action`}>•••</button>])} /><div className="table-footer"><span>Mostrando {filtered.length} de {clients.length} clientes</span><Pagination /></div></section>
}

function IncidentsView({ incidents, onNotice }: { incidents: Incident[]; onNotice: (message: string) => void }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div className="filter-row"><button className="filter-chip active">Todas <b>{incidents.length}</b></button><button className="filter-chip">Abiertas <b>{incidents.filter((incident) => incident.status === 'Abierta').length}</b></button><button className="filter-chip">En proceso <b>{incidents.filter((incident) => incident.status === 'En proceso').length}</b></button><button className="filter-chip">Resueltas</button></div><button className="secondary-button" onClick={() => onNotice('Vista de incidencias filtrada desde el conjunto recibido')}>Exportar CSV</button></div><DataTable columns={['ID incidencia', 'Viaje', 'Conductor', 'Cliente', 'Tipo', 'Prioridad', 'Estado', 'Acciones']} rows={incidents.map((incident) => [<strong className="linkish" key={`${incident.id}-id`}>{incident.id}</strong>, incident.trip, incident.driver, incident.client, incident.type, <PriorityPill key={`${incident.id}-priority`} priority={incident.priority} />, <StatusPill key={`${incident.id}-status`} status={incident.status} />, <div className="action-group" key={`${incident.id}-actions`}><button onClick={() => onNotice(`Abriendo ${incident.id}`)}>◉</button><button onClick={() => onNotice(`Incidencia ${incident.id} marcada para atención`)}>✓</button></div>])} /><div className="table-footer"><span>Mostrando {incidents.length} incidencias recibidas</span><Pagination /></div></section>
}

function ReportsView({ reports }: { reports: ReportsSummary | null }) {
  if (!reports) return <EmptyState title="Reportes pendientes" detail="La API aún no entregó el resumen analítico." />
  return <><div className="metrics-grid report-metrics"><MetricCard label="Viajes totales" value={reports.totalTrips} delta="API" tone="blue" icon="↗" /><MetricCard label="Entregas completadas" value={reports.completedTrips} delta="API" tone="mint" icon="✓" /><MetricCard label="Viajes cancelados" value={reports.cancelledTrips} delta="API" tone="red" icon="△" /><MetricCard label="Tiempo prom. entrega" value={reports.averageDeliveryMinutes} delta="min" tone="gold" icon="◷" /></div><div className="reports-grid"><ChartPanel title="Viajes por semana" values={reports.weeklyTrips} labels={reports.weeklyLabels} /><ChartPanel title="Entregas por día · tendencia" values={reports.dailyDeliveries} labels={reports.dailyLabels} compact /><Leaderboard title="Top conductores" entries={reports.topDrivers} /><Leaderboard title="Top clientes" entries={reports.topClients} /></div></>
}

function ChartPanel({ title, values, labels, compact = false }: { title: string; values: number[]; labels: string[]; compact?: boolean }) {
  const max = Math.max(...values, 1)
  return <section className={`panel chart-panel ${compact ? 'compact' : ''}`}><PanelHeader title={title} action="API" /><div className="chart-bars">{values.map((value, index) => <div className="chart-bar-wrap" key={`${labels[index]}-${value}`}><span className="chart-value">{value}</span><div className="chart-bar" style={{ height: `${(value / max) * 100}%` }} /><small>{labels[index]}</small></div>)}</div></section>
}

function Leaderboard({ title, entries }: { title: string; entries: Array<{ name: string; trips: number }> }) {
  return <section className="panel leaderboard"><PanelHeader title={title} action="API" /><ol>{entries.map((entry, index) => <li key={entry.name}><span className="rank">{index + 1}</span><span className="mini-avatar">{initials(entry.name)}</span><strong>{entry.name}</strong><span className="bar"><i style={{ width: `${Math.max(20, 100 - index * 14)}%` }} /></span><b>{entry.trips} viajes</b></li>)}</ol></section>
}

function PackagesView({ trips }: { trips: Trip[] }) { return <section className="panel placeholder-panel"><div className="placeholder-icon">◇</div><div><span className="eyebrow">Módulo conectado al dominio</span><h2>Administración de paquetes</h2><p>Paquetes derivados de los viajes recibidos desde la API.</p></div><div className="placeholder-list">{trips.slice(0, 8).map((trip) => <div key={trip.id}><span className="pulse-dot" />{trip.id} · {trip.packages} paquetes · {trip.status}<span>›</span></div>)}</div></section> }

function TrackingView({ tracking }: { tracking: TrackingOverview | null }) {
  if (!tracking) return <EmptyState title="Tracking pendiente" detail="La API aún no entregó posiciones operativas." />
  return <section className="panel full-map-panel"><div className="tracking-head"><div><span className="eyebrow">LIVE OPERATIONS · API</span><h2>Mapa de flota · Managua</h2></div><div className="tracking-stat"><span className="pulse-dot" /> {tracking.activeOperations} operaciones activas</div></div><div className="large-map"><div className="map-grid-lines" />{tracking.drivers.slice(0, 8).map((driver, index) => <MapPin key={driver.id} x={`${12 + (index * 11) % 76}%`} y={`${23 + (index * 17) % 57}%`} tone={driver.status === 'Fuera de servicio' ? 'red' : driver.status === 'Disponible' ? 'mint' : index % 3 === 0 ? 'violet' : 'blue'} />)}<div className="route route-blue" /><div className="route route-mint" /><div className="route route-violet" /><div className="tracking-card"><strong>{tracking.trips[0]?.id ?? 'Sin viaje activo'}</strong><span>{tracking.trips[0]?.driver ?? 'Sin asignar'} · {tracking.trips[0]?.status ?? 'Pendiente'}</span><span>{tracking.trips[0]?.origin ?? '—'} → {tracking.trips[0]?.destination ?? '—'}</span></div><div className="tracking-card second"><strong>{tracking.trips[1]?.id ?? 'Sin segundo viaje'}</strong><span>{tracking.trips[1]?.driver ?? 'Sin asignar'} · {tracking.trips[1]?.status ?? 'Pendiente'}</span><span>{tracking.trips[1]?.origin ?? '—'} → {tracking.trips[1]?.destination ?? '—'}</span></div><div className="map-legend large"><span><i className="legend blue" />En ruta</span><span><i className="legend mint" />Disponible</span><span><i className="legend violet" />Entrega</span><span><i className="legend red" />Incidencia</span></div></div></section>
}

function HistoryView({ history }: { history: HistoryEvent[] }) { return <section className="panel history-panel"><PanelHeader title="Historial de operaciones" action="API" /><div className="timeline">{history.map((event) => <div className="timeline-row" key={event.id}><span className="timeline-time">{event.time}<small>{event.date}</small></span><span className={`timeline-dot ${event.color}`} /><div className="timeline-event"><strong>{event.title}</strong><span>{event.detail}</span></div></div>)}</div></section> }

function DeliverablesView({ deliverables, summary, onStatusChange }: { deliverables: Deliverable[]; summary: DeliverableSummary; onStatusChange: (id: string, status: DeliverableStatus) => Promise<void> }) {
  const columns: Array<{ status: DeliverableStatus; label: string; detail: string }> = [
    { status: 'done', label: 'Verificado', detail: 'Evidencia tangible en el repositorio' },
    { status: 'in_progress', label: 'En implementación', detail: 'Trabajo iniciado en esta base local' },
    { status: 'review', label: 'Revisión / QA', detail: 'Requiere validación o cierre técnico' },
    { status: 'backlog', label: 'Pendiente', detail: 'Requisito contractual aún no implementado' },
  ]
  const areas = Array.from(new Set(deliverables.map((item) => item.area)))
  return <>
    <div className="deliverable-summary-grid">
      <DeliverableMetric label="Alcance rastreado" value={summary.total} detail="tarjetas persistidas" tone="blue" />
      <DeliverableMetric label="Verificado" value={summary.done} detail="evidencia reproducible" tone="mint" />
      <DeliverableMetric label="En curso" value={summary.in_progress} detail="implementación local" tone="gold" />
      <DeliverableMetric label="Brecha pendiente" value={summary.review + summary.backlog} detail="QA, producto o producción" tone="red" />
    </div>
    <section className="panel scope-panel">
      <div className="panel-header"><div><span className="eyebrow">ALCANCE VISIBLE · SQLITE LOCAL</span><h2>Estado real frente al alcance contratado</h2></div><span className="source-badge">Actualizado desde la API</span></div>
      <p className="scope-intro">Cada tarjeta representa una capacidad o entregable verificable. El panel distingue lo que ya tiene evidencia en código de lo que continúa siendo una referencia de Figma, una maqueta visual o una puerta de producción.</p>
      <div className="scope-area-grid">{areas.map((area) => { const areaItems = deliverables.filter((item) => item.area === area); return <div className="scope-area" key={area}><span className="scope-area-count">{areaItems.length}</span><div><strong>{area}</strong><small>{areaItems.filter((item) => item.status === 'done').length} verificados · {areaItems.filter((item) => item.status !== 'done').length} por cerrar</small></div></div> })}</div>
    </section>
    <section className="kanban-shell">
      <div className="kanban-heading"><div><span className="eyebrow">CONTROL DE AVANCE</span><h2>Kanban de entregables</h2></div><span className="kanban-note">Los cambios se guardan en SQLite local</span></div>
      <div className="kanban-grid">{columns.map((column) => { const items = deliverables.filter((item) => item.status === column.status); return <section className={`kanban-column column-${column.status}`} key={column.status}><div className="kanban-column-head"><div><h3>{column.label}</h3><small>{column.detail}</small></div><b>{items.length}</b></div><div className="kanban-cards">{items.map((item) => <article className="deliverable-card" key={item.id}><div className="deliverable-card-meta"><span className={`priority-dot ${item.priority.toLowerCase()}`} />{item.area}<span className="source-badge">{item.source}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="evidence-line"><small>EVIDENCIA / SIGUIENTE PASO</small><span>{item.evidence}</span></div><label className="status-select">Mover estado<select value={item.status} onChange={(event) => void onStatusChange(item.id, event.target.value as DeliverableStatus)}>{columns.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}</select></label></article>)}</div></section> })}</div>
    </section>
  </>
}

function DeliverableMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) { return <div className={`deliverable-metric ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div> }

function SettingsView({ apiBase, connection }: { apiBase: string; connection: ConnectionState }) { return <div className="settings-grid"><section className="panel settings-card"><span className="setting-icon">⌁</span><h2>Conexión API</h2><p>El panel consulta todos sus módulos desde el backend NestJS.</p><code>{apiBase}</code><div className={`setting-status ${connection === 'error' ? 'error-status' : ''}`}><span className="pulse-dot" /> {connection === 'connected' ? 'API conectada' : connection === 'loading' ? 'Conectando…' : 'API no disponible'}</div></section><section className="panel settings-card"><span className="setting-icon">⌖</span><h2>Mapas y tracking</h2><p>El contrato contempla tracking por eventos y posiciones GPS del conductor.</p><div className="setting-status muted-status">Proveedor de mapas pendiente</div></section><section className="panel settings-card"><span className="setting-icon">⛨</span><h2>Roles y seguridad</h2><p>Empresa, conductor y superadministrador se aislarán mediante JWT y permisos.</p><div className="setting-status muted-status">JWT/RBAC pendiente de producción</div></section></div> }

function EmptyState({ title, detail }: { title: string; detail: string }) { return <section className="panel state-card"><div className="placeholder-icon">⌁</div><h2>{title}</h2><p>{detail}</p></section> }
function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) { return <div className="table-scroll"><table><thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div> }
function Pagination() { return <div className="pagination"><button>‹</button><button className="active">1</button><button>2</button><button>3</button><button>›</button></div> }
function SummaryValue({ label, value, tone = 'blue' }: { label: string; value: string; tone?: string }) { return <div className="summary-value"><span className={`summary-icon ${tone}`} /> <div><strong>{value}</strong><small>{label}</small></div></div> }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${statusClass(status)}`}>{status}</span> }
function PriorityPill({ priority }: { priority: string }) { return <span className={`priority-pill ${statusClass(priority)}`}>{priority}</span> }
function statusClass(status: string) { return status.toLowerCase().replaceAll(' ', '-').replaceAll('í', 'i').replaceAll('é', 'e') }
function initials(value: string) { return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() }

export default App
