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

export type TripStatus = 'Pendiente' | 'Asignado' | 'En camino' | 'En entrega' | 'Completado' | 'Cancelado' | 'Anulado'

export interface FinancePeriod {
  label: string
  trips: number
  km: number
  incomeCs: number
  fuelCs: number
  maintenanceCs: number
  marginCs: number
  avgTripCs: number
  avgPerKmCs: number
}

export interface FinanceSummary {
  generatedAt: string
  currency: string
  periods: {
    today: FinancePeriod
    week: FinancePeriod
    month: FinancePeriod
    all: FinancePeriod
  }
  invoicingCs: number
  invoicingTrips: number
  daily: Array<{ label: string; incomeCs: number; fuelCs: number }>
  topClients: Array<{ name: string; trips: number; incomeCs: number; fuelCs: number; marginCs: number }>
  fleet: {
    vehicles: number
    drivers: number
    activeTrips: number
    completedTrips: number
    totalDistanceKm: number
    avgIncomePerKmCs: number
    avgFuelPerKmCs: number
    avgTripCs: number
  }
}

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
  originLat?: number
  originLng?: number
  destinationLat?: number
  destinationLng?: number
  distanceKm?: number
  estimatedCostCs?: number
  costCs?: number
  profitCs?: number
  serviceType?: 'Urbano' | 'Express' | 'Programado'
  contactName?: string
  contactPhone?: string
  originRefs?: string
  destinationRefs?: string
  paymentMethod?: 'Efectivo' | 'Transferencia' | 'Financiamiento' | 'Contra entrega' | ''
  paymentRef?: string
  paymentAmount?: number
  paymentDate?: string
  paymentStatus?: 'Sin pagar' | 'Parcial' | 'Pagado'
  dueDate?: string
  weight?: number
  weightUnit?: 'kg' | 'lb'
}

export interface Driver {
  id: string
  name: string
  phone: string
  email?: string
  vehicle: string
  plate: string
  status: 'Disponible' | 'En viaje' | 'En entrega' | 'Fuera de servicio'
  route: string
  latitude: number
  longitude: number
  external?: boolean
}

export interface Client {
  id: string
  name: string
  type: string
  phone: string
  email: string
  address?: string
  contact?: string
  taxId?: string
  notes?: string
  existed?: boolean
  trips: number
  activeRequests: number
  status: 'Activo' | 'Suspendido'
  creditDays?: number
  dueDay?: number
  billingPeriod?: BillingPeriod
  billingCustomDays?: number
  billingCutDay?: number
  billingCutTime?: string
  billingActive?: boolean
  whatsapp?: string
}

export type BillingPeriod = '' | 'semanal' | 'quincenal' | 'mensual' | 'personalizado'

export interface ClientProfile {
  id: string
  name: string
  type: string
  phone: string
  email: string
  address: string
  contact: string
  taxId: string
  notes: string
  creditDays?: number
  dueDay?: number
  billingPeriod?: BillingPeriod
  whatsapp?: string
  status: string
  stats: {
    totalTrips: number
    activeTrips: number
    completedTrips: number
    cancelledTrips: number
    pendingBalance: number
    byStatus: Record<string, number>
  }
  billing: {
    invoiced: number
    paid: number
    pending: number
    unpaidTrips: Array<{
      id: string
      date: string
      origin: string
      destination: string
      costCs: number
      paymentStatus: string
      dueDate: string
    }>
  }
  services: Array<{ type: string; count: number; total: number }>
  trips: Array<{
    id: string
    date: string
    origin: string
    destination: string
    driver: string
    packages: number
    status: string
    serviceType: string
    costCs: number
    paymentStatus: string
  }>
}

export interface CorteItem {
  id: string
  date: string
  origin: string
  destination: string
  description?: string
  packages: number
  status: string
  priceCs: number
}

export interface Corte {
  id: string
  client: string
  periodStart: string
  periodEnd: string
  periodLabel: string
  items: CorteItem[]
  totalCs: number
  previousDebtCs: number
  grandTotalCs: number
  status: 'pendiente' | 'pagado' | 'anulado'
  createdAt: string
  paidAt?: string
  paidAmountCs?: number
  method?: string
  notes?: string
  sentWhatsapp: boolean
  period: BillingPeriod | 'auto'
  customDays?: number
}

export interface Incident {
  id: string
  trip: string
  driver: string
  client: string
  type: string
  priority: 'Baja' | 'Media' | 'Alta' | 'Crítica'
  status: 'Abierta' | 'En proceso' | 'Resuelta'
  description?: string
  latitude?: number
  longitude?: number
  evidence?: string
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
  averageDistanceKm: number
  totalDistanceKm: number
  totalRevenueCs: number
  weeklyTrips: number[]
  weeklyLabels: string[]
  dailyDeliveries: number[]
  dailyLabels: string[]
  topDrivers: Array<{ name: string; trips: number }>
  topClients: Array<{ name: string; trips: number }>
  topVehicles?: Array<{ plate: string; model: string; trips: number; km: number; incomeCs: number }>
  driverVehicle?: Array<{ name: string; vehicle: string; trips: number; incomeCs: number }>
  fleetReport?: Array<{
    plate: string
    model: string
    vehicleFunction: string
    logistics: string
    external: boolean
    financed: boolean
    leaseMonthlyPaymentCs: number
    monthsRemaining: number
    remainingDebtCs: number
    monthlyDepreciationCs: number
    monthlyCostCs: number
    minTripsMonth: number
    tripsMonth: number
    kmMonth: number
    incomeMonthCs: number
    fuelEstimateCs: number
    fuelPriceCs: number
    costPerKmCs: number
    breakEvenFareCs: number
    marginCs: number
    breakEvenTrips: number
  }>
  profitSummary?: {
    totalProfitCs: number
    profitableTrips: number
    lossTrips: number
  }
}

export interface LiveDriverPosition {
  driver: string
  latitude: number
  longitude: number
  accuracy: number
  speedKmh: number
  source: string
  demo: boolean
  ageSeconds: number
  online: boolean
  status: Driver['status']
  vehicle: string
  plate: string
}

export interface TrackingOverview {
  activeOperations: number
  trackingAt?: string
  drivers: Driver[]
  live: LiveDriverPosition[]
  trips: Trip[]
  incidents: Incident[]
}

export type VehicleStatus = 'Disponible' | 'En servicio' | 'Mantenimiento' | 'Fuera de servicio'
export type FuelType = 'Gasolina' | 'Diésel' | 'Eléctrico' | 'Híbrido'

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
  fuelType: FuelType
  consumptionLPerKm: number
  priceCs: number
  priceUsd: number
  fuelCostPerKmC$: number
  odometerKm: number
  imageUrl: string
  external?: boolean
  vehicleFunction: 'privado' | 'delivery' | 'camion' | ''
  logistics: string
  minTripsMonth: number
  fuelPriceCs?: number
  tankCapacityL?: number
  financing: {
    financed: boolean
    downPaymentCs: number
    leaseStart: string
    leaseTermMonths: number
    leaseMonthlyPaymentCs: number
    residualValueCs: number
    depreciationPct: number
    monthsElapsed: number
    monthsRemaining: number
    totalPaidCs: number
    remainingDebtCs: number
    monthlyDepreciationCs: number
    annualDepreciationCs: number
    monthlyCostCs: number
    financingLabel: string
  }
}

export interface VehicleRate {
  baseFeeCs: number
  farePerKmCs: number
}

export interface AppSettings {
  dollarRate: number
  fuelPriceGasolineCs: number
  fuelPriceDieselCs: number
  baseFeeCs: number
  farePerKmCs: number
  vehicleRates: {
    Moto: VehicleRate
    Vehículo: VehicleRate
    Camión: VehicleRate
  }
  prioritySurchargePct: number
  scheduledSurchargePct: number
  companyName: string
  companyPhone: string
  companyEmail: string
  companyAddress: string
  updatedAt: string
}

export function formatCs(value: number) {
  return `C$ ${value.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function csToUsd(value: number, dollarRate: number) {
  return dollarRate > 0 ? Number((value / dollarRate).toFixed(2)) : 0
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
  sessionState?: 'Activa' | 'Cerrada'
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
