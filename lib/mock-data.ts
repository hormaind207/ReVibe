import type { Category } from './types'

export const mockCategories: Category[] = [
  {
    id: 'english',
    name: 'English',
    color: 'bg-[#fdb99b]/40',
    icon: 'book',
    totalCards: 105,
    stacks: [
      {
        id: 'en-s1-0520',
        categoryId: 'english',
        date: '2024-05-20',
        stage: 1,
        cards: [
          { id: 'c1', front: 'Meticulous', back: '세심한, 꼼꼼한', categoryId: 'english', stackId: 'en-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
          { id: 'c2', front: 'Ubiquitous', back: '어디에나 있는', categoryId: 'english', stackId: 'en-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
          { id: 'c3', front: 'Ephemeral', back: '순간적인, 덧없는', categoryId: 'english', stackId: 'en-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
          { id: 'c4', front: 'Pragmatic', back: '실용적인', categoryId: 'english', stackId: 'en-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
        ],
      },
      {
        id: 'en-s1-0518',
        categoryId: 'english',
        date: '2024-05-18',
        stage: 1,
        cards: [
          { id: 'c5', front: 'Resilient', back: '회복력 있는', categoryId: 'english', stackId: 'en-s1-0518', stage: 1, lastReviewed: null, nextReview: '2024-05-19', createdAt: '2024-05-18' },
          { id: 'c6', front: 'Ambiguous', back: '모호한', categoryId: 'english', stackId: 'en-s1-0518', stage: 1, lastReviewed: null, nextReview: '2024-05-19', createdAt: '2024-05-18' },
        ],
      },
      {
        id: 'en-s2-0515',
        categoryId: 'english',
        date: '2024-05-15',
        stage: 2,
        cards: [
          { id: 'c7', front: 'Diligent', back: '근면한', categoryId: 'english', stackId: 'en-s2-0515', stage: 2, lastReviewed: '2024-05-16', nextReview: '2024-05-18', createdAt: '2024-05-15' },
          { id: 'c8', front: 'Succinct', back: '간결한', categoryId: 'english', stackId: 'en-s2-0515', stage: 2, lastReviewed: '2024-05-16', nextReview: '2024-05-18', createdAt: '2024-05-15' },
          { id: 'c9', front: 'Candid', back: '솔직한', categoryId: 'english', stackId: 'en-s2-0515', stage: 2, lastReviewed: '2024-05-16', nextReview: '2024-05-18', createdAt: '2024-05-15' },
        ],
      },
      {
        id: 'en-s3-0510',
        categoryId: 'english',
        date: '2024-05-10',
        stage: 3,
        cards: [
          { id: 'c10', front: 'Tenacious', back: '끈질긴', categoryId: 'english', stackId: 'en-s3-0510', stage: 3, lastReviewed: '2024-05-13', nextReview: '2024-05-17', createdAt: '2024-05-10' },
        ],
      },
      {
        id: 'en-s7-0401',
        categoryId: 'english',
        date: '2024-04-01',
        stage: 7,
        cards: [
          { id: 'c11', front: 'Profound', back: '심오한', categoryId: 'english', stackId: 'en-s7-0401', stage: 7, lastReviewed: '2024-04-20', nextReview: '2024-08-20', createdAt: '2024-04-01' },
        ],
      },
    ],
  },
  {
    id: 'japanese',
    name: 'Japanese',
    color: 'bg-[#a8d8b9]/40',
    icon: 'languages',
    totalCards: 42,
    stacks: [
      {
        id: 'jp-s1-0520',
        categoryId: 'japanese',
        date: '2024-05-20',
        stage: 1,
        cards: [
          { id: 'j1', front: 'ありがとう', back: 'Thank you / 감사합니다', categoryId: 'japanese', stackId: 'jp-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
          { id: 'j2', front: 'すみません', back: 'Excuse me / 실례합니다', categoryId: 'japanese', stackId: 'jp-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
          { id: 'j3', front: 'おはよう', back: 'Good morning / 좋은 아침', categoryId: 'japanese', stackId: 'jp-s1-0520', stage: 1, lastReviewed: null, nextReview: '2024-05-21', createdAt: '2024-05-20' },
        ],
      },
      {
        id: 'jp-s2-0516',
        categoryId: 'japanese',
        date: '2024-05-16',
        stage: 2,
        cards: [
          { id: 'j4', front: 'こんにちは', back: 'Hello / 안녕하세요', categoryId: 'japanese', stackId: 'jp-s2-0516', stage: 2, lastReviewed: '2024-05-17', nextReview: '2024-05-19', createdAt: '2024-05-16' },
        ],
      },
    ],
  },
  {
    id: 'math',
    name: 'Math Formulas',
    color: 'bg-[#89cff0]/40',
    icon: 'calculator',
    totalCards: 18,
    stacks: [
      {
        id: 'math-s1-0519',
        categoryId: 'math',
        date: '2024-05-19',
        stage: 1,
        cards: [
          { id: 'm1', front: 'Quadratic Formula', back: 'x = (-b +/- sqrt(b^2 - 4ac)) / 2a', categoryId: 'math', stackId: 'math-s1-0519', stage: 1, lastReviewed: null, nextReview: '2024-05-20', createdAt: '2024-05-19' },
          { id: 'm2', front: 'Pythagorean Theorem', back: 'a^2 + b^2 = c^2', categoryId: 'math', stackId: 'math-s1-0519', stage: 1, lastReviewed: null, nextReview: '2024-05-20', createdAt: '2024-05-19' },
        ],
      },
    ],
  },
]

export function getTodayReviewStacks() {
  const allStacks: Array<{ stack: typeof mockCategories[0]['stacks'][0]; categoryName: string; categoryColor: string }> = []
  for (const cat of mockCategories) {
    for (const stack of cat.stacks) {
      if (stack.stage <= 3) {
        allStacks.push({ stack, categoryName: cat.name, categoryColor: cat.color })
      }
    }
  }
  return allStacks
}

export function getStacksByStage(categoryId: string, stage: number) {
  const cat = mockCategories.find(c => c.id === categoryId)
  if (!cat) return []
  return cat.stacks.filter(s => s.stage === stage)
}

export function getStackCountByStage(categoryId: string, stage: number) {
  return getStacksByStage(categoryId, stage).length
}
