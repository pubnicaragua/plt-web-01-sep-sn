import { Component, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import {
  assignTrip,
  assignVehicleDriver,
  createClient,
  createDriver,
  createIncident,
  createTrip,
  createUser,
  createVehicle,
  deleteClient,
  deleteDriver,
  deleteUser,
  deleteVehicle,
  getApiBase,
  getClients,
  getDashboardSummary,
  getDeliverables,
  getDeliverablesSummary,
  getDrivers,
  getFinanceSummary,
  getHistory,
  getIncidents,
  getMaintenance,
  getReportsSummary,
  getRoles,
  getSettings,
  getTrackingOverview,
  getTrips,
  getUsers,
  getVehicles,
  registerVehicleMaintenance,
  resolveImageUrl,
  updateDeliverableStatus,
  updateIncidentStatus,
  updateSettings,
  updateTripStatus,
  updateTripPayment,
  updateTripFare,
  updateClient,
  updateDriver,
  updateUser,
  revokeUserSession,
  updateVehicle,
  updateVehicleStatus,
  uploadVehicleImage,
  getCortes,
  generateCortes,
  payCorte,
  annulCorte,
  markCorteSent,
  getFuelRecords,
  getFuelStats,
  addFuelRecord,
  deleteFuelRecord,
  getClientProfile,
  type FuelRecord,
  type FuelStatsRow,
} from './lib/api'
import { googleStatusColor, loadGoogleMaps, resetGoogleMapsLoader, MANAGUA_CENTER, INCOEX_MAP_STYLE, incoexPin, nicaraguaRestriction, rationalizePoint, curvedPath, ROUTE_COLOR } from './lib/googleMaps'
import { Icon, type IconName } from './lib/icons'
import { LiveMap } from './components/LiveMap'
import type { AppSettings, AppUser, BillingPeriod, Client, ClientProfile, Corte, DashboardSummary, Deliverable, DeliverableStatus, DeliverableSummary, Driver, FinanceSummary, FuelType, HistoryEvent, Incident, MaintenanceRecord, ReportsSummary, Role, Section, TrackingOverview, Trip, TripStatus, UserRole, Vehicle, VehicleStatus } from './types'
import { csToUsd, formatCs } from './types'

interface NumInputProps {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  placeholder?: string
  required?: boolean
  title?: string
}

function NumInput({ value, onChange, min, max, step, className, placeholder, required, title }: NumInputProps) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const sanitize = (raw: string) =>
    raw
      .replace(/[^\d.]/g, '')
      .replace(/^0+(?=\d)/, '')
      .replace(/(\.\d*)\./g, '$1')

  const handleChange = (raw: string) => {
    const next = sanitize(raw)
    setText(next)
    if (next === '' || next === '.') return
    const n = Number(next)
    if (Number.isFinite(n)) onChange(n)
  }

  const handleBlur = () => {
    setFocused(false)
    let next = sanitize(text)
    if (next === '' || next === '.') {
      if (required) return
      setText(String(value))
      return
    }
    const n = Number(next)
    setText(String(n))
    onChange(n)
  }

  return (
    <input
      type="number"
      className={className}
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      required={required}
      title={title}
      onFocus={(event) => { setFocused(true); event.target.select() }}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={handleBlur}
    />
  )
}

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

type ExportCell = string | number

function exportExcel(filename: string, sheetName: string, rows: Array<Record<string, ExportCell>>) {
  const sheet = XLSX.utils.json_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(book, filename)
}

function exportPdf(title: string, subtitle: string, columns: string[], rows: ExportCell[][]) {
  const windowRef = window.open('', '_blank', 'width=1000,height=700')
  if (!windowRef) return
  const header = columns.map((column) => `<th>${column}</th>`).join('')
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')
  windowRef.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #243554; padding: 28px; }
    h1 { font-size: 20px; margin: 0 0 4px; } p { color: #7e8ca3; font-size: 13px; margin: 0 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; background: #f2f5fa; border-bottom: 2px solid #dbe5f6; padding: 8px 10px; }
    td { border-bottom: 1px solid #eef2f8; padding: 7px 10px; }
    .foot { margin-top: 18px; color: #93a1b8; font-size: 11px; }
  </style></head><body><h1>${title}</h1><p>${subtitle}</p><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table><p class="foot">INCOEX Logistics · generado el ${new Date().toLocaleString('es-NI')} · guarda como PDF desde el diálogo de impresión</p><script>window.onload = function () { window.print() }</script></body></html>`)
  windowRef.document.close()
}

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="map-status error"><span className="map-status-card"><strong>El mapa no pudo dibujarse</strong><small>Reintenta o revisa la conexión.</small><button onClick={() => this.setState({ failed: false })}><Icon name="refresh" size={12} /> Reintentar</button></span></div> : this.props.children }
}

const navItems: Array<{ id: Section; label: string; icon: IconName; group?: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'trips', label: 'Viajes', icon: 'trips', group: 'Operaciones' },
  { id: 'requests', label: 'Solicitudes y asignación', icon: 'requests', group: 'Operaciones' },
  
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
  const [finance, setFinance] = useState<FinanceSummary | null>(null)
  const [tracking, setTracking] = useState<TrackingOverview | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [deliverableSummary, setDeliverableSummary] = useState<DeliverableSummary>({ total: 0, backlog: 0, in_progress: 0, review: 0, done: 0 })
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [newTripOpen, setNewTripOpen] = useState(false)
  const [driverFormOpen, setDriverFormOpen] = useState(false)
  const [clientFormOpen, setClientFormOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    Promise.all([
      getDashboardSummary(),
      getTrips(),
      getDrivers(),
      getClients(),
      getIncidents(),
      getHistory(),
      getReportsSummary(),
      getFinanceSummary(),
      getTrackingOverview(),
      getDeliverables(),
      getDeliverablesSummary(),
      getVehicles(),
      getMaintenance(),
      getUsers(),
      getRoles(),
      getSettings(),
    ])
      .then(([nextSummary, nextTrips, nextDrivers, nextClients, nextIncidents, nextHistory, nextReports, nextFinance, nextTracking, nextDeliverables, nextDeliverableSummary, nextVehicles, nextMaintenance, nextUsers, nextRoles, nextSettings]) => {
        setSummary(nextSummary)
        setTrips(nextTrips)
        setDrivers(nextDrivers)
        setClients(nextClients)
        setIncidents(nextIncidents)
        setHistory(nextHistory)
        setReports(nextReports)
        setFinance(nextFinance)
        setTracking(nextTracking)
        setDeliverables(nextDeliverables)
        setDeliverableSummary(nextDeliverableSummary)
        setVehicles(nextVehicles)
        setMaintenance(nextMaintenance)
        setUsers(nextUsers)
        setRoles(nextRoles)
        setSettings(nextSettings)
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
    setSidebarOpen(false)
  }

  async function refreshTracking() {
    try {
      setTracking(await getTrackingOverview())
    } catch {
      // el polling sigue; el último dato conocido queda en pantalla
    }
  }

  function logout() {
    sessionStorage.removeItem('incoex-auth')
    sessionStorage.removeItem(BILLING_SESSION_KEY)
    setAuthed(false)
  }

  if (!authed) return <LoginView onLogin={() => { sessionStorage.setItem('incoex-auth', '1'); setAuthed(true) }} />

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />
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
          <div className="topbar-leading">
            <button className="icon-button sidebar-toggle" aria-label="Mostrar u ocultar menú" title="Mostrar u ocultar menú" onClick={() => { if (window.innerWidth <= 900) setSidebarOpen((open) => !open); else setSidebarCollapsed((collapsed) => !collapsed) }}><Icon name="menu" size={17} /></button>
            <div className="breadcrumb"><span>INCOEX</span><b>/</b><strong>{currentPage?.label ?? 'Dashboard'}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <span className="search-icon"><Icon name="search" size={15} /></span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar viajes, conductores, clientes..." />
              <kbd>⌘ K</kbd>
            </div>
            <button className="live-pill" onClick={() => navigate('tracking')} title="Ver el mapa de operaciones"><span className="pulse-dot" /> {summary.activeTrips} operaciones activas</button>
            <NotificationBell openIncidents={summary.openIncidents} pendingTrips={summary.pendingTrips} history={history} onNavigate={(target) => { setNotificationsOpen(false); navigate(target) }} open={notificationsOpen} onToggle={() => setNotificationsOpen((current) => !current)} />
            <button className="round-button" aria-label="Ayuda" title="Ayuda" onClick={() => setNotice('Centro de ayuda en preparación')}><Icon name="help" size={16} /></button>
            <div className="profile-menu" onClick={() => setProfileMenuOpen((current) => !current)} title="Cuenta de administrador">
              <div className="avatar small"><Icon name="drivers" size={14} /></div><span>Superadministrador</span><span className="chevron"><Icon name="chevronDown" size={13} /></span>
              {profileMenuOpen && <div className="profile-dropdown"><div className="profile-dropdown-head"><strong>Mario Martínez</strong><small>Administrador General</small></div><button onClick={() => navigate('users')}>Usuarios y roles</button><button onClick={() => navigate('settings')}>Configuración</button><button className="danger-item" onClick={logout}><Icon name="logout" size={13} /> Cerrar sesión</button></div>}
            </div>
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
              {section === 'trips' && <button className="primary-button" onClick={() => setNewTripOpen(true)}><Icon name="plus" size={13} /> Nuevo viaje</button>}
              {section === 'drivers' && <button className="primary-button" onClick={() => setDriverFormOpen(true)}><Icon name="plus" size={13} /> Agregar conductor</button>}
              {section === 'clients' && <button className="primary-button" onClick={() => setClientFormOpen(true)}><Icon name="plus" size={13} /> Nuevo cliente</button>}
              {section === 'deliverables' && <button className="secondary-button" onClick={() => { setNotice('Selecciona “Guardar como PDF” en la ventana de impresión'); window.print() }}><Icon name="download" size={13} /> Exportar PDF</button>}
            </div>
          </div>

          {connection === 'error' && <div className="connection-banner error"><strong>Sin conexión con el backend.</strong> Verifica que la API esté disponible en <code>{getApiBase()}</code>.</div>}

          {section === 'dashboard' && <Dashboard summary={summary} trips={trips} drivers={drivers} history={history} finance={finance} onNavigate={navigate} />}
          {section === 'trips' && <TripsView trips={trips} clients={clients} search={search} settings={settings} finance={finance} onNavigate={navigate} onNotice={setNotice} onChanged={(trip) => { setTrips((current) => current.map((item) => item.id === trip.id ? trip : item)); void refreshSummary(setSummary, setNotice); void refreshFinance(setFinance, setNotice) }} onDeleted={(id) => { setTrips((current) => current.filter((item) => item.id !== id)); void refreshSummary(setSummary, setNotice); void refreshDrivers(setDrivers, setNotice); void refreshFinance(setFinance, setNotice) }} />}
          {section === 'requests' && <RequestsAssignmentView trips={trips} drivers={drivers} initialTab={'solicitudes'} onNavigate={navigate} onAssigned={(trip) => { setTrips((current) => current.map((item) => item.id === trip.id ? trip : item)); void refreshDrivers(setDrivers, setNotice); void refreshSummary(setSummary, setNotice) }} onNotice={setNotice} />}
                    {section === 'drivers' && <DriversView drivers={drivers} vehicles={vehicles} onNavigate={navigate} onNotice={setNotice} onDeleted={(id) => { setDrivers((current) => current.filter((item) => item.id !== id)); void refreshSummary(setSummary, setNotice) }} onVehicleChanged={(updated) => { setVehicles((current) => current.map((item) => item.id === updated.id ? updated : item)); void refreshDrivers(setDrivers, setNotice) }} />}
          {section === 'vehicles' && <VehiclesView vehicles={vehicles} drivers={drivers} maintenance={maintenance} settings={settings} onNotice={setNotice} onChanged={(updated) => { setVehicles((current) => current.map((item) => item.id === updated.id ? updated : item)); void refreshSummary(setSummary, setNotice) }} onCreated={(vehicle) => { setVehicles((current) => [vehicle, ...current]); setNotice(`Vehículo ${vehicle.plate} registrado en la flota`) }} onDeleted={(id) => { setVehicles((current) => current.filter((item) => item.id !== id)); setNotice('Vehículo eliminado de la flota') }} />}
          {section === 'clients' && <ClientsView clients={clients} search={search} onUpdated={(updated) => { setClients((current) => current.map((item) => item.id === updated.id ? updated : item)); void refreshFinance(setFinance, setNotice) }} onNotice={setNotice} onDeleted={(id) => { setClients((current) => current.filter((item) => item.id !== id)); void refreshSummary(setSummary, setNotice) }} />}
          {section === 'incidents' && <IncidentsView incidents={incidents} onNotice={setNotice} onChanged={(updated) => { setIncidents((current) => current.map((item) => item.id === updated.id ? updated : item)); void refreshSummary(setSummary, setNotice) }} onCreated={(incident) => { setIncidents((current) => [incident, ...current]); void refreshSummary(setSummary, setNotice) }} />}
          {section === 'reports' && <ReportsView reports={reports} trips={trips} drivers={drivers} clients={clients} incidents={incidents} vehicles={vehicles} settings={settings} onNotice={setNotice} />}
          {section === 'packages' && <PackagesView trips={trips} onNavigate={navigate} />}
          {section === 'tracking' && <TrackingView tracking={tracking} onNavigate={navigate} onRefresh={refreshTracking} />}
          {section === 'history' && <HistoryView history={history} />}
          {section === 'users' && <UsersView users={users} roles={roles} onNotice={setNotice} onChanged={(updated) => { setUsers((current) => current.map((item) => item.id === updated.id ? updated : item)) }} onCreated={(user) => { setUsers((current) => [...current, user]); setNotice(`Usuario ${user.name} creado con rol asignado`) }} onDeleted={(id) => { setUsers((current) => current.filter((item) => item.id !== id)); setNotice('Usuario eliminado') }} />}
          {section === 'deliverables' && <DeliverablesView deliverables={deliverables} summary={deliverableSummary} onStatusChange={async (id, status) => { try { const updated = await updateDeliverableStatus(id, status); setDeliverables((current) => current.map((item) => item.id === id ? updated : item)); setDeliverableSummary(await getDeliverablesSummary()); setNotice('Entregable actualizado en SQLite local') } catch { setNotice('No se pudo guardar el estado del entregable') } }} onNotice={setNotice} />}
          {section === 'billing' && <BillingView trips={trips} clients={clients} drivers={drivers} vehicles={vehicles} settings={settings} onNotice={setNotice} />}
          {section === 'settings' && <SettingsView connection={connection} settings={settings} onSaved={setSettings} onNotice={setNotice} />}
        </div>
      </main>
      {notice && <div className="toast"><span className="toast-check">✓</span>{notice}</div>}
      {newTripOpen && <NewTripDialog settings={settings} onClose={() => setNewTripOpen(false)} onCreated={(trip) => { setTrips((current) => [trip, ...current]); setNewTripOpen(false); setNotice(`Solicitud ${trip.id} creada · tarifa estimada ${formatCs(trip.estimatedCostCs ?? 0)}`); void refreshSummary(setSummary, setNotice) }} onError={setNotice} />}
      {driverFormOpen && <DriverFormDialog onClose={() => setDriverFormOpen(false)} onCreated={(driver) => { setDrivers((current) => [...current, driver]); setDriverFormOpen(false); setNotice(`Conductor ${driver.name} registrado y disponible`) }} onError={setNotice} />}
      {clientFormOpen && <ClientFormDialog onClose={() => setClientFormOpen(false)} onCreated={(client) => { setClients((current) => [...current, client]); setClientFormOpen(false); setNotice(`Cliente ${client.name} registrado y activo`) }} onError={setNotice} />}
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

async function refreshFinance(setFinance: (finance: FinanceSummary) => void, setNotice: (notice: string) => void) {
  try {
    setFinance(await getFinanceSummary())
  } catch {
    setNotice('La operación se actualizó, pero no se pudo refrescar la rentabilidad')
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

function Dashboard({ summary, trips, drivers, history, finance, onNavigate }: { summary: DashboardSummary; trips: Trip[]; drivers: Driver[]; history: HistoryEvent[]; finance: FinanceSummary | null; onNavigate: (section: Section) => void }) {
  return <>
    <div className="metrics-grid">
      <MetricCard label="Viajes de hoy" value={summary.tripsToday} delta="creados hoy" tone="blue" icon="trips" hint="Solicitudes de viaje creadas en el día operativo actual." onClick={() => onNavigate('trips')} />
      <MetricCard label="Viajes en curso" value={summary.activeTrips} delta="Asignado · En camino · En entrega" tone="cyan" icon="truck" hint="Viajes que ya tienen conductor asignado y no han sido entregados ni cancelados." onClick={() => onNavigate('tracking')} />
      <MetricCard label="Pendientes" value={summary.pendingTrips} delta="sin asignar" tone="gold" icon="clock" hint="Solicitudes aprobadas que aún no tienen conductor asignado." onClick={() => onNavigate('requests')} />
      <MetricCard label="Entregas completadas" value={summary.completedTrips} delta="hoy" tone="mint" icon="checkCircle" hint="Viajes marcados como Completado en el día." onClick={() => onNavigate('trips')} />
      <MetricCard label="Conductores activos" value={summary.activeDrivers} delta="conectados" tone="mint" icon="drivers" hint="Conductores disponibles, en viaje o en entrega." onClick={() => onNavigate('drivers')} />
      <MetricCard label="Conductores disponibles" value={summary.availableDrivers} delta="para asignar" tone="blue" icon="assignment" hint="Conductores en estado Disponible que pueden recibir una asignación ahora." onClick={() => onNavigate('assignment')} />
      <MetricCard label="Clientes registrados" value={summary.registeredClients} delta={`${summary.activeClients} activos`} tone="blue" icon="clients" hint="Cuentas corporativas y particulares registradas; activos son los que han operado en el último mes." onClick={() => onNavigate('clients')} />
      <MetricCard label="Paquetes en tránsito" value={summary.packagesInTransit} delta="suma de paquetes en viajes en curso" tone="slate" icon="packages" hint="Suma de paquetes de todos los viajes en curso. Un viaje puede aportar varios paquetes." onClick={() => onNavigate('packages')} />
      <MetricCard label="Entregas retrasadas" value={summary.delayedTrips} delta="requieren atención" tone="gold" icon="clock" hint="Viajes con incidencia de retraso abierta." onClick={() => onNavigate('incidents')} />
      <MetricCard label="Incidencias abiertas" value={summary.openIncidents} delta="abiertas + en proceso" tone="red" icon="incidents" hint="Incidencias no resueltas que requieren atención de soporte u operaciones." onClick={() => onNavigate('incidents')} />
    </div>
    {finance && <FinancePanel finance={finance} onNavigate={onNavigate} />}
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

function MetricCard({ label, value, delta, tone, icon, hint, onClick }: { label: string; value: number; delta: string; tone: string; icon: IconName; hint?: string; onClick?: () => void }) {
  return <button className={`metric-card tone-${tone} clickable`} title={hint} onClick={onClick} type="button"><div className="metric-top"><span className="metric-label">{label}{hint && <span className="metric-info"><Icon name="info" size={11} /></span>}</span><span className="metric-icon"><Icon name={icon} size={15} /></span></div><div className="metric-value">{value.toLocaleString('es-NI')}</div><div className="metric-delta"><span>{delta}</span></div></button>
}

function FinancePanel({ finance, onNavigate }: { finance: FinanceSummary; onNavigate: (section: Section) => void }) {
  const today = finance.periods.today
  const marginPct = today.incomeCs > 0 ? Math.max(0, Math.round((today.marginCs / today.incomeCs) * 100)) : 0
  const fuelPct = today.incomeCs > 0 ? Math.round((today.fuelCs / today.incomeCs) * 100) : 0
  const maxIncome = Math.max(...finance.daily.map((day) => day.incomeCs), 1)
  return (
    <section className="panel finance-panel">
      <div className="finance-head">
        <div><span className="eyebrow">Rentabilidad · C$</span><h2>Dinero en limpio</h2><p>Ingresos ejecutados (viajes Completado) contra combustible y mantenimiento · {finance.invoicingTrips} viajes en facturación por {formatCs(finance.invoicingCs)}</p></div>
        <button className="secondary-button" onClick={() => onNavigate('trips')}><Icon name="trips" size={13} /> Ver viajes</button>
      </div>
      <div className="finance-grid">
        <div className="finance-card income"><span className="finance-card-label">Ingresos hoy</span><strong>{formatCs(today.incomeCs)}</strong><small>{today.trips} viajes completados · {formatCs(today.avgPerKmCs)}/km</small></div>
        <div className="finance-card fuel"><span className="finance-card-label">Combustible hoy</span><strong>{formatCs(today.fuelCs)}</strong><small>{fuelPct}% de los ingresos · {today.km.toLocaleString('es-NI')} km</small></div>
        <div className="finance-card maintenance"><span className="finance-card-label">Mantenimiento hoy</span><strong>{formatCs(today.maintenanceCs)}</strong><small>histórico extendido en las columnas</small></div>
        <div className="finance-card margin"><span className="finance-card-label">Margen hoy</span><strong>{formatCs(today.marginCs)}</strong><small>{marginPct}% de margen bruto</small></div>
      </div>
      <div className="finance-periods">
        {[finance.periods.today, finance.periods.week, finance.periods.month, finance.periods.all].map((period) => (
          <div className={`finance-period-row ${period.label === 'Hoy' ? 'active' : ''}`} key={period.label}>
            <div className="fin-period-label"><span>{period.label}</span><small>{period.trips} viajes · {period.km.toLocaleString('es-NI')} km</small></div>
            <div className="fin-period-vals"><span><small>Ingresos</small><b>{formatCs(period.incomeCs)}</b></span><span><small>Combustible</small><b>{formatCs(period.fuelCs)}</b></span><span><small>Manten.</small><b>{formatCs(period.maintenanceCs)}</b></span><span className="fin-margin"><small>Margen</small><b>{formatCs(period.marginCs)}</b></span></div>
          </div>
        ))}
      </div>
      <div className="finance-bottom">
        <div className="finance-chart">
          <div className="finance-chart-head"><strong>Ingresos vs combustible · últimos 14 días</strong><small>Ingresos completados × combustible estimado</small></div>
          <div className="fin-bars">
            {finance.daily.map((day) => (
              <div className="fin-bar-col" key={day.label} title={`${day.label} · ingresos ${formatCs(day.incomeCs)} · combustible ${formatCs(day.fuelCs)}`}>
                <div className="fin-bar-stack"><i className="fin-bar fuel" style={{ height: `${Math.min(100, (day.fuelCs / maxIncome) * 100)}%` }} /><i className="fin-bar income" style={{ height: `${Math.min(100, (day.incomeCs / maxIncome) * 100)}%` }} /></div>
                <span>{day.label}</span>
              </div>
            ))}
          </div>
          <div className="fin-legend"><span><i className="fin-dot income" />Ingresos</span><span><i className="fin-dot fuel" />Combustible</span></div>
        </div>
        <div className="finance-topclients">
          <div className="finance-chart-head"><strong>Top clientes por ingresos</strong><small>mejores cuentas del histórico</small></div>
          {finance.topClients.map((client, index) => (
            <button className="fin-client" key={client.name} onClick={() => onNavigate('clients')}>
              <span className="fin-client-rank">{index + 1}</span>
              <span className="fin-client-name"><strong>{client.name}</strong><small>{client.trips} viajes</small></span>
              <span className="fin-client-money"><b>{formatCs(client.incomeCs)}</b><small>margen {formatCs(client.marginCs)}</small></span>
            </button>
          ))}
          <div className="fleet-stats"><span><b>{finance.fleet.vehicles}</b> vehículos</span><span><b>{finance.fleet.drivers}</b> conductores</span><span><b>{finance.fleet.totalDistanceKm.toLocaleString('es-NI')}</b> km</span><span><b>{formatCs(finance.fleet.avgFuelPerKmCs)}</b> combustible/km</span></div>
        </div>
      </div>
    </section>
  )
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

function NotificationBell({ openIncidents, pendingTrips, history, open, onToggle, onNavigate }: { openIncidents: number; pendingTrips: number; history: HistoryEvent[]; open: boolean; onToggle: () => void; onNavigate: (section: Section) => void }) {
  const total = openIncidents + pendingTrips
  return (
    <div className="notifications-wrap">
      <button className="round-button" aria-label="Notificaciones" onClick={onToggle}><Icon name="bell" size={16} />{total > 0 && <span className="notification-dot">{total}</span>}</button>
      {open && (
        <div className="notifications-dropdown">
          <div className="notifications-head"><strong>Notificaciones</strong><span>{total} sin atender</span></div>
          {openIncidents > 0 && <button onClick={() => onNavigate('incidents')}><span className="attention-icon red"><Icon name="alert" size={13} /></span><div><strong>{openIncidents} incidencias abiertas</strong><small>Requieren resolución</small></div></button>}
          {pendingTrips > 0 && <button onClick={() => onNavigate('requests')}><span className="attention-icon blue"><Icon name="requests" size={13} /></span><div><strong>{pendingTrips} solicitudes pendientes</strong><small>Esperan asignación de conductor</small></div></button>}
          {total === 0 && <p className="notifications-empty">Todo al día, sin pendientes.</p>}
          <div className="notifications-foot"><span>Última actividad</span></div>
          {history.slice(0, 3).map((event) => <div className="notification-row" key={event.id}><span className={`activity-marker ${event.color}`} /><div><strong>{event.title}</strong><small>{event.detail}</small></div><span>{event.time}</span></div>)}
        </div>
      )}
    </div>
  )
}

function GoogleMap({ drivers, trips = [] }: { drivers: Driver[]; trips?: Trip[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylinesRef = useRef<any[]>([])
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
            zoomControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            gestureHandling: 'greedy',
            styles: INCOEX_MAP_STYLE,
            restriction: nicaraguaRestriction(),
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
    try {
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = drivers
        .filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude))
        .map((driver) => {
          const marker = new maps.Marker({
            position: { lat: driver.latitude, lng: driver.longitude },
            map,
            title: `${driver.name} · ${driver.status}`,
            icon: incoexPin(maps, googleStatusColor(driver.status), 1.15),
          })
          marker.addListener('click', () => {
            new maps.InfoWindow({
              content: `<strong>${driver.name}</strong><br/>${driver.vehicle} · ${driver.plate}<br/>Estado: ${driver.status}`,
            }).open({ anchor: marker, map })
          })
          return marker
        })
      polylinesRef.current.forEach((polyline) => polyline.setMap(null))
      polylinesRef.current = trips
        .filter((trip) => Number.isFinite(trip.originLat) && Number.isFinite(trip.destinationLat) && Number.isFinite(trip.originLng) && Number.isFinite(trip.destinationLng))
        .map((trip) => new maps.Polyline({
          path: curvedPath(maps, { lat: trip.originLat as number, lng: trip.originLng as number }, { lat: trip.destinationLat as number, lng: trip.destinationLng as number }),
          map,
          strokeColor: ROUTE_COLOR,
          strokeOpacity: 0.85,
          strokeWeight: 3,
        }))
    } catch {
      // el proveedor rechazó los marcadores; el mapa sigue visible
    }
    return () => {
      try {
        markersRef.current.forEach((marker) => marker.setMap(null))
        polylinesRef.current.forEach((polyline) => polyline.setMap(null))
      } catch {
        // limpieza segura
      }
    }
  }, [drivers, trips, mapState])

  return (
    <div className="google-map-wrap">
      <div ref={containerRef} className="google-map-canvas" />
      <img src="/brand/logo.png" alt="INCOEX" className="map-brand-overlay" />
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

type LatLng = { lat: number; lng: number }

function DriverFormDialog({ onClose, onCreated, onError }: { onClose: () => void; onCreated: (driver: Driver) => void; onError: (message: string) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [plate, setPlate] = useState('')
  const [external, setExternal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const driver = await createDriver({ name, phone, email, vehicle, plate, external })
      onCreated(driver)
      if ((driver as Driver & { existed?: boolean }).existed) onError('Ese conductor ya existía: sus datos se actualizaron, no se duplicó')
    } catch {
      onError('No se pudo registrar el conductor; revisa la conexión con la API')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card wide" onSubmit={submit}>
        <div className="modal-header"><div><span className="eyebrow">Operaciones · Conductores</span><h2>Agregar conductor</h2><p>Queda en estado Disponible con posición inicial en Managua. Si el teléfono ya existe, se actualizan sus datos (sin duplicar).</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="form-grid">
          <label>Nombre completo<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre y apellidos" /></label>
          <label>Teléfono<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="8XXX-XXXX" /></label>
          <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="conductor@empresa.com.ni" /></label>
          <label>Placa<input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="M 000-000" /></label>
          <label className="full-field">Vehículo<input value={vehicle} onChange={(event) => setVehicle(event.target.value)} placeholder="Ej: Toyota Hilux 2024" /></label>
          <label className="full-field check-field"><input type="checkbox" checked={external} onChange={(event) => setExternal(event.target.checked)} /> Proveedor tercerizado (vehículo y conductor de tercero, se marca con 3P)</label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={submitting}>{submitting ? 'Guardando…' : 'Registrar conductor'}</button></div>
      </form>
    </div>
  )
}

function ClientFormDialog({ client, onClose, onCreated, onError }: { client?: Client | null; onClose: () => void; onCreated: (client: Client) => void; onError: (message: string) => void }) {
  const [name, setName] = useState(client?.name ?? '')
  const [type, setType] = useState(client?.type ?? 'Corporativo')
  const [phone, setPhone] = useState(client?.phone ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [address, setAddress] = useState(client?.address ?? '')
  const [contact, setContact] = useState(client?.contact ?? '')
  const [taxId, setTaxId] = useState(client?.taxId ?? '')
  const [notes, setNotes] = useState(client?.notes ?? '')
  const [creditDays, setCreditDays] = useState(client?.creditDays ?? 0)
  const [dueDay, setDueDay] = useState(client?.dueDay ?? 0)
  const [billingPeriod, setBillingPeriod] = useState<Client['billingPeriod']>(client?.billingPeriod ?? 'semanal')
  const [billingCustomDays, setBillingCustomDays] = useState(client?.billingCustomDays ?? 7)
  const [billingCutDay, setBillingCutDay] = useState(client?.billingCutDay ?? 0)
  const [billingCutTime, setBillingCutTime] = useState(client?.billingCutTime ?? '22:00')
  const [billingActive, setBillingActive] = useState(client?.billingActive ?? false)
  const [whatsapp, setWhatsapp] = useState(client?.whatsapp ?? '')
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const payload = { name, type, phone, email, address, contact, taxId, notes, creditDays, dueDay, billingPeriod, billingCustomDays, billingCutDay, billingCutTime, billingActive, whatsapp }
      const saved = client ? await updateClient(client.id, payload) : await createClient(payload)
      onCreated(saved)
      if (client) onError('Cliente actualizado: crédito, contacto y datos guardados')
      else if ((saved as Client & { existed?: boolean }).existed) onError('Ese cliente ya existía: sus datos se actualizaron, no se duplicó')
    } catch {
      onError('No se pudo guardar el cliente; revisa el nombre o la conexión con la API')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card wide" onSubmit={submit}>
        <div className="modal-header"><div><span className="eyebrow">Operaciones · Clientes</span><h2>{client ? 'Editar cliente' : 'Nuevo cliente'}</h2><p>{client ? 'Actualiza contactos y condiciones de cobro (crédito y día de facturación).' : 'Se registra Activo y queda disponible para solicitar viajes. Si el nombre o el correo ya existen, se actualizan sus datos (sin duplicar).'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="form-grid">
          <label>Nombre o empresa<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre de la empresa o persona" /></label>
          <label>Tipo de cliente<select value={type} onChange={(event) => setType(event.target.value)}><option>Corporativo</option><option>Particular</option></select></label>
          <label>Teléfono<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="8XXX-XXXX" /></label>
          <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="contacto@empresa.com.ni" /></label>
          <label>Persona de contacto<input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Quién levanta las solicitudes" /></label>
          <label>NIT / RUC<input value={taxId} onChange={(event) => setTaxId(event.target.value)} placeholder="Ej: J0310000123456" /></label>
          <label className="full-field">Dirección<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Dirección principal en Managua" /></label>
          <label>Días de crédito<NumInput min={0} value={creditDays} onChange={setCreditDays} placeholder="0 = contado" /></label>
          <label>Día de cobro (1-28)<select value={dueDay} onChange={(event) => setDueDay(Number(event.target.value))} title="Cada mes se factura este día"><option value={0}>— sin día fijo —</option>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option value={day} key={day}>{day} de cada mes</option>)}</select></label>
          <label className="full-field">Notas internas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Horarios de entrega, puntos de referencia, condiciones…" /></label>
        </div>
        <div className="billing-cfg">
          <div className="billing-cfg-head"><span className="eyebrow">CORTE DE PAGO AUTOMATICO</span><label className="check-inline"><input type="checkbox" checked={billingActive} onChange={(event) => setBillingActive(event.target.checked)} /><span>Activar corte automatico para este cliente (recibo de deuda acumulada)</span></label></div>
          <div className="form-grid billing-cfg-grid">
            <label>Periodo de corte<select value={billingPeriod} onChange={(event) => setBillingPeriod(event.target.value as Client['billingPeriod'])}><option value="semanal">Semanal</option><option value="quincenal">Quincenal</option><option value="mensual">Mensual</option><option value="personalizado">Personalizado (dias)</option><option value="">Sin periodo fijo</option></select></label>
            {billingPeriod === 'personalizado' && <label>Dias por periodo<NumInput min={1} max={90} value={billingCustomDays} onChange={setBillingCustomDays} /></label>}
            {billingPeriod === 'mensual'
              ? <label>Dia de corte del mes<select value={billingCutDay} onChange={(event) => setBillingCutDay(Number(event.target.value))}>{Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option value={day} key={day}>{day} de cada mes</option>)}</select></label>
              : <label>Dia de corte (semana)<select value={billingCutDay} onChange={(event) => setBillingCutDay(Number(event.target.value))}><option value={0}>Domingo</option><option value={1}>Lunes</option><option value={2}>Martes</option><option value={3}>Miercoles</option><option value={4}>Jueves</option><option value={5}>Viernes</option><option value={6}>Sabado</option></select></label>}
            <label>Hora del corte<input type="time" value={billingCutTime} onChange={(event) => setBillingCutTime(event.target.value)} /></label>
            <label>WhatsApp para envio<input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} placeholder="8XXX XXXX" title="Se usa para enviarle el recibo del corte por WhatsApp" /></label>
          </div>
          <p className="billing-cfg-hint">El corte acumula los viajes desde un corte hasta el siguiente (ej: dom 10:01 pm hasta dom 9:59 pm). Se genera automaticamente al vencer el periodo (o manual desde Facturacion), y queda listo para enviarse por WhatsApp o notificarse en la app del cliente.</p>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={submitting}>{submitting ? 'Guardando…' : client ? 'Guardar cambios' : 'Registrar cliente'}</button></div>
      </form>
    </div>
  )
}

function haversineKm(a: LatLng, b: LatLng) {
  const radius = 6371
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

function PlaceInput({ value, onChange, onPlace, placeholder, required }: { value: string; onChange: (next: string) => void; onPlace: (place: { label: string; lat: number; lng: number }) => void; placeholder: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let autocomplete: any
    let mounted = true
    loadGoogleMaps().then((maps) => {
      if (!mounted || !inputRef.current || !maps?.places?.Autocomplete) return
      autocomplete = new maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'ni' },
        fields: ['formatted_address', 'geometry', 'name'],
      })
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        const label = place?.formatted_address || place?.name || ''
        if (label) onChange(label)
        const location = place?.geometry?.location
        if (location && typeof location.lat === 'function') {
          onPlace({ label, lat: location.lat(), lng: location.lng() })
        }
      })
    })
    return () => { mounted = false }
  }, [])
  return <input ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} autoComplete="off" />
}

const TRIP_STEPS = ['Cliente y servicio', 'Ruta en el mapa', 'Destinatario y carga', 'Confirmar']

function NewTripDialog({ settings, onClose, onCreated, onError }: { settings: AppSettings | null; onClose: () => void; onCreated: (trip: Trip) => void; onError: (message: string) => void }) {
  const [step, setStep] = useState(0)
  const [client, setClient] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [serviceType, setServiceType] = useState<Trip['serviceType']>('Urbano')
  const [packages, setPackages] = useState(1)
  const [description, setDescription] = useState('')
  const [fragile, setFragile] = useState(false)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [originRefs, setOriginRefs] = useState('')
  const [destinationRefs, setDestinationRefs] = useState('')
  const [originPoint, setOriginPoint] = useState<LatLng | null>(null)
  const [destinationPoint, setDestinationPoint] = useState<LatLng | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function placeOnMap(place: { label: string; lat: number; lng: number }, type: 'origin' | 'destination') {
    if (type === 'origin') {
      setOrigin(place.label)
      setOriginPoint({ lat: place.lat, lng: place.lng })
    } else {
      setDestination(place.label)
      setDestinationPoint({ lat: place.lat, lng: place.lng })
    }
  }

  const distanceKm = useMemo(() => (originPoint && destinationPoint ? haversineKm(originPoint, destinationPoint) : 0), [originPoint, destinationPoint])
  const estimatedCost = settings ? Number((settings.baseFeeCs + distanceKm * settings.farePerKmCs).toFixed(2)) : 0
  const estimatedUsd = settings ? csToUsd(estimatedCost, settings.dollarRate) : 0

  const canNext = step === 0
    ? client.trim() !== ''
    : step === 1
      ? origin.trim() !== '' && destination.trim() !== '' && originPoint !== null && destinationPoint !== null
      : true

  async function submit() {
    setSubmitting(true)
    try {
      const trip = await createTrip({
        client,
        contactName,
        contactPhone,
        serviceType,
        packages,
        description,
        fragile,
        origin,
        destination,
        originLat: originPoint?.lat,
        originLng: originPoint?.lng,
        destinationLat: destinationPoint?.lat,
        destinationLng: destinationPoint?.lng,
        distanceKm: Number(distanceKm.toFixed(2)),
        recipientName,
        recipientPhone,
        originRefs,
        destinationRefs,
      })
      onCreated(trip)
    } catch {
      onError('No se pudo crear el viaje; revisa la conexión con la API')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop wizard-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card wizard-card" onSubmit={(event) => { event.preventDefault(); if (step < 3) setStep(step + 1); else void submit() }}>
        <div className="modal-header"><div><span className="eyebrow">Nueva solicitud · API</span><h2>Crear viaje</h2><p>Proceso completo: cliente, ruta sobre el mapa y tarifa estimada en córdobas.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="wizard-steps">{TRIP_STEPS.map((label, index) => <div className={`wizard-step ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`} key={label}><span>{index < step ? '✓' : index + 1}</span>{label}</div>)}</div>
        <div className="wizard-body">
          {step === 0 && (
            <div className="form-grid">
              <label className="full-field">Cliente *<input required value={client} onChange={(event) => setClient(event.target.value)} placeholder="Nombre o empresa" /></label>
              <label>Contacto<input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Quién solicita" /></label>
              <label>Teléfono de contacto<input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="8XXX-XXXX" /></label>
              <label>Tipo de servicio<select value={serviceType} onChange={(event) => setServiceType(event.target.value as Trip['serviceType'])}><option>Urbano</option><option>Express</option><option>Programado</option></select></label>
              <label>Paquetes<NumInput required min={1} value={packages} onChange={(next) => setPackages(Math.max(1, next))} /></label>
              <label className="full-field check-field"><input type="checkbox" checked={fragile} onChange={(event) => setFragile(event.target.checked)} /> Carga frágil (manejo cuidadoso)</label>
              <label className="full-field">Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Características o instrucciones de la carga" rows={3} /></label>
            </div>
          )}
          {step === 1 && (
            <div className="route-step">
              <div className="form-grid route-fields">
                <label>Recogida<PlaceInput value={origin} onChange={setOrigin} onPlace={(place) => placeOnMap(place, 'origin')} placeholder="Busca una dirección o lugar (auto-sugerencias)" required /></label>
                <label>Destino<PlaceInput value={destination} onChange={setDestination} onPlace={(place) => placeOnMap(place, 'destination')} placeholder="Busca una dirección o lugar (auto-sugerencias)" required /></label>
                <label className="full-field">Referencia de la recogida<input value={originRefs} onChange={(event) => setOriginRefs(event.target.value)} placeholder="Ej: portón azul después del semáforo, frente a la estación" /></label>
                <label className="full-field">Referencia de la entrega<input value={destinationRefs} onChange={(event) => setDestinationRefs(event.target.value)} placeholder="Ej: recepción del tercer nivel, costado del edificio" /></label>
              </div>
              {originPoint === null && destinationPoint === null && <p className="wizard-hint">Escribe una dirección (aparecen las sugerencias al escribir) o haz clic directamente sobre el mapa.</p>}
              <MapErrorBoundary>
                <RoutePickerMap origin={originPoint} destination={destinationPoint} onChange={(point, type) => {
                  if (type === 'origin') {
                    setOriginPoint(point)
                    if (!origin.trim()) setOrigin(`Punto en mapa · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`)
                  } else {
                    setDestinationPoint(point)
                    if (!destination.trim()) setDestination(`Punto en mapa · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`)
                  }
                }} />
              </MapErrorBoundary>
              <div className="route-summary">
                <span>Distancia <b>{distanceKm.toFixed(2)} km</b></span>
                <span>Tarifa estimada <b>{formatCs(estimatedCost)}</b></span>
                {settings && <span>≈ US$ {estimatedUsd.toFixed(2)} · tasa {settings.dollarRate}</span>}
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="form-grid">
              <label>Destinatario<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Nombre de quien recibe" /></label>
              <label>Teléfono del destinatario<input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} placeholder="8XXX-XXXX" /></label>
              <p className="wizard-hint">El destinatario recibirá la notificación de entrega desde la app móvil cuando el viaje esté en curso.</p>
            </div>
          )}
          {step === 3 && (
            <div className="confirm-step">
              <div className="confirm-block"><span className="eyebrow">CLIENTE Y SERVICIO</span><h3>{client}</h3><p>{serviceType}{contactName ? ` · Contacto: ${contactName}` : ''}{contactPhone ? ` · ${contactPhone}` : ''} · {packages} paquete(s){fragile ? ' · Frágil' : ''}</p>{description && <p className="confirm-note">{description}</p>}</div>
              <div className="confirm-block"><span className="eyebrow">RUTA EN EL MAPA</span><h3>{origin}</h3><p className="route-arrow">↓</p><h3>{destination}</h3><p>{distanceKm.toFixed(2)} km en línea recta sobre Managua{(originRefs || destinationRefs) ? ` · Ref. recogida: ${originRefs || '—'} · Ref. entrega: ${destinationRefs || '—'}` : ''}</p></div>
              <div className="confirm-block"><span className="eyebrow">DESTINATARIO</span><p>{recipientName || 'Sin destinatario registrado'}{recipientPhone ? ` · ${recipientPhone}` : ''}</p></div>
              <div className="fare-box"><span>Tarifa estimada</span><strong>{formatCs(estimatedCost)}</strong><small>≈ US$ {estimatedUsd.toFixed(2)} {settings ? `· tasa ${settings.dollarRate}` : ''} · tarifa base {settings ? formatCs(settings.baseFeeCs) : ''} + {distanceKm.toFixed(2)} km × {settings?.farePerKmCs ?? 0}</small></div>
            </div>
          )}
        </div>
        <div className="modal-actions wizard-actions">
          <button type="button" className="secondary-button" onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? 'Cancelar' : 'Anterior'}</button>
          {step < 3 ? <button className="primary-button" disabled={!canNext}>Continuar <Icon name="arrowRight" size={13} /></button> : <button className="primary-button" disabled={submitting}>{submitting ? 'Guardando…' : 'Crear solicitud'}</button>}
        </div>
      </form>
    </div>
  )
}

function RoutePickerMap({ origin, destination, onChange }: { origin: LatLng | null; destination: LatLng | null; onChange: (point: LatLng, type: 'origin' | 'destination') => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const originMarkerRef = useRef<any>(null)
  const destinationMarkerRef = useRef<any>(null)
  const polylineRef = useRef<any>(null)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [activePick, setActivePick] = useState<'origin' | 'destination'>('origin')
  const activePickRef = useRef(activePick)
  activePickRef.current = activePick

  useEffect(() => {
    let cancelled = false
    setMapState('loading')
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return
        if (!maps) throw new Error('maps-unavailable')
        try {
          const map = new maps.Map(containerRef.current, {
            center: MANAGUA_CENTER,
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            gestureHandling: 'greedy',
            styles: INCOEX_MAP_STYLE,
            restriction: nicaraguaRestriction(),
          })
          mapRef.current = map
          map.addListener('click', (event: any) => {
            const point = { lat: event.latLng.lat(), lng: event.latLng.lng() }
            onChange(point, activePickRef.current)
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
    try {
      originMarkerRef.current?.setMap(null)
      destinationMarkerRef.current?.setMap(null)
      polylineRef.current?.setMap(null)
      if (origin) {
        originMarkerRef.current = new maps.Marker({
          position: origin,
          map,
          draggable: true,
          title: 'Recogida',
          icon: incoexPin(maps, '#32AAF0', 1.2),
        })
        originMarkerRef.current.addListener('dragend', (event: any) => onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() }, 'origin'))
      }
      if (destination) {
        destinationMarkerRef.current = new maps.Marker({
          position: destination,
          map,
          draggable: true,
          title: 'Destino',
          icon: incoexPin(maps, '#ef6262', 1.2),
        })
        destinationMarkerRef.current.addListener('dragend', (event: any) => onChange({ lat: event.latLng.lat(), lng: event.latLng.lng() }, 'destination'))
      }
      if (origin && destination) {
        polylineRef.current = new maps.Polyline({
          path: curvedPath(maps, origin, destination),
          map,
          strokeColor: ROUTE_COLOR,
          strokeOpacity: 0.9,
          strokeWeight: 3,
        })
        const bounds = new maps.LatLngBounds(origin, destination)
        map.fitBounds(bounds, 60)
      } else if (origin || destination) {
        map.setCenter(origin ?? destination)
        map.setZoom(14)
      }
    } catch {
      // el marcador o la ruta no se pudieron dibujar; el mapa sigue operativo
    }
    return () => {
      try {
        originMarkerRef.current?.setMap(null)
        destinationMarkerRef.current?.setMap(null)
        polylineRef.current?.setMap(null)
      } catch {
        // limpieza segura
      }
    }
  }, [origin, destination, mapState])

  return (
    <div className="map-picker">
      <div className="map-picker-toolbar">
        <span className="eyebrow">SELECCIONA LOS PUNTOS EN EL MAPA</span>
        <div className="pick-toggle">
          <button type="button" className={activePick === 'origin' ? 'active' : ''} onClick={() => setActivePick('origin')}><i className="dot blue" />Recogida</button>
          <button type="button" className={activePick === 'destination' ? 'active' : ''} onClick={() => setActivePick('destination')}><i className="dot red" />Destino</button>
        </div>
      </div>
      <div className="map-picker-canvas">
        <div ref={containerRef} className="google-map-canvas" />
        <img src="/brand/logo.png" alt="INCOEX" className="map-brand-overlay" />
        {mapState === 'loading' && <div className="map-status"><span className="map-status-card"><span className="map-spinner" />Cargando mapa…</span></div>}
        {mapState === 'error' && (
          <div className="map-status error">
            <span className="map-status-card"><strong>No se pudo cargar Google Maps</strong><small>Revisa la API key o la conexión a internet.</small><button type="button" onClick={() => { resetGoogleMapsLoader(); setAttempt((current) => current + 1) }}><Icon name="refresh" size={12} /> Reintentar</button></span>
          </div>
        )}
      </div>
      <p className="wizard-hint">Haz clic en el mapa para colocar {activePick === 'origin' ? 'la recogida' : 'el destino'} · Arrastra los marcadores para ajustar la ubicación.</p>
    </div>
  )
}

function RouteMap({ origin, destination }: { origin: LatLng; destination: LatLng }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setMapState('loading')
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return
        if (!maps) throw new Error('maps-unavailable')
        const origin0 = rationalizePoint(origin)
        const destination0 = rationalizePoint(destination)
        try {
          const map = new maps.Map(containerRef.current, {
            center: MANAGUA_CENTER,
            zoom: 12,
            disableDefaultUI: true,
            zoomControl: false,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            gestureHandling: 'greedy',
            styles: INCOEX_MAP_STYLE,
            restriction: nicaraguaRestriction(),
          })
          mapRef.current = map
          const spanLat = Math.abs(origin0.lat - destination0.lat)
          const spanLng = Math.abs(origin0.lng - destination0.lng)
          const coversWorld = spanLat > 1.2 || spanLng > 1.2
          if (coversWorld) {
            map.setCenter(MANAGUA_CENTER)
            map.setZoom(11)
          } else {
            try {
              const bounds = new maps.LatLngBounds(origin0, destination0)
              map.fitBounds(bounds, 60)
              map.setZoom(Math.min(map.getZoom() ?? 12, 13))
            } catch {
              map.setCenter({ lat: (origin0.lat + destination0.lat) / 2, lng: (origin0.lng + destination0.lng) / 2 })
              map.setZoom(12)
            }
          }
          new maps.Marker({
            position: origin0,
            map,
            title: 'Recogida',
            icon: incoexPin(maps, '#32AAF0', 1.15),
          })
          new maps.Marker({
            position: destination0,
            map,
            title: 'Destino',
            icon: incoexPin(maps, '#ef6262', 1.15),
          })
          new maps.Polyline({ path: curvedPath(maps, origin0, destination0), map, strokeColor: ROUTE_COLOR, strokeOpacity: 0.9, strokeWeight: 3.5 })
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

  return (
    <div className="route-map-wrap">
      <div ref={containerRef} className="google-map-canvas" />
      <img src="/brand/logo.png" alt="INCOEX" className="map-brand-overlay" />
      {mapState === 'loading' && <div className="map-status"><span className="map-status-card"><span className="map-spinner" />Cargando ruta…</span></div>}
      {mapState === 'error' && <div className="map-status error"><span className="map-status-card"><strong>Mapa no disponible</strong><small>Revisa la API key o la conexión.</small><button onClick={() => { resetGoogleMapsLoader(); setAttempt((current) => current + 1) }}><Icon name="refresh" size={12} /> Reintentar</button></span></div>}
    </div>
  )
}

function TripsView({ trips, clients, search, settings, finance, onNavigate, onNotice, onChanged, onDeleted }: { trips: Trip[]; clients: Client[]; search: string; settings: AppSettings | null; finance: FinanceSummary | null; onNavigate: (section: Section) => void; onNotice: (message: string) => void; onChanged: (trip: Trip) => void; onDeleted: (id: string) => void }) {
  const [detailTrip, setDetailTrip] = useState<Trip | null>(null)
  const [invoiceTrip, setInvoiceTrip] = useState<Trip | null>(null)
  const [clientDetail, setClientDetail] = useState<string | null>(null)
  const [actingTrip, setActingTrip] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pendiente' | 'En curso' | 'Completado'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | Trip['serviceType']>('all')
  const [page, setPage] = useState(1)
  const pageSize = 8
  const inCourse = trips.filter((trip) => trip.status === 'En camino' || trip.status === 'En entrega').length
  const filtered = useMemo(() => trips.filter((trip) => {
    const matchesSearch = `${trip.id} ${trip.client} ${trip.driver} ${trip.origin} ${trip.destination}`.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'En curso' ? trip.status === 'En camino' || trip.status === 'En entrega' || trip.status === 'Asignado' : trip.status === statusFilter)
    const matchesType = typeFilter === 'all' || (trip.serviceType ?? 'Urbano') === typeFilter
    return matchesSearch && matchesStatus && matchesType
  }), [trips, search, statusFilter, typeFilter])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = useMemo(() => {
    const safePage = Math.min(page, pageCount)
    return filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  }, [filtered, page, pageCount])
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
  async function anularTrip(trip: Trip) {
    if (!window.confirm(`¿Anular el viaje ${trip.id} de ${trip.client}? No se elimina: queda registrado como anulado y no cuenta en ingresos ni en reportes. El conductor asignado quedará libre.`)) return
    setActingTrip(trip.id)
    try {
      const updated = await updateTripStatus(trip.id, 'Anulado')
      onChanged(updated)
      if (detailTrip?.id === trip.id) setDetailTrip(updated)
      onNotice(`Viaje ${trip.id} anulado · queda en el historial sin valor económico`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      onNotice(message || `No se pudo anular ${trip.id}; reintenta en un momento`)
    } finally {
      setActingTrip('')
    }
  }
  const avgFuelPerKm = finance?.fleet.avgFuelPerKmCs ?? 0
  const fuelOf = (trip: Trip) => (trip.distanceKm ?? 0) * avgFuelPerKm
  return <>    <section className="panel table-panel"><div className="table-toolbar"><div className="filter-row"><button className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => { setStatusFilter('all'); setPage(1) }}>Todas <b>{trips.length}</b></button><button className={`filter-chip ${statusFilter === 'Pendiente' ? 'active' : ''}`} onClick={() => { setStatusFilter('Pendiente'); setPage(1) }}>Pendientes <b>{trips.filter((trip) => trip.status === 'Pendiente').length}</b></button><button className={`filter-chip ${statusFilter === 'En curso' ? 'active' : ''}`} onClick={() => { setStatusFilter('En curso'); setPage(1) }}>En curso <b>{inCourse}</b></button><button className={`filter-chip ${statusFilter === 'Completado' ? 'active' : ''}`} onClick={() => { setStatusFilter('Completado'); setPage(1) }}>Completadas <b>{trips.filter((trip) => trip.status === 'Completado').length}</b></button></div><select className="mini-select type-filter" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value as typeof typeFilter); setPage(1) }} title="Filtrar por tipo de servicio"><option value="all">Todos los servicios</option><option value="Urbano">Urbano</option><option value="Express">Express</option><option value="Programado">Programado</option></select></div><DataTable className="trips-table" rowClassName={(_row, index) => ['Cancelado', 'Anulado'].includes(visible[index]?.status ?? '') ? 'row-off' : ''} columns={['ID', 'Cliente', 'Conductor', 'Origen', 'Destino', 'Fecha', 'Paq.', 'Dist. (km)', 'Tarifa', 'Estado', 'Acciones']} rows={visible.map((trip) => [<strong className="linkish" key={`${trip.id}-id`}>{trip.id}</strong>, <button className="client-name-btn" key={`${trip.id}-client`} onClick={() => setClientDetail(trip.client)} title="Ver detalle del cliente: viajes y montos">{trip.client}</button>, <span className={trip.driver === 'Sin asignar' ? 'muted' : ''} key={`${trip.id}-driver`}>{trip.driver}</span>, trip.origin, trip.destination, trip.date, trip.packages, trip.distanceKm !== undefined ? trip.distanceKm.toFixed(1) : '—', <span key={`${trip.id}-fare`}>{trip.estimatedCostCs !== undefined ? <><b>{formatCs(trip.estimatedCostCs)}</b><small className="cell-sub">{trip.serviceType ?? 'Urbano'}</small></> : '—'}</span>, <ProfitChip key={`${trip.id}-profit`} trip={trip} />, <StatusPill key={`${trip.id}-status`} status={trip.status} />, <div className="action-group" key={`${trip.id}-actions`}><button title="Ver detalle" onClick={() => setDetailTrip(trip)}><Icon name="eye" size={14} /></button><button title="Ver en el mapa" onClick={() => onNavigate('tracking')}><Icon name="tracking" size={14} /></button><button title="Ver y descargar factura PDF" onClick={() => setInvoiceTrip(trip)}><Icon name="fileText" size={14} /></button><button title="Anular viaje (no se elimina; queda invalidado)" disabled={actingTrip === trip.id || trip.status == 'Anulado' || trip.status == 'Cancelado'} onClick={() => void anularTrip(trip)}><Icon name="close" size={14} /></button></div>])} /><div className="table-footer"><span>Mostrando {visible.length} de {filtered.length} viajes · clic en Cliente abre su resumen · factura PDF por viaje · anular invalida sin borrar</span><TablePagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div></section>
    {detailTrip && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailTrip(null) }}>
        <div className="modal-card trip-detail-modal">
          <div className="modal-header"><div><span className="eyebrow">Detalle del viaje · {detailTrip.id}</span><h2>{detailTrip.client}</h2><p>{detailTrip.origin} → {detailTrip.destination}</p></div><button type="button" className="icon-button" onClick={() => setDetailTrip(null)} aria-label="Cerrar">×</button></div>
          <div className="trip-detail-grid">
            <div className="trip-detail-field"><span>Conductor</span><strong>{detailTrip.driver}</strong></div>
            <div className="trip-detail-field"><span>Fecha</span><strong>{detailTrip.date}</strong></div>
            <div className="trip-detail-field"><span>Paquetes</span><strong>{detailTrip.packages}</strong></div>
            <div className="trip-detail-field"><span>Tipo de servicio</span><strong>{detailTrip.serviceType ?? 'Urbano'}</strong></div>
            <div className="trip-detail-field"><span>Estado actual</span><StatusPill status={detailTrip.status} /></div>
            <div className="trip-detail-field"><span>Tarifa estimada</span><strong>{detailTrip.estimatedCostCs !== undefined ? `${formatCs(detailTrip.estimatedCostCs)}${settings ? ` · US$ ${csToUsd(detailTrip.estimatedCostCs, settings.dollarRate).toFixed(2)}` : ''}` : '—'}</strong></div>
            <div className="trip-detail-field"><span>Resultado del viaje</span><ProfitChip trip={detailTrip} /></div>
            {detailTrip.costCs !== undefined && detailTrip.costCs > 0 && <div className="trip-detail-field"><span>Costo de operación</span><strong>{formatCs(detailTrip.costCs)}<small className="cell-sub">combustible + desgaste estimado</small></strong></div>}
          </div>
          {(detailTrip.contactName || detailTrip.contactPhone || detailTrip.recipientName) && (
            <div className="trip-detail-grid compact">
              {detailTrip.contactName && <div className="trip-detail-field"><span>Contacto</span><strong>{detailTrip.contactName}</strong></div>}
              {detailTrip.contactPhone && <div className="trip-detail-field"><span>Tel. contacto</span><strong>{detailTrip.contactPhone}</strong></div>}
              {detailTrip.recipientName && <div className="trip-detail-field"><span>Destinatario</span><strong>{detailTrip.recipientName}{detailTrip.recipientPhone ? ` · ${detailTrip.recipientPhone}` : ''}</strong></div>}
            </div>
          )}
          {detailTrip.fragile && <p className="trip-detail-note"><b>Carga frágil</b> — manejo cuidadoso requerido.</p>}
          {detailTrip.description && <p className="trip-detail-note">{detailTrip.description}</p>}
          {Number.isFinite(detailTrip.originLat) && Number.isFinite(detailTrip.destinationLat) && (
            <div className="trip-route-map">
              <RouteMap origin={{ lat: detailTrip.originLat!, lng: detailTrip.originLng! }} destination={{ lat: detailTrip.destinationLat!, lng: detailTrip.destinationLng! }} />
              <span className="route-distance">{detailTrip.distanceKm?.toFixed(2) ?? '—'} km</span>
            </div>
          )}
          <div className="trip-detail-grid compact margin-strip">
            {detailTrip.estimatedCostCs !== undefined && <><div className="trip-detail-field"><span>Distancia</span><strong>{(detailTrip.distanceKm ?? 0).toFixed(1)} km</strong></div><div className="trip-detail-field"><span>Combustible est.</span><strong>{formatCs(fuelOf(detailTrip))}</strong></div><div className="trip-detail-field"><span>Margen est.</span><strong>{formatCs(detailTrip.estimatedCostCs - fuelOf(detailTrip))}</strong></div></>}
            <div className="trip-detail-field"><span>Factura</span><button className="primary-mini invoice-trigger" onClick={() => setInvoiceTrip(detailTrip)}><Icon name="fileText" size={13} /> Ver factura PDF</button></div>
          </div>
          {(detailTrip.originRefs || detailTrip.destinationRefs) && (
            <div className="trip-detail-grid compact margin-strip">
              {detailTrip.originRefs && <div className="trip-detail-field"><span>Referencia recogida</span><strong>{detailTrip.originRefs}</strong></div>}
              {detailTrip.destinationRefs && <div className="trip-detail-field"><span>Referencia entrega</span><strong>{detailTrip.destinationRefs}</strong></div>}
            </div>
          )}
          <PaymentBlock trip={detailTrip} acting={actingTrip === detailTrip.id} onSaved={onChanged} onNotice={onNotice} />
          <div className="modal-actions trip-actions">
            {detailTrip.status === 'Pendiente' && <button className="primary-button" onClick={() => { setDetailTrip(null); onNavigate('assignment') }}><Icon name="assignment" size={13} /> Asignar conductor</button>}
            {detailTrip.status === 'Asignado' && <button className="primary-button" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'En camino')}>{actingTrip === detailTrip.id ? 'Actualizando…' : 'Marcar en camino'}</button>}
            {detailTrip.status === 'En camino' && <button className="primary-button" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'En entrega')}>{actingTrip === detailTrip.id ? 'Actualizando…' : 'Marcar en entrega'}</button>}
            {detailTrip.status === 'En entrega' && <button className="primary-button" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'Completado')}>{actingTrip === detailTrip.id ? 'Actualizando…' : 'Confirmar entrega'}</button>}
            {!['Completado', 'Cancelado', 'Anulado'].includes(detailTrip.status) && <button className="secondary-button danger" disabled={actingTrip === detailTrip.id} onClick={() => void changeStatus(detailTrip, 'Cancelado')}>Cancelar viaje</button>}
            {!['Cancelado', 'Anulado'].includes(detailTrip.status) && <button className="secondary-button danger" disabled={actingTrip === detailTrip.id} onClick={() => void anularTrip(detailTrip)}>Anular viaje</button>}
            <button className="secondary-button" onClick={() => { const client = clients.find((candidate) => candidate.name === detailTrip.client); const link = waLink(client?.whatsapp || client?.phone, `Hola ${detailTrip.client}, le saludamos de INCOEX Logística. Su envío ${detailTrip.id} (${detailTrip.origin} → ${detailTrip.destination}) se encuentra en estado: ${detailTrip.status}. Puede consultar su ubicación en ${window.location.origin}/track/${encodeURIComponent(detailTrip.id)}`); if (link) window.open(link, '_blank'); else onNotice('El cliente no tiene teléfono registrado para WhatsApp') }}><Icon name="whatsapp" size={13} /> Notificar por WhatsApp</button>
            <button className="secondary-button" onClick={() => { setDetailTrip(null); onNavigate('tracking') }}><Icon name="tracking" size={13} /> Ver tracking</button>
          </div>
        </div>
      </div>
    )}
    {invoiceTrip && <InvoiceModal trip={invoiceTrip} client={clients.find((client) => client.name === invoiceTrip.client)} settings={settings} finance={finance} onClose={() => setInvoiceTrip(null)} onSaved={(updated) => { onChanged(updated); setInvoiceTrip(updated) }} onNotice={onNotice} />}
    {clientDetail && <ClientDetailModal clientName={clientDetail} client={clients.find((client) => client.name === clientDetail)} trips={trips} onClose={() => setClientDetail(null)} onInvoice={(trip) => { setInvoiceTrip(trip); setClientDetail(null) }} onWhatsApp={(phone, message) => { const link = waLink(phone, message); if (link) window.open(link, '_blank'); else onNotice('El cliente no tiene teléfono registrado para WhatsApp') }} />}
  </>
}

function InvoiceModal({ trip, client, settings, finance, onClose, onSaved, onNotice }: { trip: Trip; client: Client | undefined; settings: AppSettings | null; finance: FinanceSummary | null; onClose: () => void; onSaved: (trip: Trip) => void; onNotice: (message: string) => void }) {
  const invoiceNumber = `FAC-${trip.id.replace('#', '')}`
  const totalCs = trip.estimatedCostCs ?? 0
  const [fareDraft, setFareDraft] = useState(totalCs)
  const [savingFare, setSavingFare] = useState(false)
  const fuelCost = (trip.distanceKm ?? 0) * (finance?.fleet.avgFuelPerKmCs ?? 0)
  const marginCs = totalCs - fuelCost
  const anulada = trip.status === 'Anulado' || trip.status === 'Cancelado'
  async function saveFare() {
    setSavingFare(true)
    try {
      const updated = await updateTripFare(trip.id, fareDraft)
      onSaved(updated)
      onNotice(`${trip.id}: tarifa ajustada a ${formatCs(fareDraft)}`)
    } catch {
      onNotice('No se pudo ajustar la tarifa; revisa la conexión')
    } finally {
      setSavingFare(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card trip-detail-modal invoice-card">
        <div className="invoice-paper">
          <div className="invoice-brand-row"><img src="/brand/logo.png" alt="INCOEX" className="invoice-logo" /><div className="invoice-brand"><strong>INCOEX</strong><span>Logistics · Managua<span>{settings ? ` · ${settings.companyPhone}` : ''}</span></span></div></div>
          {anulada && <span className="invoice-stamp">ANULADA</span>}
          {trip.status === 'Completado' ? <span className="invoice-stamp paid">FACTURADO</span> : trip.status === 'En entrega' ? <span className="invoice-stamp soft">EN ENTREGA</span> : null}
          <div className="invoice-head-row">
            <div><span className="eyebrow">COMPROBANTE OPERATIVO</span><h2>Factura {invoiceNumber}</h2><p>Solicitud {trip.id} · {trip.date} · {trip.status}</p></div>
            <div className="invoice-amount"><small>Total</small><b>{formatCs(totalCs)}</b>{settings && <span>US$ {csToUsd(totalCs, settings.dollarRate).toFixed(2)}</span>}</div>
          </div>
          <div className="invoice-client">
            <span className="eyebrow">CLIENTE</span>
            <h3>{trip.client}</h3>
            {client && <p>{[client.phone, client.email, client.taxId ? `RUC ${client.taxId}` : '', client.address ? `Dirección: ${client.address}` : ''].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="invoice-items">
            <div className="invoice-item head"><span>Concepto</span><span>Detalle</span><span>Valor</span></div>
            <div className="invoice-item"><span>Servicio {trip.serviceType ?? 'Urbano'}</span><span>{trip.origin} → {trip.destination}</span><span>{formatCs(totalCs)}</span></div>
            {trip.packages > 0 && <div className="invoice-item"><span>Paquetes</span><span>{trip.packages} bultos</span><span>—</span></div>}
            {(trip.distanceKm ?? 0) > 0 && <div className="invoice-item"><span>Distancia</span><span>{(trip.distanceKm ?? 0).toFixed(2)} km</span><span>—</span></div>}
            {trip.driver !== 'Sin asignar' && <div className="invoice-item"><span>Conductor</span><span>{trip.driver}</span><span>—</span></div>}
            {trip.contactName && <div className="invoice-item"><span>Contacto</span><span>{trip.contactName}{trip.contactPhone ? ` · ${trip.contactPhone}` : ''}</span><span>—</span></div>}
          </div>
          <div className="invoice-totals">
            <div><span>Subtotal</span><b>{formatCs(totalCs)}{settings ? ` (US$ ${csToUsd(totalCs, settings.dollarRate).toFixed(2)})` : ''}</b></div>
            <div><span>Combustible estimado</span><b>{formatCs(fuelCost)}</b></div>
            <div><span>Margen bruto est.</span><b>{formatCs(marginCs)}</b></div>
            <div className="invoice-total"><span>Total a facturar</span><b>{formatCs(totalCs)}{settings ? ` (US$ ${csToUsd(totalCs, settings.dollarRate).toFixed(2)})` : ''}</b></div>
          </div>
          <div className="invoice-fare-strip">
            <span>Ajustar tarifa al facturar</span>
            <NumInput min={0} value={fareDraft} onChange={setFareDraft} />
            <button className="primary-mini" disabled={savingFare || fareDraft === totalCs} onClick={() => void saveFare()}>{savingFare ? 'Guardando…' : 'Guardar tarifa'}</button>
          </div>
          <p className="invoice-note-small">Documento interno INCOEX Logistics · generado el {new Date().toLocaleString('es-NI')} · {settings?.companyPhone ?? ''} · {settings?.companyEmail ?? ''}</p>
        </div>
        <div className="modal-actions trip-actions">
          <button className="secondary-button" onClick={onClose}>Cerrar</button>
          <button className="primary-button" onClick={() => openInvoicePrint({ ...trip, estimatedCostCs: fareDraft }, client, settings, finance)}><Icon name="download" size={13} /> Descargar PDF</button>
        </div>
      </div>
    </div>
  )
}

async function openInvoicePrint(trip: Trip, client: Client | undefined, settings: AppSettings | null, finance: FinanceSummary | null) {
  const windowRef = window.open('', '_blank', 'width=920,height=820')
  if (!windowRef) return
  let logo = ''
  try {
    const response = await fetch('/brand/logo.png')
    const blob = await response.blob()
    logo = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob) })
  } catch { /* la factura se imprime sin logo si falla la carga */ }
  const invoiceNumber = `FAC-${trip.id.replace('#', '')}`
  const fuelCost = (trip.distanceKm ?? 0) * (finance?.fleet.avgFuelPerKmCs ?? 0)
  const totalCs = trip.estimatedCostCs ?? 0
  const marginCs = totalCs - fuelCost
  const usd = settings ? ` / US$ ${csToUsd(totalCs, settings.dollarRate).toFixed(2)}` : ''
  const anulada = trip.status === 'Anulado' || trip.status === 'Cancelado'
  const clientLine = client ? [client.phone, client.email, client.taxId ? `RUC ${client.taxId}` : ''].filter(Boolean).join(' · ') : ''
  const emitterLine = settings ? [settings.companyPhone, settings.companyEmail, settings.companyAddress].filter(Boolean).join(' · ') : ''
  const logoImg = logo ? `<img src="${logo}" alt="INCOEX" style="height:46px;margin-right:14px"/>` : '<div class="brand">INCOEX</div>'
  windowRef.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${invoiceNumber}</title><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #20304f; padding: 30px 40px; background: #ffffff; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #32AAF0; padding-bottom: 14px; }
    .brand { font-size: 24px; font-weight: 800; letter-spacing: .16em; color: #0d75b3; } .brand span { display: block; color: #6e6a78; font-size: 11px; letter-spacing: .04em; }
    .meta { text-align: right; } .meta h1 { font-size: 20px; color: #0d75b3; } .meta p { color: #6e6a78; font-size: 12px; margin-top: 3px; }
    .stamp { position: absolute; right: 46px; top: 120px; transform: rotate(-11deg); border: 3px solid #dc3434; color: #dc3434; font-size: 26px; font-weight: 800; letter-spacing: .3em; padding: 8px 26px; border-radius: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 20px 0 16px; }
    .box { border: 1px solid #e3eaf6; border-radius: 9px; padding: 13px 15px; background: #fafcff; }
    .box small { display: block; color: #93a1b8; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; margin-bottom: 5px; }
    .box b { font-size: 14px; } .box em { font-size: 11px; color: #7e8ca3; font-style: normal; }
    table { width: 100%; border-collapse: collapse; margin: 6px 0 16px; font-size: 13px; }
    th { text-align: left; background: #f2f5fa; border-bottom: 2px solid #dbe5f6; padding: 9px 11px; color: #4a5b75; }
    td { border-bottom: 1px solid #eef2f8; padding: 9px 11px; }
    .totals { margin-left: auto; width: 320px; margin-top: 4px; }
    .totals div { display: flex; justify-content: space-between; padding: 7px 11px; font-size: 13px; color: #5b6b84; }
    .totals .total { border-top: 2px solid #32AAF0; font-weight: 800; font-size: 15px; color: #262038; }
    .totals .total b { color: #0d75b3; }
    .footer { margin-top: 26px; padding-top: 12px; border-top: 1px solid #e3eaf4; color: #93a1b8; font-size: 10.5px; text-align: center; }
    .footer strong { color: #5b6b84; }
  </style></head><body>
    <div class="header">${logoImg}<div class="meta"><h1>FACTURA ${invoiceNumber}</h1><p>Solicitud ${trip.id} · ${trip.date} · ${trip.status}</p></div></div>
    ${anulada ? '<div class="stamp">ANULADA</div>' : ''}
    <div class="grid">
      <div class="box"><small>Cliente</small><b>${trip.client}</b>${clientLine ? `<br/><em>${clientLine}</em>` : ''}</div>
      <div class="box"><small>Servicio</small><b>${trip.serviceType ?? 'Urbano'} · ${trip.origin} → ${trip.destination}</b><br/><em>${trip.packages > 0 ? `${trip.packages} paquetes · ` : ''}${(trip.distanceKm ?? 0).toFixed(2)} km · ${trip.driver}</em></div>
    </div>
    <table><thead><tr><th>Concepto</th><th>Detalle</th><th>Valor</th></tr></thead><tbody>
      <tr><td>Servicio de transporte</td><td>${trip.origin} → ${trip.destination}</td><td>${formatCs(totalCs)}${usd}</td></tr>
      ${trip.contactName ? `<tr><td>Contacto</td><td>${trip.contactName}${trip.contactPhone ? ` · ${trip.contactPhone}` : ''}</td><td>—</td></tr>` : ''}
      ${trip.packages > 0 ? `<tr><td>Paquetes</td><td>${trip.packages} bultos · ${(trip.distanceKm ?? 0).toFixed(1)} km</td><td>—</td></tr>` : ''}
    </tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><b>${formatCs(totalCs)}${usd}</b></div>
      <div><span>Combustible estimado</span><b>${formatCs(fuelCost)}</b></div>
      <div><span>Margen bruto estimado</span><b>${formatCs(marginCs)}</b></div>
      <div class="total"><span>TOTAL</span><b>${formatCs(totalCs)}${usd}</b></div>
    </div>
    <div class="footer"><strong>INCOEX Logistics · Managua</strong><br/>${emitterLine}<br/>Documento interno generado el ${new Date().toLocaleString('es-NI')} · guarda el PDF desde el diálogo de impresión</div>
    <script>window.onload = function () { window.print() }</script>
  </body></html>`)
  windowRef.document.close()
}

function ClientDetailModal({ clientName, client, trips, onClose, onInvoice, onWhatsApp }: { clientName: string; client: Client | undefined; trips: Trip[]; onClose: () => void; onInvoice: (trip: Trip) => void; onWhatsApp?: (phone: string | undefined, message: string) => void }) {
  const [tab, setTab] = useState<'info' | 'trips' | 'services' | 'billing'>('info')
  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const clientTrips = trips.filter((trip) => trip.client === clientName).sort((a, b) => a.date < b.date ? 1 : -1)
  const completed = clientTrips.filter((trip) => trip.status === 'Completado')
  const incomeCs = completed.reduce((sum, trip) => sum + (trip.estimatedCostCs ?? 0), 0)
  const km = clientTrips.reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0)

  useEffect(() => {
    let active = true
    if (client?.id) {
      getClientProfile(client.id).then((data) => { if (active) setProfile(data) }).catch(() => {})
    }
    return () => { active = false }
  }, [client?.id])

  const stats = profile?.stats
  const billing = profile?.billing
  const totalToShow = profile?.trips?.length ?? clientTrips.length
  const tripsToShow = profile?.trips ?? clientTrips.slice(0, 20)

  const sendWhatsApp = (message: string) => {
    if (onWhatsApp) onWhatsApp(profile?.client?.whatsapp || client?.phone || client?.whatsapp, message)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card trip-detail-modal">
        <div className="modal-header"><div><span className="eyebrow">Perfil del cliente · {clientName}</span><h2>{clientName}</h2><p>{client ? [client.phone, client.email, client.taxId ? `RUC ${client.taxId}` : '', client.contact ? `Atención: ${client.contact}` : ''].filter(Boolean).join(' · ') : 'cliente sin ficha completa en la API'}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="client-summary-grid">
          <div><span>Viajes con INCOEX</span><strong>{stats?.totalTrips ?? clientTrips.length}</strong></div>
          <div><span>Completados</span><strong>{stats?.completedTrips ?? completed.length}</strong></div>
          <div><span>Ingresos generados</span><strong>{formatCs(incomeCs)}</strong></div>
          <div><span>Saldo pendiente</span><strong className={billing && billing.pending > 0 ? 'text-danger' : ''}>{billing ? formatCs(billing.pending) : formatCs(incomeCs)}</strong></div>
        </div>
        <div className="client-tabs">
          {([['info', 'Información'], ['trips', `Viajes (${totalToShow})`], ['services', 'Servicios'], ['billing', 'Facturación']] as Array<[typeof tab, string]>).map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? 'client-tab active' : 'client-tab'} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div className="client-tab-body">
          {tab === 'info' && (
            <div className="client-info-grid">
              <div><span>Tipo</span><strong>{client?.type || '—'}</strong></div>
              <div><span>Teléfono</span><strong>{client?.phone || '—'}</strong></div>
              <div><span>Correo</span><strong>{client?.email || '—'}</strong></div>
              <div><span>Dirección</span><strong>{client?.address || '—'}</strong></div>
              <div><span>Persona de contacto</span><strong>{client?.contact || '—'}</strong></div>
              <div><span>RUC</span><strong>{client?.taxId || '—'}</strong></div>
              <div><span>Crédito</span><strong>{client?.creditDays ? `${client.creditDays} días` : '—'}</strong></div>
              <div><span>Ciclo de facturación</span><strong>{client?.billingPeriod || '—'}</strong></div>
              <div><span>WhatsApp</span><strong>{client?.whatsapp || client?.phone || '—'}</strong></div>
              {client?.notes && <div className="client-notes"><span>Notas</span><strong>{client.notes}</strong></div>}
              {onWhatsApp && <button type="button" className="secondary-button" style={{ gridColumn: '1 / -1', justifySelf: 'start' }} onClick={() => sendWhatsApp(`Hola ${clientName}, le saludamos de INCOEX Logística. Le recordamos que puede consultar sus envíos y saldos directamente con nosotros.`)}><Icon name="whatsapp" size={14} /> Contactar por WhatsApp</button>}
            </div>
          )}
          {tab === 'trips' && (
            totalToShow === 0 ? <p className="trip-detail-note">Este cliente no tiene viajes registrados todavía.</p> : (
              <div className="client-trip-list">
                <div className="client-trip-list-head"><span>Viaje</span><span>Fecha</span><span>Ruta</span><span>Servicio</span><span>Tarifa</span><span>Pago</span><span>Estado</span><span /></div>
                {tripsToShow.map((trip) => (
                  <div className="client-trip-row" key={trip.id}><strong>{trip.id}</strong><span>{trip.date}</span><span>{trip.origin} → {trip.destination}</span><span>{trip.serviceType || 'Urbano'}</span><span>{trip.costCs !== undefined ? formatCs(trip.costCs) : '—'}</span><span className={trip.paymentStatus === 'Pagado' ? 'text-success' : 'text-warn'}>{trip.paymentStatus || 'Sin pagar'}</span><StatusPill status={trip.status as TripStatus} /><button title="Ver factura" onClick={() => onInvoice({ ...trip, estimatedCostCs: trip.costCs } as Trip)}><Icon name="fileText" size={13} /></button></div>
                ))}
              </div>
            )
          )}
          {tab === 'services' && (
            <div className="client-services">
              {(profile?.services?.length ?? 0) === 0 && <p className="trip-detail-note">Sin servicios registrados.</p>}
              {(profile?.services ?? []).map((service) => (
                <div className="client-service-card" key={service.type}>
                  <span className="client-service-name">{service.type}</span>
                  <span><strong>{service.count}</strong> envíos</span>
                  <span><strong>{formatCs(service.total)}</strong> generados</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'billing' && (
            <div className="client-billing">
              <div className="client-billing-summary">
                <div><span>Facturado</span><strong>{formatCs(billing?.invoiced ?? incomeCs)}</strong></div>
                <div><span>Pagado</span><strong>{formatCs(billing?.paid ?? 0)}</strong></div>
                <div><span>Pendiente</span><strong className={billing && billing.pending > 0 ? 'text-danger' : ''}>{formatCs(billing?.pending ?? incomeCs)}</strong></div>
              </div>
              {(billing?.unpaidTrips?.length ?? 0) === 0 ? <p className="trip-detail-note">Sin saldos pendientes.</p> : (
                <div className="client-trip-list">
                  <div className="client-trip-list-head"><span>Viaje</span><span>Fecha</span><span>Ruta</span><span>Monto</span><span>Estado pago</span><span>Vence</span></div>
                  {(billing?.unpaidTrips ?? []).map((item) => (
                    <div className="client-trip-row" key={item.id}><strong>{item.id}</strong><span>{item.date}</span><span>{item.origin} → {item.destination}</span><span>{formatCs(item.costCs)}</span><span className="text-warn">{item.paymentStatus}</span><span>{item.dueDate || '—'}</span></div>
                  ))}
                </div>
              )}
              {onWhatsApp && (billing?.pending ?? 0) > 0 && (
                <button type="button" className="secondary-button" style={{ marginTop: 12 }} onClick={() => sendWhatsApp(`Hola ${clientName}, le saludamos de INCOEX Logística. Su saldo pendiente es de ${formatCs(billing?.pending ?? 0)}. Agradecemos su pronto pago.`)}><Icon name="whatsapp" size={14} /> Recordatorio de saldo por WhatsApp</button>
              )}
            </div>
          )}
        </div>
        <div className="modal-actions trip-actions"><button className="secondary-button" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  )
}

function PaymentBlock({ trip, acting, onSaved, onNotice }: { trip: Trip; acting: boolean; onSaved: (trip: Trip) => void; onNotice: (message: string) => void }) {
  const [method, setMethod] = useState<Trip['paymentMethod']>(trip.paymentMethod ?? '')
  const [ref, setRef] = useState(trip.paymentRef ?? '')
  const [amount, setAmount] = useState(trip.paymentAmount ?? 0)
  const [date, setDate] = useState('')
  const saved = trip.paymentStatus ?? 'Sin pagar'
  const dueDate = trip.dueDate ?? ''
  const isFinancing = (method || trip.paymentMethod) === 'Financiamiento'

  async function savePayment() {
    try {
      const formattedDate = date ? new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`)) : (trip.paymentDate ?? undefined)
      const updated = await updateTripPayment(trip.id, {
        method: method ?? undefined,
        ref: ref.trim() || undefined,
        amount,
        date: formattedDate,
      })
      onSaved(updated)
      onNotice(`${trip.id}: pago registrado como ${updated.paymentStatus}`)
    } catch {
      onNotice('No se pudo registrar el pago; revisa la conexión con la API')
    }
  }

  return (
    <div className="payment-strip">
      <div className="payment-strip-head">
        <span className="payment-title"><Icon name="wallet" size={13} /> Pago del viaje</span>
        <span className={`payment-chip ${saved.toLowerCase()}`}>{saved === 'Sin pagar' ? 'Sin pago' : saved}</span>
        {dueDate && <span className="payment-due"><Icon name="calendar" size={11} /> Cobro: {dueDate}</span>}
      </div>
      {saved === 'Pagado' && <p className="payment-detail">Pagado {trip.paymentMethod ? `por ${trip.paymentMethod}` : ''}{trip.paymentRef ? ` · ${trip.paymentRef}` : ''} {trip.paymentDate ? `el ${trip.paymentDate}` : ''} · {formatCs(trip.paymentAmount ?? 0)}</p>}
      {saved === 'Parcial' && <p className="payment-detail">Pago parcial {trip.paymentMethod ? `por ${trip.paymentMethod}` : ''}{trip.paymentRef ? ` · ${trip.paymentRef}` : ''} {trip.paymentDate ? `el ${trip.paymentDate}` : ''} · {formatCs(trip.paymentAmount ?? 0)}</p>}
      {isFinancing && saved === 'Sin pagar' && <p className="payment-detail">Financiamiento asignado: se cobrará en {dueDate || 'la fecha pactada'}, ya se registró su factura.</p>}
      <div className="payment-form">
        <select value={method} onChange={(event) => setMethod(event.target.value as Trip['paymentMethod'])} title="Método de pago">
          <option value="">Método de pago…</option>
          <option>Efectivo</option>
          <option>Transferencia</option>
          <option>Financiamiento</option>
          <option>Contra entrega</option>
        </select>
        {method === 'Transferencia' && <input value={ref} onChange={(event) => setRef(event.target.value)} placeholder="Cuenta o referencia de la transferencia" />}
        {method !== 'Transferencia' && <input value={ref} onChange={(event) => setRef(event.target.value)} placeholder={method === 'Efectivo' ? 'Referencia o comprobante' : 'Detalle del acuerdo'} />}
        <NumInput min={0} value={amount} onChange={setAmount} placeholder="Monto" />
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} title="Fecha del pago" />
        <button className="primary-mini" disabled={acting || (method ?? '') === ''} onClick={() => void savePayment()}>Registrar pago</button>
      </div>
    </div>
  )
}


function RequestsAssignmentView({ trips, drivers, initialTab, onNavigate, onAssigned, onNotice }: { trips: Trip[]; drivers: Driver[]; initialTab: 'solicitudes' | 'asignacion'; onNavigate: (section: Section) => void; onAssigned: (trip: Trip) => void; onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<'solicitudes' | 'asignacion'>(initialTab)
  return <>
    <div className="report-tabs" style={{ margin: '0 0 12px' }}>
      <button className={`filter-chip ${tab === 'solicitudes' ? 'active' : ''}`} onClick={() => setTab('solicitudes')}>Solicitudes <b>{trips.filter((trip) => trip.status === 'Pendiente').length}</b></button>
      <button className={`filter-chip ${tab === 'asignacion' ? 'active' : ''}`} onClick={() => setTab('asignacion')}>Asignación de conductores</button>
    </div>
    {tab === 'solicitudes' && <RequestsView trips={trips} onNavigate={onNavigate} />}
    {tab === 'asignacion' && <AssignmentView trips={trips} drivers={drivers} onAssigned={onAssigned} onNotice={onNotice} />}
  </>
}

function RequestsView({ trips, onNavigate }: { trips: Trip[]; onNavigate: (section: Section) => void }) {
  const pending = trips.filter((trip) => trip.status === 'Pendiente')
  return <div className="request-grid">{pending.map((trip) => <article className="panel request-card" key={trip.id}><div className="request-head"><span className="status-pill pendiente">Pendiente</span><strong>Solicitud {trip.id}</strong></div><h2>{trip.client}</h2><div className="route-detail"><span><b>RECOGIDA</b>{trip.origin}</span><span><b>DESTINO</b>{trip.destination}</span></div><div className="request-meta">{trip.date} · {trip.packages} paquetes · {trip.serviceType ?? 'Urbano'} · {trip.estimatedCostCs !== undefined ? `Tarifa ${formatCs(trip.estimatedCostCs)}` : 'sin tarifa'}</div><button className="primary-button" onClick={() => onNavigate('assignment')}>Asignar conductor</button></article>)}</div>
}

function AssignmentView({ trips, drivers, onAssigned, onNotice }: { trips: Trip[]; drivers: Driver[]; onAssigned: (trip: Trip) => void; onNotice: (message: string) => void }) {
  const pending = trips.filter((trip) => trip.status === 'Pendiente')
  const [selectedId, setSelectedId] = useState<string>('')
  const [assigning, setAssigning] = useState('')
  const available = drivers.filter((driver) => driver.status === 'Disponible')
  const selectedRequest = pending.find((trip) => trip.id === selectedId) ?? pending[0] ?? null
  async function assign(driver: Driver) {
    if (!selectedRequest) return
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
  if (pending.length === 0) return <EmptyState title="Sin solicitudes pendientes" detail="La cola está al día: no hay viajes pendientes por asignar. Crea una solicitud desde Viajes → Nuevo viaje." />
  return <div className="assignment-layout"><section className="panel assignment-queue"><div className="panel-header"><div><span className="eyebrow">COLA DE SOLICITUDES</span><h2>{pending.length} pendientes por asignar</h2></div><span className="source-badge">selecciona una</span></div>{pending.map((trip) => <button className={`assignment-request ${selectedRequest?.id === trip.id ? 'selected' : ''}`} key={trip.id} onClick={() => setSelectedId(trip.id)}><span className="status-pill pendiente">Pendiente</span><strong>{trip.id} · {trip.client}</strong><small>{trip.origin} → {trip.destination} · {trip.packages} paquete(s) · {trip.serviceType ?? 'Urbano'}</small><span className="request-fare">{trip.estimatedCostCs !== undefined ? formatCs(trip.estimatedCostCs) : '—'}</span></button>)}</section><section className="panel assignment-detail"><span className="eyebrow">Solicitud seleccionada</span><h2>{selectedRequest.id} · {selectedRequest.client}</h2><p>Información del viaje recibida desde la API.</p><div className="assignment-route"><span><b>RECOGIDA</b>{selectedRequest.origin}</span><span><b>DESTINO</b>{selectedRequest.destination}</span></div><div className="assignment-load"><span>{selectedRequest.packages} paquetes</span><span>Tarifa · {selectedRequest.estimatedCostCs !== undefined ? formatCs(selectedRequest.estimatedCostCs) : '—'}</span></div></section><section className="panel assignment-list"><PanelHeader title="Asignar conductor" action={`${available.length} disponibles`} />{available.length === 0 && <EmptyState title="Sin conductores disponibles" detail="La API no reporta conductores libres en este momento. Termina viajes en curso o agrega un conductor." />}{available.map((driver) => <div className="assignment-driver" key={driver.id}><div className="driver-avatar mint">{initials(driver.name)}</div><div><strong>{driver.name}</strong><small>{driver.vehicle} · {driver.plate}</small></div><button className="primary-mini" disabled={assigning !== ''} onClick={() => void assign(driver)}>{assigning === driver.id ? 'Asignando…' : 'Asignar'}</button></div>)}</section></div>
}

function DriversView({ drivers, vehicles, onNavigate, onNotice, onDeleted, onVehicleChanged }: { drivers: Driver[]; vehicles: Vehicle[]; onNavigate: (section: Section) => void; onNotice: (message: string) => void; onDeleted: (id: string) => void; onVehicleChanged: (vehicle: Vehicle) => void }) {
  const [profileDriver, setProfileDriver] = useState<Driver | null>(null)
  const [busy, setBusy] = useState('')
  const [scopeFilter, setScopeFilter] = useState<'all' | 'own' | 'external'>('all')
  const visibleDrivers = drivers.filter((driver) => scopeFilter === 'all' || (scopeFilter === 'own' ? !driver.external : driver.external))
  async function removeDriver(driver: Driver) {
    if (!window.confirm(`¿Eliminar al conductor ${driver.name}? No podrá tener viajes activos.`)) return
    setBusy(driver.id)
    try {
      await deleteDriver(driver.id)
      onDeleted(driver.id)
      setProfileDriver(null)
      onNotice(`Conductor ${driver.name} eliminado`)
    } catch {
      onNotice(`No se pudo eliminar a ${driver.name}; revisa si tiene viajes activos`)
    } finally {
      setBusy('')
    }
  }
  async function assignVehicle(driver: Driver, vehicleId: string) {
    setBusy(`veh-${driver.id}`)
    try {
      const vehicle = vehicles.find((candidate) => candidate.id === vehicleId)
      if (!vehicle) return
      await updateDriver(driver.id, { vehicle: vehicle.model, plate: vehicle.plate, external: driver.external })
      const assigned = await assignVehicleDriver(vehicle.id, driver.name)
      onVehicleChanged(assigned)
      setProfileDriver({ ...driver, vehicle: vehicle.model, plate: vehicle.plate })
      onNotice(`${vehicle.plate} asignado a ${driver.name}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      onNotice(message || `No se pudo asignar el vehículo a ${driver.name}`)
    } finally {
      setBusy('')
    }
  }
  async function toggleExternal(driver: Driver) {
    setBusy(`ext-${driver.id}`)
    try {
      const updated = await updateDriver(driver.id, { external: !driver.external })
      setProfileDriver(updated)
      onNotice(updated.external ? `${driver.name} marcado como proveedor tercerizado` : `${driver.name} es ahora parte de la flota propia`)
    } catch {
      onNotice('No se pudo actualizar la marca de proveedor')
    } finally {
      setBusy('')
    }
  }
  return <><div className="driver-summary"><SummaryValue label="Total conductores" value={String(drivers.length)} /><SummaryValue label="Disponibles" value={String(drivers.filter((driver) => driver.status === 'Disponible').length)} tone="mint" /><SummaryValue label="Tercerizados" value={String(drivers.filter((driver) => driver.external).length)} tone="gold" /><SummaryValue label="Fuera de servicio" value={String(drivers.filter((driver) => driver.status === 'Fuera de servicio').length)} tone="slate" /></div><div className="scope-row"><span className="scope-label">PROVEEDORES</span><button className={`filter-chip ${scopeFilter === 'all' ? 'active' : ''}`} onClick={() => setScopeFilter('all')}>Todos <b>{drivers.length}</b></button><button className={`filter-chip ${scopeFilter === 'own' ? 'active' : ''}`} onClick={() => setScopeFilter('own')}>Flota propia <b>{drivers.filter((driver) => !driver.external).length}</b></button><button className={`filter-chip ${scopeFilter === 'external' ? 'active' : ''}`} onClick={() => setScopeFilter('external')}>Tercerizados <b>{drivers.filter((driver) => driver.external).length}</b></button></div><div className="drivers-grid">{visibleDrivers.map((driver, index) => <article className="driver-card" key={driver.id}><div className="driver-card-top"><div className={`driver-avatar ${['blue', 'cyan', 'violet', 'mint', 'gold', 'slate'][index % 6]}`}>{initials(driver.name)}</div><div><h3>{driver.name}</h3><p>{driver.phone}</p></div><div className="driver-badges">{driver.external && <span className="badge-external">3P</span>}<StatusPill status={driver.status} /></div></div><div className="vehicle-line"><span>VEHÍCULO</span><strong>{driver.vehicle} <em>— {driver.plate}</em></strong></div><div className="route-line"><span>RUTA / ACTIVIDAD ACTUAL</span><strong>{driver.route}</strong></div><div className="driver-actions"><button onClick={() => setProfileDriver(driver)}>Ver perfil</button><button className="primary-mini" onClick={() => onNavigate('assignment')}>Asignar viaje</button></div></article>)}</div>{profileDriver && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileDriver(null) }}>
        <div className="modal-card trip-detail-modal">
          <div className="modal-header"><div><span className="eyebrow">Perfil del conductor · {profileDriver.id}</span><h2>{profileDriver.name}</h2><p>{profileDriver.phone}</p></div><button type="button" className="icon-button" onClick={() => setProfileDriver(null)} aria-label="Cerrar">×</button></div>
          <div className="trip-detail-grid">
            <div className="trip-detail-field"><span>Estado</span><StatusPill status={profileDriver.status} /></div>
            <div className="trip-detail-field"><span>Vehículo</span><strong>{profileDriver.vehicle}</strong></div>
            <div className="trip-detail-field"><span>Placa</span><strong>{profileDriver.plate}</strong></div>
            <div className="trip-detail-field"><span>Actividad actual</span><strong>{profileDriver.route}</strong></div>
            <div className="trip-detail-field"><span>Última posición</span><strong>{profileDriver.latitude.toFixed(4)}, {profileDriver.longitude.toFixed(4)}</strong></div>
            <div className="trip-detail-field"><span>Cobertura</span><strong>{profileDriver.external ? 'Proveedor tercerizado (3P)' : 'Flota propia'}</strong></div>
          </div>
          <div className="trip-detail-grid compact margin-strip">
            <div className="trip-detail-field full"><span>Asignar vehículo (conductor → vehículo)</span>
              <select className="mini-select" value={vehicles.find((vehicle) => vehicle.plate === profileDriver.plate)?.id ?? ''} disabled={busy.startsWith('veh-')} onChange={(event) => event.target.value && void assignVehicle(profileDriver, event.target.value)} title="Elige el vehículo que usará este conductor">
                <option value="">Seleccionar vehículo…</option>
                {vehicles.map((vehicle) => <option value={vehicle.id} disabled={vehicle.driver !== 'Sin asignar' && vehicle.driver !== profileDriver.name} key={vehicle.id}>{vehicle.plate} · {vehicle.model}{vehicle.driver !== 'Sin asignar' && vehicle.driver !== profileDriver.name ? ' · en uso' : ''}</option>)}
              </select>
            </div>
            <div className="trip-detail-field full check-inline"><label><input type="checkbox" checked={Boolean(profileDriver.external)} disabled={busy.startsWith('ext-')} onChange={() => void toggleExternal(profileDriver)} /> Proveedor tercerizado (vehículo y conductor de tercero)</label></div>
          </div>
          <div className="modal-actions trip-actions"><button className="secondary-button danger" disabled={busy === profileDriver.id} onClick={() => void removeDriver(profileDriver)}><Icon name="trash" size={13} /> Eliminar conductor</button><button className="secondary-button" onClick={() => { setProfileDriver(null); onNavigate('tracking') }}><Icon name="tracking" size={13} /> Ver en el mapa</button><button className="primary-button" onClick={() => { setProfileDriver(null); onNavigate('assignment') }}><Icon name="assignment" size={13} /> Asignar viaje</button></div>
        </div>
      </div>
    )}</>
}

function FuelPanel({ vehicles, onNotice }: { vehicles: Vehicle[]; onNotice: (message: string) => void }) {
  const [records, setRecords] = useState<FuelRecord[]>([])
  const [stats, setStats] = useState<FuelStatsRow[]>([])
  const [busy, setBusy] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [plate, setPlate] = useState(vehicles[0]?.plate ?? '')
  const [liters, setLiters] = useState(10)
  const [pricePerLiterCs, setPricePerLiterCs] = useState(0)
  const [odometerKm, setOdometerKm] = useState(0)
  const [note, setNote] = useState('')
  async function refresh() {
    try {
      const [rec, stat] = await Promise.all([getFuelRecords(), getFuelStats()])
      setRecords(rec)
      setStats(stat)
    } catch {
      onNotice('No se pudieron cargar los registros de combustible')
    }
  }
  useEffect(() => { void refresh() }, [])
  async function removeRecord(record: FuelRecord) {
    if (!window.confirm(`Eliminar la recarga de ${record.plate} del ${record.date} (${record.liters} L, C$ ${record.totalCs.toFixed(2)})?`)) return
    setBusy(record.id)
    try {
      await deleteFuelRecord(record.id)
      await refresh()
      onNotice('Recarga eliminada')
    } catch {
      onNotice('No se pudo eliminar la recarga')
    } finally {
      setBusy('')
    }
  }
  async function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!plate) {
      onNotice('Selecciona un vehículo')
      return
    }
    setBusy('add')
    try {
      await addFuelRecord({ plate, liters, pricePerLiterCs: pricePerLiterCs || undefined, odometerKm: odometerKm || undefined, note: note || undefined })
      setAddOpen(false)
      setLiters(10)
      setPricePerLiterCs(0)
      setOdometerKm(0)
      setNote('')
      await refresh()
      onNotice('Recarga registrada')
    } catch {
      onNotice('No se pudo registrar la recarga')
    } finally {
      setBusy('')
    }
  }
  const totalLiters = stats.reduce((sum, row) => sum + row.totalLiters, 0)
  const totalCs = stats.reduce((sum, row) => sum + row.totalCs, 0)
  return <section className="panel export-panel">
    <div className="export-panel-head">
      <div>
        <span className="eyebrow">COMBUSTIBLE POR VEHÍCULO</span>
        <h2>Control de combustible y consumo real</h2>
        <p>Registra cada carga (litros, precio al que compra ese vehículo, odómetro). Aquí se cruza el <b>concepto del tanque</b> con el <b>precio propio</b> y el <b>consumo real</b> para sacar costo por km, autonomía con un tanque lleno y presupuesto mensual.</p>
      </div>
      <div className="export-buttons">
        <button className="secondary-button" onClick={() => { void refresh() }}><Icon name="refresh" size={13} /> Actualizar</button>
        <button className="primary-button" onClick={() => setAddOpen(true)}><Icon name="plus" size={13} /> Registrar recarga</button>
      </div>
    </div>
    <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 14 }}>
      <div className="metric-card"><span className="metric-label">Recargas registradas</span><strong className="metric-value" style={{ fontSize: 22 }}>{records.length}</strong><small style={{ fontSize: 11 }}>en la operación actual</small></div>
      <div className="metric-card"><span className="metric-label">Litros totales</span><strong className="metric-value" style={{ fontSize: 22 }}>{totalLiters.toLocaleString('es-NI')}</strong><small style={{ fontSize: 11 }}>suma de todas las cargas</small></div>
      <div className="metric-card"><span className="metric-label">Gasto acumulado</span><strong className="metric-value" style={{ fontSize: 22 }}>{formatCs(totalCs)}</strong><small style={{ fontSize: 11 }}>combustible real comprado</small></div>
      <div className="metric-card"><span className="metric-label">Costo por km promedio</span><strong className="metric-value" style={{ fontSize: 22 }}>{formatCs(stats.filter((row) => row.costPerKmCs > 0).reduce((sum, row) => sum + row.costPerKmCs, 0) / Math.max(1, stats.filter((row) => row.costPerKmCs > 0).length))}</strong><small style={{ fontSize: 11 }}>por km, según datos de cada flota</small></div>
    </div>
    <div style={{ overflowX: 'auto', marginTop: 14 }}>
      <table className="trips-table" style={{ minWidth: 1050 }}>
        <thead><tr><th>Vehículo</th><th>Precio propio (C$/L)</th><th>Consumo real (L/100km)</th><th>Costo / km</th><th>Autonomía tanque</th><th>Recargas</th><th>Litros</th><th>Gasto C$</th></tr></thead>
        <tbody>
          {stats.map((row) => <tr key={row.plate} style={row.refuels === 0 ? { opacity: 0.55 } : undefined}>
            <td><b className="linkish">{row.plate}</b></td>
            <td>{row.literPriceCs > 0 ? formatCs(row.literPriceCs) : '—'}</td>
            <td>{row.realConsumptionLPer100Km > 0 ? row.realConsumptionLPer100Km + ' L/100km' : 'sin datos'}</td>
            <td><b>{formatCs(row.costPerKmCs)}</b></td>
            <td>{row.autonomyKm > 0 ? row.autonomyKm.toLocaleString('es-NI') + ' km' : '—'}</td>
            <td>{row.refuels}</td>
            <td>{row.totalLiters.toFixed(1)} L</td>
            <td>{formatCs(row.totalCs)}</td>
          </tr>)}
          {stats.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 18 }}>Sin vehículos cargados</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="export-panel-head" style={{ marginTop: 18 }}><div><span className="eyebrow">HISTORIAL DE RECARGAS</span><h2>Recargas registradas</h2></div></div>
    <div style={{ overflowX: 'auto', marginTop: 8 }}>
      <table className="trips-table" style={{ minWidth: 900 }}>
        <thead><tr><th>Fecha</th><th>Vehículo</th><th>Litros</th><th>Precio C$/L</th><th>Total C$</th><th>Odómetro</th><th>Nota</th><th /></tr></thead>
        <tbody>
          {records.map((record) => <tr key={record.id}>
            <td>{record.date}</td>
            <td><b className="linkish">{record.plate}</b></td>
            <td>{record.liters.toFixed(1)} L</td>
            <td>{formatCs(record.pricePerLiterCs)}</td>
            <td><b>{formatCs(record.totalCs)}</b></td>
            <td>{record.odometerKm.toLocaleString('es-NI')} km</td>
            <td className="muted">{record.note}</td>
            <td><div className="action-group"><button title="Eliminar recarga" disabled={busy === record.id} onClick={() => void removeRecord(record)}><Icon name="trash" size={14} /></button></div></td>
          </tr>)}
          {records.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 18 }}>Aún no hay recargas registradas</td></tr>}
        </tbody>
      </table>
    </div>
    {addOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddOpen(false) }}>
        <form className="modal-card" onSubmit={submitAdd}>
          <div className="modal-header"><div><span className="eyebrow">Combustible · Recarga</span><h2>Registrar recarga</h2><p>El costo por km y la autonomía se recalculan con el precio propio de cada vehículo.</p></div><button type="button" className="icon-button" onClick={() => setAddOpen(false)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label>Vehículo<select value={plate} onChange={(event) => setPlate(event.target.value)} required>{vehicles.map((vehicle) => <option value={vehicle.plate} key={vehicle.id}>{vehicle.plate} · {vehicle.model}</option>)}</select></label>
            <label>Litros<NumInput required min={0.1} step={1} value={liters} onChange={setLiters} /></label>
            <label>Precio por litro (C$)<NumInput min={0} step={0.5} value={pricePerLiterCs} onChange={setPricePerLiterCs} /></label>
            <label>Odómetro (km)<NumInput min={0} value={odometerKm} onChange={setOdometerKm} /></label>
            <label className="full-field">Nota<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ej: estación Texaco, factura #1234" /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAddOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy === 'add'}>{busy === 'add' ? 'Guardando…' : 'Registrar recarga'}</button></div>
        </form>
      </div>
    )}
  </section>
}

function VehiclesView({ vehicles, drivers, maintenance, settings, onNotice, onChanged, onCreated, onDeleted }: { vehicles: Vehicle[]; drivers: Driver[]; maintenance: MaintenanceRecord[]; settings: AppSettings | null; onNotice: (message: string) => void; onChanged: (vehicle: Vehicle) => void; onCreated: (vehicle: Vehicle) => void; onDeleted: (id: string) => void }) {
  const [fleetTab, setFleetTab] = useState<'flota' | 'combustible'>('flota')
  const [formOpen, setFormOpen] = useState(false)
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null)
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null)
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null)
  const [busy, setBusy] = useState('')
  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [type, setType] = useState('Panel')
  const [typeOther, setTypeOther] = useState('')
  const [capacityKg, setCapacityKg] = useState(1000)
  const [year, setYear] = useState(2024)
  const [fuelType, setFuelType] = useState<FuelType>('Gasolina')
  const [consumptionLPerKm, setConsumptionLPerKm] = useState(0.1)
  const [priceCs, setPriceCs] = useState(0)
  const [fuelPriceCs, setFuelPriceCs] = useState(0)
  const [tankCapacityL, setTankCapacityL] = useState(0)
  const [odometerKm, setOdometerKm] = useState(0)
  const [external, setExternal] = useState(false)
  const [vehicleFunction, setVehicleFunction] = useState<Vehicle['vehicleFunction']>('delivery')
  const [logistics, setLogistics] = useState('')
  const [minTripsMonth, setMinTripsMonth] = useState(100)
  const [financed, setFinanced] = useState(false)
  const [downPaymentCs, setDownPaymentCs] = useState(0)
  const [leaseStart, setLeaseStart] = useState('')
  const [leaseTermMonths, setLeaseTermMonths] = useState(60)
  const [leaseMonthlyPaymentCs, setLeaseMonthlyPaymentCs] = useState(0)
  const [residualValueCs, setResidualValueCs] = useState(0)
  const [depreciationPct, setDepreciationPct] = useState(20)
  const [maintenanceNote, setMaintenanceNote] = useState('')
  const [maintenanceCost, setMaintenanceCost] = useState(0)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [photoTargetId, setPhotoTargetId] = useState('')

  const byStatus = (status: VehicleStatus) => vehicles.filter((vehicle) => vehicle.status === status)
  const dollarRate = settings?.dollarRate ?? 36.5

  async function changeStatus(vehicle: Vehicle, status: VehicleStatus) {
    setBusy(`status-${vehicle.id}`)
    try {
      const updated = await updateVehicleStatus(vehicle.id, status)
      onChanged(updated)
      if (detailVehicle?.id === vehicle.id) setDetailVehicle(updated)
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
      const updated = await assignVehicleDriver(vehicle.id, driver)
      onChanged(updated)
      if (detailVehicle?.id === vehicle.id) setDetailVehicle(updated)
      onNotice(`${vehicle.plate} asignado a ${driver}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      onNotice(message || `No se pudo asignar el vehículo ${vehicle.plate}`)
    } finally {
      setBusy('')
    }
  }

  async function removeVehicle(vehicle: Vehicle) {
    if (!window.confirm(`¿Eliminar el vehículo ${vehicle.plate} (${vehicle.model})? Su historial de mantenimiento también se borrará.`)) return
    setBusy(`delete-${vehicle.id}`)
    try {
      await deleteVehicle(vehicle.id)
      onDeleted(vehicle.id)
      if (detailVehicle?.id === vehicle.id) setDetailVehicle(null)
      onNotice(`Vehículo ${vehicle.plate} eliminado de la flota`)
    } catch {
      onNotice(`No se pudo eliminar ${vehicle.plate}; libera primero al conductor`)
    } finally {
      setBusy('')
    }
  }

  async function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('create')
    try {
      onCreated(await createVehicle({ plate, model, type: type === 'Otro' ? typeOther || type : type, capacityKg, year, fuelType, consumptionLPerKm, priceCs, odometerKm, external, vehicleFunction, logistics, minTripsMonth, financed, downPaymentCs, leaseStart, leaseTermMonths, leaseMonthlyPaymentCs, residualValueCs, depreciationPct }))
      setFormOpen(false)
      setPlate('')
      setModel('')
      setType('Panel')
      setTypeOther('')
      setConsumptionLPerKm(0.1)
      setPriceCs(0)
      setOdometerKm(0)
      setLogistics('')
      setMinTripsMonth(100)
      setFinanced(false)
      setDownPaymentCs(0)
      setLeaseStart('')
      setLeaseTermMonths(60)
      setLeaseMonthlyPaymentCs(0)
      setResidualValueCs(0)
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
      await registerVehicleMaintenance(maintenanceVehicle.id, maintenanceNote, maintenanceCost)
      onChanged(await getVehicles().then((list) => list.find((vehicle) => vehicle.id === maintenanceVehicle.id) ?? maintenanceVehicle))
      onNotice(`Mantenimiento registrado para ${maintenanceVehicle.plate}`)
      setMaintenanceVehicle(null)
      setMaintenanceNote('')
      setMaintenanceCost(0)
    } catch {
      onNotice('No se pudo registrar el mantenimiento')
    } finally {
      setBusy('')
    }
  }

  async function submitEconomicData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editVehicle) return
    setBusy(`edit-${editVehicle.id}`)
    try {
      const updated = await updateVehicle(editVehicle.id, { fuelType, consumptionLPerKm, priceCs, fuelPriceCs: fuelPriceCs || undefined, tankCapacityL: tankCapacityL || undefined, odometerKm, external, vehicleFunction, logistics, minTripsMonth, financed, downPaymentCs, leaseStart, leaseTermMonths, leaseMonthlyPaymentCs, residualValueCs, depreciationPct })
      onChanged(updated)
      if (detailVehicle?.id === updated.id) setDetailVehicle(updated)
      onNotice(`Datos económicos de ${updated.plate} actualizados`)
      setEditVehicle(null)
    } catch {
      onNotice('No se pudieron guardar los datos económicos')
    } finally {
      setBusy('')
    }
  }

  async function uploadPhoto(file: File) {
    if (!photoTargetId) return
    setBusy(`photo-${photoTargetId}`)
    try {
      const updated = await uploadVehicleImage(photoTargetId, file)
      onChanged(updated)
      if (detailVehicle?.id === updated.id) setDetailVehicle(updated)
      onNotice(`Foto subida para ${updated.plate}`)
    } catch {
      onNotice('No se pudo subir la foto; usa jpg, png o webp de hasta 5 MB')
    } finally {
      setBusy('')
      setPhotoTargetId('')
    }
  }

  function openEconomicEditor(vehicle: Vehicle) {
    setEditVehicle(vehicle)
    setType(vehicle.type)
    setTypeOther(vehicle.type === 'Otro' ? vehicle.type : '')
    setFuelType(vehicle.fuelType)
    setConsumptionLPerKm(vehicle.consumptionLPerKm)
    setPriceCs(vehicle.priceCs)
    setFuelPriceCs(vehicle.fuelPriceCs ?? 0)
    setTankCapacityL(vehicle.tankCapacityL ?? 0)
    setOdometerKm(vehicle.odometerKm)
    setExternal(vehicle.external ?? false)
    setVehicleFunction(vehicle.vehicleFunction)
    setLogistics(vehicle.logistics)
    setMinTripsMonth(vehicle.minTripsMonth)
    setFinanced(vehicle.financing.financed)
    setDownPaymentCs(vehicle.financing.downPaymentCs)
    setLeaseStart(vehicle.financing.leaseStart)
    setLeaseTermMonths(vehicle.financing.leaseTermMonths)
    setLeaseMonthlyPaymentCs(vehicle.financing.leaseMonthlyPaymentCs)
    setResidualValueCs(vehicle.financing.residualValueCs)
    setDepreciationPct(vehicle.financing.depreciationPct)
  }

  return <>
    <div className="report-tabs" style={{ margin: '0 0 12px' }}>
      <button className={`filter-chip ${fleetTab === 'flota' ? 'active' : ''}`} onClick={() => setFleetTab('flota')}>Flota <b>{vehicles.length}</b></button>
      <button className={`filter-chip ${fleetTab === 'combustible' ? 'active' : ''}`} onClick={() => setFleetTab('combustible')}>Combustible</button>
    </div>
    {fleetTab === 'combustible' && <FuelPanel vehicles={vehicles} onNotice={onNotice} />}
    {fleetTab === 'flota' && <>
    <div className="driver-summary">
      <SummaryValue label="Total de vehículos" value={String(vehicles.length)} />
      <SummaryValue label="Disponibles" value={String(byStatus('Disponible').length)} tone="mint" />
      <SummaryValue label="En servicio" value={String(byStatus('En servicio').length)} tone="blue" />
      <SummaryValue label="Financiados (leasing)" value={String(vehicles.filter((vehicle) => vehicle.financing.financed).length)} tone="gold" />
      <SummaryValue label="Mantenimiento / fuera" value={String(byStatus('Mantenimiento').length + byStatus('Fuera de servicio').length)} tone="red" />
    </div>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Flota de Managua · consumos y precios en córdobas {settings ? `· tasa US$ 1 = C$ ${settings.dollarRate}` : ''}</div><button className="primary-button" onClick={() => setFormOpen(true)}><Icon name="plus" size={13} /> Registrar vehículo</button></div>
      <DataTable className="vehicles-table" columns={['Foto', 'Placa', 'Modelo', 'Tipo', 'Función', 'Consumo', 'Precio', 'Odómetro (km)', 'Costo / km', 'Conductor', 'Estado', 'Acciones']} rows={vehicles.map((vehicle) => [
        <button className="vehicle-thumb" key={`${vehicle.id}-thumb`} onClick={() => setDetailVehicle(vehicle)} title="Ver detalle">{vehicle.imageUrl ? <img src={resolveImageUrl(vehicle.imageUrl)} alt={vehicle.model} loading="lazy" /> : <Icon name="vehicles" size={16} />}</button>,
        <span className="plate-cell"><strong className="linkish" key={`${vehicle.id}-plate`} onClick={() => setDetailVehicle(vehicle)}>{vehicle.plate}</strong>{vehicle.external && <span className="badge-external">3P</span>}{vehicle.financing.financed && <span className="financed-badge" title="Financiado (leasing)">Leasing</span>}</span>,
        vehicle.model,
        vehicle.type,
        <span key={`${vehicle.id}-fn`}><b className="function-label">{FUNCTION_LABELS[vehicle.vehicleFunction]}</b><small className="cell-sub">{vehicle.logistics || 'sin sistema logístico'}</small></span>,
        <span key={`${vehicle.id}-cons`}><b>{vehicle.fuelType}</b><small className="cell-sub">{vehicle.consumptionLPerKm} L/km</small></span>,
        <span key={`${vehicle.id}-price`}><b>{formatCs(vehicle.priceCs)}</b><small className="cell-sub">US$ {vehicle.priceUsd.toLocaleString('es-NI')}</small></span>,<span key={`${vehicle.id}-odo`}>{vehicle.odometerKm.toLocaleString('es-NI')}</span>,
        <span key={`${vehicle.id}-costkm`}><b>{formatCs(vehicle.fuelCostPerKmC$)}</b><small className="cell-sub">solo combustible</small></span>,
        <span className={vehicle.driver === 'Sin asignar' ? 'muted' : ''} key={`${vehicle.id}-driver`}>{vehicle.driver}</span>,
        <StatusPill key={`${vehicle.id}-status`} status={vehicle.status} />,
        <div className="action-group" key={`${vehicle.id}-actions`}>
          <select className="mini-select" value={vehicle.status} disabled={busy === `status-${vehicle.id}`} onChange={(event) => void changeStatus(vehicle, event.target.value as VehicleStatus)} title="Cambiar estado"><option value="Disponible">Disponible</option><option value="En servicio">En servicio</option><option value="Mantenimiento">Mantenimiento</option><option value="Fuera de servicio">Fuera de servicio</option></select>
          <select className="mini-select" value={vehicle.driver === 'Sin asignar' ? '' : vehicle.driver} disabled={busy === `driver-${vehicle.id}` || vehicle.status === 'Mantenimiento' || vehicle.status === 'Fuera de servicio'} onChange={(event) => void assignDriver(vehicle, event.target.value)} title="Asignar conductor"><option value="">Sin asignar</option>{drivers.map((driver) => { const usedElsewhere = vehicles.some((other) => other.id !== vehicle.id && other.driver === driver.name); const isMine = vehicle.driver === driver.name; return <option value={driver.name} disabled={usedElsewhere && !isMine} key={driver.id}>{driver.name}{usedElsewhere && !isMine ? ' · en otro vehículo' : ''}</option> })}</select>
          <button title="Ver detalle" onClick={() => setDetailVehicle(vehicle)}><Icon name="eye" size={14} /></button>
          <button title="Datos económicos (consumo, precio C$, odómetro)" onClick={() => openEconomicEditor(vehicle)}><Icon name="fuel" size={14} /></button>
          <button title="Subir foto" disabled={busy === `photo-${vehicle.id}`} onClick={() => { setPhotoTargetId(vehicle.id); photoInputRef.current?.click() }}><Icon name="camera" size={14} /></button>
          <button title="Registrar mantenimiento" onClick={() => setMaintenanceVehicle(vehicle)}><Icon name="wrench" size={14} /></button>
          <button title="Eliminar vehículo" disabled={busy === `delete-${vehicle.id}`} onClick={() => void removeVehicle(vehicle)}><Icon name="trash" size={14} /></button>
        </div>,
      ])} />
      <div className="table-footer"><span>Los cambios de estado, conductor, consumo y precio se persisten en la API · Costo por km = consumo × precio de combustible en C$ · Mantenimientos: {maintenance.length}</span></div>
    </section>
    <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); event.target.value = '' }} />
    {formOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}>
        <form className="modal-card wide vehicle-form-modal" onSubmit={submitVehicle}>
          <div className="modal-header"><div><span className="eyebrow">Flota · Registro</span><h2>Registrar vehículo</h2><p>Se agrega a la flota en estado Disponible. Precios en córdobas (C$).</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label>Placa<input required value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="M 000-000" /></label>
            <label>Modelo<input required value={model} onChange={(event) => setModel(event.target.value)} placeholder="Toyota Hilux 2024" /></label>
            <label>Tipo<select value={type} onChange={(event) => { setType(event.target.value); if (event.target.value !== 'Otro') setTypeOther('') }}><option>Moto</option><option>Panel</option><option>Van</option><option>Pickup</option><option>Camion</option><option>Sedan</option><option>SUV</option><option>Furgon</option><option>Microbus</option><option>Chasis camion</option><option>Otro</option></select>{type === 'Otro' && <input value={typeOther} onChange={(event) => setTypeOther(event.target.value)} placeholder="Escribe el tipo" />}</label>
            <label>Capacidad (kg)<NumInput required min={100} max={20000} value={capacityKg} onChange={setCapacityKg} /></label>
            <label>Año<NumInput required min={2000} max={2030} value={year} onChange={setYear} /></label>
            <label>Combustible<select value={fuelType} onChange={(event) => setFuelType(event.target.value as FuelType)}><option>Gasolina</option><option>Diésel</option><option>Eléctrico</option><option>Híbrido</option></select></label>
            <label>Consumo (L por km)<NumInput required min={0} step={0.01} value={consumptionLPerKm} onChange={setConsumptionLPerKm} /></label>
            <label>Precio de compra (C$)<NumInput min={0} step={1000} value={priceCs} onChange={setPriceCs} placeholder="Ej: 1850000" /></label>
            <label>Odómetro (km)<NumInput min={0} value={odometerKm} onChange={setOdometerKm} /></label><label className="full-field check-field"><input type="checkbox" checked={external} onChange={(event) => setExternal(event.target.checked)} /> Vehículo tercerizado (3P · de proveedor u otro transportista)</label>
            <label>Función del vehículo<select value={vehicleFunction} onChange={(event) => setVehicleFunction(event.target.value as Vehicle['vehicleFunction'])}>{FUNCTION_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label>Sistema logístico<select value={logistics} onChange={(event) => setLogistics(event.target.value)}><option value="">Sin sistema asignado</option><option>Entregas urbanas</option><option>Reparto a tiendas</option><option>Recolección y reparto</option><option>Distribución programada</option><option>Servicio ejecutivo a empresas</option><option>Paquetería exprés</option></select></label>
            <label>Mínimo de viajes / mes (meta)<NumInput min={0} max={5000} value={minTripsMonth} onChange={setMinTripsMonth} /></label>
            <label className="full-field check-field"><input type="checkbox" checked={financed} onChange={(event) => setFinanced(event.target.checked)} /> Financiado por leasing / banco (pago mensual y deuda)</label>
            {financed && <>
              <label>Cuota inicial (C$)<NumInput min={0} step={1000} value={downPaymentCs} onChange={setDownPaymentCs} /></label>
              <label>Inicio del leasing<input type="date" value={leaseStart} onChange={(event) => setLeaseStart(event.target.value)} /></label>
              <label>Plazo (meses)<NumInput min={1} max={240} value={leaseTermMonths} onChange={setLeaseTermMonths} /></label>
              <label>Pago mensual (C$)<NumInput min={0} step={500} value={leaseMonthlyPaymentCs} onChange={setLeaseMonthlyPaymentCs} /></label>
              <label>Valor residual / pago final (C$)<NumInput min={0} step={1000} value={residualValueCs} onChange={setResidualValueCs} /></label>
              <label>Depreciación anual (%)<NumInput min={0} max={90} value={depreciationPct} onChange={setDepreciationPct} /></label>
            </>}
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Registrando…' : 'Registrar vehículo'}</button></div>
        </form>
      </div>
    )}
    {editVehicle && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditVehicle(null) }}>
        <form className="modal-card wide vehicle-form-modal" onSubmit={submitEconomicData}>
          <div className="modal-header"><div><span className="eyebrow">Datos económicos y financiamiento · {editVehicle.plate}</span><h2>{editVehicle.model}</h2><p>Consumo, precio de compra (C$), odómetro, función, sistema logístico, meta de viajes y financiamiento. El costo por km se recalcula con el precio de combustible de configuración.</p></div><button type="button" className="icon-button" onClick={() => setEditVehicle(null)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label>Combustible<select value={fuelType} onChange={(event) => setFuelType(event.target.value as FuelType)}><option>Gasolina</option><option>Diésel</option><option>Eléctrico</option><option>Híbrido</option></select></label>
            <label>Consumo (L por km)<NumInput required min={0} step={0.01} value={consumptionLPerKm} onChange={setConsumptionLPerKm} /></label>
            <label>Capacidad del tanque (L)<NumInput min={0} step={5} value={tankCapacityL} onChange={setTankCapacityL} /></label>
            <label>Precio combustible propio (C$/L)<NumInput min={0} step={0.5} value={fuelPriceCs} onChange={setFuelPriceCs} /></label>
            <label>Precio de compra (C$)<NumInput required min={0} step={1000} value={priceCs} onChange={setPriceCs} /></label>
            <label>Odómetro (km)<NumInput min={0} value={odometerKm} onChange={setOdometerKm} /></label><label className="full-field check-field"><input type="checkbox" checked={external} onChange={(event) => setExternal(event.target.checked)} /> Vehículo tercerizado (3P · de proveedor u otro transportista)</label>
            <label>Función del vehículo<select value={vehicleFunction} onChange={(event) => setVehicleFunction(event.target.value as Vehicle['vehicleFunction'])}>{FUNCTION_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
            <label>Sistema logístico<select value={logistics} onChange={(event) => setLogistics(event.target.value)}><option value="">Sin sistema asignado</option><option>Entregas urbanas</option><option>Reparto a tiendas</option><option>Recolección y reparto</option><option>Distribución programada</option><option>Servicio ejecutivo a empresas</option><option>Paquetería exprés</option></select></label>
            <label>Mínimo de viajes / mes (meta)<NumInput min={0} max={5000} value={minTripsMonth} onChange={setMinTripsMonth} /></label>
            <label className="full-field check-field"><input type="checkbox" checked={financed} onChange={(event) => setFinanced(event.target.checked)} /> Financiado por leasing / banco (pago mensual y deuda)</label>
            {financed && <>
              <label>Cuota inicial (C$)<NumInput min={0} step={1000} value={downPaymentCs} onChange={setDownPaymentCs} /></label>
              <label>Inicio del leasing<input type="date" value={leaseStart} onChange={(event) => setLeaseStart(event.target.value)} /></label>
              <label>Plazo (meses)<NumInput min={1} max={240} value={leaseTermMonths} onChange={setLeaseTermMonths} /></label>
              <label>Pago mensual (C$)<NumInput min={0} step={500} value={leaseMonthlyPaymentCs} onChange={setLeaseMonthlyPaymentCs} /></label>
              <label>Valor residual / pago final (C$)<NumInput min={0} step={1000} value={residualValueCs} onChange={setResidualValueCs} /></label>
              <label>Depreciación anual (%)<NumInput min={0} max={90} value={depreciationPct} onChange={setDepreciationPct} /></label>
            </>}
            <div className="full-field conversion-note"><span>Equivalente en dólares:</span><strong>US$ {csToUsd(priceCs, dollarRate).toLocaleString('es-NI')} · tasa {dollarRate}</strong></div>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditVehicle(null)}>Cancelar</button><button className="primary-button" disabled={busy === `edit-${editVehicle.id}`}>{busy === `edit-${editVehicle.id}` ? 'Guardando…' : 'Guardar datos'}</button></div>
        </form>
      </div>
    )}
    {maintenanceVehicle && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMaintenanceVehicle(null) }}>
        <form className="modal-card" onSubmit={submitMaintenance}>
          <div className="modal-header"><div><span className="eyebrow">Mantenimiento · {maintenanceVehicle.plate}</span><h2>{maintenanceVehicle.model}</h2><p>Al registrar el mantenimiento, el vehículo pasa a estado Mantenimiento.</p></div><button type="button" className="icon-button" onClick={() => setMaintenanceVehicle(null)} aria-label="Cerrar">×</button></div>
          <div className="form-grid"><label className="full-field">Descripción del servicio<textarea required value={maintenanceNote} onChange={(event) => setMaintenanceNote(event.target.value)} placeholder="Ej: Cambio de aceite, frenos y alineación" rows={3} /></label><label>Costo (C$)<NumInput min={0} value={maintenanceCost} onChange={setMaintenanceCost} placeholder="Ej: 7420" /></label><span className="full-field conversion-note">Costo en córdobas: {formatCs(maintenanceCost)} · US$ {csToUsd(maintenanceCost, dollarRate).toFixed(2)}</span></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setMaintenanceVehicle(null)}>Cancelar</button><button className="primary-button" disabled={busy === `mt-${maintenanceVehicle.id}`}>{busy === `mt-${maintenanceVehicle.id}` ? 'Guardando…' : 'Registrar mantenimiento'}</button></div>
        </form>
      </div>
    )}
    {detailVehicle && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailVehicle(null) }}>
        <div className="modal-card vehicle-detail-modal">
          <div className="modal-header"><div><span className="eyebrow">Detalle de flota · {detailVehicle.plate}</span><h2>{detailVehicle.model}</h2><p>{detailVehicle.type} · capacidad {detailVehicle.capacityKg.toLocaleString('es-NI')} kg · {detailVehicle.year}</p></div><button type="button" className="icon-button" onClick={() => setDetailVehicle(null)} aria-label="Cerrar">×</button></div>
          <div className="vehicle-detail-body">
            <div className="vehicle-photo">{detailVehicle.imageUrl ? <img src={resolveImageUrl(detailVehicle.imageUrl)} alt={detailVehicle.model} /> : <div className="vehicle-photo-empty"><Icon name="vehicles" size={28} />Sin foto registrada</div>}<button className="secondary-button photo-change" onClick={() => { setPhotoTargetId(detailVehicle.id); photoInputRef.current?.click() }}><Icon name="camera" size={12} /> {detailVehicle.imageUrl ? 'Cambiar foto' : 'Subir foto'}</button></div>
            <div className="vehicle-detail-info">
              <div className="trip-detail-grid">
                <div className="trip-detail-field"><span>Estado</span><StatusPill status={detailVehicle.status} /></div>
                <div className="trip-detail-field"><span>Conductor</span><strong>{detailVehicle.driver}</strong></div>
                <div className="trip-detail-field"><span>Combustible</span><strong>{detailVehicle.fuelType}</strong></div>
                <div className="trip-detail-field"><span>Consumo</span><strong>{detailVehicle.consumptionLPerKm} L/km</strong></div>
                <div className="trip-detail-field"><span>Precio de compra</span><strong>{formatCs(detailVehicle.priceCs)}<small className="cell-sub">US$ {detailVehicle.priceUsd.toLocaleString('es-NI')}</small></strong></div>
                <div className="trip-detail-field"><span>Costo por km</span><strong>{formatCs(detailVehicle.fuelCostPerKmC$)}<small className="cell-sub">solo combustible</small></strong></div>
                <div className="trip-detail-field"><span>Autonomía del tanque</span><strong>{detailVehicle.tankCapacityL && detailVehicle.consumptionLPerKm > 0 ? Math.round(detailVehicle.tankCapacityL / detailVehicle.consumptionLPerKm).toLocaleString('es-NI') + ' km' : '—'}</strong></div>
                <div className="trip-detail-field"><span>Odómetro</span><strong>{detailVehicle.odometerKm.toLocaleString('es-NI')} km</strong></div>
                <div className="trip-detail-field"><span>Viajes realizados</span><strong>{detailVehicle.totalTrips}<small className="cell-sub">meta {detailVehicle.minTripsMonth || '—'} / mes</small></strong></div>
                <div className="trip-detail-field"><span>Función</span><strong>{FUNCTION_LABELS[detailVehicle.vehicleFunction] ?? '—'}</strong></div>
                <div className="trip-detail-field full"><span>Sistema logístico</span><strong>{detailVehicle.logistics || 'Sin sistema asignado'}</strong></div>
                <div className="trip-detail-field"><span>Último mantenimiento</span><strong>{detailVehicle.lastMaintenance}</strong></div>
                <div className="trip-detail-field"><span>Próximo mantenimiento</span><strong>{detailVehicle.nextMaintenance}</strong></div>
              </div>
              <div className="finance-card">
                <div className="finance-card-head"><span className="eyebrow">FINANCIAMIENTO Y RENTABILIDAD</span>{detailVehicle.financing.financed ? <span className="financed-badge">Leasing activo</span> : <span className="financed-badge cash">Al contado</span>}</div>
                <div className="finance-grid">
                  <div className="finance-cell"><span>Pago mensual</span><strong>{detailVehicle.financing.financed ? formatCs(detailVehicle.financing.leaseMonthlyPaymentCs) : '—'}</strong></div>
                  <div className="finance-cell"><span>Deuda restante</span><strong className={detailVehicle.financing.remainingDebtCs > 0 ? 'text-danger' : ''}>{detailVehicle.financing.financed ? formatCs(detailVehicle.financing.remainingDebtCs) : '—'}</strong></div>
                  <div className="finance-cell"><span>Meses restantes</span><strong>{detailVehicle.financing.financed ? `${detailVehicle.financing.monthsRemaining} de ${detailVehicle.financing.leaseTermMonths}` : '—'}</strong></div>
                  <div className="finance-cell"><span>Total pagado</span><strong>{detailVehicle.financing.financed ? formatCs(detailVehicle.financing.totalPaidCs) : '—'}</strong></div>
                  <div className="finance-cell"><span>Depreciación / mes</span><strong>{formatCs(detailVehicle.financing.monthlyDepreciationCs)}</strong></div>
                  <div className="finance-cell"><span>Depreciación anual</span><strong>{formatCs(detailVehicle.financing.annualDepreciationCs)}<small className="cell-sub">{detailVehicle.financing.depreciationPct}% / año</small></strong></div>
                  <div className="finance-cell"><span>Costo fijo mensual</span><strong>{formatCs(detailVehicle.financing.monthlyCostCs)}<small className="cell-sub">cuota + depreciación</small></strong></div>
                  <div className="finance-cell"><span>Punto de equilibrio</span><strong>{detailVehicle.minTripsMonth ? `~${detailVehicle.minTripsMonth} viajes/mes` : 'sin meta'}<small className="cell-sub">cubre cuota y depreciación</small></strong></div>
                </div>
                <p className="chart-note">Con el leasing, cada viaje del mes debe cubrir su parte de la cuota, el combustible y la depreciación. El módulo de Reportes → Flota y financiamiento proyecta mes a mes si cada vehículo es rentable.</p>
              </div>
              <div className="maintenance-mini"><span className="eyebrow">HISTORIAL DE MANTENIMIENTO</span>{maintenance.filter((record) => record.vehicleId === detailVehicle.id).length === 0 && <p className="muted">Sin registros para este vehículo.</p>}{maintenance.filter((record) => record.vehicleId === detailVehicle.id).map((record) => <div className="maintenance-row" key={record.id}><span>{record.date}</span><p>{record.description}</p><b>{formatCs(record.cost)}</b></div>)}</div>
            </div>
          </div>
          <div className="modal-actions"><button className="secondary-button" onClick={() => openEconomicEditor(detailVehicle)}><Icon name="fuel" size={13} /> Editar datos económicos</button><button className="secondary-button" onClick={() => setDetailVehicle(null)}>Cerrar</button></div>
        </div>
      </div>
    )}
    </>}
  </>
}

const FUNCTION_LABELS: Record<string, string> = { privado: 'Vehículo Privado', delivery: 'Delivery (solo motos)', camion: 'Camión (carga)', '': 'Sin función' }
const FUNCTION_OPTIONS: Array<{ value: Vehicle['vehicleFunction']; label: string }> = [
  { value: 'privado', label: 'Vehículo Privado (ejecutivo / corporativo)' },
  { value: 'delivery', label: 'Delivery (reparto de mercadería; únicamente motos)' },
  { value: 'camion', label: 'Camión (transporte de carga; camiones y pick-ups)' },
]

const PERMISSION_LABELS: Record<string, string> = {
  '*': 'Acceso total',
  'dashboard:read': 'Panel de control',
  'reports:read': 'Reportes',
  'reports:export': 'Exportar reportes',
  'trips:read': 'Consultar viajes',
  'trips:create': 'Crear viajes',
  'trips:assign': 'Asignar viajes',
  'trips:update': 'Actualizar viajes',
  'trips:assigned:read': 'Viajes asignados',
  'trips:status:update': 'Estados de viaje',
  'trips:own:read': 'Viajes propios',
  'tracking:read': 'Tracking en vivo',
  'tracking:own:read': 'Tracking propio',
  'tracking:position:write': 'Enviar ubicación',
  'drivers:read': 'Conductores',
  'vehicles:read': 'Vehículos',
  'incidents:read': 'Incidencias',
  'incidents:update': 'Resolver incidencias',
  'incidents:create': 'Reportar incidencias',
  'finance:read': 'Finanzas',
  'finance:write': 'Caja y montos',
  'clients:read': 'Clientes',
  'payments:own:read': 'Pagos propios',
  'support:create': 'Abrir soporte',
  'chat:read': 'Mensajes',
  'chat:write': 'Responder mensajes',
  'delivery:evidence:write': 'Evidencias de entrega',
  'delivery:validate:write': 'Validar entregas',
  'packages:update': 'Paquetes',
  'evidence:write': 'Evidencias y fotografías',
}
function permissionLabel(permission: string) { return PERMISSION_LABELS[permission] ?? permission }

function UsersView({ users, roles, onNotice, onChanged, onCreated, onDeleted }: { users: AppUser[]; roles: Role[]; onNotice: (message: string) => void; onChanged: (user: AppUser) => void; onCreated: (user: AppUser) => void; onDeleted: (id: string) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<UserRole>('operations')
  const [password, setPassword] = useState('')
  const [passwordUser, setPasswordUser] = useState<AppUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [editUser, setEditUser] = useState<AppUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editUser) return
    setBusy(`edit-${editUser.id}`)
    try {
      onChanged(await updateUser(editUser.id, { name: editName.trim() || undefined, phone: editPhone.trim() || undefined }))
      setEditUser(null)
      onNotice(`Información de ${editName.trim() || editUser.name} actualizada`)
    } catch {
      onNotice('No se pudo actualizar la información del usuario')
    } finally {
      setBusy('')
    }
  }

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

  async function revokeUserRow(user: AppUser) {
    if (!window.confirm(`¿Cerrar la sesión activa de ${user.name}? Se usará para bloquear accesos futuros de esta sesión.`)) return
    setBusy(user.id)
    try {
      const updated = await revokeUserSession(user.id)
      onChanged(updated)
      onNotice(`Sesión de ${user.name} cerrada`)
    } catch {
      onNotice(`No se pudo cerrar la sesión de ${user.name}`)
    } finally {
      setBusy('')
    }
  }

  async function removeUser(user: AppUser) {
    if (!window.confirm(`¿Eliminar al usuario ${user.name} (${user.email})?`)) return
    setBusy(user.id)
    try {
      await deleteUser(user.id)
      onDeleted(user.id)
      onNotice(`Usuario ${user.name} eliminado`)
    } catch {
      onNotice(`No se pudo eliminar a ${user.name}; el administrador principal está protegido`)
    } finally {
      setBusy('')
    }
  }

  async function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('create')
    try {
      onCreated(await createUser({ name, email, phone, role, password: password || undefined }))
      setFormOpen(false)
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      onNotice(password ? `Usuario creado con contraseña personalizada` : 'Usuario creado con contraseña Incoex2026 (cámbiala en su primera sesión)')
    } catch {
      onNotice('No se pudo crear el usuario; verifica el correo y los datos')
    } finally {
      setBusy('')
    }
  }

  async function savePassword(user: AppUser) {
    if (newPassword.length < 8) {
      onNotice('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setBusy(`pwd-${user.id}`)
    try {
      onChanged(await updateUser(user.id, { password: newPassword }))
      setPasswordUser(null)
      setNewPassword('')
      onNotice(`Contraseña de ${user.name} actualizada`)
    } catch {
      onNotice(`No se pudo cambiar la contraseña de ${user.name}`)
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
      <div className="panel-header"><div><span className="eyebrow">MATRIZ DE ROLES · CONTRATO</span><h2>Los ocho roles y sus permisos</h2><p className="panel-sub">Los roles son fijos del contrato: no se eliminan; se asignan a cada usuario desde la tabla.</p></div><span className="source-badge">{roles.length} roles contractuales</span></div>
      <div className="role-matrix-grid">{roles.map((item) => <article className="role-card" key={item.code}><div className="role-card-head"><span className="role-code">{item.code.slice(0, 4)}</span><strong>{item.name}</strong></div><p>{item.description}</p><div className="role-permissions">{item.permissions.slice(0, 5).map((permission) => <span key={permission}>{permissionLabel(permission)}</span>)}</div></article>)}</div>
    </section>
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Los cambios de rol y estado se persisten en la API</div><button className="primary-button" onClick={() => setFormOpen(true)}><Icon name="plus" size={13} /> Crear usuario</button></div>
      <DataTable columns={['Usuario', 'Contacto', 'Rol', 'Último acceso', 'Estado', 'Acciones']} rows={users.map((user) => [<div className="client-cell" key={`${user.id}-cell`}><span className="client-avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>, user.phone || '—', <select className="mini-select role-select" value={user.role} disabled={busy === user.id} onChange={(event) => void changeRole(user, event.target.value as UserRole)} title="Cambiar rol">{roles.map((item) => <option value={item.code} key={item.code}>{item.name.replace(/^Rol \d{2} · /, '')}</option>)}</select>, user.lastLogin, <StatusPill key={`${user.id}-status`} status={user.status} />, <div className="action-group" key={`${user.id}-actions`}><button title="Editar nombre y teléfono" onClick={() => { setEditUser(user); setEditName(user.name); setEditPhone(user.phone ?? '') }}><Icon name="edit" size={14} /></button><button title="Cambiar contraseña" onClick={() => { setPasswordUser(user); setNewPassword('') }}><Icon name="lock" size={14} /></button><button title={user.status === 'Activo' ? 'Desactivar' : 'Activar'} disabled={busy === user.id} onClick={() => void toggleUser(user)}>{user.status === 'Activo' ? <Icon name="close" size={14} /> : <Icon name="check" size={14} />}</button><button title="Cerrar sesión activa (robo o sesión compartida)" disabled={(user.sessionState ?? 'Activa') === 'Cerrada' || busy === user.id} onClick={() => void revokeUserRow(user)}><Icon name='logout' size={14} /></button><button title="Eliminar usuario" disabled={busy === user.id || user.id === 'usr-001'} onClick={() => void removeUser(user)}><Icon name="trash" size={14} /></button></div>])} />
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
            <label className="full-field">Contraseña inicial<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo 8 caracteres · vacío = Incoex2026" /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="primary-button" disabled={busy === 'create'}>{busy === 'create' ? 'Creando…' : 'Crear usuario'}</button></div>
        </form>
      </div>
    )}
    {passwordUser && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPasswordUser(null) }}>
        <form className="modal-card" onSubmit={(event) => { event.preventDefault(); void savePassword(passwordUser) }}>
          <div className="modal-header"><div><span className="eyebrow">Seguridad · {passwordUser.email}</span><h2>Cambiar contraseña de {passwordUser.name}</h2><p>La contraseña se guarda cifrada en la API; mínima de 8 caracteres.</p></div><button type="button" className="icon-button" onClick={() => setPasswordUser(null)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label className="full-field">Nueva contraseña<input autoFocus type="password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Ej: Incoex2026!" /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPasswordUser(null)}>Cancelar</button><button className="primary-button" disabled={busy === `pwd-${passwordUser.id}`}>{busy === `pwd-${passwordUser.id}` ? 'Guardando…' : 'Guardar contraseña'}</button></div>
        </form>
      </div>
    )}
    {editUser && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditUser(null) }}>
        <form className="modal-card" onSubmit={saveEdit}>
          <div className="modal-header"><div><span className="eyebrow">Administración · Usuarios</span><h2>Editar {editUser.name}</h2><p>Cambia nombre, teléfono o correo; el rol y el estado se ajustan desde la tabla.</p></div><button type="button" className="icon-button" onClick={() => setEditUser(null)} aria-label="Cerrar">×</button></div>
          <div className="form-grid">
            <label>Nombre<input required value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <label>Teléfono<input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="8XXX-XXXX" /></label>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditUser(null)}>Cancelar</button><button className="primary-button" disabled={busy === `edit-${editUser.id}`}>{busy === `edit-${editUser.id}` ? 'Guardando…' : 'Guardar cambios'}</button></div>
        </form>
      </div>
    )}
  </>
}

function ClientsView({ clients, search, onDeleted, onUpdated, onNotice }: { clients: Client[]; search: string; onDeleted: (id: string) => void; onUpdated: (client: Client) => void; onNotice: (message: string) => void }) {
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState('')
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const pageSize = 8
  const filtered = useMemo(() => clients.filter((client) => `${client.name} ${client.email} ${client.phone} ${client.address ?? ''}`.toLowerCase().includes(search.toLowerCase())), [clients, search])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize)
  async function removeClient(client: Client) {
    if (!window.confirm(`¿Eliminar al cliente ${client.name}?`)) return
    setBusy(client.id)
    try {
      await deleteClient(client.id)
      onDeleted(client.id)
      onNotice(`Cliente ${client.name} eliminado`)
    } catch {
      onNotice(`No se pudo eliminar a ${client.name}`)
    } finally {
      setBusy('')
    }
  }
  const creditLabel = (client: Client) => (client.creditDays ?? 0) > 0 ? `Crédito ${client.creditDays} d${(client.dueDay ?? 0) > 0 ? ` · cobro día ${client.dueDay}` : ''}` : (client.dueDay ?? 0) > 0 ? `Cobro día ${client.dueDay}` : 'Contado'
  return <><section className="panel table-panel"><div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> {clients.length} clientes cargados desde la API · «Nuevo cliente» registra y «Editar» define crédito y fechas de cobro</div><span className="source-badge">registro y edición</span></div><DataTable className="clients-table" columns={['Nombre / Empresa', 'Teléfono', 'Email', 'Dirección', 'Crédito / cobro', 'Viajes', 'Solicitudes act.', 'Estado', 'Acciones']} rows={visible.map((client) => [<div className="client-cell" key={`${client.id}-cell`}><span className="client-avatar">{initials(client.name)}</span><div><strong>{client.name}</strong><small>{client.type}</small></div></div>, client.phone, client.email, client.address || '—', <span key={`${client.id}-credit`} className={((client.creditDays ?? 0) > 0 || (client.dueDay ?? 0) > 0) ? 'credit-tag' : 'muted'}>{creditLabel(client)}</span>, client.trips, client.activeRequests, <StatusPill key={`${client.id}-status`} status={client.status} />, <div className="action-group" key={`${client.id}-actions`}><button title="Editar datos y fechas de cobro" onClick={() => setEditingClient(client)}><Icon name="edit" size={14} /></button><button title="Eliminar cliente" disabled={busy === client.id} onClick={() => void removeClient(client)}><Icon name="trash" size={14} /></button></div>])} /><div className="table-footer"><span>Mostrando {visible.length} de {filtered.length} clientes · la fecha de cobro de los viajes se hereda del crédito del cliente</span><TablePagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div></section>
    {editingClient && <ClientFormDialog client={editingClient} onClose={() => setEditingClient(null)} onCreated={(updated) => { onUpdated(updated); setEditingClient(null); onNotice(`Cliente ${updated.name} actualizado`) }} onError={onNotice} />}
  </>
}

function IncidentsView({ incidents, onNotice, onChanged, onCreated }: { incidents: Incident[]; onNotice: (message: string) => void; onChanged: (incident: Incident) => void; onCreated: (incident: Incident) => void }) {
  const [statusFilter, setStatusFilter] = useState<'all' | Incident['status']>('all')
  const [acting, setActing] = useState('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [detailIncident, setDetailIncident] = useState<Incident | null>(null)
  const pageSize = 8
  const filtered = incidents.filter((incident) => statusFilter === 'all' || incident.status === statusFilter)
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize)
  async function changeStatus(incident: Incident, status: Incident['status']) {
    setActing(incident.id)
    try {
      const updated = await updateIncidentStatus(incident.id, status)
      onChanged(updated)
      if (detailIncident?.id === incident.id) setDetailIncident(updated)
      onNotice(`${incident.id} marcada como ${status}`)
    } catch {
      onNotice(`No se pudo actualizar ${incident.id}`)
    } finally {
      setActing('')
    }
  }
  function exportExcelFile() {
    exportExcel(`incoex-incidencias-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Incidencias', incidents.map((incident) => ({ 'ID': incident.id, 'Viaje': incident.trip, 'Conductor': incident.driver, 'Cliente': incident.client, 'Tipo': incident.type, 'Prioridad': incident.priority, 'Estado': incident.status })))
    onNotice('Reporte de incidencias en Excel descargado')
  }
  function exportPdfFile() {
    exportPdf('Incidencias · INCOEX Logistics', 'Incidencias registradas en la operación de Managua', ['ID', 'Viaje', 'Conductor', 'Cliente', 'Tipo', 'Prioridad', 'Estado'], incidents.map((incident) => [incident.id, incident.trip, incident.driver, incident.client, incident.type, incident.priority, incident.status]))
    onNotice('Reporte de incidencias preparado para guardar como PDF')
  }
  return <><section className="panel table-panel"><div className="table-toolbar"><div className="filter-row"><button className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => { setStatusFilter('all'); setPage(1) }}>Todas <b>{incidents.length}</b></button><button className={`filter-chip ${statusFilter === 'Abierta' ? 'active' : ''}`} onClick={() => { setStatusFilter('Abierta'); setPage(1) }}>Abiertas <b>{incidents.filter((incident) => incident.status === 'Abierta').length}</b></button><button className={`filter-chip ${statusFilter === 'En proceso' ? 'active' : ''}`} onClick={() => { setStatusFilter('En proceso'); setPage(1) }}>En proceso <b>{incidents.filter((incident) => incident.status === 'En proceso').length}</b></button><button className={`filter-chip ${statusFilter === 'Resuelta' ? 'active' : ''}`} onClick={() => { setStatusFilter('Resuelta'); setPage(1) }}>Resueltas <b>{incidents.filter((incident) => incident.status === 'Resuelta').length}</b></button></div><div className="action-group toolbar-actions"><button className="secondary-button" onClick={exportExcelFile}><Icon name="download" size={12} /> Excel</button><button className="secondary-button" onClick={exportPdfFile}><Icon name="fileText" size={12} /> PDF</button><button className="primary-button" onClick={() => setFormOpen(true)}><Icon name="plus" size={12} /> Reportar incidencia</button></div></div><DataTable className="incidents-table" columns={['ID incidencia', 'Viaje', 'Conductor', 'Cliente', 'Tipo', 'Prioridad', 'Estado', 'Acciones']} rows={visible.map((incident) => [<strong className="linkish" key={`${incident.id}-id`} onClick={() => setDetailIncident(incident)}>{incident.id}</strong>, incident.trip, incident.driver, incident.client, incident.type, <PriorityPill key={`${incident.id}-priority`} priority={incident.priority} />, <StatusPill key={`${incident.id}-status`} status={incident.status} />, <div className="action-group" key={`${incident.id}-actions`}><button title="Ver detalle" onClick={() => setDetailIncident(incident)}><Icon name="eye" size={14} /></button><button title="Poner en proceso" disabled={acting === incident.id || incident.status === 'En proceso' || incident.status === 'Resuelta'} onClick={() => void changeStatus(incident, 'En proceso')}><Icon name="activity" size={14} /></button><button title="Marcar resuelta" disabled={acting === incident.id || incident.status === 'Resuelta'} onClick={() => void changeStatus(incident, 'Resuelta')}><Icon name="check" size={14} /></button></div>])} /><div className="table-footer"><span>Mostrando {visible.length} de {filtered.length} incidencias · ◉ pone en proceso · ✓ resuelve</span><TablePagination page={page} pageSize={pageSize} total={filtered.length} onChange={setPage} /></div></section>
    {formOpen && <IncidentFormDialog onClose={() => setFormOpen(false)} onCreated={(incident) => { onCreated(incident); setFormOpen(false); onNotice(`Incidencia ${incident.id} reportada y abierta`) }} onError={onNotice} />}
    {detailIncident && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailIncident(null) }}>
        <div className="modal-card trip-detail-modal">
          <div className="modal-header"><div><span className="eyebrow">Detalle de incidencia · {detailIncident.id}</span><h2>{detailIncident.type}</h2><p>Reportada para el viaje {detailIncident.trip}</p></div><button type="button" className="icon-button" onClick={() => setDetailIncident(null)} aria-label="Cerrar">×</button></div>
          <div className="trip-detail-grid">
            <div className="trip-detail-field"><span>Cliente</span><strong>{detailIncident.client}</strong></div>
            <div className="trip-detail-field"><span>Conductor</span><strong>{detailIncident.driver}</strong></div>
            <div className="trip-detail-field"><span>Prioridad</span><PriorityPill priority={detailIncident.priority} /></div>
            <div className="trip-detail-field"><span>Estado actual</span><StatusPill status={detailIncident.status} /></div>
            <div className="trip-detail-field"><span>Ubicación GPS</span><strong>{detailIncident.latitude !== undefined && detailIncident.longitude !== undefined ? `${detailIncident.latitude.toFixed(5)}, ${detailIncident.longitude.toFixed(5)}` : 'No reportada'}</strong></div>
            <div className="trip-detail-field"><span>Evidencia</span><strong>{detailIncident.evidence ? <a href={detailIncident.evidence} target="_blank" rel="noreferrer" className="evidence-link">Ver fotografía</a> : 'Sin fotografía'}</strong></div>
          </div>
          {detailIncident.description && <div className="incident-description"><span>Descripción del problema</span><p>{detailIncident.description}</p></div>}
          <div className="modal-actions trip-actions">
            {detailIncident.status !== 'En proceso' && detailIncident.status !== 'Resuelta' && <button className="primary-button" disabled={acting === detailIncident.id} onClick={() => void changeStatus(detailIncident, 'En proceso')}>{acting === detailIncident.id ? 'Actualizando…' : 'Poner en proceso'}</button>}
            {detailIncident.status !== 'Resuelta' && <button className="primary-button" disabled={acting === detailIncident.id} onClick={() => void changeStatus(detailIncident, 'Resuelta')}>{acting === detailIncident.id ? 'Actualizando…' : 'Marcar resuelta'}</button>}
            <button className="secondary-button" onClick={() => setDetailIncident(null)}>Cerrar</button>
          </div>
        </div>
      </div>
    )}
  </>
}

function IncidentFormDialog({ onClose, onCreated, onError }: { onClose: () => void; onCreated: (incident: Incident) => void; onError: (message: string) => void }) {
  const [type, setType] = useState('Retraso')
  const [client, setClient] = useState('')
  const [trip, setTrip] = useState('')
  const [driver, setDriver] = useState('')
  const [priority, setPriority] = useState<Incident['priority']>('Media')
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    try {
      onCreated(await createIncident({ type, client, trip, driver, priority }))
    } catch {
      onError('No se pudo reportar la incidencia; revisa los datos')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="modal-card" onSubmit={submit}>
        <div className="modal-header"><div><span className="eyebrow">Operaciones · Incidencias</span><h2>Reportar incidencia</h2><p>La incidencia queda Abierta y alimenta el panel «Requiere atención».</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">×</button></div>
        <div className="form-grid">
          <label>Tipo de incidencia<select value={type} onChange={(event) => setType(event.target.value)}><option>Retraso</option><option>Cliente ausente</option><option>Problema con paquete</option><option>Problema con dirección</option><option>Accidente</option><option>Otro</option></select></label>
          <label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value as Incident['priority'])}><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></label>
          <label className="full-field">Cliente afectado<input required value={client} onChange={(event) => setClient(event.target.value)} placeholder="Nombre del cliente o empresa" /></label>
          <label>Viaje<input value={trip} onChange={(event) => setTrip(event.target.value)} placeholder="Ej: #4791" /></label>
          <label>Conductor<input value={driver} onChange={(event) => setDriver(event.target.value)} placeholder="Nombre del conductor" /></label>
        </div>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={submitting}>{submitting ? 'Guardando…' : 'Reportar incidencia'}</button></div>
      </form>
    </div>
  )
}

function ReportsView({ reports, trips, drivers, clients, incidents, vehicles, settings, onNotice }: { reports: ReportsSummary | null; trips: Trip[]; drivers: Driver[]; clients: Client[]; incidents: Incident[]; vehicles: Vehicle[]; settings: AppSettings | null; onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<'resumen' | 'flota' | 'viajes' | 'conductores' | 'clientes' | 'incidencias' | 'paquetes'>('resumen')
  const [exporting, setExporting] = useState('')
  const dollarRate = settings?.dollarRate ?? 36.5
  const reportDate = new Intl.DateTimeFormat('es-NI', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
  if (!reports) return <EmptyState title="Reportes pendientes" detail="La API aún no entregó el resumen analítico." />
  const profitable = trips.filter((trip) => trip.status === 'Completado' && (trip.profitCs ?? 0) >= 0).length
  const losses = trips.filter((trip) => trip.status === 'Completado' && (trip.profitCs ?? 0) < 0).length
  function exportExcelFile(collection: 'trips' | 'drivers' | 'clients' | 'incidents' | 'packages' | 'vehicles', label: string) {
    setExporting(collection)
    const rows: Array<Record<string, ExportCell>> = []
    if (collection === 'trips') for (const trip of trips) rows.push({ 'ID': trip.id, 'Cliente': trip.client, 'Conductor': trip.driver, 'Origen': trip.origin, 'Destino': trip.destination, 'Fecha': trip.date, 'Paquetes': trip.packages, 'Estado': trip.status, 'Distancia km': trip.distanceKm ?? '', 'Tarifa C$': trip.estimatedCostCs ?? '', 'Costo C$': trip.costCs ?? '', 'Resultado C$': trip.profitCs ?? '', 'Servicio': trip.serviceType ?? 'Urbano' })
    if (collection === 'drivers') for (const driver of drivers) rows.push({ 'ID': driver.id, 'Nombre': driver.name, 'Teléfono': driver.phone, 'Vehículo': driver.vehicle, 'Placa': driver.plate, 'Estado': driver.status, 'Ruta': driver.route })
    if (collection === 'clients') for (const client of clients) rows.push({ 'ID': client.id, 'Nombre': client.name, 'Tipo': client.type, 'Teléfono': client.phone, 'Email': client.email, 'Dirección': client.address ?? '', 'Viajes': client.trips, 'Solicitudes activas': client.activeRequests, 'Estado': client.status })
    if (collection === 'incidents') for (const incident of incidents) rows.push({ 'ID': incident.id, 'Viaje': incident.trip, 'Conductor': incident.driver, 'Cliente': incident.client, 'Tipo': incident.type, 'Prioridad': incident.priority, 'Estado': incident.status })
    if (collection === 'packages') for (const trip of trips) for (let index = 1; index <= Math.min(trip.packages, 3); index += 1) { const weightKg = trip.weight ?? (1 + ((trip.packages + index) % 24)); rows.push({ 'Guía': `PKG-${trip.id.replace('#', '')}-${index}`, 'Viaje': trip.id, 'Cliente': trip.client, 'Peso': trip.weightUnit === 'lb' ? `${(weightKg * 2.20462).toFixed(1)} lb` : `${weightKg.toFixed(1)} kg`, 'Dimensiones': `${30 + index * 5}×${20 + index * 4}×${15 + index * 3} cm`, 'Estado': trip.status }) }
    if (collection === 'vehicles') for (const vehicle of vehicles) rows.push({ 'Placa': vehicle.plate, 'Modelo': vehicle.model, 'Tipo': vehicle.type, 'Función': FUNCTION_LABELS[vehicle.vehicleFunction] ?? '', 'Sistema logístico': vehicle.logistics, 'Estado': vehicle.status, 'Conductor': vehicle.driver, 'Combustible': vehicle.fuelType, 'Precio C$': vehicle.priceCs, 'Odómetro km': vehicle.odometerKm, 'Financiado': vehicle.financing.financed ? 'Sí' : 'No', 'Pago mensual C$': vehicle.financing.leaseMonthlyPaymentCs, 'Meses restantes': vehicle.financing.monthsRemaining, 'Deuda restante C$': vehicle.financing.remainingDebtCs, 'Depreciación/mes C$': vehicle.financing.monthlyDepreciationCs, 'Costo mensual C$': vehicle.financing.monthlyCostCs, 'Meta viajes/mes': vehicle.minTripsMonth })
    exportExcel(`incoex-${collection}-${new Date().toISOString().slice(0, 10)}.xlsx`, label, rows)
    onNotice(`Reporte ${label} en Excel descargado`)
    window.setTimeout(() => setExporting(''), 600)
  }
  const fleetReport = reports.fleetReport ?? []
  const fleetSummary = (key: keyof typeof fleetReport[number]) => fleetReport.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)
  const totalMonthlyCost = fleetSummary('monthlyCostCs')
  const totalIncome = fleetSummary('incomeMonthCs')
  const totalMargin = fleetSummary('marginCs')
  const reportTabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'resumen', label: 'Resumen ejecutivo' },
    { id: 'flota', label: 'Flota y financiamiento' },
    { id: 'viajes', label: 'Viajes' },
    { id: 'conductores', label: 'Conductores' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'incidencias', label: 'Incidencias' },
    { id: 'paquetes', label: 'Paquetes' },
  ]
  const packageRows = trips.flatMap((trip) => Array.from({ length: Math.min(trip.packages, 3) }, (_, index) => {
    const weightKg = trip.weight ?? (1 + ((trip.packages + index) % 24))
    const weightDisplay = trip.weightUnit === 'lb' ? `${(weightKg * 2.20462).toFixed(1)} lb` : `${weightKg.toFixed(1)} kg`
    return { id: `PKG-${trip.id.replace('#', '')}-${index + 1}`, trip: trip.id, client: trip.client, weightDisplay, dimensions: `${30 + index * 5}×${20 + index * 4}×${15 + index * 3} cm`, status: trip.status }
  }))
  return <>
    <div className="report-header">
      <div><span className="eyebrow">INFORME DE OPERACIÓN · {reportDate.toUpperCase()}</span><h2 className="report-title">Reporte analítico INCOEX</h2><p className="panel-sub">Información consolidada y detallada de la operación, separada de la vista general del dashboard. Incluye flota, financiamiento, resultados por viaje y seguimiento de incidencias.</p></div>
      <div className="report-header-meta"><span><b>{reports.totalTrips}</b> viajes registrados</span><span><b>{drivers.length}</b> conductores</span><span><b>{clients.length}</b> clientes</span><span><b>{incidents.filter((incident) => incident.status !== 'Resuelta').length}</b> incidencias abiertas</span></div>
    </div>
    <div className="report-tabs">
      {reportTabs.map((item) => <button key={item.id} className={`filter-chip ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>
    {tab === 'resumen' && <>
      <div className="metrics-grid report-metrics"><MetricCard label="Viajes registrados" value={reports.totalTrips} delta="en la base real" tone="blue" icon="trips" hint="Total de solicitudes registradas en la API." /><MetricCard label="Entregas completadas" value={reports.completedTrips} delta="periodo" tone="mint" icon="checkCircle" hint="Viajes con estado Completado." /><MetricCard label="Viajes cancelados" value={reports.cancelledTrips} delta="periodo" tone="red" icon="cancelCircle" hint="Viajes cancelados o anulados." /><MetricCard label="Ingresos estimados" value={reports.totalRevenueCs} delta="C$ · tarifas calculadas" tone="gold" icon="wallet" hint="Suma de la tarifa estimada de los viajes completados." /><MetricCard label="Ganancia total" value={reports.profitSummary?.totalProfitCs ?? 0} delta="C$ · tarifa menos costo" tone="mint" icon="trendingUp" hint={`${reports.profitSummary?.profitableTrips ?? 0} viajes con ganancia · ${reports.profitSummary?.lossTrips ?? 0} con pérdida`} /><MetricCard label="Kilómetros recorridos" value={reports.totalDistanceKm} delta="km en rutas registradas" tone="slate" icon="tracking" hint="Suma de la distancia en km de los viajes con ruta." /></div>
      {(reports.topVehicles?.length ?? 0) > 0 && (
        <div className="reports-grid">
          <section className="panel leaderboard"><PanelHeader title="Top vehículos por viajes" action="kilometraje" /><ol>{reports.topVehicles!.map((vehicle, index) => <li key={vehicle.plate}><span className="rank">{index + 1}</span><span className="mini-avatar">{initials(vehicle.model)}</span><strong>{vehicle.plate} · {vehicle.model}</strong><span className="bar"><i style={{ width: `${Math.max(20, 100 - index * 14)}%` }} /></span><b>{vehicle.trips} viajes · {vehicle.km.toLocaleString('es-NI')} km</b></li>)}</ol><p className="chart-note">Viajes completados y kilómetros por vehículo, con su conductor asignado.</p></section>
          <section className="panel leaderboard"><PanelHeader title="Conductores con su vehículo" action="quién viaja más" /><ol>{reports.driverVehicle!.map((driver, index) => <li key={driver.name}><span className="rank">{index + 1}</span><span className="mini-avatar">{initials(driver.name)}</span><strong>{driver.name}</strong><span className="bar"><i style={{ width: `${Math.max(20, 100 - index * 14)}%` }} /></span><b>{driver.trips} viajes · {formatCs(driver.incomeCs)}</b></li>)}</ol><p className="chart-note">Cada conductor vinculado al vehículo que usa: viajes completados e ingresos que genera.</p></section>
        </div>
      )}
      <div className="reports-grid">
        <ChartPanel title="Viajes por fecha" values={reports.weeklyTrips} labels={reports.weeklyLabels} note="Solicitudes registradas por fecha en la API." />
        <ChartPanel title="Entregas por fecha" values={reports.dailyDeliveries} labels={reports.dailyLabels} compact note="Viajes completados por fecha." />
        <Leaderboard title="Top conductores" entries={reports.topDrivers} note="Conductores por viajes registrados." />
        <Leaderboard title="Top clientes" entries={reports.topClients} note="Clientes por viajes solicitados." />
      </div>
    </>}
    {tab === 'flota' && <>
      <section className="panel export-panel">
        <div className="export-panel-head"><div><span className="eyebrow">PROYECCIÓN MENSUAL DE LA FLOTA</span><h2>Flota y financiamiento</h2><p>Por cada vehículo: función, sistema logístico, meta mínima de viajes, leasing (cuota, deuda restante, meses), depreciación, ingreso del mes y margen proyectado. Los números en rojo indican que el vehículo no se cubre a sí mismo este mes.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportExcelFile('vehicles', 'Flota y financiamiento')} disabled={exporting !== ''}><Icon name="download" size={13} /> Flota Excel</button><button className="secondary-button" onClick={() => { exportPdf('Flota y financiamiento · INCOEX Logistics', 'Proyección mensual y leasing por vehículo', ['Placa', 'Modelo', 'Función', 'Financiado', 'Pago mensual', 'Deuda restante', 'Meses', 'Depreciación/mes', 'Costo fijo/mes', 'Viajes mes', 'Meta/mes', 'Ingreso mes', 'Margen'], fleetReport.map((row) => [row.plate, row.model, FUNCTION_LABELS[row.vehicleFunction] ?? '', row.financed ? 'Sí' : 'No', row.leaseMonthlyPaymentCs ? `C$ ${row.leaseMonthlyPaymentCs.toLocaleString('es-NI', { maximumFractionDigits: 0 })}` : '—', row.remainingDebtCs ? `C$ ${row.remainingDebtCs.toLocaleString('es-NI', { maximumFractionDigits: 0 })}` : '—', row.monthsRemaining || '—', `C$ ${row.monthlyDepreciationCs.toLocaleString('es-NI', { maximumFractionDigits: 0 })}`, `C$ ${row.monthlyCostCs.toLocaleString('es-NI', { maximumFractionDigits: 0 })}`, row.tripsMonth, row.minTripsMonth || '—', `C$ ${row.incomeMonthCs.toLocaleString('es-NI', { maximumFractionDigits: 0 })}`, `C$ ${row.marginCs.toLocaleString('es-NI', { maximumFractionDigits: 0 })}`])); onNotice('Reporte de flota preparado para guardar') }} disabled={exporting !== ''}><Icon name="fileText" size={13} /> Flota PDF</button></div></div>
        <div className="fleet-totals"><span>Costo fijo mensual de la flota: <b>{formatCs(totalMonthlyCost)}</b></span><span>Ingresos del mes: <b>{formatCs(totalIncome)}</b></span><span>Margen proyectado: <b className={totalMargin < 0 ? 'text-danger' : ''}>{formatCs(totalMargin)}</b></span><span className={fleetSummary('tripsMonth') >= fleetSummary('minTripsMonth') ? '' : 'text-danger'}>Viajes del mes: <b>{fleetSummary('tripsMonth')}</b> · meta <b>{fleetSummary('minTripsMonth')}</b></span></div>
      </section>
      <section className="panel table-panel">
        <div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Leasing, depreciación y rentabilidad por vehículo (US$ {dollarRate})</div></div>
        <DataTable className="fleet-report-table" columns={['Vehículo', 'Función / logística', 'Financiamiento', 'Deuda restante', 'Costo fijo / mes', 'Meta viajes', 'Viajes del mes', 'Ingreso mes', 'Margen proyectado']} rows={fleetReport.map((row) => [
          <span key={`${row.plate}-fleet`}><b className="linkish">{row.plate}</b><small className="cell-sub">{row.model}</small></span>,
          <span key={`${row.plate}-fn`}><b className="function-label">{FUNCTION_LABELS[row.vehicleFunction] ?? '—'}</b><small className="cell-sub">{row.logistics || '—'}</small></span>,
          <span key={`${row.plate}-fin`}>{row.financed ? <span className="financed-badge">Leasing</span> : <span className="financed-badge cash">Contado</span>}<small className="cell-sub">{row.financed ? `cuota ${formatCs(row.leaseMonthlyPaymentCs)} · ${row.monthsRemaining} meses` : 'sin cuota'}</small></span>,
          <span key={`${row.plate}-debt`}><b className={row.remainingDebtCs > 0 ? 'text-danger' : ''}>{row.financed ? formatCs(row.remainingDebtCs) : '—'}</b><small className="cell-sub">{row.financed ? 'capital + residual' : 'pagado'}</small></span>,
          <span key={`${row.plate}-cost`}><b>{formatCs(row.monthlyCostCs)}</b><small className="cell-sub">depre. {formatCs(row.monthlyDepreciationCs)}</small></span>,
          <span key={`${row.plate}-target`}><b>{row.minTripsMonth || '—'}</b><small className="cell-sub">p.e. {row.breakEvenTrips || '—'} viajes</small></span>,
          <span key={`${row.plate}-trips`} className={row.tripsMonth < row.minTripsMonth && row.minTripsMonth > 0 ? 'text-danger' : ''}><b>{row.tripsMonth}</b><small className="cell-sub">{row.kmMonth.toLocaleString('es-NI')} km</small></span>,
          <span key={`${row.plate}-income`}><b>{formatCs(row.incomeMonthCs)}</b><small className="cell-sub">comb. {formatCs(row.fuelEstimateCs)}</small></span>,
          <span key={`${row.plate}-margin`} className={row.marginCs < 0 ? 'text-danger' : ''}><b>{row.marginCs < 0 ? '−' : '+'}{formatCs(Math.abs(row.marginCs))}</b><small className="cell-sub">{row.marginCs < 0 ? 'pierde este mes' : 'cubre su costo'}</small></span>,
        ])} />
        <div className="table-footer"><span>Margen = ingresos del mes − combustible estimado − cuota de leasing − depreciación. El mínimo de viajes por vehículo se define en Vehículos y flota → Datos económicos.</span></div>
      </section>
    </>}
    {tab === 'viajes' && <>
      <section className="panel export-panel">
        <div className="export-panel-head"><div><span className="eyebrow">RESULTADO POR VIAJE</span><h2>Viajes · ganancia o pérdida</h2><p>Cada viaje completado muestra su resultado: tarifa menos costo de operación (combustible + desgaste estimado).</p></div><div className="profit-summary-chips"><span className="profit-chip gain">+{profitable} con ganancia</span><span className="profit-chip loss">−{losses} con pérdida</span><span className="profit-chip neutral">Total {formatCs(reports.profitSummary?.totalProfitCs ?? 0)}</span></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportExcelFile('trips', 'Viajes')} disabled={exporting !== ''}><Icon name="download" size={13} /> Viajes Excel</button><button className="secondary-button" onClick={() => { exportPdf('Viajes · INCOEX Logistics', 'Datos reales de la operación de Managua', ['ID', 'Cliente', 'Conductor', 'Origen', 'Destino', 'Estado', 'Distancia km', 'Tarifa', 'Costo', 'Resultado'], trips.map((trip) => [trip.id, trip.client, trip.driver, trip.origin, trip.destination, trip.status, trip.distanceKm ?? '—', trip.estimatedCostCs ?? '—', trip.costCs ?? '—', trip.profitCs ?? '—'])); onNotice('Reporte de viajes preparado para guardar') }} disabled={exporting !== ''}><Icon name="fileText" size={13} /> Viajes PDF</button></div></div>
      </section>
      <section className="panel table-panel">
        <DataTable className="trips-table" rowClassName={(_row, index) => ['Cancelado', 'Anulado'].includes(trips[index]?.status ?? '') ? 'row-off' : ''} columns={['ID', 'Cliente', 'Conductor', 'Origen', 'Destino', 'Fecha', 'Paq.', 'Dist. (km)', 'Tarifa', 'Costo', 'Resultado', 'Estado']} rows={trips.map((trip) => [<strong key={`${trip.id}-id`}>{trip.id}</strong>, trip.client, trip.driver, trip.origin, trip.destination, trip.date, trip.packages, trip.distanceKm !== undefined ? trip.distanceKm.toFixed(1) : '-', <span key={`${trip.id}-fare`}>{trip.estimatedCostCs !== undefined ? formatCs(trip.estimatedCostCs) : '-'}</span>, <span key={`${trip.id}-cost`}>{trip.costCs !== undefined && trip.costCs > 0 ? formatCs(trip.costCs) : '—'}</span>, <ProfitChip key={`${trip.id}-profit`} trip={trip} />, <StatusPill key={`${trip.id}-status`} status={trip.status} />])} />
      </section>
    </>}
    {tab === 'conductores' && <>
      <section className="panel export-panel">
        <div className="export-panel-head"><div><span className="eyebrow">RECURSO HUMANO OPERATIVO</span><h2>Conductores</h2><p>Flota de conductores con su vehículo asignado, estado y ruta actual.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportExcelFile('drivers', 'Conductores')} disabled={exporting !== ''}><Icon name="download" size={13} /> Conductores Excel</button></div></div>
      </section>
      <section className="panel table-panel">
        <DataTable className="drivers-table" columns={['ID', 'Nombre', 'Teléfono', 'Vehículo', 'Placa', 'Estado', 'Ruta', 'Tipo']} rows={drivers.map((driver) => [driver.id, <span key={driver.id}>{driver.name}{driver.external && <span className="badge-external">3P</span>}</span>, driver.phone, driver.vehicle, driver.plate, <StatusPill key={`${driver.id}-status`} status={driver.status} />, driver.route, driver.external ? 'Proveedor tercerizado' : 'Flota propia'])} />
      </section>
    </>}
    {tab === 'clientes' && <>
      <section className="panel export-panel">
        <div className="export-panel-head"><div><span className="eyebrow">BASE COMERCIAL</span><h2>Clientes</h2><p>Empresas y personas con su volumen de viajes y estado de crédito.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportExcelFile('clients', 'Clientes')} disabled={exporting !== ''}><Icon name="download" size={13} /> Clientes Excel</button></div></div>
      </section>
      <section className="panel table-panel">
        <DataTable className="clients-table" columns={['ID', 'Nombre', 'Tipo', 'Teléfono', 'Email', 'Dirección', 'Viajes', 'Solicitudes activas', 'Estado']} rows={clients.map((client) => [client.id, client.name, client.type, client.phone, client.email, client.address ?? '—', client.trips, client.activeRequests, <StatusPill key={`${client.id}-status`} status={client.status} />])} />
      </section>
    </>}
    {tab === 'incidencias' && <>
      <section className="panel export-panel">
        <div className="export-panel-head"><div><span className="eyebrow">CONTROL OPERATIVO</span><h2>Incidencias</h2><p>Eventos registrados en la operación: retrasos, daños, reclamos.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportExcelFile('incidents', 'Incidencias')} disabled={exporting !== ''}><Icon name="download" size={13} /> Incidencias Excel</button></div></div>
      </section>
      <section className="panel table-panel">
        <DataTable className="incidents-table" columns={['ID', 'Viaje', 'Conductor', 'Cliente', 'Tipo', 'Prioridad', 'Estado']} rows={incidents.map((incident) => [incident.id, incident.trip, incident.driver, incident.client, incident.type, <span className={`priority-${incident.priority.toLowerCase()}`} key={incident.id}>{incident.priority}</span>, <StatusPill key={`${incident.id}-status`} status={incident.status} />])} />
      </section>
    </>}
    {tab === 'paquetes' && <>
      <section className="panel export-panel">
        <div className="export-panel-head"><div><span className="eyebrow">GUÍAS DERIVADAS</span><h2>Paquetes</h2><p>Cada paquete hereda el estado y la ruta de su viaje.</p></div><div className="export-buttons"><button className="secondary-button" onClick={() => exportExcelFile('packages', 'Paquetes')} disabled={exporting !== ''}><Icon name="download" size={13} /> Paquetes Excel</button></div></div>
      </section>
      <section className="panel table-panel">
        <DataTable className="packages-table" columns={['Guía', 'Viaje', 'Cliente', 'Peso', 'Dimensiones', 'Estado']} rows={packageRows.map((pkg) => [pkg.id, pkg.trip, pkg.client, pkg.weightDisplay, pkg.dimensions, <StatusPill key={`${pkg.id}-status`} status={pkg.status} />])} />
      </section>
    </>}
  </>
}
function ProfitChip({ trip }: { trip: Trip }) {
  const profit = trip.profitCs
  if (profit === undefined || Number.isNaN(profit)) return <span className="profit-chip neutral" title="Sin costo registrado">—</span>
  const loss = profit < 0
  return <span className={`profit-chip ${loss ? 'loss' : 'gain'}`} title={loss ? `Pérdida: costo C$ ${(trip.costCs ?? 0).toFixed(2)} supera la tarifa` : `Ganancia: tarifa menos costo estimado de operación`}>{loss ? '−' : '+'}{formatCs(Math.abs(profit))}<small className="cell-sub">{loss ? 'pérdida' : 'ganancia'}</small></span>
}

function ChartPanel({ title, values, labels, compact = false, note }: { title: string; values: number[]; labels: string[]; compact?: boolean; note?: string }) {
  const max = Math.max(...values, 1)
  return <section className={`panel chart-panel ${compact ? 'compact' : ''}`}><PanelHeader title={title} action="API" /><div className="chart-bars">{values.map((value, index) => <div className="chart-bar-wrap" key={`${labels[index]}-${value}`}><span className="chart-value">{value}</span><div className="chart-bar" style={{ height: `${(value / max) * 100}%` }} /><small>{labels[index]}</small></div>)}</div>{note && <p className="chart-note">{note}</p>}</section>
}

function Leaderboard({ title, entries, note }: { title: string; entries: Array<{ name: string; trips: number }>; note?: string }) {
  return <section className="panel leaderboard"><PanelHeader title={title} action="API" /><ol>{entries.map((entry, index) => <li key={entry.name}><span className="rank">{index + 1}</span><span className="mini-avatar">{initials(entry.name)}</span><strong>{entry.name}</strong><span className="bar"><i style={{ width: `${Math.max(20, 100 - index * 14)}%` }} /></span><b>{entry.trips} viajes</b></li>)}</ol>{note && <p className="chart-note">{note}</p>}</section>
}

function PackagesView({ trips, onNavigate }: { trips: Trip[]; onNavigate: (section: Section) => void }) {
  const [detailPkg, setDetailPkg] = useState<{ id: string; trip: string; client: string; weightDisplay: string; dimensions: string; status: TripStatus } | null>(null)
  const packageRows = trips.flatMap((trip) => Array.from({ length: Math.min(trip.packages, 3) }, (_, index) => {
    const weightKg = trip.weight ?? (1 + ((trip.packages + index) % 24))
    const weightDisplay = trip.weightUnit === 'lb' ? `${(weightKg * 2.20462).toFixed(1)} lb` : `${weightKg.toFixed(1)} kg`
    return { id: `PKG-${trip.id.replace('#', '')}-${index + 1}`, trip: trip.id, client: trip.client, weightDisplay, dimensions: `${30 + index * 5}×${20 + index * 4}×${15 + index * 3} cm`, status: trip.status }
  }))
  const inTransit = packageRows.filter((pkg) => ['Asignado', 'En camino', 'En entrega'].includes(pkg.status)).length
  function exportExcelFile() {
    exportExcel(`incoex-paquetes-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Paquetes', packageRows.map((pkg) => ({ 'Guía': pkg.id, 'Viaje': pkg.trip, 'Cliente': pkg.client, 'Peso': pkg.weightDisplay, 'Dimensiones': pkg.dimensions, 'Estado': pkg.status })))
  }
  function exportPdfFile() {
    exportPdf('Paquetes · INCOEX Logistics', 'Guías derivadas de los viajes registrados en la operación de Managua', ['Guía', 'Viaje', 'Cliente', 'Peso', 'Dimensiones', 'Estado'], packageRows.map((pkg) => [pkg.id, pkg.trip, pkg.client, pkg.weightDisplay, pkg.dimensions, pkg.status]))
  }
  return <>
    <div className="driver-summary"><SummaryValue label="Paquetes visibles" value={String(packageRows.length)} /><SummaryValue label="En tránsito" value={String(inTransit)} tone="blue" /><SummaryValue label="Entregados" value={String(packageRows.filter((pkg) => pkg.status === 'Completado').length)} tone="mint" /><SummaryValue label="Pendientes" value={String(packageRows.filter((pkg) => pkg.status === 'Pendiente').length)} tone="gold" /></div>
    <section className="panel table-panel"><div className="table-toolbar"><div className="summary-inline"><span className="green-dot" /> Cada paquete hereda el estado y la ruta de su viaje</div><div className="action-group toolbar-actions"><button className="secondary-button" onClick={exportExcelFile}><Icon name="download" size={13} /> Excel</button><button className="secondary-button" onClick={exportPdfFile}><Icon name="fileText" size={13} /> PDF</button></div></div>
    <DataTable columns={['Guía', 'Viaje', 'Cliente', 'Peso', 'Dimensiones', 'Estado']} rows={packageRows.map((pkg) => [<strong className="linkish" key={`${pkg.id}-id`} onClick={() => setDetailPkg(pkg)}>{pkg.id}</strong>, pkg.trip, pkg.client, pkg.weightDisplay, pkg.dimensions, <StatusPill key={`${pkg.id}-status`} status={pkg.status} />])} />
    <div className="table-footer"><span>{packageRows.length} paquetes derivados de {trips.length} viajes · clic en la guía para ver el detalle · el peso puede registrarse en kg o libras según el cliente</span></div></section>
    {detailPkg && (
      <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailPkg(null) }}>
        <div className="modal-card trip-detail-modal">
          <div className="modal-header"><div><span className="eyebrow">Detalle del paquete · {detailPkg.id}</span><h2>{detailPkg.client}</h2><p>Guía vinculada al viaje {detailPkg.trip}</p></div><button type="button" className="icon-button" onClick={() => setDetailPkg(null)} aria-label="Cerrar">×</button></div>
          <div className="trip-detail-grid">
            <div className="trip-detail-field"><span>Guía</span><strong>{detailPkg.id}</strong></div>
            <div className="trip-detail-field"><span>Peso</span><strong>{detailPkg.weightDisplay}</strong></div>
            <div className="trip-detail-field"><span>Dimensiones</span><strong>{detailPkg.dimensions}</strong></div>
            <div className="trip-detail-field"><span>Estado</span><StatusPill status={detailPkg.status} /></div>
          </div>
          <p className="trip-detail-note">El paquete sigue la ruta y el estado del viaje {detailPkg.trip}. Cuando la validación física de la tienda esté conectada, aquí se mostrarán fotos, peso real y la persona que recibió.</p>
          <div className="modal-actions"><button className="secondary-button" onClick={() => { setDetailPkg(null); onNavigate('trips') }}><Icon name="trips" size={13} /> Ver viaje {detailPkg.trip}</button><button className="secondary-button" onClick={() => setDetailPkg(null)}>Cerrar</button></div>
        </div>
      </div>
    )}
  </>
}

function TrackingView({ tracking, onNavigate, onRefresh }: { tracking: TrackingOverview | null; onNavigate: (section: Section) => void; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 600) }, 20000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(onRefresh, 20000)
    return () => window.clearInterval(timer)
  }, [onRefresh])
  if (!tracking) return <EmptyState title="Tracking pendiente" detail="La API aún no entregó posiciones operativas." />
  const withRoute = tracking.trips.filter((trip) => Number.isFinite(trip.originLat) && Number.isFinite(trip.destinationLat))
  const onlineCount = (tracking.live ?? []).filter((position) => position.online).length
  const realCount = (tracking.live ?? []).filter((position) => position.online && !position.demo).length
  const lastUpdate = tracking.trackingAt ? new Date(tracking.trackingAt).toLocaleTimeString('es-NI') : '—'
  return <section className="panel full-map-panel"><div className="tracking-head"><div><span className="eyebrow">LIVE OPERATIONS · POSICIONES EN TIEMPO REAL</span><h2>Mapa de flota · Managua</h2><p className="panel-sub">La app móvil del conductor reporta su GPS cada ~20 s (mientras está abierta). Los puntos “demo” son posiciones de referencia de la API y se apagan solos si no llega señal real.</p></div><div className="tracking-stats"><span className="tracking-stat"><span className="pulse-dot" /> {tracking.activeOperations} operaciones activas</span><span className="tracking-stat"><i className="legend mint" /> {onlineCount} conductores en línea{realCount > 0 ? ` (${realCount} con GPS real)` : ''}</span><span className="tracking-stat"><i className="legend cyan" /> {withRoute.length} rutas dibujadas</span><span className="tracking-stat">actualizado {lastUpdate}{refreshing ? ' · refrescando…' : ''}</span></div></div><div className="large-map"><LiveMap tracking={tracking} onNavigate={onNavigate} /><div className="tracking-cards"><button className="tracking-card" onClick={() => onNavigate('trips')}><strong>{tracking.trips[0]?.id ?? 'Sin viaje activo'}</strong><span>{tracking.trips[0]?.driver ?? 'Sin asignar'} · {tracking.trips[0]?.status ?? 'Pendiente'}</span><span>{tracking.trips[0]?.origin ?? '—'} → {tracking.trips[0]?.destination ?? '—'}</span></button><button className="tracking-card second" onClick={() => onNavigate('trips')}><strong>{tracking.trips[1]?.id ?? 'Sin segundo viaje'}</strong><span>{tracking.trips[1]?.driver ?? 'Sin asignar'} · {tracking.trips[1]?.status ?? 'Pendiente'}</span><span>{tracking.trips[1]?.origin ?? '—'} → {tracking.trips[1]?.destination ?? '—'}</span></button></div><div className="map-legend large"><span><i className="legend blue" />En ruta</span><span><i className="legend mint" />Disponible</span><span><i className="legend violet" />Entrega</span><span><i className="legend red" />Incidencia</span><span><i className="legend cyan" />Ruta de viaje</span><span><i className="legend gray" />Fuera de línea</span></div></div></section>
}

function HistoryView({ history }: { history: HistoryEvent[] }) {
  const [typeFilter, setTypeFilter] = useState<'all' | HistoryEvent['type']>('all')
  const types = Array.from(new Set(history.map((event) => event.type)))
  const filtered = typeFilter === 'all' ? history : history.filter((event) => event.type === typeFilter)
  function exportPdfFile() {
    exportPdf('Historial de operaciones · INCOEX Logistics', 'Bitácora de despachos, asignaciones e incidencias', ['Hora', 'Fecha', 'Tipo', 'Evento', 'Detalle'], filtered.map((event) => [event.time, event.date, event.type, event.title, event.detail]))
  }
  return <><div className="table-toolbar history-toolbar"><div className="filter-row"><button className={`filter-chip ${typeFilter === 'all' ? 'active' : ''}`} onClick={() => setTypeFilter('all')}>Todo <b>{history.length}</b></button>{types.map((type) => <button key={type} className={`filter-chip ${typeFilter === type ? 'active' : ''}`} onClick={() => setTypeFilter(type)}>{type} <b>{history.filter((event) => event.type === type).length}</b></button>)}</div><button className="secondary-button" onClick={exportPdfFile}><Icon name="fileText" size={13} /> Exportar PDF</button></div><section className="panel history-panel"><PanelHeader title="Historial de operaciones" action="API" /><div className="timeline">{filtered.map((event) => <div className="timeline-row" key={event.id}><span className="timeline-time">{event.time}<small>{event.date}</small></span><span className={`timeline-dot ${event.color}`} /><div className="timeline-event"><strong>{event.title}</strong><span>{event.detail}</span></div></div>)}</div>{filtered.length === 0 && <EmptyState title="Sin eventos de este tipo" detail="Cambia el filtro para ver más actividad." />}</section></>
}

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
  const implementedPercent = summary.total ? Math.round(((summary.done + summary.in_progress) / summary.total) * 100) : 0
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
    { id: 'api', step: '01', title: 'API desplegada (Render)', detail: 'Producción · https://plt-api-01-sep-sn.onrender.com', command: 'https://plt-api-01-sep-sn.onrender.com/api/health\n\n# La API duerme si no recibe tráfico:\n# la primera petición puede tardar ~40 s.' },
    { id: 'web', step: '02', title: 'Panel web', detail: 'Vercel · conectado a la API de Render', command: 'https://plt-web-01-sep-sn.vercel.app' },
    { id: 'local', step: '03', title: 'Desarrollo local', detail: 'API NestJS en el puerto 3000 (alternativa)', command: 'cd .\\api-incoex\nnpm install\n$env:INCOEX_DB_PATH = "$PWD\\data\\incoex-local.sqlite"\nnpm run start:dev\n\n# en la web (otra terminal):\ncd .\\web\n$env:VITE_API_URL = "http://localhost:3000/api"\nnpm run dev' },
    { id: 'flutter', step: '04', title: 'App Flutter', detail: 'Emulador Android contra la API', command: 'cd .\\apps\nflutter pub get\nflutter run --dart-define=INCOEX_API_URL=https://plt-api-01-sep-sn.onrender.com/api' },
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
      <div className="report-hero-side"><div className="report-progress"><strong>{implementedPercent}%</strong><span>avance implementado</span><div><i style={{ width: `${implementedPercent}%` }} /></div><small className="progress-detail">{verifiedPercent}% verificado con evidencia · {summary.in_progress} en desarrollo · {summary.review + summary.backlog} pendientes de {summary.total}</small></div><button className="primary-button" onClick={() => { onNotice('Selecciona “Guardar como PDF” para compartir el informe'); window.print() }}>Imprimir / guardar PDF</button></div>
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
      <div className="launch-heading"><div><span className="eyebrow">GUÍA TÉCNICA · DESPLIEGUE</span><h2>Dónde está corriendo el proyecto</h2><p>La API vive en Render y el panel web consume ese servicio directamente; los bloques de desarrollo local quedan como alternativa para trabajar sin conexión al despliegue.</p></div><span className="launch-badge"><span className="pulse-dot" /> API en Render</span></div>
      <div className="command-grid">{launchCommands.map((item) => <article className="command-card" key={item.id}><div className="command-card-head"><span className="command-step">{item.step}</span><div><h3>{item.title}</h3><small>{item.detail}</small></div><button className="copy-button" onClick={() => void copyCommand(item.command, item.title)} aria-label={`Copiar ${item.title}`}>⧉ Copiar</button></div><pre><code>{item.command}</code></pre></article>)}</div>
      <div className="launch-footnote"><strong>Web:</strong> <span>https://plt-web-01-sep-sn.vercel.app</span><b>·</b><strong>API:</strong> <span>https://plt-api-01-sep-sn.onrender.com/api</span><b>·</b><strong>Reporte:</strong> <span>menú Entregables</span></div>
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

function OperationsInvoices({ kind, trips, clients, drivers, vehicles, settings, onNotice }: { kind: 'clients' | 'suppliers'; trips: Trip[]; clients: Client[]; drivers: Driver[]; vehicles: Vehicle[]; settings: AppSettings | null; onNotice: (message: string) => void }) {
  const externalDrivers = new Set(drivers.filter((driver) => driver.external).map((driver) => driver.name))
  const externalPlates = new Set(vehicles.filter((vehicle) => vehicle.external).map((vehicle) => vehicle.plate))
  const source = trips.filter((trip) => trip.estimatedCostCs !== undefined && trip.status !== 'Cancelado' && trip.status !== 'Anulado').filter((trip) => {
    if (kind === 'clients') return true
    const plate = drivers.find((driver) => driver.name === trip.driver)?.plate ?? ''
    return externalDrivers.has(trip.driver) || externalPlates.has(plate)
  })
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all')
  const visible = source.filter((trip) => filter === 'all' || (filter === 'paid' ? (trip.paymentStatus ?? 'Sin pagar') === 'Pagado' : trip.paymentStatus !== 'Pagado'))
  const totalCs = source.reduce((sum, trip) => sum + (trip.estimatedCostCs ?? 0), 0)
  const paidCs = source.reduce((sum, trip) => sum + (trip.paymentAmount ?? 0), 0)
  const pendingCs = source.reduce((sum, trip) => sum + ((trip.paymentStatus ?? 'Sin pagar') === 'Pagado' ? 0 : (trip.estimatedCostCs ?? 0)), 0)
  return <>
    <div className="driver-summary">
      <SummaryValue label={kind === 'clients' ? 'Facturas a clientes' : 'Facturas de proveedores'} value={String(source.length)} />
      <SummaryValue label="Facturado" value={formatCs(totalCs)} tone="blue" />
      <SummaryValue label="Cobrado" value={formatCs(paidCs)} tone="mint" />
      <SummaryValue label="Pendiente de cobro" value={formatCs(pendingCs)} tone="gold" />
    </div>
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="filter-row">
          <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todas <b>{source.length}</b></button>
          <button className={`filter-chip ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>Pendientes <b>{source.filter((trip) => trip.paymentStatus !== 'Pagado').length}</b></button>
          <button className={`filter-chip ${filter === 'paid' ? 'active' : ''}`} onClick={() => setFilter('paid')}>Pagadas <b>{source.filter((trip) => trip.paymentStatus === 'Pagado').length}</b></button>
        </div>
        <span className="source-badge">{kind === 'clients' ? 'C$ · facturas operativas' : 'vehículos y conductores 3P'}</span>
      </div>
      <DataTable className="invoices-table" columns={['Factura', 'Solicitud', kind === 'clients' ? 'Cliente' : 'Proveedor 3P', 'Fecha', 'Total C$', 'Pago', 'Cobro', 'Acciones']} rows={visible.map((trip) => {
        const plate = drivers.find((driver) => driver.name === trip.driver)?.plate ?? ''
        const supplier = kind === 'clients' ? trip.client : (externalDrivers.has(trip.driver) ? `${trip.driver} · ${plate || '—'}` : vehicles.find((vehicle) => vehicle.plate === plate)?.model ?? trip.driver)
        const paid = trip.paymentStatus ?? 'Sin pagar'
        return [<strong className="linkish" key={`${trip.id}-inv`}>{`FAC-${trip.id.replace('#', '')}`}</strong>, trip.id, <span key={`${trip.id}-sup`}>{supplier}</span>, trip.date, <b key={`${trip.id}-tot`}>{formatCs(trip.estimatedCostCs ?? 0)}</b>, <span key={`${trip.id}-pay`}><span className={`payment-chip ${paid.toLowerCase()}`}>{paid === 'Sin pagar' ? 'Sin pago' : paid}</span>{trip.paymentMethod ? <small className="cell-sub">{trip.paymentMethod}</small> : null}</span>, trip.dueDate || '—', <div className="action-group" key={`${trip.id}-acts`}><button title="Ver y descargar factura PDF" onClick={() => openInvoicePrint(trip, clients.find((client) => client.name === trip.client), settings, null)}><Icon name="fileText" size={14} /></button></div>]
      })} />
      <div className="table-footer"><span>Las facturas se generan desde los viajes completados o en curso; anular un viaje retira su valor del total{kind === 'suppliers' ? '. Proveedores identificados con el badge 3P en conductores y vehículos.' : '.'}</span></div>
    </section>
  </>
}

function BillingView({ trips, clients, drivers, vehicles, settings, onNotice }: { trips: Trip[]; clients: Client[]; drivers: Driver[]; vehicles: Vehicle[]; settings: AppSettings | null; onNotice: (message: string) => void }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(BILLING_SESSION_KEY) === '1')
  if (!unlocked) return <BillingLock onUnlocked={() => { sessionStorage.setItem(BILLING_SESSION_KEY, '1'); setUnlocked(true); onNotice('Acceso financiero concedido · Bienvenido, Mario Martínez') }} />
  return <BillingContent trips={trips} clients={clients} drivers={drivers} vehicles={vehicles} settings={settings} onLock={() => { sessionStorage.removeItem(BILLING_SESSION_KEY); setUnlocked(false); onNotice('Sesión financiera bloqueada') }} onNotice={onNotice} />
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

function BillingContent({ trips, clients, drivers, vehicles, settings, onLock, onNotice }: { trips: Trip[]; clients: Client[]; drivers: Driver[]; vehicles: Vehicle[]; settings: AppSettings | null; onLock: () => void; onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<'proyecto' | 'clientes' | 'proveedores' | 'cortes'>('proyecto')
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

    <div className="billing-tabs">
      <button className={`filter-chip ${tab === 'proyecto' ? 'active' : ''}`} onClick={() => setTab('proyecto')}>Proyecto <b>pagos</b></button>
      <button className={`filter-chip ${tab === 'clientes' ? 'active' : ''}`} onClick={() => setTab('clientes')}>Facturas a clientes <b>{trips.filter((trip) => trip.status !== 'Cancelado' && trip.status !== 'Anulado').length}</b></button>
      <button className={`filter-chip ${tab === 'proveedores' ? 'active' : ''}`} onClick={() => setTab('proveedores')}>Proveedores · tercerizados <b>3P</b></button>
      <button className={`filter-chip ${tab === 'cortes' ? 'active' : ''}`} onClick={() => setTab('cortes')}>Cortes de pago <b>recibos</b></button>
    </div>

    {tab === 'proyecto' && (<>

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
    </>)}

    {tab === 'clientes' && <OperationsInvoices kind="clients" trips={trips} clients={clients} drivers={drivers} vehicles={vehicles} settings={settings} onNotice={onNotice} />}
    {tab === 'proveedores' && <OperationsInvoices kind="suppliers" trips={trips} clients={clients} drivers={drivers} vehicles={vehicles} settings={settings} onNotice={onNotice} />}
    {tab === 'cortes' && <CortesView clients={clients} onNotice={onNotice} />}
  </>
}

const CUT_DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
function periodLabelOf(client?: Client | null) {
  if (client?.billingPeriod === 'quincenal') return 'Quincenal'
  if (client?.billingPeriod === 'mensual') return 'Mensual'
  if (client?.billingPeriod === 'personalizado') return 'Cada ' + (client.billingCustomDays ?? 7) + ' días'
  if ((client?.billingPeriod ?? 'semanal') === 'semanal') return 'Semanal'
  return 'Sin periodo'
}
function cutLabelOf(client?: Client | null) {
  if (!client) return ''
  if (client.billingPeriod === 'mensual') return (client.billingCutDay ?? 1) + ' de cada mes, ' + (client.billingCutTime ?? '22:00')
  return (CUT_DAY_NAMES[client.billingCutDay ?? 0] ?? 'Domingo') + ', ' + (client.billingCutTime ?? '22:00')
}
function formatCorteDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' })
}
function clientByName(clients: Client[], name: string) {
  return clients.find((client) => client.name.trim().toLowerCase() === name.trim().toLowerCase())
}
function waLink(phone: string | undefined, message: string) {
  const raw = (phone ?? '').replace(/\D/g, '')
  if (!raw) return ''
  let wa = raw.replace(/^0+/, '')
  if (!/^505/.test(wa)) wa = '505' + wa
  return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(message)
}
function waLinkOf(corte: Corte, client?: Client) {
  const raw = (client?.whatsapp || client?.phone || '').replace(/\D/g, '')
  let wa = raw.replace(/^0+/, '')
  if (!/^505/.test(wa)) wa = '505' + wa
  const items = corte.items.slice(0, 30).map((item) => '  ' + item.id + '  ' + item.date + '  ' + item.origin + ' -> ' + item.destination + '  C$' + item.priceCs.toFixed(2)).join('\n')
  const message = [
    'CORTE DE PAGO - ' + (client?.name ?? corte.client).toUpperCase(),
    'INCOEX Logistics',
    '',
    'Periodo: ' + formatCorteDate(corte.periodStart) + ' hasta ' + formatCorteDate(corte.periodEnd) + ' (' + (corte.periodLabel || periodLabelOf(client)) + ')',
    '',
    'Viajes del periodo: ' + corte.items.length,
    'Total del periodo: C$' + corte.totalCs.toFixed(2) + ' cordobas',
    corte.previousDebtCs > 0 ? 'Saldo anterior: C$' + corte.previousDebtCs.toFixed(2) + ' cordobas' : '',
    'TOTAL A PAGAR: C$' + corte.grandTotalCs.toFixed(2) + ' cordobas',
    '',
    items,
    '',
    'Este es su recibo de deuda acumulada. Puede coordinar su pago respondiendo este mensaje.',
  ].filter(Boolean).join('\n')
  return 'https://wa.me/' + wa + '?text=' + encodeURIComponent(message)
}
function printCorteReceipt(corte: Corte, client?: Client) {
  const rowHtml = corte.items.map((item) => '<tr><td>' + item.id + '</td><td>' + item.date + '</td><td>' + item.origin + ' &rarr; ' + item.destination + '</td><td style="text-align:right">C$ ' + item.priceCs.toFixed(2) + '</td></tr>').join('')
  const doc = [
    '<!doctype html><html><head><meta charset="utf-8"><title>Recibo de corte - ' + (client?.name ?? corte.client) + '</title>',
    '<style>@page{margin:14mm} body{font:13px "Acumin Pro",Arial,sans-serif;color:#101230} .head{display:flex;justify-content:space-between;border-bottom:3px solid #32AAF0;padding-bottom:12px} .brand{font-size:23px;font-weight:800;letter-spacing:.16em;color:#0d75b3} .brand span{display:block;color:#6e6a78;font-size:11px;letter-spacing:.06em} h1{font-size:19px;margin:16px 0 2px} .meta{font-size:12px;color:#6e6a78} table{width:100%;border-collapse:collapse;margin-top:12px} th{padding:8px;border-top:1px solid #DED9E2;border-bottom:2px solid #DED9E2;color:#6e6a78;font-size:10px;letter-spacing:.08em;text-align:left} td{padding:7px 8px;border-bottom:1px solid #ECE8F0;font-size:12px} .totals{margin:14px 0 0 auto;width:300px} .totals div{display:flex;justify-content:space-between;padding:6px 4px;color:#504b59;font-size:12.5px} .totals .grand{border-top:2px solid #32AAF0;color:#101230;font-weight:800} .stamp{margin-top:8px;font-size:10px;color:#6e6a78}</style></head><body>',
    '<div class="head"><div class="brand">INCOEX<span>LOGISTICS &middot; MANAGUA</span></div><div><h1>Recibo de corte</h1><div class="meta">Periodo ' + formatCorteDate(corte.periodStart) + ' al ' + formatCorteDate(corte.periodEnd) + ' &middot; ' + (corte.periodLabel || periodLabelOf(client)) + '</div></div></div>',
    '<p><b>' + (client?.name ?? corte.client) + '</b> <span class="meta">(' + (client?.type ?? '') + ')</span><br><span class="meta">' + (client?.address ?? '') + '</span></p>',
    '<table><thead><tr><th>Viaje</th><th>Fecha</th><th>Ruta</th><th>Monto</th></tr></thead><tbody>' + rowHtml + '</tbody></table>',
    '<div class="totals"><div><span>Total del periodo</span><b>C$ ' + corte.totalCs.toFixed(2) + '</b></div>' + (corte.previousDebtCs > 0 ? '<div><span>Saldo anterior (deuda acumulada)</span><b>C$ ' + corte.previousDebtCs.toFixed(2) + '</b></div>' : '') + '<div class="grand"><span>TOTAL A PAGAR</span><span>C$ ' + corte.grandTotalCs.toFixed(2) + '</span></div></div>',
    '<div class="stamp">' + (corte.status === 'pagado' ? 'Pagado el ' + formatCorteDate(corte.paidAt ?? corte.createdAt) + (corte.method ? ' &middot; ' + corte.method : '') : (corte.status === 'anulado' ? 'Anulado' : 'Por cobrar')) + (corte.notes ? ' &middot; ' + corte.notes : '') + '</div>',
    '</body></html>',
  ].join('')
  const win = window.open('', '_blank', 'width=820,height=940')
  if (win) { win.document.write(doc); win.document.close(); win.focus(); win.print() }
}
function CorteChip({ corte }: { corte: Corte }) {
  const label = corte.status === 'pagado' ? 'Pagado' : corte.status === 'anulado' ? 'Anulado' : corte.sentWhatsapp ? 'Pendiente · WA enviado' : 'Pendiente · por enviar'
  return <span className={'corte-chip ' + corte.status}>{label}</span>
}
function CortesView({ clients, onNotice }: { clients: Client[]; onNotice: (message: string) => void }) {
  const [cortes, setCortes] = useState<Corte[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | Corte['status']>('all')
  const [acting, setActing] = useState('')
  const [detail, setDetail] = useState<Corte | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  async function refresh() {
    try {
      setCortes(await getCortes(statusFilter === 'all' ? {} : { status: statusFilter }))
    } catch {
      onNotice('No se pudieron cargar los cortes')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [statusFilter])
  const pending = cortes.filter((corte) => corte.status === 'pendiente')
  const paid = cortes.filter((corte) => corte.status === 'pagado')
  const pendingTotal = pending.reduce((sum, corte) => sum + corte.grandTotalCs, 0)
  function openReceipt(corte: Corte) { setDetail(corte) }
  return <>
    <section className="panel export-panel">
      <div className="export-panel-head">
        <div>
          <span className="eyebrow">RECIBO DE DEUDA ACUMULADA</span>
          <h2>Cortes de pago por cliente</h2>
          <p>Cada cliente con corte automático recibe su recibo al vencer su periodo (semanal, quincenal, mensual o el que definas). El recibo suma los viajes del periodo y el saldo anterior no pagado. Se genera <b>solo el día del corte a la hora configurada</b> (domingo 22:00 por defecto) o cuando lo dispares manualmente; luego se lo envías por WhatsApp desde aquí y el cliente lo ve también en su app.</p>
        </div>
        <div className="billing-summary-grid cortes-summary">
          <div className="metric-card"><span className="metric-label">Cortes pendientes</span><strong className="metric-value" style={{ fontSize: 22 }}>{pending.length}</strong><small style={{ fontSize: 11 }}>por cobrar: <b>{formatCs(pendingTotal)}</b></small></div>
          <div className="metric-card"><span className="metric-label">Pagados</span><strong className="metric-value" style={{ fontSize: 22 }}>{paid.length}</strong><small style={{ fontSize: 11 }}>{paid.reduce((sum, corte) => sum + (corte.paidAmountCs ?? 0), 0) > 0 ? formatCs(paid.reduce((sum, corte) => sum + (corte.paidAmountCs ?? 0), 0)) : 'sin registros'}</small></div>
          <div className="metric-card"><span className="metric-label">Clientes con corte</span><strong className="metric-value" style={{ fontSize: 22 }}>{clients.filter((client) => client.billingActive).length}</strong><small style={{ fontSize: 11 }}>corte automático activado</small></div>
        </div>
        <div className="export-buttons" style={{ alignSelf: 'flex-end' }}>
          <button className="secondary-button" onClick={() => setGenerateOpen(true)}><Icon name="activity" size={13} /> Generar corte ahora</button>
        </div>
      </div>
    </section>
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div className="filter-row">
          <button className={`filter-chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>Todos <b>{cortes.length}</b></button>
          <button className={`filter-chip ${statusFilter === 'pendiente' ? 'active' : ''}`} onClick={() => setStatusFilter('pendiente')}>Pendientes <b>{pending.length}</b></button>
          <button className={`filter-chip ${statusFilter === 'pagado' ? 'active' : ''}`} onClick={() => setStatusFilter('pagado')}>Pagados <b>{paid.length}</b></button>
        </div>
        <span className="source-badge">{loading ? 'cargando…' : 'cortes reales de la operación'}</span>
      </div>
      <DataTable className="cortes-table" columns={['ID', 'Cliente', 'Periodo', 'Viajes', 'Total periodo', 'Saldo anterior', 'Total a pagar', 'Estado', 'Acciones']} rows={cortes.map((corte) => {
        const client = clientByName(clients, corte.client)
        return [
          <strong className="linkish" key={corte.id} onClick={() => openReceipt(corte)}>{corte.id.split('-').slice(0, 2).join('-')}</strong>,
          <span key={corte.id + '-c'}><b>{corte.client}</b><small className="cell-sub">{periodLabelOf(client)}{client ? ' · corte ' + cutLabelOf(client) : ''}</small></span>,
          formatCorteDate(corte.periodStart) + ' → ' + formatCorteDate(corte.periodEnd),
          corte.items.length,
          <b key={corte.id + '-total'}>{formatCs(corte.totalCs)}</b>,
          <span key={corte.id + '-prev'} className={corte.previousDebtCs > 0 ? 'text-danger' : 'muted'}>{corte.previousDebtCs > 0 ? formatCs(corte.previousDebtCs) : '—'}</span>,
          <b key={corte.id + '-grand'} className={corte.previousDebtCs > 0 ? 'text-danger' : ''}>{formatCs(corte.grandTotalCs)}</b>,
          <CorteChip key={corte.id + '-chip'} corte={corte} />,
          <div className="action-group" key={corte.id + '-actions'}>
            <button title="Ver recibo" onClick={() => openReceipt(corte)}><Icon name="eye" size={14} /></button>
            {corte.status === 'pendiente' && <button title="Enviar por WhatsApp" onClick={() => { window.open(waLinkOf(corte, client), '_blank'); void markCorteSent(corte.id).then(() => { setActing(''); void refresh() }).catch(() => setActing('')); setActing(corte.id); onNotice('WhatsApp de ' + corte.client + ' abierto con su recibo') }}><Icon name="send" size={14} /></button>}
            {corte.status === 'pendiente' && <button title="Imprimir recibo" onClick={() => printCorteReceipt(corte, client)}><Icon name="print" size={14} /></button>}
          </div>,
        ]
      })} />
      <div className="table-footer"><span>Mostrando {cortes.length} cortes · la generación automática corre cada minuto en la API y corta al vencer el periodo de cada cliente</span></div>
    </section>
    {detail && <CorteReceiptModal corte={detail} clients={clients} onClose={() => setDetail(null)} onChanged={(next) => { setDetail(next); void refresh() }} onNotice={onNotice} />}
    {generateOpen && <GenerateCorteModal clients={clients} onClose={() => setGenerateOpen(false)} onDone={() => { setGenerateOpen(false); void refresh() }} onNotice={onNotice} />}
  </>
}
function CorteReceiptModal({ corte, clients, onClose, onChanged, onNotice }: { corte: Corte; clients: Client[]; onClose: () => void; onChanged: (corte: Corte) => void; onNotice: (message: string) => void }) {
  const client = clientByName(clients, corte.client)
  const [paying, setPaying] = useState(false)
  const [amountCs, setAmountCs] = useState(corte.grandTotalCs)
  const [method, setMethod] = useState('Transferencia')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  async function pay() {
    setBusy(true)
    try {
      const next = await payCorte(corte.id, { amountCs, method, notes })
      onChanged(next)
      onNotice('Corte de ' + corte.client + ' marcado como pagado por ' + method + ' (C$ ' + (next.paidAmountCs ?? amountCs).toFixed(2) + ')')
    } catch {
      onNotice('No se pudo registrar el pago')
    } finally {
      setBusy(false)
      setPaying(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card wide">
        <div className="modal-header"><div><span className="eyebrow">Recibo de corte · {corte.periodLabel || periodLabelOf(client)}</span><h2>{corte.client}</h2><p>Periodo del {formatCorteDate(corte.periodStart)} al {formatCorteDate(corte.periodEnd)} · generado {formatCorteDate(corte.createdAt)}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <div className="corte-receipt">
          <div className="corte-receipt-head"><span className="corte-receipt-brand">INCOEX<span>LOGISTICS · MANAGUA</span></span><CorteChip corte={corte} /></div>
          <div className="corte-receipt-client"><b>{corte.client}</b><small>{client?.type ?? ''}{client?.address ? ' · ' + client.address : ''}</small></div>
          <div className="invoice-items">
            <div className="invoice-item head"><span>Viaje</span><span>Fecha</span><span>Detalle</span><span style={{ textAlign: 'right' }}>Monto</span><span></span></div>
            {corte.items.length === 0 && <div className="invoice-item"><span>—</span><span>—</span><span>Sin viajes facturables en este periodo</span><span style={{ textAlign: 'right' }}>C$ 0.00</span><span></span></div>}
            {corte.items.map((item) => <div className="invoice-item" key={item.id}><span><b className="linkish">{item.id}</b></span><span>{item.date}</span><span>{item.origin} → {item.destination}</span><span style={{ textAlign: 'right' }}>C$ {item.priceCs.toFixed(2)}</span><span></span></div>)}
          </div>
          <div className="invoice-totals">
            <div><span>Total del periodo ({corte.items.length} viajes)</span><b>C$ {corte.totalCs.toFixed(2)}</b></div>
            {corte.previousDebtCs > 0 && <div><span>Saldo anterior (deuda acumulada)</span><b className="text-danger">C$ {corte.previousDebtCs.toFixed(2)}</b></div>}
            <div className="invoice-total"><span>TOTAL A PAGAR</span><b>C$ {corte.grandTotalCs.toFixed(2)}</b></div>
            {corte.status === 'pagado' && <div><span>Pagado ({corte.paidAt ? formatCorteDate(corte.paidAt) : ''}{corte.method ? ' · ' + corte.method : ''})</span><b className="muted">C$ {(corte.paidAmountCs ?? 0).toFixed(2)}</b></div>}
          </div>
        </div>
        {paying ? (
          <div className="payment-strip" style={{ margin: '14px 0 0' }}>
            <div className="payment-form">
              <input type="number" min={0} value={amountCs} onChange={(event) => setAmountCs(Number(event.target.value))} placeholder="Monto C$" />
              <select value={method} onChange={(event) => setMethod(event.target.value)}><option>Efectivo</option><option>Transferencia</option><option>Depósito</option><option>Tarjeta</option></select>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Nota (opcional)" />
              <button className="primary-mini" disabled={busy || amountCs <= 0} onClick={() => void pay()}>{busy ? 'Guardando…' : 'Confirmar pago'}</button>
            </div>
          </div>
        ) : (
          <div className="modal-actions trip-actions">
            {corte.status === 'pendiente' && <button className="primary-button" onClick={() => setPaying(true)}><Icon name="checkCircle" size={13} /> Registrar pago</button>}
            {corte.status === 'pendiente' && <button className="secondary-button" onClick={() => { window.open(waLinkOf(corte, client), '_blank'); void markCorteSent(corte.id).then(() => onNotice('Marcado como enviado por WhatsApp')).catch(() => undefined) }} disabled={busy}><Icon name="send" size={13} /> Enviar a WhatsApp</button>}
            <button className="secondary-button" onClick={() => printCorteReceipt(corte, client)}><Icon name="print" size={13} /> Imprimir recibo</button>
            {corte.status === 'pendiente' && <button className="secondary-button danger" onClick={() => { if (window.confirm('¿Anular este corte? El cliente quedará sin recibir este recibo.')) void annulCorte(corte.id).then((next) => { onChanged(next); onNotice('Corte anulado') }).catch(() => onNotice('No se pudo anular')) }} disabled={busy}><Icon name="trash" size={13} /> Anular</button>}
            <button className="secondary-button" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  )
}
function GenerateCorteModal({ clients, onClose, onDone, onNotice }: { clients: Client[]; onClose: () => void; onDone: () => void; onNotice: (message: string) => void }) {
  const active = clients.filter((client) => client.billingActive)
  const [clientName, setClientName] = useState('')
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      const result = await generateCortes(clientName || undefined)
      onDone()
      onNotice(clientName ? 'Corte de ' + clientName + ' generado' : result.count > 0 ? result.count + ' cortes generados según su periodo' : 'No hay cortes vencidos por generar (la ventana sigue abierta)')
    } catch {
      onNotice('No se pudo generar el corte')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-card">
        <div className="modal-header"><div><span className="eyebrow">COBRO PERIÓDICO</span><h2>Generar corte</h2><p>Aplica el corte vencido de cada cliente con periodo activo, o elige uno específico para cerrar su ventana ahora mismo.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <div className="form-grid">
          <label className="full-field">Cliente<select value={clientName} onChange={(event) => setClientName(event.target.value)}><option value="">Todos los clientes con corte activo ({active.length})</option>{active.map((client) => <option value={client.name} key={client.id}>{client.name} · {periodLabelOf(client)}, corte {cutLabelOf(client)}</option>)}</select></label>
        </div>
        <p className="wizard-hint">El corte acumula los viajes desde las 10:01 pm del corte anterior hasta las 9:59 pm del corte actual y suma el saldo anterior no pagado.</p>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} onClick={() => void run()}>{busy ? 'Generando…' : 'Generar ahora'}</button></div>
      </div>
    </div>
  )
}
function BillingMetric({ icon, label, value, detail, tone }: { icon: IconName; label: string; value: string; detail: string; tone: string }) {
  return <div className={`deliverable-metric billing-metric ${tone}`}><span className="metric-label"><Icon name={icon} size={13} /> {label}</span><strong>{value}</strong><small>{detail}</small></div>
}

function SettingsView({ connection, settings, onSaved, onNotice }: { connection: ConnectionState; settings: AppSettings | null; onSaved: (settings: AppSettings) => void; onNotice: (message: string) => void }) {
  const [dollarRate, setDollarRate] = useState(settings?.dollarRate ?? 36.5)
  const [gasoline, setGasoline] = useState(settings?.fuelPriceGasolineCs ?? 61.5)
  const [diesel, setDiesel] = useState(settings?.fuelPriceDieselCs ?? 54)
  const [baseFee, setBaseFee] = useState(settings?.baseFeeCs ?? 80)
  const [fareKm, setFareKm] = useState(settings?.farePerKmCs ?? 8.5)
  const [motoBase, setMotoBase] = useState(settings?.vehicleRates?.Moto?.baseFeeCs ?? 60)
  const [motoKm, setMotoKm] = useState(settings?.vehicleRates?.Moto?.farePerKmCs ?? 6.5)
  const [vehiculoBase, setVehiculoBase] = useState(settings?.vehicleRates?.Vehículo?.baseFeeCs ?? 80)
  const [vehiculoKm, setVehiculoKm] = useState(settings?.vehicleRates?.Vehículo?.farePerKmCs ?? 8.5)
  const [camionBase, setCamionBase] = useState(settings?.vehicleRates?.Camión?.baseFeeCs ?? 130)
  const [camionKm, setCamionKm] = useState(settings?.vehicleRates?.Camión?.farePerKmCs ?? 13.5)
  const [prioritario, setPrioritario] = useState(settings?.prioritySurchargePct ?? 25)
  const [programado, setProgramado] = useState(settings?.scheduledSurchargePct ?? 0)
  const [companyName, setCompanyName] = useState(settings?.companyName ?? 'INCOEX Logistics')
  const [companyPhone, setCompanyPhone] = useState(settings?.companyPhone ?? '')
  const [companyEmail, setCompanyEmail] = useState(settings?.companyEmail ?? '')
  const [companyAddress, setCompanyAddress] = useState(settings?.companyAddress ?? '')
  const [saving, setSaving] = useState(false)

  const exampleTrip = Number((baseFee + 10 * fareKm).toFixed(2))
  const rateExample = (base: number, km: number) => Number((base + 10 * km).toFixed(2))

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const next = await updateSettings({
        dollarRate: Number(dollarRate),
        fuelPriceGasolineCs: Number(gasoline),
        fuelPriceDieselCs: Number(diesel),
        baseFeeCs: Number(baseFee),
        farePerKmCs: Number(fareKm),
        vehicleRates: {
          Moto: { baseFeeCs: Number(motoBase), farePerKmCs: Number(motoKm) },
          'Vehículo': { baseFeeCs: Number(vehiculoBase), farePerKmCs: Number(vehiculoKm) },
          'Camión': { baseFeeCs: Number(camionBase), farePerKmCs: Number(camionKm) },
        },
        prioritySurchargePct: Number(prioritario),
        scheduledSurchargePct: Number(programado),
        companyName,
        companyPhone,
        companyEmail,
        companyAddress,
      })
      onSaved(next)
      onNotice('Configuración guardada: tasa, tarifas por vehículo y datos de la empresa actualizados')
    } catch {
      onNotice('No se pudo guardar la configuración; revisa la conexión con la API')
    } finally {
      setSaving(false)
    }
  }

  return <div className="settings-grid settings-form-grid">
    <section className="panel settings-card"><span className="setting-icon"><Icon name="globe" size={19} /></span><h2>Estado del sistema</h2><p>Todos los módulos del panel (viajes, flota, clientes, reportes) operan conectados al mismo servicio de la plataforma.</p><div className={`setting-status ${connection === 'error' ? 'error-status' : ''}`}><span className="pulse-dot" /> {connection === 'connected' ? 'Todos los servicios operando' : connection === 'loading' ? 'Comprobando servicios…' : 'Servicio no disponible'}</div></section>
    <section className="panel settings-card"><span className="setting-icon"><Icon name="map" size={19} /></span><h2>Mapas y seguimiento</h2><p>Los viajes se rastrean en mapas con las posiciones reales de los conductores de la operación.</p><div className="setting-status"><span className="pulse-dot" /> Mapa en vivo dentro de la zona de cobertura (Nicaragua)</div></section>
    <section className="panel settings-card"><span className="setting-icon"><Icon name="shield" size={19} /></span><h2>Roles del personal</h2><p>Empresa, conductor y administración trabajan con los ocho roles definidos en contrato; cada rol echa a andar sus propios permisos.</p><div className="setting-status"><span className="pulse-dot" /> 8 roles contractuales activos</div></section>
    <section className="panel settings-card company-card">
      <div className="settings-card-head"><span className="setting-icon"><Icon name="billing" size={19} /></span><div><h2>Información de la empresa</h2><p>Datos que aparecen en los reportes, comprobantes y comunicaciones de INCOEX.</p></div></div>
      <form className="settings-form" onSubmit={save}>
        <div className="form-grid">
          <label>Nombre de la empresa<input required value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label>Teléfono<input value={companyPhone} onChange={(event) => setCompanyPhone(event.target.value)} placeholder="+505 8888-0000" /></label>
          <label>Correo<input type="email" value={companyEmail} onChange={(event) => setCompanyEmail(event.target.value)} placeholder="contacto@incoexlogistics.com" /></label>
          <label>Dirección<input value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} placeholder="Managua, Nicaragua" /></label>
        </div>
        <div className="settings-form-actions"><span className="settings-saved-hint">{settings ? `Última actualización: ${new Date(settings.updatedAt).toLocaleString('es-NI')}` : 'Cargando configuración…'}</span><button className="primary-button" disabled={saving || !settings}>{saving ? 'Guardando…' : 'Guardar empresa'}</button></div>
      </form>
    </section>
    <section className="panel settings-card currency-card">
      <div className="settings-card-head"><span className="setting-icon"><Icon name="wallet" size={19} /></span><div><h2>Moneda y tarifas</h2><p>Precios del sistema en córdobas (C$) con conversión automática al dólar para la flota y los viajes.</p></div></div>
      <form className="settings-form" onSubmit={save}>
        <div className="form-grid">
          <label>Tasa de cambio · C$ por US$ 1<NumInput required min={1} step={0.01} value={dollarRate} onChange={setDollarRate} /></label>
          <label>Gasolina · C$ por litro<NumInput required min={0} step={0.01} value={gasoline} onChange={setGasoline} /></label>
          <label>Diésel · C$ por litro<NumInput required min={0} step={0.01} value={diesel} onChange={setDiesel} /></label>
          <label>Tarifa base por viaje · C$<NumInput required min={0} step={0.01} value={baseFee} onChange={setBaseFee} /></label>
          <label>Tarifa por kilómetro · C$<NumInput required min={0} step={0.01} value={fareKm} onChange={setFareKm} /></label>
        </div>
        <div className="vehicle-rates">
          <div className="vehicle-rate-card"><span className="vehicle-rate-icon moto"><Icon name="moto" size={17} /></span><div><strong>Moto</strong><small>Tarifa base · C$</small><NumInput required min={0} step={0.01} value={motoBase} onChange={setMotoBase} /><small>Por kilómetro · C$</small><NumInput required min={0} step={0.01} value={motoKm} onChange={setMotoKm} /><em>10 km ≈ {formatCs(rateExample(motoBase, motoKm))}</em></div></div>
          <div className="vehicle-rate-card"><span className="vehicle-rate-icon vehiculo"><Icon name="car" size={17} /></span><div><strong>Vehículo</strong><small>Tarifa base · C$</small><NumInput required min={0} step={0.01} value={vehiculoBase} onChange={setVehiculoBase} /><small>Por kilómetro · C$</small><NumInput required min={0} step={0.01} value={vehiculoKm} onChange={setVehiculoKm} /><em>10 km ≈ {formatCs(rateExample(vehiculoBase, vehiculoKm))}</em></div></div>
          <div className="vehicle-rate-card"><span className="vehicle-rate-icon camion"><Icon name="truck" size={17} /></span><div><strong>Camíon</strong><small>Tarifa base · C$</small><NumInput required min={0} step={0.01} value={camionBase} onChange={setCamionBase} /><small>Por kilómetro · C$</small><NumInput required min={0} step={0.01} value={camionKm} onChange={setCamionKm} /><em>10 km ≈ {formatCs(rateExample(camionBase, camionKm))}</em></div></div>
        </div>
        <div className="service-type-rates">
          <div className="service-rate-card"><strong>Prioritario</strong><small>Recargo sobre la tarifa · %</small><NumInput required min={0} max={300} step={1} value={prioritario} onChange={setPrioritario} /><em>Viaje de 10 km ≈ {formatCs(Number((rateExample(vehiculoBase, vehiculoKm) * (1 + prioritario / 100)).toFixed(2)))}</em></div>
          <div className="service-rate-card"><strong>Programado</strong><small>Recargo sobre la tarifa · %</small><NumInput required min={0} max={300} step={1} value={programado} onChange={setProgramado} /><em>Viaje de 10 km ≈ {formatCs(Number((rateExample(vehiculoBase, vehiculoKm) * (1 + programado / 100)).toFixed(2)))}</em></div>
        </div>
        <div className="conversion-strip">
          <span><b>1 USD</b> = {formatCs(dollarRate)}</span>
          <span>Viaje de 10 km ≈ <b>{formatCs(exampleTrip)}</b> <small>(US$ {csToUsd(exampleTrip, dollarRate).toFixed(2)})</small></span>
          <span>1 L gasolina = <b>{formatCs(gasoline)}</b> <small>(US$ {csToUsd(gasoline, dollarRate).toFixed(2)})</small></span>
        </div>
        <div className="settings-form-actions"><span className="settings-saved-hint">{settings ? `Última actualización: ${new Date(settings.updatedAt).toLocaleString('es-NI')}` : 'Cargando configuración…'}</span><button className="primary-button" disabled={saving || !settings}>{saving ? 'Guardando…' : 'Guardar tarifas'}</button></div>
      </form>
      <p className="settings-footnote">Cada vehículo tiene su propia tarifa: base + costo por kilómetro. La app del cliente muestra el precio en C$ en el momento en que escribe origen y destino, según el tipo de transporte elegido.</p>
    </section>
  </div>
}

function EmptyState({ title, detail }: { title: string; detail: string }) { return <section className="panel state-card"><div className="placeholder-icon"><Icon name="requests" size={24} /></div><h2>{title}</h2><p>{detail}</p></section> }
function DataTable({ columns, rows, className = '', rowClassName }: { columns: string[]; rows: ReactNode[][]; className?: string; rowClassName?: (row: ReactNode[], index: number) => string }) { return <div className="table-scroll"><table className={className}><thead><tr>{columns.map((column, index) => <th key={`${column}-${index}`}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className={rowClassName ? rowClassName(row, index) : ''}>{row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div> }
function TablePagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return <span className="pagination-note">Página 1 de 1</span>
  return <div className="pagination"><button disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((p) => <button className={p === page ? 'active' : ''} key={p} onClick={() => onChange(p)}>{p}</button>)}<button disabled={page >= pageCount} onClick={() => onChange(page + 1)}>›</button></div>
}
function SummaryValue({ label, value, tone = 'blue' }: { label: string; value: string; tone?: string }) { return <div className="summary-value"><span className={`summary-icon ${tone}`} /> <div><strong>{value}</strong><small>{label}</small></div></div> }
function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${statusClass(status)}`}>{status}</span> }
function PriorityPill({ priority }: { priority: string }) { return <span className={`priority-pill ${statusClass(priority)}`}>{priority}</span> }
function statusClass(status: string) { return status.toLowerCase().replaceAll(' ', '-').replaceAll('í', 'i').replaceAll('é', 'e') }
function initials(value: string) { return value.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() }

export default App