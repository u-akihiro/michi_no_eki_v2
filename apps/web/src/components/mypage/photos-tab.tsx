import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  AREA_LABEL_BY_CODE,
  PREFECTURE_NAME_BY_CODE,
  REGIONS,
} from '@michi-no-eki/shared'
import type { PhotoListItem, Region } from '@michi-no-eki/shared'

import { PhotoLightbox } from '@/components/photo-lightbox'
import { cn } from '@/lib/utils'

type PhotoSort = 'capturedAt' | 'station' | 'prefecture'

type PhotoGroup = {
  id: string
  meta: string
  photos: PhotoListItem[]
  title: string
}

type RegionSelectionState = 'all' | 'partial' | 'none'

const sortOptions = [
  { label: '撮影日順', value: 'capturedAt' },
  { label: '道の駅順', value: 'station' },
  { label: '都道府県順', value: 'prefecture' },
] as const satisfies readonly { label: string; value: PhotoSort }[]

const groupMonthFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'long',
  year: 'numeric',
})

export function PhotosTab() {
  const navigate = useNavigate()
  const [sort, setSort] = useState<PhotoSort>('capturedAt')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selectedAreaCodes, setSelectedAreaCodes] = useState<Set<number>>(
    () => new Set(),
  )
  const [photos, setPhotos] = useState<PhotoListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [lightboxPhotoId, setLightboxPhotoId] = useState<string | null>(null)

  const loadPhotos = useCallback(
    async (signal: AbortSignal) => {
      const params = new URLSearchParams({
        pinnedOnly: String(pinnedOnly),
        sort,
      })

      if (selectedAreaCodes.size > 0) {
        params.set(
          'areaCodes',
          Array.from(selectedAreaCodes)
            .sort((a, b) => a - b)
            .join(','),
        )
      }

      const response = await fetch(`/api/me/photos?${params.toString()}`, {
        signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      setPhotos((await response.json()) as PhotoListItem[])
    },
    [pinnedOnly, selectedAreaCodes, sort],
  )

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    void loadPhotos(controller.signal)
      .catch((unknownError) => {
        if (
          unknownError instanceof DOMException &&
          unknownError.name === 'AbortError'
        ) {
          return
        }

        setError('写真を読み込めませんでした。')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [loadPhotos, reloadToken])

  const groups = useMemo(() => groupPhotos(photos, sort), [photos, sort])

  function openStationOnMap(stationId: string) {
    navigate(`/?station=${encodeURIComponent(stationId)}`)
  }

  function editCheckinOnMap(checkinId: string) {
    const photo = photos.find((candidate) => candidate.checkinId === checkinId)

    if (photo !== undefined) {
      openStationOnMap(photo.stationId)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-lg font-black text-text">
            写真 {photos.length}枚
          </h2>
          {isLoading && (
            <p className="mt-1 text-xs font-bold text-text-muted">
              読み込み中...
            </p>
          )}
          {error !== null && (
            <p className="mt-1 text-xs font-bold text-red-600">{error}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <div
            aria-label="写真の並び替え"
            className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-white"
            role="group"
          >
            {sortOptions.map((option) => (
              <button
                aria-pressed={sort === option.value}
                className={cn(
                  'h-10 border-r border-border px-3 text-xs font-black last:border-r-0 sm:text-sm',
                  sort === option.value
                    ? 'bg-primary text-white'
                    : 'bg-white text-text hover:bg-background',
                )}
                key={option.value}
                onClick={() => setSort(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            aria-pressed={pinnedOnly}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-black transition-colors',
              pinnedOnly
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-white text-text hover:bg-background',
            )}
            onClick={() => setPinnedOnly((current) => !current)}
            type="button"
          >
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                pinnedOnly ? 'bg-primary' : 'bg-primary/35',
              )}
            />
            ピン写真のみ
          </button>

          <AreaDropdown
            onChange={setSelectedAreaCodes}
            selectedAreaCodes={selectedAreaCodes}
          />
        </div>
      </div>

      {photos.length === 0 && !isLoading ? (
        <div className="mt-5 rounded-lg border border-dashed border-border bg-background px-4 py-10 text-center">
          <p className="text-sm font-black text-text">まだ写真がありません</p>
          <Link
            className="mt-3 inline-flex text-sm font-bold text-primary hover:underline"
            to="/"
          >
            マップで道の駅を探す
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.id}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-base font-black text-text">
                  {group.title}
                </h3>
                <p className="text-xs font-bold text-text-muted">
                  {group.meta}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                {group.photos.map((photo) => (
                  <button
                    className="group relative aspect-square overflow-hidden rounded-[9px] bg-slate-100 text-left"
                    key={photo.photoId}
                    onClick={() => setLightboxPhotoId(photo.photoId)}
                    type="button"
                  >
                    <img
                      alt={`${photo.stationName}の写真`}
                      className="h-full w-full object-cover transition duration-150 group-hover:scale-105"
                      loading="lazy"
                      src={`/api/photos/${encodeURIComponent(photo.photoId)}`}
                    />
                    {photo.isPinPhoto === 1 && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-black leading-none text-white shadow-sm">
                        ピン
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {lightboxPhotoId !== null && (
        <PhotoLightbox
          initialPhotoId={lightboxPhotoId}
          isLoggedIn
          onClose={() => setLightboxPhotoId(null)}
          onEditCheckin={editCheckinOnMap}
          onOpenStationOnMap={openStationOnMap}
          onPinChanged={() => setReloadToken((current) => current + 1)}
          photos={photos}
        />
      )}
    </section>
  )
}

function AreaDropdown({
  onChange,
  selectedAreaCodes,
}: {
  onChange: (selectedAreaCodes: Set<number>) => void
  selectedAreaCodes: ReadonlySet<number>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedRegionNames, setExpandedRegionNames] = useState<
    ReadonlySet<Region['name']>
  >(() => new Set(REGIONS.map((region) => region.name)))
  const selectedLabel =
    selectedAreaCodes.size === 0
      ? '全国'
      : `${selectedAreaCodes.size}エリア選択中`

  function clearSelection() {
    onChange(new Set())
  }

  function toggleRegion(region: Region) {
    const selectionState = getRegionSelectionState(region, selectedAreaCodes)
    const nextSelectedAreaCodes = new Set(selectedAreaCodes)

    for (const areaCode of region.areaCodes) {
      if (selectionState === 'all') {
        nextSelectedAreaCodes.delete(areaCode)
      } else {
        nextSelectedAreaCodes.add(areaCode)
      }
    }

    onChange(nextSelectedAreaCodes)
  }

  function toggleArea(areaCode: number) {
    const nextSelectedAreaCodes = new Set(selectedAreaCodes)

    if (nextSelectedAreaCodes.has(areaCode)) {
      nextSelectedAreaCodes.delete(areaCode)
    } else {
      nextSelectedAreaCodes.add(areaCode)
    }

    onChange(nextSelectedAreaCodes)
  }

  function toggleRegionExpansion(regionName: Region['name']) {
    const nextExpandedRegionNames = new Set(expandedRegionNames)

    if (nextExpandedRegionNames.has(regionName)) {
      nextExpandedRegionNames.delete(regionName)
    } else {
      nextExpandedRegionNames.add(regionName)
    }

    setExpandedRegionNames(nextExpandedRegionNames)
  }

  return (
    <div className="relative">
      <button
        className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-black text-text hover:bg-background sm:w-auto"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        エリアで絞り込み ▾
        <span className="ml-2 text-xs font-bold text-text-muted">
          {selectedLabel}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-lg border border-border bg-white p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-black text-text">地域</p>
            <button
              className="text-xs font-bold text-primary hover:underline disabled:text-text-subtle disabled:no-underline"
              disabled={selectedAreaCodes.size === 0}
              onClick={clearSelection}
              type="button"
            >
              クリア
            </button>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {REGIONS.map((region) => {
              const selectionState = getRegionSelectionState(
                region,
                selectedAreaCodes,
              )
              const isExpanded = expandedRegionNames.has(region.name)

              return (
                <section key={region.name}>
                  <div className="flex items-center gap-2 rounded-md py-1">
                    <button
                      aria-expanded={isExpanded}
                      aria-label={`${region.name}を${isExpanded ? '閉じる' : '開く'}`}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded text-xs text-text-muted hover:bg-background"
                      onClick={() => toggleRegionExpansion(region.name)}
                      type="button"
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                    <FilterCheckbox
                      checked={selectionState === 'all'}
                      indeterminate={selectionState === 'partial'}
                      label={`${region.name}を選択`}
                      onChange={() => toggleRegion(region)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-black text-text">
                      {region.name}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-1 space-y-1 pl-10">
                      {region.areaCodes.map((areaCode) => {
                        const areaName =
                          AREA_LABEL_BY_CODE[areaCode] ?? `エリア${areaCode}`

                        return (
                          <label
                            className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-background"
                            key={areaCode}
                          >
                            <FilterCheckbox
                              checked={selectedAreaCodes.has(areaCode)}
                              label={`${areaName}を選択`}
                              onChange={() => toggleArea(areaCode)}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {areaName}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  label: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current !== null) {
      ref.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <input
      aria-label={label}
      checked={checked}
      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
      onChange={onChange}
      ref={ref}
      type="checkbox"
    />
  )
}

function getRegionSelectionState(
  region: Region,
  selectedAreaCodes: ReadonlySet<number>,
): RegionSelectionState {
  const selectedCount = region.areaCodes.filter((areaCode) =>
    selectedAreaCodes.has(areaCode),
  ).length

  if (selectedCount === region.areaCodes.length) {
    return 'all'
  }

  if (selectedCount === 0) {
    return 'none'
  }

  return 'partial'
}

function groupPhotos(photos: PhotoListItem[], sort: PhotoSort): PhotoGroup[] {
  // 同一グループ(id)が非連続でも 1 つにまとめる。並び替え変更直後の再取得前は
  // 「旧データ + 新 sort」で同一 id が非連続に現れうるため、直前グループとだけ
  // 比較する実装だと group.id が重複し React のキー衝突を起こす。Map で挿入順を
  // 保ちつつマージすることで id を必ず一意にする。
  const groupsById = new Map<string, PhotoGroup>()

  for (const photo of photos) {
    const groupId = getGroupId(photo, sort)
    const currentGroup = groupsById.get(groupId)

    if (currentGroup !== undefined) {
      currentGroup.photos.push(photo)
    } else {
      groupsById.set(groupId, {
        id: groupId,
        meta: '',
        photos: [photo],
        title: getGroupTitle(photo, sort),
      })
    }
  }

  return Array.from(groupsById.values()).map((group) => ({
    ...group,
    meta: getGroupMeta(group.photos, sort),
  }))
}

function getGroupId(photo: PhotoListItem, sort: PhotoSort) {
  if (sort === 'station') {
    return photo.stationId
  }

  if (sort === 'prefecture') {
    return String(photo.prefectureCode)
  }

  const date = new Date(photo.visitedAt)

  return `${date.getFullYear()}-${date.getMonth()}`
}

function getGroupTitle(photo: PhotoListItem, sort: PhotoSort) {
  if (sort === 'station') {
    return photo.stationName
  }

  if (sort === 'prefecture') {
    return getPrefectureName(photo.prefectureCode)
  }

  return groupMonthFormatter.format(new Date(photo.visitedAt))
}

function getGroupMeta(photos: PhotoListItem[], sort: PhotoSort) {
  if (sort === 'station') {
    return `${photos.length}枚`
  }

  return `${new Set(photos.map((photo) => photo.stationId)).size}駅 ・ ${photos.length}枚`
}

function getPrefectureName(prefectureCode: number) {
  return PREFECTURE_NAME_BY_CODE[prefectureCode] ?? `都道府県${prefectureCode}`
}
