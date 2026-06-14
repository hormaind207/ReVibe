-- ============================================================================
-- 프로필 아바타 + 클라우드 데이터 초기화 + 랭킹 아바타 표시
-- (선행 마이그레이션 없이 단독 실행 가능)
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS avatar_emoji text NOT NULL DEFAULT '🧠',
  ADD COLUMN IF NOT EXISTS ranking_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ranking_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trophy_count int NOT NULL DEFAULT 0;

-- 반환 타입(OUT 컬럼) 변경 시 CREATE OR REPLACE 불가 → 먼저 DROP
DROP FUNCTION IF EXISTS public.get_weekly_leaderboard(int);
DROP FUNCTION IF EXISTS public.get_friend_leaderboard();
DROP FUNCTION IF EXISTS public.search_profiles(text);

-- ── 리더보드: avatar_url / avatar_emoji 포함 ────────────────────────────────
CREATE FUNCTION public.get_weekly_leaderboard(limit_n int DEFAULT 10)
RETURNS TABLE (
  rank         bigint,
  user_id      uuid,
  nickname     text,
  trophy_count int,
  score        int,
  avatar_url   text,
  avatar_emoji text
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
      ls.score,
      p.avatar_url,
      COALESCE(p.avatar_emoji, '🧠') AS avatar_emoji
    FROM public.league_scores ls
    LEFT JOIN public.profiles p ON p.id = ls.user_id
    WHERE ls.week_start = public.current_week_start()
      AND ls.score >= 5
      AND COALESCE(p.ranking_hidden, false) = false
      AND COALESCE(p.ranking_opt_in, true) = true
  )
  SELECT rank, user_id, nickname, trophy_count, score, avatar_url, avatar_emoji
  FROM ranked
  WHERE rank <= limit_n
  ORDER BY rank ASC, score DESC, nickname ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard(int) TO anon, authenticated;

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

CREATE FUNCTION public.search_profiles(q text)
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
  ORDER BY p.nickname ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- ── 모든 데이터 삭제: 마켓플레이스 + 랭킹 클라우드 데이터 제거 ───────────────
CREATE OR REPLACE FUNCTION public.delete_user_cloud_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  DELETE FROM public.templates WHERE owner_id = uid;
  DELETE FROM public.template_likes WHERE user_id = uid;
  DELETE FROM public.template_favorites WHERE user_id = uid;
  DELETE FROM public.template_reports WHERE user_id = uid;

  DELETE FROM public.league_scores WHERE user_id = uid;
  DELETE FROM public.friendships WHERE requester_id = uid OR addressee_id = uid;
  DELETE FROM public.league_notifications WHERE user_id = uid;

  UPDATE public.profiles
  SET
    trophy_count = 0,
    ranking_opt_in = false,
    updated_at = now()
  WHERE id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_cloud_data() TO authenticated;
