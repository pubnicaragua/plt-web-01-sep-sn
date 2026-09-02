import { useEffect, useState } from 'react'
import {
  calculateFare,
  createTariffDestination,
  deleteTariffDestination,
  getTarifas,
  updateTariffDistrict,
  updateTariffDestination,
  updateTariffSettings,
} from './lib/api'
import type { FareResult, TariffDestination, TariffDistrict, TariffSettings } from './types'
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

interface TarifasData {
  settings: TariffSettings
  districts: TariffDistrict[]
  destinations: TariffDestination[]
}

export function TarifasView({ onNotice }: { onNotice: (message: string) => void }) {
  const [tab, setTab] = useState<'params' | 'calc' | 'catalog'>('params')
  const [data, setData] = useState<TarifasData | null>(null)
  const [draft, setDraft] = useState<TariffSettings | null>(null)
  const [busy, setBusy] = useState('')
  const [originId, setOriginId] = useState('')
  const [destId, setDestId] = useState('')
  const [result, setResult] = useState<FareResult | null>(null)
  const [search, setSearch] = useState('')
  const [loadError, setLoadError] = useState(false)
  const load = () => {
    setLoadError(false)
    getTarifas()
      .then((loaded) => {
        setData(loaded)
        setDraft(loaded.settings)
        setOriginId(loaded.destinations[0]?.id ?? '')
        setDestId(loaded.destinations[1]?.id ?? '')
      })
      .catch(() => { setLoadError(true); setData(null); setDraft(null) })
  }
  useEffect(() => { load() }, [])
  const [formOpen, setFormOpen] = useState(false)
  const [editingDest, setEditingDest] = useState<TariffDestination | null>(null)
  const [destForm, setDestForm] = useState<{ name: string; district: string; category: string; latitude: string; longitude: string; inCoverage: boolean; status: string }>({ name: '', district: 'I', category: 'Barrio / sector', latitude: '', longitude: '', inCoverage: true, status: 'Por verificar' })



  async function saveParams() {
    if (!draft) return
    setBusy('params')
    try {
      const updated = await updateTariffSettings(draft)
      setData((current) => (current ? { ...current, settings: updated } : current))
      setDraft(updated)
      onNotice('Parámetros del catálogo guardados')
    } catch {
      onNotice('No se pudieron guardar los parámetros')
    } finally {
      setBusy('')
    }
  }

  function setParam<K extends keyof TariffSettings>(key: K, value: TariffSettings[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  async function toggleDistrict(id: string, inCoverage: boolean) {
    try {
      const updated = await updateTariffDistrict(id, { inCoverage })
      setData((current) => (current ? { ...current, districts: current.districts.map((d) => (d.id === id ? updated : d)) } : current))
    } catch {
      onNotice('No se pudo actualizar el distrito')
    }
  }

  async function setDistrictStatus(id: string, status: string) {
    try {
      const updated = await updateTariffDistrict(id, { status })
      setData((current) => (current ? { ...current, districts: current.districts.map((d) => (d.id === id ? updated : d)) } : current))
    } catch {
      onNotice('No se pudo actualizar el estado del distrito')
    }
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

  const origin = data.destinations.find((d) => d.id === originId)
  const destination = data.destinations.find((d) => d.id === destId)

  const paramRow = (label: string, value: string, unit: string, detail: string) => (
    <div className="param-row">
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
            Las celdas amarillas pueden modificarse. Las listas alimentan las validaciones del catálogo y de la calculadora de tarifas.
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
                <span>Distancia máxima para posible duplicado</span>
                <input type="number" min={10} className="param-input" value={draft.duplicateDistanceM} onChange={(e) => setParam('duplicateDistanceM', Number(e.target.value))} />
                <small>Umbral orientativo para revisar registros con el mismo nombre.</small>
              </div>
              <div className="param-cell">
                <span>Estado mínimo recomendado</span>
                <select className="param-input" value={draft.minRecommendedStatus} onChange={(e) => setParam('minRecommendedStatus', e.target.value)}>
                  {DISTRICT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
                <small>Estado sugerido antes de usar un destino en producción.</small>
              </div>
              <div className="param-cell">
                <span>Fuente cartográfica principal</span>
                <input className="param-input" value={draft.cartographicSource} onChange={(e) => setParam('cartographicSource', e.target.value)} />
                <small>Debe complementarse con validación municipal y operativa.</small>
              </div>
            </div>
          </section>

          <section className="panel tarifas-panel">
            <div className="export-panel-head">
              <div>
                <span className="eyebrow">MOTOR TARIFARIO</span>
                <h2>Parámetros tarifarios</h2>
                <p>Tarifa base, kilómetros incluidos, recargo, factor vial y redondeo comercial que usa la calculadora.</p>
              </div>
              <button className="primary-button" onClick={() => void saveParams()} disabled={busy === 'params'}>
                {busy === 'params' ? 'Guardando…' : 'Guardar parámetros'}
              </button>
            </div>
            <div className="param-grid compact">
              <div className="param-cell">
                <span>Tarifa base</span>
                <div className="param-input-wrap"><span className="param-currency">C$</span><input type="number" min={0} className="param-input" value={draft.baseFareCs} onChange={(e) => setParam('baseFareCs', Number(e.target.value))} /></div>
                <small>Precio mínimo del envío.</small>
              </div>
              <div className="param-cell">
                <span>Kilómetros incluidos</span>
                <div className="param-input-wrap"><input type="number" min={0} step={0.5} className="param-input" value={draft.includedKm} onChange={(e) => setParam('includedKm', Number(e.target.value))} /><span className="param-unit">km</span></div>
                <small>Distancia estimada cubierta por la tarifa base.</small>
              </div>
              <div className="param-cell">
                <span>Recargo por km adicional</span>
                <div className="param-input-wrap"><span className="param-currency">C$</span><input type="number" min={0} className="param-input" value={draft.surchargePerKmCs} onChange={(e) => setParam('surchargePerKmCs', Number(e.target.value))} /><span className="param-unit">/km</span></div>
                <small>Cargo aplicado sobre la distancia que exceda los km incluidos.</small>
              </div>
              <div className="param-cell">
                <span>Factor vial</span>
                <div className="param-input-wrap"><input type="number" min={1} step={0.05} className="param-input" value={draft.roadFactor} onChange={(e) => setParam('roadFactor', Number(e.target.value))} /></div>
                <small>Convierte la distancia en línea recta en distancia vial estimada.</small>
              </div>
              <div className="param-cell">
                <span>Redondeo comercial</span>
                <div className="param-input-wrap"><span className="param-currency">C$</span><input type="number" min={1} className="param-input" value={draft.roundingCs} onChange={(e) => setParam('roundingCs', Number(e.target.value))} /></div>
                <small>La tarifa final se redondea hacia arriba al múltiplo indicado.</small>
              </div>
            </div>
          </section>

          <section className="panel tarifas-panel">
            <div className="export-panel-head">
              <div>
                <span className="eyebrow">COBERTURA MUNICIPAL</span>
                <h2>Distritos · valores Sí/No y estados permitidos</h2>
                <p>La cobertura determina si un destino del distrito produce TARIFA REFERENCIAL o FUERA DE COBERTURA.</p>
              </div>
            </div>
            <table className="data-table districts-table">
              <thead>
                <tr>
                  <th>Distrito</th>
                  <th>Valores Sí/No</th>
                  <th>Estados permitidos</th>
                </tr>
              </thead>
              <tbody>
                {data.districts.map((district) => (
                  <tr key={district.id}>
                    <td><b>{district.name}</b></td>
                    <td>
                      <label className="yesno-toggle">
                        <input type="checkbox" checked={district.inCoverage} onChange={(e) => void toggleDistrict(district.id, e.target.checked)} />
                        <b>{district.inCoverage ? 'Sí' : 'No'}</b>
                      </label>
                    </td>
                    <td>
                      <select className="param-input status-select" value={district.status} onChange={(e) => void setDistrictStatus(district.id, e.target.value)}>
                        {DISTRICT_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="table-footer"><span>Última actualización de parámetros: {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString('es-NI') : '—'}</span></div>
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
        <section className="panel table-panel">
          <div className="table-toolbar">
            <div className="filter-row">
              <div className="search-box"><Icon name="search" size={13} /><input placeholder="Buscar destino, distrito o categoría…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
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
                {filteredDestinations.map((destination) => (
                  <tr key={destination.id}>
                    <td><b>{destination.name}</b></td>
                    <td>{destination.district}</td>
                    <td>{destination.category}</td>
                    <td><span className="cell-mono">{destination.latitude.toFixed(5)}, {destination.longitude.toFixed(5)}</span></td>
                    <td>{destination.inCoverage ? <span className="financed-badge cash">Sí</span> : <span className="badge-external">No</span>}</td>
                    <td><span className="param-value">{destination.status}</span></td>
                    <td>
                      <div className="action-group">
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
          <div className="table-footer"><span>{filteredDestinations.length} de {data.destinations.length} destinos · alimentan las validaciones de la calculadora</span></div>
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