// Panel de coordinación: agregar personas al equipo, corregir su nombre o quitarlas.
import { S, esc } from './estado.js'
import { tiendasPorPersona } from './progreso.js'
import { ejecutar } from './tienda.js'

let api
let ctx // { avisar, mostrarPanel, personasCambiaron }

export function iniciarPersonas(apiRef, contexto) {
  api = apiRef
  ctx = contexto
}

const cuantas = (n) => (n ? `${n} ${n === 1 ? 'tienda' : 'tiendas'}` : 'Sin tiendas')

export function htmlPersonas() {
  const tiendas = tiendasPorPersona()
  const filas = [...S.personas.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => `
      <li class="persona" data-id="${p.id}">
        <span class="persona-texto">
          <span class="persona-nombre">${esc(p.nombre)}${p.id === S.yo ? ' <span class="tu">(tú)</span>' : ''}</span>
          <span class="persona-sub">${cuantas(tiendas.get(p.id).length)}</span>
        </span>
        <button class="btn btn-sutil" type="button" data-accion="editar">Editar</button>
      </li>`)
    .join('')

  return `
    <section class="personas">
      <h2 class="equipo-titulo">Personas del equipo</h2>
      <p class="equipo-sub">Aparecen al entrar, para que cada quien elija su nombre, y al asignar tiendas.</p>
      <form class="form-persona">
        <label class="campo">
          <span>Agregar persona</span>
          <input type="text" maxlength="40" required autocomplete="off" placeholder="Nombre" />
        </label>
        <button class="btn btn-primario" type="submit">Agregar</button>
      </form>
      <h3 class="rep-titulo">En el equipo (${S.personas.size})</h3>
      <ul class="lista-personas">${filas}</ul>
    </section>`
}

export function conectarPersonas(el) {
  el.querySelector('.form-persona').addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const form = ev.currentTarget
    const p = await ejecutar(form.querySelector('[type="submit"]'), () => api.agregarPersona(form.querySelector('input').value))
    if (!p) return
    S.personas.set(Number(p.id), { id: Number(p.id), nombre: p.nombre })
    listo(`${p.nombre} ya está en el equipo. Al entrar puede elegir su nombre.`)
  })
  el.querySelectorAll('[data-accion="editar"]').forEach((b) => b.addEventListener('click', () => editar(b.closest('li'))))
}

/** Cambia la fila de una persona por un formulario para corregir su nombre o quitarla. */
function editar(li) {
  const id = Number(li.dataset.id)
  const p = S.personas.get(id)
  if (!p) { ctx.mostrarPanel('personas'); return }
  const n = tiendasPorPersona().get(id).length
  const quitar = n
    ? `<p class="equipo-ayuda">Tiene ${cuantas(n)} a su nombre, así que no se puede quitar del equipo.</p>`
    : p.id === S.yo
      ? `<p class="equipo-ayuda">Para quitarte a ti, primero cambia de persona.</p>`
      : `<button class="enlace enlace-peligro" type="button" data-accion="quitar">Quitar a ${esc(p.nombre)} del equipo</button>`

  li.classList.add('editando')
  li.innerHTML = `
    <form class="form-editar">
      <label class="campo">
        <span>Nombre</span>
        <input type="text" maxlength="40" required autocomplete="off" value="${esc(p.nombre)}" />
      </label>
      <div class="form-editar-botones">
        <button class="btn btn-primario" type="submit">Guardar</button>
        <button class="btn btn-sutil" type="button" data-accion="cancelar">Cancelar</button>
      </div>
      ${quitar}
    </form>`

  const form = li.querySelector('form')
  const input = form.querySelector('input')
  input.focus()
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const fila = await ejecutar(form.querySelector('[type="submit"]'), () => api.renombrarPersona(id, input.value))
    if (!fila) return
    S.personas.set(id, { id, nombre: fila.nombre })
    listo(fila.nombre === p.nombre ? 'Nombre guardado.' : `${p.nombre} ahora se llama ${fila.nombre}.`)
  })
  form.querySelector('[data-accion="cancelar"]').addEventListener('click', () => ctx.mostrarPanel('personas'))
  form.querySelector('[data-accion="quitar"]')?.addEventListener('click', async (ev) => {
    if (!confirm(`¿Quitar a ${p.nombre} del equipo? Ya no aparecerá para elegir su nombre ni para asignarle tiendas.`)) return
    const ok = await ejecutar(ev.currentTarget, async () => { await api.quitarPersona(id); return true })
    if (!ok) return
    S.personas.delete(id)
    listo(`${p.nombre} ya no está en el equipo.`)
  })
}

function listo(texto) {
  ctx.personasCambiaron()
  ctx.mostrarPanel('personas')
  ctx.avisar(texto)
}
