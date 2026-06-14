-- ============================================================================
-- 랭킹 자발적 참여 (ranking_opt_in) — 기본 true
-- ranking_user_moderation.sql 실행 후 1회 실행
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ranking_opt_in boolean NOT NULL DEFAULT true;

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
      AND COALESCE(p.ranking_opt_in, true) = true
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
  ranking_blocked  boolean,
  ranking_opted_out boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_profile AS (
    SELECT
      COALESCE((
        SELECT p.ranking_hidden FROM public.profiles p WHERE p.id = auth.uid()
      ), false) AS ranking_hidden,
      NOT COALESCE((
        SELECT p.ranking_opt_in FROM public.profiles p WHERE p.id = auth.uid()
      ), true) AS ranking_opted_out
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
      AND COALESCE(p.ranking_opt_in, true) = true
  )
  SELECT
    CASE WHEN mp.ranking_hidden OR mp.ranking_opted_out THEN NULL ELSE r.rank END,
    ms.score,
    (ms.score >= 5) AND NOT mp.ranking_hidden AND NOT mp.ranking_opted_out AS eligible,
    mp.ranking_hidden AS ranking_blocked,
    mp.ranking_opted_out AS ranking_opted_out
  FROM my_score ms
  CROSS JOIN my_profile mp
  LEFT JOIN ranked r ON r.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_weekly_rank() TO authenticated;
