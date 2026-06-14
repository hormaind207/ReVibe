/** Shared manual PWA install hint when beforeinstallprompt is unavailable. */
export function PwaManualInstallHint({ className = '' }: { className?: string }) {
  return (
    <p className={className}>
      Safari: <strong className="text-foreground">공유</strong> →{' '}
      <strong className="text-foreground">홈 화면에 추가</strong>
      {' · '}
      Chrome: 주소창 <strong className="text-foreground">설치</strong>
    </p>
  )
}
