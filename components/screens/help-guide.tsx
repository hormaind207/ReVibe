'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, BookOpen, Layers, RotateCcw, ArrowUp, ArrowDown, GitMerge, FileText, HelpCircle, Cloud } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { STAGE_INTERVALS, MERGE_TOLERANCE } from '@/lib/leitner'

const stageColors = [
  'bg-stage-1', 'bg-stage-2', 'bg-stage-3', 'bg-stage-4',
  'bg-stage-5', 'bg-stage-6', 'bg-stage-7',
]

interface AccordionItemProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function AccordionItem({ icon, title, children, defaultOpen = false }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary flex-shrink-0">
          {icon}
        </span>
        <span className="flex-1 text-sm font-bold text-foreground">{title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="border-t border-border px-5 pb-5 pt-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const stageIntervalKo: Record<number, string> = {
  1: '매일', 2: '이틀 후', 3: '1주 후', 4: '2주 후', 5: '첫 달', 6: '둘째 달', 7: '셋째 달',
}

const faqItems = [
  {
    q: '스택이 자동으로 합쳐지는 이유는 무엇인가요?',
    a: '비슷한 시기에 복습해야 할 스택들을 하나로 합쳐서 복습을 효율적으로 만들어줍니다. 단계 3-4는 2일 이내, 단계 5-7은 7일 이내의 스택을 병합합니다.',
  },
  {
    q: '카드를 틀리면 어떻게 되나요?',
    a: '틀린 카드는 즉시 새로운 단계 1 스택으로 이동합니다. 오늘부터 다시 복습 주기가 시작됩니다.',
  },
  {
    q: '졸업(Graduated)이 뭔가요?',
    a: '단계 7을 통과한 카드의 스택이 졸업 상태가 됩니다. 장기 기억에 완전히 저장된 것으로 간주합니다.',
  },
  {
    q: '오프라인에서도 사용할 수 있나요?',
    a: '네! 모든 데이터는 기기의 브라우저 내부 저장소(IndexedDB)에 저장됩니다. 인터넷 없이도 완전히 동작합니다.',
  },
  {
    q: '일괄 추가(임포트) 형식이 어떻게 되나요?',
    a: '마침표(.) 또는 탭으로 앞면과 뒷면을 구분합니다. 예: Meticulous. 세심한',
  },
  {
    q: 'Google Drive에 저장된 데이터가 보이지 않는데 정상인가요?',
    a: '정상입니다. 앱 데이터는 일반 "내 드라이브"가 아닌 appDataFolder라는 앱 전용 숨김 영역에 저장됩니다. 파일 목록에는 보이지 않지만, Drive 설정 → 앱 관리에서 사용 중인 저장 용량을 간접적으로 확인할 수 있습니다.',
  },
]

export function HelpGuideScreen() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="사용 가이드" showBack />

      <motion.div
        className="flex flex-col gap-4 px-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Hero */}
        <div className="rounded-2xl bg-primary/10 p-5">
          <h2 className="mb-2 text-base font-bold text-foreground">🧠 라이트너 박스란?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            라이트너 박스는 <strong className="text-foreground">간격 반복(Spaced Repetition)</strong> 학습법을 기반으로 한 암기 시스템입니다.
            잘 외운 카드는 점점 긴 간격으로, 틀린 카드는 자주 반복하도록 설계되어
            최소한의 시간으로 최대한의 암기 효과를 냅니다.
          </p>
        </div>

        {/* Step-by-step guide */}
        <AccordionItem icon={<BookOpen className="h-4 w-4" />} title="앱 사용 순서" defaultOpen>
          <ol className="flex flex-col gap-3">
            {[
              { step: 1, title: '카테고리 만들기', desc: '홈 화면에서 + 버튼을 눌러 과목이나 주제별 카테고리를 만드세요. (예: 영어 단어, 수학 공식)' },
              { step: 2, title: '스택 만들기', desc: '카테고리 → 단계 1로 들어가서 새 스택을 만드세요. 스택은 카드들의 묶음입니다.' },
              { step: 3, title: '카드 추가하기', desc: '메인 화면 또는 스택 상세에서 카드를 추가하거나, 마침표(.)/탭 구분 텍스트로 한꺼번에 가져올 수 있어요.' },
              { step: 4, title: '매일 복습하기', desc: '홈 화면의 "오늘의 복습" 버튼을 눌러 오늘 복습할 카드들을 확인하고 복습을 시작하세요.' },
              { step: 5, title: '결과 평가하기', desc: '카드를 보고 알면 "맞았어요", 모르면 "틀렸어요"를 눌러요. 정직하게 평가할수록 효과가 좋습니다!' },
            ].map(item => (
              <li key={item.step} className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground mt-0.5">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </AccordionItem>

        {/* Stage intervals */}
        <AccordionItem icon={<Layers className="h-4 w-4" />} title="복습 주기표">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground mb-2">
              단계가 높을수록 복습 간격이 길어집니다. 단계 7을 통과하면 졸업!
            </p>
            {Array.from({ length: 7 }, (_, i) => i + 1).map(stage => (
              <div key={stage} className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stageColors[stage - 1]} flex-shrink-0`}>
                  <span className="text-xs font-bold text-foreground">{stage}</span>
                </div>
                <div className="flex-1">
                  <div className={`h-2 rounded-full ${stageColors[stage - 1]}`}
                    style={{ width: `${(STAGE_INTERVALS[stage] / 30) * 100}%`, maxWidth: '100%' }}
                  />
                </div>
                <span className="w-16 text-right text-xs font-semibold text-foreground">
                  {stageIntervalKo[stage]}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stage-graduated flex-shrink-0">
                <span className="text-xs">🎓</span>
              </div>
              <span className="text-sm font-bold text-foreground">졸업</span>
              <span className="ml-auto text-xs text-muted-foreground">단계 7 통과 후</span>
            </div>
          </div>
        </AccordionItem>

        {/* Promotion & Demotion */}
        <AccordionItem icon={<RotateCcw className="h-4 w-4" />} title="승급 & 강등 시스템">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-success/10 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <ArrowUp className="h-4 w-4 text-success" />
                <span className="text-sm font-bold text-success">승급</span>
              </div>
              <p className="text-xs text-muted-foreground">
                스택의 모든 카드를 맞히면 스택 전체가 다음 단계로 올라가고, 복습일이 해당 단계의 간격만큼 미뤄집니다.
              </p>
            </div>
            <div className="rounded-xl bg-destructive/10 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <ArrowDown className="h-4 w-4 text-destructive" />
                <span className="text-sm font-bold text-destructive">강등</span>
              </div>
              <p className="text-xs text-muted-foreground">
                하나라도 틀리면, 틀린 카드들만 새로운 단계 1 스택으로 이동합니다.
                맞힌 카드들은 다음 단계로 승급됩니다.
              </p>
            </div>
          </div>
        </AccordionItem>

        {/* Stack merging */}
        <AccordionItem icon={<GitMerge className="h-4 w-4" />} title="스택 자동 병합">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              같은 카테고리, 같은 단계에서 복습일이 비슷한 스택들은 자동으로 하나로 합쳐집니다.
            </p>
            <div className="flex flex-col gap-2">
              {[3, 4, 5, 6, 7].map(stage => (
                <div key={stage} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-lg ${stageColors[stage - 1]} flex items-center justify-center text-xs font-bold text-foreground`}>
                      {stage}
                    </div>
                    <span className="text-xs font-semibold text-foreground">단계 {stage}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ±{MERGE_TOLERANCE[stage]}일 이내
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">단계 1, 2는 병합되지 않습니다.</p>
          </div>
        </AccordionItem>

        {/* CSV Import */}
        <AccordionItem icon={<FileText className="h-4 w-4" />} title="일괄 가져오기 형식">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              메인 화면의 새 카드 추가 또는 스택 상세의 "일괄 추가"에서 여러 카드를 한 번에 추가할 수 있습니다.
            </p>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-foreground">지원 형식</p>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-xl bg-muted px-3 py-2">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">마침표 구분</p>
                  <code className="text-xs text-foreground">Meticulous. 세심한</code>
                </div>
                <div className="rounded-xl bg-muted px-3 py-2">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-1">탭 구분 (TSV)</p>
                  <code className="text-xs text-foreground">ありがとう{'  '}감사합니다</code>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Excel, Notion, Anki 내보내기 등 대부분의 형식을 지원합니다.
            </p>
          </div>
        </AccordionItem>

        {/* Google Drive Sync */}
        <AccordionItem icon={<Cloud className="h-4 w-4" />} title="Google Drive 연동">
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              프로필에서 Google 계정으로 연결하면 같은 계정을 쓰는 여러 기기에서 데이터가 자동으로 맞춰지고, 한 기기만 써도 수동 백업으로 시점을 저장해 두었다가 복원할 수 있습니다.
            </p>

            <div className="flex flex-col gap-2">
              {[
                { emoji: '🔄', title: '실시간 동기화', desc: '데이터를 바꿀 때마다 Drive에 자동 저장됩니다. 다른 기기에서 변경한 내용은 이 기기에 새로고침 없이 자동으로 반영됩니다.' },
                { emoji: '📂', title: '수동 백업', desc: '"수동 백업"을 누르면 그 시점이 날짜별로 Drive에 저장됩니다. "백업 불러오기"에서 저장된 백업 목록을 보고 원하는 시점을 골라 복원하거나, 필요 없는 백업은 개별 삭제할 수 있습니다.' },
              ].map(item => (
                <div key={item.title} className="flex gap-3 rounded-xl bg-muted px-3 py-2.5">
                  <span className="text-base">{item.emoji}</span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-primary/10 p-3">
              <p className="mb-1.5 text-xs font-bold text-foreground">📂 Drive에서 저장 용량 확인하는 법</p>
              <ol className="flex flex-col gap-1">
                {[
                  'drive.google.com 접속',
                  '우측 상단 톱니바퀴(⚙️) → 설정 클릭',
                  '왼쪽 메뉴에서 "앱 관리" 선택',
                  '목록에서 이 앱이 사용 중인 저장 용량 확인',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary mt-0.5">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[10px] text-muted-foreground">
                파일 내용은 보이지 않으며 앱만 접근할 수 있는 숨겨진 영역(appDataFolder)에 저장됩니다.
              </p>
            </div>
          </div>
        </AccordionItem>

        {/* FAQ */}
        <div className="flex flex-col gap-1">
          <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">자주 묻는 질문</p>
          <div className="flex flex-col gap-2">
            {faqItems.map((item, i) => (
              <div key={i} className="overflow-hidden rounded-2xl bg-card shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                >
                  <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="flex-1 text-sm font-semibold text-foreground">{item.q}</span>
                  <motion.span
                    animate={{ rotate: openFaq === i ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-0.5 flex-shrink-0 text-muted-foreground"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </motion.span>
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <p className="border-t border-border px-4 pb-4 pt-3 text-xs text-muted-foreground leading-relaxed">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
