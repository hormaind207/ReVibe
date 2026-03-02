'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, CheckCircle2 } from 'lucide-react'
import { parseImportText, bulkImportCards } from '@/lib/hooks/use-cards'

interface BulkImportModalProps {
  open: boolean
  onClose: () => void
  stackId: string
  categoryId: string
}

export function BulkImportModal({ open, onClose, stackId, categoryId }: BulkImportModalProps) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<Array<{ front: string; back: string }>>([])
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const handleParse = () => {
    const results = parseImportText(text)
    setParsed(results)
    setStep('preview')
  }

  const handleImport = async () => {
    if (parsed.length === 0) return
    setLoading(true)
    try {
      await bulkImportCards(stackId, categoryId, parsed)
      setDone(true)
      setTimeout(() => {
        setText('')
        setParsed([])
        setStep('input')
        setDone(false)
        onClose()
      }, 1200)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setText('')
    setParsed([])
    setStep('input')
    setDone(false)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 z-[60] mx-auto max-w-md rounded-t-3xl bg-card p-6 shadow-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">일괄 가져오기</h2>
              <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <CheckCircle2 className="h-12 w-12 text-success" />
                <p className="text-base font-bold text-foreground">{parsed.length}장 추가 완료!</p>
              </div>
            ) : step === 'input' ? (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">입력 형식</p>
                  <p className="text-xs text-muted-foreground">
                    한 줄에 <strong>앞면. 뒷면</strong> 또는 <strong>앞면[탭]뒷면</strong> 형식으로 입력하세요.
                  </p>
                  <code className="mt-2 block text-xs bg-card rounded-lg p-2 text-foreground">
                    Meticulous. 세심한<br />
                    Ephemeral. 덧없는<br />
                    ありがとう. 감사합니다
                  </code>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                    카드 데이터 입력
                  </label>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Meticulous. 세심한&#10;Ephemeral. 덧없는&#10;Ubiquitous. 어디에나 있는"
                    rows={8}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-mono"
                    autoFocus
                  />
                </div>

                <button
                  onClick={handleParse}
                  disabled={!text.trim()}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  미리보기
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{parsed.length}개 카드 인식됨</p>
                  <button onClick={() => setStep('input')} className="text-xs text-primary font-semibold">
                    수정
                  </button>
                </div>

                <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                  {parsed.map((item, i) => (
                    <div key={i} className="flex gap-2 rounded-xl bg-muted px-3 py-2.5">
                      <span className="text-xs font-semibold text-muted-foreground w-5 flex-shrink-0">{i + 1}</span>
                      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">{item.front}</span>
                        <span className="text-xs text-muted-foreground truncate">{item.back}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleImport}
                    disabled={loading || parsed.length === 0}
                    className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {loading ? '추가 중...' : `${parsed.length}장 추가`}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
