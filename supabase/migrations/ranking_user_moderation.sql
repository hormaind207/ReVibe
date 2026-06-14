-- ============================================================================
-- 랭킹 사용자 차단 (개발자 모드)
-- dev_mode_config.sql + ranking_system_ties_and_likes.sql 실행 후 1회 실행
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ranking_hidden boolean NOT NULL DEFAULT false;

-- ── 리더보드: ranking_hidden 제외 ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard(limit_n int DEFAULT 10)
RETURNS TABLE (
  rank         bigint,
  user_id      uuid,
  nickname     text,
  trophy_count int,
  score        int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      RANK() OVER (ORDER BY ls.score DESC) AS rank,
      ls.user_id,
      COALESCE(p.nickname, '익명') AS nickname,
      COALESCE(p.trophy_count, 0) AS trophy_count,
      ls.score
    FROM public.league_scores ls
    LEFT JOIN public.profiles p ON p.id = ls.user_id
    WHERE ls.week_start = public.current_week_start()
      AND ls.score >= 5
      AND COALESCE(p.ranking_hidden, false) = false
  )
  SELECT rank, user_id, nickname, trophy_count, score
  FROM ranked
  WHERE rank <= limit_n
  ORDER BY rank ASC, score DESC, nickname ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard(int) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_my_weekly_rank();

CREATE FUNCTION public.get_my_weekly_rank()
RETURNS TABLE (
  rank             bigint,
  score            int,
  eligible         boolean,
  ranking_blocked  boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_profile AS (
    SELECT COALESCE((
      SELECT p.ranking_hidden FROM public.profiles p WHERE p.id = auth.uid()
    ), false) AS ranking_hidden
  ),
  my_score AS (
    SELECT COALESCE((
      SELECT ls.score
      FROM public.league_scores ls
      WHERE ls.user_id = auth.uid()
        AND ls.week_start = public.current_week_start()
    ), 0) AS score
  ),
  ranked AS (
    SELECT
      ls.user_id,
      ls.score,
      RANK() OVER (ORDER BY ls.score DESC) AS rank
    FROM public.league_scores ls
    LEFT JOIN public.profiles p ON p.id = ls.user_id
    WHERE ls.week_start = public.current_week_start()
      AND ls.score >= 5
      AND COALESCE(p.ranking_hidden, false) = false
  )
  SELECT
    CASE WHEN mp.ranking_hidden THEN NULL ELSE r.rank END,
    ms.score,
    (ms.score >= 5) AND NOT mp.ranking_hidden AS eligible,
    mp.ranking_hidden AS ranking_blocked
  FROM my_score ms
  CROSS JOIN my_profile mp
  LEFT JOIN ranked r ON r.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_weekly_rank() TO authenticated;

CREATE OR REPLACE FUNCTION public.search_profiles(q text)
RETURNS TABLE (
  user_id      uuid,
  nickname     text,
  trophy_count int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.nickname,
    COALESCE(p.trophy_count, 0) AS trophy_count
  FROM public.profiles p
  WHERE p.nickname ILIKE '%' || q || '%'
    AND p.id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000')
    AND COALESCE(p.ranking_hidden, false) = false
  ORDER BY p.nickname ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- ── 개발자: 랭킹 차단 관리 RPC ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_ranking_blocked_users(p_dev_key text)
RETURNS TABLE (
  user_id    uuid,
  nickname   text,
  blocked_at timestamptz
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
      p.id,
      COALESCE(p.nickname, '익명'),
      p.updated_at
    FROM public.profiles p
    WHERE p.ranking_hidden = true
    ORDER BY p.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_hide_ranking_user(p_dev_key text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
  SET ranking_hidden = true, updated_at = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  INSERT INTO public.league_notifications (user_id, kind, week_start, message)
  VALUES (
    p_user_id,
    'ranking_blocked',
    public.current_week_start(),
    '랭킹에서 차단되었습니다. 문의가 필요하면 운영자에게 연락해 주세요.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unhide_ranking_user(p_dev_key text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_dev_key(p_dev_key) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.profiles
  SET ranking_hidden = false, updated_at = now()
  WHERE id = p_user_id AND ranking_hidden = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or not blocked';
  END IF;
END;
$$;

-- dev 모드 랭킹 관리용 검색 (차단 여부 포함, hidden도 검색 가능)
CREATE OR REPLACE FUNCTION public.admin_search_profiles(p_dev_key text, q text)
RETURNS TABLE (
  user_id         uuid,
  nickname        text,
  trophy_count    int,
  ranking_hidden  boolean
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
      p.id,
      COALESCE(p.nickname, '익명'),
      COALESCE(p.trophy_count, 0),
      COALESCE(p.ranking_hidden, false)
    FROM public.profiles p
    WHERE p.nickname ILIKE '%' || q || '%'
    ORDER BY p.nickname ASC
    LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_ranking_blocked_users(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hide_ranking_user(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unhide_ranking_user(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(text, text) TO authenticated;
