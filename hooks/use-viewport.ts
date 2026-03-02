'use client'

import * as React from 'react'

const DESKTOP_BREAKPOINT = 768

/** True when viewport width >= 768px. Undefined during SSR / before first paint to avoid hydration mismatch. */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const onChange = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT)
    mql.addEventListener('change', onChange)
    setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}

/** True when orientation is landscape. Undefined during SSR / before first paint to avoid hydration mismatch. */
export function useIsLandscape() {
  const [isLandscape, setIsLandscape] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)')
    const onChange = () => setIsLandscape(mql.matches)
    mql.addEventListener('change', onChange)
    setIsLandscape(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isLandscape
}
