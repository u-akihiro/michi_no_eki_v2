import { useEffect, useRef, useState } from 'react'

import { PREFECTURE_NAME_BY_CODE, REGIONS } from '@michi-no-eki/shared'
import type { Region } from '@michi-no-eki/shared'

import { Button } from './ui/button'

type StationFilterProps = {
  countsByPrefectureCode: ReadonlyMap<number, number>
  countsByRegionName: ReadonlyMap<Region['name'], number>
  onChange: (nextSelectedPrefectureCodes: Set<number>) => void
  selectedPrefectureCodes: ReadonlySet<number>
}

type RegionSelectionState = 'all' | 'partial' | 'none'

function getRegionSelectionState(
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

function RegionCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
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
      className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
      onChange={onChange}
      ref={ref}
      type="checkbox"
    />
  )
}

export function StationFilter({
  countsByPrefectureCode,
  countsByRegionName,
  onChange,
  selectedPrefectureCodes,
}: StationFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedRegionNames, setExpandedRegionNames] = useState<
    ReadonlySet<Region['name']>
  >(() => new Set(REGIONS.map((region) => region.name)))

  const allPrefectureCodes = REGIONS.flatMap((region) => region.prefectureCodes)
  const selectedCount = allPrefectureCodes.filter((prefectureCode) =>
    selectedPrefectureCodes.has(prefectureCode),
  ).length

  function handleSelectAll() {
    onChange(new Set(allPrefectureCodes))
  }

  function handleClearAll() {
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
    <div
      className="w-72 max-w-[calc(100vw-1.5rem)] rounded-md bg-white/95 text-sm text-slate-900 shadow"
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <Button
        aria-expanded={isOpen}
        className="h-9 w-full justify-between px-3"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>表示フィルタ</span>
        <span className="text-xs font-normal text-slate-600">
          {selectedCount}/47
        </span>
      </Button>

      {isOpen && (
        <div className="border-t border-slate-200 p-3">
          <div className="mb-3 flex gap-2">
            <Button
              className="h-8 flex-1 px-2 text-xs"
              onClick={handleSelectAll}
              type="button"
            >
              全選択
            </Button>
            <Button
              className="h-8 flex-1 px-2 text-xs"
              onClick={handleClearAll}
              type="button"
            >
              全解除
            </Button>
          </div>

          <div className="max-h-[min(28rem,calc(100vh-9rem))] space-y-2 overflow-y-auto pr-1">
            {REGIONS.map((region) => {
              const selectionState = getRegionSelectionState(
                region,
                selectedPrefectureCodes,
              )
              const isExpanded = expandedRegionNames.has(region.name)
              const regionCount = countsByRegionName.get(region.name) ?? 0

              return (
                <section key={region.name}>
                  <div className="flex items-center gap-2">
                    <RegionCheckbox
                      checked={selectionState === 'all'}
                      indeterminate={selectionState === 'partial'}
                      label={`${region.name}を切り替え`}
                      onChange={() => toggleRegion(region)}
                    />
                    <button
                      aria-expanded={isExpanded}
                      className="flex min-w-0 flex-1 items-center justify-between rounded px-1 py-1 text-left hover:bg-slate-100"
                      onClick={() => toggleRegionExpansion(region.name)}
                      type="button"
                    >
                      <span className="truncate font-medium">
                        {region.name} ({regionCount})
                      </span>
                      <span
                        aria-hidden="true"
                        className="ml-2 text-xs text-slate-500"
                      >
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-1 space-y-1 pl-6">
                      {region.prefectureCodes.map((prefectureCode) => {
                        const prefectureName =
                          PREFECTURE_NAME_BY_CODE[prefectureCode]
                        const prefectureCount =
                          countsByPrefectureCode.get(prefectureCode) ?? 0

                        return (
                          <label
                            className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-100"
                            key={prefectureCode}
                          >
                            <input
                              checked={selectedPrefectureCodes.has(
                                prefectureCode,
                              )}
                              className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                              onChange={() => togglePrefecture(prefectureCode)}
                              type="checkbox"
                            />
                            <span className="min-w-0 truncate">
                              {prefectureName} ({prefectureCount})
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
