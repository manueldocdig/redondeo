# Ruta del redondeo: Fundación Nicoya

Mapa compartido para repartir y registrar las visitas a las 232 tiendas OXXO de Fundación Nicoya. La meta es el 70%, o sea 163 tiendas.

## Cómo funciona

| Color | Estado | Cuenta para la meta |
|---|---|---|
| Gris | Libre | – |
| Amarillo | Asignada a alguien (borde oscuro = tuya) | No |
| Verde | Visitada | Sí |

- **Cuentas.** Hay 2 cuentas compartidas, `equipo` y `coordinacion`. Al entrar por primera vez en un celular, la app pregunta **"¿Quién eres?"**. Las tiendas quedan a nombre de esa persona. El nombre aparece arriba a la derecha y desde ahí se puede cambiar.
- **Coordinación** (su nombre aparece en amarillo) puede:
  - asignar, reasignar y liberar cualquier tienda;
  - deshacer visitas;
  - mover el punto de una tienda a su ubicación actual;
  - agregar personas;
  - descargar el reporte en CSV.
- **Ubicaciones aproximadas.** Un borde punteado indica que la ubicación es aproximada. Son 10 tiendas que no traían coordenadas en el Excel.
- **Límite por persona.** Cada persona puede tener máximo 30 tiendas asignadas sin visitar. Se cambia en `limite_apartadas()` de `supabase/schema.sql`.

## Puesta en marcha (una sola vez, ~15 min)

1. **Supabase.** Crea un proyecto gratis en https://supabase.com.
2. **Base de datos.** En **SQL Editor**, pega y corre `supabase/schema.sql`. Después pega y corre `supabase/seed.sql`, que trae las tiendas y las 13 personas.
3. **Cuentas.** En **Authentication → Users → Add user → Create new user**, crea estas dos. Deja marcado **Auto Confirm User**.
   - Correo `equipo@redondeo-nicoya.test`, con la contraseña del equipo.
   - Correo `coordinacion@redondeo-nicoya.test`, con la contraseña de coordinación.

   Se dan de alta solas en la app. Para entrar basta con escribir `equipo` o `coordinacion` como usuario.
4. **Cerrar registros.** En **Authentication → Sign In / Providers**, apaga **Allow new users to sign up**.
5. **Publicar.** Sube el repo a GitHub. En **Settings → Secrets and variables → Actions → Variables**, crea `SUPABASE_URL` y `SUPABASE_ANON_KEY`. En **Settings → Pages**, elige **GitHub Actions**. Cada push a `main` publica la app.

Si cambia el Excel o la lista de personas (`data/personas.txt`, un nombre por línea), corre `npm run datos -- "/ruta/RUTA DE TIENDAS 2026.xlsx"` y vuelve a correr `supabase/seed.sql`.

## Desarrollo

```sh
npm install
npm run demo   # sin Supabase: datos en memoria. Usuarios "equipo" o "coordinacion", contraseña "demo"
npm run dev    # con Supabase: copia .env.example a .env y llénalo
```

## Seguridad

- El repo solo contiene código. Las direcciones, visitas y fotos viven en Supabase, y solo las pueden leer las 2 cuentas del equipo (protegido con RLS).
- Nadie escribe directo en las tablas. Todo pasa por funciones SQL que validan las reglas, por ejemplo que no se puede tomar una tienda ya asignada, ni siquiera si dos personas lo intentan al mismo tiempo.
- Como las cuentas son compartidas, quien tenga la contraseña puede actuar con cualquier nombre. Es suficiente para un equipo de confianza. Cada acción queda en la tabla `movimientos`, por si hay dudas.
