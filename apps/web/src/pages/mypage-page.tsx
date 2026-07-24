import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PREFECTURE_NAME_BY_CODE } from '@michi-no-eki/shared'
import type {
  PrefectureProgress,
  RecentCheckin,
  Stats,
} from '@michi-no-eki/shared'

import type { AuthUser } from '@/contexts/auth-context'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'

type MyPageData = {
  stats: Stats
  checkins: RecentCheckin[]
  prefectureProgress: PrefectureProgress[]
}

type TabId = 'overview' | 'heatmap' | 'checkins'

const tabs = [
  { id: 'overview', label: '概要' },
  { id: 'heatmap', label: 'ヒートマップ' },
  { id: 'checkins', label: '訪問記録一覧' },
] as const satisfies readonly { id: TabId; label: string }[]

const monthFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
})

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function MyPagePage() {
  const { authState } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = getTabId(searchParams.get('tab'))
  const [data, setData] = useState<MyPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (authState.status !== 'logged-in') {
      setData(null)
      setError(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    async function loadMyPageData() {
      try {
        const [stats, checkins, prefectureProgress] = await Promise.all([
          fetchJson<Stats>('/api/me/stats', controller.signal),
          fetchJson<RecentCheckin[]>('/api/me/checkins', controller.signal),
          fetchJson<PrefectureProgress[]>(
            '/api/me/prefecture-progress',
            controller.signal,
          ),
        ])

        setData({ stats, checkins, prefectureProgress })
      } catch (unknownError) {
        if (
          unknownError instanceof DOMException &&
          unknownError.name === 'AbortError'
        ) {
          return
        }

        setError('マイページのデータを読み込めませんでした。')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadMyPageData()

    return () => {
      controller.abort()
    }
  }, [authState.status])

  function setActiveTab(tabId: TabId) {
    setSearchParams(tabId === 'overview' ? {} : { tab: tabId }, {
      replace: false,
    })
  }

  if (authState.status === 'loading') {
    return (
      <PageFrame>
        <CenteredPanel
          description="認証状態を確認しています。"
          title="マイページを読み込み中"
        />
      </PageFrame>
    )
  }

  if (authState.status === 'logged-out') {
    return (
      <PageFrame>
        <section className="mx-auto flex max-w-xl flex-col items-center rounded-lg border border-border bg-white px-6 py-10 text-center shadow-sm">
          <p className="text-sm font-bold text-primary">マイページ</p>
          <h1 className="mt-2 text-2xl font-black text-text">
            マイページを見るにはログイン
          </h1>
          <p className="mt-3 text-sm font-medium leading-6 text-text-muted">
            訪問した道の駅やチェックイン履歴を振り返るには、Google
            アカウントでログインしてください。
          </p>
          <a
            className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
            href="/auth/google/login"
          >
            Google でログイン
          </a>
        </section>
      </PageFrame>
    )
  }

  if (isLoading) {
    return (
      <PageFrame>
        <ProfileHeader checkins={[]} user={authState.user} />
        <CenteredPanel
          description="統計と訪問記録を取得しています。"
          title="データを読み込み中"
        />
      </PageFrame>
    )
  }

  if (error !== null || data === null) {
    return (
      <PageFrame>
        <ProfileHeader checkins={[]} user={authState.user} />
        <CenteredPanel
          description={error ?? 'しばらくしてから再度お試しください。'}
          title="読み込みに失敗しました"
        />
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <ProfileHeader checkins={data.checkins} user={authState.user} />
      <TabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <OverviewTab
          data={data}
          onShowHeatmap={() => setActiveTab('heatmap')}
        />
      )}
      {activeTab === 'heatmap' && <HeatmapPlaceholder />}
      {activeTab === 'checkins' && <CheckinsTab checkins={data.checkins} />}
    </PageFrame>
  )
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full overflow-y-auto bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
    </div>
  )
}

function ProfileHeader({
  checkins,
  user,
}: {
  checkins: RecentCheckin[]
  user: AuthUser
}) {
  const initial = getInitial(user)
  const joinedAt = formatMaybeDate(
    user.createdAt,
    monthFormatter,
    '利用開始日不明',
  )
  const lastCheckin = checkins[0]
  const lastCheckinText =
    lastCheckin === undefined
      ? 'チェックインなし'
      : `最終チェックイン ${formatMaybeDate(
          lastCheckin.visitedAt,
          dateFormatter,
          '日付不明',
        )}`

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {user.pictureUrl ? (
          <img
            alt={`${user.name} のアバター`}
            className="h-16 w-16 shrink-0 rounded-full border-2 border-primary bg-slate-100 object-cover"
            height={64}
            referrerPolicy="no-referrer"
            src={user.pictureUrl}
            width={64}
          />
        ) : (
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-primary bg-primary/10 text-xl font-black text-primary">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-primary">マイページ</p>
          <h1 className="mt-1 truncate text-2xl font-black text-text">
            {user.name}
          </h1>
          <p className="mt-2 text-sm font-medium text-text-muted">
            {joinedAt}から利用 ・ {lastCheckinText}
          </p>
        </div>
      </div>
    </section>
  )
}

function TabNav({
  activeTab,
  onChange,
}: {
  activeTab: TabId
  onChange: (tabId: TabId) => void
}) {
  return (
    <div className="overflow-x-auto border-b border-border">
      <div
        aria-label="マイページのタブ"
        className="flex min-w-max gap-2"
        role="tablist"
      >
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={cn(
              'h-11 rounded-t-lg border-b-2 px-4 text-sm font-bold transition-colors',
              activeTab === tab.id
                ? 'border-primary bg-white text-primary'
                : 'border-transparent text-text-muted hover:bg-white/70 hover:text-text',
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function OverviewTab({
  data,
  onShowHeatmap,
}: {
  data: MyPageData
  onShowHeatmap: () => void
}) {
  const visibleProgress = useMemo(
    () =>
      [...data.prefectureProgress]
        .filter((progress) => progress.visitedStationCount > 0)
        .sort((a, b) => b.progressRate - a.progressRate),
    [data.prefectureProgress],
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="訪問した道の駅"
          suffix="駅"
          value={data.stats.visitedStationCount}
        />
        <StatCard
          label="チェックイン回数"
          suffix="回"
          value={data.stats.checkinCount}
        />
        <StatCard
          label="訪問した都道府県"
          suffix="/47"
          value={data.stats.visitedPrefectureCount}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-black text-text">最近のチェックイン</h2>
            <Link
              className="text-sm font-bold text-primary hover:underline"
              to="/"
            >
              マップで見る →
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {data.checkins.length === 0 ? (
              <EmptyState text="まだチェックインがありません。" />
            ) : (
              data.checkins
                .slice(0, 5)
                .map((checkin) => (
                  <RecentCheckinItem checkin={checkin} key={checkin.id} />
                ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-black text-text">都道府県別の進捗</h2>
            <button
              className="text-sm font-bold text-primary hover:underline"
              onClick={onShowHeatmap}
              type="button"
            >
              ヒートマップタブへ →
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {visibleProgress.length === 0 ? (
              <EmptyState text="訪問済みの都道府県はまだありません。" />
            ) : (
              visibleProgress.map((progress) => (
                <PrefectureProgressRow
                  key={progress.prefectureCode}
                  progress={progress}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  suffix,
  value,
}: {
  label: string
  suffix: string
  value: number
}) {
  return (
    <article className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <p className="text-sm font-bold text-text-muted">{label}</p>
      <p className="mt-4 flex items-baseline gap-1 text-primary">
        <span className="text-4xl font-black tabular-nums">{value}</span>
        <span className="text-base font-black">{suffix}</span>
      </p>
    </article>
  )
}

function RecentCheckinItem({ checkin }: { checkin: RecentCheckin }) {
  return (
    <article className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-background p-3">
      <div
        aria-hidden="true"
        className="h-14 w-16 shrink-0 rounded-md border border-border bg-[repeating-linear-gradient(135deg,theme(colors.slate.100)_0,theme(colors.slate.100)_8px,theme(colors.slate.200)_8px,theme(colors.slate.200)_16px)]"
      />
      <div className="min-w-0">
        <h3 className="truncate text-sm font-black text-text">
          {checkin.stationName}
        </h3>
        <p className="mt-1 text-xs font-medium text-text-muted">
          {getPrefectureName(checkin.prefectureCode)} ・{' '}
          {formatMaybeDate(checkin.visitedAt, dateFormatter, '日付不明')}
        </p>
      </div>
    </article>
  )
}

function PrefectureProgressRow({ progress }: { progress: PrefectureProgress }) {
  const percent = Math.round(progress.progressRate * 100)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-bold text-text">
          {getPrefectureName(progress.prefectureCode)}
        </span>
        <span className="shrink-0 font-bold tabular-nums text-text-muted">
          {progress.visitedStationCount}/{progress.totalStationCount} ・{' '}
          {percent}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function HeatmapPlaceholder() {
  return (
    <CenteredPanel
      description="全国タイルグリッドのヒートマップは Phase 5b で実装予定です。"
      title="準備中（Phase 5b）"
    />
  )
}

function CheckinsTab({ checkins }: { checkins: RecentCheckin[] }) {
  return (
    <section className="rounded-lg border border-border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-black text-text">訪問記録一覧</h2>
          <p className="mt-1 text-sm font-medium text-text-muted">
            最新50件のチェックインを表示しています。
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {checkins.length === 0 ? (
          <EmptyState text="まだチェックインがありません。" />
        ) : (
          checkins.map((checkin) => (
            <article
              className="rounded-lg border border-border bg-background p-4"
              key={checkin.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-text">
                    {checkin.stationName}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-text-muted">
                    {getPrefectureName(checkin.prefectureCode)}
                  </p>
                </div>
                <time
                  className="shrink-0 text-sm font-bold text-text-muted"
                  dateTime={new Date(checkin.visitedAt).toISOString()}
                >
                  {formatMaybeDate(
                    checkin.visitedAt,
                    dateTimeFormatter,
                    '日付不明',
                  )}
                </time>
              </div>
              {checkin.memo ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-text">
                  {checkin.memo}
                </p>
              ) : (
                <p className="mt-3 text-sm font-medium text-text-subtle">
                  メモなし
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function CenteredPanel({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <section className="rounded-lg border border-border bg-white px-6 py-10 text-center shadow-sm">
      <h1 className="text-xl font-black text-text">{title}</h1>
      <p className="mt-3 text-sm font-medium text-text-muted">{description}</p>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm font-medium text-text-muted">
      {text}
    </div>
  )
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

function getTabId(value: string | null): TabId {
  if (value === 'heatmap' || value === 'checkins') {
    return value
  }

  return 'overview'
}

function getInitial(user: AuthUser) {
  return user.name.trim().charAt(0) || user.email.trim().charAt(0) || '?'
}

function getPrefectureName(prefectureCode: number) {
  return PREFECTURE_NAME_BY_CODE[prefectureCode] ?? `都道府県${prefectureCode}`
}

function formatMaybeDate(
  value: number | undefined,
  formatter: Intl.DateTimeFormat,
  fallback: string,
) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return formatter.format(new Date(value))
}
