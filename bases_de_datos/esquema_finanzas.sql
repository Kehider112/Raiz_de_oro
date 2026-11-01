-- =====================================================================
-- Sistema de control de finanzas personales (PostgreSQL / Supabase)
-- Una sola bolsa por usuario: ingresos, gastos, préstamos y abonos
-- afectan el mismo saldo. Los ahorros quedan aparte hasta completar
-- la meta, momento en que se devuelven automáticamente a la bolsa.
-- Ejecutar completo en: Supabase > SQL Editor.
-- =====================================================================

-- ---------- Tipos ----------
create type tipo_movimiento as enum (
  'ingreso', 'gasto',
  'prestamo_dado', 'prestamo_recibido',
  'abono_recibido', 'abono_pagado',
  'aporte_ahorro', 'retiro_ahorro'
);
create type frecuencia_mov  as enum ('fijo', 'variable');
create type estado_prestamo as enum ('solicitado', 'activo', 'pagado', 'rechazado');
create type periodo_fijo    as enum ('semanal', 'quincenal', 'mensual');

-- ---------- Tablas ----------
create table perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  nombre    text not null,
  correo    text not null unique,
  creado_en timestamptz not null default now()
);

create table categorias (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  nombre     text not null,
  tipo       text not null check (tipo in ('ingreso', 'gasto')),
  unique (usuario_id, nombre, tipo)
);

create table metas_ahorro (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references perfiles(id) on delete cascade,
  nombre         text not null,
  objetivo       numeric(14,2) not null check (objetivo > 0),
  fecha_limite   date,
  fecha_cumplida date,              -- se llena sola al alcanzar el objetivo
  creado_en      timestamptz not null default now()
);

create table prestamos (
  id            uuid primary key default gen_random_uuid(),
  prestamista_id uuid not null references perfiles(id),
  deudor_id      uuid not null references perfiles(id),
  monto          numeric(14,2) not null check (monto > 0),
  interes_pct    numeric(5,2)  not null default 0 check (interes_pct >= 0),
  fecha_pago     date not null,
  estado         estado_prestamo not null default 'solicitado',
  creado_en      timestamptz not null default now(),
  aceptado_en    timestamptz,
  check (prestamista_id <> deudor_id)
);

create table abonos_prestamo (
  id            uuid primary key default gen_random_uuid(),
  prestamo_id   uuid not null references prestamos(id) on delete cascade,
  monto         numeric(14,2) not null check (monto > 0),
  fecha         date not null default current_date,
  confirmado    boolean not null default false,
  confirmado_en timestamptz,
  creado_en     timestamptz not null default now()
);

-- Todos los movimientos de dinero viven aquí, cada uno con su fecha.
create table movimientos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles(id) on delete cascade,
  fecha        date not null default current_date,   -- día en que ocurrió
  monto        numeric(14,2) not null check (monto > 0),
  tipo         tipo_movimiento not null,
  frecuencia   frecuencia_mov,                       -- fijo / variable
  categoria_id uuid references categorias(id) on delete set null,
  nota         text,
  prestamo_id  uuid references prestamos(id),
  meta_id      uuid references metas_ahorro(id),
  creado_en    timestamptz not null default now()    -- cuándo se guardó
);
create index on movimientos (usuario_id, fecha desc);
create index on movimientos (meta_id);

-- Plantillas de ingresos/gastos fijos que se repiten solos
create table movimientos_fijos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references perfiles(id) on delete cascade,
  tipo         text not null check (tipo in ('ingreso', 'gasto')),
  monto        numeric(14,2) not null check (monto > 0),
  categoria_id uuid references categorias(id) on delete set null,
  nota         text,
  periodo      periodo_fijo not null,
  proxima_fecha date not null,
  activo       boolean not null default true
);

-- ---------- Perfil automático al registrarse ----------
create function crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre, correo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end $$;

create trigger al_crear_usuario
after insert on auth.users
for each row execute function crear_perfil();

-- ---------- Funciones internas (no expuestas) ----------
-- Saldo de la bolsa = lo que entra - lo que sale (ahorros aparte)
create function _saldo(p_usuario uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case
           when tipo in ('ingreso','prestamo_recibido','abono_recibido','retiro_ahorro') then monto
           else -monto end), 0)
  from movimientos
  where usuario_id = p_usuario;
$$;

create function _ahorrado(p_meta uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'aporte_ahorro' then monto else -monto end), 0)
  from movimientos
  where meta_id = p_meta and tipo in ('aporte_ahorro', 'retiro_ahorro');
$$;

-- ---------- Vistas ----------
create view v_metas with (security_invoker = true) as
select m.*,
       coalesce(sum(case when mv.tipo = 'aporte_ahorro' then mv.monto
                         when mv.tipo = 'retiro_ahorro' then -mv.monto end), 0) as ahorrado,
       (m.fecha_cumplida is not null) as desbloqueada
from metas_ahorro m
left join movimientos mv on mv.meta_id = m.id
group by m.id;

create view v_prestamos with (security_invoker = true) as
select p.*,
       round(p.monto * (1 + p.interes_pct / 100), 2)                      as total_a_pagar,
       coalesce(a.pagado, 0)                                              as pagado,
       round(p.monto * (1 + p.interes_pct / 100), 2) - coalesce(a.pagado, 0) as pendiente,
       (p.estado = 'activo' and p.fecha_pago < current_date)              as vencido
from prestamos p
left join lateral (
  select sum(monto) as pagado
  from abonos_prestamo
  where prestamo_id = p.id and confirmado
) a on true;

-- ---------- Funciones de la aplicación ----------
create function mi_saldo() returns numeric
language sql stable security definer set search_path = public as $$
  select _saldo(auth.uid());
$$;

-- Ahorro: aportar (sale de la bolsa y vuelve al completar la meta)
create function aportar_ahorro(p_meta uuid, p_monto numeric, p_fecha date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_objetivo numeric;
  v_cumplida date;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select objetivo, fecha_cumplida into v_objetivo, v_cumplida
  from metas_ahorro where id = p_meta and usuario_id = v_user;
  if not found then raise exception 'Meta no encontrada'; end if;

  if _saldo(v_user) < p_monto then raise exception 'Saldo insuficiente en la bolsa'; end if;

  insert into movimientos (usuario_id, fecha, monto, tipo, meta_id, nota)
  values (v_user, p_fecha, p_monto, 'aporte_ahorro', p_meta, 'Aporte a ahorro');

  -- Si se alcanzó o superó el objetivo, devuelve el ahorro y elimina la meta.
  if v_cumplida is null and _ahorrado(p_meta) >= v_objetivo then
    insert into movimientos (usuario_id, fecha, monto, tipo, meta_id, nota)
    values (
      v_user,
      p_fecha,
      _ahorrado(p_meta),
      'retiro_ahorro',
      p_meta,
      'Meta completada: ahorro devuelto a la bolsa'
    );
    update movimientos set meta_id = null where meta_id = p_meta;
    delete from metas_ahorro where id = p_meta and usuario_id = v_user;
  end if;
end $$;

-- Ahorro: retirar (SOLO si la meta ya se cumplió)
create function retirar_ahorro(p_meta uuid, p_monto numeric, p_fecha date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  v_cumplida date;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select fecha_cumplida into v_cumplida
  from metas_ahorro where id = p_meta and usuario_id = v_user;
  if not found then raise exception 'Meta no encontrada'; end if;

  if v_cumplida is null then
    raise exception 'Ahorro bloqueado: aún no se alcanza el monto objetivo';
  end if;
  if _ahorrado(p_meta) < p_monto then
    raise exception 'No hay tanto dinero ahorrado en esta meta';
  end if;

  insert into movimientos (usuario_id, fecha, monto, tipo, meta_id, nota)
  values (v_user, p_fecha, p_monto, 'retiro_ahorro', p_meta, 'Retiro de ahorro');
end $$;

create function completar_meta_ahorro(p_meta uuid, p_fecha date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_objetivo numeric;
  v_ahorrado numeric;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select objetivo into v_objetivo
  from metas_ahorro where id = p_meta and usuario_id = v_user;
  if not found then raise exception 'Meta no encontrada'; end if;
  v_ahorrado := _ahorrado(p_meta);
  if v_ahorrado < v_objetivo then raise exception 'La meta todavía no está completa'; end if;
  insert into movimientos (usuario_id, fecha, monto, tipo, meta_id, nota)
  values (v_user, p_fecha, v_ahorrado, 'retiro_ahorro', p_meta,
    'Meta completada: ahorro devuelto a la bolsa');
  update movimientos set meta_id = null where meta_id = p_meta;
  delete from metas_ahorro where id = p_meta and usuario_id = v_user;
end $$;

-- Préstamo: crear solicitud (todavía NO mueve dinero)
create function solicitar_prestamo(
  p_correo text, p_monto numeric, p_interes numeric, p_fecha_pago date
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_deudor uuid;
  v_id     uuid;
begin
  if v_user is null then raise exception 'No autenticado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select id into v_deudor from perfiles where lower(correo) = lower(p_correo);
  if not found then raise exception 'No existe un usuario registrado con ese correo'; end if;
  if v_deudor = v_user then raise exception 'No puedes prestarte a ti mismo'; end if;
  if _saldo(v_user) < p_monto then raise exception 'Saldo insuficiente en la bolsa'; end if;

  insert into prestamos (prestamista_id, deudor_id, monto, interes_pct, fecha_pago)
  values (v_user, v_deudor, p_monto, coalesce(p_interes, 0), p_fecha_pago)
  returning id into v_id;
  return v_id;
end $$;

-- Préstamo: el deudor acepta -> AQUÍ se mueve el dinero
create function aceptar_prestamo(p_prestamo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_p    prestamos;
begin
  select * into v_p from prestamos
  where id = p_prestamo and deudor_id = v_user and estado = 'solicitado'
  for update;
  if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;

  perform pg_advisory_xact_lock(hashtext(v_p.prestamista_id::text));
  if _saldo(v_p.prestamista_id) < v_p.monto then
    raise exception 'El prestamista ya no tiene saldo suficiente para este préstamo';
  end if;

  insert into movimientos (usuario_id, fecha, monto, tipo, prestamo_id, nota) values
    (v_p.prestamista_id, current_date, v_p.monto, 'prestamo_dado',     v_p.id, 'Préstamo otorgado'),
    (v_user,             current_date, v_p.monto, 'prestamo_recibido', v_p.id, 'Préstamo recibido');

  update prestamos set estado = 'activo', aceptado_en = now() where id = v_p.id;
end $$;

-- Préstamo: rechazar (deudor) o cancelar (prestamista) una solicitud
create function rechazar_prestamo(p_prestamo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  update prestamos set estado = 'rechazado'
  where id = p_prestamo and estado = 'solicitado'
    and (deudor_id = v_user or prestamista_id = v_user);
  if not found then raise exception 'Solicitud no encontrada o ya procesada'; end if;
end $$;

-- Abono: lo registra el deudor (queda pendiente de confirmación)
create function registrar_abono(p_prestamo uuid, p_monto numeric, p_fecha date default current_date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_p    record;
  v_id   uuid;
begin
  select * into v_p from v_prestamos
  where id = p_prestamo and deudor_id = v_user and estado = 'activo';
  if not found then raise exception 'Préstamo no encontrado o no está activo'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_monto > v_p.pendiente then raise exception 'El abono supera el saldo pendiente'; end if;

  insert into abonos_prestamo (prestamo_id, monto, fecha)
  values (p_prestamo, p_monto, p_fecha) returning id into v_id;
  return v_id;
end $$;

-- Abono: lo confirma el prestamista -> AQUÍ se mueve el dinero
create function confirmar_abono(p_abono uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_a    abonos_prestamo;
  v_p    prestamos;
begin
  select a.* into v_a
  from abonos_prestamo a
  join prestamos p on p.id = a.prestamo_id
  where a.id = p_abono and p.prestamista_id = v_user and not a.confirmado
  for update of a;
  if not found then raise exception 'Abono no encontrado o ya confirmado'; end if;

  select * into v_p from prestamos where id = v_a.prestamo_id;

  perform pg_advisory_xact_lock(hashtext(v_p.deudor_id::text));
  if _saldo(v_p.deudor_id) < v_a.monto then
    raise exception 'El deudor no tiene saldo suficiente para este abono';
  end if;

  insert into movimientos (usuario_id, fecha, monto, tipo, prestamo_id, nota) values
    (v_p.deudor_id, v_a.fecha, v_a.monto, 'abono_pagado',   v_p.id, 'Abono a préstamo'),
    (v_user,        v_a.fecha, v_a.monto, 'abono_recibido', v_p.id, 'Abono recibido');

  update abonos_prestamo set confirmado = true, confirmado_en = now() where id = p_abono;

  if (select pendiente from v_prestamos where id = v_p.id) <= 0 then
    update prestamos set estado = 'pagado' where id = v_p.id;
  end if;
end $$;

-- Genera los movimientos fijos que ya tocan (programar 1 vez al día)
create function generar_movimientos_fijos() returns void
language plpgsql security definer set search_path = public as $$
declare
  f       record;
  v_fecha date;
begin
  for f in select * from movimientos_fijos where activo and proxima_fecha <= current_date loop
    v_fecha := f.proxima_fecha;
    while v_fecha <= current_date loop
      insert into movimientos (usuario_id, fecha, monto, tipo, frecuencia, categoria_id, nota)
      values (f.usuario_id, v_fecha, f.monto, f.tipo::tipo_movimiento, 'fijo', f.categoria_id, f.nota);

      v_fecha := case f.periodo
                   when 'semanal'   then v_fecha + 7
                   when 'quincenal' then v_fecha + 15
                   else (v_fecha + interval '1 month')::date
                 end;
    end loop;
    update movimientos_fijos set proxima_fecha = v_fecha where id = f.id;
  end loop;
end $$;

-- Opcional (extensión pg_cron activada en Supabase):
-- select cron.schedule('movimientos-fijos', '5 0 * * *', 'select generar_movimientos_fijos()');

-- ---------- Seguridad por fila (RLS) ----------
alter table perfiles          enable row level security;
alter table categorias        enable row level security;
alter table metas_ahorro      enable row level security;
alter table prestamos         enable row level security;
alter table abonos_prestamo   enable row level security;
alter table movimientos       enable row level security;
alter table movimientos_fijos enable row level security;

-- Perfiles: el propio y el de quien participa contigo en un préstamo
create policy perfiles_ver on perfiles for select using (
  id = auth.uid()
  or exists (
    select 1 from prestamos p
    where (p.prestamista_id = auth.uid() and p.deudor_id = perfiles.id)
       or (p.deudor_id = auth.uid() and p.prestamista_id = perfiles.id)
  )
);

create policy categorias_propias on categorias for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy fijos_propios on movimientos_fijos for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Movimientos: solo ves los tuyos. Directamente solo puedes crear/editar
-- ingresos y gastos; el resto (ahorros, préstamos, abonos) solo por funciones.
create policy mov_ver on movimientos for select using (usuario_id = auth.uid());
create policy mov_crear on movimientos for insert
  with check (usuario_id = auth.uid() and tipo in ('ingreso', 'gasto'));
create policy mov_editar on movimientos for update
  using (usuario_id = auth.uid() and tipo in ('ingreso', 'gasto'))
  with check (usuario_id = auth.uid() and tipo in ('ingreso', 'gasto'));
create policy mov_borrar on movimientos for delete
  using (usuario_id = auth.uid() and tipo in ('ingreso', 'gasto'));

-- Metas: puedes verlas y crearlas; solo puedes cambiar nombre y fecha límite.
-- No se puede editar objetivo ni fecha_cumplida (así no se salta el bloqueo).
create policy metas_ver on metas_ahorro for select using (usuario_id = auth.uid());
create policy metas_crear on metas_ahorro for insert
  with check (usuario_id = auth.uid() and fecha_cumplida is null);
create policy metas_editar on metas_ahorro for update
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
revoke update on metas_ahorro from authenticated, anon;
grant  update (nombre, fecha_limite) on metas_ahorro to authenticated;

-- Préstamos y abonos: solo lectura para los dos participantes
create policy prestamos_ver on prestamos for select
  using (prestamista_id = auth.uid() or deudor_id = auth.uid());
create policy abonos_ver on abonos_prestamo for select using (
  exists (select 1 from prestamos p
          where p.id = abonos_prestamo.prestamo_id
            and (p.prestamista_id = auth.uid() or p.deudor_id = auth.uid()))
);

-- ---------- Permisos de ejecución ----------
revoke execute on function _saldo(uuid), _ahorrado(uuid), generar_movimientos_fijos()
  from public, anon, authenticated;

revoke execute on function
  mi_saldo(),
  aportar_ahorro(uuid, numeric, date),
  retirar_ahorro(uuid, numeric, date),
  solicitar_prestamo(text, numeric, numeric, date),
  aceptar_prestamo(uuid),
  rechazar_prestamo(uuid),
  registrar_abono(uuid, numeric, date),
  confirmar_abono(uuid)
  from public, anon;
