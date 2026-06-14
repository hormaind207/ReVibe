'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, ClipboardPaste, Download, AlertTriangle } from 'lucide-react'
import {
  parseImportText,
  parseImportFile,
  downloadImportTemplate,
  type CardImportEntry,
  type ImportParseError,
} from '@/lib/import-cards'

type InputMethod = 'paste' | 'file'
type Step = 'input' | 'preview'

interface BulkImportPanelProps {
  onImport: (entries: CardImportEntry[]) => Promise<void>
  loading?: boolean
  importDisabled?: boolean
  /** Extra content above the input area (e.g. category picker) */
  header?: React.ReactNode
}

export function BulkImportPanel({ onImport, loading = false, importDisabled = false, header }: BulkImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [inputMethod, setInputMethod] = useState<InputMethod>('paste')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [skipHeader, setSkipHeader] = useState(false)
  const [step, setStep] = useState<Step>('input')
  const [parsed, setParsed] = useState<CardImportEntry[]>([])
  const [errors, setErrors] = useState<ImportParseError[]>([])
  const [fileLoading, setFileLoading] = useState(false)

  const resetPreview = () => {
    setStep('input')
    setParsed([])
    setErrors([])
  }

  const applyParseResult = (result: ReturnType<typeof parseImportText>) => {
    setParsed(result.cards)
    setErrors(result.errors)
    setStep('preview')
  }

  const handleParsePaste = () => {
    applyParseResult(parseImportText(text, { skipHeader }))
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileLoading(true)
    try {
      const result = await parseImportFile(file, { skipHeader })
      setFileName(file.name)
      setText('') // file mode — don't mix with paste
      applyParseResult(result)
    } finally {
      setFileLoading(false)
      e.target.value = ''
    }
  }

  const handleImport = async () => {
    if (parsed.length === 0) return
    await onImport(parsed)
  }

  const switchMethod = (method: InputMethod) => {
    setInputMethod(method)
    resetPreview()
    setFileName(null)
  }

  if (step === 'preview') {
    return (
      <div className="flex flex-col gap-4">
        {header}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{parsed.length}개 카드 인식됨</p>
            {fileName && (
              <p className="text-[11px] text-muted-foreground mt-0.5">파일: {fileName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={resetPreview}
            className="text-xs text-primary font-semibold"
          >
            다시 선택
          </button>
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                {errors.length}줄은 건너뛰었습니다
              </p>
            </div>
            <ul className="max-h-24 overflow-y-auto flex flex-col gap-1">
              {errors.slice(0, 8).map((err, i) => (
                <li key={i} className="text-[10px] text-amber-800/90 dark:text-amber-200/90">
                  {err.line}행: {err.reason}
                  {err.content && <span className="text-amber-700/70 dark:text-amber-300/70"> — {err.content}</span>}
                </li>
              ))}
              {errors.length > 8 && (
                <li className="text-[10px] text-amber-700/70 dark:text-amber-300/70">
                  …외 {errors.length - 8}줄
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {parsed.map((item, i) => (
            <div key={i} className="flex gap-2 rounded-xl bg-muted px-3 py-2.5">
              <span className="text-xs font-semibold text-muted-foreground w-5 flex-shrink-0">{i + 1}</span>
              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-foreground line-clamp-2 whitespace-pre-line">{item.front}</span>
                <span className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{item.back}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleImport}
          disabled={loading || importDisabled || parsed.length === 0}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {loading ? '추가 중...' : `${parsed.length}장 추가`}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {header}

      {/* Method tabs */}
      <div className="flex rounded-xl bg-muted p-1">
        <button
          type="button"
          onClick={() => switchMethod('paste')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
            inputMethod === 'paste' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          붙여넣기
        </button>
        <button
          type="button"
          onClick={() => switchMethod('file')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
            inputMethod === 'file' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          TSV · TXT 파일
        </button>
      </div>

      {/* Help guide */}
      <div className="rounded-xl bg-muted p-3 space-y-2">
        <p className="text-xs font-semibold text-foreground">📋 일괄 추가 형식</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          구분자는 <strong className="text-foreground">탭</strong> 또는 <strong className="text-foreground">마침표(.)</strong> 두 가지만 사용합니다.
          쉼표·세미콜론은 지원하지 않습니다.
        </p>
        {inputMethod === 'paste' ? (
          <>
            <p className="text-[11px] font-semibold text-foreground pt-1">엑셀 · 구글 시트 (추천)</p>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
              <li><strong className="text-foreground">A열(앞면)</strong>과 <strong className="text-foreground">B열(뒷면)</strong>을 선택 후 복사</li>
              <li>아래 입력란에 붙여넣기 → <strong className="text-foreground">탭</strong>으로 자동 구분됩니다</li>
            </ol>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold text-foreground pt-1">파일로 가져오기</p>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
              <li>시트에서 <strong className="text-foreground">TSV(.tsv)</strong> 또는 <strong className="text-foreground">TXT</strong>로 저장 (탭 구분)</li>
              <li>1열=앞면, 2열=뒷면 순서로 저장</li>
            </ol>
          </>
        )}
        <div className="text-[10px] text-muted-foreground/90 pt-1 border-t border-border/50 space-y-1.5 leading-relaxed">
          <p>
            <strong className="text-foreground">마침표 형식:</strong>{' '}
            <code className="text-[10px] bg-card px-1 rounded">단어. 뜻</code> — 앞면·뒷면 사이 <strong className="text-foreground">첫 마침표</strong>만 구분자
          </p>
          <p>
            <strong className="text-foreground">따옴표(&quot;):</strong> 마침표·탭·줄바꿈이 내용에 들어갈 때 필드를 감싸세요.
            셀 안 줄바꿈(Alt+Enter)도 따옴표로 감싸면 인식됩니다.
          </p>
          <p className="text-muted-foreground/80">
            예: <code className="text-[10px] bg-card px-1 rounded">&quot;Dr. No&quot;. &quot;영화 제목&quot;</code>
            {' · '}
            <code className="text-[10px] bg-card px-1 rounded">&quot;첫 줄↵둘째 줄&quot;	뒷면</code>
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={skipHeader}
          onChange={e => setSkipHeader(e.target.checked)}
          className="accent-primary h-3.5 w-3.5 rounded"
        />
        첫 줄이 &quot;앞면	뒷면&quot; 같은 제목 행이면 건너뛰기
      </label>

      {inputMethod === 'paste' ? (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              카드 데이터
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'Ephemeral\t덧없는\nMeticulous\t세심한\n"Dr. Smith"\t"의사 (마침표 예시)"\n단어. 뜻'}
              rows={7}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-mono"
            />
          </div>
          <button
            type="button"
            onClick={handleParsePaste}
            disabled={!text.trim()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            미리보기
          </button>
        </>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tsv,.txt,text/tab-separated-values,text/plain"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={fileLoading}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background py-8 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-8 w-8 text-primary/60" />
            <span className="font-semibold text-foreground">
              {fileLoading ? '파일 읽는 중...' : 'TSV · TXT 파일 선택'}
            </span>
            <span className="text-[11px] text-muted-foreground">탭으로 1열=앞면, 2열=뒷면</span>
          </button>
          <button
            type="button"
            onClick={downloadImportTemplate}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary"
          >
            <Download className="h-3.5 w-3.5" />
            빈 TSV 템플릿 다운로드
          </button>
        </>
      )}
    </div>
  )
}
