import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DispatchUser {
  user_id: string
  master_enabled: boolean
  review_enabled: boolean
  streak_enabled: boolean
  ranking_enabled: boolean
  marketplace_likes_enabled: boolean
  review_hour: number
  timezone: string
}

interface QueueRow {
  id: string
  user_id: string
  kind: string
  title: string
  body: string
  payload: Record<string, unknown>
}

interface SubscriptionRow {
  id: string
  endpoint: string
  p256dh: string
  auth_key: string
}

function getLocalParts(timezone: string): { hour: number; date: string } {
  const now = new Date()
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now),
    10,
  )
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return { hour: hour === 24 ? 0 : hour, date }
}

function kindAllowed(
  kind: string,
  prefs: DispatchUser,
): boolean {
  if (!prefs.master_enabled) return false
  switch (kind) {
    case 'marketplace_like':
      return prefs.marketplace_likes_enabled
    case 'friend_overtaken':
      return prefs.ranking_enabled
    default:
      return true
  }
}

async function sendToUser(
  subs: SubscriptionRow[],
  payload: { title: string; body: string; url?: string; tag?: string },
  staleIds: string[],
): Promise<boolean> {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@revibe.app'

  if (!vapidPublic || !vapidPrivate || subs.length === 0) return false

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/',
    tag: payload.tag ?? 'revibe',
  })

  let anySent = false
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        pushPayload,
      )
      anySent = true
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        staleIds.push(sub.id)
      }
      console.error('push failed', sub.endpoint, err)
    }
  }
  return anySent
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authHeader || !serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey,
  )

  const staleSubIds: string[] = []
  const processedQueueIds: string[] = []

  // ── Scheduled review + streak ─────────────────────────────────────────────
  const { data: users, error: usersErr } = await supabase.rpc('get_notification_dispatch_batch')
  if (usersErr) {
    console.error(usersErr)
    return new Response(JSON.stringify({ error: usersErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userList = (users ?? []) as DispatchUser[]

  for (const u of userList) {
    const { hour, date } = getLocalParts(u.timezone || 'Asia/Seoul')
    if (hour !== u.review_hour) continue

    const { data: subs } = await supabase.rpc('get_push_subscriptions_for_user', {
      p_user_id: u.user_id,
    })
    const subRows = (subs ?? []) as SubscriptionRow[]
    if (subRows.length === 0) continue

    if (u.review_enabled) {
      const { data: reviewRows } = await supabase.rpc('get_review_snapshot_for_user', {
        p_user_id: u.user_id,
        p_local_date: date,
      })
      const review = (reviewRows as { card_count: number; stack_count: number; due_date: string }[] | null)?.[0]
      if (review && review.card_count > 0 && review.due_date === date) {
        const sent = await sendToUser(
          subRows,
          {
            title: 'ReVibe 복습 알림',
            body: `오늘 복습할 카드가 ${review.card_count}장 있어요`,
            tag: 'revibe-review',
          },
          staleSubIds,
        )
        if (sent) {
          await supabase.rpc('delete_review_snapshot_after_send', {
            p_user_id: u.user_id,
            p_due_date: date,
          })
        }
      }
    }

    if (u.streak_enabled) {
      const { data: streakRows } = await supabase.rpc('get_streak_snapshot_for_user', {
        p_user_id: u.user_id,
        p_local_date: date,
      })
      const streak = (streakRows as {
        current_streak: number
        last_success_date: string | null
        has_due_today: boolean
        as_of_date: string
      }[] | null)?.[0]
      if (
        streak &&
        streak.as_of_date === date &&
        streak.current_streak > 0 &&
        streak.has_due_today &&
        (streak.last_success_date === null || streak.last_success_date < date)
      ) {
        await sendToUser(
          subRows,
          {
            title: 'ReVibe 스트릭 알림',
            body: `${streak.current_streak}일 스트릭이 끊기기 전에 복습해 주세요`,
            tag: 'revibe-streak',
          },
          staleSubIds,
        )
      }
    }
  }

  // ── Queue (likes, friend overtaken, etc.) ───────────────────────────────────
  const { data: queueRows, error: queueErr } = await supabase.rpc('get_pending_push_queue', {
    p_limit: 200,
  })
  if (queueErr) {
    console.error(queueErr)
  } else {
    const queue = (queueRows ?? []) as QueueRow[]
    const prefsByUser = new Map(userList.map((u) => [u.user_id, u]))

    for (const item of queue) {
      let prefs = prefsByUser.get(item.user_id)
      if (!prefs) {
        const { data: directPrefs } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', item.user_id)
          .maybeSingle()
        if (directPrefs) {
          prefs = {
            user_id: item.user_id,
            master_enabled: directPrefs.master_enabled,
            review_enabled: directPrefs.review_enabled,
            streak_enabled: directPrefs.streak_enabled,
            ranking_enabled: directPrefs.ranking_enabled,
            marketplace_likes_enabled: directPrefs.marketplace_likes_enabled,
            review_hour: directPrefs.review_hour,
            timezone: directPrefs.timezone,
          }
        }
      }
      if (!prefs || !kindAllowed(item.kind, prefs)) {
        processedQueueIds.push(item.id)
        continue
      }

      const { data: subs } = await supabase.rpc('get_push_subscriptions_for_user', {
        p_user_id: item.user_id,
      })
      const subRows = (subs ?? []) as SubscriptionRow[]
      if (subRows.length === 0) {
        processedQueueIds.push(item.id)
        continue
      }

      const url = typeof item.payload?.url === 'string' ? item.payload.url : '/'
      const sent = await sendToUser(
        subRows,
        { title: item.title, body: item.body, url, tag: item.kind },
        staleSubIds,
      )
      if (sent) {
        processedQueueIds.push(item.id)
      }
    }
  }

  if (processedQueueIds.length > 0) {
    await supabase.rpc('mark_push_queue_processed', { p_ids: processedQueueIds })
  }

  for (const subId of staleSubIds) {
    await supabase.rpc('delete_push_subscription_by_id', { p_id: subId })
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed_queue: processedQueueIds.length,
      removed_subs: staleSubIds.length,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
