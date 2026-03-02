export interface Flashcard {
  id: string
  front: string
  back: string
  categoryId: string
  stackId: string
  stage: number // 1-7, 8 = graduated
  lastReviewed: string | null
  nextReview: string | null
  createdAt: string
}

export interface Stack {
  id: string
  categoryId: string
  date: string // creation date label e.g. "2024-05-20"
  stage: number
  cards: Flashcard[]
}

export interface Category {
  id: string
  name: string
  color: string // tailwind bg class
  icon: 'book' | 'languages' | 'calculator' | 'flask' | 'music' | 'globe'
  totalCards: number
  stacks: Stack[]
}

export interface StageInfo {
  stage: number
  label: string
  interval: string
  color: string
}

export const STAGES: StageInfo[] = [
  { stage: 1, label: '매일', interval: '매일', color: 'var(--stage-1)' },
  { stage: 2, label: '이틀', interval: '이틀', color: 'var(--stage-2)' },
  { stage: 3, label: '1주', interval: '1주', color: 'var(--stage-3)' },
  { stage: 4, label: '2주', interval: '2주', color: 'var(--stage-4)' },
  { stage: 5, label: '첫째 달', interval: '첫째 달', color: 'var(--stage-5)' },
  { stage: 6, label: '둘째 달', interval: '둘째 달', color: 'var(--stage-6)' },
  { stage: 7, label: '셋째 달', interval: '셋째 달', color: 'var(--stage-7)' },
  { stage: 8, label: '4달', interval: '4달', color: 'var(--stage-1)' },
  { stage: 9, label: '반 년', interval: '반 년', color: 'var(--stage-2)' },
  { stage: 10, label: '1년', interval: '1년', color: 'var(--stage-3)' },
]

export const STAGE_COLORS = [
  'bg-stage-1',
  'bg-stage-2',
  'bg-stage-3',
  'bg-stage-4',
  'bg-stage-5',
  'bg-stage-6',
  'bg-stage-7',
  'bg-stage-graduated',
]
