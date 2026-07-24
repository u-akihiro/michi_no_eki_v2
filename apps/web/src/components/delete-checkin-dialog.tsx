import { useEffect, useRef } from 'react'

import type { Checkin, Station } from '@michi-no-eki/shared'

import { Button } from './ui/button'

type DeleteCheckinDialogProps = {
  checkin: Checkin
  checkinCount: number
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
  station: Station
}

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTimestamp(timestamp: number) {
  return dateTimeFormatter.format(new Date(timestamp))
}

export function DeleteCheckinDialog({
  checkin,
  checkinCount,
  isDeleting,
  onClose,
  onConfirm,
  station,
}: DeleteCheckinDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const isLastCheckin = checkinCount <= 1

  useEffect(() => {
    cancelButtonRef.current?.focus()
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
      if (event.key === 'Escape' && !isDeleting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDeleting, onClose])

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center px-4 py-6">
      <button
        aria-label="削除確認を閉じる"
        className="absolute inset-0 bg-[oklch(0.3_0.04_250_/_0.45)]"
        disabled={isDeleting}
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="delete-checkin-dialog-title"
        aria-modal="true"
        className="relative w-[min(480px,calc(100vw-2rem))] rounded-xl bg-white p-5 shadow-[0_24px_80px_oklch(0.2_0.04_250_/_0.38)] sm:p-6"
        role="dialog"
      >
        <h2
          className="text-xl font-black leading-tight text-text"
          id="delete-checkin-dialog-title"
        >
          この訪問記録を削除しますか?
        </h2>
        <div className="mt-3 rounded-lg bg-background px-4 py-3">
          <p className="text-sm font-black text-text">{station.name}</p>
          <p className="mt-1 text-sm font-medium text-text-muted">
            {formatTimestamp(checkin.visitedAt)}
          </p>
        </div>

        <ul className="mt-4 space-y-2 text-sm font-medium leading-6 text-text-muted">
          <li>
            {isLastCheckin
              ? 'この駅は「未訪問」に戻ります'
              : 'この駅は「訪問済み」のままです'}
          </li>
        </ul>
        <p className="mt-4 text-sm font-black text-danger">
          この操作は取り消せません。
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={isDeleting}
            onClick={onClose}
            ref={cancelButtonRef}
            type="button"
            variant="outline"
          >
            キャンセル
          </Button>
          <Button
            disabled={isDeleting}
            onClick={onConfirm}
            type="button"
            variant="destructive"
          >
            {isDeleting ? '削除中...' : '削除する'}
          </Button>
        </div>
      </div>
    </div>
  )
}
