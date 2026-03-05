import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'

const BASE_POINT_RADIUS = 0.22
const FOCUSED_POINT_RADIUS = 0.3
const BASE_POINT_ALTITUDE = 0.012
const FOCUSED_POINT_ALTITUDE = 0.02
const FALLBACK_GLOBE_DAY_TEXTURE = '/assets/travel-globe/textures/earth-day.jpg'
const FALLBACK_GLOBE_NIGHT_TEXTURE = '/assets/travel-globe/textures/earth-night.jpg'
const CESIUM_ION_TOKEN = import.meta.env.PUBLIC_CESIUM_ION_TOKEN ?? ''
const CESIUM_ION_IMAGERY_ASSET_ID =
  import.meta.env.PUBLIC_CESIUM_ION_IMAGERY_ASSET_ID ??
  import.meta.env.PUBLIC_CESIUM_ION_SATELLITE_ASSET_ID ??
  ''
const CESIUM_ION_TERRAIN_ASSET_ID = import.meta.env.PUBLIC_CESIUM_ION_TERRAIN_ASSET_ID ?? ''
const GLOBE_RADIUS_FALLBACK = 100
const TILE_ENGINE_MAX_LEVEL_DESKTOP = 21
const TILE_ENGINE_MAX_LEVEL_MOBILE = 18

const DEFAULT_POINT_OF_VIEW = {
  lat: 33.5,
  lng: 104.5,
  altitude: 1.85,
}

interface TravelPhoto {
  src: string
  alt?: string
}

interface CesiumIonEndpointResponse {
  type?: string
  externalType?: string
  url?: string
  accessToken?: string
  options?: {
    url?: string
    accessToken?: string
    session?: string
    key?: string
  }
}

export interface TravelPoint {
  id: string
  year: number
  country: string
  city: string
  lat: number
  lng: number
  anchor: string
  summary: string
  note?: string
  cover?: string
  detailTitle?: string
  detailText?: string
  photos?: TravelPhoto[]
  region?: string
}

interface TravelGlobeHeroProps {
  title: string
  description: string
  points: TravelPoint[]
}

function detectWebGLSupport() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return Boolean(window.WebGLRenderingContext && gl)
  } catch {
    return false
  }
}

function scrollToAnchor(anchor: string) {
  const anchorId = anchor.replace(/^#/, '')
  const target = document.getElementById(anchorId)
  if (!target) {
    console.warn(`[TravelGlobeHero] Cannot find anchor "${anchorId}"`)
    return
  }

  const top = target.getBoundingClientRect().top + window.scrollY - 80
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  window.history.replaceState(null, '', `#${anchorId}`)
}

function resolveTemplate(template: string, x: number, y: number, z: number) {
  const reverseY = 2 ** z - y - 1

  return template
    .replaceAll('{x}', `${x}`)
    .replaceAll('{y}', `${y}`)
    .replaceAll('{z}', `${z}`)
    .replaceAll('{level}', `${z}`)
    .replaceAll('{reverseY}', `${reverseY}`)
}

export function TravelGlobeHero({ title, description, points }: TravelGlobeHeroProps) {
  const globeRef = useRef<GlobeMethods>()
  const containerRef = useRef<HTMLDivElement>(null)
  const prevSelectedPointRef = useRef<TravelPoint | null>(null)
  const hasAppliedInitialViewRef = useRef(false)
  const [FallbackMap, setFallbackMap] = useState<null | ((props: { points: TravelPoint[] }) => JSX.Element)>(null)
  const [isSceneReady, setIsSceneReady] = useState(false)
  const [isWebGLSupported, setIsWebGLSupported] = useState(true)
  const [isGlobeHovered, setIsGlobeHovered] = useState(false)
  const [isUserInteracting, setIsUserInteracting] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [cesiumTileTemplate, setCesiumTileTemplate] = useState<string | null>(null)
  const [cesiumTileToken, setCesiumTileToken] = useState('')
  const [imageryErrorCode, setImageryErrorCode] = useState<number | null>(null)
  const [imageryStatus, setImageryStatus] = useState<
    'no-token' | 'missing-asset' | 'loading' | 'ready' | 'invalid-asset' | 'error'
  >('no-token')
  const [selectedPoint, setSelectedPoint] = useState<TravelPoint | null>(null)
  const [isCloseView, setIsCloseView] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<TravelPoint | null>(null)
  const [viewSize, setViewSize] = useState({ width: 1200, height: 720 })

  const countries = useMemo(() => {
    return Array.from(new Set(points.map((point) => point.country)))
  }, [points])

  const imageryStatusText = useMemo(() => {
    if (cesiumTileTemplate) {
      return 'Cesium ion 卫星底图已启用'
    }

    if (imageryStatus === 'missing-asset') {
      if (CESIUM_ION_TERRAIN_ASSET_ID) {
        return '检测到 Terrain Asset，但当前组件使用的是影像瓦片；请补充 PUBLIC_CESIUM_ION_IMAGERY_ASSET_ID（或 PUBLIC_CESIUM_ION_SATELLITE_ASSET_ID）'
      }
      return '检测到 Token，但缺少 PUBLIC_CESIUM_ION_IMAGERY_ASSET_ID（或 PUBLIC_CESIUM_ION_SATELLITE_ASSET_ID），当前为本地纹理模式'
    }

    if (imageryStatus === 'invalid-asset') {
      return 'Cesium 影像 Asset ID 无效，当前为本地纹理模式'
    }

    if (imageryStatus === 'error') {
      if (imageryErrorCode === 403) {
        return 'Cesium 影像服务返回 403：请检查 token 权限、Allowed URLs 域名白名单，以及该 Asset 是否属于当前账号'
      }
      return 'Cesium 影像服务初始化失败，当前为本地纹理模式'
    }

    if (imageryStatus === 'loading') {
      return '正在初始化 Cesium 影像服务...'
    }

    return '当前为本地纹理模式'
  }, [cesiumTileTemplate, imageryErrorCode, imageryStatus])

  useEffect(() => {
    setIsWebGLSupported(detectWebGLSupport())
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const updateViewport = () => {
      setIsMobileViewport(media.matches)
    }

    updateViewport()
    media.addEventListener('change', updateViewport)

    return () => {
      media.removeEventListener('change', updateViewport)
    }
  }, [])

  useEffect(() => {
    if (!CESIUM_ION_TOKEN) {
      setImageryStatus('no-token')
      setImageryErrorCode(null)
      return
    }

    if (!CESIUM_ION_IMAGERY_ASSET_ID) {
      setImageryStatus('missing-asset')
      setImageryErrorCode(null)
      return
    }

    const controller = new AbortController()
    const assetId = Number(CESIUM_ION_IMAGERY_ASSET_ID)

    if (Number.isNaN(assetId)) {
      console.warn(
        '[TravelGlobeHero] PUBLIC_CESIUM_ION_IMAGERY_ASSET_ID / PUBLIC_CESIUM_ION_SATELLITE_ASSET_ID is not a valid number.',
      )
      setImageryStatus('invalid-asset')
      setImageryErrorCode(null)
      return
    }

    setImageryStatus('loading')
    setImageryErrorCode(null)

    fetch(
      `https://api.cesium.com/v1/assets/${assetId}/endpoint?access_token=${encodeURIComponent(CESIUM_ION_TOKEN)}`,
      { signal: controller.signal },
    )
      .then((res) => {
        if (!res.ok) {
          setImageryErrorCode(res.status)
          throw new Error(`Failed to load Cesium endpoint, status: ${res.status}`)
        }
        return res.json() as Promise<CesiumIonEndpointResponse>
      })
      .then((endpoint) => {
        const endpointUrl = endpoint.url ?? endpoint.options?.url
        if (!endpointUrl) {
          throw new Error('Cesium endpoint response does not include a tile template URL.')
        }

        if (endpoint.externalType === 'GOOGLE_2D_MAPS') {
          const session = endpoint.options?.session
          const key = endpoint.options?.key
          if (!session || !key) {
            throw new Error('Cesium Google 2D endpoint is missing session/key.')
          }

          const normalizedBase = endpointUrl.endsWith('/') ? endpointUrl.slice(0, -1) : endpointUrl
          const googleTemplate = `${normalizedBase}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`
          setCesiumTileTemplate(googleTemplate)
          setCesiumTileToken('')
        } else {
          setCesiumTileTemplate(endpointUrl)
          setCesiumTileToken(endpoint.accessToken ?? endpoint.options?.accessToken ?? CESIUM_ION_TOKEN)
        }

        setImageryStatus('ready')
        setImageryErrorCode(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setImageryStatus('error')
        console.warn('[TravelGlobeHero] Failed to initialize Cesium tile endpoint.', error)
      })

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (isWebGLSupported) return

    let isMounted = true
    import('./TravelMap').then((mod) => {
      if (!isMounted) return
      setFallbackMap(() => mod.TravelMap as (props: { points: TravelPoint[] }) => JSX.Element)
    })

    return () => {
      isMounted = false
    }
  }, [isWebGLSupported])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setViewSize({
        width: Math.max(320, Math.round(entry.contentRect.width)),
        height: Math.max(420, Math.round(entry.contentRect.height)),
      })
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return

    const controls = globe.controls()
    const renderer = globe.renderer()
    const globeApi = globe as unknown as {
      globeTileEngineMaxLevel?: (level?: number) => number | object
      globeTileEngineClearCache?: () => object
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileViewport ? 1.8 : 2.6))
    if (cesiumTileTemplate) {
      globeApi.globeTileEngineMaxLevel?.(isMobileViewport ? TILE_ENGINE_MAX_LEVEL_MOBILE : TILE_ENGINE_MAX_LEVEL_DESKTOP)
    }
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = isMobileViewport ? 46 : 30
    controls.maxDistance = isMobileViewport ? 450 : 520
    controls.autoRotate = !selectedPoint && !isGlobeHovered && !isMobileViewport && !isUserInteracting
    controls.autoRotateSpeed = 0.3
  }, [selectedPoint, isSceneReady, isGlobeHovered, isMobileViewport, isUserInteracting, cesiumTileTemplate])

  useEffect(() => {
    const globe = globeRef.current as
      | (GlobeMethods & {
          globeTileEngineClearCache?: () => object
        })
      | undefined
    if (!globe || !cesiumTileTemplate) return
    globe.globeTileEngineClearCache?.()
  }, [cesiumTileTemplate, isMobileViewport])

  useEffect(() => {
    if (!cesiumTileTemplate || !isSceneReady) return

    const globe = globeRef.current
    if (!globe) return

    const renderer = globe.renderer()
    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy?.() ?? 1, 16)
    const optimizedTextures = new WeakSet<object>()

    const optimizeTileTextures = () => {
      globe.scene().traverse((obj) => {
        const target = obj as { material?: unknown }
        const material = target.material
        if (!material) return

        const materials = Array.isArray(material) ? material : [material]
        materials.forEach((mat) => {
          const texture = (mat as { map?: { anisotropy?: number; needsUpdate?: boolean } }).map
          if (!texture || optimizedTextures.has(texture)) return

          texture.anisotropy = maxAnisotropy
          texture.needsUpdate = true
          optimizedTextures.add(texture)
        })
      })
    }

    optimizeTileTextures()
    const timer = window.setInterval(optimizeTileTextures, 1200)

    return () => {
      window.clearInterval(timer)
    }
  }, [cesiumTileTemplate, isSceneReady, viewSize.width, viewSize.height])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return

    if (!selectedPoint && prevSelectedPointRef.current) {
      globe.pointOfView(DEFAULT_POINT_OF_VIEW, 1100)
    }

    prevSelectedPointRef.current = selectedPoint
  }, [selectedPoint])

  useEffect(() => {
    if (!isSceneReady) return

    const globe = globeRef.current
    if (!globe) return

    if (!hasAppliedInitialViewRef.current) {
      globe.pointOfView(DEFAULT_POINT_OF_VIEW, 0)
      hasAppliedInitialViewRef.current = true
    }
  }, [isSceneReady])

  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const controls = globe.controls()
    const orbitControls = controls as {
      addEventListener?: (type: 'start' | 'end' | 'change', listener: () => void) => void
      removeEventListener?: (type: 'start' | 'end' | 'change', listener: () => void) => void
    }

    const handleStart = () => {
      setIsUserInteracting(true)
    }
    const handleEnd = () => {
      setIsUserInteracting(false)
    }
    const handleChange = () => {
      const cameraDistance = (globe.camera() as { position?: { length?: () => number } }).position?.length?.() ?? 220
      const shouldHide = cameraDistance <= (isMobileViewport ? 120 : 104)
      setIsCloseView((prev) => (prev === shouldHide ? prev : shouldHide))
    }

    orbitControls.addEventListener?.('start', handleStart)
    orbitControls.addEventListener?.('end', handleEnd)
    orbitControls.addEventListener?.('change', handleChange)
    handleChange()

    return () => {
      orbitControls.removeEventListener?.('start', handleStart)
      orbitControls.removeEventListener?.('end', handleEnd)
      orbitControls.removeEventListener?.('change', handleChange)
    }
  }, [isSceneReady, isMobileViewport])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPoint(null)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  useEffect(() => {
    const clearInteraction = () => {
      setIsUserInteracting(false)
    }

    window.addEventListener('pointerup', clearInteraction)
    window.addEventListener('pointercancel', clearInteraction)
    window.addEventListener('blur', clearInteraction)

    return () => {
      window.removeEventListener('pointerup', clearInteraction)
      window.removeEventListener('pointercancel', clearInteraction)
      window.removeEventListener('blur', clearInteraction)
    }
  }, [])

  const isPointerOverGlobe = useCallback((clientX: number, clientY: number) => {
    const globe = globeRef.current
    const container = containerRef.current
    if (!globe || !container) return false

    const rect = container.getBoundingClientRect()
    const localX = clientX - rect.left
    const localY = clientY - rect.top

    if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) {
      return false
    }

    const camera = globe.camera() as {
      fov?: number
      position?: { length?: () => number }
    }
    const globeRadius =
      (globe as unknown as {
        getGlobeRadius?: () => number
      }).getGlobeRadius?.() ?? GLOBE_RADIUS_FALLBACK

    const cameraDistance = camera.position?.length?.() ?? 220
    const fov = camera.fov ?? 50
    const visibleHeight = 2 * cameraDistance * Math.tan((fov * Math.PI) / 360)
    const globeRadiusInPixels = (globeRadius / visibleHeight) * rect.height
    const distanceFromCenter = Math.hypot(localX - rect.width / 2, localY - rect.height / 2)

    return distanceFromCenter <= globeRadiusInPixels * 1.04
  }, [])

  const handleContainerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (selectedPoint) return
      setIsGlobeHovered(isPointerOverGlobe(event.clientX, event.clientY))
    },
    [isPointerOverGlobe, selectedPoint],
  )

  const handleContainerPointerLeave = useCallback(() => {
    setIsGlobeHovered(false)
  }, [])

  const tileEngineUrl = useCallback(
    (x: number, y: number, z: number) => {
      if (!cesiumTileTemplate) return ''

      let url = resolveTemplate(cesiumTileTemplate, x, y, z)
      if (cesiumTileToken && !url.includes('access_token=')) {
        url += `${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(cesiumTileToken)}`
      }
      return url
    },
    [cesiumTileTemplate, cesiumTileToken],
  )

  const handlePointClick = useCallback((pointObj: object) => {
    const point = pointObj as TravelPoint
    setSelectedPoint(point)

    const globe = globeRef.current
    if (!globe) return

    globe.pointOfView(
      {
        lat: point.lat,
        lng: point.lng,
        altitude: isMobileViewport ? 0.08 : 0.035,
      },
      1300,
    )
  }, [isMobileViewport])

  const selectedPhotos = selectedPoint?.photos ?? []
  const shouldSuppressMarkers = Boolean(selectedPoint) || isCloseView
  const visiblePoints = shouldSuppressMarkers ? [] : points
  const visibleRings = shouldSuppressMarkers ? [] : points

  if (!isWebGLSupported) {
    return (
      <section className="relative min-h-[600px] border-b border-primary bg-[#050b18]">
        <div className="mx-auto max-w-[1100px] px-4 md:px-8 py-8 space-y-5">
          <h1 className="text-3xl md:text-4xl font-bold text-zinc-100">{title}</h1>
          <p className="text-zinc-300">{description}</p>
          <p className="text-sm text-zinc-400">
            当前环境不支持 WebGL，已自动切换到兼容地图模式。
          </p>
          {FallbackMap ? (
            <FallbackMap points={points} />
          ) : (
            <div className="rounded-lg border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-300">
              正在加载兼容地图...
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      className="relative h-screen md:h-dvh min-h-[620px] overflow-hidden border-b border-primary"
      aria-label="Travel globe hero"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(120% 100% at 50% 110%, rgba(14, 116, 144, 0.2) 0%, rgba(2, 6, 23, 0.96) 45%, #020617 100%), url('/assets/travel-globe/stars/night-sky.png')",
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />

      <div
        ref={containerRef}
        className="absolute inset-0 z-0"
        onPointerMove={handleContainerPointerMove}
        onPointerLeave={handleContainerPointerLeave}
      >
        <Globe
          ref={globeRef}
          width={viewSize.width}
          height={viewSize.height}
          backgroundColor="rgba(0,0,0,0)"
          globeTileEngineUrl={cesiumTileTemplate ? tileEngineUrl : null}
          globeImageUrl={FALLBACK_GLOBE_DAY_TEXTURE}
          bumpImageUrl={cesiumTileTemplate ? null : FALLBACK_GLOBE_NIGHT_TEXTURE}
          showAtmosphere={true}
          atmosphereColor="#7dd3fc"
          atmosphereAltitude={0.2}
          pointsData={visiblePoints}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={(point) =>
            (point as TravelPoint).id === selectedPoint?.id ? FOCUSED_POINT_ALTITUDE : BASE_POINT_ALTITUDE
          }
          pointRadius={(point) =>
            (point as TravelPoint).id === selectedPoint?.id ? FOCUSED_POINT_RADIUS : BASE_POINT_RADIUS
          }
          pointColor={(point) =>
            (point as TravelPoint).id === selectedPoint?.id ? '#67e8f9' : 'rgba(94, 234, 212, 0.92)'
          }
          pointLabel={(pointObj) => {
            const point = pointObj as TravelPoint
            return `${point.year} · ${point.country} ${point.city}`
          }}
          ringsData={visibleRings}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => ['rgba(125, 211, 252, 0.38)', 'rgba(125, 211, 252, 0.04)']}
          ringMaxRadius={() => 2.6}
          ringPropagationSpeed={() => 1.4}
          ringRepeatPeriod={() => 1600}
          onPointHover={(pointObj) => {
            if (selectedPoint) return
            setHoveredPoint((pointObj as TravelPoint | null) ?? null)
          }}
          onPointClick={handlePointClick}
          onGlobeReady={() => {
            const globe = globeRef.current
            if (globe && !hasAppliedInitialViewRef.current) {
              globe.pointOfView(DEFAULT_POINT_OF_VIEW, 0)
              hasAppliedInitialViewRef.current = true
            }
            setTimeout(() => {
              setIsSceneReady(true)
            }, 350)
          }}
        />
      </div>

      <AnimatePresence>
        {!selectedPoint && !isCloseView && (
          <motion.div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 md:px-8 pt-6 md:pt-8"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="mx-auto max-w-[1100px]">
              <div className="inline-flex rounded-full border border-white/20 bg-slate-900/45 px-3 py-1 text-xs tracking-wide text-slate-200 backdrop-blur-md">
                Travel Atlas
              </div>
              <h1 className="mt-3 text-3xl md:text-5xl font-bold text-slate-50">{title}</h1>
              <p className="mt-3 max-w-[720px] text-sm md:text-base text-slate-200/90">{description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {countries.map((country) => (
                  <span
                    key={country}
                    className="rounded-full border border-white/15 bg-slate-900/35 px-3 py-1 text-xs text-slate-200/90"
                  >
                    {country}
                  </span>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-300/80">
                {imageryStatusText}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isSceneReady && (
          <motion.div
            className="absolute inset-0 z-20 grid place-items-center bg-slate-950/85"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.45 } }}
          >
            <div className="flex flex-col items-center gap-3 text-slate-200">
              <div className="size-10 rounded-full border-2 border-slate-300/35 border-t-cyan-300 animate-spin"></div>
              <div className="text-sm tracking-wide">初始化地球场景...</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hoveredPoint && !selectedPoint && (
          <motion.div
            className="absolute left-4 bottom-4 z-10 max-w-[460px] rounded-xl border border-white/15 bg-slate-900/55 px-4 py-3 text-slate-100 backdrop-blur-md md:left-8 md:bottom-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <div className="text-xs text-slate-300">{hoveredPoint.year}</div>
            <div className="mt-1 text-sm font-semibold">
              {hoveredPoint.country} · {hoveredPoint.city}
            </div>
            <div className="mt-1 text-xs text-slate-200/90">{hoveredPoint.summary}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPoint && (
          <>
            <motion.button
              type="button"
              className="absolute inset-0 z-10 bg-gradient-to-t from-black/75 via-black/40 to-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPoint(null)}
              aria-label="Close detail overlay"
            />

            <motion.button
              type="button"
              className="absolute right-4 top-[76px] md:right-6 z-20 inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-slate-900/70 text-slate-100 backdrop-blur hover:bg-slate-800/80"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={() => setSelectedPoint(null)}
              aria-label="Close detail"
            >
              <i className="iconfont icon-close text-sm" />
            </motion.button>

            <motion.div
              className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 md:px-8 md:pb-8"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
            >
              <article className="mx-auto max-w-[980px] rounded-2xl border border-white/20 bg-slate-900/60 p-4 md:p-6 text-slate-100 backdrop-blur-xl shadow-2xl shadow-black/30">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-300">{selectedPoint.year}</div>
                    <h2 className="text-xl md:text-2xl font-bold mt-1">
                      {selectedPoint.detailTitle ?? `${selectedPoint.country} · ${selectedPoint.city}`}
                    </h2>
                    <p className="mt-2 text-sm text-slate-200/90">{selectedPoint.summary}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-cyan-200/30 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-300/20"
                    onClick={() => scrollToAnchor(selectedPoint.anchor)}
                  >
                    查看正文年份
                  </button>
                </div>

                {selectedPoint.detailText && (
                  <p className="mt-4 text-sm md:text-base text-slate-200/90 leading-relaxed">
                    {selectedPoint.detailText}
                  </p>
                )}

                {selectedPhotos.length > 0 && (
                  <div className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                    {selectedPhotos.map((photo, index) => (
                      <figure key={`${selectedPoint.id}-${index}`} className="snap-start shrink-0 w-[72vw] md:w-[320px]">
                        <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-white/20 bg-slate-800/60">
                          <img
                            src={photo.src}
                            alt={photo.alt ?? `${selectedPoint.city} photo ${index + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/38 to-transparent" />
                        </div>
                      </figure>
                    ))}
                  </div>
                )}
              </article>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  )
}
