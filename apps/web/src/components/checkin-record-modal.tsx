import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type {
  Checkin,
  Station,
  UpdateCheckinRequest,
} from '@michi-no-eki/shared'

import { Button } from './ui/button'

type CheckinRecordModalMode = 'create' | 'edit'

type CheckinRecordModalProps = {
  checkin: Checkin
  isDismissDisabled?: boolean
  isSaving: boolean
  mode: CheckinRecordModalMode
  onClose: () => void
  onDeleteRequest?: () => void
  onSave: (request: UpdateCheckinRequest) => void
  station: Station
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function formatDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp)

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate(),
  )}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

function parseDateTimeLocal(value: string) {
  const [datePart, timePart] = value.split('T')

  if (datePart === undefined || timePart === undefined) {
    return Number.NaN
  }

  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)

  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hours === undefined ||
    minutes === undefined
  ) {
    return Number.NaN
  }

  return new Date(year, month - 1, day, hours, minutes).getTime()
}

export function CheckinRecordModal({
  checkin,
  isDismissDisabled = false,
  isSaving,
  mode,
  onClose,
  onDeleteRequest,
  onSave,
  station,
}: CheckinRecordModalProps) {
  const visitedAtInputRef = useRef<HTMLInputElement>(null)
  const [visitedAt, setVisitedAt] = useState(() =>
    formatDateTimeLocal(checkin.visitedAt),
  )
  const [memo, setMemo] = useState(checkin.memo ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setVisitedAt(formatDateTimeLocal(checkin.visitedAt))
    setMemo(checkin.memo ?? '')
    setFormError(null)
  }, [checkin])

  useEffect(() => {
    visitedAtInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving && !isDismissDisabled) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDismissDisabled, isSaving, onClose])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsedVisitedAt = parseDateTimeLocal(visitedAt)

    if (!Number.isFinite(parsedVisitedAt)) {
      setFormError('チェックイン日時を入力してください')
      return
    }

    setFormError(null)
    onSave({
      memo: memo.trim().length === 0 ? null : memo,
      visitedAt: parsedVisitedAt,
    })
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center px-4 py-6">
      <button
        aria-label="訪問記録モーダルを閉じる"
        className="absolute inset-0 bg-[oklch(0.3_0.04_250_/_0.45)]"
        disabled={isSaving || isDismissDisabled}
        onClick={onClose}
        type="button"
      />
      <form
        aria-labelledby="checkin-record-modal-title"
        aria-modal="true"
        className="relative flex max-h-[min(760px,calc(100dvh-3rem))] w-[min(640px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl bg-white shadow-[0_24px_80px_oklch(0.2_0.04_250_/_0.36)]"
        onSubmit={handleSubmit}
        role="dialog"
      >
        <div className="border-b border-border px-5 py-4 sm:px-6">
          {mode === 'create' ? (
            <>
              <p className="text-sm font-black text-primary">
                ✓ チェックインしました
              </p>
              <h2
                className="mt-1 text-xl font-black leading-tight text-text"
                id="checkin-record-modal-title"
              >
                {station.name} の訪問記録
              </h2>
            </>
          ) : (
            <>
              <h2
                className="text-xl font-black leading-tight text-text"
                id="checkin-record-modal-title"
              >
                訪問記録の編集
              </h2>
              <p className="mt-1 text-sm font-bold text-text-muted">
                {station.name}
              </p>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <label className="block">
            <span className="text-sm font-black text-text">
              チェックイン日時
            </span>
            <input
              className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-medium text-text outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setVisitedAt(event.target.value)}
              ref={visitedAtInputRef}
              type="datetime-local"
              value={visitedAt}
            />
          </label>

          <label className="block">
            <span className="text-sm font-black text-text">メモ</span>
            <textarea
              className="mt-2 min-h-28 w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium leading-6 text-text outline-none transition-colors placeholder:text-text-subtle focus:border-primary focus:ring-2 focus:ring-primary/20"
              onChange={(event) => setMemo(event.target.value)}
              placeholder="訪問時のメモを残せます"
              value={memo}
            />
          </label>

          <section aria-label="写真">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-text">写真</h3>
              <p className="text-xs font-bold text-text-muted">
                写真の追加は今後対応予定
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  aria-disabled="true"
                  className="grid aspect-square place-items-center rounded-lg border border-dashed border-border bg-background text-lg font-black text-text-subtle"
                  key={index}
                >
                  +
                </div>
              ))}
            </div>
          </section>

          {formError !== null && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
              {formError}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          {mode === 'edit' && onDeleteRequest !== undefined && (
            <button
              className="text-left text-sm font-black text-danger hover:underline disabled:opacity-50 sm:mr-auto"
              disabled={isSaving}
              onClick={onDeleteRequest}
              type="button"
            >
              この記録を削除
            </button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            <Button
              disabled={isSaving}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {mode === 'create' ? 'あとで記録する' : 'キャンセル'}
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving
                ? '保存中...'
                : mode === 'create'
                  ? '記録を保存'
                  : '保存'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
