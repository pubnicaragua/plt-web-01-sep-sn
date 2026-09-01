export type Section =
  | 'dashboard'
  | 'trips'
  | 'requests'
  | 'assignment'
  | 'drivers'
  | 'vehicles'
  | 'clients'
  | 'packages'
  | 'tracking'
  | 'history'
  | 'incidents'
  | 'reports'
  | 'users'
  | 'deliverables'
  | 'billing'
  | 'settings'

export type TripStatus = 'Pendiente' | 'Asignado' | 'En camino' | 'En entrega' | 'Completado' | 'Cancelado'

export interface DashboardSummary {
  tripsToday: number
  activeTrips: number
  pendingTrips: number
  completedTrips: number
  activeDrivers: number
  availableDrivers: number
  registeredClients: number
  activeClients: number
  packagesInTransit: number
  delayedTrips: number
  openIncidents: number
}

export interface Trip {
  id: string
  client: string
  driver: string
  origin: string
  destination: string
  date: string
  packages: number
  status: TripStatus
  description?: string
  recipientName?: string
  recipientPhone?: string
  fragile?: boolean
}

export interface Driver {
  id: string
  name: string
  phone: string
  vehicle: string
  plate: string
  status: 'Disponible' | 'En viaje' | 'En entrega' | 'Fuera de servicio'
  route: string
  latitude: number
  longitude: number
}

export interface Client {
  id: string
  name: string
  type: string
  phone: string
  email: string
  trips: number
  activeRequests: number
  status: 'Activo' | 'Suspendido'
}

export interface Incident {
  id: string
  trip: string
  driver: string
  client: string
  type: string
  priority: 'Baja' | 'Media' | 'Alta' | 'Crítica'
  status: 'Abierta' | 'En proceso' | 'Resuelta'
}

export interface HistoryEvent {
  id: string
  time: string
  date: string
  type: string
  title: string
  detail: string
  color: 'blue' | 'mint' | 'gold' | 'red' | 'slate'
}

export interface ReportsSummary {
  totalTrips: number
  completedTrips: number
  cancelledTrips: number
  averageDeliveryMinutes: number
  weeklyTrips: number[]
  weeklyLabels: string[]
  dailyDeliveries: number[]
  dailyLabels: string[]
  topDrivers: Array<{ name: string; trips: number }>
  topClients: Array<{ name: string; trips: number }>
}

export interface TrackingOverview {
  activeOperations: number
  drivers: Driver[]
  trips: Trip[]
  incidents: Incident[]
}

export type VehicleStatus = 'Disponible' | 'En servicio' | 'Mantenimiento' | 'Fuera de servicio'

export interface Vehicle {
  id: string
  plate: string
  model: string
  type: string
  capacityKg: number
  year: number
  status: VehicleStatus
  driver: string
  lastMaintenance: string
  nextMaintenance: string
  totalTrips: number
}

export interface MaintenanceRecord {
  id: string
  vehicleId: string
  plate: string
  date: string
  description: string
  cost: number
}

export type UserRole = 'admin' | 'management' | 'operations' | 'finance' | 'support' | 'driver' | 'corporate' | 'store'

export interface Role {
  code: UserRole
  name: string
  description: string
  permissions: string[]
}

export interface AppUser {
  id: string
  name: string
  email: string
  phone: string
  role: UserRole
  roleName: string
  status: 'Activo' | 'Inactivo'
  lastLogin: string
}

export type DeliverableStatus = 'backlog' | 'in_progress' | 'review' | 'done'
export type DeliverableSource = 'Verificado' | 'En implementación' | 'Pendiente'

export interface Deliverable {
  id: string
  title: string
  area: string
  summary: string
  status: DeliverableStatus
  priority: 'Alta' | 'Media' | 'Baja'
  evidence: string
  source: DeliverableSource
  startDate: string
  targetDate: string
  owner: string
  phase: string
  contractRef: string
  updatedAt: string
}

export interface DeliverableSummary {
  total: number
  backlog: number
  in_progress: number
  review: number
  done: number
}
