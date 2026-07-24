import { useEffect, useRef, useState } from 'react'

import { PREFECTURE_NAME_BY_CODE, REGIONS } from '@michi-no-eki/shared'
import type { Region } from '@michi-no-eki/shared'

import { cn } from '@/lib/utils'

type VisitStatus = 'all' | 'visited' | 'unvisited'

type StationFilterProps = {
  countsByPrefectureCode: ReadonlyMap<number, number>
  countsByRegionName: ReadonlyMap<Region['name'], number>
  isVisitStatusDisabled: boolean
  onChange: (nextSelectedPrefectureCodes: Set<number>) => void
  selectedPrefectureCodes: ReadonlySet<number>
  visiblePrefectureCount: number
  visibleStationCount: number
}

type RegionSelectionState = 'all' | 'partial' | 'none'

export function getRegionSelectionState(
  region: Region,
  selectedPrefectureCodes: ReadonlySet<number>,
): RegionSelectionState {
  const selectedCount = region.prefectureCodes.filter((prefectureCode) =>
    selectedPrefectureCodes.has(prefectureCode),
  ).length

  if (selectedCount === region.prefectureCodes.length) {
    return 'all'
  }

  if (selectedCount === 0) {
    return 'none'
  }

  return 'partial'
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

export function StationFilter({
  countsByPrefectureCode,
  countsByRegionName,
  isVisitStatusDisabled,
  onChange,
  selectedPrefectureCodes,
  visiblePrefectureCount,
  visibleStationCount,
}: StationFilterProps) {
  const [visitStatus, setVisitStatus] = useState<VisitStatus>('all')
  const [expandedRegionNames, setExpandedRegionNames] = useState<
    ReadonlySet<Region['name']>
  >(() => new Set(REGIONS.map((region) => region.name)))

  function clearSelection() {
    onChange(new Set())
  }

  function toggleRegion(region: Region) {
    const selectionState = getRegionSelectionState(
      region,
      selectedPrefectureCodes,
    )
    const nextSelectedPrefectureCodes = new Set(selectedPrefectureCodes)

    for (const prefectureCode of region.prefectureCodes) {
      if (selectionState === 'all') {
        nextSelectedPrefectureCodes.delete(prefectureCode)
      } else {
        nextSelectedPrefectureCodes.add(prefectureCode)
      }
    }

    onChange(nextSelectedPrefectureCodes)
  }

  function togglePrefecture(prefectureCode: number) {
    const nextSelectedPrefectureCodes = new Set(selectedPrefectureCodes)

    if (nextSelectedPrefectureCodes.has(prefectureCode)) {
      nextSelectedPrefectureCodes.delete(prefectureCode)
    } else {
      nextSelectedPrefectureCodes.add(prefectureCode)
    }

    onChange(nextSelectedPrefectureCodes)
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
    <aside
      className="flex h-full min-h-0 w-full flex-col border-r border-border bg-white text-sm text-text"
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border px-5 py-5">
        <p className="mb-2 text-xs font-bold text-text-muted">訪問ステータス</p>
        <div
          aria-label="訪問ステータス"
          className={cn(
            'grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-white',
            isVisitStatusDisabled && 'opacity-55',
          )}
          role="group"
        >
          {[
            ['all', 'すべて'],
            ['visited', '訪問済み'],
            ['unvisited', '未訪問'],
          ].map(([value, label]) => (
            <button
              aria-pressed={visitStatus === value}
              className={cn(
                'h-9 border-r border-border px-2 text-xs font-bold last:border-r-0',
                visitStatus === value
                  ? 'bg-primary text-white'
                  : 'bg-white text-text hover:bg-background',
              )}
              disabled={isVisitStatusDisabled}
              key={value}
              onClick={() => setVisitStatus(value as VisitStatus)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-text">地域で絞り込む</h2>
          <button
            className="text-xs font-bold text-primary hover:text-primary-hover disabled:text-text-subtle disabled:hover:text-text-subtle"
            disabled={selectedPrefectureCodes.size === 0}
            onClick={clearSelection}
            type="button"
          >
            クリア
          </button>
        </div>

        {selectedPrefectureCodes.size === 0 ? (
          <div className="mb-3 rounded-md bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
            全国を表示中
            <span className="ml-1.5 font-medium text-text-muted">
              地方・都道府県を選ぶと絞り込めます
            </span>
          </div>
        ) : (
          <div className="mb-3 text-xs font-medium text-text-muted">
            選択した地域に絞り込み中
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {REGIONS.map((region) => {
            const selectionState = getRegionSelectionState(
              region,
              selectedPrefectureCodes,
            )
            const isExpanded = expandedRegionNames.has(region.name)
            const regionCount = countsByRegionName.get(region.name) ?? 0

            return (
              <section key={region.name}>
                <div className="flex items-center gap-2 rounded-md py-1">
                  <button
                    aria-expanded={isExpanded}
                    aria-label={`${region.name}を${isExpanded ? '閉じる' : '開く'}`}
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] text-text-muted hover:bg-background"
                    onClick={() => toggleRegionExpansion(region.name)}
                    type="button"
                  >
                    {isExpanded ? '⌄' : '›'}
                  </button>
                  <FilterCheckbox
                    checked={selectionState === 'all'}
                    indeterminate={selectionState === 'partial'}
                    label={`${region.name}を選択`}
                    onChange={() => toggleRegion(region)}
                  />
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {region.name}
                  </span>
                  <span className="text-xs font-medium text-text-muted">
                    {regionCount}
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-1 space-y-1 pl-10">
                    {region.prefectureCodes.map((prefectureCode) => {
                      const prefectureName =
                        PREFECTURE_NAME_BY_CODE[prefectureCode]
                      const prefectureCount =
                        countsByPrefectureCode.get(prefectureCode) ?? 0

                      return (
                        <label
                          className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-background"
                          key={prefectureCode}
                        >
                          <FilterCheckbox
                            checked={selectedPrefectureCodes.has(
                              prefectureCode,
                            )}
                            label={`${prefectureName}を選択`}
                            onChange={() => togglePrefecture(prefectureCode)}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {prefectureName}
                          </span>
                          <span className="text-xs font-medium text-text-muted">
                            {prefectureCount}
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

      <div className="m-5 mt-0 rounded-lg bg-background p-4">
        <p className="mb-3 text-sm font-black">
          表示中: {visiblePrefectureCount}都県 {visibleStationCount}駅
        </p>
        <div className="space-y-2 text-xs font-medium text-text-muted">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span>訪問済み -</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full border border-slate-400 bg-white" />
            <span>未訪問 {visibleStationCount}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
