/**
 * Single source for intro slides, full guide sections, and PWA recommend copy.
 */

export const GUIDE_OPENED_KEY = 'guide_opened_v1'

export function shouldShowGuidePrompt(): boolean {
  if (typeof window === 'undefined') return false
  if (localStorage.getItem('onboarding_done') !== 'true') return false
  return localStorage.getItem(GUIDE_OPENED_KEY) !== 'true'
}

export function markGuideOpened(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(GUIDE_OPENED_KEY, 'true')
  }
}

/** Strip markdown bold markers for plain-text UI. */
export function formatGuideText(text: string): string {
  return text.replace(/\*\*/g, '')
}

export const pwaInstallCta = '앱 설치' as const
export const pwaInstallingLabel = '설치 중...' as const

export const notificationTypesSummary = '복습·스트릭·친구·마켓' as const

export const notificationPromptContent = {
  title: '알림을 켜고 복습을 놓치지 마세요',
  body: `${notificationTypesSummary} 알림을 선택적으로 받을 수 있어요.`,
} as const

export const pwaOverviewTeaser = {
  body: '브라우저만으로도 학습할 수 있지만, 알림·오프라인·실행 편의를 위해 홈 화면 추가를 권장합니다.',
  linkLabel: '설정 탭에서 설치 방법 보기',
} as const

export const pwaRecommendContent = {
  headline: '홈 화면 추가를 권장해요',
  subline: '브라우저만으로도 학습은 가능하지만, 설치하면 알림·오프라인·실행이 더 편해집니다.',
  introTitle: '홈 화면에\n설치하세요',
  introDescription:
    '브라우저 탭이 아닌 **앱으로 설치**하면 알림·오프라인·집중 학습이 훨씬 안정적입니다. 특히 iPhone은 설치 후에야 푸시 알림을 받을 수 있어요.',
  introDoneTitle: '이미 설치되어 있어요',
  introDoneDescription: '홈 화면에서 ReVibe를 실행 중입니다. 바로 학습을 시작해 보세요!',
  benefits: [
    { emoji: '⚡', title: '한 번에 실행', desc: '홈 화면 아이콘 → 브라우저 탭 없이 바로 열림' },
    { emoji: '🔔', title: '알림·오프라인', desc: '복습 알림과 오프라인 학습이 더 안정적 (iOS는 설치 권장)' },
    { emoji: '📱', title: '집중 학습', desc: '전체 화면으로 방해 없이 암기에 몰입' },
  ],
  browserOnly: ['주소창·탭이 항상 보임', '알림이 불안정하거나 불가', '실수로 탭을 닫으면 끊김'],
  installed: ['홈 화면에서 앱처럼 실행', '푸시 알림·오프라인 안정', '전체 화면 집중 모드'],
} as const

export type IdentitySlideId =
  | 'welcome'
  | 'leitner'
  | 'custom'
  | 'flow'
  | 'pwa'
  | 'pwa-done'
  | 'start'

export interface IdentitySlideData {
  id: IdentitySlideId
  emoji: string
  title: string
  description: string
  bg: string
  accent: string
  /** Hide when already running as installed PWA */
  hideWhenPwa?: boolean
  /** Show only when already PWA */
  onlyWhenPwa?: boolean
}

export const identitySlides: IdentitySlideData[] = [
  {
    id: 'welcome',
    emoji: '🧠',
    title: 'ReVibe에 오신 것을\n환영합니다!',
    description:
      'ReVibe는 **간격 반복**으로 암기 효율을 극대화하는 플래시카드 앱입니다. 한 번 외운 것을 오래도록 기억하게 도와줍니다.',
    bg: 'from-purple-100 to-purple-50',
    accent: '#b19cd9',
  },
  {
    id: 'leitner',
    emoji: '📦',
    title: '라이트너 박스란?',
    description:
      '카드를 「박스(단계)」에 넣어 두었다가, **잘 외우면 다음 박스로**, **틀리면 다시 처음**으로 보냅니다. 외울수록 복습 간격이 길어져 최소 시간으로 최대 효과를 냅니다.',
    bg: 'from-amber-100 to-amber-50',
    accent: '#fdb99b',
  },
  {
    id: 'custom',
    emoji: '✨',
    title: 'ReVibe만의\n라이트너',
    description:
      '**7단계 + 졸업**, 스택·대기함, 자동 병합, 승급/강등 규칙까지 — 검증된 라이트너 방식을 ReVibe에 맞게 다듬었습니다. 자세한 규칙은 **완전 가이드**에서 확인하세요.',
    bg: 'from-blue-100 to-blue-50',
    accent: '#89cff0',
  },
  {
    id: 'flow',
    emoji: '🗺️',
    title: '이렇게\n학습해요',
    description:
      '**카테고리** → **카드 추가** → **대기에서 단계 1로** → **매일 복습** → 단계를 거쳐 **졸업**. 매일 조금씩, 시스템이 알아서 복습 시점을 잡아 줍니다.',
    bg: 'from-emerald-100 to-emerald-50',
    accent: '#a8d8b9',
  },
  {
    id: 'pwa',
    emoji: '📲',
    title: pwaRecommendContent.introTitle,
    description: pwaRecommendContent.introDescription.replace(/\*\*/g, ''),
    bg: 'from-sky-100 to-sky-50',
    accent: '#7dd3fc',
    hideWhenPwa: true,
  },
  {
    id: 'pwa-done',
    emoji: '✅',
    title: pwaRecommendContent.introDoneTitle,
    description: pwaRecommendContent.introDoneDescription,
    bg: 'from-green-100 to-green-50',
    accent: '#86efac',
    onlyWhenPwa: true,
  },
  {
    id: 'start',
    emoji: '🚀',
    title: '준비됐어요!',
    description:
      '자세한 기능은 **프로필·설정**의 **완전 가이드**에서 확인하세요. 앱 설치 안내는 상단 배너에서도 볼 수 있어요.',
    bg: 'from-pink-100 to-pink-50',
    accent: '#f4a7bb',
  },
]

export function getIdentitySlidesForPwa(isPwa: boolean): IdentitySlideData[] {
  return identitySlides.filter((s) => {
    if (s.hideWhenPwa && isPwa) return false
    if (s.onlyWhenPwa && !isPwa) return false
    return true
  })
}

export type GuideTabId =
  | 'overview'
  | 'learn'
  | 'habit'
  | 'sync'
  | 'market'
  | 'ranking'
  | 'settings'
  | 'faq'

export interface GuideTab {
  id: GuideTabId
  label: string
}

export interface GuideSection {
  id: string
  tab: GuideTabId
  title: string
  body?: string
  bullets?: string[]
  tip?: string
  note?: string
}

export interface GuideFaqItem {
  q: string
  a: string
}

export const guideTabs: GuideTab[] = [
  { id: 'overview', label: '개요' },
  { id: 'learn', label: '학습' },
  { id: 'habit', label: '습관' },
  { id: 'sync', label: '동기화' },
  { id: 'market', label: '마켓' },
  { id: 'ranking', label: '랭킹' },
  { id: 'settings', label: '설정' },
  { id: 'faq', label: 'FAQ' },
]

export const guideSections: GuideSection[] = [
  {
    id: 'what-is-leitner',
    tab: 'overview',
    title: '라이트너 박스란?',
    body: '간격 반복 학습법을 카드 박스로 구현한 시스템입니다. 잘 외운 카드는 점점 긴 간격으로, 틀린 카드는 자주 반복합니다.',
  },
  {
    id: 'revibe-approach',
    tab: 'overview',
    title: 'ReVibe의 접근',
    bullets: [
      '7단계 복습 주기 + 졸업',
      '스택 단위 승급/강등 — 틀린 카드만 처음으로',
      '복습 날짜가 비슷한 스택은 자동으로 합쳐질 수 있어요',
      '대기함 → 단계 1 승격 후 본격 복습',
    ],
  },
  {
    id: 'review-vs-study',
    tab: 'overview',
    title: '복습 vs 자유학습',
    body: '스택 상세에서 두 모드를 선택할 수 있습니다.',
    bullets: [
      '복습: 맞음/틀림 결과가 단계·복습일에 반영됩니다.',
      '자유학습: 연습만 하고 단계는 바뀌지 않습니다.',
    ],
  },
  {
    id: 'learning-steps',
    tab: 'learn',
    title: '앱 사용 순서',
    bullets: [
      '홈 + 버튼으로 카테고리 만들기',
      '카테고리에서 카드·스택 추가',
      '대기 카드를 단계 1로 올리기',
      '홈 「오늘의 복습」으로 복습하기',
      '맞음/틀림을 정직하게 평가하기',
    ],
  },
  {
    id: 'waiting',
    tab: 'learn',
    title: '대기함',
    body: '아직 복습 주기에 넣지 않은 카드가 모입니다. 준비가 되면 단계 1로 올려 본격 학습을 시작하세요.',
  },
  {
    id: 'cards-import',
    tab: 'learn',
    title: '카드 추가 · 일괄 가져오기',
    bullets: [
      '홈, 스택 상세, 대기함에서 개별 추가',
      '일괄 추가: 마침표(.) 또는 탭으로 앞면·뒷면 구분',
    ],
  },
  {
    id: 'promotion',
    tab: 'learn',
    title: '승급 & 강등',
    bullets: [
      '승급: 스택 전체를 맞히면 다음 단계로',
      '강등: 틀린 카드만 단계 1로, 맞힌 카드는 승급',
    ],
  },
  {
    id: 'graduation',
    tab: 'learn',
    title: '졸업',
    body: '마지막 단계를 통과한 스택은 졸업 상태가 됩니다.',
  },
  {
    id: 'offline-learn',
    tab: 'learn',
    title: '오프라인 학습',
    body: '카드·스택 데이터는 기기에 저장됩니다. 인터넷 없이도 복습·카드 추가가 가능합니다.',
  },
  {
    id: 'today-review',
    tab: 'habit',
    title: '오늘의 복습',
    body: '홈 상단에서 오늘 복습할 카드와 스택을 확인하고 바로 시작하세요. 밀린 복습은 앱을 열 때 오늘로 당겨집니다.',
  },
  {
    id: 'streak',
    tab: 'habit',
    title: '복습 스트릭',
    body: '오늘 복습할 카드를 전부 끝내면 스트릭 +1. 복습할 카드가 없는 날은 유지됩니다. 하루라도 놓치면 0부터 다시 시작합니다.',
  },
  {
    id: 'drive',
    tab: 'sync',
    title: 'Google Drive 동기화',
    bullets: [
      'Google 계정으로 여러 기기 데이터 동기화',
      '데이터 변경 시 자동 저장',
      '충돌 시 「로컬 유지」 또는 「Drive 가져오기」 선택',
    ],
  },
  {
    id: 'backup',
    tab: 'sync',
    title: '수동 백업 · 내보내기',
    bullets: [
      '프로필 → 수동 백업: 날짜별 저장·복원',
      '파일 내보내기/가져오기로 백업',
    ],
  },
  {
    id: 'marketplace',
    tab: 'market',
    title: '마켓플레이스',
    body: '다른 사용자의 카드 모음을 탐색·가져오거나, 내 카드를 공유합니다. 인터넷과 Google 로그인이 필요합니다.',
    bullets: [
      '검색, 인기·즐겨찾기·해시태그',
      '템플릿을 카테고리로 가져오기',
      '나의 템플릿 만들기·편집',
    ],
    note: '오프라인에서는 마켓을 쓸 수 없습니다.',
  },
  {
    id: 'ranking',
    tab: 'ranking',
    title: '주간 랭킹 · 리그',
    bullets: [
      '매주 리셋되는 리그 점수 — 5점 이상부터 순위표 노출',
      '복습·졸업·스트릭 등으로 점수 획득',
      '전체 랭킹 / 친구 랭킹',
    ],
  },
  {
    id: 'notifications',
    tab: 'settings',
    title: '알림',
    bullets: [
      `${notificationTypesSummary} 알림을 프로필에서 켤 수 있어요`,
      'iPhone은 홈 화면에 추가한 뒤 알림이 더 잘 동작합니다',
    ],
  },
  {
    id: 'pwa-install',
    tab: 'settings',
    title: '앱 설치',
    body: pwaRecommendContent.subline,
    bullets: pwaRecommendContent.benefits.map((b) => `${b.title}: ${b.desc}`),
  },
]

export const pwaInstallSteps = [
  {
    os: 'Android (Chrome)',
    steps: ['Chrome에서 ReVibe 열기', '주소창 옆 「설치」 또는 메뉴 → 「앱 설치」', '홈 화면에 추가 확인'],
  },
  {
    os: 'iPhone (Safari)',
    steps: ['Safari에서 ReVibe 열기', '하단 공유 버튼 탭', '「홈 화면에 추가」 선택 → 추가'],
  },
  {
    os: 'PC (Chrome / Edge)',
    steps: ['주소창 오른쪽 설치 아이콘 클릭', '「설치」 확인', '바탕화면·작업 표시줄에서 실행'],
  },
] as const

export const guideFaqItems: GuideFaqItem[] = [
  {
    q: '카드를 틀리면 어떻게 되나요?',
    a: '틀린 카드만 새 단계 1 스택으로 이동하고, 맞힌 카드는 다음 단계로 승급합니다.',
  },
  {
    q: '졸업이란?',
    a: '마지막 단계를 통과한 스택 상태입니다.',
  },
  {
    q: '오프라인에서도 되나요?',
    a: '학습·복습·카드 추가는 오프라인 가능합니다. 마켓·랭킹은 인터넷이 필요합니다.',
  },
  {
    q: '알림이 안 와요',
    a: '프로필에서 알림을 켰는지, 브라우저 알림 권한을 허용했는지 확인하세요. iPhone은 홈 화면에 추가한 뒤, 오늘 복습할 카드가 있는지도 확인해 보세요.',
  },
  {
    q: '앱을 꼭 설치해야 하나요?',
    a: '브라우저만으로도 학습은 가능하지만, 알림·오프라인·실행 편의를 위해 홈 화면 추가를 권장합니다.',
  },
  {
    q: 'Drive에 파일이 안 보여요',
    a: '정상입니다. 앱 전용 저장 공간에 저장되어 일반 Drive 목록에는 보이지 않습니다.',
  },
  {
    q: '일괄 추가 형식은?',
    a: '마침표 또는 탭으로 앞·뒤 구분. 예: Meticulous. 세심한',
  },
  {
    q: '랭킹에 안 보여요',
    a: '프로필에서 「랭킹 참여」가 켜져 있고, 이번 주 리그 점수가 5점 이상이어야 순위표에 표시됩니다.',
  },
]

export const guidePromptContent = {
  title: '기능 안내를 꼭 읽어주세요',
  body: 'ReVibe에는 학습·습관·동기화·마켓·랭킹·알림 등 다양한 기능이 있습니다. **완전 가이드**에서 한 번에 확인해 주세요.',
  persistNote: '가이드를 열기 전까지 이 안내는 앱을 켤 때마다 표시됩니다.',
  entryNote: '프로필·설정에서도 언제든 열 수 있어요.',
  readCta: '완전 가이드 읽기',
  laterCta: '나중에',
} as const
