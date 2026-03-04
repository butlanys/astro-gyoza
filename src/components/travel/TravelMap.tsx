import { LatLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'

export interface TravelPoint {
  id: string
  year: number
  country: string
  city: string
  lat: number
  lng: number
  anchor: string
  note?: string
  cover?: string
}

interface TravelMapProps {
  points: TravelPoint[]
}

function FitMapBounds({ points }: { points: TravelPoint[] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 6)
      return
    }

    const bounds = new LatLngBounds(points.map((point) => [point.lat, point.lng]))
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 })
  }, [map, points])

  return null
}

function scrollToAnchor(anchor: string, city: string) {
  const anchorId = anchor.replace(/^#/, '')
  const target = document.getElementById(anchorId)

  if (!target) {
    console.warn(`[TravelMap] Cannot find anchor "${anchorId}" for ${city}`)
    return
  }

  const top = target.getBoundingClientRect().top + window.scrollY - 80
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  window.history.replaceState(null, '', `#${anchorId}`)
}

export function TravelMap({ points }: TravelMapProps) {
  const [tileError, setTileError] = useState(false)

  const countries = useMemo(() => {
    return Array.from(new Set(points.map((point) => point.country)))
  }, [points])

  if (points.length === 0) {
    return (
      <section className="mt-8 mb-10">
        <div className="rounded-lg border border-primary bg-secondary/40 px-4 py-6 text-sm text-secondary">
          暂无地图数据，后续会继续补充。
        </div>
      </section>
    )
  }

  return (
    <section className="mt-8 mb-10 space-y-4" aria-label="Travel map">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-secondary">已到访国家/地区</span>
        {countries.map((country) => (
          <span
            key={country}
            className="inline-flex items-center rounded-full border border-primary bg-secondary/60 px-3 py-1 text-xs"
          >
            {country}
          </span>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-lg border border-primary bg-secondary h-[320px] md:h-[420px]">
        {tileError && (
          <div className="absolute left-3 top-3 z-[500] rounded bg-primary/95 px-3 py-2 text-xs text-secondary shadow">
            底图加载失败，请稍后重试。
          </div>
        )}

        <MapContainer
          center={[points[0].lat, points[0].lng]}
          zoom={4}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{
              tileerror: () => setTileError(true),
              load: () => setTileError(false),
            }}
          />

          <FitMapBounds points={points} />

          {points.map((point) => (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lng]}
              radius={8}
              pathOptions={{
                color: 'rgb(var(--color-accent))',
                fillColor: 'rgb(var(--color-accent))',
                fillOpacity: 0.65,
                weight: 2,
              }}
              eventHandlers={{
                click: () => scrollToAnchor(point.anchor, point.city),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                {point.country} · {point.city}
              </Tooltip>
              <Popup>
                <div className="space-y-1">
                  <div className="font-semibold">
                    {point.country} · {point.city}
                  </div>
                  <div className="text-xs text-zinc-500">{point.year} 年</div>
                  {point.note && <div className="text-sm">{point.note}</div>}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </section>
  )
}
