-- Lo que Supabase pone y un Postgres pelado no tiene.
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Igual que la de Supabase: lee el "sub" del JWT.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb default '{}'::jsonb
);
alter table storage.objects enable row level security;

-- Devuelve las carpetas de una ruta, sin el nombre del archivo.
create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1 : greatest(array_length(string_to_array(name,'/'),1) - 1, 0)]
$$;
