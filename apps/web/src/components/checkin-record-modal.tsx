import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import type {
  Checkin,
  Photo,
  Station,
  UpdateCheckinRequest,
} from '@michi-no-eki/shared'

import { Button } from './ui/button'

type CheckinRecordModalMode = 'create' | 'edit'

type PendingPhoto = {
  id: string
  file: File
  previewUrl: string
}

type CheckinRecordModalProps = {
  checkin: Checkin
  isDismissDisabled?: boolean
  isSaving: boolean
  mode: CheckinRecordModalMode
  onClose: () => void
  onDeleteRequest?: () => void
  onPhotosChanged?: () => Promise<void> | void
  onSave: (request: UpdateCheckinRequest) => Promise<void>
  station: Station
}

const maxPhotoBytes = 10 * 1024 * 1024
const acceptedPhotoTypes = new Set(['image/jpeg', 'image/png'])

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

function validatePhotoFile(file: File) {
  if (!acceptedPhotoTypes.has(file.type)) {
    return 'JPEG/PNG の写真だけ選択できます'
  }

  if (file.size <= 0 || file.size > maxPhotoBytes) {
    return '写真は1枚10MB以下にしてください'
  }

  return null
}

async function fetchCheckinPhotos(checkinId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/checkins/${checkinId}/photos`, { signal })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as Photo[]
}

async function uploadCheckinPhoto(checkinId: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`/api/checkins/${checkinId}/photos`, {
    body: formData,
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as Photo
}

export function CheckinRecordModal({
  checkin,
  isDismissDisabled = false,
  isSaving,
  mode,
  onClose,
  onDeleteRequest,
  onPhotosChanged,
  onSave,
  station,
}: CheckinRecordModalProps) {
  const visitedAtInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [visitedAt, setVisitedAt] = useState(() =>
    formatDateTimeLocal(checkin.visitedAt),
  )
  const [memo, setMemo] = useState(checkin.memo ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([])
  const pendingPhotosRef = useRef<PendingPhoto[]>([])
  const [isPhotosLoading, setIsPhotosLoading] = useState(mode === 'edit')
  const [isPhotoBusy, setIsPhotoBusy] = useState(false)
  const isBusy = isSaving || isPhotoBusy

  useEffect(() => {
    setVisitedAt(formatDateTimeLocal(checkin.visitedAt))
    setMemo(checkin.memo ?? '')
    setFormError(null)
    setPhotos([])
    setIsPhotosLoading(mode === 'edit')
  }, [checkin, mode])

  useEffect(() => {
    if (mode !== 'edit') {
      return
    }

    const controller = new AbortController()
    setIsPhotosLoading(true)

    void fetchCheckinPhotos(checkin.id, controller.signal)
      .then((loadedPhotos) => setPhotos(loadedPhotos))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setFormError('写真を読み込めませんでした')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPhotosLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [checkin.id, mode])

  useEffect(() => {
    pendingPhotosRef.current = pendingPhotos
  }, [pendingPhotos])

  useEffect(() => {
    return () => {
      for (const pendingPhoto of pendingPhotosRef.current) {
        URL.revokeObjectURL(pendingPhoto.previewUrl)
      }
    }
  }, [])

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
      if (event.key === 'Escape' && !isBusy && !isDismissDisabled) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBusy, isDismissDisabled, onClose])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isBusy) {
      return
    }

    const parsedVisitedAt = parseDateTimeLocal(visitedAt)

    if (!Number.isFinite(parsedVisitedAt)) {
      setFormError('チェックイン日時を入力してください')
      return
    }

    setFormError(null)
    setIsPhotoBusy(true)

    try {
      await onSave({
        memo: memo.trim().length === 0 ? null : memo,
        visitedAt: parsedVisitedAt,
      })

      if (mode === 'create' && pendingPhotos.length > 0) {
        for (const pendingPhoto of pendingPhotos) {
          await uploadCheckinPhoto(checkin.id, pendingPhoto.file)
          URL.revokeObjectURL(pendingPhoto.previewUrl)
        }

        setPendingPhotos([])
        await onPhotosChanged?.()
      }

      onClose()
    } catch {
      setFormError('保存できませんでした。時間をおいて再度お試しください')
    } finally {
      setIsPhotoBusy(false)
    }
  }

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (selectedFiles.length === 0 || isBusy) {
      return
    }

    const validationError = selectedFiles
      .map((file) => validatePhotoFile(file))
      .find((error) => error !== null)

    if (validationError !== undefined && validationError !== null) {
      setFormError(validationError)
      return
    }

    setFormError(null)

    if (mode === 'create') {
      setPendingPhotos((current) => [
        ...current,
        ...selectedFiles.map((file) => ({
          file,
          id: crypto.randomUUID(),
          previewUrl: URL.createObjectURL(file),
        })),
      ])
      return
    }

    setIsPhotoBusy(true)

    try {
      const uploadedPhotos: Photo[] = []

      for (const file of selectedFiles) {
        uploadedPhotos.push(await uploadCheckinPhoto(checkin.id, file))
      }

      setPhotos((current) => [...current, ...uploadedPhotos])
      await onPhotosChanged?.()
    } catch {
      setFormError('写真をアップロードできませんでした')
    } finally {
      setIsPhotoBusy(false)
    }
  }

  async function handlePin(photo: Photo, isPin: boolean) {
    if (isBusy) {
      return
    }

    setIsPhotoBusy(true)
    setFormError(null)

    try {
      const response = await fetch(`/api/photos/${photo.id}/pin`, {
        body: JSON.stringify({ isPin }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const updatedPhoto = (await response.json()) as Photo
      setPhotos((current) =>
        current.map((currentPhoto) => {
          if (currentPhoto.id === updatedPhoto.id) {
            return updatedPhoto
          }

          if (isPin && currentPhoto.stationId === updatedPhoto.stationId) {
            return { ...currentPhoto, isPinPhoto: 0 }
          }

          return currentPhoto
        }),
      )
      await onPhotosChanged?.()
    } catch {
      setFormError('ピン写真を更新できませんでした')
    } finally {
      setIsPhotoBusy(false)
    }
  }

  async function handleDeletePhoto(photo: Photo) {
    if (isBusy) {
      return
    }

    setIsPhotoBusy(true)
    setFormError(null)

    try {
      const response = await fetch(`/api/photos/${photo.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      setPhotos((current) =>
        current.filter((currentPhoto) => currentPhoto.id !== photo.id),
      )
      await onPhotosChanged?.()
    } catch {
      setFormError('写真を削除できませんでした')
    } finally {
      setIsPhotoBusy(false)
    }
  }

  function removePendingPhoto(photoId: string) {
    setPendingPhotos((current) => {
      const removedPhoto = current.find((photo) => photo.id === photoId)

      if (removedPhoto !== undefined) {
        URL.revokeObjectURL(removedPhoto.previewUrl)
      }

      return current.filter((photo) => photo.id !== photoId)
    })
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center px-4 py-6">
      <button
        aria-label="訪問記録モーダルを閉じる"
        className="absolute inset-0 bg-[oklch(0.3_0.04_250_/_0.45)]"
        disabled={isBusy || isDismissDisabled}
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
                JPEG/PNG・1枚10MBまで
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {isPhotosLoading ? (
                <div className="col-span-full rounded-lg bg-background px-3 py-4 text-sm font-bold text-text-muted">
                  写真を読み込み中...
                </div>
              ) : null}
              {photos.map((photo) => (
                <PhotoTile
                  isBusy={isBusy}
                  key={photo.id}
                  onDelete={() => void handleDeletePhoto(photo)}
                  onPin={() => void handlePin(photo, photo.isPinPhoto !== 1)}
                  photo={photo}
                />
              ))}
              {pendingPhotos.map((photo) => (
                <PendingPhotoTile
                  isBusy={isBusy}
                  key={photo.id}
                  onRemove={() => removePendingPhoto(photo.id)}
                  photo={photo}
                />
              ))}
              <button
                aria-label="写真を追加"
                className="grid aspect-square place-items-center rounded-lg border border-dashed border-border bg-background text-2xl font-black text-primary transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                +
              </button>
            </div>
            <input
              accept="image/jpeg,image/png"
              className="sr-only"
              multiple
              onChange={(event) => void handleFilesSelected(event)}
              ref={fileInputRef}
              type="file"
            />
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
              disabled={isBusy}
              onClick={onDeleteRequest}
              type="button"
            >
              この記録を削除
            </button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
            <Button
              disabled={isBusy}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {mode === 'create' ? 'あとで記録する' : 'キャンセル'}
            </Button>
            <Button disabled={isBusy} type="submit">
              {isBusy ? '保存中...' : mode === 'create' ? '記録を保存' : '保存'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function PhotoTile({
  isBusy,
  onDelete,
  onPin,
  photo,
}: {
  isBusy: boolean
  onDelete: () => void
  onPin: () => void
  photo: Photo
}) {
  const isPinned = photo.isPinPhoto === 1

  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded-lg border bg-background ${
        isPinned ? 'border-2 border-primary' : 'border-border'
      }`}
    >
      <img
        alt="訪問記録の写真"
        className="h-full w-full object-cover"
        src={`/api/photos/${photo.id}`}
      />
      {isPinned ? (
        <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-black text-white">
          ✓ピンに表示中
        </span>
      ) : null}
      <div className="absolute inset-x-1 bottom-1 flex gap-1">
        <button
          className="min-w-0 flex-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-black text-primary shadow disabled:opacity-50"
          disabled={isBusy}
          onClick={onPin}
          type="button"
        >
          {isPinned ? 'ピン解除' : 'ピンに設定'}
        </button>
        <button
          aria-label="写真を削除"
          className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-black text-danger shadow disabled:opacity-50"
          disabled={isBusy}
          onClick={onDelete}
          type="button"
        >
          削除
        </button>
      </div>
    </div>
  )
}

function PendingPhotoTile({
  isBusy,
  onRemove,
  photo,
}: {
  isBusy: boolean
  onRemove: () => void
  photo: PendingPhoto
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-background">
      <img
        alt="追加予定の写真"
        className="h-full w-full object-cover"
        src={photo.previewUrl}
      />
      <span className="absolute left-1 top-1 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-black text-white">
        保存時に追加
      </span>
      <button
        className="absolute bottom-1 right-1 rounded-md bg-white/95 px-2 py-1 text-[11px] font-black text-danger shadow disabled:opacity-50"
        disabled={isBusy}
        onClick={onRemove}
        type="button"
      >
        取消
      </button>
    </div>
  )
}
