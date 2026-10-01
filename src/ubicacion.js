// Ubicación del celular. Requiere HTTPS (GitHub Pages lo es) o localhost.

const MENSAJES = {
  1: 'Activa el permiso de ubicación para este sitio en tu navegador.',
  2: 'No se pudo obtener tu ubicación. Revisa que el GPS esté encendido.',
  3: 'Tu ubicación tardó demasiado. Intenta de nuevo al aire libre.',
}

const aPos = (p) => ({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy })

export function ubicacionUnaVez() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Tu navegador no permite obtener la ubicación.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(aPos(p)),
      (err) => reject(new Error(MENSAJES[err.code] || err.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  })
}

/** Sigue la ubicación mientras la app está abierta. Regresa una función para detenerse. */
export function seguirUbicacion(onPos, onError) {
  if (!navigator.geolocation) {
    onError(new Error('Tu navegador no permite obtener la ubicación.'))
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onPos(aPos(p)),
    (err) => onError(new Error(MENSAJES[err.code] || err.message)),
    { enableHighAccuracy: true, maximumAge: 15000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
