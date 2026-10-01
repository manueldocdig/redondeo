import './styles.css'
import { S, FILTROS, visible, nombre, soyCoordinador, esc } from './estado.js'
import {
  crearMapa, dibujarTiendas, actualizarMarcador, actualizarTodos, encuadrar, irA, mostrarYo, moverTienda,
  refrescarTamano,
} from './mapa.js'
import { iniciarTienda, htmlTienda, conectarTienda } from './tienda.js'
import { actualizarAvance, htmlEquipo, htmlLista, descargarCSV } from './progreso.js'
import { seguirUbicacion } from './ubicacion.js'

// En modo demo (npm run demo) se usa una base de datos de mentiras en memoria.
const api = import.meta.env.VITE_DEMO ? await import('./api-demo.js') : await import('./api.js')

const $ = (id) => document.getElementById(id)
let modoPanel = null // 'tienda' | 'lista' | 'equipo'
let mapaListo = false
let dejarDeSeguir = null
let cancelarSuscripcion = null

// ---------------------------------------------------------------- Avisos
let temporizadorAviso
function avisar(texto, esError = false) {
  const el = $('aviso')
  el.textContent = texto
  el.classList.toggle('aviso-error', esError)
  el.hidden = false
  clearTimeout(temporizadorAviso)
  temporizadorAviso = setTimeout(() => { el.hidden = true }, esError ? 6000 : 3500)
}

// ---------------------------------------------------------------- Sesión
async function arrancar() {
  // setTimeout: Supabase recomienda no llamar a la base dentro del aviso de sesión.
  api.alCambiarSesion((id) => setTimeout(() => {
    if (id && id !== S.cuenta) entrarApp(id)
    if (!id && S.cuenta) location.reload()
  }, 0))
  const id = await api.usuarioActual()
  if (id) entrarApp(id)
  else $('login').hidden = false
}

$('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault()
  const form = ev.currentTarget
  const boton = form.querySelector('button')
  const error = $('login-error')
  error.hidden = true
  boton.disabled = true
  boton.textContent = 'Entrando…'
  try {
    await api.entrar(form.usuario.value, form.password.value)
  } catch (err) {
    error.textContent = err.message
    error.hidden = false
  } finally {
    boton.disabled = false
    boton.textContent = 'Entrar'
  }
})

const aId = (v) => (v == null ? null : Number(v))
const normalizarEstado = (e) => ({ ...e, asignado_a: aId(e.asignado_a), visitada_por: aId(e.visitada_por) })

async function entrarApp(cuenta) {
  if (S.cuenta === cuenta) return
  S.cuenta = cuenta
  $('login').hidden = true

  let datos
  try {
    datos = await api.cargar()
  } catch (err) {
    mostrarError('No se pudieron cargar las tiendas: ' + err.message)
    return
  }
  if (!datos.rol) {
    mostrarError('Esta cuenta no tiene acceso a la app.')
    return
  }
  S.rol = datos.rol
  S.tiendas = new Map(datos.tiendas.map((t) => [t.cr, t]))
  S.estados = new Map(datos.estados.map((e) => [e.cr, normalizarEstado(e)]))
  S.personas = new Map(datos.personas.map((p) => [Number(p.id), { id: Number(p.id), nombre: p.nombre }]))

  const guardada = Number(leerLocal('redondeo-persona'))
  if (S.personas.has(guardada)) {
    S.yo = guardada
    iniciarApp()
  } else {
    pedirPersona()
  }
}

function mostrarError(texto) {
  $('app').hidden = false
  $('avance-texto').textContent = texto
}

function leerLocal(clave) {
  try { return localStorage.getItem(clave) } catch { return null }
}
function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, valor) } catch { /* modo privado: se volverá a preguntar */ }
}

/** Pantalla "¿Quién eres?": las cuentas son compartidas, así que cada celular dice quién lo usa. */
function pedirPersona() {
  cerrarPanel()
  $('app').hidden = true
  $('quien').hidden = false
  const cont = $('quien-nombres')
  cont.innerHTML = [...S.personas.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((p) => `<button class="btn ${p.id === S.yo ? 'btn-primario' : ''}" data-id="${p.id}">${esc(p.nombre)}</button>`)
    .join('')
  cont.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    S.yo = Number(b.dataset.id)
    guardarLocal('redondeo-persona', S.yo)
    $('quien').hidden = true
    iniciarApp()
  }))
}

let appIniciada = false
function iniciarApp() {
  $('app').hidden = false
  $('btn-quien').textContent = nombre(S.yo)
  $('btn-quien').classList.toggle('yo-coord', soyCoordinador())
  $('menu-nombre').textContent = nombre(S.yo)
  $('menu-tipo').textContent = soyCoordinador() ? ', con cuenta de coordinación' : ''
  if (!appIniciada) {
    appIniciada = true
    crearMapa($('mapa'), (cr) => mostrarPanel('tienda', cr))
    dibujarTiendas()
    encuadrar()
    cancelarSuscripcion = api.suscribir(aplicarEstado)
  } else {
    actualizarTodos()
  }
  pintarFiltros()
  actualizarAvance()
}

// ---------------------------------------------------------------- Menú de la cuenta (tocar tu nombre)
function abrirMenu(abrir) {
  $('menu-cuenta').hidden = !abrir
  $('btn-quien').setAttribute('aria-expanded', String(abrir))
}
$('btn-quien').addEventListener('click', (ev) => {
  ev.stopPropagation()
  abrirMenu($('menu-cuenta').hidden)
})
$('menu-cuenta').querySelector('[data-accion="cambiar-persona"]').addEventListener('click', () => {
  abrirMenu(false)
  pedirPersona()
})
document.addEventListener('click', (ev) => {
  if (!$('menu-cuenta').hidden && !ev.target.closest('#menu-cuenta')) abrirMenu(false)
  if (ev.target.closest('[data-salir]')) salir()
})

/** Cierra la sesión y olvida quién usaba este celular, para que el siguiente elija su nombre. */
async function salir() {
  if (!confirm('¿Cerrar sesión en este celular?')) return
  try { localStorage.removeItem('redondeo-persona') } catch { /* sin almacenamiento */ }
  await api.salir()
  location.reload()
}

// ---------------------------------------------------------------- Cambios de datos
/** Aplica un cambio de estado (propio o de otra persona del equipo) en toda la app. */
function aplicarEstado(filaCruda) {
  const fila = normalizarEstado(filaCruda)
  S.estados.set(fila.cr, fila)
  actualizarMarcador(fila.cr)
  actualizarAvance()
  pintarFiltros()
  if (modoPanel === 'tienda' && S.abierta === fila.cr && !$('panel-contenido').querySelector('form')) {
    mostrarPanel('tienda', fila.cr)
  } else if (modoPanel === 'lista' || modoPanel === 'equipo') {
    mostrarPanel(modoPanel)
  }
}

function aplicarTienda(t) {
  S.tiendas.set(t.cr, t)
  moverTienda(t.cr, t.lat, t.lng)
  actualizarMarcador(t.cr)
  if (S.abierta === t.cr) mostrarPanel('tienda', t.cr)
}

// Al volver a la app (el celular estuvo bloqueado) se recargan los estados por si se perdió algún aviso.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.tiendas.size) return
  try {
    const estados = await api.cargarEstados()
    S.estados = new Map(estados.map((e) => [e.cr, normalizarEstado(e)]))
    actualizarTodos()
    actualizarAvance()
    pintarFiltros()
    if (modoPanel && !$('panel-contenido').querySelector('form')) mostrarPanel(modoPanel, S.abierta)
  } catch { /* sin conexión: se queda con lo último que tenía */ }
})

// ---------------------------------------------------------------- Panel
function mostrarPanel(modo, cr = null) {
  const anterior = S.abierta
  const mismaVista = modoPanel === modo && anterior === (modo === 'tienda' ? cr : null)
  const scroll = $('panel').scrollTop
  modoPanel = modo
  S.abierta = modo === 'tienda' ? cr : null
  if (anterior && anterior !== S.abierta) actualizarMarcador(anterior)
  if (S.abierta) actualizarMarcador(S.abierta)

  const cont = $('panel-contenido')
  if (modo === 'tienda') {
    cont.innerHTML = htmlTienda(cr)
    conectarTienda(cont, cr)
  } else if (modo === 'lista') {
    cont.innerHTML = htmlLista()
    cont.querySelectorAll('[data-cr]').forEach((b) => b.addEventListener('click', () => mostrarPanel('tienda', b.dataset.cr)))
  } else if (modo === 'equipo') {
    cont.innerHTML = htmlEquipo()
    conectarEquipo(cont)
  }
  $('panel').hidden = false
  $('panel').dataset.modo = modo
  $('btn-lista').classList.toggle('activo', modo === 'lista')
  document.body.classList.add('con-panel')
  $('panel').scrollTop = mismaVista ? scroll : 0
  refrescarTamano()
  if (modo === 'tienda' && anterior !== cr) irA(cr)
}

function cerrarPanel() {
  const anterior = S.abierta
  modoPanel = null
  S.abierta = null
  if (anterior) actualizarMarcador(anterior)
  $('panel').hidden = true
  $('btn-lista').classList.remove('activo')
  document.body.classList.remove('con-panel')
  refrescarTamano()
}

function conectarEquipo(cont) {
  cont.querySelectorAll('[data-persona]').forEach((fila) => {
    fila.addEventListener('click', () => {
      const id = Number(fila.dataset.persona)
      S.persona = S.persona === id ? null : id
      pintarFiltros()
      actualizarTodos()
      if (S.persona) mostrarPanel('lista')
      else mostrarPanel('equipo')
    })
  })
  cont.querySelector('[data-accion="csv"]')?.addEventListener('click', descargarCSV)
  cont.querySelector('[data-accion="cambiar-persona"]').addEventListener('click', pedirPersona)
  cont.querySelector('.form-persona')?.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const input = ev.currentTarget.querySelector('input')
    try {
      const p = await api.agregarPersona(input.value)
      S.personas.set(Number(p.id), { id: Number(p.id), nombre: p.nombre })
      avisar(`${p.nombre} ya está en el equipo.`)
      mostrarPanel('equipo')
    } catch (err) {
      avisar(err.message, true)
    }
  })
}

$('panel-cerrar').addEventListener('click', cerrarPanel)
$('btn-equipo').addEventListener('click', () => (modoPanel === 'equipo' ? cerrarPanel() : mostrarPanel('equipo')))
$('btn-lista').addEventListener('click', () => (modoPanel === 'lista' ? cerrarPanel() : mostrarPanel('lista')))
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return
  if (!$('menu-cuenta').hidden) abrirMenu(false)
  else if (modoPanel) cerrarPanel()
})

// ---------------------------------------------------------------- Filtros y búsqueda
function pintarFiltros() {
  const cuenta = (f) => [...S.estados.values()].filter(f.aplica).length
  const chips = FILTROS.map((f) => `
    <button role="tab" class="chip" data-filtro="${f.id}" aria-selected="${S.filtro === f.id}">
      ${f.texto}${f.id !== 'todas' ? ` <span class="chip-n">${cuenta(f)}</span>` : ''}
    </button>`)
  if (S.persona) {
    const n = nombre(S.persona)
    chips.unshift(`<button class="chip chip-persona" data-quitar-persona aria-label="Quitar filtro de ${n}">De ${n} ×</button>`)
  }
  $('filtros').innerHTML = chips.join('')
}

$('filtros').addEventListener('click', (ev) => {
  const b = ev.target.closest('button')
  if (!b) return
  if (b.hasAttribute('data-quitar-persona')) S.persona = null
  else S.filtro = b.dataset.filtro
  pintarFiltros()
  actualizarTodos()
  if (modoPanel === 'lista') mostrarPanel('lista')
})

let temporizadorBusqueda
$('buscar').addEventListener('input', (ev) => {
  clearTimeout(temporizadorBusqueda)
  temporizadorBusqueda = setTimeout(() => {
    S.busqueda = ev.target.value.trim()
    actualizarTodos()
    if (S.busqueda || modoPanel === 'lista') mostrarPanel('lista')
  }, 150)
})

$('buscar').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return
  const primera = [...S.tiendas.keys()].find(visible)
  if (primera) { ev.target.blur(); mostrarPanel('tienda', primera) }
})

// ---------------------------------------------------------------- Mi ubicación
$('btn-ubicacion').addEventListener('click', () => {
  if (S.miPos) { mostrarYo(S.miPos, true); return }
  let primera = true
  dejarDeSeguir?.()
  dejarDeSeguir = seguirUbicacion(
    (pos) => {
      S.miPos = pos
      mostrarYo(pos, primera)
      // La lista se ordena por cercanía solo con la primera lectura, para no brincar mientras caminas.
      if (primera && modoPanel === 'lista') mostrarPanel('lista')
      primera = false
      $('btn-ubicacion').classList.add('activo')
    },
    (err) => avisar(err.message, true),
  )
})

window.addEventListener('pagehide', () => { cancelarSuscripcion?.(); dejarDeSeguir?.() })

iniciarTienda(api, { avisar, aplicarEstado, aplicarTienda, mostrarPanel })
arrancar()
