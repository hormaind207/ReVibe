-- ============================================================================
-- 랭킹 RPC: ranking_hidden + ranking_opt_in 필터 통합 (idempotent)
-- get_friend_leaderboard / search_profiles에 opt_in 누락 보완
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_weekly_leaderboard(int);

CREATE FUNCTION public.get_weekly_leaderboard(limit_n int DEFAULT 10)
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
  rank              bigint,
  score             int,
  eligible          boolean,
  ranking_blocked   boolean,
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

DROP FUNCTION IF EXISTS public.get_friend_leaderboard();

CREATE FUNCTION public.get_friend_leaderboard()
RETURNS TABLE (
  rank         bigint,
  user_id      uuid,
  nickname     text,
  trophy_count int,
  score        int,
  is_self      bool,
  avatar_url   text,
  avatar_emoji text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT
      CASE WHEN requester_id = auth.uid() THEN addressee_id ELSE requester_id END AS friend_id
    FROM public.friendships
    WHERE (requester_id = auth.uid() OR addressee_id = auth.uid())
      AND status = 'accepted'
    UNION ALL
    SELECT auth.uid()
  ),
  scores AS (
    SELECT
      fi.friend_id AS user_id,
      COALESCE(ls.score, 0) AS score
    FROM friend_ids fi
    LEFT JOIN public.league_scores ls
      ON ls.user_id = fi.friend_id AND ls.week_start = public.current_week_start()
  ),
  ranked AS (
    SELECT
      RANK() OVER (ORDER BY s.score DESC) AS rank,
      s.user_id,
      s.score
    FROM scores s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.user_id = auth.uid()
       OR (
         COALESCE(p.ranking_hidden, false) = false
         AND COALESCE(p.ranking_opt_in, true) = true
       )
  )
  SELECT
    r.rank,
    r.user_id,
    COALESCE(p.nickname, '익명') AS nickname,
    COALESCE(p.trophy_count, 0) AS trophy_count,
    r.score,
    r.user_id = auth.uid() AS is_self,
    p.avatar_url,
    COALESCE(p.avatar_emoji, '🧠') AS avatar_emoji
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY r.rank ASC, r.score DESC, nickname ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.search_profiles(q text)
RETURNS TABLE (
  user_id      uuid,
  nickname     text,
  trophy_count int,
  avatar_url   text,
  avatar_emoji text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.nickname,
    COALESCE(p.trophy_count, 0) AS trophy_count,
    p.avatar_url,
    COALESCE(p.avatar_emoji, '🧠') AS avatar_emoji
  FROM public.profiles p
  WHERE p.nickname ILIKE '%' || q || '%'
    AND p.id <> auth.uid()
    AND COALESCE(p.ranking_hidden, false) = false
    AND COALESCE(p.ranking_opt_in, true) = true
  ORDER BY p.nickname ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;
