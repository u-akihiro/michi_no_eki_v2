import { useEffect, useMemo, useState } from 'react'
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

import {
  PREFECTURE_CODE_BY_NAME,
  PREFECTURE_NAME_BY_CODE,
  REGIONS,
} from '@michi-no-eki/shared'
import type { Station } from '@michi-no-eki/shared'

import { StationFilter } from './station-filter'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const JAPAN_CENTER: [number, number] = [36.5, 138]
const INITIAL_ZOOM = 5
const PREFECTURE_CLUSTER_ZOOM_THRESHOLD = 10
// 駅名ラベルはマーカーより一段深いズームから表示して重なりを抑える
const STATION_LABEL_ZOOM_THRESHOLD = 11
const CLUSTER_FIT_BOUNDS_PADDING = L.point(32, 32)
// 表示範囲の外周に持たせる余白（パン直後の端の抜けを防ぐ）
const VIEWPORT_PADDING_RATIO = 0.25

type PrefectureCluster = {
  prefectureCode: number
  prefectureName: string
  stations: Station[]
  position: [number, number]
}

const ALL_PREFECTURE_CODES = Object.values(PREFECTURE_CODE_BY_NAME)

// バンドラ環境ではデフォルトアイコンのURL自動解決が効かないため、
// インポート済みの画像URLで明示的にアイコンを組み立てて各マーカーに渡す。
const DEFAULT_MARKER_ICON = L.icon({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
})

function createPrefectureClusterIcon(count: number) {
  return L.divIcon({
    className: '',
    html: `<div style="
      align-items: center;
      background: #0f766e;
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
            icon={createPrefectureClusterIcon(cluster.stations.length)}
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
          icon={DEFAULT_MARKER_ICON}
          key={station.id}
          position={[station.latitude, station.longitude]}
        >
          {zoom >= STATION_LABEL_ZOOM_THRESHOLD && !isZooming && (
            <Tooltip
              className="station-label"
              direction="bottom"
              offset={[-16, 28]}
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

export function StationMap() {
  const [stations, setStations] = useState<Station[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [selectedPrefectureCodes, setSelectedPrefectureCodes] = useState<
    Set<number>
  >(() => new Set(ALL_PREFECTURE_CODES))

  const filteredStations = useMemo(
    () =>
      stations.filter((station) =>
        selectedPrefectureCodes.has(station.prefectureCode),
      ),
    [selectedPrefectureCodes, stations],
  )

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

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={JAPAN_CENTER}
        className="h-full w-full"
        markerZoomAnimation={false}
        zoom={INITIAL_ZOOM}
        zoomControl={false}
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapZoomWatcher onZoomChange={setZoom} />
        <StationMapMarkers stations={filteredStations} zoom={zoom} />
      </MapContainer>

      <div className="absolute left-3 top-3 z-[1000]">
        <StationFilter
          countsByPrefectureCode={countsByPrefectureCode}
          countsByRegionName={countsByRegionName}
          onChange={setSelectedPrefectureCodes}
          selectedPrefectureCodes={selectedPrefectureCodes}
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded bg-white/90 px-2 py-1 text-xs font-medium text-slate-900 shadow">
        zoom: {zoom}
      </div>

      {(isLoading || errorMessage !== null) && (
        <div className="pointer-events-none absolute left-14 top-3 z-[1000] rounded bg-white px-3 py-2 text-sm text-slate-900 shadow">
          {errorMessage ?? '道の駅データを読み込み中...'}
        </div>
      )}
    </div>
  )
}
