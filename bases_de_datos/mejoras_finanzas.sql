-- Complementos de presupuesto para Raiz de Oro.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists presupuestos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  categoria_id uuid not null references categorias(id) on delete cascade,
  limite_mensual numeric(14,2) not null check (limite_mensual > 0),
  creado_en timestamptz not null default now(),
  unique (usuario_id, categoria_id)
);

create index if not exists presupuestos_usuario_idx on presupuestos (usuario_id);

alter table presupuestos enable row level security;

drop policy if exists presupuestos_propios on presupuestos;
create policy presupuestos_propios on presupuestos for all
  using (usuario_id = auth.uid())
  with check (
    usuario_id = auth.uid()
    and exists (
      select 1
      from categorias c
      where c.id = categoria_id
        and c.usuario_id = auth.uid()
        and c.tipo = 'gasto'
    )
  );

notify pgrst, 'reload schema';

-- Límite del servidor para contraseñas incorrectas en el inicio de sesión.
create table if not exists limites_login (
  correo_normalizado text primary key,
  dia date not null default current_date,
  intentos integer not null default 0 check (intentos >= 0),
  bloqueos integer not null default 0 check (bloqueos >= 0),
  bloqueado_hasta timestamptz
);

alter table limites_login enable row level security;

create or replace function controlar_intento_login(p_correo text, p_resultado text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text := lower(trim(p_correo));
  v_dia date;
  v_intentos integer;
  v_bloqueos integer;
  v_bloqueado_hasta timestamptz;
  v_espera interval;
begin
  if v_correo is null or v_correo = '' then
    raise exception 'El correo es obligatorio';
  end if;
  if p_resultado not in ('consultar', 'fallo', 'exito') then
    raise exception 'Resultado de intento no válido';
  end if;

  perform pg_advisory_xact_lock(hashtext('login:' || v_correo));
  insert into limites_login (correo_normalizado)
  values (v_correo)
  on conflict (correo_normalizado) do nothing;

  select dia, intentos, bloqueos, bloqueado_hasta
    into v_dia, v_intentos, v_bloqueos, v_bloqueado_hasta
  from limites_login
  where correo_normalizado = v_correo
  for update;

  if v_dia <> current_date then
    v_dia := current_date;
    v_intentos := 0;
    v_bloqueos := 0;
    v_bloqueado_hasta := null;
  end if;

  if v_bloqueado_hasta is not null and v_bloqueado_hasta > now() then
    update limites_login
    set dia = v_dia, intentos = v_intentos, bloqueos = v_bloqueos
    where correo_normalizado = v_correo;
    return jsonb_build_object('permitido', false, 'bloqueado_hasta', v_bloqueado_hasta);
  end if;

  if p_resultado = 'exito' then
    v_intentos := 0;
    v_bloqueos := 0;
    v_bloqueado_hasta := null;
  elsif p_resultado = 'fallo' then
    if v_bloqueado_hasta is not null then
      v_intentos := 0;
      v_bloqueado_hasta := null;
    end if;
    v_intentos := v_intentos + 1;
    if v_intentos >= 5 then
      v_espera := make_interval(mins => (5 * power(2, v_bloqueos))::integer);
      v_bloqueado_hasta := now() + v_espera;
      v_bloqueos := v_bloqueos + 1;
    end if;
  end if;

  update limites_login
  set dia = v_dia,
      intentos = v_intentos,
      bloqueos = v_bloqueos,
      bloqueado_hasta = v_bloqueado_hasta
  where correo_normalizado = v_correo;

  return jsonb_build_object(
    'permitido', v_bloqueado_hasta is null,
    'bloqueado_hasta', v_bloqueado_hasta,
    'intentos', v_intentos,
    'bloqueos', v_bloqueos
  );
end;
$$;

revoke execute on function controlar_intento_login(text, text) from public;
grant execute on function controlar_intento_login(text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Límite del servidor para solicitudes de recuperación de contraseña.
create table if not exists limites_recuperacion (
  correo_normalizado text primary key,
  dia date not null default current_date,
  intentos integer not null default 0 check (intentos >= 0),
  bloqueos integer not null default 0 check (bloqueos >= 0),
  bloqueado_hasta timestamptz
);

alter table limites_recuperacion enable row level security;

create or replace function solicitar_recuperacion(p_correo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text := lower(trim(p_correo));
  v_dia date := current_date;
  v_intentos integer;
  v_bloqueos integer;
  v_bloqueado_hasta timestamptz;
  v_espera interval;
begin
  if v_correo is null or v_correo = '' then
    raise exception 'El correo es obligatorio';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_correo));

  insert into limites_recuperacion (correo_normalizado, dia)
  values (v_correo, v_dia)
  on conflict (correo_normalizado) do nothing;

  select intentos, bloqueos, bloqueado_hasta
    into v_intentos, v_bloqueos, v_bloqueado_hasta
  from limites_recuperacion
  where correo_normalizado = v_correo
  for update;

  if (select dia from limites_recuperacion where correo_normalizado = v_correo) <> v_dia then
    v_intentos := 0;
    v_bloqueos := 0;
    v_bloqueado_hasta := null;
  end if;

  if v_bloqueado_hasta is not null and v_bloqueado_hasta > now() then
    update limites_recuperacion
    set dia = v_dia, intentos = v_intentos, bloqueos = v_bloqueos
    where correo_normalizado = v_correo;
    return jsonb_build_object(
      'permitido', false,
      'bloqueado_hasta', v_bloqueado_hasta,
      'intentos', v_intentos,
      'bloqueos', v_bloqueos
    );
  end if;

  if v_bloqueado_hasta is not null then
    v_intentos := 0;
    v_bloqueado_hasta := null;
  end if;

  v_intentos := v_intentos + 1;
  if v_intentos >= 5 then
    v_espera := make_interval(mins => (5 * power(2, v_bloqueos))::integer);
    v_bloqueado_hasta := now() + v_espera;
    v_bloqueos := v_bloqueos + 1;
  end if;

  update limites_recuperacion
  set dia = v_dia,
      intentos = v_intentos,
      bloqueos = v_bloqueos,
      bloqueado_hasta = v_bloqueado_hasta
  where correo_normalizado = v_correo;

  return jsonb_build_object(
    'permitido', true,
    'bloqueado_hasta', v_bloqueado_hasta,
    'intentos', v_intentos,
    'bloqueos', v_bloqueos
  );
end;
$$;

revoke execute on function solicitar_recuperacion(text) from public;
grant execute on function solicitar_recuperacion(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Al completar una meta, devuelve todo el ahorro a la bolsa y elimina la meta.
-- Conserva los movimientos como historial, desvinculándolos antes de borrar la meta.
drop function if exists aportar_ahorro(uuid, numeric, date);

create function aportar_ahorro(p_meta uuid, p_monto numeric, p_fecha date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user      uuid := auth.uid();
  v_objetivo  numeric;
  v_cumplida  date;
  v_ahorrado  numeric;
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

  v_ahorrado := _ahorrado(p_meta);
  if v_cumplida is null and v_ahorrado >= v_objetivo then
    insert into movimientos (usuario_id, fecha, monto, tipo, meta_id, nota)
    values (
      v_user,
      p_fecha,
      v_ahorrado,
      'retiro_ahorro',
      p_meta,
      'Meta completada: ahorro devuelto a la bolsa'
    );
    update movimientos set meta_id = null where meta_id = p_meta;
    delete from metas_ahorro where id = p_meta and usuario_id = v_user;
  end if;
end $$;

revoke execute on function aportar_ahorro(uuid, numeric, date) from public, anon;
grant execute on function aportar_ahorro(uuid, numeric, date) to authenticated;

notify pgrst, 'reload schema';

drop function if exists completar_meta_ahorro(uuid, date);

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

revoke execute on function completar_meta_ahorro(uuid, date) from public, anon;
grant execute on function completar_meta_ahorro(uuid, date) to authenticated;

notify pgrst, 'reload schema';

-- Avatar de perfil: imagen publica almacenada en el bucket avatars.
alter table perfiles add column if not exists avatar_url text;

drop policy if exists perfiles_editar on perfiles;
create policy perfiles_editar on perfiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatares_ver on storage.objects;
create policy avatares_ver on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatares_subir on storage.objects;
create policy avatares_subir on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatares_actualizar on storage.objects;
create policy avatares_actualizar on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatares_borrar on storage.objects;
create policy avatares_borrar on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
