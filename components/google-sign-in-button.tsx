'use client'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
const OAUTH_SCOPE = 'email profile https://www.googleapis.com/auth/drive.appdata'

function buildOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: OAUTH_SCOPE,
    include_granted_scopes: 'true',
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function GoogleSignInButton() {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="rounded-xl bg-muted p-3">
        <p className="text-xs text-muted-foreground">
          Google Drive 동기화를 사용하려면{' '}
          <code className="rounded bg-background px-1 py-0.5 text-[10px]">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>
          를 환경변수로 설정하세요.
        </p>
      </div>
    )
  }

  return (
    <button
      onClick={() => { window.location.href = buildOAuthUrl() }}
      className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-border bg-card py-3.5 text-sm font-bold text-foreground shadow-sm transition-transform active:scale-95"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Google로 로그인
    </button>
  )
}
