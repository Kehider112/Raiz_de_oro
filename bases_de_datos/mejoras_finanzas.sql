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
