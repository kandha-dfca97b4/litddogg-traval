-- 出行带什么 🧳 — private-by-capability shared rooms
-- Run this entire file in Supabase SQL Editor when setting up or updating the sync schema.
-- It uses CREATE OR REPLACE and IF NOT EXISTS; rerunning it does not delete existing rooms.
-- The browser receives only an anon/public key. Table access is denied directly;
-- all reads and writes go through SECURITY DEFINER RPCs that verify the invite code.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trip_rooms (
  id uuid primary key default gen_random_uuid(),
  invite_hash text not null,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trip_rooms enable row level security;
revoke all on table public.trip_rooms from anon, authenticated;

-- Recursively merge objects. Arrays of objects with an "id" are merged by id.
-- Checklist items carry updatedAt, so simultaneous edits to different items survive;
-- for the same item, the most recently edited version wins.
create or replace function public.merge_trip_jsonb(p_base jsonb, p_patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $$
declare
  v_result jsonb;
  v_key text;
  v_value jsonb;
  v_field text;
  v_stamp_key text;
  v_patch_stamp timestamptz;
  v_base_stamp timestamptz;
  v_use_patch boolean;
begin
  if p_base is null or p_base = 'null'::jsonb then
    return p_patch;
  end if;

  if p_patch is null or p_patch = 'null'::jsonb then
    return p_patch;
  end if;

  if jsonb_typeof(p_base) = 'object' and jsonb_typeof(p_patch) = 'object' then
    -- Checklist items merge each person's reply and checkbox independently.
    -- This prevents one person's edit from overwriting the other person's
    -- newer reply when both devices save the same item at nearly the same time.
    if p_base ? 'id'
       and p_patch ? 'id'
       and p_base->>'id' = p_patch->>'id'
       and (
         p_base ? 'noteA' or p_patch ? 'noteA'
         or p_base ? 'noteB' or p_patch ? 'noteB'
         or p_base ? 'doneA' or p_patch ? 'doneA'
         or p_base ? 'doneB' or p_patch ? 'doneB'
       ) then
      v_result := p_base;

      if p_patch ? 'updatedAt' then
        if not (p_base ? 'updatedAt') then
          v_result := p_patch;
        else
          begin
            if (p_patch->>'updatedAt')::timestamptz >= (p_base->>'updatedAt')::timestamptz then
              v_result := p_patch;
            end if;
          exception when others then
            v_result := p_patch;
          end;
        end if;
      end if;

      foreach v_field in array array['noteA', 'noteB', 'doneA', 'doneB']
      loop
        v_stamp_key := v_field || 'UpdatedAt';
        v_use_patch := false;
        v_patch_stamp := null;
        v_base_stamp := null;

        if p_patch ? v_field then
          if p_patch ? v_stamp_key then
            begin
              v_patch_stamp := (p_patch->>v_stamp_key)::timestamptz;
            exception when others then
              v_patch_stamp := null;
            end;

            if p_base ? v_stamp_key then
              begin
                v_base_stamp := (p_base->>v_stamp_key)::timestamptz;
              exception when others then
                v_base_stamp := null;
              end;
            end if;

            v_use_patch := (
              v_patch_stamp is not null
              and (v_base_stamp is null or v_patch_stamp >= v_base_stamp)
            ) or not (p_base ? v_field);
          elsif p_base ? v_stamp_key then
            -- An older client without a field timestamp must not overwrite
            -- a reply that has already been saved by a newer client.
            v_use_patch := false;
          elsif p_patch ? 'updatedAt' and p_base ? 'updatedAt' then
            begin
              v_use_patch := (p_patch->>'updatedAt')::timestamptz >= (p_base->>'updatedAt')::timestamptz;
            exception when others then
              v_use_patch := true;
            end;
          else
            v_use_patch := true;
          end if;
        end if;

        if v_use_patch then
          v_result := jsonb_set(v_result, array[v_field], p_patch->v_field, true);
          if p_patch ? v_stamp_key then
            v_result := jsonb_set(v_result, array[v_stamp_key], p_patch->v_stamp_key, true);
          else
            v_result := v_result - v_stamp_key;
          end if;
        elsif p_base ? v_field then
          v_result := jsonb_set(v_result, array[v_field], p_base->v_field, true);
          if p_base ? v_stamp_key then
            v_result := jsonb_set(v_result, array[v_stamp_key], p_base->v_stamp_key, true);
          else
            v_result := v_result - v_stamp_key;
          end if;
        end if;
      end loop;

      return v_result;
    end if;

    if p_base ? 'updatedAt' and p_patch ? 'updatedAt' then
      begin
        if (p_patch->>'updatedAt')::timestamptz >= (p_base->>'updatedAt')::timestamptz then
          return p_patch;
        else
          return p_base;
        end if;
      exception when others then
        -- If timestamps are malformed, fall back to a regular object merge.
        null;
      end;
    end if;

    v_result := p_base;
    for v_key, v_value in select key, value from jsonb_each(p_patch)
    loop
      if v_result ? v_key then
        v_result := jsonb_set(v_result, array[v_key], public.merge_trip_jsonb(v_result->v_key, v_value), true);
      else
        v_result := jsonb_set(v_result, array[v_key], v_value, true);
      end if;
    end loop;
    return v_result;
  end if;

  if jsonb_typeof(p_base) = 'array' and jsonb_typeof(p_patch) = 'array' then
    if exists (
      select 1 from jsonb_array_elements(p_base) e(value)
      where jsonb_typeof(e.value) <> 'object' or not (e.value ? 'id')
    ) or exists (
      select 1 from jsonb_array_elements(p_patch) e(value)
      where jsonb_typeof(e.value) <> 'object' or not (e.value ? 'id')
    ) then
      return p_patch;
    end if;

    select coalesce(
      jsonb_agg(
        merged.value
        order by coalesce((merged.value->>'sortOrder')::integer, 0), merged.item_id
      ),
      '[]'::jsonb
    )
    into v_result
    from (
      select
        coalesce(b.item_id, p.item_id) as item_id,
        case
          when b.value is null then p.value
          when p.value is null then b.value
          else public.merge_trip_jsonb(b.value, p.value)
        end as value
      from (
        select value, value->>'id' as item_id
        from jsonb_array_elements(p_base)
      ) b
      full join (
        select value, value->>'id' as item_id
        from jsonb_array_elements(p_patch)
      ) p on b.item_id = p.item_id
    ) merged;
    return v_result;
  end if;

  return p_patch;
end;
$$;

revoke all on function public.merge_trip_jsonb(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.create_trip_room(p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_code text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into public.trip_rooms (id, invite_hash, state)
  values (
    v_id,
    encode(extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'), 'hex'),
    coalesce(p_state, '{}'::jsonb)
  );

  return jsonb_build_object(
    'trip_id', v_id,
    'invite_code', v_code,
    'state', coalesce(p_state, '{}'::jsonb),
    'revision', 1
  );
end;
$$;

create or replace function public.get_trip_room(p_trip_id uuid, p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_state jsonb;
  v_revision bigint;
  v_hash text;
begin
  if p_invite_code is null or length(p_invite_code) < 32 then
    raise exception 'Invalid invitation';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_invite_code, 'UTF8'), 'sha256'), 'hex');

  select state, revision
    into v_state, v_revision
    from public.trip_rooms
   where id = p_trip_id and invite_hash = v_hash;

  if not found then
    raise exception 'Invalid invitation';
  end if;

  return jsonb_build_object('state', v_state, 'revision', v_revision);
end;
$$;

create or replace function public.save_trip_room(p_trip_id uuid, p_invite_code text, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_current_state jsonb;
  v_new_state jsonb;
  v_revision bigint;
  v_hash text;
begin
  if p_invite_code is null or length(p_invite_code) < 32 then
    raise exception 'Invalid invitation';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_invite_code, 'UTF8'), 'sha256'), 'hex');

  select state, revision
    into v_current_state, v_revision
    from public.trip_rooms
   where id = p_trip_id and invite_hash = v_hash
   for update;

  if not found then
    raise exception 'Invalid invitation';
  end if;

  v_new_state := public.merge_trip_jsonb(v_current_state, coalesce(p_state, '{}'::jsonb));

  update public.trip_rooms
     set state = v_new_state,
         revision = revision + 1,
         updated_at = now()
   where id = p_trip_id
   returning revision into v_revision;

  return jsonb_build_object('state', v_new_state, 'revision', v_revision);
end;
$$;

revoke all on function public.create_trip_room(jsonb) from public;
revoke all on function public.get_trip_room(uuid, text) from public;
revoke all on function public.save_trip_room(uuid, text, jsonb) from public;

grant execute on function public.create_trip_room(jsonb) to anon, authenticated;
grant execute on function public.get_trip_room(uuid, text) to anon, authenticated;
grant execute on function public.save_trip_room(uuid, text, jsonb) to anon, authenticated;

-- Realtime uses a public broadcast channel containing only a refresh notification.
-- The actual checklist payload is always fetched through get_trip_room with the invite code.
