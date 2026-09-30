-- Cinemoteca: amigos e indicações.
-- Tudo passa por funções do servidor que conferem se as duas pessoas são amigas;
-- ninguém lê a tabela items de outra pessoa direto.

-- Perfil: nome que aparece pros amigos + código de convite.
create table if not exists public.perfis (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nome       text not null,
  codigo     text not null unique,
  created_at timestamptz not null default now()
);
alter table public.perfis enable row level security;
drop policy if exists "ve o proprio perfil" on public.perfis;
create policy "ve o proprio perfil" on public.perfis
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;

-- Amizade (um par por linha, a < b).
create table if not exists public.amizades (
  a          uuid not null references auth.users (id) on delete cascade,
  b          uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists amizades_b on public.amizades (b);
alter table public.amizades enable row level security;
drop policy if exists "ve as proprias amizades" on public.amizades;
create policy "ve as proprias amizades" on public.amizades
  for select to authenticated using ((select auth.uid()) in (a, b));
revoke all on public.amizades from anon, authenticated;
grant select on public.amizades to authenticated;

-- Indicações de um amigo pro outro.
create table if not exists public.indicacoes (
  id         bigint generated always as identity primary key,
  de         uuid not null references auth.users (id) on delete cascade,
  para       uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  data       jsonb not null,
  msg        text not null default '',
  estado     text not null default 'nova' check (estado in ('nova', 'vista', 'aceita', 'dispensada')),
  created_at timestamptz not null default now(),
  unique (de, para, key)
);
create index if not exists indicacoes_para on public.indicacoes (para, created_at desc);
alter table public.indicacoes enable row level security;
drop policy if exists "ve indicacoes suas" on public.indicacoes;
create policy "ve indicacoes suas" on public.indicacoes
  for select to authenticated using ((select auth.uid()) in (de, para));
revoke all on public.indicacoes from anon, authenticated;
grant select on public.indicacoes to authenticated;

-- ---------- funções ----------
create or replace function public.sao_amigos(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.amizades where a = least(x, y) and b = greatest(x, y))
$$;
revoke all on function public.sao_amigos(uuid, uuid) from public, anon, authenticated;

-- Garante o perfil (cria na primeira vez) e devolve nome + código.
create or replace function public.meu_perfil() returns table (nome text, codigo text)
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text; n text; i int;
begin
  if me is null then raise exception 'sem login'; end if;
  if not exists (select 1 from public.perfis p where p.user_id = me) then
    select initcap(split_part(coalesce(u.email, 'amigo'), '@', 1)) into n from auth.users u where u.id = me;
    n := left(regexp_replace(coalesce(n, 'Amigo'), '[._\d]+', ' ', 'g'), 30);
    n := coalesce(nullif(trim(n), ''), 'Amigo');
    loop
      c := '';
      for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
      begin
        insert into public.perfis (user_id, nome, codigo) values (me, n, c);
        exit;
      exception when unique_violation then
        if exists (select 1 from public.perfis p where p.user_id = me) then exit; end if;
      end;
    end loop;
  end if;
  return query select p.nome, p.codigo from public.perfis p where p.user_id = me;
end $$;

create or replace function public.salvar_nome(novo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  novo := left(trim(coalesce(novo, '')), 30);
  if novo = '' then raise exception 'nome vazio'; end if;
  update public.perfis set nome = novo where user_id = auth.uid();
end $$;

-- Quem é o dono deste código (pra confirmar antes de aceitar).
create or replace function public.ver_convite(cod text) returns table (user_id uuid, nome text, ja_amigos boolean)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.nome, public.sao_amigos(p.user_id, auth.uid())
  from public.perfis p
  where auth.uid() is not null
    and p.codigo = upper(regexp_replace(cod, '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.aceitar_convite(cod text) returns table (user_id uuid, nome text)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); outro uuid; n text;
begin
  if me is null then raise exception 'sem login'; end if;
  select p.user_id, p.nome into outro, n from public.perfis p
   where p.codigo = upper(regexp_replace(cod, '[^A-Za-z0-9]', '', 'g'));
  if outro is null then raise exception 'codigo invalido'; end if;
  if outro = me then raise exception 'proprio codigo'; end if;
  insert into public.amizades (a, b) values (least(me, outro), greatest(me, outro)) on conflict do nothing;
  return query select outro, n;
end $$;

create or replace function public.meus_amigos() returns table (user_id uuid, nome text, desde timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.nome, z.created_at
  from public.amizades z
  join public.perfis p on p.user_id = case when z.a = auth.uid() then z.b else z.a end
  where auth.uid() in (z.a, z.b)
  order by p.nome
$$;

create or replace function public.desfazer_amizade(amigo uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.amizades where a = least(auth.uid(), amigo) and b = greatest(auth.uid(), amigo)
$$;

-- Lista e gostos do amigo (só se forem amigos).
create or replace function public.lista_do_amigo(amigo uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.sao_amigos(auth.uid(), amigo) then raise exception 'nao sao amigos'; end if;
  return jsonb_build_object(
    'nome', (select nome from public.perfis where user_id = amigo),
    'gostos', (select data from public.gostos where user_id = amigo),
    'items', coalesce((select jsonb_agg(i.data - 'memo' - 'order') from public.items i
                       where i.user_id = amigo and not i.deleted), '[]'::jsonb)
  );
end $$;

-- Mandar indicação (pode mandar de novo o mesmo: volta a aparecer como nova).
create or replace function public.indicar(para_quem uuid, chave text, dados jsonb, mensagem text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.sao_amigos(auth.uid(), para_quem) then raise exception 'nao sao amigos'; end if;
  if chave !~ '^(movie|tv):\d+$' or octet_length(dados::text) > 4000 then raise exception 'dados invalidos'; end if;
  insert into public.indicacoes (de, para, key, data, msg)
  values (auth.uid(), para_quem, chave, dados, left(coalesce(mensagem, ''), 280))
  on conflict (de, para, key) do update
    set data = excluded.data, msg = excluded.msg, estado = 'nova', created_at = now();
end $$;

-- Indicações que chegaram pra mim (com o nome de quem mandou).
create or replace function public.minhas_indicacoes() returns table
  (id bigint, de uuid, nome text, key text, data jsonb, msg text, estado text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.id, x.de, coalesce(p.nome, 'Amigo'), x.key, x.data, x.msg, x.estado, x.created_at
  from public.indicacoes x left join public.perfis p on p.user_id = x.de
  where x.para = auth.uid() and x.estado <> 'dispensada'
  order by x.created_at desc
  limit 200
$$;

create or replace function public.marcar_indicacoes(ids bigint[], novo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if novo not in ('vista', 'aceita', 'dispensada') then raise exception 'estado invalido'; end if;
  update public.indicacoes set estado = novo
   where id = any(ids) and para = auth.uid()
     and not (novo = 'vista' and estado <> 'nova');
end $$;

-- O que eu já indiquei pra este amigo.
create or replace function public.indiquei_pra(amigo uuid) returns table (key text, data jsonb, estado text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.key, x.data, x.estado, x.created_at from public.indicacoes x
  where x.de = auth.uid() and x.para = amigo order by x.created_at desc limit 100
$$;

do $$
declare f text;
begin
  foreach f in array array['meu_perfil()', 'salvar_nome(text)', 'ver_convite(text)', 'aceitar_convite(text)',
    'meus_amigos()', 'desfazer_amizade(uuid)', 'lista_do_amigo(uuid)', 'indicar(uuid,text,jsonb,text)',
    'minhas_indicacoes()', 'marcar_indicacoes(bigint[],text)', 'indiquei_pra(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- trocar código + resumo (consulta periódica numa chamada só) ----------
create or replace function public.novo_codigo() returns text
language plpgsql volatile set search_path = '' as $$
declare abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.perfis where codigo = c);
  end loop;
  return c;
end $$;
revoke all on function public.novo_codigo() from public, anon, authenticated;

create or replace function public.trocar_codigo() returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  c := public.novo_codigo();
  update public.perfis set codigo = c where user_id = auth.uid();
  return c;
end $$;

create or replace function public.resumo() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'amigos', coalesce((select jsonb_agg(to_jsonb(a)) from public.meus_amigos() a), '[]'::jsonb),
    'caixa', coalesce((select jsonb_agg(to_jsonb(c)) from public.minhas_indicacoes() c), '[]'::jsonb)
  )
$$;

revoke all on function public.trocar_codigo() from public, anon;
grant execute on function public.trocar_codigo() to authenticated;
revoke all on function public.resumo() from public, anon;
grant execute on function public.resumo() to authenticated;
