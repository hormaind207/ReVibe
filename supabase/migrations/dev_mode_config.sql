-- ============================================================================
-- 개발자 모드 dev key 설정 (하드코딩 '0409' 제거)
-- ranking_system / admin_moderation 실행 후 1회 실행
-- INSERT INTO admin_config (dev_key) VALUES ('your-key-from-env-local');
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_config (
  id       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dev_key  text NOT NULL
);

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
-- 클라이언트 직접 접근 없음 (정책 없음 = deny all)

CREATE OR REPLACE FUNCTION public.validate_dev_key(p_dev_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_config c
    WHERE c.dev_key = p_dev_key
  );
$$;

REVOKE ALL ON FUNCTION public.validate_dev_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_dev_key(text) TO anon, authenticated;

-- admin_moderation RPC — validate_dev_key 사용
CREATE OR REPLACE FUNCTION public.admin_list_hidden_templates(p_dev_key text)
RETURNS TABLE (
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
      coalesce(p.nickname, '익명') AS nickname
    FROM public.templates t
    LEFT JOIN public.profiles p ON p.id = t.owner_id
    WHERE t.hidden = true
    ORDER BY t.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_template(p_dev_key text, p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.templates
  SET hidden = false, report_count = 0, updated_at = now()
  WHERE id = p_template_id AND hidden = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or not hidden';
  END IF;
  UPDATE public.template_reports
  SET resolved = true
  WHERE template_id = p_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_template(p_dev_key text, p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.templates WHERE id = p_template_id AND hidden = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or not hidden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_hidden_templates(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_template(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_template(text, uuid) TO anon, authenticated;
