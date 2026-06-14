-- ============================================================================
-- 랭킹 시스템 마이그레이션
-- Supabase SQL Editor에서 1회 실행하세요.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles 테이블에 trophy_count 컬럼 추가
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trophy_count int NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- 2. league_scores : 주간 리그 점수 (user_id + week_start 복합 PK)
--    week_start: 해당 주 월요일 날짜 (ISO week 기준)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.league_scores (
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start  date    NOT NULL,
  score       int     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS league_scores_week_score_idx
  ON public.league_scores (week_start, score DESC);

-- ----------------------------------------------------------------------------
-- 3. friendships : 친구 관계
--    status: 'pending' | 'accepted' | 'rejected'
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friendships (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text    NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships (addressee_id, status);
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_id, status);

-- ----------------------------------------------------------------------------
-- 4. RLS 활성화
-- ----------------------------------------------------------------------------
ALTER TABLE public.league_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships   ENABLE ROW LEVEL SECURITY;

-- league_scores: RPC로만 접근 (직접 읽기는 허용, 쓰기는 RPC security definer)
DROP POLICY IF EXISTS league_scores_select ON public.league_scores;
CREATE POLICY league_scores_select ON public.league_scores
  FOR SELECT USING (true);

DROP POLICY IF EXISTS league_scores_insert ON public.league_scores;
CREATE POLICY league_scores_insert ON public.league_scores
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS league_scores_update ON public.league_scores;
CREATE POLICY league_scores_update ON public.league_scores
  FOR UPDATE USING (user_id = auth.uid());

-- friendships: 당사자만 읽기/쓰기
DROP POLICY IF EXISTS friendships_select ON public.friendships;
CREATE POLICY friendships_select ON public.friendships
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS friendships_insert ON public.friendships;
CREATE POLICY friendships_insert ON public.friendships
  FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS friendships_update ON public.friendships;
CREATE POLICY friendships_update ON public.friendships
  FOR UPDATE USING (addressee_id = auth.uid());

DROP POLICY IF EXISTS friendships_delete ON public.friendships;
CREATE POLICY friendships_delete ON public.friendships
  FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. 현재 주 월요일 날짜 계산 헬퍼
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_week_start()
RETURNS date
LANGUAGE sql STABLE
AS $$
  SELECT date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: add_league_score — 현재 주 점수 누적 (auth.uid() 기준, 보안)
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
BEGIN
  IF uid IS NULL OR delta <= 0 THEN RETURN; END IF;
  -- 익명 사용자 제외
  IF (auth.jwt() ->> 'is_anonymous')::boolean IS TRUE THEN RETURN; END IF;

  INSERT INTO public.league_scores (user_id, week_start, score, updated_at)
  VALUES (uid, ws, delta, now())
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET
    score = public.league_scores.score + EXCLUDED.score,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_league_score(int, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 7. RPC: get_weekly_leaderboard — 상위 N명 (score >= 5인 사용자만)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard(limit_n int DEFAULT 10)
RETURNS TABLE (
  rank        bigint,
  user_id     uuid,
  nickname    text,
  trophy_count int,
  score       int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROW_NUMBER() OVER (ORDER BY ls.score DESC) AS rank,
    ls.user_id,
    COALESCE(p.nickname, '익명') AS nickname,
    COALESCE(p.trophy_count, 0) AS trophy_count,
    ls.score
  FROM public.league_scores ls
  LEFT JOIN public.profiles p ON p.id = ls.user_id
  WHERE ls.week_start = public.current_week_start()
    AND ls.score >= 5
  ORDER BY ls.score DESC
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard(int) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC: get_my_weekly_rank — 내 순위와 점수
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_weekly_rank()
RETURNS TABLE (
  rank  bigint,
  score int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      user_id,
      score,
      ROW_NUMBER() OVER (ORDER BY score DESC) AS rank
    FROM public.league_scores
    WHERE week_start = public.current_week_start()
      AND score >= 5
  )
  SELECT rank, score
  FROM ranked
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_weekly_rank() TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. RPC: process_weekly_trophy — 1위 트로피 수여 + (점수 보존, 신규 주 시작)
--    pg_cron에서 매주 일요일 24:00 KST(= 15:00 UTC)에 호출
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_weekly_trophy(week_date date DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_week date := COALESCE(week_date, public.current_week_start() - 7);
  winner_id   uuid;
  top_score   int;
BEGIN
  -- week_date 미지정 시 직전 주(월요일 기준) 처리 — cron은 월요일 00:00 KST에 호출
  SELECT user_id, score
  INTO winner_id, top_score
  FROM public.league_scores
  WHERE week_start = target_week
    AND score >= 5
  ORDER BY score DESC
  LIMIT 1;

  IF winner_id IS NOT NULL THEN
    UPDATE public.profiles
    SET trophy_count = trophy_count + 1,
        updated_at   = now()
    WHERE id = winner_id;
  END IF;
END;
$$;

-- pg_cron 전용 — 클라이언트에서 호출 불가 (트로피 조작 방지)
REVOKE EXECUTE ON FUNCTION public.process_weekly_trophy(date) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. RPC: search_profiles — 닉네임 검색 (친구 추가용)
-- ----------------------------------------------------------------------------
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
  ORDER BY p.nickname ASC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. RPC: send_friend_request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_friend_request(to_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR uid = to_uid THEN RETURN; END IF;
  -- 이미 관계가 있으면 무시 (양방향 확인)
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (requester_id = uid AND addressee_id = to_uid)
       OR (requester_id = to_uid AND addressee_id = uid)
  ) THEN RETURN; END IF;

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (uid, to_uid, 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 12. RPC: respond_friend_request — 수락/거절
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_friend_request(fid uuid, accept bool)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.friendships
  SET status = CASE WHEN accept THEN 'accepted' ELSE 'rejected' END
  WHERE id = fid
    AND addressee_id = auth.uid()
    AND status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, bool) TO authenticated;

-- ----------------------------------------------------------------------------
-- 13. RPC: get_pending_requests — 내가 받은 친구 요청 목록
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_requests()
RETURNS TABLE (
  id           uuid,
  requester_id uuid,
  nickname     text,
  trophy_count int,
  created_at   timestamptz
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.requester_id,
    COALESCE(p.nickname, '익명') AS nickname,
    COALESCE(p.trophy_count, 0) AS trophy_count,
    f.created_at
  FROM public.friendships f
  LEFT JOIN public.profiles p ON p.id = f.requester_id
  WHERE f.addressee_id = auth.uid()
    AND f.status = 'pending'
  ORDER BY f.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_requests() TO authenticated;

-- ----------------------------------------------------------------------------
-- 14. RPC: get_friend_leaderboard — 친구 + 나 자신 현재 주 점수
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
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY s.score DESC) AS rank,
    s.user_id,
    COALESCE(p.nickname, '익명') AS nickname,
    COALESCE(p.trophy_count, 0) AS trophy_count,
    s.score,
    s.user_id = auth.uid() AS is_self
  FROM scores s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.score DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_friend_leaderboard() TO authenticated;

-- ----------------------------------------------------------------------------
-- 15. 트리거: template_likes INSERT → 템플릿 소유자에게 +5점
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_league_score_on_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id  uuid;
  ws        date := public.current_week_start();
BEGIN
  -- 좋아요한 사람이 본인 템플릿이면 점수 안 줌
  SELECT t.owner_id INTO owner_id
  FROM public.templates t
  WHERE t.id = NEW.template_id;

  IF owner_id IS NULL OR owner_id = NEW.user_id THEN RETURN NULL; END IF;

  INSERT INTO public.league_scores (user_id, week_start, score, updated_at)
  VALUES (owner_id, ws, 5, now())
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET
    score = public.league_scores.score + 5,
    updated_at = now();

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS league_score_on_like ON public.template_likes;
CREATE TRIGGER league_score_on_like
  AFTER INSERT ON public.template_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_league_score_on_like();

-- ----------------------------------------------------------------------------
-- 16. pg_cron 스케줄 등록
--    pg_cron 익스텐션이 활성화된 경우에만 실행됩니다.
--    Supabase 대시보드 → Database → Extensions → pg_cron 활성화 후 실행하세요.
-- ----------------------------------------------------------------------------
-- SELECT cron.schedule(
--   'weekly-league-trophy',
--   '0 15 * * 0',
--   $$SELECT public.process_weekly_trophy((public.current_week_start() - interval '7 days')::date)$$
-- );

-- ============================================================================
-- 완료
-- ============================================================================
