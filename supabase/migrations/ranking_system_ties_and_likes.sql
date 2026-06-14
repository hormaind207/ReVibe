-- ============================================================================
-- 랭킹 동점·트로피·자기 좋아요 수정
-- ranking_system.sql + ranking_system_ux_fixes.sql 실행 후 1회 실행
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. league_notifications — 트로피 무효(공동 1위 3명+) 알림
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.league_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  week_start date NOT NULL,
  message    text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_notifications_user_unread_idx
  ON public.league_notifications (user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.league_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS league_notifications_select ON public.league_notifications;
CREATE POLICY league_notifications_select ON public.league_notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS league_notifications_update ON public.league_notifications;
CREATE POLICY league_notifications_update ON public.league_notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. get_weekly_leaderboard — RANK() 동점 처리, 순위 기준 Top N
-- ----------------------------------------------------------------------------
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
  )
  SELECT rank, user_id, nickname, trophy_count, score
  FROM ranked
  WHERE rank <= limit_n
  ORDER BY rank ASC, score DESC, nickname ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard(int) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_my_weekly_rank — RANK() + eligible (반환 타입 동일, DROP 후 재생성)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_my_weekly_rank();

CREATE FUNCTION public.get_my_weekly_rank()
RETURNS TABLE (
  rank      bigint,
  score     int,
  eligible  boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_score AS (
    SELECT COALESCE((
      SELECT ls.score
      FROM public.league_scores ls
      WHERE ls.user_id = auth.uid()
        AND ls.week_start = public.current_week_start()
    ), 0) AS score
  ),
  ranked AS (
    SELECT
      user_id,
      score,
      RANK() OVER (ORDER BY score DESC) AS rank
    FROM public.league_scores
    WHERE week_start = public.current_week_start()
      AND score >= 5
  )
  SELECT
    r.rank,
    ms.score,
    (ms.score >= 5) AS eligible
  FROM my_score ms
  LEFT JOIN ranked r ON r.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_weekly_rank() TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. get_friend_leaderboard — RANK() 동점 처리
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_friend_leaderboard()
RETURNS TABLE (
  rank         bigint,
  user_id      uuid,
  nickname     text,
  trophy_count int,
  score        int,
  is_self      bool
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
    r.user_id = auth.uid() AS is_self
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY r.rank ASC, r.score DESC, nickname ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_leaderboard() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. process_weekly_trophy — 공동 1위 규칙 + 무효 알림
--    1명: 트로피 +1 | 2명: 둘 다 +1 | 3명+: 트로피 없음 + 알림
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_weekly_trophy(week_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_week   date := COALESCE(week_date, public.current_week_start() - 7);
  top_score     int;
  leader_count  int;
  void_message  text := '이번 주 리그 공동 1위가 3명 이상이어서 트로피가 수여되지 않았습니다.';
BEGIN
  SELECT MAX(score) INTO top_score
  FROM public.league_scores
  WHERE week_start = target_week AND score >= 5;

  IF top_score IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) INTO leader_count
  FROM public.league_scores
  WHERE week_start = target_week AND score = top_score;

  IF leader_count = 1 THEN
    UPDATE public.profiles
    SET trophy_count = trophy_count + 1, updated_at = now()
    WHERE id = (
      SELECT user_id FROM public.league_scores
      WHERE week_start = target_week AND score = top_score
      LIMIT 1
    );

  ELSIF leader_count = 2 THEN
    UPDATE public.profiles p
    SET trophy_count = p.trophy_count + 1, updated_at = now()
    FROM public.league_scores ls
    WHERE ls.week_start = target_week
      AND ls.score = top_score
      AND p.id = ls.user_id;

  ELSIF leader_count >= 3 THEN
    INSERT INTO public.league_notifications (user_id, kind, week_start, message)
    SELECT ls.user_id, 'trophy_void', target_week, void_message
    FROM public.league_scores ls
    WHERE ls.week_start = target_week AND ls.score = top_score;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_weekly_trophy(date) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. 알림 RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_league_notifications()
RETURNS TABLE (
  id         uuid,
  kind       text,
  week_start date,
  message    text,
  created_at timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, kind, week_start, message, created_at
  FROM public.league_notifications
  WHERE user_id = auth.uid() AND read_at IS NULL
  ORDER BY created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_league_notifications() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_league_notification_read(notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.league_notifications
  SET read_at = now()
  WHERE id = notification_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_league_notification_read(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. 자기 템플릿 좋아요 DB 차단 (RLS)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS template_likes_write ON public.template_likes;
CREATE POLICY template_likes_write ON public.template_likes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.templates t
      WHERE t.id = template_id AND t.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- 완료
-- ============================================================================
