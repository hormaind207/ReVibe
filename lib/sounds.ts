let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  return ctx
}

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('sound_enabled') !== 'false'
}

function playTone(params: { freq: number; duration: number; gain?: number }): void {
  const c = getContext()
  if (!c || !isEnabled()) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(params.freq, c.currentTime)
  gain.gain.setValueAtTime(params.gain ?? 0.15, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + params.duration)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + params.duration)
}

function playSweep(params: { startFreq: number; endFreq: number; duration: number; gain?: number }): void {
  const c = getContext()
  if (!c || !isEnabled()) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(params.startFreq, c.currentTime)
  osc.frequency.linearRampToValueAtTime(params.endFreq, c.currentTime + params.duration)
  gain.gain.setValueAtTime(params.gain ?? 0.08, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + params.duration)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + params.duration)
}

/** Success Ping — 맞았어요 (pass) */
export function playSuccessPing(): void {
  playTone({ freq: 800, duration: 0.08, gain: 0.12 })
}

/** Master Fanfare — 7단계 졸업 */
export function playMasterFanfare(): void {
  const c = getContext()
  if (!c || !isEnabled()) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, c.currentTime)
  osc.frequency.linearRampToValueAtTime(900, c.currentTime + 0.08)
  osc.frequency.linearRampToValueAtTime(1200, c.currentTime + 0.16)
  gain.gain.setValueAtTime(0.1, c.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25)
  osc.start(c.currentTime)
  osc.stop(c.currentTime + 0.25)
}

/** Card Add — 카드 추가 */
export function playCardAdd(): void {
  playTone({ freq: 500, duration: 0.06, gain: 0.12 })
}

/** Card Flip — 휙, 카드 넘기는 소리 (whoosh/swish) */
export function playCardFlip(): void {
  playSweep({ startFreq: 200, endFreq: 800, duration: 0.08, gain: 0.06 })
}

/** Fail — 틀렸어요 */
export function playFail(): void {
  playTone({ freq: 200, duration: 0.08, gain: 0.12 })
}

/** Onboarding Complete — 환영 톤 */
export function playOnboardingComplete(): void {
  playSweep({ startFreq: 523, endFreq: 659, duration: 0.15, gain: 0.1 })
}

/** Notification Chime — 알림 테스트용 */
export function playNotificationChime(): void {
  playSweep({ startFreq: 440, endFreq: 554, duration: 0.2, gain: 0.08 })
}

/** Button Tap — 설정·버튼 클릭 */
export function playButtonTap(): void {
  playTone({ freq: 600, duration: 0.04, gain: 0.08 })
}

/** Toggle Switch — 토글 전용 딸깍 */
export function playToggleSwitch(): void {
  playTone({ freq: 350, duration: 0.03, gain: 0.07 })
}

/** Review Start — 복습 시작 */
export function playReviewStart(): void {
  playSweep({ startFreq: 440, endFreq: 554, duration: 0.12, gain: 0.08 })
}
