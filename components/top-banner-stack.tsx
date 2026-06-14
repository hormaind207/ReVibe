'use client'

import { type ReactNode } from 'react'

/** Fixed container for stacked top banners (PWA, guide, notification). */
export function TopBannerStack({ children }: { children: ReactNode }) {
  return (
    <div className="fixed left-4 right-4 top-4 z-[55] mx-auto flex w-full max-w-md flex-col gap-2">
      {children}
    </div>
  )
}
