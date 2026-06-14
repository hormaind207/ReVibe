'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, HelpCircle, BookOpen } from 'lucide-react'
import { ScreenHeader } from '@/components/screen-header'
import { STAGE_INTERVALS } from '@/lib/leitner'
import {
  guideTabs,
  guideSections,
  guideFaqItems,
  pwaInstallSteps,
  pwaRecommendContent,
  pwaOverviewTeaser,
  markGuideOpened,
  type GuideTabId,
} from '@/lib/app-guide-content'
import { PwaInstallCallout } from '@/components/pwa-install-callout'
import { useIsPwa } from '@/lib/use-pwa-install'
import { playButtonTap } from '@/lib/sounds'

const stageColors = [
  'bg-stage-1', 'bg-stage-2', 'bg-stage-3', 'bg-stage-4',
  'bg-stage-5', 'bg-stage-6', 'bg-stage-7',
]

const stageIntervalKo: Record<number, string> = {
  1: '매일', 2: '이틀 후', 3: '1주 후', 4: '2주 후', 5: '첫 달', 6: '둘째 달', 7: '셋째 달',
}

function SectionCard({
  title,
  body,
  bullets,
  tip,
  note,
}: {
  title: string
  body?: string
  bullets?: string[]
  tip?: string
  note?: string
}) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <BookOpen className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      {body && <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>}
      {bullets && bullets.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-xs text-muted-foreground">
              <span className="text-primary">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {tip && (
        <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-[11px] text-foreground">
          💡 {tip}
        </p>
      )}
      {note && (
        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  )
}

function StageIntervalChart() {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-bold text-foreground">복습 주기표</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        단계가 높을수록 복습 간격이 길어집니다. 단계 7을 통과하면 졸업!
      </p>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 7 }, (_, i) => i + 1).map((stage) => (
          <div key={stage} className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stageColors[stage - 1]} flex-shrink-0`}>
              <span className="text-xs font-bold text-foreground">{stage}</span>
            </div>
            <div className="flex-1">
              <div
                className={`h-2 rounded-full ${stageColors[stage - 1]}`}
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
    </div>
  )
}

function PwaOverviewTeaser({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <p className="text-xs text-muted-foreground leading-relaxed">{pwaOverviewTeaser.body}</p>
      <button
        type="button"
        onClick={() => {
          playButtonTap()
          onGoToSettings()
        }}
        className="mt-2 text-xs font-bold text-primary"
      >
        {pwaOverviewTeaser.linkLabel} →
      </button>
    </div>
  )
}

function PwaHeroSection() {
  const isPwa = useIsPwa()
  const [openOs, setOpenOs] = useState<number | null>(0)

  if (isPwa) {
    return <PwaInstallCallout />
  }

  return (
    <div id="pwa-install" className="scroll-mt-24 flex flex-col gap-4">
      <PwaInstallCallout />
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <p className="mb-2 text-xs font-bold text-destructive">브라우저만</p>
          <ul className="space-y-1">
            {pwaRecommendContent.browserOnly.map((item) => (
              <li key={item} className="text-[10px] text-muted-foreground">✗ {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-success/20 bg-success/5 p-3">
          <p className="mb-2 text-xs font-bold text-success">설치 후</p>
          <ul className="space-y-1">
            {pwaRecommendContent.installed.map((item) => (
              <li key={item} className="text-[10px] text-muted-foreground">✓ {item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {pwaInstallSteps.map((group, i) => (
          <div key={group.os} className="overflow-hidden rounded-xl bg-card shadow-sm">
            <button
              type="button"
              onClick={() => {
                playButtonTap()
                setOpenOs(openOs === i ? null : i)
              }}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-foreground">{group.os}</span>
              <motion.span animate={{ rotate: openOs === i ? 180 : 0 }}>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </motion.span>
            </button>
            <AnimatePresence>
              {openOs === i && (
                <motion.ol
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border px-4 pb-3 pt-2"
                >
                  {group.steps.map((step, j) => (
                    <li key={step} className="flex gap-2 py-1 text-xs text-muted-foreground">
                      <span className="font-bold text-primary">{j + 1}.</span>
                      {step}
                    </li>
                  ))}
                </motion.ol>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HelpGuideScreen() {
  const [activeTab, setActiveTab] = useState<GuideTabId>('overview')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const isPwa = useIsPwa()
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    markGuideOpened()
  }, [])

  const scrollToTab = useCallback((tabId: GuideTabId) => {
    playButtonTap()
    setActiveTab(tabId)
    const el = sectionRefs.current[tabId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const sectionsForTab = (tab: GuideTabId) => guideSections.filter((s) => s.tab === tab)

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader title="완전 가이드" showBack />

      <div
        ref={navRef}
        className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm"
      >
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {guideTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => scrollToTab(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        className="flex flex-col gap-6 px-4 pt-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {guideTabs.map((tab) => (
          <section
            key={tab.id}
            ref={(el) => { sectionRefs.current[tab.id] = el }}
            id={`guide-${tab.id}`}
            className="scroll-mt-20 flex flex-col gap-3"
          >
            <h2 className="text-base font-bold text-foreground">{tab.label}</h2>

            {tab.id === 'overview' && !isPwa && (
              <PwaOverviewTeaser onGoToSettings={() => scrollToTab('settings')} />
            )}

            {tab.id === 'learn' && <StageIntervalChart />}

            {tab.id === 'settings' && <PwaHeroSection />}

            {sectionsForTab(tab.id)
              .filter((section) => !(tab.id === 'settings' && section.id === 'pwa-install'))
              .map((section) => (
                <SectionCard
                  key={section.id}
                  title={section.title}
                  body={section.body}
                  bullets={section.bullets}
                  tip={section.tip}
                  note={section.note}
                />
              ))}

            {tab.id === 'faq' && (
              <div className="flex flex-col gap-2">
                {guideFaqItems.map((item, i) => (
                  <div key={item.q} className="overflow-hidden rounded-2xl bg-card shadow-sm">
                    <button
                      type="button"
                      onClick={() => {
                        playButtonTap()
                        setOpenFaq(openFaq === i ? null : i)
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
                    >
                      <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="flex-1 text-sm font-semibold text-foreground">{item.q}</span>
                      <motion.span
                        animate={{ rotate: openFaq === i ? 180 : 0 }}
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
            )}
          </section>
        ))}
      </motion.div>
    </div>
  )
}
