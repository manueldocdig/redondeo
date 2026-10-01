-- Redondeo Fundación Nicoya: esquema de Supabase.
-- Pegar completo en Supabase > SQL Editor > Run. Se puede volver a correr sin romper nada.
--
-- Cuentas compartidas (las creas en Authentication > Users > Add user):
--   redondeo@oxxo.test                 -> voluntarios
--   equipo@redondeo-nicoya.test        -> voluntarios
--   coordinacion@redondeo-nicoya.test  -> coordinación (puede reasignar, deshacer, etc.)
-- Al entrar, cada quien elige su nombre de la tabla `personas`; las tiendas quedan a nombre
-- de la persona, no de la cuenta.

-- ---------------------------------------------------------------- Tipos
do $$ begin
  -- pendiente = libre, apartada = asignada a una persona, visitada = ya se entregó el formato.
  create type public.estado_visita as enum ('pendiente', 'apartada', 'visitada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rol_integrante as enum ('coordinador', 'voluntario');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- Tablas
-- Cuentas con acceso a la app (las 2 compartidas).
create table if not exists public.integrantes (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  nombre    text not null,
  rol       public.rol_integrante not null default 'voluntario',
  creado_en timestamptz not null default now()
);

-- Las personas que visitan tiendas.
create table if not exists public.personas (
  id        bigint generated always as identity primary key,
  nombre    text not null unique,
  creado_en timestamptz not null default now()
);

create table if not exists public.tiendas (
  cr              text primary key,
  nombre          text not null,
  calle           text,
  numero          text,
  entre_calles    text,
  referencia      text,
  colonia         text,
  cp              text,
  municipio       text,
  estado          text,
  ruta_oxxo       int,
  asesor_oxxo     text,
  lat             double precision,
  lng             double precision,
  ubicacion_aprox boolean not null default false
);

create table if not exists public.estado_tienda (
  cr              text primary key references public.tiendas (cr) on delete cascade,
  estado          public.estado_visita not null default 'pendiente',
  asignado_a      bigint references public.personas (id) on delete set null,
  apartada_en     timestamptz,
  visitada_por    bigint references public.personas (id) on delete set null,
  visitada_en     timestamptz,
  notas           text,
  foto_path       text,
  visita_lat      double precision,
  visita_lng      double precision,
  actualizado_en  timestamptz not null default now()
);

-- Bitácora de cada acción, para aclarar dudas ("¿quién liberó esta tienda?").
create table if not exists public.movimientos (
  id         bigint generated always as identity primary key,
  cr         text not null references public.tiendas (cr) on delete cascade,
  accion     text not null,
  persona_id bigint references public.personas (id) on delete set null,
  cuenta     uuid,
  detalle    jsonb,
  creado_en  timestamptz not null default now()
);
create index if not exists movimientos_cr_idx on public.movimientos (cr, creado_en desc);

-- ---------------------------------------------------------------- Alta automática de las cuentas compartidas
create or replace function public.alta_integrante() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email = 'coordinacion@redondeo-nicoya.test' then
    insert into public.integrantes (user_id, nombre, rol) values (new.id, 'Coordinación', 'coordinador')
    on conflict (user_id) do nothing;
  elsif new.email in ('equipo@redondeo-nicoya.test', 'redondeo@oxxo.test') then
    insert into public.integrantes (user_id, nombre, rol) values (new.id, 'Equipo', 'voluntario')
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists alta_integrante on auth.users;
create trigger alta_integrante after insert on auth.users
  for each row execute function public.alta_integrante();

-- Por si las cuentas se crearon antes de correr este archivo.
insert into public.integrantes (user_id, nombre, rol)
select id,
       case when email like 'coordinacion@%' then 'Coordinación' else 'Equipo' end,
       case when email like 'coordinacion@%' then 'coordinador'::public.rol_integrante else 'voluntario' end
  from auth.users
 where email in ('coordinacion@redondeo-nicoya.test', 'equipo@redondeo-nicoya.test', 'redondeo@oxxo.test')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------- Helpers
create or replace function public.es_integrante() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.integrantes where user_id = auth.uid());
$$;

create or replace function public.es_coordinador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.integrantes where user_id = auth.uid() and rol = 'coordinador');
$$;

create or replace function public.nombre_de(p_persona bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nombre from public.personas where id = p_persona), 'otra persona');
$$;

create or replace function public.validar(p_persona bigint) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_integrante() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.personas where id = p_persona) then
    raise exception 'Elige tu nombre antes de continuar';
  end if;
end $$;

-- ---------------------------------------------------------------- Permisos
-- Explícitos para no depender de los permisos por defecto del proyecto.
grant usage on schema public to anon, authenticated, service_role;
revoke all on public.integrantes, public.personas, public.tiendas, public.estado_tienda, public.movimientos from anon;
grant select on public.integrantes, public.personas, public.tiendas, public.estado_tienda, public.movimientos to authenticated;
grant all on public.integrantes, public.personas, public.tiendas, public.estado_tienda, public.movimientos to service_role;

-- ---------------------------------------------------------------- RLS
-- Solo las cuentas del equipo pueden leer. Nadie escribe directo en las tablas:
-- todos los cambios pasan por las funciones de abajo, que validan las reglas.
alter table public.integrantes   enable row level security;
alter table public.personas      enable row level security;
alter table public.tiendas       enable row level security;
alter table public.estado_tienda enable row level security;
alter table public.movimientos   enable row level security;

drop policy if exists "integrantes leen cuentas" on public.integrantes;
create policy "integrantes leen cuentas" on public.integrantes
  for select to authenticated using (public.es_integrante());

drop policy if exists "integrantes leen personas" on public.personas;
create policy "integrantes leen personas" on public.personas
  for select to authenticated using (public.es_integrante());

drop policy if exists "integrantes leen tiendas" on public.tiendas;
create policy "integrantes leen tiendas" on public.tiendas
  for select to authenticated using (public.es_integrante());

drop policy if exists "integrantes leen estado" on public.estado_tienda;
create policy "integrantes leen estado" on public.estado_tienda
  for select to authenticated using (public.es_integrante());

drop policy if exists "integrantes leen movimientos" on public.movimientos;
create policy "integrantes leen movimientos" on public.movimientos
  for select to authenticated using (public.es_integrante());

-- ---------------------------------------------------------------- Acciones
-- Máximo de tiendas asignadas (sin visitar) por persona, para que nadie acapare.
-- La cuenta de coordinación no tiene límite.
create or replace function public.limite_apartadas() returns int
language sql immutable as $$ select 30 $$;

create or replace function public.apartar_tienda(p_cr text, p_persona bigint)
returns public.estado_tienda
language plpgsql security definer set search_path = public as $$
declare
  fila public.estado_tienda;
begin
  perform public.validar(p_persona);

  if not public.es_coordinador() and (
    select count(*) from public.estado_tienda
    where asignado_a = p_persona and estado = 'apartada'
  ) >= public.limite_apartadas() then
    raise exception 'Ya tienes % tiendas asignadas. Visita o libera alguna antes de tomar otra.',
      public.limite_apartadas();
  end if;

  -- Un solo UPDATE condicionado: si dos personas aprietan a la vez, solo una gana.
  update public.estado_tienda
     set estado = 'apartada', asignado_a = p_persona, apartada_en = now(), actualizado_en = now()
   where cr = p_cr and estado = 'pendiente'
  returning * into fila;

  if not found then
    select * into fila from public.estado_tienda where cr = p_cr;
    if not found then raise exception 'Tienda % no existe', p_cr; end if;
    if fila.estado = 'visitada' then
      raise exception 'Esta tienda ya la visitó %', public.nombre_de(fila.visitada_por);
    end if;
    raise exception 'Esta tienda ya está asignada a %', public.nombre_de(fila.asignado_a);
  end if;

  insert into public.movimientos (cr, accion, persona_id, cuenta) values (p_cr, 'apartar', p_persona, auth.uid());
  return fila;
end $$;

create or replace function public.liberar_tienda(p_cr text, p_persona bigint)
returns public.estado_tienda
language plpgsql security definer set search_path = public as $$
declare
  fila public.estado_tienda;
  coord boolean := public.es_coordinador();
begin
  perform public.validar(p_persona);

  -- Cada quien libera las suyas (si aún no se visitan). Coordinación libera
  -- cualquiera, incluso deshacer una visita marcada por error.
  update public.estado_tienda
     set estado = 'pendiente', asignado_a = null, apartada_en = null,
         visitada_por = null, visitada_en = null, notas = null, foto_path = null,
         visita_lat = null, visita_lng = null, actualizado_en = now()
   where cr = p_cr
     and (coord or (asignado_a = p_persona and estado = 'apartada'))
  returning * into fila;

  if not found then raise exception 'No puedes liberar esta tienda'; end if;

  insert into public.movimientos (cr, accion, persona_id, cuenta) values (p_cr, 'liberar', p_persona, auth.uid());
  return fila;
end $$;

create or replace function public.marcar_visitada(
  p_cr text, p_persona bigint, p_notas text default null, p_foto_path text default null,
  p_lat double precision default null, p_lng double precision default null
)
returns public.estado_tienda
language plpgsql security definer set search_path = public as $$
declare
  fila public.estado_tienda;
  coord boolean := public.es_coordinador();
begin
  perform public.validar(p_persona);

  -- Se puede marcar una tienda propia, una libre (se asigna y visita en un paso),
  -- o cualquiera desde coordinación (queda a nombre de quien la tenía asignada).
  update public.estado_tienda
     set estado = 'visitada',
         asignado_a = coalesce(asignado_a, p_persona),
         visitada_por = coalesce(asignado_a, p_persona),
         visitada_en = now(),
         notas = nullif(trim(p_notas), ''),
         foto_path = p_foto_path,
         visita_lat = p_lat, visita_lng = p_lng,
         actualizado_en = now()
   where cr = p_cr
     and estado <> 'visitada'
     and (coord or asignado_a = p_persona or asignado_a is null)
  returning * into fila;

  if not found then
    select * into fila from public.estado_tienda where cr = p_cr;
    if fila.estado = 'visitada' then
      raise exception 'Esta tienda ya la visitó %', public.nombre_de(fila.visitada_por);
    end if;
    raise exception 'Esta tienda está asignada a %', public.nombre_de(fila.asignado_a);
  end if;

  insert into public.movimientos (cr, accion, persona_id, cuenta, detalle)
  values (p_cr, 'visitada', p_persona, auth.uid(),
          jsonb_build_object('notas', p_notas, 'foto', p_foto_path, 'lat', p_lat, 'lng', p_lng));
  return fila;
end $$;

-- Quien visitó una tienda puede quitar su propia visita (por si se equivocó); coordinación,
-- cualquiera. La tienda vuelve a quedar asignada a quien la visitó, sin visitar.
create or replace function public.deshacer_visita(p_cr text, p_persona bigint)
returns public.estado_tienda
language plpgsql security definer set search_path = public as $$
declare
  fila public.estado_tienda;
begin
  perform public.validar(p_persona);

  update public.estado_tienda
     set estado = case when coalesce(visitada_por, asignado_a) is null
                       then 'pendiente'::public.estado_visita else 'apartada' end,
         asignado_a = coalesce(visitada_por, asignado_a),
         apartada_en = coalesce(apartada_en, now()),
         visitada_por = null, visitada_en = null, notas = null, foto_path = null,
         visita_lat = null, visita_lng = null, actualizado_en = now()
   where cr = p_cr
     and estado = 'visitada'
     and (public.es_coordinador() or visitada_por = p_persona)
  returning * into fila;

  if not found then raise exception 'Solo quien visitó esta tienda puede quitar la visita'; end if;

  insert into public.movimientos (cr, accion, persona_id, cuenta) values (p_cr, 'quitar_visita', p_persona, auth.uid());
  return fila;
end $$;

create or replace function public.reasignar_tienda(p_cr text, p_persona bigint)
returns public.estado_tienda
language plpgsql security definer set search_path = public as $$
declare
  fila public.estado_tienda;
begin
  if not public.es_coordinador() then raise exception 'Solo coordinación puede reasignar'; end if;
  perform public.validar(p_persona);

  update public.estado_tienda
     set asignado_a = p_persona,
         estado = case when estado = 'pendiente' then 'apartada'::public.estado_visita else estado end,
         apartada_en = coalesce(apartada_en, now()),
         actualizado_en = now()
   where cr = p_cr and estado <> 'visitada'
  returning * into fila;

  if not found then raise exception 'No se puede reasignar una tienda ya visitada'; end if;

  insert into public.movimientos (cr, accion, persona_id, cuenta) values (p_cr, 'reasignar', p_persona, auth.uid());
  return fila;
end $$;

create or replace function public.corregir_ubicacion(p_cr text, p_lat double precision, p_lng double precision)
returns public.tiendas
language plpgsql security definer set search_path = public as $$
declare
  fila public.tiendas;
begin
  if not public.es_coordinador() then raise exception 'Solo coordinación puede mover tiendas'; end if;

  update public.tiendas set lat = p_lat, lng = p_lng, ubicacion_aprox = false
   where cr = p_cr returning * into fila;
  if not found then raise exception 'Tienda % no existe', p_cr; end if;

  insert into public.movimientos (cr, accion, cuenta, detalle)
  values (p_cr, 'ubicacion', auth.uid(), jsonb_build_object('lat', p_lat, 'lng', p_lng));
  return fila;
end $$;

create or replace function public.agregar_persona(p_nombre text)
returns public.personas
language plpgsql security definer set search_path = public as $$
declare
  fila public.personas;
begin
  if not public.es_coordinador() then raise exception 'Solo coordinación puede agregar personas'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'Escribe un nombre'; end if;
  insert into public.personas (nombre) values (trim(p_nombre)) returning * into fila;
  return fila;
exception when unique_violation then
  raise exception '% ya está en la lista', trim(p_nombre);
end $$;

-- Solo usuarios con sesión pueden llamar las funciones (cada una valida el rol).
do $$
declare f text;
begin
  foreach f in array array[
    'public.es_integrante()', 'public.es_coordinador()', 'public.nombre_de(bigint)', 'public.validar(bigint)',
    'public.apartar_tienda(text, bigint)', 'public.liberar_tienda(text, bigint)',
    'public.marcar_visitada(text, bigint, text, text, double precision, double precision)',
    'public.deshacer_visita(text, bigint)', 'public.reasignar_tienda(text, bigint)',
    'public.corregir_ubicacion(text, double precision, double precision)', 'public.agregar_persona(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- Fotos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('formatos', 'formatos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "integrantes suben formatos" on storage.objects;
create policy "integrantes suben formatos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'formatos' and public.es_integrante());

drop policy if exists "integrantes ven formatos" on storage.objects;
create policy "integrantes ven formatos" on storage.objects
  for select to authenticated
  using (bucket_id = 'formatos' and public.es_integrante());

-- ---------------------------------------------------------------- Tiempo real
do $$ begin
  alter publication supabase_realtime add table public.estado_tienda;
exception when duplicate_object then null; end $$;
