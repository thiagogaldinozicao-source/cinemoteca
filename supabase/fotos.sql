-- Cinemoteca: foto no perfil.
-- Arquivo no Storage: bucket público "avatares", um por pessoa ({user_id}.jpg, ~20 KB).
-- Na tabela perfis fica só o caminho com versão ("{user_id}.jpg?v=123"), null = sem foto.

alter table public.perfis add column if not exists foto text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 204800, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 204800, allowed_mime_types = array['image/jpeg'];

-- Cada um só mexe no próprio arquivo (ver pelo link público não precisa de regra).
drop policy if exists "avatar: ve o proprio" on storage.objects;
drop policy if exists "avatar: sobe o proprio" on storage.objects;
drop policy if exists "avatar: troca o proprio" on storage.objects;
drop policy if exists "avatar: apaga o proprio" on storage.objects;
create policy "avatar: ve o proprio" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and name = (select auth.uid())::text || '.jpg');
create policy "avatar: sobe o proprio" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and name = (select auth.uid())::text || '.jpg');
create policy "avatar: troca o proprio" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and name = (select auth.uid())::text || '.jpg')
  with check (bucket_id = 'avatares' and name = (select auth.uid())::text || '.jpg');
create policy "avatar: apaga o proprio" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and name = (select auth.uid())::text || '.jpg');

-- Grava (v = número da versão) ou tira a foto (v null).
create or replace function public.salvar_foto(v bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare f text;
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  f := case when v is null then null else auth.uid()::text || '.jpg?v=' || v end;
  update public.perfis set foto = f where user_id = auth.uid();
  return f;
end $$;
revoke all on function public.salvar_foto(bigint) from public, anon;
grant execute on function public.salvar_foto(bigint) to authenticated;

-- Funções que agora devolvem a foto também (muda o formato, então recria).
drop function if exists public.meu_perfil();
drop function if exists public.ver_convite(text);
drop function if exists public.meus_amigos();
drop function if exists public.minhas_indicacoes();

create function public.meu_perfil() returns table (nome text, codigo text, foto text)
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
  return query select p.nome, p.codigo, p.foto from public.perfis p where p.user_id = me;
end $$;

create function public.ver_convite(cod text) returns table (user_id uuid, nome text, ja_amigos boolean, foto text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.nome, public.sao_amigos(p.user_id, auth.uid()), p.foto
  from public.perfis p
  where auth.uid() is not null
    and p.codigo = upper(regexp_replace(cod, '[^A-Za-z0-9]', '', 'g'))
$$;

create function public.meus_amigos() returns table (user_id uuid, nome text, desde timestamptz, foto text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.nome, z.created_at, p.foto
  from public.amizades z
  join public.perfis p on p.user_id = case when z.a = auth.uid() then z.b else z.a end
  where auth.uid() in (z.a, z.b)
  order by p.nome
$$;

create function public.minhas_indicacoes() returns table
  (id bigint, de uuid, nome text, key text, data jsonb, msg text, estado text, created_at timestamptz, foto text)
language sql stable security definer set search_path = '' as $$
  select x.id, x.de, coalesce(p.nome, 'Amigo'), x.key, x.data, x.msg, x.estado, x.created_at, p.foto
  from public.indicacoes x left join public.perfis p on p.user_id = x.de
  where x.para = auth.uid() and x.estado <> 'dispensada'
  order by x.created_at desc
  limit 200
$$;

create or replace function public.lista_do_amigo(amigo uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.sao_amigos(auth.uid(), amigo) then raise exception 'nao sao amigos'; end if;
  return jsonb_build_object(
    'nome', (select nome from public.perfis where user_id = amigo),
    'foto', (select foto from public.perfis where user_id = amigo),
    'gostos', (select data from public.gostos where user_id = amigo),
    'items', coalesce((select jsonb_agg(i.data - 'memo' - 'order') from public.items i
                       where i.user_id = amigo and not i.deleted), '[]'::jsonb)
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array['meu_perfil()', 'ver_convite(text)', 'meus_amigos()', 'minhas_indicacoes()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
