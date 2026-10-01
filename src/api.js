// Acceso a Supabase. Todas las escrituras pasan por funciones SQL (ver supabase/schema.sql)
// que validan quién puede hacer qué; aquí solo se llaman.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example)')
}

// Las cuentas compartidas se escriben como usuario ("redondeo", "coordinacion"…);
// por dentro Supabase usa un correo.
const DOMINIO_CUENTAS = 'redondeo-nicoya.test'
const CORREOS_ESPECIALES = { redondeo: 'redondeo@oxxo.test' }

const sb = createClient(url, key)

const MENSAJES_AUTH = {
  'Invalid login credentials': 'Usuario o contraseña incorrectos.',
  'Email not confirmed': 'La cuenta no está confirmada. Revisa "Auto Confirm User" en Supabase.',
}

function falla(error) {
  const msg = error?.message || String(error)
  return new Error(MENSAJES_AUTH[msg] || msg)
}

export async function usuarioActual() {
  const { data } = await sb.auth.getSession()
  return data.session?.user?.id ?? null
}

export function alCambiarSesion(cb) {
  sb.auth.onAuthStateChange((_evento, sesion) => cb(sesion?.user?.id ?? null))
}

export async function entrar(usuario, password) {
  const u = usuario.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const email = u.includes('@') ? u : CORREOS_ESPECIALES[u] ?? `${u}@${DOMINIO_CUENTAS}`
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw falla(error)
}

export async function salir() {
  await sb.auth.signOut()
}

export async function cargar() {
  const [{ data: { user } }, t, e, p, i] = await Promise.all([
    sb.auth.getUser(),
    sb.from('tiendas').select('*').order('nombre'),
    sb.from('estado_tienda').select('*'),
    sb.from('personas').select('id, nombre').order('nombre'),
    sb.from('integrantes').select('user_id, rol'),
  ])
  for (const r of [t, e, p, i]) if (r.error) throw falla(r.error)
  const rol = i.data.find((x) => x.user_id === user?.id)?.rol ?? null
  return { tiendas: t.data, estados: e.data, personas: p.data, rol }
}

export async function cargarEstados() {
  const { data, error } = await sb.from('estado_tienda').select('*')
  if (error) throw falla(error)
  return data
}

/** Avisa cada vez que alguien del equipo cambia el estado de una tienda. */
export function suscribir(cb) {
  const canal = sb
    .channel('estado_tienda')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'estado_tienda' }, (p) => {
      if (p.new && p.new.cr) cb(p.new)
    })
    .subscribe()
  return () => sb.removeChannel(canal)
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw falla(error)
  return data
}

export const apartar = (cr, persona) => rpc('apartar_tienda', { p_cr: cr, p_persona: persona })
export const liberar = (cr, persona) => rpc('liberar_tienda', { p_cr: cr, p_persona: persona })
export const deshacerVisita = (cr, persona) => rpc('deshacer_visita', { p_cr: cr, p_persona: persona })
export const reasignar = (cr, persona) => rpc('reasignar_tienda', { p_cr: cr, p_persona: persona })
export const corregirUbicacion = (cr, lat, lng) => rpc('corregir_ubicacion', { p_cr: cr, p_lat: lat, p_lng: lng })
export const agregarPersona = (nombre) => rpc('agregar_persona', { p_nombre: nombre })

export async function marcarVisitada(cr, persona, { notas, foto, lat, lng }) {
  let fotoPath = null
  if (foto) {
    fotoPath = `${cr}/${Date.now()}.jpg`
    const { error } = await sb.storage.from('formatos').upload(fotoPath, foto, { contentType: 'image/jpeg' })
    if (error) throw new Error('No se pudo subir la foto: ' + error.message)
  }
  return rpc('marcar_visitada', {
    p_cr: cr, p_persona: persona, p_notas: notas, p_foto_path: fotoPath, p_lat: lat, p_lng: lng,
  })
}

export async function urlFoto(path) {
  const { data, error } = await sb.storage.from('formatos').createSignedUrl(path, 60 * 60)
  if (error) throw falla(error)
  return data.signedUrl
}
