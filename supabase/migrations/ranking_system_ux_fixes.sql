-- ============================================================================
-- 랭킹 UX 수정 (이미 ranking_system.sql 실행 후 1회 실행)
-- ============================================================================

-- 1. get_my_weekly_rank: 5점 미만도 score 반환, rank는 eligible일 때만
--    반환 타입 변경 → 기존 함수 삭제 후 재생성
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
      ROW_NUMBER() OVER (ORDER BY score DESC) AS rank
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

-- 2. send_friend_request: rejected 상태면 삭제 후 재요청 허용
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

  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status IN ('pending', 'accepted')
      AND ((requester_id = uid AND addressee_id = to_uid)
        OR (requester_id = to_uid AND addressee_id = uid))
  ) THEN RETURN; END IF;

  DELETE FROM public.friendships
  WHERE status = 'rejected'
    AND ((requester_id = uid AND addressee_id = to_uid)
      OR (requester_id = to_uid AND addressee_id = uid));

  INSERT INTO public.friendships (requester_id, addressee_id, status)
  VALUES (uid, to_uid, 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;
