// Backend de mentiras para probar la app sin Supabase: `npm run demo`.
// Usa data/tiendas.json (generado por scripts/preparar_tiendas.py) y guarda todo en memoria.
// Cuentas: "equipo" y "coordinacion", contraseña: demo

const CUENTAS = [
  { user_id: 'c-equipo', usuario: 'equipo', rol: 'voluntario' },
  { user_id: 'c-coord', usuario: 'coordinacion', rol: 'coordinador' },
]
const personas = ['Ana', 'Beto', 'Carla', 'Diego', 'Elena'].map((nombre, i) => ({ id: i + 1, nombre }))

let cuenta = sessionStorage.getItem('demo-cuenta')
let tiendas = []
const estados = new Map()
const oyentes = new Set()
let cbSesion = () => {}
const espera = () => new Promise((r) => setTimeout(r, 250))

const esCoord = () => CUENTAS.find((c) => c.user_id === cuenta)?.rol === 'coordinador'
const nombre = (id) => personas.find((p) => p.id === id)?.nombre || 'otra persona'

function guardar(fila) {
  fila.actualizado_en = new Date().toISOString()
  estados.set(fila.cr, fila)
  const copia = { ...fila }
  setTimeout(() => oyentes.forEach((cb) => cb(copia)), 50)
  return { ...fila }
}

export async function usuarioActual() { return cuenta }
export function alCambiarSesion(cb) { cbSesion = cb }

export async function entrar(usuario, password) {
  await espera()
  const c = CUENTAS.find((x) => x.usuario === usuario.trim().toLowerCase())
  if (!c || password !== 'demo') throw new Error('Usuario o contraseña incorrectos.')
  cuenta = c.user_id
  sessionStorage.setItem('demo-cuenta', cuenta)
  cbSesion(cuenta)
}

export async function salir() { sessionStorage.removeItem('demo-cuenta'); cuenta = null }

export async function cargar() {
  if (!tiendas.length) {
    const r = await fetch('/data/tiendas.json')
    if (!r.ok) throw new Error('Corre primero: npm run datos -- "ruta/al/excel.xlsx"')
    tiendas = await r.json()
    for (const t of tiendas) {
      estados.set(t.cr, { cr: t.cr, estado: 'pendiente', asignado_a: null, apartada_en: null, visitada_por: null,
        visitada_en: null, notas: null, foto_path: null, visita_lat: null, visita_lng: null })
    }
    // Un poco de avance inicial para que el demo no se vea vacío.
    tiendas.slice(0, 60).forEach((t, i) => {
      const e = estados.get(t.cr)
      const quien = personas[i % personas.length].id
      if (i % 3 === 0) Object.assign(e, { estado: 'apartada', asignado_a: quien, apartada_en: new Date().toISOString() })
      else Object.assign(e, { estado: 'visitada', asignado_a: quien, visitada_por: quien, visitada_en: new Date().toISOString() })
    })
  }
  return {
    tiendas,
    estados: [...estados.values()].map((e) => ({ ...e })),
    personas: [...personas],
    rol: CUENTAS.find((c) => c.user_id === cuenta)?.rol ?? null,
  }
}

export async function cargarEstados() { return [...estados.values()].map((e) => ({ ...e })) }

export function suscribir(cb) {
  oyentes.add(cb)
  return () => oyentes.delete(cb)
}

export async function apartar(cr, persona) {
  await espera()
  const e = estados.get(cr)
  if (e.estado === 'visitada') throw new Error(`Esta tienda ya la visitó ${nombre(e.visitada_por)}`)
  if (e.estado !== 'pendiente') throw new Error(`Esta tienda ya está asignada a ${nombre(e.asignado_a)}`)
  return guardar({ ...e, estado: 'apartada', asignado_a: persona, apartada_en: new Date().toISOString() })
}

export async function liberar(cr, persona) {
  await espera()
  const e = estados.get(cr)
  if (!esCoord() && !(e.asignado_a === persona && e.estado !== 'visitada')) throw new Error('No puedes liberar esta tienda')
  return guardar({ ...e, estado: 'pendiente', asignado_a: null, apartada_en: null, visitada_por: null,
    visitada_en: null, notas: null, foto_path: null, visita_lat: null, visita_lng: null })
}

const fotos = new Map()

export async function marcarVisitada(cr, persona, { notas, foto, lat, lng }) {
  await espera()
  const e = estados.get(cr)
  if (e.estado === 'visitada') throw new Error(`Esta tienda ya la visitó ${nombre(e.visitada_por)}`)
  if (!esCoord() && e.asignado_a && e.asignado_a !== persona) throw new Error(`Esta tienda está asignada a ${nombre(e.asignado_a)}`)
  const quien = e.asignado_a || persona
  if (foto) fotos.set(`${cr}/demo.jpg`, URL.createObjectURL(foto))
  return guardar({ ...e, estado: 'visitada', asignado_a: quien, visitada_por: quien, visitada_en: new Date().toISOString(),
    notas: notas?.trim() || null, foto_path: foto ? `${cr}/demo.jpg` : null, visita_lat: lat, visita_lng: lng })
}

export async function reasignar(cr, persona) {
  await espera()
  if (!esCoord()) throw new Error('Solo coordinación puede reasignar')
  const e = estados.get(cr)
  return guardar({ ...e, asignado_a: persona, estado: e.estado === 'pendiente' ? 'apartada' : e.estado })
}

export async function corregirUbicacion(cr, lat, lng) {
  await espera()
  const t = tiendas.find((x) => x.cr === cr)
  Object.assign(t, { lat, lng, ubicacion_aprox: false })
  return { ...t }
}

export async function agregarPersona(nombreNuevo) {
  await espera()
  if (!esCoord()) throw new Error('Solo coordinación puede agregar personas')
  const n = nombreNuevo.trim()
  if (personas.some((p) => p.nombre === n)) throw new Error(`${n} ya está en la lista`)
  const p = { id: personas.length + 1, nombre: n }
  personas.push(p)
  return p
}

export async function urlFoto(path) { return fotos.get(path) || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>' }

// Para pruebas: simular que otra persona del equipo cambió una tienda.
window.__demo = {
  otraPersonaAparta(cr, persona = 2) {
    const e = estados.get(cr)
    guardar({ ...e, estado: 'apartada', asignado_a: persona, apartada_en: new Date().toISOString() })
  },
}
