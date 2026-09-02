const fs = require('node:fs')
const path = 'src/App.tsx'
let c = fs.readFileSync(path, 'utf8')
const ok = (label, cond) => console.log((cond ? 'OK  ' : 'FAIL ') + label)
let before

// 1) detail doc fields
before = c
c = c.replace(
  '<div className="trip-detail-field"><span>Tanque (L)</span>',
  '<div className="trip-detail-field"><span>Marca / Color</span><strong>{detailVehicle.brand || \'—\'}{detailVehicle.color ? \' · \' + detailVehicle.color : \'\'}</strong></div>\n            <div className="trip-detail-field"><span>N° Motor</span><strong>{detailVehicle.motorNo || \'—\'}</strong></div>\n            <div className="trip-detail-field"><span>N° Chasis (VIN)</span><strong>{detailVehicle.chassisNo || \'—\'}</strong></div>\n            <div className="trip-detail-field"><span>Tanque (L)</span>'
)
ok('detail-docs', before !== c)

// 2) incident actions labeled
before = c
const oldActs = /<div className="action-group" key=\{`\$\{incident\.id\}-actions`\}><button title="Ver detalle"[^]*?><Icon \/><\/button><\/div>/
const actMatch = c.match(oldActs)
ok('inc-actions-found', !!actMatch)
if (actMatch) {
  const labelled = `<div className="action-group" key={\`\${incident.id}-actions\`}><button className="mini-btn" title="Ver detalle y notas" onClick={() => setDetailIncident(incident)}>Ver</button>${actMatch[0].includes('En proceso') ? '' : ''}<button className="mini-btn" title="Poner en proceso" disabled={acting === incident.id || incident.status === 'En proceso' || incident.status === 'Resuelta'} onClick={() => void changeStatus(incident, 'En proceso')}>Proceso</button><button className="mini-btn primary-mini" title="Marcar resuelta" disabled={acting === incident.id || incident.status === 'Resuelta'} onClick={() => void changeStatus(incident, 'Resuelta')}>Resuelta</button></div>`
  c = c.replace(actMatch[0], labelled)
  ok('inc-actions', true)
}

fs.writeFileSync(path, c, 'utf8')
console.log('wstep9 written')
