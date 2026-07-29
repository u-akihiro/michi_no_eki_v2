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

import {
  getStationAreaCode,
  PREFECTURE_NAME_BY_CODE,
  REGIONS,
} from '@michi-no-eki/shared'
import type {
  Checkin,
  Photo,
  PhotoListItem,
  PinPhotoSummary,
  Station,
  StationPhotos,
  UpdateCheckinRequest,
  VisitSummary,
} from '@michi-no-eki/shared'

import { CheckinRecordModal } from './checkin-record-modal'
import { DeleteCheckinDialog } from './delete-checkin-dialog'
import { PhotoLightbox } from './photo-lightbox'
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
const COMPACT_VIEWPORT_MEDIA_QUERY = '(max-width: 767px)'
const CLUSTER_FIT_BOUNDS_PADDING = L.point(32, 32)
const VIEWPORT_PADDING_RATIO = 0.25
const GEOLOCATION_TIMEOUT_MS = 6000
const NEARBY_CARD_COLLAPSED_STORAGE_KEY = 'michieki:nearby-card-collapsed'

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

type CheckinRecordModalState = {
  checkin: Checkin
  mode: 'create' | 'edit'
  station: Station
}

type DeleteCheckinDialogState = {
  checkin: Checkin
  station: Station
}

type PhotosByCheckinId = Map<string, Photo[]>

type PhotoLightboxState = {
  initialPhotoId: string
  photos: PhotoListItem[]
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function createPhotoStationIcon({
  isSelected,
  photoId,
  stationName,
}: {
  isSelected: boolean
  photoId: string
  stationName: string
}) {
  const imageSize = isSelected ? 52 : 46
  const width = 128
  const height = imageSize + 26
  const ring = isSelected
    ? `<div style="
      border: 3px solid oklch(0.74 0.12 250 / 0.72);
      border-radius: 9999px;
      height: ${imageSize + 10}px;
      left: ${(width - imageSize) / 2 - 5}px;
      position: absolute;
      top: -5px;
      width: ${imageSize + 10}px;
    "></div>`
    : ''

  return L.divIcon({
    className: '',
    html: `<div style="
      height: ${height}px;
      position: relative;
      width: ${width}px;
    ">
      ${ring}
      <img
        alt=""
        src="/api/photos/${encodeURIComponent(photoId)}"
        style="
          background: #ffffff;
          border: 3px solid #ffffff;
          border-radius: 9999px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.28);
          height: ${imageSize}px;
          left: ${(width - imageSize) / 2}px;
          object-fit: cover;
          position: absolute;
          top: 0;
          width: ${imageSize}px;
        "
      />
      <div style="
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid rgba(148, 163, 184, 0.6);
        border-radius: 9999px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
        color: #0f172a;
        font: 800 11px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        left: 50%;
        max-width: 118px;
        overflow: hidden;
        padding: 3px 8px;
        position: absolute;
        text-overflow: ellipsis;
        top: ${imageSize + 4}px;
        transform: translateX(-50%);
        white-space: nowrap;
      ">${escapeHtml(stationName)}</div>
    </div>`,
    iconAnchor: [width / 2, imageSize],
    iconSize: [width, height],
    popupAnchor: [0, -imageSize],
    tooltipAnchor: [0, 4],
  })
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase('ja-JP')
}

function useIsCompactViewport() {
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia(COMPACT_VIEWPORT_MEDIA_QUERY).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(COMPACT_VIEWPORT_MEDIA_QUERY)

    const handleChange = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches)
    }

    setIsCompact(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return isCompact
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

function fitPrefectureStations(
  map: L.Map,
  stations: Station[],
  clusterZoomThreshold: number,
) {
  if (stations.length === 0) {
    return
  }

  if (stations.length === 1) {
    const station = stations[0]!

    map.setView([station.latitude, station.longitude], clusterZoomThreshold)
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

  if (fitBoundsZoom < clusterZoomThreshold) {
    map.setView(bounds.getCenter(), clusterZoomThreshold)
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

function QueryStationWatcher({
  onStationSelect,
  onZoomChange,
  stations,
}: {
  onStationSelect: (station: Station) => void
  onZoomChange: (zoom: number) => void
  stations: Station[]
}) {
  const map = useMap()
  const handledStationIdRef = useRef<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const stationId = params.get('station')

    if (
      stationId === null ||
      stationId.length === 0 ||
      stationId === handledStationIdRef.current ||
      stations.length === 0
    ) {
      return
    }

    const station = stations.find((candidate) => candidate.id === stationId)

    if (station === undefined) {
      return
    }

    handledStationIdRef.current = stationId
    onStationSelect(station)
    map.setView([station.latitude, station.longitude], SEARCH_ZOOM)
    onZoomChange(map.getZoom())

    params.delete('station')
    const nextSearch = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${nextSearch.length > 0 ? `?${nextSearch}` : ''}${window.location.hash}`,
    )
  }, [map, onStationSelect, onZoomChange, stations])

  return null
}

function StationMapMarkers({
  clusterZoomThreshold,
  labelZoomThreshold,
  onStationSelect,
  pinPhotoIdByStationId,
  selectedStationId,
  stations,
  visitsByStationId,
  zoom,
}: {
  clusterZoomThreshold: number
  labelZoomThreshold: number
  onStationSelect: (station: Station) => void
  pinPhotoIdByStationId: ReadonlyMap<string, string>
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

  if (zoom < clusterZoomThreshold) {
    return (
      <>
        {prefectureClusters.map((cluster) => (
          <Marker
            eventHandlers={{
              click: () => {
                fitPrefectureStations(
                  map,
                  cluster.stations,
                  clusterZoomThreshold,
                )
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
        const pinPhotoId = pinPhotoIdByStationId.get(station.id)
        const icon =
          pinPhotoId !== undefined
            ? createPhotoStationIcon({
                isSelected,
                photoId: pinPhotoId,
                stationName: station.name,
              })
            : isSelected
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
            {pinPhotoId === undefined &&
              zoom >= labelZoomThreshold &&
              !isZooming && (
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
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return (
        window.localStorage.getItem(NEARBY_CARD_COLLAPSED_STORAGE_KEY) ===
        'true'
      )
    } catch {
      return false
    }
  })

  function updateCollapsed(nextIsCollapsed: boolean) {
    setIsCollapsed(nextIsCollapsed)

    try {
      window.localStorage.setItem(
        NEARBY_CARD_COLLAPSED_STORAGE_KEY,
        String(nextIsCollapsed),
      )
    } catch {
      // Keep the toggle usable even when storage is unavailable.
    }
  }

  if (isCollapsed) {
    return (
      <button
        aria-label="近くの道の駅を開く"
        className="pointer-events-auto absolute bottom-4 left-4 z-[1000] inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-text shadow-[0_4px_24px_oklch(0.3_0.03_250_/_0.12)] hover:text-primary"
        onClick={() => updateCollapsed(false)}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-primary"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 21s7-5.4 7-12a7 7 0 1 0-14 0c0 6.6 7 12 7 12Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <circle
            cx="12"
            cy="9"
            r="2.5"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <span>近くの駅</span>
      </button>
    )
  }

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[1000] w-[min(320px,calc(100vw-2rem))] rounded-xl bg-white p-4 shadow-[0_4px_24px_oklch(0.3_0.03_250_/_0.12)]">
      <button
        aria-label="近くの道の駅カードを閉じる"
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-base font-black leading-none text-text-muted hover:bg-slate-100 hover:text-text"
        onClick={() => updateCollapsed(true)}
        type="button"
      >
        ⌄
      </button>
      <p className="mb-3 pr-7 text-xs font-black text-text-muted">
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
  const isCompactViewport = useIsCompactViewport()
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
  const [photosByCheckinId, setPhotosByCheckinId] = useState<PhotosByCheckinId>(
    () => new Map(),
  )
  const [stationPhotos, setStationPhotos] = useState<PhotoListItem[]>([])
  const [stationPhotoTotal, setStationPhotoTotal] = useState(0)
  const [pinPhotoIdByStationId, setPinPhotoIdByStationId] = useState<
    Map<string, string>
  >(() => new Map())
  const [isCheckinsLoading, setIsCheckinsLoading] = useState(false)
  const [checkinPendingStationIds, setCheckinPendingStationIds] = useState<
    ReadonlySet<string>
  >(() => new Set())
  const [checkinRecordModal, setCheckinRecordModal] =
    useState<CheckinRecordModalState | null>(null)
  const [deleteCheckinDialog, setDeleteCheckinDialog] =
    useState<DeleteCheckinDialogState | null>(null)
  const [savingCheckinId, setSavingCheckinId] = useState<string | null>(null)
  const [deletingCheckinId, setDeletingCheckinId] = useState<string | null>(
    null,
  )
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [selectedAreaCodes, setSelectedAreaCodes] = useState<Set<number>>(
    () => new Set(),
  )
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)
  const [nearestStation, setNearestStation] = useState<NearestStation | null>(
    null,
  )
  const [photoLightbox, setPhotoLightbox] = useState<PhotoLightboxState | null>(
    null,
  )

  const normalizedQuery = normalizeSearchText(query)
  const authUserId = authState.status === 'logged-in' ? authState.user.id : null
  const isLoggedIn = authUserId !== null
  const clusterZoomThreshold = isCompactViewport
    ? PREFECTURE_CLUSTER_ZOOM_THRESHOLD - 1
    : PREFECTURE_CLUSTER_ZOOM_THRESHOLD
  const labelZoomThreshold = isCompactViewport
    ? STATION_LABEL_ZOOM_THRESHOLD - 1
    : STATION_LABEL_ZOOM_THRESHOLD

  const selectedStation = useMemo(
    () =>
      selectedStationId === null
        ? null
        : (stations.find((station) => station.id === selectedStationId) ??
          null),
    [selectedStationId, stations],
  )

  const areaCodeByStationId = useMemo(
    () =>
      new Map(
        stations.map((station) => [station.id, getStationAreaCode(station)]),
      ),
    [stations],
  )

  const areaFilteredStations = useMemo(() => {
    if (selectedAreaCodes.size === 0) {
      return stations
    }

    return stations.filter((station) => {
      const areaCode = areaCodeByStationId.get(station.id)

      return areaCode !== undefined && selectedAreaCodes.has(areaCode)
    })
  }, [areaCodeByStationId, selectedAreaCodes, stations])

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

  const countsByAreaCode = useMemo(() => {
    const counts = new Map<number, number>()

    for (const station of stations) {
      const areaCode = areaCodeByStationId.get(station.id)

      if (areaCode !== undefined) {
        counts.set(areaCode, (counts.get(areaCode) ?? 0) + 1)
      }
    }

    return counts
  }, [areaCodeByStationId, stations])

  const countsByRegionName = useMemo(() => {
    const counts = new Map<(typeof REGIONS)[number]['name'], number>()

    for (const region of REGIONS) {
      counts.set(
        region.name,
        region.areaCodes.reduce(
          (sum, areaCode) => sum + (countsByAreaCode.get(areaCode) ?? 0),
          0,
        ),
      )
    }

    return counts
  }, [countsByAreaCode])

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

  const loadPinPhotos = useCallback(
    async (signal?: AbortSignal) => {
      if (!isLoggedIn) {
        setPinPhotoIdByStationId(new Map())
        return
      }

      const response = await fetch('/api/me/pin-photos', { signal })

      if (response.status === 401) {
        setPinPhotoIdByStationId(new Map())
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const pinPhotos = (await response.json()) as PinPhotoSummary[]
      setPinPhotoIdByStationId(
        new Map(pinPhotos.map((photo) => [photo.stationId, photo.photoId])),
      )
    },
    [isLoggedIn],
  )

  const loadPhotosForCheckins = useCallback(
    async (checkinsToLoad: Checkin[], signal?: AbortSignal) => {
      if (!isLoggedIn || checkinsToLoad.length === 0) {
        setPhotosByCheckinId(new Map())
        return
      }

      const entries = await Promise.all(
        checkinsToLoad.map(async (checkin) => {
          const response = await fetch(`/api/checkins/${checkin.id}/photos`, {
            signal,
          })

          if (response.status === 401 || response.status === 404) {
            return [checkin.id, [] as Photo[]] as const
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          return [checkin.id, (await response.json()) as Photo[]] as const
        }),
      )

      setPhotosByCheckinId(new Map(entries))
    },
    [isLoggedIn],
  )

  const loadStationPhotos = useCallback(
    async (stationId: string, signal?: AbortSignal) => {
      if (!isLoggedIn) {
        setStationPhotos([])
        setStationPhotoTotal(0)
        return
      }

      const response = await fetch(`/api/stations/${stationId}/photos`, {
        signal,
      })

      if (response.status === 401 || response.status === 404) {
        setStationPhotos([])
        setStationPhotoTotal(0)
        return
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const stationPhotoResponse = (await response.json()) as StationPhotos
      setStationPhotos(stationPhotoResponse.items)
      setStationPhotoTotal(stationPhotoResponse.totalCount)
    },
    [isLoggedIn],
  )

  const loadCheckins = useCallback(
    async (stationId: string, signal?: AbortSignal) => {
      if (!isLoggedIn) {
        setSelectedStationCheckins([])
        setPhotosByCheckinId(new Map())
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
        await loadPhotosForCheckins(checkins, signal)
      } finally {
        if (signal === undefined || !signal.aborted) {
          setIsCheckinsLoading(false)
        }
      }
    },
    [isLoggedIn, loadPhotosForCheckins],
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
      setPinPhotoIdByStationId(new Map())
      setVisitStatus('all')
      return
    }

    const controller = new AbortController()

    void Promise.all([
      loadVisits(controller.signal),
      loadPinPhotos(controller.signal),
    ]).catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
    })

    return () => {
      controller.abort()
    }
  }, [authUserId, isLoggedIn, loadPinPhotos, loadVisits])

  useEffect(() => {
    if (!isLoggedIn || selectedStationId === null) {
      setSelectedStationCheckins([])
      setPhotosByCheckinId(new Map())
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
    if (!isLoggedIn || selectedStationId === null) {
      setStationPhotos([])
      setStationPhotoTotal(0)
      setPhotoLightbox(null)
      return
    }

    const controller = new AbortController()

    void loadStationPhotos(selectedStationId, controller.signal).catch(
      (error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      },
    )

    return () => {
      controller.abort()
    }
  }, [isLoggedIn, loadStationPhotos, selectedStationId])

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

      await Promise.all([loadVisits(), loadCheckins(station.id)])
      setCheckinRecordModal({
        checkin: createdCheckin,
        mode: 'create',
        station,
      })
    } finally {
      setCheckinPendingStationIds((current) => {
        const next = new Set(current)
        next.delete(station.id)
        return next
      })
    }
  }

  async function handleSaveCheckin(
    checkin: Checkin,
    station: Station,
    request: UpdateCheckinRequest,
  ) {
    if (savingCheckinId !== null) {
      return
    }

    setSavingCheckinId(checkin.id)

    try {
      const response = await fetch(`/api/checkins/${checkin.id}`, {
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'PATCH',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      await response.json()
      await Promise.all([loadVisits(), loadCheckins(station.id)])
    } finally {
      setSavingCheckinId(null)
    }
  }

  async function handleDeleteCheckin(checkin: Checkin, station: Station) {
    if (deletingCheckinId !== null) {
      return
    }

    setDeletingCheckinId(checkin.id)

    try {
      const response = await fetch(`/api/checkins/${checkin.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      await response.json()
      await Promise.all([
        loadVisits(),
        loadCheckins(station.id),
        loadPinPhotos(),
        loadStationPhotos(station.id),
      ])
      setDeleteCheckinDialog(null)
      setCheckinRecordModal(null)
    } finally {
      setDeletingCheckinId(null)
    }
  }

  function openPhotoLightbox(photoId: string) {
    if (stationPhotos.length === 0) {
      return
    }

    setPhotoLightbox({
      initialPhotoId: photoId,
      photos: stationPhotos,
    })
  }

  function openAllStationPhotos() {
    const firstPhoto = stationPhotos[0]

    if (firstPhoto === undefined) {
      return
    }

    setPhotoLightbox({
      initialPhotoId: firstPhoto.photoId,
      photos: stationPhotos,
    })
  }

  async function reloadPhotoStateAfterPinChange() {
    const stationId = selectedStationId

    await Promise.all([
      loadPinPhotos(),
      stationId === null ? Promise.resolve() : loadStationPhotos(stationId),
      selectedStationCheckins.length === 0
        ? Promise.resolve()
        : loadPhotosForCheckins(selectedStationCheckins),
    ])
  }

  const handleStationSelect = useCallback((station: Station) => {
    setSelectedStationId(station.id)
  }, [])

  const filterPanel = (
    <StationFilter
      countsByAreaCode={countsByAreaCode}
      countsByRegionName={countsByRegionName}
      isVisitStatusDisabled={authState.status !== 'logged-in'}
      onChange={setSelectedAreaCodes}
      onVisitStatusChange={setVisitStatus}
      selectedAreaCodes={selectedAreaCodes}
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
            token={`${isMobileFilterOpen}-${selectedAreaCodes.size}`}
          />
          <SearchPanWatcher
            onZoomChange={setZoom}
            stations={filteredStations}
            submittedQuery={submittedQuery}
          />
          <QueryStationWatcher
            onStationSelect={handleStationSelect}
            onZoomChange={setZoom}
            stations={stations}
          />
          <MapZoomWatcher onZoomChange={setZoom} />
          <StationMapMarkers
            clusterZoomThreshold={clusterZoomThreshold}
            labelZoomThreshold={labelZoomThreshold}
            onStationSelect={handleStationSelect}
            pinPhotoIdByStationId={pinPhotoIdByStationId}
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
            onEditCheckin={(checkin) =>
              setCheckinRecordModal({
                checkin,
                mode: 'edit',
                station: selectedStation,
              })
            }
            onOpenAllPhotos={openAllStationPhotos}
            onOpenPhoto={openPhotoLightbox}
            photosByCheckinId={photosByCheckinId}
            station={selectedStation}
            stationPhotoTotal={stationPhotoTotal}
            stationPhotos={stationPhotos}
            visitSummary={visitsByStationId.get(selectedStation.id)}
          />
        )}

        {photoLightbox !== null && (
          <PhotoLightbox
            initialPhotoId={photoLightbox.initialPhotoId}
            isLoggedIn={isLoggedIn}
            onClose={() => setPhotoLightbox(null)}
            onEditCheckin={(checkinId) => {
              const checkin = selectedStationCheckins.find(
                (candidate) => candidate.id === checkinId,
              )

              if (checkin === undefined || selectedStation === null) {
                return
              }

              setCheckinRecordModal({
                checkin,
                mode: 'edit',
                station: selectedStation,
              })
              setPhotoLightbox(null)
            }}
            onOpenStationOnMap={(stationId) => {
              setSelectedStationId(stationId)
              setPhotoLightbox(null)
            }}
            onPinChanged={() => {
              void reloadPhotoStateAfterPinChange()
            }}
            photos={photoLightbox.photos}
          />
        )}

        {checkinRecordModal !== null && (
          <CheckinRecordModal
            checkin={checkinRecordModal.checkin}
            isDismissDisabled={deleteCheckinDialog !== null}
            isSaving={savingCheckinId === checkinRecordModal.checkin.id}
            mode={checkinRecordModal.mode}
            onClose={() => {
              if (savingCheckinId === null) {
                setCheckinRecordModal(null)
              }
            }}
            onDeleteRequest={() =>
              setDeleteCheckinDialog({
                checkin: checkinRecordModal.checkin,
                station: checkinRecordModal.station,
              })
            }
            onPhotosChanged={() =>
              Promise.all([
                loadCheckins(checkinRecordModal.station.id),
                loadPinPhotos(),
                loadStationPhotos(checkinRecordModal.station.id),
              ]).then(() => undefined)
            }
            onSave={(request) =>
              handleSaveCheckin(
                checkinRecordModal.checkin,
                checkinRecordModal.station,
                request,
              )
            }
            station={checkinRecordModal.station}
          />
        )}

        {deleteCheckinDialog !== null && (
          <DeleteCheckinDialog
            checkin={deleteCheckinDialog.checkin}
            checkinCount={selectedStationCheckins.length}
            isDeleting={deletingCheckinId === deleteCheckinDialog.checkin.id}
            onClose={() => {
              if (deletingCheckinId === null) {
                setDeleteCheckinDialog(null)
              }
            }}
            onConfirm={() =>
              void handleDeleteCheckin(
                deleteCheckinDialog.checkin,
                deleteCheckinDialog.station,
              )
            }
            photos={photosByCheckinId.get(deleteCheckinDialog.checkin.id)}
            station={deleteCheckinDialog.station}
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
