-- Fix friend-overtaken push: UPDATE only, skip friends with no score row, ignore 0-vs-0 noise

CREATE OR REPLACE FUNCTION public.tg_enqueue_friend_overtaken()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  friend_rec record;
  old_score int;
  new_score int;
  friend_score int;
  friend_nickname text;
  ws date := public.current_week_start();
BEGIN
  IF NEW.week_start <> ws THEN RETURN NULL; END IF;

  old_score := OLD.score;
  new_score := NEW.score;
  IF new_score <= old_score THEN RETURN NULL; END IF;

  FOR friend_rec IN
    SELECT
      CASE WHEN f.requester_id = NEW.user_id THEN f.addressee_id ELSE f.requester_id END AS friend_id
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = NEW.user_id OR f.addressee_id = NEW.user_id)
  LOOP
    SELECT ls.score INTO friend_score
    FROM public.league_scores ls
    WHERE ls.user_id = friend_rec.friend_id AND ls.week_start = ws;

    IF friend_score IS NULL THEN CONTINUE; END IF;

    -- Require meaningful scores; skip 0→1 vs friend-at-0 false positives
    IF old_score = 0 AND friend_score = 0 THEN CONTINUE; END IF;

    IF old_score <= friend_score AND new_score > friend_score THEN
      SELECT COALESCE(p.nickname, '친구') INTO friend_nickname
      FROM public.profiles p WHERE p.id = NEW.user_id;

      PERFORM public.enqueue_push_notification(
        friend_rec.friend_id,
        'friend_overtaken',
        'ReVibe 랭킹',
        format('%s님이 이번 주 랭킹에서 추월했어요', friend_nickname),
        jsonb_build_object('overtaker_id', NEW.user_id, 'url', '/'),
        format('overtake:%s:%s:%s', NEW.user_id, friend_rec.friend_id, ws)
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_friend_overtaken ON public.league_scores;
CREATE TRIGGER enqueue_friend_overtaken
  AFTER UPDATE OF score ON public.league_scores
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_friend_overtaken();
