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
