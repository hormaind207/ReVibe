'use client'

import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Eye, Loader2, LogIn, BookOpen, Heart, Layers } from 'lucide-react'
import { useNavigation } from '@/lib/store'
import { ScreenHeader } from '@/components/screen-header'
import { ICON_MAP } from '@/components/screens/dashboard'
import { MarketplaceSetupNotice } from '@/components/marketplace/setup-notice'
import { TemplateEditorModal } from '@/components/modals/template-editor-modal'
import { useMarketplaceUser } from '@/lib/marketplace/auth'
import { useDeveloperMode } from '@/lib/hooks/use-developer-mode'
import { getMyTemplates, getTemplateDetail, deleteTemplate, type TemplateSummary, type TemplateDetail } from '@/lib/marketplace/templates'
import { playButtonTap } from '@/lib/sounds'

export function MyTemplatesScreen() {
  const { navigate } = useNavigation()
  const { configured, loading: authLoading, isFullUser, user } = useMarketplaceUser()
  const { enabled: developerMode } = useDeveloperMode()
  const uid = user?.id ?? null
  const adminMode = developerMode

  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<TemplateDetail | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!uid || !isFullUser) {
      setLoading(false)
      return
    }
    setLoading(true)
    const rows = await getMyTemplates(uid, { officialOnly: adminMode ? true : false })
    setTemplates(rows)
    setLoading(false)
  }, [uid, isFullUser, adminMode])

  useEffect(() => {
    if (!configured || authLoading) return
    reload()
  }, [configured, authLoading, reload])

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }

  const openEdit = async (id: string) => {
    const detail = await getTemplateDetail(id, uid)
    if (detail) {
      setEditing(detail)
      setEditorOpen(true)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteTemplate(id)
    setConfirmDelete(null)
    reload()
  }

  if (!configured) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="나의 템플릿" showBack />
        <MarketplaceSetupNotice />
      </div>
    )
  }

  if (authLoading) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="나의 템플릿" showBack />
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          확인 중...
        </div>
      </div>
    )
  }

  // Login gate — only Google-signed-in users can publish
  if (!isFullUser) {
    return (
      <div className="flex flex-col pb-20">
        <ScreenHeader title="나의 템플릿" showBack />
        <div className="flex flex-col items-center justify-center gap-4 px-8 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base font-bold text-foreground">Google 로그인이 필요합니다</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            템플릿을 만들고 공유하려면 프로필에서 Google로 로그인하세요.
            <br />
            Drive 동기화와 마켓플레이스가 같은 계정으로 연동됩니다.
          </p>
          <button
            onClick={() => { playButtonTap(); navigate({ type: 'profile' }) }}
            className="mt-2 flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform active:scale-95"
          >
            <LogIn className="h-4 w-4" />
            프로필로 이동
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-20">
      <ScreenHeader
        title={adminMode ? '나의 템플릿 (Admin)' : '나의 템플릿'}
        showBack
        rightElement={
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {adminMode ? '공식 템플릿' : '새 템플릿'}
          </button>
        }
      />

      <div className="flex flex-col gap-3 px-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            불러오는 중...
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className="text-sm font-semibold text-foreground">
              {adminMode ? '아직 만든 공식 템플릿이 없습니다.' : '아직 만든 템플릿이 없습니다.'}
            </p>
            <p className="text-xs text-muted-foreground">
              {adminMode ? '개발자 모드에서 Admin으로 공식 템플릿을 만들 수 있습니다.' : '새 템플릿을 만들어 카드 모음을 공유해 보세요.'}
            </p>
            <button onClick={openCreate} className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
              <Plus className="h-4 w-4" />새 템플릿 만들기
            </button>
          </div>
        ) : (
          templates.map((t) => {
            const Icon = ICON_MAP[t.icon] || BookOpen
            const hasImage = Boolean(t.imageUrl)
            return (
              <div key={t.id} className="overflow-hidden rounded-2xl bg-card shadow-sm">
                <div
                  className={`relative flex items-center gap-3 p-4 ${hasImage ? '' : t.color ?? 'bg-muted'}`}
                  style={hasImage ? { backgroundImage: `url(${t.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                  {hasImage && <span className="absolute inset-0 bg-black/40" aria-hidden />}
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-card/85 shadow-sm">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className={`truncate text-sm font-bold ${hasImage ? 'text-white' : 'text-foreground'}`}>{t.name}</p>
                      {t.cardCount === 0 && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">카드 없음</span>}
                    </div>
                    <div className={`mt-0.5 flex items-center gap-2.5 text-[11px] ${hasImage ? 'text-white/85' : 'text-muted-foreground'}`}>
                      <span className="flex items-center gap-0.5"><Layers className="h-3 w-3" />{t.cardCount}</span>
                      <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{t.likeCount}</span>
                    </div>
                  </div>
                </div>
                <div className="flex divide-x divide-border border-t border-border">
                  <button onClick={() => navigate({ type: 'marketplace-template', templateId: t.id })} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                    <Eye className="h-3.5 w-3.5" />보기
                  </button>
                  <button onClick={() => openEdit(t.id)} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5" />편집
                  </button>
                  <button onClick={() => setConfirmDelete(t.id)} className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />삭제
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <TemplateEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        uid={uid ?? ''}
        existing={editing}
        onSaved={reload}
        asOfficial={adminMode && !editing}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-base font-bold text-foreground">템플릿을 삭제할까요?</p>
            <p className="mb-4 text-sm text-muted-foreground">템플릿과 모든 카드가 영구히 삭제됩니다.</p>
            <div className="flex gap-2">
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-white">삭제</button>
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl bg-muted py-2.5 text-sm font-medium text-foreground">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
