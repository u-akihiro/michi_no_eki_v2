import { useEffect, useMemo, useRef, useState } from 'react'
import { PREFECTURE_NAME_BY_CODE } from '@michi-no-eki/shared'
import type { PrefectureProgress } from '@michi-no-eki/shared'

import japanMapSvg from '@/assets/japan-prefectures.svg?raw'
import { cn } from '@/lib/utils'

type HeatmapMetric = 'rate' | 'count'

type TooltipState = {
  code: number
  x: number
  y: number
  visible: boolean
}

type PrefectureHeatmapProps = {
  prefectureProgress: PrefectureProgress[]
}

const metricOptions = [
  { id: 'rate', label: '訪問率' },
  { id: 'count', label: '訪問件数' },
] as const satisfies readonly { id: HeatmapMetric; label: string }[]

const heatmapLevels = [1, 2, 3, 4, 5, 6] as const

export function PrefectureHeatmap({
  prefectureProgress,
}: PrefectureHeatmapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [metric, setMetric] = useState<HeatmapMetric>('rate')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [selectedCode, setSelectedCode] = useState<number | null>(null)

  const progressByCode = useMemo(() => {
    return new Map(
      prefectureProgress.map((progress) => [progress.prefectureCode, progress]),
    )
  }, [prefectureProgress])

  const maxVisitedCount = useMemo(
    () =>
      Math.max(
        0,
        ...prefectureProgress.map((progress) => progress.visitedStationCount),
      ),
    [prefectureProgress],
  )

  const totals = useMemo(() => {
    const visitedStationCount = prefectureProgress.reduce(
      (sum, progress) => sum + progress.visitedStationCount,
      0,
    )
    const totalStationCount = prefectureProgress.reduce(
      (sum, progress) => sum + progress.totalStationCount,
      0,
    )

    return {
      progressRate:
        totalStationCount > 0 ? visitedStationCount / totalStationCount : 0,
      totalStationCount,
      visitedStationCount,
    }
  }, [prefectureProgress])

  const ranking = useMemo(() => {
    // 未訪問(0件)の県はランキングに出さない（概要タブの進捗表示と方針を揃える）。
    return prefectureProgress
      .filter((progress) => progress.visitedStationCount > 0)
      .sort((a, b) => {
        const primary =
          metric === 'rate'
            ? b.progressRate - a.progressRate
            : b.visitedStationCount - a.visitedStationCount

        if (primary !== 0) {
          return primary
        }

        return b.progressRate - a.progressRate
      })
  }, [metric, prefectureProgress])

  // SVG は一度だけ ref 経由で注入する。dangerouslySetInnerHTML だと再レンダー
  // 時に React が innerHTML を巻き戻し、下の塗り分け(命令的 DOM 変更)が消える。
  useEffect(() => {
    const mapElement = mapRef.current

    if (mapElement === null || mapElement.querySelector('svg') !== null) {
      return
    }

    mapElement.innerHTML = japanMapSvg
    const svgElement = mapElement.querySelector('svg')
    svgElement?.setAttribute('role', 'img')
    svgElement?.setAttribute(
      'aria-label',
      '都道府県別の道の駅訪問状況ヒートマップ',
    )
  }, [])

  useEffect(() => {
    const mapElement = mapRef.current

    if (mapElement === null) {
      return
    }

    const prefectureElements = Array.from(
      mapElement.querySelectorAll<SVGGElement>('.prefecture'),
    )

    const showTooltip = (
      event: { clientX: number; clientY: number },
      code: number,
    ) => {
      const rect = mapElement.getBoundingClientRect()
      const x = Math.min(Math.max(event.clientX - rect.left, 8), rect.width - 8)
      const y = Math.min(
        Math.max(event.clientY - rect.top, 52),
        rect.height - 8,
      )

      setTooltip({
        code,
        visible: true,
        x,
        y,
      })
    }

    const hideTooltip = () =>
      setTooltip((current) =>
        current === null ? current : { ...current, visible: false },
      )

    const cleanups = prefectureElements.map((element) => {
      const code = Number(element.dataset.code)
      const progress = getProgress(progressByCode, code)
      const level = getHeatmapLevel(progress, metric, maxVisitedCount)

      element.style.fill = `var(--color-heatmap-${level})`
      element.style.stroke =
        selectedCode === code
          ? 'var(--color-primary)'
          : 'rgba(255, 255, 255, 0.88)'
      element.style.strokeWidth = selectedCode === code ? '2.6' : '1.4'
      element.style.cursor = 'pointer'
      element.style.transition = 'fill 160ms ease, opacity 160ms ease'
      element.setAttribute('tabindex', '0')
      element.setAttribute('role', 'button')
      element.setAttribute('aria-label', getProgressLabel(progress))

      const handlePointerEnter = (event: PointerEvent) => {
        setSelectedCode(code)
        showTooltip(event, code)
      }
      const handlePointerMove = (event: PointerEvent) => {
        // マウス追従はホバー中のみ。タッチはタップ位置で固定表示する。
        if (event.pointerType === 'mouse') {
          showTooltip(event, code)
        }
      }
      const handlePointerLeave = (event: PointerEvent) => {
        // タッチはタップで固定表示したいので、マウスのホバー離脱時だけ隠す。
        if (event.pointerType === 'mouse') {
          hideTooltip()
        }
      }
      const handleClick = (event: MouseEvent) => {
        // タップ（およびクリック）で件数・%を表示・固定する。
        setSelectedCode(code)
        showTooltip(event, code)
      }
      const handleFocus = () => {
        setSelectedCode(code)
      }

      element.addEventListener('pointerenter', handlePointerEnter)
      element.addEventListener('pointermove', handlePointerMove)
      element.addEventListener('pointerleave', handlePointerLeave)
      element.addEventListener('click', handleClick)
      element.addEventListener('focus', handleFocus)

      return () => {
        element.removeEventListener('pointerenter', handlePointerEnter)
        element.removeEventListener('pointermove', handlePointerMove)
        element.removeEventListener('pointerleave', handlePointerLeave)
        element.removeEventListener('click', handleClick)
        element.removeEventListener('focus', handleFocus)
      }
    })

    // 県以外（海・余白）をクリック/タップしたらツールチップを閉じる。
    const handleMapClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target !== null && target.closest('.prefecture') !== null) {
        return
      }
      hideTooltip()
    }
    mapElement.addEventListener('click', handleMapClick)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
      mapElement.removeEventListener('click', handleMapClick)
    }
  }, [maxVisitedCount, metric, progressByCode, selectedCode])

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-text">
              都道府県別ヒートマップ
            </h2>
            <p className="mt-1 text-sm font-medium text-text-muted">
              訪問した道の駅の割合と件数を、日本地図上で確認できます。
            </p>
          </div>
          <div
            aria-label="ヒートマップの指標"
            className="grid w-full grid-cols-2 rounded-lg bg-background p-1 sm:w-64"
            role="tablist"
          >
            {metricOptions.map((option) => (
              <button
                aria-selected={metric === option.id}
                className={cn(
                  'h-9 rounded-md text-sm font-bold transition-colors',
                  metric === option.id
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-muted hover:text-text',
                )}
                key={option.id}
                onClick={() => setMetric(option.id)}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="relative overflow-hidden rounded-lg border border-border bg-background p-3 sm:p-5">
              <div
                className="[&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-[68vh] [&_svg]:w-full [&_svg]:max-w-[720px]"
                ref={mapRef}
              />
              {tooltip?.visible ? (
                <div
                  className="pointer-events-none absolute z-10 max-w-56 rounded-md border border-border bg-white px-3 py-2 text-xs font-bold text-text shadow-lg"
                  style={{
                    left: tooltip.x,
                    top: tooltip.y,
                    transform: 'translate(12px, -110%)',
                  }}
                >
                  {getProgressLabel(getProgress(progressByCode, tooltip.code))}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <Legend metric={metric} maxVisitedCount={maxVisitedCount} />
              <p className="text-xs font-medium text-text-subtle">
                地図: © Geolonia (GFDL)
              </p>
            </div>
          </div>

          <aside className="min-w-0 rounded-lg border border-border bg-background p-4">
            <h3 className="text-base font-black text-text">
              都道府県ランキング
            </h3>
            <p className="mt-1 text-xs font-bold text-text-muted">
              {metric === 'rate' ? '訪問率順' : '訪問件数順'}
            </p>
            <div className="mt-4 max-h-[560px] overflow-y-auto pr-1">
              {ranking.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-white px-4 py-8 text-center text-sm font-medium text-text-muted">
                  まだ訪問した都道府県はありません。
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {ranking.map((progress, index) => (
                    <RankingRow
                      isSelected={selectedCode === progress.prefectureCode}
                      key={progress.prefectureCode}
                      maxVisitedCount={maxVisitedCount}
                      metric={metric}
                      progress={progress}
                      rank={index + 1}
                      onSelect={setSelectedCode}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-white p-5 shadow-sm sm:max-w-sm">
        <p className="text-sm font-bold text-text-muted">全国進捗</p>
        <p className="mt-3 text-2xl font-black tabular-nums text-primary">
          {totals.visitedStationCount} / {totals.totalStationCount}駅
        </p>
        <p className="mt-1 text-sm font-bold text-text-muted">
          {formatPercent(totals.progressRate)}%
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary/10">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${formatPercent(totals.progressRate)}%` }}
          />
        </div>
      </section>
    </div>
  )
}

function Legend({
  maxVisitedCount,
  metric,
}: {
  maxVisitedCount: number
  metric: HeatmapMetric
}) {
  return (
    <div>
      <p className="text-xs font-bold text-text-muted">凡例</p>
      <div className="mt-2 flex items-center gap-1">
        {heatmapLevels.map((level) => (
          <div
            aria-hidden="true"
            className="h-4 w-9 first:rounded-l-md last:rounded-r-md"
            key={level}
            style={{ backgroundColor: `var(--color-heatmap-${level})` }}
          />
        ))}
      </div>
      <div className="mt-1 flex w-[14.5rem] items-center justify-between text-[11px] font-bold text-text-subtle">
        <span>0</span>
        <span>{metric === 'rate' ? '100%' : `${maxVisitedCount}件`}</span>
      </div>
    </div>
  )
}

function RankingRow({
  isSelected,
  maxVisitedCount,
  metric,
  onSelect,
  progress,
  rank,
}: {
  isSelected: boolean
  maxVisitedCount: number
  metric: HeatmapMetric
  onSelect: (prefectureCode: number) => void
  progress: PrefectureProgress
  rank: number
}) {
  const barPercent =
    metric === 'rate'
      ? formatPercent(progress.progressRate)
      : maxVisitedCount > 0
        ? Math.round((progress.visitedStationCount / maxVisitedCount) * 100)
        : 0

  return (
    <button
      className={cn(
        'w-full rounded-lg border bg-white p-3 text-left transition-colors hover:border-primary/50',
        isSelected ? 'border-primary' : 'border-border',
      )}
      onClick={() => onSelect(progress.prefectureCode)}
      type="button"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 font-black text-text">
          <span className="mr-2 inline-block w-6 text-right tabular-nums text-text-muted">
            {rank}
          </span>
          {getPrefectureName(progress.prefectureCode)}
        </span>
        <span className="shrink-0 text-xs font-bold tabular-nums text-text-muted">
          {progress.visitedStationCount}/{progress.totalStationCount} ・{' '}
          {formatPercent(progress.progressRate)}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${barPercent}%` }}
        />
      </div>
    </button>
  )
}

function getHeatmapLevel(
  progress: PrefectureProgress,
  metric: HeatmapMetric,
  maxVisitedCount: number,
) {
  if (metric === 'count') {
    if (progress.visitedStationCount <= 0 || maxVisitedCount <= 0) {
      return 1
    }

    return Math.min(
      6,
      Math.max(
        2,
        Math.ceil((progress.visitedStationCount / maxVisitedCount) * 5) + 1,
      ),
    )
  }

  if (progress.progressRate <= 0) {
    return 1
  }

  return Math.min(6, Math.max(2, Math.ceil(progress.progressRate * 5) + 1))
}

function getProgress(
  progressByCode: ReadonlyMap<number, PrefectureProgress>,
  prefectureCode: number,
): PrefectureProgress {
  return (
    progressByCode.get(prefectureCode) ?? {
      prefectureCode,
      progressRate: 0,
      totalStationCount: 0,
      visitedStationCount: 0,
    }
  )
}

function getProgressLabel(progress: PrefectureProgress) {
  return `${getPrefectureName(progress.prefectureCode)}: ${progress.visitedStationCount}/${progress.totalStationCount}駅 ・ ${formatPercent(progress.progressRate)}%`
}

function getPrefectureName(prefectureCode: number) {
  return PREFECTURE_NAME_BY_CODE[prefectureCode] ?? `都道府県${prefectureCode}`
}

function formatPercent(value: number) {
  return Math.round(value * 100)
}
