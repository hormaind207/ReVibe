-- ============================================================================
-- ReVibe Marketplace (학습 템플릿 공유) — Supabase schema
-- Run this whole file in: Supabase Dashboard > SQL Editor > New query > Run
-- Re-running is safe (idempotent where practical).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles : 게시자 신원 (Google 표시 이름 = nickname)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null default '익명',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. templates : 카드 모음 (단계/스택 없음, 카드 직접 보유)
-- ----------------------------------------------------------------------------
create table if not exists public.templates (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  icon            text not null default 'book',
  color           text,                 -- tailwind bg class (이미지 없을 때)
  image_url       text,                 -- Storage public URL (색상 대신 배경 이미지)
  card_count      int  not null default 0,
  like_count      int  not null default 0,
  favorite_count  int  not null default 0,
  report_count    int  not null default 0,
  hidden          boolean not null default false,  -- 신고 누적 3회 시 자동 숨김
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists templates_owner_idx   on public.templates (owner_id);
create index if not exists templates_likes_idx    on public.templates (like_count desc);
create index if not exists templates_created_idx  on public.templates (created_at desc);

-- ----------------------------------------------------------------------------
-- 3. template_cards : 템플릿에 속한 카드 (최대 1000장)
-- ----------------------------------------------------------------------------
create table if not exists public.template_cards (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.templates (id) on delete cascade,
  front        text not null,
  back         text not null,
  position     int  not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists template_cards_template_idx on public.template_cards (template_id, position);

-- ----------------------------------------------------------------------------
-- 4. template_hashtags : 해시태그 (정규화 저장, '#' 제외 소문자)
-- ----------------------------------------------------------------------------
create table if not exists public.template_hashtags (
  template_id  uuid not null references public.templates (id) on delete cascade,
  tag          text not null,
  primary key (template_id, tag)
);

create index if not exists template_hashtags_tag_idx on public.template_hashtags (tag);

-- ----------------------------------------------------------------------------
-- 5. likes / favorites / reports : 1인 1행 (uid 기준)
-- ----------------------------------------------------------------------------
create table if not exists public.template_likes (
  template_id  uuid not null references public.templates (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (template_id, user_id)
);

create table if not exists public.template_favorites (
  template_id  uuid not null references public.templates (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (template_id, user_id)
);

create table if not exists public.template_reports (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.templates (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  reason       text,
  resolved     boolean not null default false,  -- 운영자(나)가 검토 후 처리
  created_at   timestamptz not null default now(),
  unique (template_id, user_id)
);

create index if not exists template_reports_open_idx on public.template_reports (resolved) where resolved = false;

-- ============================================================================
-- 6. Triggers : 카운터 자동 갱신 + 신고 3회 숨김 + 1000장 제한
-- ============================================================================

-- helper: 비익명(정식 Google 로그인) 여부
create or replace function public.is_full_user()
returns boolean
language sql stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- likes counter
create or replace function public.tg_template_likes_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.templates set like_count = like_count + 1 where id = new.template_id;
  elsif tg_op = 'DELETE' then
    update public.templates set like_count = greatest(like_count - 1, 0) where id = old.template_id;
  end if;
  return null;
end; $$;

drop trigger if exists template_likes_count on public.template_likes;
create trigger template_likes_count
  after insert or delete on public.template_likes
  for each row execute function public.tg_template_likes_count();

-- favorites counter
create or replace function public.tg_template_favorites_count()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    update public.templates set favorite_count = favorite_count + 1 where id = new.template_id;
  elsif tg_op = 'DELETE' then
    update public.templates set favorite_count = greatest(favorite_count - 1, 0) where id = old.template_id;
  end if;
  return null;
end; $$;

drop trigger if exists template_favorites_count on public.template_favorites;
create trigger template_favorites_count
  after insert or delete on public.template_favorites
  for each row execute function public.tg_template_favorites_count();

-- reports counter + auto-hide at 3
create or replace function public.tg_template_reports_count()
returns trigger language plpgsql security definer as $$
declare
  open_count int;
begin
  select count(*) into open_count
  from public.template_reports
  where template_id = coalesce(new.template_id, old.template_id) and resolved = false;

  update public.templates
  set report_count = open_count,
      hidden = (open_count >= 3)
  where id = coalesce(new.template_id, old.template_id);
  return null;
end; $$;

drop trigger if exists template_reports_count on public.template_reports;
create trigger template_reports_count
  after insert or update or delete on public.template_reports
  for each row execute function public.tg_template_reports_count();

-- card count maintenance + 1000 limit guard
-- NOTE: AFTER INSERT이므로 count(*)에 이미 새 행이 포함됨. cnt 그대로 사용.
create or replace function public.tg_template_cards_count()
returns trigger language plpgsql security definer as $$
declare
  cnt int;
begin
  if tg_op = 'INSERT' then
    select count(*) into cnt from public.template_cards where template_id = new.template_id;
    if cnt > 1000 then
      raise exception '한 템플릿에는 최대 1000장까지만 추가할 수 있습니다.';
    end if;
    update public.templates set card_count = cnt, updated_at = now() where id = new.template_id;
  elsif tg_op = 'DELETE' then
    select count(*) into cnt from public.template_cards where template_id = old.template_id;
    update public.templates set card_count = cnt, updated_at = now() where id = old.template_id;
  end if;
  return null;
end; $$;

drop trigger if exists template_cards_count on public.template_cards;
create trigger template_cards_count
  after insert or delete on public.template_cards
  for each row execute function public.tg_template_cards_count();

-- ============================================================================
-- 7. RPC : 해시태그 자동완성 제안 ('#영' → '영어')
-- ============================================================================
create or replace function public.suggest_hashtags(prefix text)
returns table (tag text, cnt bigint)
language sql stable
as $$
  select h.tag, count(*) as cnt
  from public.template_hashtags h
  join public.templates t on t.id = h.template_id and t.hidden = false
  where h.tag ilike prefix || '%'
  group by h.tag
  order by cnt desc, h.tag asc
  limit 10
$$;

-- 마켓 홈: 템플릿 3개 이상인 해시태그 목록
create or replace function public.popular_hashtags(min_count int default 3)
returns table (tag text, cnt bigint)
language sql stable
as $$
  select h.tag, count(*) as cnt
  from public.template_hashtags h
  join public.templates t on t.id = h.template_id and t.hidden = false
  group by h.tag
  having count(*) >= min_count
  order by cnt desc, h.tag asc
$$;

-- ============================================================================
-- 8. RLS Policies
-- ============================================================================
alter table public.profiles          enable row level security;
alter table public.templates         enable row level security;
alter table public.template_cards    enable row level security;
alter table public.template_hashtags enable row level security;
alter table public.template_likes    enable row level security;
alter table public.template_favorites enable row level security;
alter table public.template_reports  enable row level security;

-- profiles: 누구나 읽기, 본인만 upsert
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_upsert on public.profiles;
create policy profiles_upsert on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- templates: 공개(숨김 아님) 또는 본인 것 읽기 / 정식 유저 본인만 쓰기
drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates
  for select using (hidden = false or owner_id = auth.uid());
drop policy if exists templates_insert on public.templates;
create policy templates_insert on public.templates
  for insert with check (owner_id = auth.uid() and public.is_full_user());
drop policy if exists templates_update on public.templates;
create policy templates_update on public.templates
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists templates_delete on public.templates;
create policy templates_delete on public.templates
  for delete using (owner_id = auth.uid());

-- template_cards: 부모 템플릿이 보이면 읽기 / 소유자만 쓰기
drop policy if exists template_cards_select on public.template_cards;
create policy template_cards_select on public.template_cards
  for select using (exists (
    select 1 from public.templates t
    where t.id = template_id and (t.hidden = false or t.owner_id = auth.uid())
  ));
drop policy if exists template_cards_write on public.template_cards;
create policy template_cards_write on public.template_cards
  for all using (exists (
    select 1 from public.templates t where t.id = template_id and t.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.templates t where t.id = template_id and t.owner_id = auth.uid()
  ));

-- template_hashtags: 읽기 공개 / 소유자만 쓰기
drop policy if exists template_hashtags_select on public.template_hashtags;
create policy template_hashtags_select on public.template_hashtags for select using (true);
drop policy if exists template_hashtags_write on public.template_hashtags;
create policy template_hashtags_write on public.template_hashtags
  for all using (exists (
    select 1 from public.templates t where t.id = template_id and t.owner_id = auth.uid()
  )) with check (exists (
    select 1 from public.templates t where t.id = template_id and t.owner_id = auth.uid()
  ));

-- likes / favorites / reports: 본인 행만 (익명 포함 가능)
drop policy if exists template_likes_select on public.template_likes;
create policy template_likes_select on public.template_likes for select using (true);
drop policy if exists template_likes_write on public.template_likes;
create policy template_likes_write on public.template_likes
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.templates t
      where t.id = template_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists template_favorites_select on public.template_favorites;
create policy template_favorites_select on public.template_favorites for select using (user_id = auth.uid());
drop policy if exists template_favorites_write on public.template_favorites;
create policy template_favorites_write on public.template_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists template_reports_select on public.template_reports;
create policy template_reports_select on public.template_reports for select using (user_id = auth.uid());
drop policy if exists template_reports_write on public.template_reports;
create policy template_reports_write on public.template_reports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================================
-- 9. Storage : template-images 버킷 (공개 읽기, 인증 업로드)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('template-images', 'template-images', true)
on conflict (id) do nothing;

drop policy if exists template_images_read on storage.objects;
create policy template_images_read on storage.objects
  for select using (bucket_id = 'template-images');

drop policy if exists template_images_insert on storage.objects;
create policy template_images_insert on storage.objects
  for insert with check (bucket_id = 'template-images' and auth.uid() is not null);

drop policy if exists template_images_update on storage.objects;
create policy template_images_update on storage.objects
  for update using (bucket_id = 'template-images' and owner = auth.uid());

drop policy if exists template_images_delete on storage.objects;
create policy template_images_delete on storage.objects
  for delete using (bucket_id = 'template-images' and owner = auth.uid());

-- ============================================================================
-- 끝. (운영: 신고 검토 — select * from public.templates where hidden = true;)
-- ============================================================================
