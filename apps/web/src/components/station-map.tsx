import { useEffect, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'

import type { Station } from '@michi-no-eki/shared'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const JAPAN_CENTER: [number, number] = [36.5, 138]
const INITIAL_ZOOM = 5

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

export function StationMap() {
  const [stations, setStations] = useState<Station[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      </MapContainer>

      {(isLoading || errorMessage !== null) && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded bg-white px-3 py-2 text-sm text-slate-900 shadow">
          {errorMessage ?? '道の駅データを読み込み中...'}
        </div>
      )}
    </div>
  )
}
