import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'

import { PREFECTURE_NAME_BY_CODE, REGIONS } from '@michi-no-eki/shared'
import type { Checkin, Station, VisitSummary } from '@michi-no-eki/shared'

import { StationDetailPanel } from './station-detail-panel'
import { StationFilter } from './station-filter'
import type { VisitStatus } from './station-filter'
import { Button } from './ui/button'

import { useAuth } from '@/contexts/auth-context'
import { useStationSearch } from '@/contexts/station-search-context'

const JAPAN_CENTER: [number, number] = [36.5, 138]
const INITIAL_ZOOM = 5
const SEARCH_ZOOM = 12
const PREFECTURE_CLUSTER_ZOOM_THRESHOLD = 10
const STATION_LABEL_ZOOM_THRESHOLD = 11
const CLUSTER_FIT_BOUNDS_PADDING = L.point(32, 32)
const VIEWPORT_PADDING_RATIO = 0.25
const GEOLOCATION_TIMEOUT_MS = 6000

type PrefectureCluster = {
  prefectureCode: number
  prefectureName: string
  stations: Station[]
  position: [number, number]
}

type NearestStation = {
  distanceKm: number
  station: Station
}

function createStationIcon({
  isSelected,
  isVisited,
}: {
  isSelected: boolean
  isVisited: boolean
}) {
  const dotSize = isSelected ? 20 : isVisited ? 16 : 14
  const containerWidth = isSelected ? 30 : 22
  const containerHeight = isSelected ? 32 : 24
  const dotLeft = (containerWidth - dotSize) / 2
  const dotTop = isSelected ? 1 : 1
  const stemTop = dotTop + dotSize - 1
  const background = isVisited ? 'var(--color-primary)' : '#ffffff'
  const border = isVisited ? '#ffffff' : '#94a3b8'
  const ring = isSelected
    ? `<div style="
      border: 3px solid oklch(0.74 0.12 250 / 0.72);
      border-radius: 9999px;
      height: ${dotSize + 10}px;
      left: ${dotLeft - 5}px;
      position: absolute;
      top: ${dotTop - 5}px;
      width: ${dotSize + 10}px;
    "></div>`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="
      height: ${containerHeight}px;
      position: relative;
      width: ${containerWidth}px;
    ">
      ${ring}
      <div style="
        background: ${background};
        border: 2px solid ${border};
        border-radius: 9999px;
        box-shadow: 0 2px 8px oklch(0.3 0.03 250 / 0.34);
        height: ${dotSize}px;
        left: ${dotLeft}px;
        position: absolute;
        top: ${dotTop}px;
        width: ${dotSize}px;
      "></div>
      <div style="
        background: #334155;
        border-radius: 9999px;
        height: 8px;
        left: ${(containerWidth - 2) / 2}px;
        position: absolute;
        top: ${stemTop}px;
        width: 2px;
      "></div>
    </div>`,
    iconAnchor: [containerWidth / 2, containerHeight - 2],
    iconSize: [containerWidth, containerHeight],
    popupAnchor: [0, -(containerHeight - 2)],
    tooltipAnchor: [0, 4],
  })
}

const UNVISITED_STATION_ICON = createStationIcon({
  isSelected: false,
  isVisited: false,
})
const VISITED_STATION_ICON = createStationIcon({
  isSelected: false,
  isVisited: true,
})
const SELECTED_UNVISITED_STATION_ICON = createStationIcon({
  isSelected: true,
  isVisited: false,
})
const SELECTED_VISITED_STATION_ICON = createStationIcon({
  isSelected: true,
  isVisited: true,
})

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase('ja-JP')
}

function createPrefectureClusterIcon(count: number) {
  return L.divIcon({
    className: '',
    html: `<div style="
      align-items: center;
      background: var(--color-primary);
      border: 3px solid #ffffff;
      border-radius: 9999px;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.25);
      color: #ffffff;
      display: flex;
      font: 700 14px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      height: 44px;
      justify-content: center;
      min-width: 44px;
      padding: 0 8px;
      white-space: nowrap;
    ">${count}</div>`,
    iconAnchor: [22, 22],
    iconSize: [44, 44],
    popupAnchor: [0, -22],
  })
}

function createPrefectureClusters(stations: Station[]) {
  const stationsByPrefecture = new Map<number, Station[]>()

  for (const station of stations) {
    const prefectureStations =
      stationsByPrefecture.get(station.prefectureCode) ?? []

    prefectureStations.push(station)
    stationsByPrefecture.set(station.prefectureCode, prefectureStations)
  }

  return Array.from(stationsByPrefecture.entries())
    .map(([prefectureCode, prefectureStations]): PrefectureCluster => {
      const total = prefectureStations.length
      const latitude =
        prefectureStations.reduce((sum, station) => sum + station.latitude, 0) /
        total
      const longitude =
        prefectureStations.reduce(
          (sum, station) => sum + station.longitude,
          0,
        ) / total

      return {
        prefectureCode,
        prefectureName:
          PREFECTURE_NAME_BY_CODE[prefectureCode] ??
          `Prefecture ${prefectureCode}`,
        stations: prefectureStations,
        position: [latitude, longitude],
      }
    })
    .sort((a, b) => a.prefectureCode - b.prefectureCode)
}

function fitPrefectureStations(map: L.Map, stations: Station[]) {
  if (stations.length === 0) {
    return
  }

  if (stations.length === 1) {
    const station = stations[0]!

    map.setView(
      [station.latitude, station.longitude],
      PREFECTURE_CLUSTER_ZOOM_THRESHOLD,
    )
    return
  }

  const bounds = L.latLngBounds(
    stations.map((station) => [station.latitude, station.longitude]),
  )
  const fitBoundsZoom = map.getBoundsZoom(
    bounds,
    false,
    CLUSTER_FIT_BOUNDS_PADDING,
  )

  if (fitBoundsZoom < PREFECTURE_CLUSTER_ZOOM_THRESHOLD) {
    map.setView(bounds.getCenter(), PREFECTURE_CLUSTER_ZOOM_THRESHOLD)
    return
  }

  map.fitBounds(bounds, {
    padding: CLUSTER_FIT_BOUNDS_PADDING,
  })
}

function calculateDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371
  const fromLatitude = (from.latitude * Math.PI) / 180
  const toLatitude = (to.latitude * Math.PI) / 180
  const latitudeDelta = ((to.latitude - from.latitude) * Math.PI) / 180
  const longitudeDelta = ((to.longitude - from.longitude) * Math.PI) / 180
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2)

  return (
    earthRadiusKm *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

function findNearestStation(
  stations: Station[],
  position: { latitude: number; longitude: number },
): NearestStation | null {
  let nearestStation: NearestStation | null = null

  for (const station of stations) {
    const distanceKm = calculateDistanceKm(position, {
      latitude: station.latitude,
      longitude: station.longitude,
    })

    if (nearestStation === null || distanceKm < nearestStation.distanceKm) {
      nearestStation = { distanceKm, station }
    }
  }

  return nearestStation
}

function MapZoomWatcher({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void
}) {
  const map = useMap()

  useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom())
    },
  })

  return null
}

function MapResizeWatcher({ token }: { token: string }) {
  const map = useMap()

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      map.invalidateSize()
    }, 180)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [map, token])

  return null
}

function SearchPanWatcher({
  onZoomChange,
  stations,
  submittedQuery,
}: {
  onZoomChange: (zoom: number) => void
  stations: Station[]
  submittedQuery: string
}) {
  const map = useMap()
  const lastSubmittedQueryRef = useRef('')

  useEffect(() => {
    const normalizedSubmittedQuery = normalizeSearchText(submittedQuery)

    if (
      normalizedSubmittedQuery.length === 0 ||
      normalizedSubmittedQuery === lastSubmittedQueryRef.current
    ) {
      return
    }

    lastSubmittedQueryRef.current = normalizedSubmittedQuery

    const matchedStations = stations.filter((candidate) =>
      normalizeSearchText(candidate.name).includes(normalizedSubmittedQuery),
    )

    if (matchedStations.length === 0) {
      return
    }

    if (matchedStations.length === 1) {
      const station = matchedStations[0]!

      map.setView([station.latitude, station.longitude], SEARCH_ZOOM)
    } else {
      // 複数該当時は 1 件だけにズームせず、全該当駅が収まる範囲に合わせる。
      const bounds = L.latLngBounds(
        matchedStations.map((station) => [station.latitude, station.longitude]),
      )

      map.fitBounds(bounds, {
        maxZoom: SEARCH_ZOOM,
        padding: CLUSTER_FIT_BOUNDS_PADDING,
      })
    }

    // programmatic な setView / fitBounds は zoomend が発火しないことがあり、
    // クラスタ/個別ピンを切り替える zoom state が更新されないため確定的に同期する。
    onZoomChange(map.getZoom())
  }, [map, onZoomChange, stations, submittedQuery])

  return null
}

function StationMapMarkers({
  onStationSelect,
  selectedStationId,
  stations,
  visitsByStationId,
  zoom,
}: {
  onStationSelect: (station: Station) => void
  selectedStationId: string | null
  stations: Station[]
  visitsByStationId: ReadonlyMap<string, VisitSummary>
  zoom: number
}) {
  const map = useMap()
  const [bounds, setBounds] = useState(() => map.getBounds())
  const [isZooming, setIsZooming] = useState(false)

  useMapEvents({
    moveend: () => setBounds(map.getBounds()),
    zoomstart: () => setIsZooming(true),
    zoomend: () => {
      setBounds(map.getBounds())
      setIsZooming(false)
    },
  })

  const prefectureClusters = useMemo(
    () => createPrefectureClusters(stations),
    [stations],
  )

  const clusterIconByCount = useMemo(() => {
    const icons = new Map<number, L.DivIcon>()

    for (const cluster of prefectureClusters) {
      if (!icons.has(cluster.stations.length)) {
        icons.set(
          cluster.stations.length,
          createPrefectureClusterIcon(cluster.stations.length),
        )
      }
    }

    return icons
  }, [prefectureClusters])

  if (zoom < PREFECTURE_CLUSTER_ZOOM_THRESHOLD) {
    return (
      <>
        {prefectureClusters.map((cluster) => (
          <Marker
            eventHandlers={{
              click: () => {
                fitPrefectureStations(map, cluster.stations)
              },
            }}
            icon={
              clusterIconByCount.get(cluster.stations.length) ??
              createPrefectureClusterIcon(cluster.stations.length)
            }
            key={cluster.prefectureCode}
            position={cluster.position}
            title={`${cluster.prefectureName}: ${cluster.stations.length}`}
          />
        ))}
      </>
    )
  }

  const paddedBounds = bounds.pad(VIEWPORT_PADDING_RATIO)
  const visibleStations = stations.filter((station) =>
    paddedBounds.contains([station.latitude, station.longitude]),
  )

  return (
    <>
      {visibleStations.map((station) => {
        const isVisited = visitsByStationId.has(station.id)
        const isSelected = station.id === selectedStationId
        const icon = isSelected
          ? isVisited
            ? SELECTED_VISITED_STATION_ICON
            : SELECTED_UNVISITED_STATION_ICON
          : isVisited
            ? VISITED_STATION_ICON
            : UNVISITED_STATION_ICON

        return (
          <Marker
            eventHandlers={{
              click: () => onStationSelect(station),
            }}
            icon={icon}
            key={station.id}
            position={[station.latitude, station.longitude]}
            zIndexOffset={isSelected ? 1000 : 0}
          >
            {zoom >= STATION_LABEL_ZOOM_THRESHOLD && !isZooming && (
              <Tooltip
                className="station-label"
                direction="bottom"
                offset={[0, 8]}
                permanent
              >
                {station.name}
              </Tooltip>
            )}
          </Marker>
        )
      })}
    </>
  )
}

function NearbyStationCard({
  isCheckinPending,
  isLoggedIn,
  nearestStation,
  onCheckin,
  onSelect,
}: {
  isCheckinPending: boolean
  isLoggedIn: boolean
  nearestStation: NearestStation
  onCheckin: (station: Station) => void
  onSelect: (station: Station) => void
}) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[1000] w-[min(320px,calc(100vw-2rem))] rounded-xl bg-white p-4 shadow-[0_4px_24px_oklch(0.3_0.03_250_/_0.12)]">
      <p className="mb-3 text-xs font-black text-text-muted">
        現在地から近い道の駅
      </p>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 rounded-lg bg-[repeating-linear-gradient(45deg,oklch(0.88_0.045_250)_0_6px,oklch(0.94_0.02_250)_6px_12px)]" />
        <div className="min-w-0 flex-1">
          <button
            className="block max-w-full truncate text-left text-sm font-black text-text hover:text-primary"
            onClick={() => onSelect(nearestStation.station)}
            type="button"
          >
            {nearestStation.station.name}
          </button>
          <p className="mt-1 truncate text-xs font-medium text-text-muted">
            {nearestStation.station.address}
          </p>
          <p className="mt-1 text-xs font-medium text-text-muted">
            約{nearestStation.distanceKm.toFixed(1)}km
          </p>
        </div>
        <Button
          disabled={isLoggedIn && isCheckinPending}
          onClick={() => {
            if (isLoggedIn) {
              onCheckin(nearestStation.station)
              return
            }

            window.location.href = '/auth/google/login'
          }}
          size="sm"
          type="button"
        >
          {isLoggedIn && isCheckinPending ? '処理中' : 'チェックイン'}
        </Button>
      </div>
    </div>
  )
}

export function StationMap() {
  const { authState } = useAuth()
  const { query, submittedQuery } = useStationSearch()
  const [stations, setStations] = useState<Station[]>([])
  const [visitsByStationId, setVisitsByStationId] = useState<
    Map<string, VisitSummary>
  >(() => new Map())
  const [visitStatus, setVisitStatus] = useState<VisitStatus>('all')
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null,
  )
  const [selectedStationCheckins, setSelectedStationCheckins] = useState<
    Checkin[]
  >([])
  const [isCheckinsLoading, setIsCheckinsLoading] = useState(false)
  const [checkinPendingStationIds, setCheckinPendingStationIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [selectedPrefectureCodes, setSelectedPrefectureCodes] = useState<
    Set<number>
  >(() => new Set())
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)
  const [nearestStation, setNearestStation] = useState<NearestStation | null>(
    null,
  )

  const normalizedQuery = normalizeSearchText(query)
  const authUserId = authState.status === 'logged-in' ? authState.user.id : null
  const isLoggedIn = authUserId !== null

  const selectedStation = useMemo(
    () =>
      selectedStationId === null
        ? null
        : (stations.find((station) => station.id === selectedStationId) ??
          null),
    [selectedStationId, stations],
  )

  const areaFilteredStations = useMemo(() => {
    if (selectedPrefectureCodes.size === 0) {
      return stations
    }

    return stations.filter((station) =>
      selectedPrefectureCodes.has(station.prefectureCode),
    )
  }, [selectedPrefectureCodes, stations])

  const areaAndSearchFilteredStations = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return areaFilteredStations
    }

    return areaFilteredStations.filter((station) =>
      normalizeSearchText(station.name).includes(normalizedQuery),
    )
  }, [areaFilteredStations, normalizedQuery])

  const filteredStations = useMemo(() => {
    if (!isLoggedIn || visitStatus === 'all') {
      return areaAndSearchFilteredStations
    }

    return areaAndSearchFilteredStations.filter((station) => {
      const isVisited = visitsByStationId.has(station.id)

      return visitStatus === 'visited' ? isVisited : !isVisited
    })
  }, [
    areaAndSearchFilteredStations,
    isLoggedIn,
    visitsByStationId,
    visitStatus,
  ])

  const visitedStationCount = useMemo(
    () =>
      filteredStations.filter((station) => visitsByStationId.has(station.id))
        .length,
    [filteredStations, visitsByStationId],
  )
  const unvisitedStationCount = filteredStations.length - visitedStationCount

  const countsByPrefectureCode = useMemo(() => {
    const counts = new Map<number, number>()

    for (const station of stations) {
      counts.set(
        station.prefectureCode,
        (counts.get(station.prefectureCode) ?? 0) + 1,
      )
    }

    return counts
  }, [stations])

  const countsByRegionName = useMemo(() => {
    const counts = new Map<(typeof REGIONS)[number]['name'], number>()

    for (const region of REGIONS) {
      counts.set(
        region.name,
        region.prefectureCodes.reduce(
          (sum, prefectureCode) =>
            sum + (countsByPrefectureCode.get(prefectureCode) ?? 0),
          0,
        ),
      )
    }

    return counts
  }, [countsByPrefectureCode])

  const visiblePrefectureCount = useMemo(
    () =>
      new Set(filteredStations.map((station) => station.prefectureCode)).size,
    [filteredStations],
  )

  const loadVisits = useCallback(
    async (signal?: AbortSignal) => {
      if (!isLoggedIn) {
        setVisitsByStationId(new Map())
        return
      }

      const response = await fetch('/api/me/visits', { signal })

      if (response.status === 401) {
        setVisitsByStationId(new Map())
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const visits = (await response.json()) as VisitSummary[]
      setVisitsByStationId(
        new Map(visits.map((visit) => [visit.stationId, visit])),
      )
    },
    [isLoggedIn],
  )

  const loadCheckins = useCallback(
    async (stationId: string, signal?: AbortSignal) => {
      if (!isLoggedIn) {
        setSelectedStationCheckins([])
        return
      }

      setIsCheckinsLoading(true)

      try {
        const response = await fetch(`/api/stations/${stationId}/checkins`, {
          signal,
        })

        if (response.status === 401) {
          setSelectedStationCheckins([])
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const checkins = (await response.json()) as Checkin[]
        setSelectedStationCheckins(checkins)
      } finally {
        if (signal === undefined || !signal.aborted) {
          setIsCheckinsLoading(false)
        }
      }
    },
    [isLoggedIn],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadStations() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const response = await fetch('/api/stations', {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = (await response.json()) as Station[]
        setStations(data)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        setErrorMessage('道の駅データを読み込めませんでした')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void loadStations()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn) {
      setVisitsByStationId(new Map())
      setVisitStatus('all')
      return
    }

    const controller = new AbortController()

    void loadVisits(controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
    })

    return () => {
      controller.abort()
    }
  }, [authUserId, isLoggedIn, loadVisits])

  useEffect(() => {
    if (!isLoggedIn || selectedStationId === null) {
      setSelectedStationCheckins([])
      setIsCheckinsLoading(false)
      return
    }

    const controller = new AbortController()

    void loadCheckins(selectedStationId, controller.signal).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
    })

    return () => {
      controller.abort()
    }
  }, [isLoggedIn, loadCheckins, selectedStationId])

  useEffect(() => {
    if (
      selectedStationId !== null &&
      !filteredStations.some((station) => station.id === selectedStationId)
    ) {
      setSelectedStationId(null)
    }
  }, [filteredStations, selectedStationId])

  useEffect(() => {
    if (stations.length === 0 || !('geolocation' in navigator)) {
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNearestStation(
          findNearestStation(stations, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        )
      },
      () => {
        setNearestStation(null)
      },
      {
        enableHighAccuracy: false,
        maximumAge: 300000,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    )
  }, [stations])

  async function handleCheckin(station: Station) {
    if (!isLoggedIn || checkinPendingStationIds.has(station.id)) {
      return
    }

    setSelectedStationId(station.id)
    setCheckinPendingStationIds((current) => new Set(current).add(station.id))

    try {
      const response = await fetch(`/api/stations/${station.id}/checkins`, {
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const createdCheckin = (await response.json()) as Checkin

      if (station.id === selectedStationId || selectedStationId === null) {
        setSelectedStationCheckins((current) => [
          createdCheckin,
          ...current.filter((checkin) => checkin.id !== createdCheckin.id),
        ])
      }

      await Promise.all([loadVisits(), loadCheckins(station.id)])
    } finally {
      setCheckinPendingStationIds((current) => {
        const next = new Set(current)
        next.delete(station.id)
        return next
      })
    }
  }

  const filterPanel = (
    <StationFilter
      countsByPrefectureCode={countsByPrefectureCode}
      countsByRegionName={countsByRegionName}
      isVisitStatusDisabled={authState.status !== 'logged-in'}
      onChange={setSelectedPrefectureCodes}
      onVisitStatusChange={setVisitStatus}
      selectedPrefectureCodes={selectedPrefectureCodes}
      unvisitedStationCount={unvisitedStationCount}
      visitedStationCount={visitedStationCount}
      visiblePrefectureCount={visiblePrefectureCount}
      visibleStationCount={filteredStations.length}
      visitStatus={visitStatus}
    />
  )

  return (
    <div className="flex h-full min-h-0 w-full bg-background">
      <div className="hidden h-full min-h-0 w-[280px] shrink-0 md:block">
        {filterPanel}
      </div>

      <div className="relative min-h-0 min-w-0 flex-1">
        <MapContainer
          center={JAPAN_CENTER}
          className="h-full w-full"
          markerZoomAnimation={false}
          zoom={INITIAL_ZOOM}
          zoomControl={false}
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizeWatcher
            token={`${isMobileFilterOpen}-${selectedPrefectureCodes.size}`}
          />
          <SearchPanWatcher
            onZoomChange={setZoom}
            stations={filteredStations}
            submittedQuery={submittedQuery}
          />
          <MapZoomWatcher onZoomChange={setZoom} />
          <StationMapMarkers
            onStationSelect={(station) => setSelectedStationId(station.id)}
            selectedStationId={selectedStationId}
            stations={filteredStations}
            visitsByStationId={visitsByStationId}
            zoom={zoom}
          />
        </MapContainer>

        <Button
          className="absolute left-3 top-3 z-[1000] md:hidden"
          onClick={() => setIsMobileFilterOpen(true)}
          type="button"
        >
          フィルタ
        </Button>

        {isMobileFilterOpen && (
          <div className="absolute inset-0 z-[1200] md:hidden">
            <button
              aria-label="フィルタを閉じる"
              className="absolute inset-0 bg-slate-950/25"
              onClick={() => setIsMobileFilterOpen(false)}
              type="button"
            />
            <div className="absolute inset-y-0 left-0 w-[min(320px,88vw)] shadow-[0_12px_48px_oklch(0.2_0.04_250_/_0.4)]">
              {filterPanel}
            </div>
          </div>
        )}

        {nearestStation !== null && (
          <NearbyStationCard
            isCheckinPending={checkinPendingStationIds.has(
              nearestStation.station.id,
            )}
            isLoggedIn={isLoggedIn}
            nearestStation={nearestStation}
            onCheckin={(station) => void handleCheckin(station)}
            onSelect={(station) => setSelectedStationId(station.id)}
          />
        )}

        {selectedStation !== null && (
          <StationDetailPanel
            checkins={selectedStationCheckins}
            isCheckinPending={checkinPendingStationIds.has(selectedStation.id)}
            isCheckinsLoading={isCheckinsLoading}
            isLoggedIn={isLoggedIn}
            onCheckin={(station) => void handleCheckin(station)}
            onClose={() => setSelectedStationId(null)}
            station={selectedStation}
            visitSummary={visitsByStationId.get(selectedStation.id)}
          />
        )}

        {(isLoading || errorMessage !== null) && (
          <div className="pointer-events-none absolute left-3 top-16 z-[1000] rounded bg-white px-3 py-2 text-sm text-text shadow md:top-3">
            {errorMessage ?? '道の駅データを読み込み中...'}
          </div>
        )}
      </div>
    </div>
  )
}
