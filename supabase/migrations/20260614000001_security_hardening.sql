-- ============================================================================
-- 보안 강화 (배포 전 pass 1)
-- 기존 마이그레이션을 수정하지 않고 추가로 1회 실행하는 멱등(idempotent) 패치.
-- 적용 순서: schema.sql, ranking_system.sql, push_notifications.sql,
--           dev_mode_config.sql, bug_reports.sql,
--           ranking_user_moderation.sql, ranking_opt_in.sql,
--           profile_avatar_and_cloud_reset.sql 이후 실행하세요.
--
-- 다루는 내용:
--  1) league_scores 직접 쓰기 차단 (RPC/트리거 전용)
--  2) add_league_score: delta 상한(clamp) + anon 권한 회수
--  3) templates 보호 컬럼 변경 차단 트리거 (카운터/숨김/소유자)
--  4) profiles 보호 컬럼 변경 차단 트리거 (trophy_count/ranking_hidden)
--  5) push 알림 서비스 전용 RPC 권한 잠금 (service_role 전용)
--  6) admin RPC anon 권한 회수
--  7) storage template-images 경로/용량/MIME 제한
--  8) 신고 자동 숨김 sticky 처리 (신고 삭제로 숨김 해제 우회 차단)
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. league_scores : 클라이언트 직접 INSERT/UPDATE 차단
--    점수는 add_league_score RPC와 좋아요 트리거(SECURITY DEFINER)로만 적립.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS league_scores_insert ON public.league_scores;
DROP POLICY IF EXISTS league_scores_update ON public.league_scores;
-- league_scores_select(공개 읽기)은 랭킹 기능상 유지합니다.


-- ----------------------------------------------------------------------------
-- 2. add_league_score : delta 상한(clamp) + 익명/비인증 차단
--    정상 사용 delta: streak=10, card_review=리뷰카드수, graduation=합격*2.
--    단일 호출 폭증(예: 999999) 방지를 위해 1000으로 clamp.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_league_score(delta int, reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ws  date := public.current_week_start();
  d   int  := delta;
BEGIN
  IF uid IS NULL OR d <= 0 THEN RETURN; END IF;
  -- 익명 사용자 제외
  IF (auth.jwt() ->> 'is_anonymous')::boolean IS TRUE THEN RETURN; END IF;

  -- 단일 호출 상한 (남용 방지). 정상 사용값은 이 범위 안에 들어옵니다.
  IF d > 1000 THEN d := 1000; END IF;

  INSERT INTO public.league_scores (user_id, week_start, score, updated_at)
  VALUES (uid, ws, d, now())
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET
    score = public.league_scores.score + EXCLUDED.score,
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_league_score(int, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.add_league_score(int, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. templates : 보호 컬럼(카운터/숨김/소유자) 클라이언트 변경 차단
--    일반 클라이언트(anon/authenticated)의 UPDATE에서는 보호 컬럼을 OLD 값으로
--    되돌립니다. 카운터 트리거/관리자 RPC(SECURITY DEFINER=postgres)는 영향 없음.
--    클라이언트 정상 수정(name/icon/color/image_url)은 그대로 허용됩니다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_protect_template_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.owner_id       := OLD.owner_id;
    NEW.card_count     := OLD.card_count;
    NEW.like_count     := OLD.like_count;
    NEW.favorite_count := OLD.favorite_count;
    NEW.report_count   := OLD.report_count;
    NEW.hidden         := OLD.hidden;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_template_columns ON public.templates;
CREATE TRIGGER protect_template_columns
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_template_columns();


-- ----------------------------------------------------------------------------
-- 4. profiles : 보호 컬럼(trophy_count/ranking_hidden) 클라이언트 변경 차단
--    nickname/avatar_url/avatar_emoji/ranking_opt_in 등 일반 수정은 그대로 허용.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.id             := OLD.id;
    NEW.trophy_count   := OLD.trophy_count;
    NEW.ranking_hidden := OLD.ranking_hidden;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_profile_columns();


-- ----------------------------------------------------------------------------
-- 5. push 알림 서비스 전용 RPC : PUBLIC/anon/authenticated 권한 회수
--    Edge Function(service_role)에서만 호출되어야 하는 함수들.
--    소유자(postgres)·트리거(SECURITY DEFINER)는 영향 없음.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'enqueue_push_notification(uuid, text, text, text, jsonb, text)',
    'get_users_for_scheduled_notifications(int)',
    'get_notification_dispatch_batch()',
    'get_review_snapshot_for_user(uuid, date)',
    'get_streak_snapshot_for_user(uuid, date)',
    'get_pending_push_queue(int)',
    'get_push_subscriptions_for_user(uuid)',
    'mark_push_queue_processed(uuid[])',
    'delete_review_snapshot_after_send(uuid, date)',
    'delete_stale_notification_data()',
    'delete_push_subscription_by_id(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role;', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip (not found): %', fn;
    END;
  END LOOP;
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. admin/dev RPC : anon 권한 회수 (인증된 개발자만 dev key 사용)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'validate_dev_key(text)',
    'admin_list_hidden_templates(text)',
    'admin_restore_template(text, uuid)',
    'admin_purge_template(text, uuid)',
    'admin_list_bug_reports(text)',
    'admin_delete_bug_report(text, uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon;', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip (not found): %', fn;
    END;
  END LOOP;
END;
$$;


-- ----------------------------------------------------------------------------
-- 7. storage : template-images 업로드 제한
--    - 본인 폴더(<uid>/...)에만 업로드 가능
--    - 용량 2MB, webp/jpeg/png 만 허용
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS template_images_insert ON storage.objects;
CREATE POLICY template_images_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'template-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

UPDATE storage.buckets
SET file_size_limit   = 2097152,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
WHERE id = 'template-images';


-- ----------------------------------------------------------------------------
-- 8. 신고 자동 숨김 sticky : 한번 숨겨지면 신고 삭제로 자동 해제되지 않음
--    (해제는 관리자 admin_restore_template 으로만 가능)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_template_reports_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  open_count int;
BEGIN
  SELECT count(*) INTO open_count
  FROM public.template_reports
  WHERE template_id = COALESCE(NEW.template_id, OLD.template_id) AND resolved = false;

  UPDATE public.templates
  SET report_count = open_count,
      -- 한번 숨김(true)되면 유지; open_count가 줄어도 자동 해제되지 않음
      hidden = (hidden OR open_count >= 3)
  WHERE id = COALESCE(NEW.template_id, OLD.template_id);
  RETURN NULL;
END; $$;

-- 트리거 자체는 schema.sql에서 이미 생성됨(template_reports_count). 함수만 교체.

-- ============================================================================
-- 완료
-- ============================================================================
