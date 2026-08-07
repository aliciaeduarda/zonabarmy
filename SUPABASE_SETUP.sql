
create extension if not exists pgcrypto;

-- =========================================================
-- 1) TABELA PRINCIPAL DO SITE
-- =========================================================
create table if not exists public.barmy_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.barmy_store enable row level security;

drop policy if exists "barmy_store_public_read" on public.barmy_store;
drop policy if exists "barmy_store_admin_insert" on public.barmy_store;
drop policy if exists "barmy_store_admin_update" on public.barmy_store;
drop policy if exists "barmy_store_admin_delete" on public.barmy_store;

create policy "barmy_store_public_read" on public.barmy_store
for select to anon, authenticated using (true);

create policy "barmy_store_admin_insert" on public.barmy_store
for insert to authenticated with check (auth.uid() is not null);

create policy "barmy_store_admin_update" on public.barmy_store
for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "barmy_store_admin_delete" on public.barmy_store
for delete to authenticated using (auth.uid() is not null);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_barmy_store_updated_at on public.barmy_store;
create trigger set_barmy_store_updated_at
before update on public.barmy_store
for each row execute function public.set_updated_at();

-- =========================================================
-- 2) TABELA DE PROJETOS ENVIADOS PELO PÚBLICO
-- =========================================================
create table if not exists public.barmy_project_submissions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null,
  description text not null,
  event_date text not null,
  event_time text,
  address text not null,
  lat numeric not null,
  lng numeric not null,
  link text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.barmy_project_submissions enable row level security;

drop policy if exists "project_submissions_public_insert" on public.barmy_project_submissions;
drop policy if exists "project_submissions_admin_select" on public.barmy_project_submissions;
drop policy if exists "project_submissions_admin_update" on public.barmy_project_submissions;
drop policy if exists "project_submissions_admin_delete" on public.barmy_project_submissions;

create policy "project_submissions_public_insert" on public.barmy_project_submissions
for insert to anon, authenticated with check (status = 'pending');

create policy "project_submissions_admin_select" on public.barmy_project_submissions
for select to authenticated using (auth.uid() is not null);

create policy "project_submissions_admin_update" on public.barmy_project_submissions
for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "project_submissions_admin_delete" on public.barmy_project_submissions
for delete to authenticated using (auth.uid() is not null);

drop trigger if exists set_barmy_project_submissions_updated_at on public.barmy_project_submissions;
create trigger set_barmy_project_submissions_updated_at
before update on public.barmy_project_submissions
for each row execute function public.set_updated_at();

-- =========================================================
-- 3) STORAGE PARA FOTOS DO PAINEL ADM
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barmy-images',
  'barmy-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "barmy_images_public_read" on storage.objects;
drop policy if exists "barmy_images_admin_insert" on storage.objects;
drop policy if exists "barmy_images_admin_update" on storage.objects;
drop policy if exists "barmy_images_admin_delete" on storage.objects;

create policy "barmy_images_public_read" on storage.objects
for select to anon, authenticated using (bucket_id = 'barmy-images');

create policy "barmy_images_admin_insert" on storage.objects
for insert to authenticated with check (bucket_id = 'barmy-images' and auth.uid() is not null);

create policy "barmy_images_admin_update" on storage.objects
for update to authenticated using (bucket_id = 'barmy-images' and auth.uid() is not null)
with check (bucket_id = 'barmy-images' and auth.uid() is not null);

create policy "barmy_images_admin_delete" on storage.objects
for delete to authenticated using (bucket_id = 'barmy-images' and auth.uid() is not null);

-- =========================================================
-- 4) DADOS INICIAIS LEVES
-- =========================================================
insert into public.barmy_store(key,value) values
('settings', '{"site":"Zona BARMY","intro":"Central oficial para organizar projetos, rotas, checklists e informações para ARMYs em São Paulo.","shows":[["28/10/2026","Show 1","2026-10-28T20:00:00"],["30/10/2026","Show 2","2026-10-30T20:00:00"],["31/10/2026","Show 3","2026-10-31T20:00:00"]]}'::jsonb),
('projects', '[{"id":1,"title":"MorumBIS","type":"Estádio","desc":"Local dos shows em São Paulo.","date":"28, 30 e 31/10","time":"20:00","address":"Praça Roberto Gomes Pedrosa, 1 - Morumbi","lat":-23.60002,"lng":-46.72016,"status":"approved","featured":true}]'::jsonb),
('gates', '[{"id":1,"name":"Portão 15-A","sectors":"Setores superiores e áreas indicadas no mapa de acesso","desc":"Entrada de referência para organização. Confirme sempre no mapa oficial do evento.","sectorDetails":"Este portão dá acesso aos setores destacados na imagem. Use como guia visual para entender a região do estádio antes de sair.","arrivalTip":"Chegue com antecedência e confira se o show usará este acesso.","gatePhoto":"assets/img/setores-portao-15a.png","sectorImage":"assets/img/setores-portao-15a.png","lat":-23.5988,"lng":-46.7197,"active":true},{"id":2,"name":"Portão 4","sectors":"Setores a confirmar no mapa oficial do evento","desc":"Portão de referência. Atualize foto e setores pelo ADM.","sectorDetails":"Adicione aqui a imagem dos setores que este portão acessa.","arrivalTip":"Use somente como referência até sair o mapa oficial.","gatePhoto":"","sectorImage":"","lat":-23.6007,"lng":-46.7210,"active":true},{"id":3,"name":"Portão 5","sectors":"Setores a confirmar no mapa oficial do evento","desc":"Portão de referência.","sectorDetails":"Adicione aqui a imagem dos setores que este portão acessa.","arrivalTip":"Confirme entrada e fluxo no dia do show.","gatePhoto":"","sectorImage":"","lat":-23.6016,"lng":-46.7192,"active":true}]'::jsonb),
('mobilityCards', '[{"id":1,"title":"Horários da estação","tag":"metrô","desc":"Atualize aqui o primeiro/último trem, funcionamento especial e avisos da Linha 4–Amarela.","active":true},{"id":2,"title":"Pontos para motorista de app","tag":"app","desc":"Recomende pontos mais afastados da porta principal, iluminados e com fluxo de pessoas.","active":true},{"id":3,"title":"Bloqueios e vias","tag":"trânsito","desc":"Use este card para informar bloqueios oficiais, desvios, interdições e ruas de atenção.","active":true}]'::jsonb),
('mobilityRoads', '[{"id":1,"name":"Av. Jorge João Saad","status":"atenção","hours":"Ajustar no dia do show","desc":"Possível fluxo intenso por ser via próxima ao estádio. Confirmar bloqueios oficiais.","points":[[-23.5978,-46.7177],[-23.5991,-46.7187],[-23.6004,-46.7199]],"active":true}]'::jsonb),
('checklist', '["Ingresso digital salvo no celular","Documento de identidade","Power bank carregado","Screenshot da rota offline","Capa de chuva"]'::jsonb),
('links', '[]'::jsonb)
on conflict (key) do nothing;

-- =========================================================
-- 5) LIMPEZA OPCIONAL DE IMAGENS BASE64 ANTIGAS
-- Se o site ainda estiver pesado por imagens salvas antigas em base64,
-- descomente e rode as linhas abaixo. Depois envie as fotos de novo pelo painel.
-- =========================================================
-- update public.barmy_store set value = '[]'::jsonb where key = 'links';
-- update public.barmy_store set value = jsonb_set(value, '{0,gatePhoto}', '"assets/img/setores-portao-15a.png"') where key = 'gates';
-- update public.barmy_store set value = jsonb_set(value, '{0,sectorImage}', '"assets/img/setores-portao-15a.png"') where key = 'gates';

update public.barmy_store
set value = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(card->'items') = 'array' then card
      when jsonb_typeof(card->'products') = 'array' then
        (card - 'products') || jsonb_build_object('items',coalesce((select jsonb_agg(product || jsonb_build_object('type','product')) from jsonb_array_elements(card->'products') product),'[]'::jsonb))
      else card || jsonb_build_object('items','[]'::jsonb)
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(value) card
), updated_at = now()
where key = 'links' and jsonb_typeof(value) = 'array';

update public.barmy_store set value = value - 'gates', updated_at = now()
where key = 'guide' and jsonb_typeof(value) = 'object';
update public.barmy_store
set value = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(card->'gallery') = 'array' then card
      else card || jsonb_build_object('gallery','[]'::jsonb)
    end
  ), '[]'::jsonb)
  from jsonb_array_elements(value) card
), updated_at = now()
where key = 'links' and jsonb_typeof(value) = 'array';

create table if not exists public.barmy_page_views (
  id bigint generated by default as identity primary key,
  session_id text not null,
  page_name text not null,
  page_path text not null default '/',
  referrer_host text not null default '',
  device_type text not null default 'desconhecido',
  visited_at timestamptz not null default now()
);

create index if not exists barmy_page_views_visited_at_idx on public.barmy_page_views (visited_at desc);
create index if not exists barmy_page_views_page_name_idx on public.barmy_page_views (page_name);
create index if not exists barmy_page_views_session_id_idx on public.barmy_page_views (session_id);

alter table public.barmy_page_views enable row level security;

drop policy if exists "public_can_register_page_view" on public.barmy_page_views;
create policy "public_can_register_page_view" on public.barmy_page_views
for insert to anon, authenticated with check (true);

drop policy if exists "admin_can_read_page_views" on public.barmy_page_views;
create policy "admin_can_read_page_views" on public.barmy_page_views
for select to authenticated using (true);

drop policy if exists "admin_can_delete_page_views" on public.barmy_page_views;
create policy "admin_can_delete_page_views" on public.barmy_page_views
for delete to authenticated using (true);
