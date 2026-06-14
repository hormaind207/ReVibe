-- ============================================================================
-- Web Push 알림 시스템 (스냅샷 + queue + preferences)
-- profile_avatar_and_cloud_reset.sql 실행 후 1회 실행
-- ============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  master_enabled            boolean NOT NULL DEFAULT false,
  review_enabled            boolean NOT NULL DEFAULT false,
  review_hour               int NOT NULL DEFAULT 9 CHECK (review_hour >= 6 AND review_hour <= 22),
  streak_enabled            boolean NOT NULL DEFAULT false,
  ranking_enabled           boolean NOT NULL DEFAULT false,
  marketplace_likes_enabled boolean NOT NULL DEFAULT false,
  timezone                  text NOT NULL DEFAULT 'Asia/Seoul',
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.review_due_snapshots (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_date     date NOT NULL,
  card_count   int NOT NULL DEFAULT 0,
  stack_count  int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, due_date)
);

CREATE TABLE IF NOT EXISTS public.streak_snapshots (
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  as_of_date        date NOT NULL,
  current_streak    int NOT NULL DEFAULT 0,
  last_success_date date,
  has_due_today     boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, as_of_date)
);

CREATE TABLE IF NOT EXISTS public.push_notification_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  dedupe_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS push_notification_queue_dedupe_idx
  ON public.push_notification_queue (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND processed_at IS NULL;

CREATE INDEX IF NOT EXISTS push_notification_queue_pending_idx
  ON public.push_notification_queue (processed_at)
  WHERE processed_at IS NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_due_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_write ON public.push_subscriptions;
CREATE POLICY push_subscriptions_write ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_select ON public.notification_preferences;
CREATE POLICY notification_preferences_select ON public.notification_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_write ON public.notification_preferences;
CREATE POLICY notification_preferences_write ON public.notification_preferences
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS review_due_snapshots_write ON public.review_due_snapshots;
CREATE POLICY review_due_snapshots_write ON public.review_due_snapshots
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS streak_snapshots_write ON public.streak_snapshots;
CREATE POLICY streak_snapshots_write ON public.streak_snapshots
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_notification_queue_select ON public.push_notification_queue;
CREATE POLICY push_notification_queue_select ON public.push_notification_queue
  FOR SELECT USING (user_id = auth.uid());

-- queue insert from triggers uses SECURITY DEFINER functions

-- ── RPC: snapshots ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_review_snapshot(
  p_due_date date,
  p_card_count int,
  p_stack_count int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.review_due_snapshots (user_id, due_date, card_count, stack_count, updated_at)
  VALUES (uid, p_due_date, GREATEST(p_card_count, 0), GREATEST(p_stack_count, 0), now())
  ON CONFLICT (user_id, due_date)
  DO UPDATE SET
    card_count = EXCLUDED.card_count,
    stack_count = EXCLUDED.stack_count,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_review_snapshot(date, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_streak_snapshot(
  p_as_of_date date,
  p_current_streak int,
  p_last_success_date date,
  p_has_due_today boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.streak_snapshots (
    user_id, as_of_date, current_streak, last_success_date, has_due_today, updated_at
  )
  VALUES (
    uid, p_as_of_date, GREATEST(p_current_streak, 0), p_last_success_date, p_has_due_today, now()
  )
  ON CONFLICT (user_id, as_of_date)
  DO UPDATE SET
    current_streak = EXCLUDED.current_streak,
    last_success_date = EXCLUDED.last_success_date,
    has_due_today = EXCLUDED.has_due_today,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_streak_snapshot(date, int, date, boolean) TO authenticated;

-- ── RPC: push subscriptions ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth_key, user_agent, updated_at)
  VALUES (uid, p_endpoint, p_p256dh, p_auth_key, p_user_agent, now())
  ON CONFLICT (endpoint)
  DO UPDATE SET
    user_id = uid,
    p256dh = EXCLUDED.p256dh,
    auth_key = EXCLUDED.auth_key,
    user_agent = EXCLUDED.user_agent,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  DELETE FROM public.push_subscriptions
  WHERE endpoint = p_endpoint AND user_id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO authenticated;

-- ── RPC: notification preferences ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_notification_preferences()
RETURNS TABLE (
  master_enabled            boolean,
  review_enabled            boolean,
  review_hour               int,
  streak_enabled            boolean,
  ranking_enabled           boolean,
  marketplace_likes_enabled boolean,
  timezone                  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  INSERT INTO public.notification_preferences (user_id)
  VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT
    np.master_enabled,
    np.review_enabled,
    np.review_hour,
    np.streak_enabled,
    np.ranking_enabled,
    np.marketplace_likes_enabled,
    np.timezone
  FROM public.notification_preferences np
  WHERE np.user_id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_notification_preferences() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_notification_preferences(p_patch jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  INSERT INTO public.notification_preferences (user_id)
  VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.notification_preferences
  SET
    master_enabled = COALESCE((p_patch->>'master_enabled')::boolean, master_enabled),
    review_enabled = COALESCE((p_patch->>'review_enabled')::boolean, review_enabled),
    review_hour = COALESCE(
      LEAST(22, GREATEST(6, (p_patch->>'review_hour')::int)),
      review_hour
    ),
    streak_enabled = COALESCE((p_patch->>'streak_enabled')::boolean, streak_enabled),
    ranking_enabled = COALESCE((p_patch->>'ranking_enabled')::boolean, ranking_enabled),
    marketplace_likes_enabled = COALESCE(
      (p_patch->>'marketplace_likes_enabled')::boolean,
      marketplace_likes_enabled
    ),
    timezone = COALESCE(NULLIF(p_patch->>'timezone', ''), timezone),
    updated_at = now()
  WHERE user_id = uid;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_notification_preferences(jsonb) TO authenticated;

-- ── RPC: enqueue (triggers + service) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_push_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_payload jsonb DEFAULT '{}',
  p_dedupe_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  IF p_dedupe_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.push_notification_queue
      WHERE user_id = p_user_id
        AND dedupe_key = p_dedupe_key
        AND processed_at IS NULL
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.push_notification_queue (
    user_id, kind, title, body, payload, dedupe_key
  )
  VALUES (p_user_id, p_kind, p_title, p_body, COALESCE(p_payload, '{}'), p_dedupe_key);
END;
$$;

-- ── RPC: Edge Function — scheduled review/streak + queue processing ──────────

CREATE OR REPLACE FUNCTION public.get_users_for_scheduled_notifications(p_utc_hour int)
RETURNS TABLE (
  user_id                   uuid,
  review_enabled            boolean,
  streak_enabled            boolean,
  review_hour               int,
  timezone                  text,
  card_count                int,
  stack_count               int,
  due_date                  date,
  current_streak            int,
  last_success_date         date,
  has_due_today             boolean,
  streak_as_of_date         date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    np.user_id,
    np.review_enabled,
    np.streak_enabled,
    np.review_hour,
    np.timezone,
    COALESCE(rds.card_count, 0),
    COALESCE(rds.stack_count, 0),
    rds.due_date,
    COALESCE(ss.current_streak, 0),
    ss.last_success_date,
    COALESCE(ss.has_due_today, false),
    ss.as_of_date
  FROM public.notification_preferences np
  JOIN public.push_subscriptions ps ON ps.user_id = np.user_id
  LEFT JOIN public.review_due_snapshots rds ON rds.user_id = np.user_id
  LEFT JOIN public.streak_snapshots ss ON ss.user_id = np.user_id
  WHERE np.master_enabled = true
    AND (
      (np.review_enabled AND np.review_hour = p_utc_hour)
      OR np.streak_enabled
    );
$$;

-- Simpler: return all master-enabled users; Edge filters by local hour
CREATE OR REPLACE FUNCTION public.get_notification_dispatch_batch()
RETURNS TABLE (
  user_id                   uuid,
  master_enabled            boolean,
  review_enabled            boolean,
  streak_enabled            boolean,
  ranking_enabled           boolean,
  marketplace_likes_enabled boolean,
  review_hour               int,
  timezone                  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    np.user_id,
    np.master_enabled,
    np.review_enabled,
    np.streak_enabled,
    np.ranking_enabled,
    np.marketplace_likes_enabled,
    np.review_hour,
    np.timezone
  FROM public.notification_preferences np
  WHERE np.master_enabled = true
    AND EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = np.user_id);
$$;

CREATE OR REPLACE FUNCTION public.get_review_snapshot_for_user(p_user_id uuid, p_local_date date)
RETURNS TABLE (card_count int, stack_count int, due_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rds.card_count, rds.stack_count, rds.due_date
  FROM public.review_due_snapshots rds
  WHERE rds.user_id = p_user_id AND rds.due_date = p_local_date;
$$;

CREATE OR REPLACE FUNCTION public.get_streak_snapshot_for_user(p_user_id uuid, p_local_date date)
RETURNS TABLE (
  current_streak int,
  last_success_date date,
  has_due_today boolean,
  as_of_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ss.current_streak, ss.last_success_date, ss.has_due_today, ss.as_of_date
  FROM public.streak_snapshots ss
  WHERE ss.user_id = p_user_id AND ss.as_of_date = p_local_date;
$$;

CREATE OR REPLACE FUNCTION public.get_pending_push_queue(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  kind text,
  title text,
  body text,
  payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.user_id, q.kind, q.title, q.body, q.payload
  FROM public.push_notification_queue q
  WHERE q.processed_at IS NULL
  ORDER BY q.created_at ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_push_subscriptions_for_user(p_user_id uuid)
RETURNS TABLE (id uuid, endpoint text, p256dh text, auth_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth_key
  FROM public.push_subscriptions ps
  WHERE ps.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_push_queue_processed(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.push_notification_queue
  SET processed_at = now()
  WHERE id = ANY(p_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_review_snapshot_after_send(p_user_id uuid, p_due_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.review_due_snapshots
  WHERE user_id = p_user_id AND due_date = p_due_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_stale_notification_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.review_due_snapshots
  WHERE due_date < (CURRENT_DATE - 1);

  DELETE FROM public.streak_snapshots
  WHERE as_of_date < (CURRENT_DATE - 1);

  DELETE FROM public.push_notification_queue
  WHERE processed_at IS NOT NULL
    AND processed_at < (now() - interval '7 days');
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_push_subscription_by_id(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_subscriptions WHERE id = p_id;
END;
$$;

-- ── Trigger: marketplace like → queue ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_enqueue_marketplace_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id   uuid;
  tpl_name   text;
  hour_bucket text;
BEGIN
  SELECT t.owner_id, t.name INTO owner_id, tpl_name
  FROM public.templates t
  WHERE t.id = NEW.template_id;

  IF owner_id IS NULL OR owner_id = NEW.user_id THEN RETURN NULL; END IF;

  hour_bucket := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24');

  PERFORM public.enqueue_push_notification(
    owner_id,
    'marketplace_like',
    'ReVibe',
    format('「%s」에 좋아요가 달렸어요', COALESCE(tpl_name, '템플릿')),
    jsonb_build_object('template_id', NEW.template_id, 'url', '/'),
    format('like:%s:%s', NEW.template_id, hour_bucket)
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_marketplace_like ON public.template_likes;
CREATE TRIGGER enqueue_marketplace_like
  AFTER INSERT ON public.template_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_enqueue_marketplace_like();

-- ── Trigger: friend overtaken on league score change ─────────────────────────

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

-- ── Extend delete_user_cloud_data ──────────────────────────────────────────────

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

  DELETE FROM public.push_subscriptions WHERE user_id = uid;
  DELETE FROM public.notification_preferences WHERE user_id = uid;
  DELETE FROM public.review_due_snapshots WHERE user_id = uid;
  DELETE FROM public.streak_snapshots WHERE user_id = uid;
  DELETE FROM public.push_notification_queue WHERE user_id = uid;

  UPDATE public.profiles
  SET
    trophy_count = 0,
    ranking_opt_in = false,
    updated_at = now()
  WHERE id = uid;
END;
$$;

-- ── pg_cron schedules (run manually after enabling pg_cron + pg_net) ─────────
-- SELECT cron.schedule('process-notifications-hourly', '0 * * * *', $$ ... $$);
-- SELECT cron.schedule('cleanup-notification-data-daily', '0 16 * * *', $$SELECT public.delete_stale_notification_data()$$);
