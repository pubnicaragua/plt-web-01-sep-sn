import { useEffect, useState } from 'react'
import {
  calculateFare,
  createTariffDestination,
  deleteTariffDestination,
  getTarifas,
  updateTariffDestination,
  updateTariffSettings,
  updateSettings,
} from './lib/api'
import type { AppSettings, FareResult, TariffDestination, TariffSettings, VehicleRate } from './types'
import { Icon } from './lib/icons'

const DISTRICT_STATUSES = [
  'Verificado OSM 2026',
  'Nuevo – verificado OSM 2026',
  'Referencia 2016 – revisar',
  'Fuente oficial – coordenadas pendientes',
  'Verificado manualmente',
  'Descartado',
  'Por verificar',
]

const CATEGORIES = [
  'Centro comercial',
  'Barrio / sector',
  'Mercado',
  'Aeropuerto',
  'Hospital',
  'Universidad',
  'Terminal',
  'Punto estratégico',
  'Otro',
]

const DISTRICTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

const DEFAULT_VEHICLE_RATES: AppSettings['vehicleRates'] = {
  Moto: { baseFeeCs: 60, farePerKmCs: 6.5, includedKm: 4 },
  Vehículo: { baseFeeCs: 80, farePerKmCs: 8.5, includedKm: 4 },
  Camión: { baseFeeCs: 130, farePerKmCs: 13.5, includedKm: 4 },
}

interface TarifasData {
  settings: TariffSettings
  destinations: TariffDestination[]
}

export function TarifasView({ onNotice, settings, onSettingsSaved }: { onNotice: (message: string) => void; settings: AppSettings | null; onSettingsSaved: (settings: AppSettings) => void }) {
  const [tab, setTab] = useState<'params' | 'calc' | 'catalog'>('params')
  const [data, setData] = useState<TarifasData | null>(null)
  const [draft, setDraft] = useState<TariffSettings | null>(null)
  const [vehicleRates, setVehicleRates] = useState<AppSettings['vehicleRates']>(settings?.vehicleRates ?? DEFAULT_VEHICLE_RATES)
  const [busy, setBusy] = useState('')
  const [originId, setOriginId] = useState('')
  const [destId, setDestId] = useState('')
  const [calcVehicle, setCalcVehicle] = useState<keyof AppSettings['vehicleRates']>('Vehículo')
  const [result, setResult] = useState<FareResult | null>(null)
  const [search, setSearch] = useState('')
  const [catalogPage, setCatalogPage] = useState(1)
  const catalogPageSize = 8
  const [loadError, setLoadError] = useState(false)
  useEffect(() => {
    if (settings?.vehicleRates) setVehicleRates(settings.vehicleRates)
  }, [settings])
  const load = () => {
    setLoadError(false)
    getTarifas()
      .then((loaded) => {
        setData(loaded)
        setDraft({ ...loaded.settings, cartographicSource: 'Google Maps' })
        setOriginId(loaded.destinations[0]?.id ?? '')
        setDestId(loaded.destinations[1]?.id ?? '')
      })
      .catch(() => { setLoadError(true); setData(null); setDraft(null) })
  }
  useEffect(() => { load() }, [])
  const [formOpen, setFormOpen] = useState(false)
  const [editingDest, setEditingDest] = useState<TariffDestination | null>(null)
  const [destForm, setDestForm] = useState<{ name: string; district: string; category: string; latitude: string; longitude: string; inCoverage: boolean; status: string }>({ name: '', district: 'I', category: 'Barrio / sector', latitude: '', longitude: '', inCoverage: true, status: 'Por verificar' })



  async function saveAll() {
    if (!draft) return
    setBusy('all')
    try {
      const updated = await updateTariffSettings({ ...draft, cartographicSource: 'Google Maps' })
      const updatedSettings = await updateSettings({ vehicleRates })
      setData((current) => (current ? { ...current, settings: updated } : current))
      setDraft(updated)
      onSettingsSaved(updatedSettings)
      onNotice('Cambios de tarifas guardados y disponibles para la app móvil')
    } catch {
      onNotice('No se pudieron guardar todos los cambios de tarifas')
    } finally {
      setBusy('')
    }
  }

  function setParam<K extends keyof TariffSettings>(key: K, value: TariffSettings[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  function setVehicleRate(vehicle: keyof AppSettings['vehicleRates'], key: keyof VehicleRate, value: number) {
    setVehicleRates((current) => ({ ...current, [vehicle]: { ...current[vehicle], [key]: value } }))
  }

  async function calculate() {
    const origin = data?.destinations.find((d) => d.id === originId)
    const destination = data?.destinations.find((d) => d.id === destId)
    if (!origin || !destination) {
      onNotice('Selecciona origen y destino del catálogo')
      return
    }
    setBusy('calc')
    try {
      const fare = await calculateFare({
        originLat: origin.latitude,
        originLng: origin.longitude,
        destLat: destination.latitude,
        destLng: destination.longitude,
        transport: calcVehicle,
        originCoverage: origin.inCoverage,
        destCoverage: destination.inCoverage,
      })
      setResult(fare)
    } catch {
      onNotice('No se pudo calcular la tarifa')
    } finally {
      setBusy('')
    }
  }

  function openForm(destination?: TariffDestination) {
    setEditingDest(destination ?? null)
    setDestForm(
      destination
        ? { name: destination.name, district: destination.district.replace('Distrito ', ''), category: destination.category, latitude: String(destination.latitude), longitude: String(destination.longitude), inCoverage: destination.inCoverage, status: destination.status }
        : { name: '', district: 'I', category: 'Barrio / sector', latitude: '', longitude: '', inCoverage: true, status: 'Por verificar' },
    )
    setFormOpen(true)
  }

  async function saveDestination() {
    const latitude = Number.parseFloat(destForm.latitude)
    const longitude = Number.parseFloat(destForm.longitude)
    if (!destForm.name.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      onNotice('Completa nombre, latitud y longitud del destino')
      return
    }
    setBusy('dest')
    const body = {
      name: destForm.name.trim(),
      district: `Distrito ${destForm.district}`,
      category: destForm.category,
      latitude,
      longitude,
      inCoverage: destForm.inCoverage,
      status: destForm.status,
    }
    try {
      if (editingDest) {
        const updated = await updateTariffDestination(editingDest.id, body)
        setData((current) => (current ? { ...current, destinations: current.destinations.map((d) => (d.id === editingDest.id ? updated : d)) } : current))
        onNotice('Destino actualizado')
      } else {
        const created = await createTariffDestination(body)
        setData((current) => (current ? { ...current, destinations: [...current.destinations, created] } : current))
        onNotice('Destino agregado al catálogo')
      }
      setFormOpen(false)
    } catch {
      onNotice('No se pudo guardar el destino')
    } finally {
      setBusy('')
    }
  }

  async function removeDestination(id: string) {
    try {
      await deleteTariffDestination(id)
      setData((current) => (current ? { ...current, destinations: current.destinations.filter((d) => d.id !== id) } : current))
      onNotice('Destino eliminado del catálogo')
    } catch {
      onNotice('No se pudo eliminar el destino')
    }
  }

  if (!data || !draft) {
    if (loadError) {
      return (
        <section className="panel empty-panel">
          <span className="empty-icon"><Icon name="refresh" size={20} /></span>
          <h3>No se pudo cargar el módulo de tarifas</h3>
          <p>La API no respondió. Puede ser un reinicio del servidor. Si el problema persiste, verifica que el backend esté en la última versión.</p>
          <button className="primary-button" onClick={load} style={{ marginTop: '14px' }}><Icon name="refresh" size={14} /> Reintentar</button>
        </section>
      )
    }
    return <EmptyState title="Cargando módulo de tarifas" detail="Consultando parámetros, distritos y catálogo…" />
  }

  const filteredDestinations = data.destinations.filter((d) => {
    const query = search.trim().toLowerCase()
    return !query || [d.name, d.district, d.category, d.status].join(' ').toLowerCase().includes(query)
  })
  const catalogPageCount = Math.max(1, Math.ceil(filteredDestinations.length / catalogPageSize))
  const safeCatalogPage = Math.min(catalogPage, catalogPageCount)
  const visibleDestinations = filteredDestinations.slice((safeCatalogPage - 1) * catalogPageSize, safeCatalogPage * catalogPageSize)

  const origin = data.destinations.find((d) => d.id === originId)
  const destination = data.destinations.find((d) => d.id === destId)

  const paramRow = (label: string, value: string, unit: string, detail: string) => (
    <div className={`param-row ${detail ? 'has-detail' : ''}`}>
      <span className="param-label">{label}</span>
      <span className="param-value">{value}</span>
      <span className="param-unit">{unit}</span>
      <span className="param-detail">{detail}</span>
    </div>
  )

  return (
    <>
      <div className="report-header">
        <div>
          <span className="eyebrow">MÓDULO DE TARIFAS · PARÁMETROS DEL CATÁLOGO</span>
          <h2 className="report-title">Tarifas y catálogo de Managua</h2>
          <p className="panel-sub">
            Los parámetros editables alimentan las validaciones del catálogo y de la calculadora de tarifas.
          </p>
        </div>
        <div className="report-header-meta">
          <span><b>{draft.districtsCount}</b> distritos operativos</span>
          <span><b>{data.destinations.length}</b> destinos en catálogo</span>
          <span>Consolidado <b>{draft.catalogUpdatedAt || '—'}</b></span>
        </div>
      </div>
      <div className="report-tabs">
        {([['params', 'Parámetros'], ['calc', 'Calculadora'], ['catalog', 'Catálogo de destinos']] as const).map(([id, label]) => (
          <button key={id} className={`filter-chip ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'params' && (
        <>
          <section className="panel tarifas-panel">
            <div className="export-panel-head">
              <div>
                <span className="eyebrow">CATÁLOGO GEOGRÁFICO</span>
                <h2>Parámetros editables del catálogo</h2>
                <p>Fecha de consolidación de las fuentes, cobertura por distrito y reglas de activación de destinos.</p>
              </div>
            </div>
            <div className="param-grid">
              <div className="param-cell">
                <span>Fecha de actualización</span>
                <input type="date" className="param-input" value={draft.catalogUpdatedAt} onChange={(e) => setParam('catalogUpdatedAt', e.target.value)} />
                <small>Fecha de consolidación de las fuentes.</small>
              </div>
              <div className="param-cell">
                <span>Distritos operativos</span>
                <input type="number" min={1} max={7} className="param-input" value={draft.districtsCount} onChange={(e) => setParam('districtsCount', Number(e.target.value))} />
                <small>Cantidad de distritos municipales contemplados.</small>
              </div>
              <div className="param-cell">
                <span>Requerir coordenadas para activar</span>
                <label className="yesno-toggle">
                  <input type="checkbox" checked={draft.requireCoords} onChange={(e) => setParam('requireCoords', e.target.checked)} />
                  <b>{draft.requireCoords ? 'Sí' : 'No'}</b>
                </label>
                <small>No activar para tarifa un destino sin latitud y longitud.</small>
              </div>
              <div className="param-cell">
                <span>Incluir puntos estratégicos</span>
                <label className="yesno-toggle">
                  <input type="checkbox" checked={draft.includeStrategicPoints} onChange={(e) => setParam('includeStrategicPoints', e.target.checked)} />
                  <b>{draft.includeStrategicPoints ? 'Sí' : 'No'}</b>
                </label>
                <small>Mercados, aeropuerto, hospitales, centros comerciales y otros.</small>
              </div>
              <div className="param-cell">
                <span>Estado mínimo recomendado</span>
                <select className="param-input" value={draft.minRecommendedStatus} onChange={(e) => setParam('minRecommendedStatus', e.target.value)}>
                  {DISTRICT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
                <small>Estado sugerido antes de usar un destino en producción.</small>
              </div>
            </div>
          </section>

          <section className="panel tarifas-panel">
            <div className="export-panel-head">
              <div>
                <span className="eyebrow">MOTOR TARIFARIO</span>
                <h2>Parámetros tarifarios</h2>
                <p>El precio base y los kilómetros incluidos se configuran por vehículo; el redondeo comercial se aplica de forma general.</p>
              </div>
              <button className="primary-button" onClick={() => void saveAll()} disabled={busy === 'all'}>
                {busy === 'all' ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
            <div className="tarifas-vehicle-head">
              <div>
                <span className="eyebrow">TARIFAS POR VEHÍCULO</span>
                <h3>Valores que usa la operación</h3>
                <p>Define por vehículo la tarifa base, los kilómetros incluidos y el recargo por cada kilómetro adicional. Estos valores se comparten con la app móvil.</p>
              </div>
            </div>
            <div className="vehicle-rates tarifas-vehicle-rates">
              {([['Moto', 'moto'], ['Vehículo', 'vehiculo'], ['Camión', 'camion']] as const).map(([vehicle, tone]) => (
                <div className="vehicle-rate-card" key={vehicle}>
                  <span className={`vehicle-rate-icon ${tone}`}><Icon name={tone === 'moto' ? 'moto' : tone === 'camion' ? 'truck' : 'car'} size={17} /></span>
                  <div>
                    <strong>{vehicle}</strong>
                    <small>Tarifa base · C$</small>
                    <input aria-label={`Tarifa base para ${vehicle}`} type="number" min={0} step={0.01} value={vehicleRates[vehicle].baseFeeCs} onChange={(event) => setVehicleRate(vehicle, 'baseFeeCs', Number(event.target.value))} disabled={!settings} />
                    <small>Kilómetros incluidos</small>
                    <input aria-label={`Kilómetros incluidos para ${vehicle}`} type="number" min={0} step={0.5} value={vehicleRates[vehicle].includedKm ?? 4} onChange={(event) => setVehicleRate(vehicle, 'includedKm', Number(event.target.value))} disabled={!settings} />
                    <small>Recargo por km adicional · C$</small>
                    <input aria-label={`Tarifa por kilómetro para ${vehicle}`} type="number" min={0} step={0.01} value={vehicleRates[vehicle].farePerKmCs} onChange={(event) => setVehicleRate(vehicle, 'farePerKmCs', Number(event.target.value))} disabled={!settings} />
                    <em>10 km ≈ C$ {(vehicleRates[vehicle].baseFeeCs + Math.max(0, 10 - (vehicleRates[vehicle].includedKm ?? 4)) * vehicleRates[vehicle].farePerKmCs).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</em>
                  </div>
                </div>
              ))}
            </div>
            <div className="tarifas-vehicle-note">Última actualización compartida: {settings?.updatedAt ? new Date(settings.updatedAt).toLocaleString('es-NI') : '—'} · La tarifa se aplica según el tipo de transporte seleccionado en la operación.</div>
            <div className="tarifas-rounding-block">
              <div>
                <span className="eyebrow">AJUSTE GENERAL</span>
                <h3>Redondeo comercial</h3>
                <p>Se aplica al resultado final de todas las tarifas.</p>
              </div>
              <div className="tarifas-rounding-field">
                <span className="param-currency">C$</span>
                <input aria-label="Redondeo comercial" type="number" min={1} className="param-input" value={draft.roundingCs} onChange={(e) => setParam('roundingCs', Number(e.target.value))} />
                <small>múltiplo</small>
              </div>
            </div>
          </section>

        </>
      )}

      {tab === 'calc' && (
        <section className="panel tarifas-panel">
          <div className="export-panel-head">
            <div>
              <span className="eyebrow">CALCULADORA COMERCIAL</span>
              <h2>Cálculo de tarifa origen → destino</h2>
              <p>Selecciona dos destinos del catálogo (o agrégalos en la pestaña Catálogo) y calcula la tarifa referencial.</p>
            </div>
            <button className="primary-button" onClick={() => void calculate()} disabled={busy === 'calc'}>
              <Icon name="calculator" size={14} /> {busy === 'calc' ? 'Calculando…' : 'Calcular tarifa'}
            </button>
          </div>
          <div className="calc-selectors">
            <label className="calc-select">
              <span>Dato del origen</span>
              <select value={originId} onChange={(e) => setOriginId(e.target.value)}>
                {data.destinations.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.district}</option>)}
              </select>
            </label>
            <label className="calc-select">
              <span>Dato del destino</span>
              <select value={destId} onChange={(e) => setDestId(e.target.value)}>
                {data.destinations.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.district}</option>)}
              </select>
            </label>
            <label className="calc-select">
              <span>Tipo de vehículo</span>
              <select value={calcVehicle} onChange={(e) => setCalcVehicle(e.target.value as keyof AppSettings['vehicleRates'])}>
                <option>Moto</option><option>Vehículo</option><option>Camión</option>
              </select>
            </label>
          </div>
          <div className="calc-grid">
            <div className="calc-card">
              <h3>Dato del origen</h3>
              {paramRow('Distrito', origin?.district ?? '—', '', '')}
              {paramRow('Categoría', origin?.category ?? '—', '', '')}
              {paramRow('Latitud', origin ? origin.latitude.toFixed(6) : '—', '', '')}
              {paramRow('Longitud', origin ? origin.longitude.toFixed(6) : '—', '', '')}
              {paramRow('En cobertura', origin ? (origin.inCoverage ? 'Sí' : 'No') : '—', '', origin?.inCoverage ? '' : 'No activar sin revisión')}
            </div>
            <div className="calc-card">
              <h3>Dato del destino</h3>
              {paramRow('Distrito', destination?.district ?? '—', '', '')}
              {paramRow('Categoría', destination?.category ?? '—', '', '')}
              {paramRow('Latitud', destination ? destination.latitude.toFixed(6) : '—', '', '')}
              {paramRow('Longitud', destination ? destination.longitude.toFixed(6) : '—', '', '')}
              {paramRow('En cobertura', destination ? (destination.inCoverage ? 'Sí' : 'No') : '—', '', destination?.inCoverage ? '' : 'No activar sin revisión')}
            </div>
          </div>
          {result && (
            <div className="calc-grid result-grid">
              <div className="calc-card result-block">
                <h3>RESULTADO</h3>
                {paramRow('Km en línea recta', `${result.straightKm.toFixed(2)} km`, '', '')}
                {paramRow('Km viales estimados', `${result.roadKm.toFixed(2)} km`, '', '')}
                <div className="param-row fare-result"><span className="param-label">Tarifa comercial</span><span className="param-value">C${result.fareCs.toLocaleString('es-NI')}</span></div>
                {paramRow('Estado del cálculo', result.status, '', '')}
                {paramRow('Método', result.method, '', '')}
              </div>
              <div className="calc-card">
                <h3>PARÁMETRO</h3>
                {paramRow('Tarifa base', String(result.params.baseFareCs), 'C$', '')}
                {paramRow('Km incluidos', String(result.params.includedKm), 'km', '')}
                {paramRow('Recargo por km', String(result.params.surchargePerKmCs), 'C$/km', '')}
                {paramRow('Factor vial', String(result.params.roadFactor), '', '')}
                {paramRow('Redondeo', String(result.params.roundingCs), 'C$', '')}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === 'catalog' && (
        <section className="panel table-panel tarifas-catalog-panel">
          <div className="table-toolbar">
            <div className="filter-row">
              <div className="search-box"><Icon name="search" size={13} /><input placeholder="Buscar destino, distrito o categoría…" value={search} onChange={(e) => { setSearch(e.target.value); setCatalogPage(1) }} /></div>
            </div>
            <button className="primary-button" onClick={() => openForm()}><Icon name="plus" size={13} /> Agregar destino</button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Destino</th>
                  <th>Distrito</th>
                  <th>Categoría</th>
                  <th>Coordenadas</th>
                  <th>Cobertura</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleDestinations.map((destination) => (
                  <tr key={destination.id}>
                    <td><b>{destination.name}</b></td>
                    <td>{destination.district}</td>
                    <td>{destination.category}</td>
                    <td><span className="cell-mono">{destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}</span></td>
                    <td>{destination.inCoverage ? <span className="financed-badge cash">Sí</span> : <span className="badge-external">No</span>}</td>
                    <td><span className="param-value">{destination.status}</span></td>
                    <td>
                      <div className="action-group catalog-actions">
                        <button className="mini-btn" onClick={() => openForm(destination)}>Editar</button>
                        <button className="mini-btn danger-mini" onClick={() => void removeDestination(destination.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredDestinations.length === 0 && <EmptyState title="Sin destinos que coincidan" detail="Ajusta la búsqueda o agrega un destino nuevo al catálogo." />}
          <div className="table-footer"><span>Mostrando {visibleDestinations.length} de {filteredDestinations.length} destinos · alimentan las validaciones de la calculadora</span><div className="pagination"><button disabled={safeCatalogPage <= 1} onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}>‹</button>{Array.from({ length: catalogPageCount }, (_, index) => index + 1).map((page) => <button className={page === safeCatalogPage ? 'active' : ''} key={page} onClick={() => setCatalogPage(page)}>{page}</button>)}<button disabled={safeCatalogPage >= catalogPageCount} onClick={() => setCatalogPage((page) => Math.min(catalogPageCount, page + 1))}>›</button></div></div>
        </section>
      )}

      {formOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}>
          <div className="modal-card modal-card wide">
            <div className="modal-header">
              <div><span className="eyebrow">CATÁLOGO DE DESTINOS</span><h2>{editingDest ? `Editar ${editingDest.name}` : 'Agregar destino'}</h2></div>
              <button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="form-grid three">
              <label>Nombre del destino<input placeholder="Ej: Mercado Oriental" value={destForm.name} onChange={(e) => setDestForm({ ...destForm, name: e.target.value })} /></label>
              <label>Distrito<select value={destForm.district} onChange={(e) => setDestForm({ ...destForm, district: e.target.value })}>{DISTRICTS.map((d) => <option key={d} value={d}>Distrito {d}</option>)}</select></label>
              <label>Categoría<select value={destForm.category} onChange={(e) => setDestForm({ ...destForm, category: e.target.value })}>{CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></label>
              <label>Latitud<input type="number" step="any" placeholder="Ej: 12.1298" value={destForm.latitude} onChange={(e) => setDestForm({ ...destForm, latitude: e.target.value })} /></label>
              <label>Longitud<input type="number" step="any" placeholder="Ej: -86.2074" value={destForm.longitude} onChange={(e) => setDestForm({ ...destForm, longitude: e.target.value })} /></label>
              <label>Estado<select value={destForm.status} onChange={(e) => setDestForm({ ...destForm, status: e.target.value })}>{DISTRICT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label className="check-line"><input type="checkbox" checked={destForm.inCoverage} onChange={(e) => setDestForm({ ...destForm, inCoverage: e.target.checked })} /> En cobertura (produce tarifa referencial)</label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setFormOpen(false)}>Cancelar</button>
              <button className="primary-button" onClick={() => void saveDestination()} disabled={busy === 'dest'}>{busy === 'dest' ? 'Guardando…' : 'Guardar destino'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="panel empty-panel">
      <span className="empty-icon"><Icon name="tag" size={20} /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </section>
  )
}
