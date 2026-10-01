-- Cinemoteca: foto no perfil (rodar depois do amigos.sql).
-- As funções que devolvem a foto ficam no amigos.sql.
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

