// Estado compartido de la app y reglas de presentación.

export const S = {
  tiendas: new Map(), // cr -> tienda
  estados: new Map(), // cr -> estado_tienda
  personas: new Map(), // id -> { id, nombre }
  cuenta: null, // usuario de Supabase (cuenta compartida "equipo" o "coordinacion")
  rol: null, // 'coordinador' | 'voluntario' (de la cuenta)
  yo: null, // id de la persona elegida en este celular
  filtro: 'todas',
  persona: null, // filtrar por integrante (desde el panel de equipo)
  busqueda: '',
  miPos: null, // { lat, lng, precision }
  abierta: null, // cr de la tienda en el panel
}

export const PORCENTAJE_META = 0.7

export const ESTADOS = {
  pendiente: { texto: 'Libre', color: '#8C96A0' },
  apartada: { texto: 'Asignada', color: '#E5A50A' },
  visitada: { texto: 'Visitada', color: '#12805C' },
}

export const FILTROS = [
  { id: 'todas', texto: 'Todas', aplica: () => true },
  { id: 'libres', texto: 'Libres', aplica: (e) => e.estado === 'pendiente' },
  { id: 'mias', texto: 'Mías', aplica: (e) => e.asignado_a === S.yo && e.estado !== 'visitada' },
  { id: 'asignadas', texto: 'Asignadas', aplica: (e) => e.estado === 'apartada' },
  { id: 'visitadas', texto: 'Visitadas', aplica: (e) => e.estado === 'visitada' },
]

export const meta = () => Math.ceil(S.tiendas.size * PORCENTAJE_META)
export const soyCoordinador = () => S.rol === 'coordinador'
export const nombre = (id) => (id != null && S.personas.get(Number(id))?.nombre) || 'alguien'
export const primerNombre = (id) => nombre(id).split(' ')[0]

export function conteos() {
  const c = { pendiente: 0, apartada: 0, visitada: 0 }
  for (const e of S.estados.values()) c[e.estado]++
  return c
}

function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function coincideBusqueda(t, q = S.busqueda) {
  if (!q) return true
  const n = normalizar(q)
  return [t.nombre, t.cr, t.colonia, t.calle].some((v) => normalizar(v).includes(n))
}

/** ¿La tienda se muestra con el filtro, la persona y la búsqueda actuales? */
export function visible(cr) {
  const t = S.tiendas.get(cr)
  const e = S.estados.get(cr)
  if (!t || !e) return false
  const f = FILTROS.find((x) => x.id === S.filtro) || FILTROS[0]
  if (!f.aplica(e)) return false
  if (S.persona && e.asignado_a !== S.persona && e.visitada_por !== S.persona) return false
  return coincideBusqueda(t)
}

/** Distancia en metros entre dos puntos. */
export function distancia(a, b) {
  const R = 6371000
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatoDistancia(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export function formatoFecha(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])
