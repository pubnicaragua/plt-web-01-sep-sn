import type { AppSettings, AppUser, Client, ClientProfile, Corte, DashboardSummary, Deliverable, DeliverableStatus, DeliverableSummary, Driver, FinanceSummary, FuelType, HistoryEvent, Incident, MaintenanceRecord, ReportsSummary, Role, TrackingOverview, Trip, TripStatus, UserRole, Vehicle, VehicleStatus } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL ?? 'https://plt-api-01-sep-sn.onrender.com/api').replace(/\/$/, '')

async function apiError(response: Response): Promise<Error> {
  let message = `API ${response.status}`
  try {
    const body = await response.json()
    if (typeof body?.message === 'string') message = body.message
    else if (Array.isArray(body?.message)) message = body.message.join(' · ')
  } catch {
    // respuesta sin cuerpo JSON
  }
  return new Error(message)
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) throw await apiError(response)
  return response.json() as Promise<T>
}

async function sendJson<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, attempt = 0): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      return sendJson(path, method, body, attempt + 1)
    }
    throw error
  }
  if ([502, 503, 504].includes(response.status) && attempt < 1) {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return sendJson(path, method, body, attempt + 1)
  }
  if (!response.ok) throw await apiError(response)
  const text = await response.text()
  return (text ? JSON.parse(text) : {}) as T
}

export function getDashboardSummary() {
  return getJson<DashboardSummary>('/dashboard/summary')
}
export function getTrackingLive(id: string) {
  return getJson<unknown>(`/tracking/${encodeURIComponent(id)}`)
}

export function getTrips() { return getJson<Trip[]>('/trips') }
export function deleteTrip(id: string) { return sendJson<{ deleted: string }>(`/trips/${encodeURIComponent(id)}`, 'DELETE') }
export function getDrivers() { return getJson<Driver[]>('/drivers') }
export function createDriver(body: { name: string; phone?: string; email?: string; vehicle?: string; plate?: string; external?: boolean; licenseNo?: string; licenseExp?: string; docNo?: string; notes?: string }) { return sendJson<Driver>('/drivers', 'POST', body) }
export function updateDriver(id: string, body: { vehicle?: string; plate?: string; external?: boolean; licenseNo?: string; licenseExp?: string; docNo?: string; notes?: string }) { return sendJson<Driver>(`/drivers/${encodeURIComponent(id)}`, 'PATCH', body) }
export function deleteDriver(id: string) { return sendJson<{ deleted: string }>(`/drivers/${encodeURIComponent(id)}`, 'DELETE') }
export function getClients() { return getJson<Client[]>('/clients') }
export function getClientProfile(id: string) { return getJson<ClientProfile>(`/clients/${encodeURIComponent(id)}`) }
export function createClient(body: { name: string; phone?: string; email?: string; type?: string; address?: string; contact?: string; taxId?: string; notes?: string; billingPeriod?: string; billingCustomDays?: number; billingCutDay?: number; billingCutTime?: string; billingActive?: boolean; whatsapp?: string }) { return sendJson<Client>('/clients', 'POST', body) }
export function deleteClient(id: string) { return sendJson<{ deleted: string }>(`/clients/${encodeURIComponent(id)}`, 'DELETE') }
export function getIncidents() { return getJson<Incident[]>('/incidents') }
export function createIncident(body: { type: string; client: string; trip?: string; driver?: string; priority?: Incident['priority'] }) { return sendJson<Incident>('/incidents', 'POST', body) }
export function updateIncidentStatus(id: string, status: Incident['status']) { return sendJson<Incident>(`/incidents/${encodeURIComponent(id)}/status`, 'PATCH', { status }) }
export function getHistory() { return getJson<HistoryEvent[]>('/history') }
export function getReportsSummary() { return getJson<ReportsSummary>('/reports/summary') }
export function getFinanceSummary() { return getJson<FinanceSummary>('/finance/summary') }
export function getTrackingOverview() { return getJson<TrackingOverview>('/tracking/overview') }
export function getDeliverables() { return getJson<Deliverable[]>('/deliverables') }
export function getDeliverablesSummary() { return getJson<DeliverableSummary>('/deliverables/summary') }
export function updateDeliverableStatus(id: string, status: DeliverableStatus) { return sendJson<Deliverable>(`/deliverables/${encodeURIComponent(id)}/status`, 'PATCH', { status }) }
export function createTrip(body: Pick<Trip, 'client' | 'origin' | 'destination' | 'packages'> & {
  description?: string
  recipientName?: string
  recipientPhone?: string
  fragile?: boolean
  originLat?: number
  originLng?: number
  destinationLat?: number
  destinationLng?: number
  distanceKm?: number
  serviceType?: 'Urbano' | 'Express' | 'Programado'
  contactName?: string
  contactPhone?: string
  originRefs?: string
  destinationRefs?: string
}) {
  return sendJson<Trip>('/trips', 'POST', body)
}

export function assignTrip(tripId: string, driverId: string) {
  return sendJson<Trip>(`/trips/${encodeURIComponent(tripId)}/assign`, 'PATCH', { driverId })
}

export function updateTripStatus(tripId: string, status: TripStatus) {
  return sendJson<Trip>(`/trips/${encodeURIComponent(tripId)}/status`, 'PATCH', { status })
}

export function updateTripPayment(tripId: string, body: { method?: Trip['paymentMethod']; ref?: string; amount?: number; date?: string; dueDate?: string }) {
  return sendJson<Trip>(`/trips/${encodeURIComponent(tripId)}/payment`, 'PATCH', body)
}

export function updateTripFare(tripId: string, estimatedCostCs: number) {
  return sendJson<Trip>(`/trips/${encodeURIComponent(tripId)}/fare`, 'PATCH', { estimatedCostCs })
}

export function updateClient(id: string, body: { phone?: string; email?: string; address?: string; contact?: string; taxId?: string; notes?: string; creditDays?: number; dueDay?: number; billingPeriod?: string; billingCustomDays?: number; billingCutDay?: number; billingCutTime?: string; billingActive?: boolean; whatsapp?: string }) {
  return sendJson<Client>(`/clients/${encodeURIComponent(id)}`, 'PATCH', body)
}

export function getCortes(params: { client?: string; status?: string } = {}) {
  const query = new URLSearchParams()
  if (params.client) query.set('client', params.client)
  if (params.status) query.set('status', params.status)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return getJson<Corte[]>(`/cortes${suffix}`)
}
export function getCorte(id: string) { return getJson<Corte>(`/cortes/${encodeURIComponent(id)}`) }
export function generateCortes(client?: string) { return sendJson<{ created: string[]; count: number }>('/cortes/generate', 'POST', client ? { client } : {}) }
export function payCorte(id: string, body: { method?: string; notes?: string; amountCs?: number }) { return sendJson<Corte>(`/cortes/${encodeURIComponent(id)}/pay`, 'POST', body) }
export function annulCorte(id: string) { return sendJson<Corte>(`/cortes/${encodeURIComponent(id)}/annul`, 'POST') }
export function markCorteSent(id: string) { return sendJson<Corte>(`/cortes/${encodeURIComponent(id)}/sent-whatsapp`, 'POST') }

export interface FuelRecord {
  id: string
  plate: string
  liters: number
  pricePerLiterCs: number
  totalCs: number
  odometerKm: number
  date: string
  note: string
  createdAt: number
}

export interface FuelStatsRow {
  plate: string
  literPriceCs: number
  costPerKmCs: number
  realConsumptionLPer100Km: number
  autonomyKm: number
  autonomyDays: number
  refuels: number
  totalLiters: number
  totalCs: number
}

export function getFuelRecords(plate?: string) { return getJson<FuelRecord[]>(`/fuel${plate ? `?plate=${encodeURIComponent(plate)}` : ''}`) }
export function getFuelStats(plate?: string) { return getJson<FuelStatsRow[]>(`/fuel/stats${plate ? `?plate=${encodeURIComponent(plate)}` : ''}`) }
export function addFuelRecord(body: { plate: string; liters: number; pricePerLiterCs?: number; odometerKm?: number; note?: string }) { return sendJson<FuelRecord>('/fuel', 'POST', body) }
export function deleteFuelRecord(id: string) { return sendJson<{ deleted: string }>(`/fuel/${encodeURIComponent(id)}`, 'DELETE') }

export function getVehicles() { return getJson<Vehicle[]>('/vehicles') }
export function createVehicle(body: { plate: string; model: string; type: string; capacityKg: number; year: number; fuelType?: FuelType; consumptionLPerKm?: number; priceCs?: number; odometerKm?: number; external?: boolean; vehicleFunction?: Vehicle['vehicleFunction']; logistics?: string; minTripsMonth?: number; financed?: boolean; downPaymentCs?: number; leaseStart?: string; leaseTermMonths?: number; leaseMonthlyPaymentCs?: number; residualValueCs?: number; depreciationPct?: number; fuelPriceCs?: number; tankCapacityL?: number; brand?: string; motorNo?: string; chassisNo?: string; color?: string }) { return sendJson<Vehicle>('/vehicles', 'POST', body) }
export function updateVehicle(id: string, body: { type?: string; fuelType?: FuelType; consumptionLPerKm?: number; priceCs?: number; odometerKm?: number; external?: boolean; vehicleFunction?: Vehicle['vehicleFunction']; logistics?: string; minTripsMonth?: number; financed?: boolean; downPaymentCs?: number; leaseStart?: string; leaseTermMonths?: number; leaseMonthlyPaymentCs?: number; residualValueCs?: number; depreciationPct?: number; fuelPriceCs?: number; tankCapacityL?: number; brand?: string; motorNo?: string; chassisNo?: string; color?: string }) { return sendJson<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, 'PATCH', body) }
export async function uploadVehicleImage(id: string, file: File) {
  const formData = new FormData()
  formData.append('image', file)
  const response = await fetch(`${API_BASE}/vehicles/${encodeURIComponent(id)}/image`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<Vehicle>
}
export function updateVehicleStatus(id: string, status: VehicleStatus) { return sendJson<Vehicle>(`/vehicles/${encodeURIComponent(id)}/status`, 'PATCH', { status }) }
export function deleteVehicle(id: string) { return sendJson<{ deleted: string }>(`/vehicles/${encodeURIComponent(id)}`, 'DELETE') }
export function assignVehicleDriver(id: string, driver: string) { return sendJson<Vehicle>(`/vehicles/${encodeURIComponent(id)}/driver`, 'PATCH', { driver }) }
export function registerVehicleMaintenance(id: string, description: string, cost?: number) { return sendJson<MaintenanceRecord[]>(`/vehicles/${encodeURIComponent(id)}/maintenance`, 'POST', { description, cost }) }
export function getMaintenance() { return getJson<MaintenanceRecord[]>('/vehicles/maintenance') }

export function getSettings() { return getJson<AppSettings>('/settings') }
export function updateSettings(body: Partial<Omit<AppSettings, 'updatedAt'>>) { return sendJson<AppSettings>('/settings', 'PATCH', body) }

export function resolveImageUrl(path: string) {
  return path.startsWith('http') ? path : `${API_BASE}${path}`
}

export function getUsers() { return getJson<AppUser[]>('/admin/users') }
export function getRoles() { return getJson<Role[]>('/admin/roles') }
export function createUser(body: { name: string; email: string; phone?: string; role: UserRole; password?: string }) { return sendJson<AppUser>('/admin/users', 'POST', body) }
export function updateUser(id: string, body: { name?: string; phone?: string; email?: string; role?: UserRole; status?: 'Activo' | 'Inactivo'; password?: string }) { return sendJson<AppUser>(`/admin/users/${encodeURIComponent(id)}`, 'PATCH', body) }
export function revokeUserSession(id: string) { return sendJson<AppUser>(`/admin/users/${encodeURIComponent(id)}/revoke-session`, 'PATCH', {}) }
export function deleteUser(id: string) { return sendJson<{ deleted: string }>(`/admin/users/${encodeURIComponent(id)}`, 'DELETE') }

export function getReportCsvUrl(collection: 'trips' | 'drivers' | 'clients' | 'incidents' | 'packages') {
  return `${API_BASE}/reports/export/${collection}`
}

export function getApiBase() {
  return API_BASE
}
