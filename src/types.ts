export type Section =
  | 'dashboard'
  | 'trips'
  | 'requests'
  | 'assignment'
  | 'drivers'
  | 'clients'
  | 'packages'
  | 'tracking'
  | 'history'
  | 'incidents'
  | 'reports'
  | 'deliverables'
  | 'settings'

export type TripStatus = 'Pendiente' | 'Asignado' | 'En camino' | 'En entrega' | 'Completado' | 'Cancelado'

export interface DashboardSummary {
  tripsToday: number
  activeTrips: number
  pendingTrips: number
  completedTrips: number
  activeDrivers: number
  registeredClients: number
  packagesInTransit: number
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
