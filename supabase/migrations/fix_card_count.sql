-- ============================================================================
-- 마이그레이션: 카드 수 +1 버그 수정
-- Supabase SQL Editor에서 1회 실행하세요.
-- ============================================================================

-- 1. 트리거 함수 교체
--    버그 원인: AFTER INSERT 트리거에서 count(*) 결과에 새 행이 이미 포함되어 있음에도
--    card_count = cnt + 1 로 업데이트해 항상 1 많이 카운팅됨.
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

-- 2. 기존 데이터 보정: 실제 카드 수로 card_count 갱신
update public.templates t
set card_count = (
  select count(*) from public.template_cards c where c.template_id = t.id
);
