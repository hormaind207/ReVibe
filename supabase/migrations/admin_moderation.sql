-- ============================================================================
-- 마이그레이션: 개발자 모드 숨김 템플릿 검토 RPC
-- Supabase SQL Editor에서 1회 실행하세요.
-- ============================================================================

-- 숨김 템플릿 목록 (운영자 검토용)
create or replace function public.admin_list_hidden_templates(p_dev_key text)
returns table (
  id uuid,
  owner_id uuid,
  name text,
  icon text,
  color text,
  image_url text,
  card_count int,
  like_count int,
  favorite_count int,
  report_count int,
  hidden boolean,
  created_at timestamptz,
  nickname text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dev_key is distinct from '0409' then
    raise exception 'forbidden';
  end if;
  return query
    select
      t.id,
      t.owner_id,
      t.name,
      t.icon,
      t.color,
      t.image_url,
      t.card_count,
      t.like_count,
      t.favorite_count,
      t.report_count,
      t.hidden,
      t.created_at,
      coalesce(p.nickname, '익명') as nickname
    from public.templates t
    left join public.profiles p on p.id = t.owner_id
    where t.hidden = true
    order by t.updated_at desc;
end;
$$;

-- 숨김 해제 (다시 공개)
create or replace function public.admin_restore_template(p_dev_key text, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dev_key is distinct from '0409' then
    raise exception 'forbidden';
  end if;
  update public.templates
  set hidden = false, report_count = 0, updated_at = now()
  where id = p_template_id and hidden = true;
  if not found then
    raise exception 'template not found or not hidden';
  end if;
  update public.template_reports
  set resolved = true
  where template_id = p_template_id;
end;
$$;

-- 완전 삭제
create or replace function public.admin_purge_template(p_dev_key text, p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_dev_key is distinct from '0409' then
    raise exception 'forbidden';
  end if;
  delete from public.templates where id = p_template_id and hidden = true;
  if not found then
    raise exception 'template not found or not hidden';
  end if;
end;
$$;

grant execute on function public.admin_list_hidden_templates(text) to anon, authenticated;
grant execute on function public.admin_restore_template(text, uuid) to anon, authenticated;
grant execute on function public.admin_purge_template(text, uuid) to anon, authenticated;
