import { useCallback, useEffect, useMemo, useState } from 'react'

import { PREFECTURE_NAME_BY_CODE } from '@michi-no-eki/shared'
import type { Photo, PhotoListItem } from '@michi-no-eki/shared'

type PhotoLightboxProps = {
  photos: PhotoListItem[]
  initialPhotoId: string
  isLoggedIn: boolean
  onClose: () => void
  onEditCheckin: (checkinId: string) => void
  onOpenStationOnMap: (stationId: string) => void
  onPinChanged?: () => void
}

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTimestamp(timestamp: number) {
  return dateTimeFormatter.format(new Date(timestamp))
}

function toLightboxItem(photo: Photo): PhotoListItem | null {
  if (
    typeof photo.id !== 'string' ||
    typeof photo.checkinId !== 'string' ||
    typeof photo.stationId !== 'string'
  ) {
    return null
  }

  return {
    photoId: photo.id,
    checkinId: photo.checkinId,
    stationId: photo.stationId,
    stationName: '',
    prefectureCode: 0,
    visitedAt: 0,
    memo: null,
    isPinPhoto: photo.isPinPhoto,
    checkinPhotoCount: 0,
    visitOrdinal: 1,
  }
}

export function PhotoLightbox({
  photos,
  initialPhotoId,
  isLoggedIn,
  onClose,
  onEditCheckin,
  onOpenStationOnMap,
  onPinChanged,
}: PhotoLightboxProps) {
  const [scopedPhotos, setScopedPhotos] = useState(photos)
  const [currentPhotoId, setCurrentPhotoId] = useState(initialPhotoId)
  const [photosByCheckinId, setPhotosByCheckinId] = useState<
    Map<string, PhotoListItem[]>
  >(() => new Map())
  const [isPinSaving, setIsPinSaving] = useState(false)

  useEffect(() => {
    setScopedPhotos(photos)
    setCurrentPhotoId(initialPhotoId)
  }, [initialPhotoId, photos])

  const scopedIndex = scopedPhotos.findIndex(
    (photo) => photo.photoId === currentPhotoId,
  )
  const currentPhoto =
    scopedIndex >= 0
      ? scopedPhotos[scopedIndex]
      : (Array.from(photosByCheckinId.values())
          .flat()
          .find((photo) => photo.photoId === currentPhotoId) ?? scopedPhotos[0])

  const currentIndexLabel = scopedIndex >= 0 ? scopedIndex + 1 : 1

  const goPrevious = useCallback(() => {
    setCurrentPhotoId((photoId) => {
      const index = scopedPhotos.findIndex((photo) => photo.photoId === photoId)

      if (index <= 0) {
        return photoId
      }

      return scopedPhotos[index - 1]!.photoId
    })
  }, [scopedPhotos])

  const goNext = useCallback(() => {
    setCurrentPhotoId((photoId) => {
      const index = scopedPhotos.findIndex((photo) => photo.photoId === photoId)

      if (index < 0 || index >= scopedPhotos.length - 1) {
        return photoId
      }

      return scopedPhotos[index + 1]!.photoId
    })
  }, [scopedPhotos])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key === 'ArrowLeft') {
        goPrevious()
        return
      }

      if (event.key === 'ArrowRight') {
        goNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [goNext, goPrevious, onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (
      currentPhoto === undefined ||
      photosByCheckinId.has(currentPhoto.checkinId)
    ) {
      return
    }

    const controller = new AbortController()

    async function loadCheckinPhotos() {
      const response = await fetch(
        `/api/checkins/${currentPhoto!.checkinId}/photos`,
        { signal: controller.signal },
      )

      if (response.status === 401 || response.status === 404) {
        setPhotosByCheckinId((current) => {
          const next = new Map(current)
          next.set(currentPhoto!.checkinId, [])
          return next
        })
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const checkinPhotos = ((await response.json()) as Photo[])
        .map(toLightboxItem)
        .filter((photo): photo is PhotoListItem => photo !== null)
        .map((photo) => ({
          ...currentPhoto!,
          photoId: photo.photoId,
          isPinPhoto:
            scopedPhotos.find(
              (candidate) => candidate.photoId === photo.photoId,
            )?.isPinPhoto ?? photo.isPinPhoto,
        }))

      setPhotosByCheckinId((current) => {
        const next = new Map(current)
        next.set(currentPhoto!.checkinId, checkinPhotos)
        return next
      })
    }

    void loadCheckinPhotos().catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
    })

    return () => {
      controller.abort()
    }
  }, [currentPhoto, photosByCheckinId, scopedPhotos])

  const checkinPhotos = useMemo(() => {
    if (currentPhoto === undefined) {
      return []
    }

    return photosByCheckinId.get(currentPhoto.checkinId) ?? []
  }, [currentPhoto, photosByCheckinId])

  if (currentPhoto === undefined) {
    return null
  }

  const prefectureName =
    PREFECTURE_NAME_BY_CODE[currentPhoto.prefectureCode] ??
    `Prefecture ${currentPhoto.prefectureCode}`
  const isPinned = currentPhoto.isPinPhoto === 1

  async function togglePin() {
    if (!isLoggedIn || isPinSaving || currentPhoto === undefined) {
      return
    }

    const photoToPin = currentPhoto
    const nextIsPin = !isPinned
    setIsPinSaving(true)

    try {
      const response = await fetch(`/api/photos/${photoToPin.photoId}/pin`, {
        body: JSON.stringify({ isPin: nextIsPin }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PUT',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const updatePinState = (photo: PhotoListItem): PhotoListItem =>
        photo.stationId === photoToPin.stationId
          ? {
              ...photo,
              isPinPhoto:
                photo.photoId === photoToPin.photoId && nextIsPin ? 1 : 0,
            }
          : photo

      setScopedPhotos((current) => current.map(updatePinState))
      setPhotosByCheckinId((current) => {
        const next = new Map<string, PhotoListItem[]>()

        for (const [checkinId, checkinPhotosForMap] of current.entries()) {
          next.set(checkinId, checkinPhotosForMap.map(updatePinState))
        }

        return next
      })
      onPinChanged?.()
    } finally {
      setIsPinSaving(false)
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex bg-[oklch(0.18_0.02_250)] text-[oklch(0.92_0.01_250)]"
      role="dialog"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <button
              aria-label="写真を閉じる"
              className="grid h-10 w-10 place-items-center rounded-full text-2xl font-bold text-[oklch(0.92_0.01_250_/_0.82)] hover:bg-white/10 hover:text-[oklch(0.92_0.01_250)]"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
            <p className="text-sm font-black text-[oklch(0.92_0.01_250_/_0.72)]">
              {currentIndexLabel} / {photos.length}
            </p>
          </div>

          {isLoggedIn && (
            <button
              className={
                isPinned
                  ? 'inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-black text-white disabled:opacity-60'
                  : 'inline-flex h-10 items-center justify-center rounded-lg border border-white/20 px-4 text-sm font-black text-[oklch(0.92_0.01_250)] hover:border-primary hover:text-white disabled:opacity-60'
              }
              disabled={isPinSaving}
              onClick={() => void togglePin()}
              type="button"
            >
              {isPinned ? '✓ ピンに表示中' : 'ピンに表示する'}
            </button>
          )}
        </div>

        <div className="relative min-h-0 flex-1">
          <img
            alt={`${currentPhoto.stationName}の写真`}
            className="h-full w-full object-contain px-4 pb-6 md:px-14"
            src={`/api/photos/${currentPhoto.photoId}`}
          />
          <button
            aria-label="前の写真"
            className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-3xl font-bold text-white transition hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={scopedIndex <= 0}
            onClick={goPrevious}
            type="button"
          >
            ‹
          </button>
          <button
            aria-label="次の写真"
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-3xl font-bold text-white transition hover:bg-black/55 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={scopedIndex < 0 || scopedIndex >= scopedPhotos.length - 1}
            onClick={goNext}
            type="button"
          >
            ›
          </button>
        </div>
      </div>

      <aside className="hidden w-[340px] shrink-0 flex-col bg-[oklch(0.22_0.02_250)] md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <p className="text-xs font-black text-[oklch(0.92_0.01_250_/_0.55)]">
            {prefectureName}
          </p>
          <h2 className="mt-1 text-xl font-black leading-tight">
            {currentPhoto.stationName}
          </h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-black text-[oklch(0.92_0.01_250_/_0.48)]">
                チェックイン日時
              </dt>
              <dd className="mt-1 font-bold">
                {formatTimestamp(currentPhoto.visitedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-black text-[oklch(0.92_0.01_250_/_0.48)]">
                この記録の写真
              </dt>
              <dd className="mt-1 font-bold">
                {currentPhoto.checkinPhotoCount}枚
              </dd>
            </div>
            <div>
              <dt className="text-xs font-black text-[oklch(0.92_0.01_250_/_0.48)]">
                訪問回数
              </dt>
              <dd className="mt-1 font-bold">
                {currentPhoto.visitOrdinal}回目
              </dd>
            </div>
          </dl>

          {(currentPhoto.memo?.length ?? 0) > 0 && (
            <>
              <div className="my-5 h-px bg-white/12" />
              <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-[oklch(0.92_0.01_250_/_0.78)]">
                {currentPhoto.memo}
              </p>
            </>
          )}

          <div className="my-5 h-px bg-white/12" />

          <section>
            <h3 className="text-sm font-black">この記録の写真</h3>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {checkinPhotos.map((photo) => (
                <button
                  aria-label="写真を表示"
                  className={
                    photo.photoId === currentPhoto.photoId
                      ? 'aspect-square overflow-hidden rounded-lg border-2 border-primary bg-black/30'
                      : 'aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/30 hover:border-white/45'
                  }
                  key={photo.photoId}
                  onClick={() => setCurrentPhotoId(photo.photoId)}
                  type="button"
                >
                  <img
                    alt="この記録の写真"
                    className="h-full w-full object-cover"
                    loading="lazy"
                    src={`/api/photos/${photo.photoId}`}
                  />
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-3 border-t border-white/12 p-5">
          <button
            className="flex h-11 w-full items-center justify-center rounded-lg border border-white/18 text-sm font-black text-[oklch(0.92_0.01_250)] hover:border-primary hover:text-white"
            onClick={() => onEditCheckin(currentPhoto.checkinId)}
            type="button"
          >
            この訪問記録を編集
          </button>
          <button
            className="flex h-11 w-full items-center justify-center rounded-lg border border-white/18 text-sm font-black text-[oklch(0.92_0.01_250)] hover:border-primary hover:text-white"
            onClick={() => onOpenStationOnMap(currentPhoto.stationId)}
            type="button"
          >
            マップでこの駅を見る
          </button>
        </div>
      </aside>
    </div>
  )
}
