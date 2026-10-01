// Panel con el detalle de una tienda y sus acciones.
import {
  S, ESTADOS, esc, nombre, primerNombre, soyCoordinador, formatoFecha, distancia, formatoDistancia, meta, conteos,
} from './estado.js'
import { ubicacionUnaVez } from './ubicacion.js'
import { comprimirFoto } from './foto.js'

let api
let ctx // { avisar, aplicarEstado, aplicarTienda, mostrarPanel }

export function iniciarTienda(apiRef, contexto) {
  api = apiRef
  ctx = contexto
}

function direccion(t) {
  const calle = [t.calle, t.numero && t.numero !== '0' ? t.numero : ''].filter(Boolean).join(' ')
  return [calle, t.colonia && `Col. ${t.colonia}`, t.cp && `C.P. ${t.cp}`].filter(Boolean).join(', ')
}

function etiquetaEstado(e) {
  const mia = e.asignado_a === S.yo
  switch (e.estado) {
    case 'pendiente':
      return 'Libre, sin asignar'
    case 'apartada':
      return mia ? 'Asignada a ti' : `Asignada a ${esc(nombre(e.asignado_a))}`
    case 'visitada':
      return e.visitada_por === S.yo ? 'La visitaste tú' : `Visitada por ${esc(nombre(e.visitada_por))}`
  }
}

export function htmlTienda(cr) {
  const t = S.tiendas.get(cr)
  const e = S.estados.get(cr)
  const mia = e.asignado_a === S.yo
  const coord = soyCoordinador()
  const distanciaTexto = S.miPos && t.lat != null ? `A ${formatoDistancia(distancia(S.miPos, t))} de ti` : ''

  let detalle = ''
  if (e.estado === 'apartada' && e.apartada_en) detalle = `Desde ${formatoFecha(e.apartada_en)}`
  if (e.estado === 'visitada') detalle = formatoFecha(e.visitada_en)

  const acciones = []
  if (e.estado === 'pendiente') {
    acciones.push(`<button class="btn btn-primario" data-accion="apartar">Asignármela</button>`)
    acciones.push(`<button class="btn" data-accion="form-visita">Ya la visité</button>`)
  } else if (e.estado === 'apartada' && (mia || coord)) {
    acciones.push(`<button class="btn btn-primario" data-accion="form-visita">Marcar visitada</button>`)
    acciones.push(`<button class="btn btn-sutil" data-accion="liberar">${mia ? 'Ya no voy, liberarla' : 'Liberar'}</button>`)
  } else if (e.estado === 'visitada' && coord) {
    acciones.push(`<button class="btn btn-sutil" data-accion="liberar">Deshacer visita</button>`)
  }

  const reasignar = coord && e.estado !== 'visitada'
    ? `<div class="coord">
        <label class="campo campo-fila">
          <span>Asignar a</span>
          <select data-campo="persona">
            ${[...S.personas.values()].map((p) => `<option value="${p.id}" ${p.id === e.asignado_a ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-sutil" data-accion="reasignar">Asignar</button>
      </div>`
    : ''

  const moverUbicacion = coord
    ? `<button class="enlace" data-accion="mover">Mover el punto de esta tienda a mi ubicación actual</button>`
    : ''

  return `
    <article class="tienda" data-cr="${esc(cr)}">
      <p class="tienda-estado" style="--estado:${ESTADOS[e.estado].color}">
        <span class="punto" aria-hidden="true"></span>${etiquetaEstado(e)}
        ${detalle ? `<span class="tienda-cuando">${esc(detalle)}</span>` : ''}
      </p>
      <h2 class="tienda-nombre">${esc(t.nombre)}</h2>
      <p class="tienda-cr">CR ${esc(t.cr)}${distanciaTexto ? ` <span class="tienda-dist">${distanciaTexto}</span>` : ''}</p>

      <p class="tienda-dir">${esc(direccion(t))}</p>
      ${t.entre_calles ? `<p class="tienda-ref"><b>Entre:</b> ${esc(t.entre_calles)}</p>` : ''}
      ${t.referencia ? `<p class="tienda-ref"><b>Referencia:</b> ${esc(t.referencia)}</p>` : ''}
      ${t.ubicacion_aprox ? `<p class="nota-aprox">El punto en el mapa es aproximado. Guíate por la dirección.</p>` : ''}

      ${e.notas ? `<blockquote class="tienda-notas">${esc(e.notas)}</blockquote>` : ''}
      ${e.foto_path ? `<button class="enlace" data-accion="ver-foto">Ver foto del formato</button><div class="foto-vista" hidden></div>` : ''}

      <div class="acciones">
        ${acciones.join('')}
        ${t.lat != null ? `<a class="btn btn-sutil" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}">Cómo llegar</a>` : ''}
      </div>
      ${reasignar}
      ${moverUbicacion}
      <p class="tienda-oxxo">Ruta OXXO ${esc(t.ruta_oxxo ?? '–')}, asesor ${esc(t.asesor_oxxo || 'sin dato')}</p>
    </article>`
}

function htmlFormVisita(cr) {
  const t = S.tiendas.get(cr)
  return `
    <form class="tienda form-visita" data-cr="${esc(cr)}">
      <h2 class="tienda-nombre">Visita a ${esc(t.nombre)}</h2>
      <label class="campo">
        <span>Foto del formato (opcional)</span>
        <input type="file" accept="image/*" capture="environment" data-campo="foto" />
      </label>
      <img class="foto-previa" alt="Foto seleccionada" hidden />
      <label class="campo">
        <span>Notas (opcional)</span>
        <textarea data-campo="notas" rows="3" placeholder="Con quién hablaste, qué acordaron…"></textarea>
      </label>
      <p class="gps" data-gps>Buscando tu ubicación…</p>
      <div class="acciones">
        <button class="btn btn-primario" type="submit">Guardar visita</button>
        <button class="btn btn-sutil" type="button" data-accion="cancelar">Cancelar</button>
      </div>
    </form>`
}

/** Conecta los botones del panel de una tienda. `el` es el contenedor del panel. */
export function conectarTienda(el, cr) {
  el.querySelectorAll('[data-accion]').forEach((b) => {
    b.addEventListener('click', (ev) => accion(ev, el, cr, b.dataset.accion))
  })
}

async function ejecutar(boton, fn) {
  const texto = boton?.textContent
  if (boton) { boton.disabled = true; boton.textContent = 'Guardando…' }
  try {
    return await fn()
  } catch (err) {
    ctx.avisar(err.message, true)
    if (boton) { boton.disabled = false; boton.textContent = texto }
    return null
  }
}

async function accion(ev, el, cr, tipo) {
  const boton = ev.currentTarget
  switch (tipo) {
    case 'apartar': {
      const fila = await ejecutar(boton, () => api.apartar(cr, S.yo))
      if (fila) { ctx.aplicarEstado(fila); ctx.avisar('Asignada a ti. Nadie más la puede tomar.') }
      break
    }
    case 'liberar': {
      const e = S.estados.get(cr)
      const pregunta = e.estado === 'visitada'
        ? `¿Deshacer la visita de ${nombre(e.visitada_por)}? Se borran sus notas y foto.`
        : '¿Liberar esta tienda para que alguien más la pueda tomar?'
      if (!confirm(pregunta)) return
      const fila = await ejecutar(boton, () => api.liberar(cr, S.yo))
      if (fila) { ctx.aplicarEstado(fila); ctx.avisar('Tienda liberada.') }
      break
    }
    case 'reasignar': {
      const persona = Number(el.querySelector('[data-campo="persona"]').value)
      const fila = await ejecutar(boton, () => api.reasignar(cr, persona))
      if (fila) { ctx.aplicarEstado(fila); ctx.avisar(`Asignada a ${primerNombre(persona)}.`) }
      break
    }
    case 'mover': {
      if (!confirm('¿Mover el punto de esta tienda a donde estás ahora? Hazlo solo si estás en la tienda.')) return
      const pos = await ubicacionUnaVez().catch((err) => { ctx.avisar(err.message, true); return null })
      if (!pos) return
      const t = await ejecutar(null, () => api.corregirUbicacion(cr, pos.lat, pos.lng))
      if (t) { ctx.aplicarTienda(t); ctx.avisar('Ubicación de la tienda actualizada.') }
      break
    }
    case 'ver-foto': {
      const caja = el.querySelector('.foto-vista')
      boton.hidden = true
      caja.hidden = false
      caja.textContent = 'Cargando foto…'
      try {
        const url = await api.urlFoto(S.estados.get(cr).foto_path)
        caja.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Foto del formato" /></a>`
      } catch (err) {
        caja.textContent = 'No se pudo cargar la foto: ' + err.message
      }
      break
    }
    case 'form-visita':
      abrirFormVisita(el, cr)
      break
    case 'cancelar':
      ctx.mostrarPanel('tienda', cr)
      break
  }
}

function abrirFormVisita(el, cr) {
  el.innerHTML = htmlFormVisita(cr)
  const form = el.querySelector('form')
  const t = S.tiendas.get(cr)
  const gps = form.querySelector('[data-gps]')
  const inputFoto = form.querySelector('[data-campo="foto"]')
  const previa = form.querySelector('.foto-previa')
  let pos = null
  let foto = null

  ubicacionUnaVez()
    .then((p) => {
      pos = p
      if (t.lat != null && !t.ubicacion_aprox) {
        const d = distancia(p, t)
        gps.textContent = d > 500
          ? `Estás a ${formatoDistancia(d)} de la tienda. Se guardará tu ubicación de todos modos.`
          : `Ubicación tomada: estás a ${formatoDistancia(d)} de la tienda.`
        gps.classList.toggle('gps-lejos', d > 500)
      } else {
        gps.textContent = 'Ubicación tomada.'
      }
    })
    .catch(() => { gps.textContent = 'No se pudo tomar tu ubicación. La visita se guarda sin ella.' })

  inputFoto.addEventListener('change', async () => {
    const archivo = inputFoto.files[0]
    if (!archivo) { foto = null; previa.hidden = true; return }
    try {
      foto = await comprimirFoto(archivo)
      previa.src = URL.createObjectURL(foto)
      previa.hidden = false
    } catch {
      foto = null
      ctx.avisar('No se pudo leer esa foto. Intenta con otra.', true)
    }
  })

  form.querySelector('[data-accion="cancelar"]').addEventListener('click', () => ctx.mostrarPanel('tienda', cr))
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const boton = form.querySelector('[type="submit"]')
    const notas = form.querySelector('[data-campo="notas"]').value
    const fila = await ejecutar(boton, () => api.marcarVisitada(cr, S.yo, { notas, foto, lat: pos?.lat ?? null, lng: pos?.lng ?? null }))
    if (fila) {
      ctx.aplicarEstado(fila)
      ctx.mostrarPanel('tienda', cr)
      const hechas = conteos().visitada
      const faltan = meta() - hechas
      ctx.avisar(faltan > 0 ? `Visita guardada. Van ${hechas}, faltan ${faltan} para la meta.` : `Visita guardada. ¡Meta cumplida con ${hechas}!`)
    }
  })
}
