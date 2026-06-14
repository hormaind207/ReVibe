-- ============================================================================
-- 버그 제보: submit (rate-limited) + admin list (dev key)
-- Supabase SQL Editor에서 1회 실행하세요.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_nickname text,
  app_version       text,
  user_agent        text,
  body              text NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 500),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_created_at_idx ON public.bug_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS bug_reports_user_created_idx ON public.bug_reports (user_id, created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
-- No policies: direct client access denied; RPC only.

CREATE OR REPLACE FUNCTION public.submit_bug_report(
  p_body text,
  p_reporter_nickname text DEFAULT NULL,
  p_app_version text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_body text;
  v_count int;
  v_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  v_body := trim(coalesce(p_body, ''));
  IF char_length(v_body) < 1 THEN
    RAISE EXCEPTION 'empty_body';
  END IF;
  IF char_length(v_body) > 500 THEN
    RAISE EXCEPTION 'too_long';
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.bug_reports
  WHERE user_id = v_uid
    AND created_at > now() - interval '24 hours';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  INSERT INTO public.bug_reports (
    user_id,
    reporter_nickname,
    app_version,
    user_agent,
    body
  ) VALUES (
    v_uid,
    nullif(trim(coalesce(p_reporter_nickname, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), ''),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 512),
    v_body
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_bug_reports(p_dev_key text)
RETURNS TABLE (
  id uuid,
  body text,
  reporter_nickname text,
  app_version text,
  user_agent text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT
      b.id,
      b.body,
      b.reporter_nickname,
      b.app_version,
      b.user_agent,
      b.created_at
    FROM public.bug_reports b
    ORDER BY b.created_at DESC
    LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_bug_report(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_bug_reports(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_bug_report(
  p_dev_key text,
  p_report_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.bug_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_bug_report(text, uuid) TO anon, authenticated;

-- ============================================================================
-- 기존 1000자 제한 DB 업그레이드 (이미 bug_reports 테이블이 있을 때만 실행)
-- ============================================================================
-- ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_body_check;
-- ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_body_check
--   CHECK (char_length(body) >= 1 AND char_length(body) <= 500);
-- 위 두 줄 실행 후 submit_bug_report 함수(CREATE OR REPLACE)만 다시 실행하세요.
