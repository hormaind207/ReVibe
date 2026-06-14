export interface CardImportEntry {
  front: string
  back: string
}

export interface ImportParseError {
  line: number
  content: string
  reason: string
}

export interface ImportParseResult {
  cards: CardImportEntry[]
  errors: ImportParseError[]
}

export interface ImportParseOptions {
  /** Skip the first non-empty row (e.g. "앞면	뒷면" header) */
  skipHeader?: boolean
}

type ImportDelimiter = '\t' | '.'

const HEADER_HINTS = /^(front|back|앞면|뒷면|question|answer|word|meaning|단어|뜻|문제|정답|term|definition)/i

/** Strip UTF-8 BOM if present */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

interface RawRecord {
  text: string
  startLine: number
}

/**
 * Split input into logical records. Newlines inside double-quoted fields do not end a record.
 */
function splitRecords(text: string): RawRecord[] {
  const records: RawRecord[] = []
  let buf = ''
  let inQuotes = false
  let startLine = 1
  let line = 1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      buf += ch
      if (ch === '"') {
        if (text[i + 1] === '"') {
          buf += text[i + 1]
          i++
        } else {
          inQuotes = false
        }
      }
    } else if (ch === '"') {
      inQuotes = true
      buf += ch
    } else if (ch === '\n') {
      if (buf.trim()) records.push({ text: buf, startLine })
      buf = ''
      line++
      startLine = line
    } else {
      buf += ch
    }
  }

  if (buf.trim()) records.push({ text: buf, startLine })
  return records
}

/** Tab if present anywhere in the sample; otherwise period-separated lines */
function detectDelimiter(text: string): ImportDelimiter {
  return text.includes('\t') ? '\t' : '.'
}

/**
 * Parse fields from one record, respecting double-quoted fields (may span lines, contain delimiter).
 */
function parseDelimitedFields(record: string, delimiter: ImportDelimiter): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < record.length; i++) {
    const ch = record[i]
    if (inQuotes) {
      if (ch === '"') {
        if (record[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
}

/** Unquoted period lines: split on the first period only — "word. meaning with. dots" */
function parseUnquotedPeriodLine(record: string): string[] | null {
  const trimmed = record.trim()
  const dotIdx = trimmed.indexOf('.')
  if (dotIdx <= 0) return null
  const front = trimmed.slice(0, dotIdx).trim()
  const back = trimmed.slice(dotIdx + 1).trim()
  if (!front || !back) return null
  return [front, back]
}

function looksLikeHeader(fields: string[]): boolean {
  if (fields.length < 2) return false
  return HEADER_HINTS.test(fields[0]) || HEADER_HINTS.test(fields[1])
}

function fieldsToCard(fields: string[], delimiter: ImportDelimiter): CardImportEntry | null {
  if (fields.length < 2 || !fields[0] || !fields[1]) return null
  return {
    front: fields[0],
    back: fields.slice(1).join(delimiter === '\t' ? '\t' : '.'),
  }
}

function parseRecordToCard(
  record: string,
  startLine: number,
  delimiter: ImportDelimiter
): { card?: CardImportEntry; error?: ImportParseError } {
  const trimmed = record.trim()
  if (!trimmed) return {}

  let fields: string[] | null = null

  if (delimiter === '.' && !trimmed.includes('"')) {
    fields = parseUnquotedPeriodLine(trimmed)
  } else {
    fields = parseDelimitedFields(record, delimiter)
  }

  const card = fields ? fieldsToCard(fields, delimiter) : null
  if (card) return { card }

  return {
    error: {
      line: startLine,
      content: trimmed.slice(0, 60) + (trimmed.length > 60 ? '…' : ''),
      reason:
        delimiter === '\t'
          ? '탭으로 앞면·뒷면 두 열을 찾을 수 없습니다. 줄바꿈·탭이 들어가면 따옴표(")로 감싸 주세요'
          : '마침표로 앞면·뒷면을 구분할 수 없습니다. 마침표가 들어가면 따옴표(")로 감싸 주세요',
    },
  }
}

/**
 * Parse pasted text or file contents into front/back card pairs.
 * Delimiters: tab (TSV / sheet paste) or period (simple lines).
 * Double quotes allow periods, tabs, and line breaks inside a field.
 */
export function parseImportText(text: string, options: ImportParseOptions = {}): ImportParseResult {
  const normalized = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const delimiter = detectDelimiter(normalized)
  const allRecords = splitRecords(normalized)

  let startIdx = 0
  if (options.skipHeader && allRecords.length > 0) {
    startIdx = 1
  } else if (allRecords.length > 0 && !options.skipHeader) {
    const firstFields =
      delimiter === '.' && !allRecords[0].text.includes('"')
        ? parseUnquotedPeriodLine(allRecords[0].text)
        : parseDelimitedFields(allRecords[0].text, delimiter)
    if (firstFields && looksLikeHeader(firstFields)) startIdx = 1
  }

  const recordsToParse = allRecords.slice(startIdx)
  const cards: CardImportEntry[] = []
  const errors: ImportParseError[] = []

  for (const { text: record, startLine } of recordsToParse) {
    const result = parseRecordToCard(record, startLine, delimiter)
    if (result.card) cards.push(result.card)
    else if (result.error) errors.push(result.error)
  }

  return { cards, errors }
}

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/** Read a TSV/TXT file and parse its contents */
export async function parseImportFile(
  file: File,
  options: ImportParseOptions = {}
): Promise<ImportParseResult> {
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error('파일 크기는 5MB 이하여야 합니다.')
  }
  const text = await file.text()
  return parseImportText(text, options)
}

/** Download an empty TSV template for users to fill in */
export function downloadImportTemplate(): void {
  const content =
    '\uFEFFfront\tback\n' +
    'Ephemeral\t덧없는\n' +
    '"Dr. Smith"\t"의사 (마침표 예시)"\n' +
    '"첫 줄\n둘째 줄"\t"뒷면도\n줄바꿈 가능"\n'
  const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'revibe-cards-template.tsv'
  a.click()
  URL.revokeObjectURL(url)
}
