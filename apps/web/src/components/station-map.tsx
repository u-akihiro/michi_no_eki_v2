import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'

import { PREFECTURE_CODE_BY_NAME } from '@michi-no-eki/shared'
import type { Station } from '@michi-no-eki/shared'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const JAPAN_CENTER: [number, number] = [36.5, 138]
const INITIAL_ZOOM = 5
const PREFECTURE_CLUSTER_ZOOM_THRESHOLD = 7
const CLUSTER_FIT_BOUNDS_PADDING = L.point(32, 32)

type PrefectureCluster = {
  prefectureCode: number
  prefectureName: string
  stations: Station[]
  position: [number, number]
}

const PREFECTURE_NAME_BY_CODE = new Map<number, string>(
  Object.entries(PREFECTURE_CODE_BY_NAME).map(([name, code]) => [code, name]),
)

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
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
          PREFECTURE_NAME_BY_CODE.get(prefectureCode) ??
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

  return (
    <>
      {stations.map((station) => (
        <Marker
          key={station.id}
          position={[station.latitude, station.longitude]}
        >
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
        zoom={INITIAL_ZOOM}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapZoomWatcher onZoomChange={setZoom} />
        <StationMapMarkers stations={stations} zoom={zoom} />
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded bg-white/90 px-2 py-1 text-xs font-medium text-slate-900 shadow">
        zoom: {zoom}
      </div>

      {(isLoading || errorMessage !== null) && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded bg-white px-3 py-2 text-sm text-slate-900 shadow">
          {errorMessage ?? '道の駅データを読み込み中...'}
        </div>
      )}
    </div>
  )
}
