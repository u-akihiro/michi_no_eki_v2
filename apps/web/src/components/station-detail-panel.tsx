import { PREFECTURE_NAME_BY_CODE } from '@michi-no-eki/shared'
import type { Checkin, Station, VisitSummary } from '@michi-no-eki/shared'

import { Button } from './ui/button'

type StationDetailPanelProps = {
  checkins: Checkin[]
  isCheckinPending: boolean
  isCheckinsLoading: boolean
  isLoggedIn: boolean
  onCheckin: (station: Station) => void
  onClose: () => void
  station: Station
  visitSummary: VisitSummary | undefined
}

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTimestamp(timestamp: number) {
  return dateTimeFormatter.format(new Date(timestamp))
}

function login() {
  window.location.href = '/auth/google/login'
}

export function StationDetailPanel({
  checkins,
  isCheckinPending,
  isCheckinsLoading,
  isLoggedIn,
  onCheckin,
  onClose,
  station,
  visitSummary,
}: StationDetailPanelProps) {
  const prefectureName =
    PREFECTURE_NAME_BY_CODE[station.prefectureCode] ??
    `Prefecture ${station.prefectureCode}`
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`

  return (
    <div className="pointer-events-none absolute inset-0 z-[1100] overflow-hidden">
      <button
        aria-label="詳細パネルを閉じる"
        className="pointer-events-auto absolute inset-0 bg-slate-950/15 md:bg-transparent"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label={`${station.name}の詳細`}
        className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[82dvh] min-h-0 flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-16px_48px_oklch(0.2_0.04_250_/_0.28)] md:inset-x-auto md:inset-y-0 md:right-0 md:h-full md:max-h-none md:w-[440px] md:rounded-none md:shadow-[0_12px_48px_oklch(0.2_0.04_250_/_0.24)]"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-xs font-black text-text-muted">道の駅詳細</p>
          <button
            aria-label="詳細パネルを閉じる"
            className="grid h-9 w-9 place-items-center rounded-full text-xl font-bold text-text-muted hover:bg-background hover:text-text"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="h-44 bg-[repeating-linear-gradient(135deg,oklch(0.88_0.045_250)_0_10px,oklch(0.95_0.012_245)_10px_20px)] md:h-56" />

          <div className="space-y-5 px-5 py-5">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-background px-3 py-1 text-xs font-bold text-text-muted">
                  {prefectureName}
                </span>
                {visitSummary !== undefined && (
                  <span className="rounded-full bg-primary px-3 py-1 text-xs font-black text-white">
                    ✓訪問済み・{visitSummary.visitCount}回
                  </span>
                )}
              </div>
              <h2 className="text-[21px] font-black leading-tight text-text">
                {station.name}
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-text-muted">
                {station.address}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                className="inline-flex h-9 items-center justify-center rounded-lg border-[1.5px] border-border px-4 text-sm font-bold text-text shadow-sm transition-colors hover:border-primary hover:text-primary"
                href={routeUrl}
                rel="noreferrer"
                target="_blank"
              >
                経路案内
              </a>
              {station.homepageUrl !== null && (
                <a
                  className="inline-flex h-9 items-center justify-center rounded-lg border-[1.5px] border-border px-4 text-sm font-bold text-text shadow-sm transition-colors hover:border-primary hover:text-primary"
                  href={station.homepageUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  ホームページ
                </a>
              )}
            </div>

            {isLoggedIn ? (
              <Button
                className="w-full"
                disabled={isCheckinPending}
                onClick={() => onCheckin(station)}
                type="button"
              >
                {isCheckinPending ? 'チェックイン中...' : 'チェックインする'}
              </Button>
            ) : (
              <Button className="w-full" onClick={login} type="button">
                ログインしてチェックイン
              </Button>
            )}

            {isLoggedIn && (
              <section className="border-t border-border pt-5">
                <h3 className="text-sm font-black text-text">
                  あなたの訪問記録
                </h3>
                {isCheckinsLoading ? (
                  <p className="mt-3 text-sm font-medium text-text-muted">
                    訪問記録を読み込み中...
                  </p>
                ) : checkins.length === 0 ? (
                  <p className="mt-3 rounded-lg bg-background px-4 py-3 text-sm font-medium text-text-muted">
                    まだ訪問記録はありません
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {checkins.map((checkin) => (
                      <article
                        className="rounded-lg border border-border bg-white px-4 py-3"
                        key={checkin.id}
                      >
                        <time
                          className="text-sm font-black text-text"
                          dateTime={new Date(checkin.visitedAt).toISOString()}
                        >
                          {formatTimestamp(checkin.visitedAt)}
                        </time>
                        {checkin.memo !== null && checkin.memo.length > 0 && (
                          <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-text-muted">
                            {checkin.memo}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
