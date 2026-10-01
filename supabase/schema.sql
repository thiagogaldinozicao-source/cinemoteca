-- Cinemoteca: tabela da lista de cada pessoa.
-- Rode uma vez no Supabase: SQL Editor → New query → cole tudo → Run.
-- Pode rodar de novo sem problema (não apaga nada).

create table if not exists public.items (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null,                 -- "movie:123" ou "tv:456"
  data       jsonb       not null default '{}'::jsonb,
  deleted    boolean     not null default false,   -- tirado da lista (avisa os outros aparelhos)
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists items_user_updated on public.items (user_id, updated_at);

-- Hora de alteração marcada pelo servidor (os aparelhos puxam só o que mudou).
create or replace function public.items_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists items_touch on public.items;
create trigger items_touch before insert or update on public.items
for each row execute function public.items_touch();

-- Cada pessoa só enxerga e mexe na própria lista.
alter table public.items enable row level security;

drop policy if exists "ve a propria lista" on public.items;
drop policy if exists "adiciona na propria lista" on public.items;
drop policy if exists "altera a propria lista" on public.items;
drop policy if exists "apaga da propria lista" on public.items;

create policy "ve a propria lista" on public.items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "adiciona na propria lista" on public.items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "altera a propria lista" on public.items
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apaga da propria lista" on public.items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Visitante sem login não acessa nada.
revoke all on public.items from anon;
grant select, insert, update, delete on public.items to authenticated;

-- Sinal de vida: chamado a cada 3 dias pelo GitHub (.github/workflows/manter-acordado.yml)
-- pra o projeto grátis não ser pausado por falta de uso.
create or replace function public.ping() returns integer
language sql stable security invoker set search_path = '' as $$ select 1 $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- Gostos de cada pessoa (gêneros escolhidos na primeira entrada).
create table if not exists public.gostos (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gostos enable row level security;
drop policy if exists "ve os proprios gostos" on public.gostos;
drop policy if exists "salva os proprios gostos" on public.gostos;
drop policy if exists "altera os proprios gostos" on public.gostos;
create policy "ve os proprios gostos" on public.gostos
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "salva os proprios gostos" on public.gostos
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "altera os proprios gostos" on public.gostos
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.gostos from anon;
grant select, insert, update on public.gostos to authenticated;

-- Limite de tamanho (um título ocupa ~500 bytes): ninguém consegue encher o plano grátis.
alter table public.items drop constraint if exists items_data_tam;
alter table public.items add constraint items_data_tam check (octet_length(data::text) < 8000);
alter table public.gostos drop constraint if exists gostos_data_tam;
alter table public.gostos add constraint gostos_data_tam check (octet_length(data::text) < 4000);
