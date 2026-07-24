import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'

import { PREFECTURE_NAME_BY_CODE, REGIONS } from '@michi-no-eki/shared'
import type { Station } from '@michi-no-eki/shared'

import { StationFilter } from './station-filter'
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

const UNVISITED_STATION_ICON = L.divIcon({
  className: '',
  html: `<div style="
    height: 24px;
    position: relative;
    width: 22px;
  ">
    <div style="
      background: #ffffff;
      border: 2px solid #94a3b8;
      border-radius: 9999px;
      box-shadow: 0 2px 6px oklch(0.3 0.03 250 / 0.3);
      height: 14px;
      left: 4px;
      position: absolute;
      top: 1px;
      width: 14px;
    "></div>
    <div style="
      background: #334155;
      border-radius: 9999px;
      height: 8px;
      left: 10px;
      position: absolute;
      top: 14px;
      width: 2px;
    "></div>
  </div>`,
  iconAnchor: [11, 22],
  iconSize: [22, 24],
  popupAnchor: [0, -22],
  tooltipAnchor: [0, 4],
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
  stations,
  zoom,
}: {
  stations: Station[]
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
      {visibleStations.map((station) => (
        <Marker
          icon={UNVISITED_STATION_ICON}
          key={station.id}
          position={[station.latitude, station.longitude]}
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
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{station.name}</p>
              <p className="text-sm text-slate-600">{station.address}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

function NearbyStationCard({
  nearestStation,
}: {
  nearestStation: NearestStation
}) {
  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-[1000] w-[min(320px,calc(100vw-2rem))] rounded-xl bg-white p-4 shadow-[0_4px_24px_oklch(0.3_0.03_250_/_0.12)]">
      <p className="mb-3 text-xs font-black text-text-muted">
        現在地から近い道の駅
      </p>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 rounded-lg bg-[repeating-linear-gradient(45deg,oklch(0.88_0.045_250)_0_6px,oklch(0.94_0.02_250)_6px_12px)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-text">
            {nearestStation.station.name}
          </p>
          <p className="mt-1 truncate text-xs font-medium text-text-muted">
            {nearestStation.station.address}
          </p>
          <p className="mt-1 text-xs font-medium text-text-muted">
            約{nearestStation.distanceKm.toFixed(1)}km
          </p>
        </div>
        <Button disabled size="sm" type="button">
          チェックイン
        </Button>
      </div>
    </div>
  )
}

export function StationMap() {
  const { authState } = useAuth()
  const { query, submittedQuery } = useStationSearch()
  const [stations, setStations] = useState<Station[]>([])
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

  const areaFilteredStations = useMemo(() => {
    if (selectedPrefectureCodes.size === 0) {
      return stations
    }

    return stations.filter((station) =>
      selectedPrefectureCodes.has(station.prefectureCode),
    )
  }, [selectedPrefectureCodes, stations])

  const filteredStations = useMemo(() => {
    if (normalizedQuery.length === 0) {
      return areaFilteredStations
    }

    return areaFilteredStations.filter((station) =>
      normalizeSearchText(station.name).includes(normalizedQuery),
    )
  }, [areaFilteredStations, normalizedQuery])

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

  const filterPanel = (
    <StationFilter
      countsByPrefectureCode={countsByPrefectureCode}
      countsByRegionName={countsByRegionName}
      isVisitStatusDisabled={authState.status !== 'logged-in'}
      onChange={setSelectedPrefectureCodes}
      selectedPrefectureCodes={selectedPrefectureCodes}
      visiblePrefectureCount={visiblePrefectureCount}
      visibleStationCount={filteredStations.length}
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
          <StationMapMarkers stations={filteredStations} zoom={zoom} />
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
          <NearbyStationCard nearestStation={nearestStation} />
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
