'use client'

/**
 * @deprecated Use @/lib/push-notifications instead.
 * Thin compatibility layer for settings screen and sync restore.
 */

export {
  DEFAULT_REVIEW_HOUR as DEFAULT_NOTIFICATION_HOUR,
} from '@/lib/push-notifications'

export const DEFAULT_NOTIFICATION_MINUTE = 0

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  enableMasterNotifications,
  disableMasterNotifications,
  sendTestPushNotification,
} from '@/lib/push-notifications'

/** @deprecated */
export async function getNotificationSettings() {
  const prefs = await getNotificationPreferences()
  return {
    enabled: prefs.masterEnabled,
    hour: prefs.reviewHour,
    minute: DEFAULT_NOTIFICATION_MINUTE,
  }
}

/** @deprecated Drive restore: only sync hour, do not auto-enable master. */
export async function updateNotificationTime(hour: number, _minute = 0) {
  await updateNotificationPreferences({ reviewHour: hour })
}

/** @deprecated */
export async function enableNotifications(hour?: number, _minute?: number) {
  if (hour !== undefined) {
    await updateNotificationPreferences({ reviewHour: hour })
  }
  return enableMasterNotifications()
}

/** @deprecated */
export async function disableNotifications() {
  await disableMasterNotifications()
}

/** @deprecated */
export async function sendTestNotification() {
  await sendTestPushNotification()
}

/** No-op: server push replaces local SW restore. */
export function useNotificationRestore() {}

/** No-op: overdue handled by review snapshot + scheduled push. */
export async function sendOverdueNotification(_overdueCount: number) {}
