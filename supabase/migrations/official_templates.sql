-- ============================================================================
-- 공식 템플릿 (is_official) — dev 모드 Admin 페르소나
-- dev_mode_config.sql 실행 후 1회 실행
-- ============================================================================

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS templates_official_idx
  ON public.templates (is_official, created_at DESC)
  WHERE is_official = true AND hidden = false;

-- 클라이언트 insert/update 시 is_official=true 차단
CREATE OR REPLACE FUNCTION public.templates_guard_is_official()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_official = true
       AND current_setting('revibe.allow_official', true) IS DISTINCT FROM '1' THEN
      NEW.is_official := false;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.is_official IS DISTINCT FROM OLD.is_official
       AND current_setting('revibe.allow_official', true) IS DISTINCT FROM '1' THEN
      NEW.is_official := OLD.is_official;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS templates_guard_is_official_trg ON public.templates;
CREATE TRIGGER templates_guard_is_official_trg
  BEFORE INSERT OR UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.templates_guard_is_official();

-- dev 모드에서 공식 템플릿 생성
CREATE OR REPLACE FUNCTION public.dev_create_official_template(
  p_dev_key   text,
  p_name      text,
  p_icon      text,
  p_color     text,
  p_image_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_uid IS NULL OR NOT public.is_full_user() THEN
    RAISE EXCEPTION 'full user required';
  END IF;
  PERFORM set_config('revibe.allow_official', '1', true);
  INSERT INTO public.templates (owner_id, name, icon, color, image_url, is_official)
  VALUES (v_uid, trim(p_name), p_icon, p_color, p_image_url, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dev_create_official_template(text, text, text, text, text) TO authenticated;
