import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { S, ESTADOS, visible, esc } from './estado.js'

let mapa
let capa
const marcadores = new Map() // cr -> L.CircleMarker
let yoPunto, yoPrecision
let alElegir = () => {}

const ZOOM_ETIQUETAS = 16

export function crearMapa(el, onElegir) {
  alElegir = onElegir
  mapa = L.map(el, { zoomControl: false, attributionControl: true }).setView([32.62, -115.47], 12) // Mexicali
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa)
  capa = L.layerGroup().addTo(mapa)
  mapa.on('zoomend moveend', etiquetas)
  return mapa
}

function estilo(cr) {
  const e = S.estados.get(cr)
  const t = S.tiendas.get(cr)
  const mia = e.asignado_a === S.yo && e.estado !== 'visitada'
  const elegida = S.abierta === cr
  return {
    radius: elegida ? 14 : mia ? 11 : 9,
    fillColor: ESTADOS[e.estado].color,
    fillOpacity: 1,
    color: mia || elegida ? '#13232B' : '#FFFFFF',
    weight: mia || elegida ? 3 : 2,
    dashArray: t.ubicacion_aprox ? '4 3' : null,
  }
}

export function dibujarTiendas() {
  for (const [cr, t] of S.tiendas) {
    if (t.lat == null) continue
    let m = marcadores.get(cr)
    if (!m) {
      m = L.circleMarker([t.lat, t.lng], estilo(cr))
      m.on('click', () => alElegir(cr))
      marcadores.set(cr, m)
    }
    actualizarMarcador(cr)
  }
  etiquetas()
}

export function actualizarMarcador(cr) {
  const m = marcadores.get(cr)
  if (!m) return
  m.setStyle(estilo(cr))
  if (visible(cr) || S.abierta === cr) {
    if (!capa.hasLayer(m)) capa.addLayer(m)
    if (S.abierta === cr) m.bringToFront()
  } else if (capa.hasLayer(m)) {
    capa.removeLayer(m)
  }
}

export function actualizarTodos() {
  for (const cr of marcadores.keys()) actualizarMarcador(cr)
  etiquetas()
}

export function moverTienda(cr, lat, lng) {
  marcadores.get(cr)?.setLatLng([lat, lng])
}

/** Con zoom de calle, muestra el nombre de cada tienda junto a su punto. */
function etiquetas() {
  const cerca = mapa.getZoom() >= ZOOM_ETIQUETAS
  const vista = mapa.getBounds().pad(0.2)
  for (const [cr, m] of marcadores) {
    const mostrar = cerca && capa.hasLayer(m) && vista.contains(m.getLatLng())
    if (mostrar && !m.getTooltip()) {
      m.bindTooltip(esc(S.tiendas.get(cr).nombre.replace(/ MXL$/i, '')), {
        permanent: true, direction: 'right', offset: [10, 0], className: 'etiqueta',
      })
    } else if (!mostrar && m.getTooltip()) {
      m.unbindTooltip()
    }
  }
}

export function encuadrar() {
  // Encuadra Mexicali; la tienda de Tecate queda fuera de la vista inicial a propósito.
  const puntos = [...S.tiendas.values()].filter((t) => t.lat != null && t.municipio !== 'TECATE')
  if (puntos.length) mapa.fitBounds(L.latLngBounds(puntos.map((t) => [t.lat, t.lng])), { padding: [24, 24] })
}

export function irA(cr) {
  const t = S.tiendas.get(cr)
  if (t?.lat == null) return
  const z = Math.max(mapa.getZoom(), 15)
  // En celular el panel tapa la parte de abajo del mapa: centrar la tienda en lo que queda visible.
  const caja = mapa.getContainer().getBoundingClientRect()
  const panel = document.getElementById('panel').getBoundingClientRect()
  const tapa = panel.height && panel.top > caja.top && panel.left < caja.right - 1 ? panel.top : caja.bottom
  const centroVisible = (Math.max(caja.top, 0) + Math.min(caja.bottom, tapa)) / 2 - caja.top
  const punto = mapa.project([t.lat, t.lng], z).add([0, mapa.getSize().y / 2 - centroVisible])
  mapa.flyTo(mapa.unproject(punto, z), z, { duration: 0.5 })
}

export function mostrarYo(pos, centrar) {
  const ll = [pos.lat, pos.lng]
  if (!yoPunto) {
    yoPrecision = L.circle(ll, { radius: pos.precision, color: '#2C7BE5', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(mapa)
    yoPunto = L.circleMarker(ll, { radius: 7, color: '#FFFFFF', weight: 3, fillColor: '#2C7BE5', fillOpacity: 1, interactive: false }).addTo(mapa)
  } else {
    yoPunto.setLatLng(ll)
    yoPrecision.setLatLng(ll).setRadius(pos.precision)
  }
  if (centrar) mapa.flyTo(ll, Math.max(mapa.getZoom(), 15), { duration: 0.5 })
}

export function refrescarTamano() {
  mapa?.invalidateSize()
}
