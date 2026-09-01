import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import {
  assignTrip,
  assignVehicleDriver,
  createTrip,
  createUser,
  createVehicle,
  getApiBase,
  getClients,
  getDashboardSummary,
  getDeliverables,
  getDeliverablesSummary,
  getDrivers,
  getHistory,
  getIncidents,
  getMaintenance,
  getReportCsvUrl,
  getReportsSummary,
  getRoles,
  getTrackingOverview,
  getTrips,
  getUsers,
  getVehicles,
  registerVehicleMaintenance,
  updateDeliverableStatus,
  updateTripStatus,
  updateUser,
  updateVehicleStatus,
} from './lib/api'
import { googleStatusColor, loadGoogleMaps, resetGoogleMapsLoader, MANAGUA_CENTER } from './lib/googleMaps'
import { Icon, type IconName } from './lib/icons'
import type { AppUser, Client, DashboardSummary, Deliverable, DeliverableStatus, DeliverableSummary, Driver, HistoryEvent, Incident, MaintenanceRecord, ReportsSummary, Role, Section, TrackingOverview, Trip, TripStatus, UserRole, Vehicle, VehicleStatus } from './types'

const emptySummary: DashboardSummary = {
  tripsToday: 0,
  activeTrips: 0,
  pendingTrips: 0,
  completedTrips: 0,
  activeDrivers: 0,
  availableDrivers: 0,
  registeredClients: 0,
  activeClients: 0,
  packagesInTransit: 0,
  delayedTrips: 0,
  openIncidents: 0,
}

const navItems: Array<{ id: Section; label: string; icon: IconName; group?: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'trips', label: 'Viajes', icon: 'trips', group: 'Operaciones' },
  { id: 'requests', label: 'Solicitudes', icon: 'requests', group: 'Operaciones' },
  { id: 'assignment', label: 'Asignar conductor', icon: 'assignment', group: 'Operaciones' },
  { id: 'drivers', label: 'Conductores', icon: 'drivers', group: 'Operaciones' },
  { id: 'vehicles', label: 'Vehículos y flota', icon: 'vehicles', group: 'Operaciones' },
  { id: 'clients', label: 'Clientes', icon: 'clients', group: 'Operaciones' },
  { id: 'packages', label: 'Paquetes', icon: 'packages', group: 'Operaciones' },
  { id: 'tracking', label: 'Mapa / Tracking', icon: 'tracking', group: 'Operaciones' },
  { id: 'history', label: 'Historial', icon: 'history', group: 'Operaciones' },
  { id: 'incidents', label: 'Incidencias', icon: 'incidents', group: 'Operaciones' },
  { id: 'reports', label: 'Reportes', icon: 'reports', group: 'Operaciones' },
  { id: 'users', label: 'Usuarios y roles', icon: 'users', group: 'Administración' },
  { id: 'deliverables', label: 'Entregables', icon: 'deliverables', group: 'Proyecto' },
  { id: 'billing', label: 'Facturas y pagos', icon: 'billing', group: 'Finanzas' },
  { id: 'settings', label: 'Configuración', icon: 'settings' },
]

type ConnectionState = 'loading' | 'connected' | 'error'

function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('incoex-auth') === '1')
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
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
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
      getVehicles(),
      getMaintenance(),
      getUsers(),
      getRoles(),
    ])
      .then(([nextSummary, nextTrips, nextDrivers, nextClients, nextIncidents, nextHistory, nextReports, nextTracking, nextDeliverables, nextDeliverableSummary, nextVehicles, nextMaintenance, nextUsers, nextRoles]) => {
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
        setVehicles(nextVehicles)
        setMaintenance(nextMaintenance)
        setUsers(nextUsers)
        setRoles(nextRoles)
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

  function logout() {
    sessionStorage.removeItem('incoex-auth')
    sessionStorage.removeItem(BILLING_SESSION_KEY)
    setAuthed(false)
  }

  if (!authed) return <LoginView onLogin={() => { sessionStorage.setItem('incoex-auth', '1'); setAuthed(true) }} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <BrandMark />
        </div>

        <div className="sidebar-section-label">Centro de operaciones</div>
        <nav className="nav-list" aria-label="Navegación principal">
          {navItems.map((item) => (
            <button className={`nav-item ${section === item.id ? 'active' : ''}`} key={item.id} onClick={() => navigate(item.id)}>
              <span className="nav-icon"><Icon name={item.icon} size={17} /></span>
              <span>{item.label}</span>
              {item.id === 'incidents' && summary.openIncidents > 0 && <span className="nav-badge">{summary.openIncidents}</span>}
              {item.id === 'billing' && <span className="nav-lock"><Icon name="lock" size={11} /></span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar"><Icon name="drivers" size={17} /></div>
            <div className="user-info">
              <strong>Superadministrador</strong>
              <small>Mario Martínez</small>
            </div>
            <button className="icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={logout}><Icon name="logout" size={16} /></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>INCOEX</span><b>/</b><strong>{currentPage?.label ?? 'Dashboard'}</strong></div>
          <div className="topbar-actions">
            <div className="search-box">
              <span className="search-icon"><Icon name="search" size={15} /></span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar viajes, conductores, clientes..." />
              <kbd>⌘ K</kbd>
            </div>
            <div className="live-pill"><span className="pulse-dot" /> {summary.activeTrips} operaciones activas</div>
            <button className="round-button" aria-label="Notificaciones" onClick={() => setNotice('No hay notificaciones nuevas')}><Icon name="bell" size={16} />{summary.openIncidents > 0 && <span className="notification-dot">{summary.openIncidents}</span>}</button>
            <button className="round-button" aria-label="Ayuda" title="Ayuda" onClick={() => setNotice('Centro de ayuda en preparación')}><Icon name="help" size={16} /></button>
            <div className="profile-menu" onClick={logout} title="Cerrar sesión"><div className="avatar small"><Icon name="drivers" size={14} /></div><span>Superadministrador</span><span className="chevron"><Icon name="chevronDown" size={13} /></span></div>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">{new Intl.DateTimeFormat('es-NI', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div>
              <h1>{currentPage?.label ?? 'Dashboard'}</h1>
              <p>{sectionDescription(section)}</p>
            </div>
            <div className="heading-actions">
              <span className="region-label">Managua · Nicaragua</span>
              {section === 'trips' && <button className="primary-button" onClick={() => setNewTripOpen(true)}><Icon name="plus" size={13} /> Nuevo viaje</button>}
              {section === 'drivers' && <button className="primary-button" onClick={() => setNotice('El alta de conductores se conectará al endpoint de administración')}><Icon name="plus" size={13} /> Agregar conductor</button>}
              {(section === 'reports' || section === 'history') && <button className="secondary-button" onClick={() => setNotice('La exportación usará los datos recibidos de la API')}><Icon name="download" size={13} /> Exportar</button>}
              {section === 'deliverables' && <button className="secondary-button" onClick={() => { setNotice('Selecciona “Guardar como PDF” en la ventana de impresión'); window.print() }}><Icon name="download" size={13} /> Exportar PDF</button>}
            </div>
          </div>

          {connection === 'error' && <div className="connection-banner error"><strong>Sin conexión con el backend.</strong> Verifica que la API esté disponible en <code>{getApiBase()}</code>.</div>}

          {section === 'dashboard' && <Dashboard summary={summary} trips={trips} drivers={drivers} history={history} onNavigate={navigate} />}
          {section === 'trips' && <TripsView trips={trips} search={search} onNotice={setNotice} onChanged={(trip) => { setTrips((current) => current.map((item) => item.id === trip.id ? trip : item)); void refreshSummary(setSummary, setNotice) }} />}
          {section === 'requests' && <RequestsView trips={trips} onNavigate={navigate} />}
          {section === 'assignment' && <AssignmentView trips={trips} drivers={drivers} onAssigned={(trip) => { setTrips((current) => current.map((item) => item.id === trip.id ? trip : item)); void refreshDrivers(setDrivers, setNotice); void refreshSummary(setSummary, setNotice) }} onNotice={setNotice} />}
          {section === 'drivers' && <DriversView drivers={drivers} onNotice={setNotice} />}
          {section === 'vehicles' && <VehiclesView vehicles={vehicles} drivers={drivers} maintenance={maintenance} onNotice={setNotice} onChanged={(updated) => { setVehicles((current) => current.map((item) => item.id === updated.id ? updated : item)); void refreshSummary(setSummary, setNotice) }} onCreated={(vehicle) => { setVehicles((current) => [vehicle, ...current]); setNotice(`Vehículo ${vehicle.plate} registrado en la flota`) }} />}
          {section === 'clients' && <ClientsView clients={clients} search={search} />}
          {section === 'incidents' && <IncidentsView incidents={incidents} onNotice={setNotice} />}
          {section === 'reports' && <ReportsView reports={reports} />}
          {section === 'packages' && <PackagesView trips={trips} />}
          {section === 'tracking' && <TrackingView tracking={tracking} />}
          {section === 'history' && <HistoryView history={history} />}
          {section === 'users' && <UsersView users={users} roles={roles} onNotice={setNotice} onChanged={(updated) => { setUsers((current) => current.map((item) => item.id === updated.id ? updated : item)) }} onCreated={(user) => { setUsers((current) => [...current, user]); setNotice(`Usuario ${user.name} creado con rol asignado`) }} />}
          {section === 'deliverables' && <DeliverablesView deliverables={deliverables} summary={deliverableSummary} onStatusChange={async (id, status) => { try { const updated = await updateDeliverableStatus(id, status); setDeliverables((current) => current.map((item) => item.id === id ? updated : item)); setDeliverableSummary(await getDeliverablesSummary()); setNotice('Entregable actualizado en SQLite local') } catch { setNotice('No se pudo guardar el estado del entregable') } }} onNotice={setNotice} />}
          {section === 'billing' && <BillingView onNotice={setNotice} />}
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
    dashboard: 'Monitoreo en tiempo real de la flota, entregas e incidencias de despacho en Managua.',
    trips: 'Historial y asignación de despachos metropolitanos con transiciones de estado.',
    requests: 'Revisión y aprobación de nuevas solicitudes de viaje.',
    assignment: 'Asignación inmediata de transportistas disponibles.',
    drivers: 'Registro de operadores, disponibilidad y asignación de vehículos.',
    vehicles: 'Flota completa: placas, modelos, capacidad, mantenimiento y disponibilidad.',
    clients: 'Gestión de cuentas corporativas y particulares con acceso logístico.',
    packages: 'Inventario operativo y seguimiento de paquetes vinculados a cada viaje.',
    tracking: 'Vista geográfica de operaciones activas y recorridos de entrega.',
    history: 'Bitácora en tiempo real de despachos, asignaciones e incidencias.',
    incidents: 'Seguimiento de contingencias metropolitanas reportadas por la flota.',
    reports: 'Analítica agregada del rendimiento de viajes y entregas, con exportación CSV.',
    users: 'Usuarios de la plataforma y matriz de los ocho roles contractuales con permisos.',
    deliverables: 'Alcance, avance tangible y próximos hitos del proyecto.',
    billing: 'Facturas, pagos recibidos y calendario de pagos del proyecto. Acceso restringido.',
    settings: 'Configuración de la plataforma, integraciones y seguridad.',
  }
  return descriptions[section]
}

function Dashboard({ summary, trips, drivers, history, onNavigate }: { summary: DashboardSummary; trips: Trip[]; drivers: Driver[]; history: HistoryEvent[]; onNavigate: (section: Section) => void }) {
  return <>
    <div className="metrics-grid">
      <MetricCard label="Viajes de hoy" value={summary.tripsToday} delta="creados hoy" tone="blue" icon="trips" hint="Solicitudes de viaje creadas en el día operativo actual." />
      <MetricCard label="Viajes en curso" value={summary.activeTrips} delta="Asignado · En camino · En entrega" tone="cyan" icon="truck" hint="Viajes que ya tienen conductor asignado y no han sido entregados ni cancelados." />
      <MetricCard label="Pendientes" value={summary.pendingTrips} delta="sin asignar" tone="gold" icon="clock" hint="Solicitudes aprobadas que aún no tienen conductor asignado." />
      <MetricCard label="Entregas completadas" value={summary.completedTrips} delta="hoy" tone="mint" icon="checkCircle" hint="Viajes marcados como Completado en el día." />
      <MetricCard label="Conductores activos" value={summary.activeDrivers} delta="conectados" tone="mint" icon="drivers" hint="Conductores disponibles, en viaje o en entrega." />
      <MetricCard label="Conductores disponibles" value={summary.availableDrivers} delta="para asignar" tone="blue" icon="assignment" hint="Conductores en estado Disponible que pueden recibir una asignación ahora." />
      <MetricCard label="Clientes registrados" value={summary.registeredClients} delta={`${summary.activeClients} activos`} tone="blue" icon="clients" hint="Cuentas corporativas y particulares registradas; activos son los que han operado en el último mes." />
      <MetricCard label="Paquetes en tránsito" value={summary.packagesInTransit} delta="suma de paquetes en viajes en curso" tone="slate" icon="packages" hint="Suma de paquetes de todos los viajes en curso. Un viaje puede aportar varios paquetes." />
      <MetricCard label="Entregas retrasadas" value={summary.delayedTrips} delta="requieren atención" tone="gold" icon="clock" hint="Viajes con incidencia de retraso abierta o que superan el tiempo estimado de entrega." />
      <MetricCard label="Incidencias abiertas" value={summary.openIncidents} delta="abiertas + en proceso" tone="red" icon="incidents" hint="Incidencias no resueltas que requieren atención de soporte u operaciones." />
    </div>
    <section className="panel attention-panel">
      <PanelHeader title="Requiere atención" action="Ver incidencias" onAction={() => onNavigate('incidents')} />
      <div className="attention-grid">
        <button onClick={() => onNavigate('trips')}><span className="attention-icon gold"><Icon name="clock" size={15} /></span><div><strong>{summary.delayedTrips} entregas retrasadas</strong><small>Viajes con retraso reportado</small></div></button>
        <button onClick={() => onNavigate('incidents')}><span className="attention-icon red"><Icon name="alert" size={15} /></span><div><strong>{summary.openIncidents} incidencias abiertas</strong><small>Requieren resolución</small></div></button>
        <button onClick={() => onNavigate('requests')}><span className="attention-icon blue"><Icon name="requests" size={15} /></span><div><strong>{summary.pendingTrips} solicitudes pendientes</strong><small>Esperan asignación</small></div></button>
        <button onClick={() => onNavigate('assignment')}><span className="attention-icon mint"><Icon name="drivers" size={15} /></span><div><strong>{summary.availableDrivers} conductores disponibles</strong><small>Listos para asignar</small></div></button>
      </div>
    </section>
    <div className="dashboard-grid">
      <section className="panel map-panel">
        <PanelHeader title="Mapa de operaciones" action="Ver mapa completo" onAction={() => onNavigate('tracking')} />
        <div className="operations-map">
          <GoogleMap drivers={drivers} />
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
      <button onClick={() => onNavigate('trips')}><span className="quick-icon"><Icon name="trips" size={17} /></span><strong>Revisar solicitudes</strong><small>{summary.pendingTrips} pendientes</small></button>
      <button onClick={() => onNavigate('tracking')}><span className="quick-icon"><Icon name="tracking" size={17} /></span><strong>Abrir tracking</strong><small>{summary.activeTrips} operaciones</small></button>
      <button onClick={() => onNavigate('incidents')}><span className="quick-icon"><Icon name="incidents" size={17} /></span><strong>Atender incidencias</strong><small>{summary.openIncidents} abiertas</small></button>
      <button onClick={() => onNavigate('vehicles')}><span className="quick-icon"><Icon name="vehicles" size={17} /></span><strong>Gestionar flota</strong><small>{trips ? 'ver vehículos y mantenimiento' : 'ver vehículos'}</small></button>
    </section>
  </>
}

function MetricCard({ label, value, delta, tone, icon, hint }: { label: string; value: number; delta: string; tone: string; icon: IconName; hint?: string }) {
  return <div className={`metric-card tone-${tone}`} title={hint}><div className="metric-top"><span className="metric-label">{label}{hint && <span className="metric-info"><Icon name="info" size={11} /></span>}</span><span className="metric-icon"><Icon name={icon} size={15} /></span></div><div className="metric-value">{value.toLocaleString('es-NI')}</div><div className="metric-delta"><span>{delta}</span></div></div>
}

function PanelHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-header"><h2>{title}</h2>{action && <button onClick={onAction}><span>{action}</span><Icon name="arrowRight" size={11} /></button>}</div>
}

function Activity({ time, color, title, detail }: { time: string; color: string; title: string; detail: string }) {
  return <div className="activity-row"><span className="activity-time">{time}</span><span className={`activity-marker ${color}`} /><div><strong>{title}</strong><small>{detail}</small></div><span className="activity-arrow">›</span></div>
}

function BrandMark() {
  return <img src="/brand/logo.png" alt="INCOEX" className="brand-logo-img" />
}
function LoginView({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (username.trim() === 'admin' && password === 'Admin@2026') {
      onLogin()
    } else {
      setError(true)
      setPassword('')
    }
  }
  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <BrandMark />
        </div>
        <h1>Iniciar sesión</h1>
        <p>Accede al panel de administración de operaciones.</p>
        <label>Usuario<input autoFocus value={username} onChange={(event) => { setUsername(event.target.value); setError(false) }} placeholder="admin" /></label>
        <label>Contraseña<input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(false) }} placeholder="••••••••" /></label>
        {error && <span className="login-error">Usuario o contraseña incorrectos</span>}
        <button className="primary-button login-submit" type="submit">Entrar <Icon name="arrowRight" size={13} /></button>
        <span className="login-hint">Demo · admin / Admin@2026</span>
      </form>
    </div>
  )
}

function GoogleMap({ drivers }: { drivers: Driver[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setMapState('loading')
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return
        if (!maps) throw new Error('maps-unavailable')
        try {
          mapRef.current = new maps.Map(containerRef.current, {
            center: MANAGUA_CENTER,
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: true,
            zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
            fullscreenControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            gestureHandling: 'greedy',
            styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
          })
          setMapState('ready')
        } catch {
          if (!cancelled) setMapState('error')
        }
      })
      .catch(() => {
        if (!cancelled) setMapState('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    const maps = window.google?.maps
    const map = mapRef.current
    if (!maps || !map || mapState !== 'ready') return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = drivers
      .filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude))
      .map((driver) => {
        const marker = new maps.Marker({
          position: { lat: driver.latitude, lng: driver.longitude },
          map,
          title: `${driver.name} · ${driver.status}`,
          icon: {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: googleStatusColor(driver.status),
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 1.6,
            scale: 1.15,
            anchor: new maps.Point(12, 24),
          },
        })
        marker.addListener('click', () => {
          new maps.InfoWindow({
            content: `<strong>${driver.name}</strong><br/>${driver.vehicle} · ${driver.plate}<br/>Estado: ${driver.status}`,
          }).open({ anchor: marker, map })
        })
        return marker
      })
    return () => markersRef.current.forEach((marker) => marker.setMap(null))
  }, [drivers, mapState])

  return (
    <div className="google-map-wrap">
      <div ref={containerRef} className="google-map-canvas" />
      {mapState === 'loading' && (
        <div className="map-status">
          <span className="map-status-card"><span className="map-spinner" />Cargando mapa en vivo…</span>
        </div>
      )}
      {mapState === 'error' && (
        <div className="map-status error">
          <span className="map-status-card">
            <strong>No se pudo cargar Google Maps</strong>
            <small>Revisa la API key o la conexión a internet.</small>
            <button onClick={() => { resetGoogleMapsLoader(); setAttempt((current) => current + 1) }}><Icon name="refresh" size={12} /> Reintentar</button>
          </span>
        </div>
      )}
    </div>
  )
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

function TripsView({ trips, search, onNotice, onChanged }: { trips: Trip[]; search: string; onNotice: (message: string) => void; onChanged: (trip: Trip) => void }) {
  const [detailTrip, setDetailTrip] = useState<Trip | null>(null)
  const [actingTrip, setActingTrip] = useState('')
  const filtered = useMemo(() => trips.filter((trip) => `${trip.id} ${trip.client} ${trip.driver} ${trip.origin} ${trip.destination}`.toLowerCase().includes(search.toLowerCase())), [trips, search])
  const inCourse = trips.filter((trip) => trip.status === 'En camino' || trip.status === 'En entrega').length
  async function changeStatus(trip: Trip, status: TripStatus) {
    setActingTrip(trip.id)
    try {
      const updated = await updateTripStatus(trip.id, status)
      onChanged(updated)
      if (detailTrip?.id === trip.id) setDetailTrip(updated)
      onNotice(`${trip.id} pasó a ${status}`)
    } catch {
      onNotice(`No se pudo cambiar el estado de ${trip.id}; verifica la transición permitida`)
    } finally {
      setActingTrip('')
    }
  }
  return <>
    <section className="panel table-panel"><div className="table-toolbar"><div className="filter-row"><button className="filter-chip active">Todas <b>{trips.length}</b></button><button className="filter-chip">Pendientes <b>{trips.filter((trip) => trip.status === 'Pendiente').length}</b></button><button className="filter-chip">En curso <b>{inCourse}</b></button><button className="filter-chip">Completadas <b>{trips.filter((trip) => trip.status === 'Completado').length}</b></button></div><button className="secondary-button" onClick={() => onNotice('Los filtros avanzados se enviarán al endpoint de consulta')}>Filtros <span>⌄</span></button></div><DataTable columns={['ID', 'Cliente', 'Conductor', 'Origen', 'Destino', 'Fecha', 'Paquetes', 'Estado', 'Acciones']} rows={filtered.map((trip) => [<strong className="linkish" key={`${trip.id}-id`}>{trip.id}</strong>, <strong key={`${trip.id}-client`}>{trip.client}</strong>, <span className={trip.driver === 'Sin asignar' ? 'muted' : ''} key={`${trip.id}-driver`}>{trip.driver}</span>, trip.origin, trip.destination, trip.date, trip.packages, <StatusPill key={`${trip.id}-status`} status={trip.status} />, <div className="action-group" key={`${trip.id}-actions`}><button title="Ver detalle" onClick={() => setDetailTrip(trip)}><Icon name="eye" size={14} /></button><button title="Ir a tracking" onClick={() => onNotice(`Tracking de ${trip.id} en el mapa`)}><Icon name="tracking" size={14} /></button></div>])} /><div className="table-footer"><span>Mostrando {filtered.length} de {trips.length} viajes · Clic en 👁 para ver detalle y acciones</span><Pagination /></div></section>
    {detailTrip && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailTrip(null) }}>
        <div className="modal-card trip-detail-modal">
          <div className="modal-header"><div><span className="eyebrow">Detalle del viaje · {detailTrip.id}</span><h2>{detailTrip.client}</h2><p>{detailTrip.origin} → {detailTrip.destination}</p></div><button type="button" className="icon-button" onClick={() => setDetailTrip(null)} aria-label="Cerrar">×</button></div>
          <div className="trip-detail-grid">
            <div className="trip-detail-field"><span>Conductor</span><strong>{detailTrip.driver}</strong></div>
            <div className="trip-detail-field"><span>Fecha</span><strong>{detailTrip.date}</strong></div>
            <div className="trip-detail-field"><span>Paquetes</span><strong>{detailTrip.packages}</strong></div>
            <div className="trip-detail-field"><span>Estado actual</span><StatusPill status={detailTrip.status} /></div>
          </div>
          {detailTrip.description && <p className="trip-detail-note">{detailTrip.description}</p>}
          <div className="modal-actions trip-actions">
            {detailTrip.status === 'Pendiente' && <button className="primary-button" onClick={() => onNotice(`Asigna un conductor a ${detailTrip.id} desde la sección de asignación`)}><Icon name="assignment" size={13} /> Asignar conductor</button>}
            {detailTrip.status === 'Asignado' && <button className="primary-button" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'En camino')}>{actingTrip === detailTrip.id ? 'Actualizando…' : 'Marcar en camino'}</button>}
            {detailTrip.status === 'En camino' && <button className="primary-button" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'En entrega')}>{actingTrip === detailTrip.id ? 'Actualizando…' : 'Marcar en entrega'}</button>}
            {detailTrip.status === 'En entrega' && <button className="primary-button" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'Completado')}>{actingTrip === detailTrip.id ? 'Actualizando…' : 'Confirmar entrega'}</button>}
            {!['Completado', 'Cancelado'].includes(detailTrip.status) && <button className="secondary-button danger" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'Cancelado')}>Cancelar viaje</button>}
            <button className="secondary-button" onClick={() => onNotice(`Tracking de ${detailTrip.id} disponible en el mapa`)}><Icon name="tracking" size={13} /> Ver tracking</button>
          </div>
        </div>
      </div>
    )}
  </>
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

function VehiclesView({ vehicles, drivers, maintenance, onNotice, onChanged, onCreated }: { vehicles: Vehicle[]; drivers: Driver[]; maintenance: MaintenanceRecord[]; onNotice: (message: string) => void; onChanged: (vehicle: Vehicle) => void; onCreated: (vehicle: Vehicle) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null)
  const [busy, setBusy] = useState('')
  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [type, setType] = useState('Panel')
  const [capacityKg, setCapacityKg] = useState(1000)
  const [year, setYear] = useState(2024)
  const [maintenanceNote, setMaintenanceNote] = useState('')

  const byStatus = (status: VehicleStatus) => vehicles.filter((vehicle) => vehicle.status === status)

  async function changeStatus(vehicle: Vehicle, status: VehicleStatus) {
    setBusy(`status-${vehicle.id}`)
    try {
      onChanged(await updateVehicleStatus(vehicle.id, status))
      onNotice(`${vehicle.plate} pasó a ${status}`)
    } catch {
      onNotice(`No se pudo cambiar el estado de ${vehicle.plate}`)
    } finally {
      setBusy('')
    }
  }

  async function assignDriver(vehicle: Vehicle, driver: string) {
    setBusy(`driver-${vehicle.id}`)
    try {
      onChanged(await assignVehicleDriver(vehicle.id, driver))
      onNotice(`${vehicle.plate} asignado a ${driver}`)
    } catch {
      onNotice(`No se pudo asignar el vehículo ${vehicle.plate}`)
    } finally {
      setBusy('')
    }
  }

  async function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('create')
    try {
      onCreated(await createVehicle({ plate, model, type, capacityKg, year }))
      setFormOpen(false)
      setPlate('')
      setModel('')
    } catch {
      onNotice('No se pudo registrar el vehículo; verifica la placa y los datos')
    } finally {
      setBusy('')
    }
  }

  async function submitMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!maintenanceVehicle) return
    setBusy(`mt-${maintenanceVehicle.id}`)
    try {
      await registerVehicleMaintenance(maintenanceVehicle.id, maintenanceNote)
      onChanged(await getVehicles().then((list) => list.find((vehicle) => vehicle.id === maintenanceVehicle.id) ?? maintenanceVehicle))
      onNotice(`Mantenimiento registrado para ${maintenanceVehicle.plate}`)
      setMaintenanceVehicle(null)
      setMaintenanceNote('')
    } catch {
      onNotice('No se pudo registrar el mantenimiento')
    } finally {
      setBusy('')
    }
  }

  return <>
    <div className="driver-summary">
      <SummaryValue label="Total de vehículos" value={String(vehicles.length)} />
      <SummaryValue label="Disponibles" value={String(byStatus('Disponible').length)} tone="mint" />
      <SummaryValue label="En servicio" value={String(byStatus('En servicio').length)} tone="blue" />
      <SummaryValue label="Mantenimiento / fuera" value={String(byStatus('Mantenimiento').length + byStatus('Fuera de servicio').length)} tone="gold" />
    </div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Flota de Managua · capacidad en kg</div><button className="primary-button" onClick={() => setFormOpen(true)}><Icon name="plus" size={13} /> Registrar vehículo</button></div>
      <DataTable columns={['Placa', 'Modelo', 'Tipo', 'Capacidad', 'Año', 'Conductor', 'Estado', 'Último mantenimiento', 'Viajes', 'Acciones']} rows={vehicles.map((vehicle) => [<strong className="linkish" key={`${vehicle.id}-plate`}>{vehicle.plate}</strong>, vehicle.model, vehicle.type, `${vehicle.capacityKg.toLocaleString('es-NI')} kg`, vehicle.year, <span className={vehicle.driver === 'Sin asignar' ? 'muted' : ''} key={`${vehicle.id}-driver`}>{vehicle.driver}</span>, <StatusPill key={`${vehicle.id}-status`} status={vehicle.status} />, vehicle.lastMaintenance, vehicle.totalTrips, <div className="action-group" key={`${vehicle.id}-actions`}>
        <select className="mini-select" value={vehicle.status} disabled={busy === `status-${vehicle.id}`} onChange={(event) => void changeStatus(vehicle, event.target.value as VehicleStatus)} title="Cambiar estado"><option value="Disponible">Disponible</option><option value="En servicio">En servicio</option><option value="Mantenimiento">Mantenimiento</option><option value="Fuera de servicio">Fuera de servicio</option></select>
        <select className="mini-select" value={vehicle.driver === 'Sin asignar' ? '' : vehicle.driver} disabled={busy === `driver-${vehicle.id}` || vehicle.status === 'Mantenimiento' || vehicle.status === 'Fuera de servicio'} onChange={(event) => void assignDriver(vehicle, event.target.value)} title="Asignar conductor"><option value="">Sin asignar</option>{drivers.map((driver) => <option value={driver.name} key={driver.id}>{driver.name}</option>)}</select>
        <button title="Registrar mantenimiento" onClick={() => setMaintenanceVehicle(vehicle)}><Icon name="wrench" size={14} /></button>
      </div>])} />
      <div className="table-footer"><span>Los cambios de estado y conductor se persisten en la API · Registros de mantenimiento: {maintenance.length}</span></div>
    </section>
    {formOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}>
        <form className="modal-card" onSubmit={submitVehicle}>
          <div className="modal-header"><div><span className="eyebrow">Flota · Registro</span><h2>Registrar vehículo</h2><p>Se agrega a la flota en estado Disponible.</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label>Placa<input required value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="M 000-000" /></label>
            <label>Modelo<input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="Toyota Hilux 2024" /></label>
            <label>Tipo<select value={type} onChange={(event) => setType(event.target.value)}><option>Panel</option><option>Van</option><option>Camión</option><option>Pickup</option></select></label>
            <label>Capacidad (kg)<input required type="number" min="100" max="20000" value={capacityKg} onChange={(event) => setCapacityKg(Number(event.target.value))} /></label>
            <label>Año<input required type="number" min="2000" max="2030" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Registrando…' : 'Registrar vehículo'}</button></div>
        </form>
      </div>
    )}
    {maintenanceVehicle && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMaintenanceVehicle(null) }}>
        <form className="modal-card" onSubmit={submitMaintenance}>
          <div className="modal-header"><div><span className="eyebrow">Mantenimiento · {maintenanceVehicle.plate}</span><h2>{maintenanceVehicle.model}</h2><p>Al registrar el mantenimiento, el vehículo pasa a estado Mantenimiento.</p></div><button type="button" className="icon-button" onClick={() => setMaintenanceVehicle(null)} aria-label="Cerrar">×</button></div>
          <div className="form-grid"><label className="full-field">Descripción del servicio<textarea required value={maintenanceNote} onChange={(event) => setMaintenanceNote(event.target.value)} placeholder="Ej: Cambio de aceite, frenos y alineación" rows={3} /></label></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setMaintenanceVehicle(null)}>Cancelar</button><button className="primary-button" disabled={busy === `mt-${maintenanceVehicle.id}`}>{busy === `mt-${maintenanceVehicle.id}` ? 'Guardando…' : 'Registrar mantenimiento'}</button></div>
        </form>
      </div>
    )}
  </>
}

function UsersView({ users, roles, onNotice, onChanged, onCreated }: { users: AppUser[]; roles: Role[]; onNotice: (message: string) => void; onChanged: (user: AppUser) => void; onCreated: (user: AppUser) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<UserRole>('operations')

  async function toggleUser(user: AppUser) {
    setBusy(user.id)
    try {
      onChanged(await updateUser(user.id, { status: user.status === 'Activo' ? 'Inactivo' : 'Activo' }))
      onNotice(`${user.name} ${user.status === 'Activo' ? 'desactivado' : 'activado'}`)
    } catch {
      onNotice(`No se pudo actualizar a ${user.name}`)
    } finally {
      setBusy('')
    }
  }

  async function changeRole(user: AppUser, nextRole: UserRole) {
    setBusy(user.id)
    try {
      onChanged(await updateUser(user.id, { role: nextRole }))
      onNotice(`Rol de ${user.name} actualizado`)
    } catch {
      onNotice(`No se pudo cambiar el rol de ${user.name}`)
    } finally {
      setBusy('')
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('create')
    try {
      onCreated(await createUser({ name, email, phone, role }))
      setFormOpen(false)
      setName('')
      setEmail('')
      setPhone('')
    } catch {
      onNotice('No se pudo crear el usuario; verifica el correo y los datos')
    } finally {
      setBusy('')
    }
  }

  return <>
    <div className="driver-summary">
      <SummaryValue label="Usuarios totales" value={String(users.length)} />
      <SummaryValue label="Activos" value={String(users.filter((user) => user.status === 'Activo').length)} tone="mint" />
      <SummaryValue label="Roles definidos" value={String(roles.length)} tone="blue" />
      <SummaryValue label="Conductores" value={String(users.filter((user) => user.role === 'driver').length)} tone="gold" />
    </div>
    <section className="panel role-matrix-panel">
      <div className="panel-header"><div><span className="eyebrow">MATRIZ DE ROLES · CONTRATO</span><h2>Los ocho roles y sus permisos</h2></div><span className="source-badge">{roles.length} roles contractuales</span></div>
      <div className="role-matrix-grid">{roles.map((item) => <article className="role-card" key={item.code}><div className="role-card-head"><span className="role-code">{item.code.slice(0, 4)}</span><strong>{item.name}</strong></div><p>{item.description}</p><div className="role-permissions">{item.permissions.slice(0, 5).map((permission) => <span key={permission}>{permission}</span>)}</div></article>)}</div>
    </section>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Los cambios de rol y estado se persisten en la API</div><button className="primary-button" onClick={() => setFormOpen(true)}><Icon name="plus" size={13} /> Crear usuario</button></div>
      <DataTable columns={['Usuario', 'Contacto', 'Rol', 'Último acceso', 'Estado', 'Acciones']} rows={users.map((user) => [<div className="client-cell" key={`${user.id}-cell`}><span className="client-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>, user.phone || '—', <select className="mini-select role-select" value={user.role} disabled={busy === user.id} onChange={(event) => void changeRole(user, event.target.value as UserRole)} title="Cambiar rol">{roles.map((item) => <option value={item.code} key={item.code}>{item.name.replace(/^Rol \d{2} · /, '')}</option>)}</select>, user.lastLogin, <StatusPill key={`${user.id}-status`} status={user.status} />, <div className="action-group" key={`${user.id}-actions`}><button title={user.status === 'Activo' ? 'Desactivar' : 'Activar'} disabled={busy === user.id} onClick={() => void toggleUser(user)}>{user.status === 'Activo' ? <Icon name="close" size={14} /> : <Icon name="check" size={14} />}</button></div>])} />
      <div className="table-footer"><span>El administrador general puede gestionar todos los usuarios y sus permisos</span></div>
    </section>
    {formOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}>
        <form className="modal-card" onSubmit={submitUser}>
          <div className="modal-header"><div><span className="eyebrow">Administración · Usuarios</span><h2>Crear usuario</h2><p>El usuario queda Activo con el rol seleccionado.</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label>Nombre<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" /></label>
            <label>Correo<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@incoex.com.ni" /></label>
            <label>Teléfono<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="8XXX-XXXX" /></label>
            <label>Rol<select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>{roles.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Creando…' : 'Crear usuario'}</button></div>
        </form>
      </div>
    )}
  </>
}

function ClientsView({ clients, search }: { clients: Client[]; search: string }) {
  const filtered = useMemo(() => clients.filter((client) => `${client.name} ${client.email} ${client.phone}`.toLowerCase().includes(search.toLowerCase())), [clients, search])
  return <section className="panel table-panel"><div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> {clients.length} clientes cargados desde la API</div><button className="primary-button">＋ Nuevo cliente</button></div><DataTable columns={['Nombre / Empresa', 'Teléfono', 'Email', 'Viajes', 'Solicitudes act.', 'Estado', 'Acciones']} rows={filtered.map((client) => [<div className="client-cell" key={`${client.id}-cell`}><span className="client-avatar">{initials(client.name)}</span><div><strong>{client.name}</strong><small>{client.type}</small></div></div>, client.phone, client.email, client.trips, client.activeRequests, <StatusPill key={`${client.id}-status`} status={client.status} />, <button className="row-action" key={`${client.id}-action`}>•••</button>])} /><div className="table-footer"><span>Mostrando {filtered.length} de {clients.length} clientes</span><Pagination /></div></section>
}

function IncidentsView({ incidents, onNotice }: { incidents: Incident[]; onNotice: (message: string) => void }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div className="filter-row"><button className="filter-chip active">Todas <b>{incidents.length}</b></button><button className="filter-chip">Abiertas <b>{incidents.filter((incident) => incident.status === 'Abierta').length}</b></button><button className="filter-chip">En proceso <b>{incidents.filter((incident) => incident.status === 'En proceso').length}</b></button><button className="filter-chip">Resueltas</button></div><button className="secondary-button" onClick={() => onNotice('Vista de incidencias filtrada desde el conjunto recibido')}>Exportar CSV</button></div><DataTable columns={['ID incidencia', 'Viaje', 'Conductor', 'Cliente', 'Tipo', 'Prioridad', 'Estado', 'Acciones']} rows={incidents.map((incident) => [<strong className="linkish" key={`${incident.id}-id`}>{incident.id}</strong>, incident.trip, incident.driver, incident.client, incident.type, <PriorityPill key={`${incident.id}-priority`} priority={incident.priority} />, <StatusPill key={`${incident.id}-status`} status={incident.status} />, <div className="action-group" key={`${incident.id}-actions`}><button onClick={() => onNotice(`Abriendo ${incident.id}`)}>◉</button><button onClick={() => onNotice(`Incidencia ${incident.id} marcada para atención`)}>✓</button></div>])} /><div className="table-footer"><span>Mostrando {incidents.length} incidencias recibidas</span><Pagination /></div></section>
}

function ReportsView({ reports }: { reports: ReportsSummary | null }) {
  const [exporting, setExporting] = useState('')
  if (!reports) return <EmptyState title="Reportes pendientes" detail="La API aún no entregó el resumen analítico." />
  function exportCsv(collection: 'trips' | 'drivers' | 'clients' | 'incidents', label: string) {
    setExporting(collection)
    const anchor = document.createElement('a')
    anchor.href = getReportCsvUrl(collection)
    anchor.download = `incoex-${collection}-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    window.setTimeout(() => setExporting(''), 600)
    window.setTimeout(() => { if (exporting === collection) setExporting('') }, 4000)
  }
  return <>
    <section className="panel export-panel">
      <div className="export-panel-head"><div><span className="eyebrow">EXPORTACIÓN REAL · CSV</span><h2>Descargar datos operativos</h2><p>Cada archivo contiene los datos recibidos de la API con sus columnas documentadas. Los permisos de exportación los define el rol (Gerencia y Finanzas pueden exportar).</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportCsv('trips', 'viajes')} disabled={exporting !== ''}><Icon name="download" size={13} /> Viajes CSV</button><button className="secondary-button" onClick={() => exportCsv('drivers', 'conductores')} disabled={exporting !== ''}><Icon name="download" size={13} /> Conductores CSV</button><button className="secondary-button" onClick={() => exportCsv('clients', 'clientes')} disabled={exporting !== ''}><Icon name="download" size={13} /> Clientes CSV</button><button className="secondary-button" onClick={() => exportCsv('incidents', 'incidencias')} disabled={exporting !== ''}><Icon name="download" size={13} /> Incidencias CSV</button></div></div>
      <div className="export-footnote"><strong>Columnas:</strong> Viajes (ID, cliente, conductor, origen, destino, fecha, paquetes, estado) · Conductores (ID, nombre, teléfono, vehículo, placa, estado, ruta) · Clientes (ID, nombre, tipo, teléfono, email, viajes, solicitudes activas, estado) · Incidencias (ID, viaje, conductor, cliente, tipo, prioridad, estado).</div>
    </section>
    <div className="metrics-grid report-metrics"><MetricCard label="Viajes totales" value={reports.totalTrips} delta="periodo" tone="blue" icon="trips" hint="Total de solicitudes registradas en el periodo." /><MetricCard label="Entregas completadas" value={reports.completedTrips} delta="periodo" tone="mint" icon="checkCircle" hint="Viajes con estado Completado: recogida y entrega confirmadas." /><MetricCard label="Viajes cancelados" value={reports.cancelledTrips} delta="periodo" tone="red" icon="cancelCircle" hint="Viajes cancelados antes de la entrega." /><MetricCard label="Tiempo prom. entrega" value={reports.averageDeliveryMinutes} delta="min" tone="gold" icon="clock" hint="Promedio entre la asignación del conductor y la entrega confirmada." /></div>
    <div className="reports-grid">
      <ChartPanel title="Viajes por semana" values={reports.weeklyTrips} labels={reports.weeklyLabels} note="Solicitudes creadas por semana del periodo." />
      <ChartPanel title="Entregas por día · tendencia" values={reports.dailyDeliveries} labels={reports.dailyLabels} compact note="Viajes completados por día de la semana." />
      <Leaderboard title="Top conductores" entries={reports.topDrivers} note="Conductores por viajes entregados en el periodo." />
      <Leaderboard title="Top clientes" entries={reports.topClients} note="Clientes por viajes solicitados en el periodo." />
    </div>
  </>
}

function ChartPanel({ title, values, labels, compact = false, note }: { title: string; values: number[]; labels: string[]; compact?: boolean; note?: string }) {
  const max = Math.max(...values, 1)
  return <section className={`panel chart-panel ${compact ? 'compact' : ''}`}><PanelHeader title={title} action="API" /><div className="chart-bars">{values.map((value, index) => <div className="chart-bar-wrap" key={`${labels[index]}-${value}`}><span className="chart-value">{value}</span><div className="chart-bar" style={{ height: `${(value / max) * 100}%` }} /><small>{labels[index]}</small></div>)}</div>{note && <p className="chart-note">{note}</p>}</section>
}

function Leaderboard({ title, entries, note }: { title: string; entries: Array<{ name: string; trips: number }>; note?: string }) {
  return <section className="panel leaderboard"><PanelHeader title={title} action="API" /><ol>{entries.map((entry, index) => <li key={entry.name}><span className="rank">{index + 1}</span><span className="mini-avatar">{initials(entry.name)}</span><strong>{entry.name}</strong><span className="bar"><i style={{ width: `${Math.max(20, 100 - index * 14)}%` }} /></span><b>{entry.trips} viajes</b></li>)}</ol>{note && <p className="chart-note">{note}</p>}</section>
}

function PackagesView({ trips }: { trips: Trip[] }) {
  const packageRows = trips.flatMap((trip) => Array.from({ length: Math.min(trip.packages, 3) }, (_, index) => ({ id: `PKG-${trip.id.replace('#', '')}-${index + 1}`, trip: trip.id, client: trip.client, weightKg: (1 + ((trip.packages + index) % 24)).toFixed(1), dimensions: `${30 + index * 5}×${20 + index * 4}×${15 + index * 3} cm`, status: trip.status })))
  const inTransit = packageRows.filter((pkg) => ['Asignado', 'En camino', 'En entrega'].includes(pkg.status)).length
  return <>
    <div className="driver-summary"><SummaryValue label="Paquetes visibles" value={String(packageRows.length)} /><SummaryValue label="En tránsito" value={String(inTransit)} tone="blue" /><SummaryValue label="Entregados" value={String(packageRows.filter((pkg) => pkg.status === 'Completado').length)} tone="mint" /><SummaryValue label="Pendientes" value={String(packageRows.filter((pkg) => pkg.status === 'Pendiente').length)} tone="gold" /></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Cada paquete hereda el estado y la ruta de su viaje</div><button className="secondary-button" onClick={() => window.dispatchEvent(new CustomEvent('notice', { detail: 'El detalle de paquete con fotos y evidencias se conectará al almacenamiento de evidencias' }))}>Evidencias</button></div>
    <DataTable columns={['Guía', 'Viaje', 'Cliente', 'Peso', 'Dimensiones', 'Estado']} rows={packageRows.map((pkg) => [<strong className="linkish" key={`${pkg.id}-id`}>{pkg.id}</strong>, pkg.trip, pkg.client, `${pkg.weightKg} kg`, pkg.dimensions, <StatusPill key={`${pkg.id}-status`} status={pkg.status} />])} />
    <div className="table-footer"><span>{packageRows.length} paquetes derivados de {trips.length} viajes · El peso y las dimensiones son de demostración hasta conectar la validación de carga</span></div></section>
  </>
}

function TrackingView({ tracking }: { tracking: TrackingOverview | null }) {
  if (!tracking) return <EmptyState title="Tracking pendiente" detail="La API aún no entregó posiciones operativas." />
  return <section className="panel full-map-panel"><div className="tracking-head"><div><span className="eyebrow">LIVE OPERATIONS · GOOGLE MAPS</span><h2>Mapa de flota · Managua</h2></div><div className="tracking-stat"><span className="pulse-dot" /> {tracking.activeOperations} operaciones activas</div></div><div className="large-map"><GoogleMap drivers={tracking.drivers} /><div className="tracking-card"><strong>{tracking.trips[0]?.id ?? 'Sin viaje activo'}</strong><span>{tracking.trips[0]?.driver ?? 'Sin asignar'} · {tracking.trips[0]?.status ?? 'Pendiente'}</span><span>{tracking.trips[0]?.origin ?? '—'} → {tracking.trips[0]?.destination ?? '—'}</span></div><div className="tracking-card second"><strong>{tracking.trips[1]?.id ?? 'Sin segundo viaje'}</strong><span>{tracking.trips[1]?.driver ?? 'Sin asignar'} · {tracking.trips[1]?.status ?? 'Pendiente'}</span><span>{tracking.trips[1]?.origin ?? '—'} → {tracking.trips[1]?.destination ?? '—'}</span></div><div className="map-legend large"><span><i className="legend blue" />En ruta</span><span><i className="legend mint" />Disponible</span><span><i className="legend violet" />Entrega</span><span><i className="legend red" />Incidencia</span></div></div></section>
}

function HistoryView({ history }: { history: HistoryEvent[] }) { return <section className="panel history-panel"><PanelHeader title="Historial de operaciones" action="API" /><div className="timeline">{history.map((event) => <div className="timeline-row" key={event.id}><span className="timeline-time">{event.time}<small>{event.date}</small></span><span className={`timeline-dot ${event.color}`} /><div className="timeline-event"><strong>{event.title}</strong><span>{event.detail}</span></div></div>)}</div></section> }

function DeliverablesView({ deliverables, summary, onStatusChange, onNotice }: { deliverables: Deliverable[]; summary: DeliverableSummary; onStatusChange: (id: string, status: DeliverableStatus) => Promise<void>; onNotice: (message: string) => void }) {
  const [statusFilter, setStatusFilter] = useState<'all' | DeliverableStatus>('all')
  const [areaFilter, setAreaFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [draggingId, setDraggingId] = useState('')
  const [dragOverStatus, setDragOverStatus] = useState<DeliverableStatus | ''>('')
  const columns: Array<{ status: DeliverableStatus; label: string; detail: string }> = [
    { status: 'done', label: 'Verificado', detail: 'Evidencia tangible en el repositorio' },
    { status: 'in_progress', label: 'En implementación', detail: 'Trabajo iniciado en esta base local' },
    { status: 'review', label: 'Revisión / QA', detail: 'Requiere validación o cierre técnico' },
    { status: 'backlog', label: 'Pendiente', detail: 'Requisito contractual aún no implementado' },
  ]
  const areas = Array.from(new Set(deliverables.map((item) => item.area)))
  const priorities = ['Alta', 'Media', 'Baja'] as const
  const filteredDeliverables = useMemo(() => deliverables.filter((item) => {
    const query = searchFilter.trim().toLowerCase()
    const matchesQuery = !query || [item.title, item.area, item.summary, item.owner, item.contractRef].join(' ').toLowerCase().includes(query)
    return matchesQuery && (statusFilter === 'all' || item.status === statusFilter) && (areaFilter === 'all' || item.area === areaFilter) && (priorityFilter === 'all' || item.priority === priorityFilter)
  }), [areaFilter, deliverables, priorityFilter, searchFilter, statusFilter])
  const verifiedPercent = summary.total ? Math.round((summary.done / summary.total) * 100) : 0
  const reportDate = new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
  const referenceScreens = [
    { src: '/reference/figma-01.png', title: 'Onboarding y bienvenida', detail: 'Aplicación móvil · Introducción al servicio' },
    { src: '/reference/figma-02.png', title: 'Acceso, registro y creación de envío', detail: 'Aplicación móvil · Empresa' },
    { src: '/reference/figma-03.png', title: 'Seguimiento, entrega, resumen y perfil', detail: 'Aplicación móvil · Operación del cliente' },
    { src: '/reference/figma-04.png', title: 'Consulta pública de paquete', detail: 'Web responsive · Tracking por guía' },
    { src: '/reference/figma-05.png', title: 'Centro de comando y viajes recientes', detail: 'Web superadministrador · Dashboard y viajes' },
    { src: '/reference/figma-06.png', title: 'Solicitudes y conductores', detail: 'Web superadministrador · Operaciones' },
    { src: '/reference/figma-07.png', title: 'Clientes y asignación', detail: 'Web superadministrador · Gestión y despacho' },
    { src: '/reference/figma-08.png', title: 'Paquetes y mapa operativo', detail: 'Web superadministrador · Tracking' },
    { src: '/reference/figma-09.png', title: 'Incidencias y reportes', detail: 'Web superadministrador · Control y analítica' },
    { src: '/reference/figma-10.png', title: 'Historial de operaciones', detail: 'Web superadministrador · Trazabilidad' },
  ]
  const launchCommands = [
    { id: 'api', step: '01', title: 'Levantar API + SQLite', detail: 'Terminal 1 · NestJS en el puerto 3000', command: 'cd .\\api-incoex\nnpm install\n$env:INCOEX_DB_PATH = "$PWD\\data\\incoex-local.sqlite"\nnpm run start:dev' },
    { id: 'web', step: '02', title: 'Levantar panel web', detail: 'Terminal 2 · Vite en el puerto 5173', command: 'cd .\\web\nnpm install\n$env:VITE_API_URL = "http://localhost:3000/api"\nnpm run dev' },
    { id: 'flutter', step: '03', title: 'Levantar app Flutter', detail: 'Terminal 3 · emulador Android', command: 'cd .\\apps\nflutter pub get\nflutter run --dart-define=INCOEX_API_URL=http://10.0.2.2:3000/api' },
    { id: 'check', step: '04', title: 'Comprobar conexión', detail: 'Navegador · salud y Swagger', command: 'Invoke-RestMethod http://localhost:3000/api/health\nStart-Process http://localhost:3000/api/docs\nStart-Process http://localhost:5173' },
  ]
  async function copyCommand(command: string, title: string) {
    try {
      await navigator.clipboard.writeText(command)
      onNotice(`${title} copiado al portapapeles`)
    } catch {
      onNotice('El navegador no permitió copiar; selecciona el comando manualmente')
    }
  }
  function resetFilters() {
    setStatusFilter('all')
    setAreaFilter('all')
    setPriorityFilter('all')
    setSearchFilter('')
  }
  function beginDrag(event: DragEvent<HTMLElement>, id: string) {
    setDraggingId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
  function dropCard(event: DragEvent<HTMLElement>, status: DeliverableStatus) {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain') || draggingId
    const item = deliverables.find((candidate) => candidate.id === id)
    setDraggingId('')
    setDragOverStatus('')
    if (item && item.status !== status) void onStatusChange(item.id, status)
  }
  return <>
    <section className="report-hero panel">
      <div className="report-hero-main">
        <span className="eyebrow">Estado del proyecto</span>
        <h2>Entregables de INCOEX Apps</h2>
        <p>Avance del proyecto frente al alcance acordado con el cliente, con evidencia de lo implementado y lo pendiente por cerrar.</p>
        <div className="report-meta-row"><span><b>Fecha de corte</b>{reportDate}</span><span><b>Fuente</b>Figma + repositorio</span></div>
      </div>
      <div className="report-hero-side"><div className="report-progress"><strong>{verifiedPercent}%</strong><span>avance verificado</span><div><i style={{ width: `${verifiedPercent}%` }} /></div></div><button className="primary-button" onClick={() => { onNotice('Selecciona “Guardar como PDF” para compartir el informe'); window.print() }}>Imprimir / guardar PDF</button></div>
    </section>
    <div className="deliverable-summary-grid">
      <DeliverableMetric label="Total de tareas" value={summary.total} detail="alcance del proyecto" tone="blue" />
      <DeliverableMetric label="Verificadas" value={summary.done} detail="con evidencia" tone="mint" />
      <DeliverableMetric label="En desarrollo" value={summary.in_progress} detail="en implementación" tone="gold" />
      <DeliverableMetric label="Pendientes" value={summary.review + summary.backlog} detail="por revisar o cerrar" tone="red" />
    </div>
    <section className="panel scope-panel">
      <div className="panel-header"><div><span className="eyebrow">Áreas del proyecto</span><h2>Avance por módulo</h2></div></div>
      <p className="scope-intro">Cada área indica cuántas tareas están verificadas y cuántas quedan por cerrar.</p>
      <div className="scope-area-grid">{areas.map((area) => { const areaItems = deliverables.filter((item) => item.area === area); return <div className="scope-area" key={area}><span className="scope-area-count">{areaItems.length}</span><div><strong>{area}</strong><small>{areaItems.filter((item) => item.status === 'done').length} verificadas · {areaItems.filter((item) => item.status !== 'done').length} por cerrar</small></div></div> })}</div>
      <div className="report-legend"><span><i className="legend-dot verified" />Verificada: con evidencia</span><span><i className="legend-dot review" />Revisión: requiere QA</span><span><i className="legend-dot pending" />Pendiente: sin implementar</span></div>
    </section>
    <section className="project-plan panel">
      <div className="plan-heading"><div><span className="eyebrow">PLAN DE TRABAJO</span><h2>Seguimiento desde el lunes 17 de agosto</h2><p>El alcance se organiza en cuatro semanas de trabajo para dar contexto a cada tarea y facilitar el seguimiento de fechas.</p></div><span className="plan-date">17 AGO 2026 → 13 SEP 2026</span></div>
      <div className="plan-track"><div className="plan-week complete"><span>01</span><strong>Definición</strong><small>17–23 ago · alcance, UX y criterios</small></div><div className="plan-week active"><span>02</span><strong>Base técnica</strong><small>24–30 ago · API, datos y seguridad</small></div><div className="plan-week"><span>03</span><strong>Flujos</strong><small>31 ago–06 sep · web, móvil y operación</small></div><div className="plan-week"><span>04</span><strong>QA y salida</strong><small>07–13 sep · pruebas y preparación</small></div></div>
    </section>
    <section className="reference-panel panel">
      <div className="reference-heading"><div><span className="eyebrow">REFERENCIAS VISUALES</span><h2>Pantallas consideradas en este corte</h2><p>Estas capturas sirven como referencia de alcance y navegación. La validación final se realiza contra la implementación conectada y el comportamiento de cada flujo.</p></div><span className="reference-count">{referenceScreens.length} capturas</span></div>
      <div className="reference-grid">{referenceScreens.map((screen, index) => <figure className="reference-card" key={screen.src}><a href={screen.src} target="_blank" rel="noreferrer"><img src={screen.src} alt={screen.title} loading="lazy" /></a><figcaption><span>0{index + 1}</span><div><strong>{screen.title}</strong><small>{screen.detail}</small></div><a className="reference-open" href={screen.src} target="_blank" rel="noreferrer" aria-label={`Abrir ${screen.title}`}>↗</a></figcaption></figure>)}</div>
    </section>
    <section className="launch-panel technical-launch">
      <div className="launch-heading"><div><span className="eyebrow">GUÍA TÉCNICA · POWERSHELL</span><h2>Cómo levantar el proyecto local</h2><p>Abre tres terminales en la raíz de <code>INCOEX APPS</code>. Copia cada bloque con un clic y deja la API encendida antes de abrir la web o Flutter.</p></div><span className="launch-badge"><span className="pulse-dot" /> Entorno local</span></div>
      <div className="command-grid">{launchCommands.map((item) => <article className="command-card" key={item.id}><div className="command-card-head"><span className="command-step">{item.step}</span><div><h3>{item.title}</h3><small>{item.detail}</small></div><button className="copy-button" onClick={() => void copyCommand(item.command, item.title)} aria-label={`Copiar ${item.title}`}>⧉ Copiar</button></div><pre><code>{item.command}</code></pre></article>)}</div>
      <div className="launch-footnote"><strong>Web:</strong> <span>http://localhost:5173</span><b>·</b><strong>API:</strong> <span>http://localhost:3000/api</span><b>·</b><strong>Reporte:</strong> <span>menú Entregables</span></div>
    </section>
    <section className="kanban-shell">
      <div className="kanban-heading"><div><span className="eyebrow">VALIDACIÓN DEL ALCANCE</span><h2>Detalle de tareas y entregables</h2><p>El estado de cada tarjeta puede actualizarse durante la revisión del cliente.</p></div><span className="kanban-note">Cambios persistidos en SQLite local</span></div>
      <div className="deliverable-filters"><div className="status-filter-row"><button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Todos <b>{deliverables.length}</b></button>{columns.map((column) => <button key={column.status} className={statusFilter === column.status ? 'active ' + column.status : ''} onClick={() => setStatusFilter(column.status)}>{column.label} <b>{deliverables.filter((item) => item.status === column.status).length}</b></button>)}</div><div className="filter-controls"><label className="filter-search"><span>⌕</span><input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Buscar tarea, módulo o responsable" /></label><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="all">Todas las áreas</option>{areas.map((area) => <option value={area} key={area}>{area}</option>)}</select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Todas las prioridades</option>{priorities.map((priority) => <option value={priority} key={priority}>{priority}</option>)}</select><button className="clear-filters" onClick={resetFilters}>Limpiar</button></div><div className="filter-result">Mostrando <strong>{filteredDeliverables.length}</strong> de {deliverables.length} tareas · Arrastra una tarjeta a otra columna para moverla.</div></div>
      <div className="kanban-grid">{columns.map((column) => { const items = filteredDeliverables.filter((item) => item.status === column.status); return <section className={'kanban-column column-' + column.status + (dragOverStatus === column.status ? ' drag-target' : '')} key={column.status} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverStatus(column.status) }} onDragLeave={() => setDragOverStatus('')} onDrop={(event) => dropCard(event, column.status)}><div className="kanban-column-head"><div><h3>{column.label}</h3><small>{column.detail}</small></div><b>{items.length}</b></div><div className="kanban-cards">{items.map((item) => <article className={'deliverable-card' + (draggingId === item.id ? ' is-dragging' : '')} key={item.id} draggable onDragStart={(event) => beginDrag(event, item.id)} onDragEnd={() => { setDraggingId(''); setDragOverStatus('') }}><div className="deliverable-card-meta"><span className={'priority-dot ' + item.priority.toLowerCase()} />{item.area}<span className="source-badge">{item.source}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="deliverable-card-details"><span><b>Responsable</b>{item.owner}</span><span><b>Fecha objetivo</b>{formatProjectDate(item.targetDate)}</span></div><div className="evidence-line"><small>EVIDENCIA / SIGUIENTE PASO</small><span>{item.evidence}</span></div><div className="deliverable-card-footer"><span>Actualizado {formatProjectDate(item.updatedAt, true)}</span><label className="status-select">Mover estado<select value={item.status} onChange={(event) => void onStatusChange(item.id, event.target.value as DeliverableStatus)}>{columns.map((option) => <option key={option.status} value={option.status}>{option.label}</option>)}</select></label></div></article>)}</div>{items.length === 0 && <div className="empty-column">No hay tareas con este filtro</div>}</section> })}</div>
    </section>
  </>
}

function formatProjectDate(value: string, includeYear = false) {
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short', ...(includeYear ? { year: 'numeric' } : {}) }).format(date)
}

function DeliverableMetric({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: string }) { return <div className={`deliverable-metric ${tone}`}><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div> }

const BILLING_PASSWORD = 'Mario@2026'
const BILLING_SESSION_KEY = 'incoex-billing-unlocked'

interface BillingPayment {
  id: string
  label: string
  date: string
  amount: string
  concept: string
  status: 'paid' | 'next' | 'upcoming'
  image?: string
}

const billingPayments: BillingPayment[] = [
  { id: 'PAG-001', label: '18 de agosto 2026', date: '2026-08-18', amount: '$1,200.00', concept: '20% · Diseño UI/UX', status: 'paid', image: '/billing/factura-18-ago-2026.jpg' },
  { id: 'PAG-002', label: '28 de agosto 2026', date: '2026-08-28', amount: '$1,800.00', concept: '30% · Desarrollo base', status: 'next' },
  { id: 'PAG-003', label: '8 de septiembre 2026', date: '2026-09-08', amount: '$1,800.00', concept: '30% · Flujos y módulos', status: 'upcoming' },
  { id: 'PAG-004', label: '18 de septiembre 2026', date: '2026-09-18', amount: '$1,200.00', concept: '20% · QA y entrega', status: 'upcoming' },
]

function BillingView({ onNotice }: { onNotice: (message: string) => void }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(BILLING_SESSION_KEY) === '1')
  if (!unlocked) return <BillingLock onUnlocked={() => { sessionStorage.setItem(BILLING_SESSION_KEY, '1'); setUnlocked(true); onNotice('Acceso financiero concedido · Bienvenido, Mario Martínez') }} />
  return <BillingContent onLock={() => { sessionStorage.removeItem(BILLING_SESSION_KEY); setUnlocked(false); onNotice('Sesión financiera bloqueada') }} onNotice={onNotice} />
}

function BillingLock({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password === BILLING_PASSWORD) {
      onUnlocked()
    } else {
      setError(true)
      setPassword('')
    }
  }
  return (
    <section className="panel billing-lock">
      <span className="billing-lock-icon"><Icon name="lock" size={24} /></span>
      <span className="eyebrow">MÓDULO FINANCIERO · ACCESO RESTRINGIDO</span>
      <h2>Facturas y pagos</h2>
      <p>Este módulo es exclusivo para Mario Martínez. Ingresa la contraseña para ver la factura del pago recibido y el calendario de próximos pagos.</p>
      <form onSubmit={submit}>
        <input type="password" autoFocus value={password} onChange={(event) => { setPassword(event.target.value); setError(false) }} placeholder="Contraseña" className={error ? 'invalid' : ''} />
        <button className="primary-button" type="submit"><Icon name="lock" size={13} /> Desbloquear</button>
      </form>
      {error && <span className="billing-lock-error">Contraseña incorrecta. Intenta de nuevo.</span>}
      <span className="billing-lock-foot">Solo Mario Martínez está autorizado para consultar esta información.</span>
    </section>
  )
}

function BillingContent({ onLock, onNotice }: { onLock: () => void; onNotice: (message: string) => void }) {
  const received = billingPayments.find((payment) => payment.status === 'paid')
  const upcoming = billingPayments.filter((payment) => payment.status !== 'paid')

  function downloadInvoice() {
    if (!received?.image) return
    fetch(received.image)
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'INCOEX-Factura-Pago-18-Ago-2026.jpg'
        anchor.click()
        URL.revokeObjectURL(url)
        onNotice('Factura descargada')
      })
      .catch(() => onNotice('No se pudo descargar la factura'))
  }

  return <>
    <section className="billing-hero panel">
      <div>
        <span className="eyebrow">FINANZAS · SESIÓN PRIVADA</span>
        <h2>Hola, Mario Martínez</h2>
        <p>Aquí está el estado de pagos del proyecto: la factura del pago recibido el 18 de agosto y el calendario con los próximos pagos acordados.</p>
      </div>
      <button className="secondary-button" onClick={onLock}><Icon name="lock" size={13} /> Bloquear sesión</button>
    </section>

    <div className="billing-summary-grid">
      <BillingMetric icon="checkCircle" label="Pago recibido · 18 ago" value="$1,200.00" detail="20% · Diseño UI/UX · Pagado" tone="mint" />
      <BillingMetric icon="calendar" label="Siguiente pago" value="$1,800.00" detail="28 de agosto · 30% · Desarrollo base" tone="blue" />
      <BillingMetric icon="wallet" label="Saldo del proyecto" value="$4,800.00" detail="3 pagos restantes · cierre 18 sep" tone="gold" />
    </div>

    {received && (
      <section className="panel invoice-panel">
        <div className="invoice-head">
          <div><span className="eyebrow">FACTURA DEL PAGO</span><h2>Pago recibido · 18 de agosto de 2026</h2><p>Comprobante del pago de <strong>$1,200.00 USD</strong> por el <strong>20% · Diseño UI/UX</strong> del proyecto INCOEX Apps. Documento privado, disponible solo para visualización y descarga desde este módulo.</p></div>
          <span className="invoice-badge"><Icon name="check" size={12} /> Pagado</span>
        </div>
        <div className="invoice-body">
          <img src={received.image} alt="Factura del pago del 18 de agosto de 2026" className="invoice-image" />
          <div className="invoice-actions">
            <span className="invoice-note"><Icon name="lock" size={12} /> La factura se muestra dentro del panel; no se abre en pestaña nueva.</span>
            <button className="primary-button" onClick={downloadInvoice}><Icon name="download" size={13} /> Descargar factura</button>
          </div>
        </div>
      </section>
    )}

    <section className="panel calendar-panel">
      <div className="panel-header"><div><span className="eyebrow">CALENDARIO DE PAGOS</span><h2>Próximos pagos del proyecto</h2></div><span className="source-badge">Plan acordado</span></div>
      <div className="billing-calendar-grid">
        {upcoming.map((payment) => (
          <article className={`billing-calendar-card ${payment.status}`} key={payment.id}>
            <div className="billing-date-block"><span className="billing-date-day">{payment.label.split(' ')[0]}</span><span className="billing-date-month">{payment.label.split(' ').slice(1, 3).join(' ')}</span></div>
            <div className="billing-calendar-info">
              <strong>{payment.amount}</strong>
              <span>{payment.concept}</span>
              <small><Icon name="calendar" size={11} /> {payment.label}</small>
            </div>
            <span className={`billing-status ${payment.status}`}>{payment.status === 'next' ? 'Siguiente pago' : 'Pronosticado'}</span>
          </article>
        ))}
      </div>
      <div className="billing-timeline">
        <span className="timeline-paid"><i /> 18 ago · Pagado $1,200.00</span>
        <span className="timeline-arrow">→</span>
        <span className="timeline-next"><i /> 28 ago · $1,800.00</span>
        <span className="timeline-arrow">→</span>
        <span><i /> 8 sep · $1,800.00</span>
        <span className="timeline-arrow">→</span>
        <span><i /> 18 sep · $1,200.00</span>
      </div>
    </section>
  </>
}

function BillingMetric({ icon, label, value, detail, tone }: { icon: IconName; label: string; value: string; detail: string; tone: string }) {
  return <div className={`deliverable-metric billing-metric ${tone}`}><span className="metric-label"><Icon name={icon} size={13} /> {label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function SettingsView({ apiBase, connection }: { apiBase: string; connection: ConnectionState }) { return <div className="settings-grid"><section className="panel settings-card"><span className="setting-icon"><Icon name="globe" size={19} /></span><h2>Conexión API</h2><p>El panel consulta todos sus módulos desde el backend NestJS.</p><code>{apiBase}</code><div className={`setting-status ${connection === 'error' ? 'error-status' : ''}`}><span className="pulse-dot" /> {connection === 'connected' ? 'API conectada' : connection === 'loading' ? 'Conectando…' : 'API no disponible'}</div></section><section className="panel settings-card"><span className="setting-icon"><Icon name="map" size={19} /></span><h2>Mapas y tracking</h2><p>Mapas en vivo con Google Maps JavaScript API y posiciones GPS de los conductores.</p><div className="setting-status"><span className="pulse-dot" /> Google Maps conectado</div></section><section className="panel settings-card"><span className="setting-icon"><Icon name="shield" size={19} /></span><h2>Roles y seguridad</h2><p>Empresa, conductor y superadministrador se aislarán mediante JWT y permisos.</p><div className="setting-status muted-status">JWT/RBAC pendiente de producción</div></section></div> }

function EmptyState({ title, detail }: { title: string; detail: string }) { return <section className="panel state-card"><div className="placeholder-icon"><Icon name="requests" size={24} /></div><h2>{title}</h2><p>{detail}</p></section> }
function DataTable({ columns, rows }: { columns: string[]; rows: ReactNode[][] }) { return <div className="table-scroll"><table><thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div> }
function Pagination() { return <div className="pagination"><button>‹</button><button className="active">1</button><button>2</button><button>3</button><button>›</button></div> }
function SummaryValue({ label, value, tone = 'blue' }: { label: string; value: string; tone?: string }) { return <div className="summary-value"><span className={`summary-icon ${tone}`} /> <div><strong>{value}</strong><small>{label}</small></div></div> }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${statusClass(status)}`}>{status}</span> }
function PriorityPill({ priority }: { priority: string }) { return <span className={`priority-pill ${statusClass(priority)}`}>{priority}</span> }
function statusClass(status: string) { return status.toLowerCase().replaceAll(' ', '-').replaceAll('í', 'i').replaceAll('é', 'e') }
function initials(value: string) { return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() }

export default App
