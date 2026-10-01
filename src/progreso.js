// Barra de avance, panel del equipo, lista de tiendas y exportación a CSV.
import {
  S, ESTADOS, esc, meta, conteos, soyCoordinador, nombre, visible, distancia, formatoDistancia, formatoFecha,
  PORCENTAJE_META,
} from './estado.js'

const $ = (id) => document.getElementById(id)

export function actualizarAvance() {
  const total = S.tiendas.size
  if (!total) return
  const c = conteos()
  const m = meta()
  $('avance-hechas').textContent = c.visitada
  $('avance-meta').textContent = m

  // Barra sobre el total de tiendas: visitadas y luego asignadas; la marca indica el 70%.
  const pct = (n) => (n / total) * 100
  const v = pct(c.visitada)
  const a = pct(c.apartada)
  $('avance-barra').style.background = `linear-gradient(to right,
    ${ESTADOS.visitada.color} 0 ${v}%,
    ${ESTADOS.apartada.color} ${v}% ${v + a}%,
    transparent ${v + a}% 100%)`
  $('avance-meta-marca').style.left = `${PORCENTAJE_META * 100}%`

  const faltan = m - c.visitada
  $('avance-texto').textContent = faltan > 0
    ? `Faltan ${faltan} para la meta`
    : `Meta cumplida. Llevan ${Math.round(pct(c.visitada))}% de las tiendas.`
}

function resumenPorPersona() {
  const filas = new Map([...S.personas.keys()].map((id) => [id, { visitadas: 0, pendientes: 0 }]))
  for (const e of S.estados.values()) {
    if (e.estado === 'visitada' && filas.has(e.visitada_por)) filas.get(e.visitada_por).visitadas++
    if (e.estado === 'apartada' && filas.has(e.asignado_a)) filas.get(e.asignado_a).pendientes++
  }
  return [...filas].sort((x, y) => y[1].visitadas - x[1].visitadas || nombre(x[0]).localeCompare(nombre(y[0])))
}

export function htmlEquipo() {
  const c = conteos()
  const m = meta()
  const leyenda = ['visitada', 'apartada', 'pendiente']
    .map((k) => `<li style="--estado:${ESTADOS[k].color}"><span class="punto" aria-hidden="true"></span>${ESTADOS[k].texto}<b>${c[k]}</b></li>`)
    .join('')
  const personas = resumenPorPersona()
    .map(([id, r]) => `
      <tr data-persona="${id}" class="${S.persona === id ? 'activa' : ''}">
        <th scope="row">${esc(nombre(id))}${id === S.yo ? ' <span class="tu">(tú)</span>' : ''}</th>
        <td>${r.visitadas}</td>
        <td>${r.pendientes}</td>
      </tr>`)
    .join('')

  return `
    <section class="equipo">
      <h2 class="equipo-titulo">${c.visitada} de ${m} tiendas visitadas</h2>
      <p class="equipo-sub">La meta es el ${Math.round(PORCENTAJE_META * 100)}% de ${S.tiendas.size} tiendas de Fundación Nicoya.</p>
      <ul class="leyenda">${leyenda}</ul>

      <table class="tabla-equipo">
        <thead><tr><th scope="col">Persona</th><th scope="col">Visitadas</th><th scope="col">Por visitar</th></tr></thead>
        <tbody>${personas}</tbody>
      </table>
      <p class="equipo-ayuda">Toca a una persona para ver solo sus tiendas en el mapa.</p>

      ${soyCoordinador() ? `
        <form class="form-persona">
          <label class="campo">
            <span>Agregar persona al equipo</span>
            <input type="text" maxlength="40" required placeholder="Nombre" />
          </label>
          <button class="btn" type="submit">Agregar</button>
        </form>` : ''}

      <div class="acciones">
        ${soyCoordinador() ? `<button class="btn" data-accion="csv">Descargar reporte (CSV)</button>` : ''}
        <button class="btn btn-sutil" data-accion="cambiar-persona">No soy ${esc(nombre(S.yo))}, cambiar</button>
        <button class="btn btn-sutil" data-salir>Cerrar sesión</button>
      </div>
    </section>`
}

export function htmlLista() {
  let crs = [...S.tiendas.keys()].filter(visible)
  const conDistancia = S.miPos != null
  if (conDistancia) {
    const d = new Map(crs.map((cr) => [cr, S.tiendas.get(cr).lat != null ? distancia(S.miPos, S.tiendas.get(cr)) : Infinity]))
    crs.sort((a, b) => d.get(a) - d.get(b))
  } else {
    crs.sort((a, b) => S.tiendas.get(a).nombre.localeCompare(S.tiendas.get(b).nombre))
  }

  if (!crs.length) {
    return `<section class="lista"><p class="lista-vacia">Ninguna tienda coincide. Prueba con otro filtro o borra la búsqueda.</p></section>`
  }

  const items = crs.map((cr) => {
    const t = S.tiendas.get(cr)
    const e = S.estados.get(cr)
    const quien = e.estado === 'visitada' ? nombre(e.visitada_por) : e.asignado_a ? nombre(e.asignado_a) : ''
    const dist = conDistancia && t.lat != null ? formatoDistancia(distancia(S.miPos, t)) : ''
    return `
      <li>
        <button class="item" data-cr="${esc(cr)}" style="--estado:${ESTADOS[e.estado].color}">
          <span class="punto" aria-hidden="true"></span>
          <span class="item-texto">
            <span class="item-nombre">${esc(t.nombre)}</span>
            <span class="item-sub">${esc(t.colonia || t.calle)}${quien ? `, ${esc(quien.split(' ')[0])}` : ''}</span>
          </span>
          ${dist ? `<span class="item-dist">${dist}</span>` : ''}
        </button>
      </li>`
  })
  return `
    <section class="lista">
      <p class="lista-cuenta">${crs.length} ${crs.length === 1 ? 'tienda' : 'tiendas'}${conDistancia ? ', las más cercanas primero' : ''}</p>
      <ul>${items.join('')}</ul>
    </section>`
}

export function descargarCSV() {
  const cols = ['CR', 'Tienda', 'Colonia', 'Dirección', 'Estado', 'Asignada a', 'Visitada por', 'Fecha de visita',
    'Notas', 'Lat visita', 'Lng visita', 'Ruta OXXO', 'Asesor OXXO']
  const filas = [...S.tiendas.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((t) => {
      const e = S.estados.get(t.cr)
      return [
        t.cr, t.nombre, t.colonia, [t.calle, t.numero].filter(Boolean).join(' '), ESTADOS[e.estado].texto,
        e.asignado_a ? nombre(e.asignado_a) : '', e.visitada_por ? nombre(e.visitada_por) : '',
        formatoFecha(e.visitada_en), e.notas, e.visita_lat, e.visita_lng, t.ruta_oxxo, t.asesor_oxxo,
      ]
    })
  const celda = (v) => {
    const s = String(v ?? '')
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = '﻿' + [cols, ...filas].map((f) => f.map(celda).join(',')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `redondeo-nicoya-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const porcentaje = (n, de) => (de ? Math.round((n / de) * 100) : 0)

/** Tiendas de cada persona: las que tiene asignadas y las que ya visitó. */
function tiendasPorPersona() {
  const mapa = new Map([...S.personas.keys()].map((id) => [id, []]))
  for (const e of S.estados.values()) {
    const id = e.estado === 'visitada' ? e.visitada_por : e.estado === 'apartada' ? e.asignado_a : null
    if (mapa.has(id)) mapa.get(id).push(e)
  }
  return mapa
}

/** Reporte: avance contra la meta y, por persona, su porcentaje y su lista de tiendas. */
export function htmlReporte(abiertos = new Set()) {
  const c = conteos()
  const total = S.tiendas.size
  const m = meta()
  const faltan = Math.max(0, m - c.visitada)

  const filas = [...tiendasPorPersona()]
    .map(([id, estados]) => {
      const visitadas = estados.filter((e) => e.estado === 'visitada')
      return { id, estados, visitadas: visitadas.length, total: estados.length }
    })
    .sort((a, b) => b.visitadas - a.visitadas || b.total - a.total || nombre(a.id).localeCompare(nombre(b.id)))

  const personas = filas.map(({ id, estados, visitadas, total: suyas }) => {
    const pct = porcentaje(visitadas, suyas)
    const orden = [...estados].sort((a, b) =>
      (a.estado === 'visitada') - (b.estado === 'visitada') ||
      (b.visitada_en || '').localeCompare(a.visitada_en || '') ||
      S.tiendas.get(a.cr).nombre.localeCompare(S.tiendas.get(b.cr).nombre))
    const lista = orden.map((e) => {
      const t = S.tiendas.get(e.cr)
      const detalle = e.estado === 'visitada' ? `Visitada ${formatoFecha(e.visitada_en)}` : 'Asignada, por visitar'
      return `
        <li>
          <button class="item" data-cr="${esc(e.cr)}" style="--estado:${ESTADOS[e.estado].color}">
            <span class="punto" aria-hidden="true"></span>
            <span class="item-texto">
              <span class="item-nombre">${esc(t.nombre)}</span>
              <span class="item-sub">${esc(detalle)}${t.colonia ? `, ${esc(t.colonia)}` : ''}</span>
            </span>
          </button>
        </li>`
    }).join('')

    return `
      <details class="rep-persona" data-persona="${id}" ${abiertos.has(id) ? 'open' : ''}>
        <summary>
          <span class="rep-nombre">${esc(nombre(id))}${id === S.yo ? ' <span class="tu">(tú)</span>' : ''}</span>
          <span class="rep-pct">${suyas ? `${pct}%` : '–'}</span>
          <span class="rep-sub">${suyas ? `${visitadas} de ${suyas} ${suyas === 1 ? 'tienda visitada' : 'tiendas visitadas'}` : 'Sin tiendas asignadas'}</span>
          ${suyas ? `<span class="rep-barra" aria-hidden="true"><span style="width:${pct}%"></span></span>` : ''}
        </summary>
        ${suyas ? `<ul class="rep-lista">${lista}</ul>` : ''}
      </details>`
  }).join('')

  return `
    <section class="reporte">
      <h2 class="equipo-titulo">Reporte del redondeo</h2>
      <p class="equipo-sub">Al ${esc(new Date().toLocaleString('es-MX', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }))}</p>

      <dl class="rep-cifras">
        <div><dt>Visitadas</dt><dd>${c.visitada}</dd></div>
        <div><dt>Meta (${Math.round(PORCENTAJE_META * 100)}%)</dt><dd>${m}</dd></div>
        <div><dt>Avance de la meta</dt><dd>${Math.min(100, porcentaje(c.visitada, m))}%</dd></div>
        <div><dt>Del total de ${total}</dt><dd>${porcentaje(c.visitada, total)}%</dd></div>
      </dl>
      <p class="rep-resumen">${faltan > 0 ? `Faltan <b>${faltan}</b> visitas para la meta.` : '<b>Meta cumplida.</b>'}
        Hay ${c.apartada} ${c.apartada === 1 ? 'tienda asignada' : 'tiendas asignadas'} por visitar y ${c.pendiente} libres.</p>

      <h3 class="rep-titulo">Por persona</h3>
      <p class="equipo-ayuda rep-ayuda">El porcentaje es de las tiendas que cada quien tiene: visitadas entre visitadas y asignadas. Toca a una persona para ver su lista.</p>
      ${personas}
    </section>`
}
