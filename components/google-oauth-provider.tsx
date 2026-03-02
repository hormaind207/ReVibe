'use client'

import type { ReactNode } from 'react'

// GoogleOAuthProvider is no longer needed — login uses a direct OAuth redirect
// instead of @react-oauth/google's popup-based useGoogleLogin hook.
// This wrapper is kept as a no-op for a clean removal path.
export function GoogleProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
