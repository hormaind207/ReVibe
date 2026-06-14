/** Fisher–Yates shuffle; returns a new array without mutating the input. */
export function shuffleArray<T>(items: T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function studyRandomStorageKey(stackId: string): string {
  return `revibe_study_random_${stackId}`
}

export function readStudyRandom(stackId: string): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(studyRandomStorageKey(stackId)) === 'true'
}

export function writeStudyRandom(stackId: string, value: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(studyRandomStorageKey(stackId), String(value))
}
