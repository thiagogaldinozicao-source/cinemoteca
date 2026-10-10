-- Cinemoteca: conversa entre amigos + avisos no celular (notificação).
-- Rodar depois de amigos.sql. Os segredos (chaves VAPID e o segredo do aviso)
-- ficam no Vault e NÃO vão no repositório. Ver o fim do arquivo.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- mensagens ----------
create table if not exists public.mensagens (
  id         bigint generated always as identity primary key,
  de         uuid not null references auth.users (id) on delete cascade,
  para       uuid not null references auth.users (id) on delete cascade,
  texto      text not null default '' check (char_length(texto) <= 1000),
  item       jsonb check (item is null or octet_length(item::text) < 4000),
  lida       boolean not null default false,
  created_at timestamptz not null default now(),
  check (texto <> '' or item is not null)
);
create index if not exists mensagens_para on public.mensagens (para, created_at desc);
create index if not exists mensagens_de on public.mensagens (de, created_at desc);
create index if not exists mensagens_nlidas on public.mensagens (para) where not lida;
alter table public.mensagens enable row level security;
drop policy if exists "ve as proprias mensagens" on public.mensagens;
create policy "ve as proprias mensagens" on public.mensagens
  for select to authenticated using ((select auth.uid()) in (de, para));
revoke all on public.mensagens from anon, authenticated;
grant select on public.mensagens to authenticated;  -- escrever só pela função mandar_msg
do $$ begin
  alter publication supabase_realtime add table public.mensagens;
exception when duplicate_object then null; end $$;

create or replace function public.mandar_msg(amigo uuid, txt text, dados jsonb) returns public.mensagens
language plpgsql security definer set search_path = '' as $$
declare r public.mensagens;
begin
  if auth.uid() is null or not public.sao_amigos(auth.uid(), amigo) then raise exception 'nao sao amigos'; end if;
  txt := left(trim(coalesce(txt, '')), 1000);
  if dados is not null and (octet_length(dados::text) > 3000 or coalesce(dados->>'key', '') !~ '^(movie|tv):\d+$') then
    raise exception 'dados invalidos';
  end if;
  if txt = '' and dados is null then raise exception 'mensagem vazia'; end if;
  -- freio contra enxurrada: no máximo 30 mensagens por minuto
  if (select count(*) from public.mensagens where de = auth.uid() and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'muitas mensagens';
  end if;
  insert into public.mensagens (de, para, texto, item) values (auth.uid(), amigo, txt, dados) returning * into r;
  return r;
end $$;

-- Conversa com um amigo (50 por vez; "antes" = id pra carregar as mais antigas).
create or replace function public.conversa(amigo uuid, antes bigint default null) returns setof public.mensagens
language sql stable security definer set search_path = '' as $$
  select * from (
    select m.* from public.mensagens m
    where auth.uid() is not null
      and ((m.de = auth.uid() and m.para = amigo) or (m.de = amigo and m.para = auth.uid()))
      and (antes is null or m.id < antes)
    order by m.id desc limit 50
  ) x order by x.id
$$;

create or replace function public.ler_conversa(amigo uuid) returns void
language sql security definer set search_path = '' as $$
  update public.mensagens set lida = true where para = auth.uid() and de = amigo and not lida
$$;

-- Última mensagem e quantas não lidas, por amigo.
create or replace function public.minhas_conversas() returns table
  (amigo uuid, texto text, item jsonb, de uuid, created_at timestamptz, naolidas int)
language sql stable security definer set search_path = '' as $$
  with minhas as (
    select m.*, case when m.de = auth.uid() then m.para else m.de end as outro
    from public.mensagens m where auth.uid() in (m.de, m.para)
  )
  select distinct on (outro) outro, texto, item, de, created_at,
    (select count(*)::int from public.mensagens n where n.para = auth.uid() and n.de = minhas.outro and not n.lida)
  from minhas order by outro, id desc
$$;

-- resumo agora traz as conversas junto (uma chamada só ao abrir).
create or replace function public.resumo() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'amigos', coalesce((select jsonb_agg(to_jsonb(a)) from public.meus_amigos() a), '[]'::jsonb),
    'caixa', coalesce((select jsonb_agg(to_jsonb(c)) from public.minhas_indicacoes() c), '[]'::jsonb),
    'conversas', coalesce((select jsonb_agg(to_jsonb(v)) from public.minhas_conversas() v), '[]'::jsonb)
  )
$$;

revoke all on function public.mandar_msg(uuid, text, jsonb) from public, anon;
revoke all on function public.conversa(uuid, bigint) from public, anon;
revoke all on function public.ler_conversa(uuid) from public, anon;
revoke all on function public.minhas_conversas() from public, anon;
grant execute on function public.mandar_msg(uuid, text, jsonb) to authenticated;
grant execute on function public.conversa(uuid, bigint) to authenticated;
grant execute on function public.ler_conversa(uuid) to authenticated;
grant execute on function public.minhas_conversas() to authenticated;

-- ---------- avisos no celular ----------
-- Cada aparelho que liga os avisos guarda aqui a "assinatura" (endereço de push).
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  sub        jsonb not null,
  avisos     jsonb not null default '{"chat": true, "ind": true, "sug": true}',
  visto_em   timestamptz not null default now(),   -- última vez que o app abriu nesse aparelho
  sug_em     timestamptz,                          -- última sugestão mandada
  sug_semana jsonb not null default '[]',          -- quando mandou sugestão (últimos 7 dias)
  horas      jsonb not null default '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]', -- a que horas a pessoa abre o app
  created_at timestamptz not null default now()
);
alter table public.push_subs add column if not exists ativo boolean not null default true;  -- false = desligou neste aparelho
alter table public.push_subs add column if not exists sug_semana jsonb not null default '[]';
alter table public.push_subs add column if not exists horas jsonb not null default '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]';
create index if not exists push_subs_user on public.push_subs (user_id);
alter table public.push_subs enable row level security;  -- sem política: só pelas funções
revoke all on public.push_subs from anon, authenticated;

-- Liga/atualiza os avisos deste aparelho (também serve de "abri o app").
-- Só aceita endereço dos serviços de push oficiais (Apple, Google, Mozilla, Microsoft).
create or replace function public.salvar_push(assinatura jsonb, quais jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ep text := assinatura->>'endpoint';
  h int := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  if ep is null or octet_length(assinatura::text) > 2000
     or ep !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
     or coalesce(assinatura->'keys'->>'p256dh', '') = '' or coalesce(assinatura->'keys'->>'auth', '') = '' then
    raise exception 'assinatura invalida';
  end if;
  -- no máximo 10 aparelhos com aviso por conta: o mais parado sai da fila
  if not exists (select 1 from public.push_subs where endpoint = ep)
     and (select count(*) from public.push_subs where user_id = auth.uid() and ativo) >= 10 then
    update public.push_subs set ativo = false where endpoint =
      (select endpoint from public.push_subs where user_id = auth.uid() and ativo order by visto_em asc limit 1);
  end if;
  if (select count(*) from public.push_subs where user_id = auth.uid()) >= 40
     and not exists (select 1 from public.push_subs where endpoint = ep) then
    raise exception 'muitos aparelhos';
  end if;
  quais := jsonb_build_object(
    'chat', coalesce((quais->>'chat')::boolean, true),
    'ind', coalesce((quais->>'ind')::boolean, true),
    'sug', coalesce((quais->>'sug')::boolean, true));
  insert into public.push_subs (endpoint, user_id, sub, avisos) values (ep, auth.uid(), assinatura, quais)
  on conflict (endpoint) do update set user_id = auth.uid(), sub = excluded.sub, avisos = excluded.avisos, visto_em = now(), ativo = true,
    -- conta a hora que abriu (no máximo 1 por hora, pra aprender o horário de cada um)
    horas = case when public.push_subs.visto_em < now() - interval '50 minutes'
      then jsonb_set(public.push_subs.horas, array[h::text], to_jsonb(coalesce((public.push_subs.horas->>h)::int, 0) + 1))
      else public.push_subs.horas end;
end $$;

create or replace function public.tirar_push(ep text) returns void
language sql security definer set search_path = '' as $$
  update public.push_subs set ativo = false where endpoint = ep and user_id = auth.uid()
$$;
revoke all on function public.salvar_push(jsonb, jsonb) from public, anon;
revoke all on function public.tirar_push(text) from public, anon;
grant execute on function public.salvar_push(jsonb, jsonb) to authenticated;
grant execute on function public.tirar_push(text) to authenticated;

-- Segredos pra função "push": só quem chama com a chave service_role (o servidor) lê.
create or replace function public.push_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') <> 'service_role' then
    raise exception 'sem permissao';
  end if;
  return (select jsonb_object_agg(name, decrypted_secret) from vault.decrypted_secrets
          where name in ('vapid_publico', 'vapid_privado', 'push_segredo'));
end $$;
revoke all on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- Gatilhos chamam a função "push" direto (pg_net é assíncrono, não trava quem gravou).
create or replace function public.avisa_msg() returns trigger
language plpgsql security definer set search_path = '' as $$
declare seg text; base text;
begin
  select decrypted_secret into seg from vault.decrypted_secrets where name = 'push_segredo';
  select decrypted_secret into base from vault.decrypted_secrets where name = 'push_url';
  if seg is not null and base is not null then
    perform net.http_post(url := base, body := jsonb_build_object('tipo', 'msg', 'id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', seg), timeout_milliseconds := 8000);
  end if;
  return new;
end $$;
create or replace trigger avisa_msg after insert on public.mensagens for each row execute function public.avisa_msg();

create or replace function public.avisa_ind() returns trigger
language plpgsql security definer set search_path = '' as $$
declare seg text; base text;
begin
  if tg_op = 'INSERT' or (new.estado = 'nova' and new.created_at <> old.created_at) then
    select decrypted_secret into seg from vault.decrypted_secrets where name = 'push_segredo';
    select decrypted_secret into base from vault.decrypted_secrets where name = 'push_url';
    if seg is not null and base is not null then
      perform net.http_post(url := base, body := jsonb_build_object('tipo', 'ind', 'id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo', seg), timeout_milliseconds := 8000);
    end if;
  end if;
  return new;
end $$;
create or replace trigger avisa_ind after insert or update on public.indicacoes for each row execute function public.avisa_ind();
revoke all on function public.avisa_msg() from public, anon, authenticated;
revoke all on function public.avisa_ind() from public, anon, authenticated;

-- Confere de novo as permissões (rodar este trecho sempre que recriar as funções acima:
-- função nova nasce liberada pra todo mundo).
revoke all on function public.mandar_msg(uuid, text, jsonb) from public, anon;
revoke all on function public.conversa(uuid, bigint) from public, anon;
revoke all on function public.ler_conversa(uuid) from public, anon;
revoke all on function public.minhas_conversas() from public, anon;
revoke all on function public.salvar_push(jsonb, jsonb) from public, anon;
revoke all on function public.tirar_push(text) from public, anon;
revoke all on function public.push_config() from public, anon, authenticated;
revoke all on function public.avisa_msg() from public, anon, authenticated;
revoke all on function public.avisa_ind() from public, anon, authenticated;

-- Sugestão esperta: roda de hora em hora; a função "push" decide se agora é um
-- bom momento pra cada pessoa (horário dela, dia da semana, feriado, série em andamento).
select cron.schedule('cinemoteca-sugestao', '40 * * * *', $c$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_url'),
    body := '{"tipo":"sug"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-segredo',
      (select decrypted_secret from vault.decrypted_secrets where name = 'push_segredo')),
    timeout_milliseconds := 30000)
$c$);

-- ---------- segredos (rodar uma vez, NÃO commitar os valores) ----------
-- select vault.create_secret('<chave publica VAPID>', 'vapid_publico');
-- select vault.create_secret('<chave privada VAPID>', 'vapid_privado');
-- select vault.create_secret('<texto aleatório comprido>', 'push_segredo');
-- select vault.create_secret('https://<ref>.supabase.co/functions/v1/push', 'push_url');
