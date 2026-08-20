import type { Client, DashboardSummary, Deliverable, DeliverableStatus, DeliverableSummary, Driver, HistoryEvent, Incident, ReportsSummary, TrackingOverview, Trip } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`)
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

async function sendJson<T>(path: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export function getDashboardSummary() {
  return getJson<DashboardSummary>('/dashboard/summary')
}

export function getTrips() { return getJson<Trip[]>('/trips') }
export function getDrivers() { return getJson<Driver[]>('/drivers') }
export function getClients() { return getJson<Client[]>('/clients') }
export function getIncidents() { return getJson<Incident[]>('/incidents') }
export function getHistory() { return getJson<HistoryEvent[]>('/history') }
export function getReportsSummary() { return getJson<ReportsSummary>('/reports/summary') }
export function getTrackingOverview() { return getJson<TrackingOverview>('/tracking/overview') }
export function getDeliverables() { return getJson<Deliverable[]>('/deliverables') }
export function getDeliverablesSummary() { return getJson<DeliverableSummary>('/deliverables/summary') }
export function updateDeliverableStatus(id: string, status: DeliverableStatus) { return sendJson<Deliverable>(`/deliverables/${encodeURIComponent(id)}/status`, 'PATCH', { status }) }
export function createTrip(body: Pick<Trip, 'client' | 'origin' | 'destination' | 'packages'> & {
  description?: string
  recipientName?: string
  recipientPhone?: string
  fragile?: boolean
}) {
  return sendJson<Trip>('/trips', 'POST', body)
}

export function assignTrip(tripId: string, driverId: string) {
  return sendJson<Trip>(`/trips/${encodeURIComponent(tripId)}/assign`, 'PATCH', { driverId })
}

export function getApiBase() {
  return API_BASE
}
