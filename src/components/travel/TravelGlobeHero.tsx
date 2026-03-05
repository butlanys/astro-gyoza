import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  Color,
  EllipsoidTerrainProvider,
  Entity,
  HeadingPitchRange,
  HorizontalOrigin,
  Ion,
  IonImageryProvider,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  type ImageryProvider,
  type TerrainProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const CESIUM_ION_TOKEN = import.meta.env.PUBLIC_CESIUM_ION_TOKEN ?? ''
const CESIUM_ION_IMAGERY_ASSET_ID =
  import.meta.env.PUBLIC_CESIUM_ION_IMAGERY_ASSET_ID ??
  import.meta.env.PUBLIC_CESIUM_ION_SATELLITE_ASSET_ID ??
  ''
const CESIUM_ION_TERRAIN_ASSET_ID = import.meta.env.PUBLIC_CESIUM_ION_TERRAIN_ASSET_ID ?? ''

const DEFAULT_VIEW = {
  lat: 33.5,
  lng: 104.5,
}

const DEFAULT_VIEW_HEIGHT_DESKTOP = 14_500_000
const DEFAULT_VIEW_HEIGHT_MOBILE = 17_500_000
const DEFAULT_VIEW_HEADING = CesiumMath.toRadians(12)
const DEFAULT_VIEW_PITCH = CesiumMath.toRadians(-84)
const CLOSE_VIEW_RANGE_DESKTOP = 170_000
const CLOSE_VIEW_RANGE_MOBILE = 240_000
const CLOSE_VIEW_PITCH = CesiumMath.toRadians(-82)
const CLOSE_VIEW_THRESHOLD_DESKTOP = 900_000
const CLOSE_VIEW_THRESHOLD_MOBILE = 1_200_000
const AUTO_ROTATE_SPEED_RAD_PER_SECOND = CesiumMath.toRadians(2.3)

interface TravelPhoto {
  src: string
  alt?: string
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

function parseAssetId(rawValue: string) {
  if (!rawValue) return null
  const value = Number(rawValue)
  return Number.isInteger(value) && value > 0 ? value : null
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

function getPointFromPickedObject(
  pickedObject: unknown,
  pointByEntityId: Map<string, TravelPoint>,
): TravelPoint | null {
  if (!pickedObject || typeof pickedObject !== 'object') return null

  const maybeId = (pickedObject as { id?: unknown }).id
  if (!maybeId) return null

  const entityId = maybeId instanceof Entity ? maybeId.id : typeof maybeId === 'string' ? maybeId : null
  if (!entityId) return null

  return pointByEntityId.get(entityId) ?? null
}

export function TravelGlobeHero({ title, description, points }: TravelGlobeHeroProps) {
  const viewerRef = useRef<Viewer | null>(null)
  const globeContainerRef = useRef<HTMLDivElement | null>(null)
  const pointByEntityIdRef = useRef<Map<string, TravelPoint>>(new Map())
  const pointEntitiesRef = useRef<Map<string, Entity>>(new Map())
  const selectedPointRef = useRef<TravelPoint | null>(null)
  const isPointerOverGlobeRef = useRef(false)
  const isUserInteractingRef = useRef(false)
  const isMobileViewportRef = useRef(false)
  const isTouchDeviceRef = useRef(false)
  const lastRotateTickRef = useRef(0)
  const wheelInteractionTimeoutRef = useRef<number | null>(null)

  const [FallbackMap, setFallbackMap] = useState<null | ((props: { points: TravelPoint[] }) => JSX.Element)>(null)
  const [isWebGLSupported, setIsWebGLSupported] = useState(true)
  const [isSceneReady, setIsSceneReady] = useState(false)
  const [isCloseView, setIsCloseView] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<TravelPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<TravelPoint | null>(null)
  const [imageryStatusText, setImageryStatusText] = useState('正在初始化 Cesium 场景...')

  const countries = useMemo(() => Array.from(new Set(points.map((point) => point.country))), [points])

  useEffect(() => {
    setIsWebGLSupported(detectWebGLSupport())
  }, [])

  useEffect(() => {
    const viewportMedia = window.matchMedia('(max-width: 767px)')
    const touchMedia = window.matchMedia('(pointer: coarse)')

    const applyCameraInteractionPolicy = (viewer: Viewer) => {
      const controller = viewer.scene.screenSpaceCameraController

      controller.enableZoom = true
      controller.enableRotate = true
      controller.enableTilt = true
      controller.enableLook = true
      controller.enableTranslate = true
      controller.minimumZoomDistance = 85_000
      controller.maximumZoomDistance = 42_000_000
    }

    const syncViewport = () => {
      isMobileViewportRef.current = viewportMedia.matches
      isTouchDeviceRef.current =
        touchMedia.matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window

      const viewer = viewerRef.current
      if (viewer && !viewer.isDestroyed()) {
        applyCameraInteractionPolicy(viewer)
      }
    }

    syncViewport()
    viewportMedia.addEventListener('change', syncViewport)
    touchMedia.addEventListener('change', syncViewport)

    return () => {
      viewportMedia.removeEventListener('change', syncViewport)
      touchMedia.removeEventListener('change', syncViewport)
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

  const flyToDefaultView = useCallback((viewer: Viewer, duration = 1.5) => {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        DEFAULT_VIEW.lng,
        DEFAULT_VIEW.lat,
        isMobileViewportRef.current ? DEFAULT_VIEW_HEIGHT_MOBILE : DEFAULT_VIEW_HEIGHT_DESKTOP,
      ),
      orientation: {
        heading: DEFAULT_VIEW_HEADING,
        pitch: DEFAULT_VIEW_PITCH,
        roll: 0,
      },
      duration,
    })
  }, [])

  const flyToPoint = useCallback((viewer: Viewer, point: TravelPoint, duration = 1.3) => {
    const targetPosition = Cartesian3.fromDegrees(point.lng, point.lat, 0)
    const targetSphere = new BoundingSphere(targetPosition, 1)
    viewer.camera.flyToBoundingSphere(targetSphere, {
      duration,
      offset: new HeadingPitchRange(
        CesiumMath.toRadians(0),
        CLOSE_VIEW_PITCH,
        isMobileViewportRef.current ? CLOSE_VIEW_RANGE_MOBILE : CLOSE_VIEW_RANGE_DESKTOP,
      ),
    })
  }, [])

  const closeDetail = useCallback(() => {
    setSelectedPoint(null)
    setHoveredPoint(null)
    const viewer = viewerRef.current
    if (viewer) {
      flyToDefaultView(viewer)
    }
  }, [flyToDefaultView])

  const openDetail = useCallback(
    (point: TravelPoint) => {
      setSelectedPoint(point)
      setHoveredPoint(null)
      const viewer = viewerRef.current
      if (viewer) {
        flyToPoint(viewer, point)
      }
    },
    [flyToPoint],
  )

  useEffect(() => {
    selectedPointRef.current = selectedPoint
  }, [selectedPoint])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const shouldShowMarkers = !selectedPoint && !isCloseView
    pointEntitiesRef.current.forEach((entity) => {
      entity.show = shouldShowMarkers
    })

    if (!shouldShowMarkers) {
      setHoveredPoint(null)
    }
  }, [selectedPoint, isCloseView])

  useEffect(() => {
    if (!isWebGLSupported) return

    const container = globeContainerRef.current
    if (!container) return

    let isDisposed = false
    let viewer: Viewer | null = null
    let handler: ScreenSpaceEventHandler | null = null

    const initCesiumScene = async () => {
      setIsSceneReady(false)
      setImageryStatusText('正在初始化 Cesium 场景...')

      const token = CESIUM_ION_TOKEN.trim()
      const imageryAssetId = parseAssetId(CESIUM_ION_IMAGERY_ASSET_ID)
      const terrainAssetId = parseAssetId(CESIUM_ION_TERRAIN_ASSET_ID)

      let imageryProvider: ImageryProvider | null = null
      let terrainProvider: TerrainProvider = new EllipsoidTerrainProvider()

      if (token) {
        Ion.defaultAccessToken = token
      }

      if (token && imageryAssetId) {
        try {
          imageryProvider = await IonImageryProvider.fromAssetId(imageryAssetId)
          setImageryStatusText('Cesium ion 卫星影像已启用')
        } catch (error) {
          console.warn('[TravelGlobeHero] Failed to load Cesium ion imagery asset.', error)
          setImageryStatusText('Cesium 影像资产初始化失败，已回退到 OSM 底图')
        }
      } else if (!token) {
        setImageryStatusText('缺少 PUBLIC_CESIUM_ION_TOKEN，当前为 OSM 底图')
      } else {
        setImageryStatusText('缺少 PUBLIC_CESIUM_ION_IMAGERY_ASSET_ID，当前为 OSM 底图')
      }

      if (token && terrainAssetId) {
        try {
          terrainProvider = await CesiumTerrainProvider.fromIonAssetId(terrainAssetId)
        } catch (error) {
          console.warn('[TravelGlobeHero] Failed to load Cesium ion terrain asset.', error)
        }
      }

      if (!imageryProvider) {
        imageryProvider = new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        })
      }

      if (isDisposed) return

      viewer = new Viewer(container, {
        terrainProvider,
        baseLayer: false,
        shouldAnimate: true,
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        creditContainer: undefined,
      })

      viewerRef.current = viewer
      viewer.imageryLayers.removeAll()
      viewer.imageryLayers.addImageryProvider(imageryProvider)
      viewer.scene.globe.depthTestAgainstTerrain = true
      viewer.scene.globe.maximumScreenSpaceError = isMobileViewportRef.current ? 1.6 : 1.1
      viewer.scene.postProcessStages.fxaa.enabled = true
      viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, isMobileViewportRef.current ? 1.7 : 2.2)

      const controller = viewer.scene.screenSpaceCameraController
      controller.enableZoom = true
      controller.enableRotate = true
      controller.enableTilt = true
      controller.enableLook = true
      controller.enableTranslate = true
      controller.minimumZoomDistance = 85_000
      controller.maximumZoomDistance = 42_000_000

      pointByEntityIdRef.current = new Map()
      pointEntitiesRef.current = new Map()

      points.forEach((point) => {
        const entity = viewer!.entities.add({
          id: point.id,
          position: Cartesian3.fromDegrees(point.lng, point.lat, 0),
          point: {
            pixelSize: 10,
            color: Color.fromCssColorString('#67e8f9').withAlpha(0.98),
            outlineColor: Color.fromCssColorString('#082f49').withAlpha(0.95),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${point.country} · ${point.city}`,
            font: '600 13px Atkinson, PingFang SC, sans-serif',
            fillColor: Color.fromCssColorString('#e2e8f0'),
            showBackground: true,
            backgroundColor: Color.fromBytes(2, 6, 23, 180),
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -18),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })

        pointByEntityIdRef.current.set(point.id, point)
        pointEntitiesRef.current.set(point.id, entity)
      })

      const updateCameraDepthState = () => {
        if (!viewer) return
        const cameraHeight = Cartographic.fromCartesian(viewer.camera.position).height
        const nextIsCloseView =
          cameraHeight <=
          (isMobileViewportRef.current ? CLOSE_VIEW_THRESHOLD_MOBILE : CLOSE_VIEW_THRESHOLD_DESKTOP)

        setIsCloseView((prev) => (prev === nextIsCloseView ? prev : nextIsCloseView))
      }

      handler = new ScreenSpaceEventHandler(viewer.scene.canvas)

      handler.setInputAction(() => {
        isUserInteractingRef.current = true
      }, ScreenSpaceEventType.LEFT_DOWN)

      handler.setInputAction(() => {
        isUserInteractingRef.current = false
      }, ScreenSpaceEventType.LEFT_UP)

      handler.setInputAction(() => {
        isUserInteractingRef.current = true
      }, ScreenSpaceEventType.PINCH_START)

      handler.setInputAction(() => {
        isUserInteractingRef.current = false
      }, ScreenSpaceEventType.PINCH_END)

      handler.setInputAction(() => {
        isUserInteractingRef.current = true
        if (wheelInteractionTimeoutRef.current !== null) {
          window.clearTimeout(wheelInteractionTimeoutRef.current)
        }
        wheelInteractionTimeoutRef.current = window.setTimeout(() => {
          isUserInteractingRef.current = false
          wheelInteractionTimeoutRef.current = null
        }, 140)
      }, ScreenSpaceEventType.WHEEL)

      handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
        if (!viewer || !movement.endPosition) return

        const isOverGlobe = Boolean(viewer.camera.pickEllipsoid(movement.endPosition, viewer.scene.globe.ellipsoid))
        isPointerOverGlobeRef.current = isOverGlobe

        if (selectedPointRef.current || !isOverGlobe) {
          setHoveredPoint(null)
          return
        }

        const picked = viewer.scene.pick(movement.endPosition)
        const point = getPointFromPickedObject(picked, pointByEntityIdRef.current)
        setHoveredPoint((prev) => (prev?.id === point?.id ? prev : point))
      }, ScreenSpaceEventType.MOUSE_MOVE)

      handler.setInputAction((movement: { position: Cartesian2 }) => {
        if (!viewer || !movement.position) return

        const picked = viewer.scene.pick(movement.position)
        let point = getPointFromPickedObject(picked, pointByEntityIdRef.current)
        if (!point) {
          const pickedStack = viewer.scene.drillPick(movement.position, 8)
          for (const pickedItem of pickedStack) {
            point = getPointFromPickedObject(pickedItem, pointByEntityIdRef.current)
            if (point) break
          }
        }
        if (!point) return

        openDetail(point)
      }, ScreenSpaceEventType.LEFT_CLICK)

      const onTick = () => {
        if (!viewer || viewer.isDestroyed()) return

        const now = performance.now()
        const prev = lastRotateTickRef.current
        lastRotateTickRef.current = now

        if (prev === 0) return
        if (isTouchDeviceRef.current) return
        if (selectedPointRef.current || isPointerOverGlobeRef.current || isUserInteractingRef.current) return

        const deltaSeconds = Math.min((now - prev) / 1000, 0.1)
        viewer.scene.camera.rotate(Cartesian3.UNIT_Z, -AUTO_ROTATE_SPEED_RAD_PER_SECOND * deltaSeconds)
      }

      const handlePointerLeave = () => {
        isPointerOverGlobeRef.current = false
        setHoveredPoint(null)
      }

      const applyResolutionScale = () => {
        if (!viewer || viewer.isDestroyed()) return

        viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, isMobileViewportRef.current ? 1.7 : 2.2)
      }

      viewer.camera.changed.addEventListener(updateCameraDepthState)
      viewer.clock.onTick.addEventListener(onTick)
      container.addEventListener('pointerleave', handlePointerLeave)
      window.addEventListener('resize', applyResolutionScale)

      flyToDefaultView(viewer, 0)
      updateCameraDepthState()
      applyResolutionScale()

      if (!isDisposed) {
        setIsSceneReady(true)
      }

      return () => {
        viewer?.camera.changed.removeEventListener(updateCameraDepthState)
        viewer?.clock.onTick.removeEventListener(onTick)
        container.removeEventListener('pointerleave', handlePointerLeave)
        window.removeEventListener('resize', applyResolutionScale)
      }
    }

    let removeSceneListeners: undefined | (() => void)
    initCesiumScene()
      .then((cleanupFn) => {
        removeSceneListeners = cleanupFn
      })
      .catch((error) => {
        console.warn('[TravelGlobeHero] Failed to initialize Cesium viewer.', error)
        setImageryStatusText('Cesium 场景初始化失败，请刷新重试')
      })

    return () => {
      isDisposed = true
      removeSceneListeners?.()
      setHoveredPoint(null)

      if (wheelInteractionTimeoutRef.current !== null) {
        window.clearTimeout(wheelInteractionTimeoutRef.current)
        wheelInteractionTimeoutRef.current = null
      }

      handler?.destroy()
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy()
      }

      viewerRef.current = null
      pointByEntityIdRef.current.clear()
      pointEntitiesRef.current.clear()
      isUserInteractingRef.current = false
      isPointerOverGlobeRef.current = false
      lastRotateTickRef.current = 0
    }
  }, [flyToDefaultView, isWebGLSupported, openDetail, points])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDetail()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeDetail])

  if (!isWebGLSupported) {
    return (
      <section className="relative min-h-[600px] border-b border-primary bg-[#050b18]">
        <div className="mx-auto max-w-[1100px] px-4 py-8 md:px-8 space-y-5">
          <h1 className="text-3xl md:text-4xl font-bold text-zinc-100">{title}</h1>
          <p className="text-zinc-300">{description}</p>
          <p className="text-sm text-zinc-400">当前环境不支持 WebGL，已自动切换到兼容地图模式。</p>
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

  const selectedPhotos = selectedPoint?.photos ?? []

  return (
    <section
      className="relative h-screen md:h-dvh min-h-[620px] overflow-hidden border-b border-primary"
      aria-label="Travel globe hero"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(120% 100% at 50% 110%, rgba(14, 116, 144, 0.22) 0%, rgba(2, 6, 23, 0.96) 45%, #020617 100%), url('/assets/travel-globe/stars/night-sky.png')",
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />

      <div ref={globeContainerRef} className="travel-cesium-viewer absolute inset-0 z-0" />

      <AnimatePresence>
        {!selectedPoint && !isCloseView && (
          <motion.div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-6 md:px-8 md:pt-8"
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

              <div className="mt-3 text-xs text-slate-300/80">{imageryStatusText}</div>
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
        {hoveredPoint && !selectedPoint && !isCloseView && (
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
              className="absolute inset-0 z-10 bg-transparent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDetail}
              aria-label="Close detail overlay"
            />

            <motion.button
              type="button"
              className="absolute right-4 top-[76px] z-20 inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-slate-900/70 text-slate-100 backdrop-blur hover:bg-slate-800/80 md:right-6"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onClick={closeDetail}
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
              <article className="mx-auto max-w-[980px] rounded-2xl border border-white/20 bg-slate-900/60 p-4 text-slate-100 backdrop-blur-xl shadow-2xl shadow-black/30 md:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-slate-300">{selectedPoint.year}</div>
                    <h2 className="mt-1 text-xl md:text-2xl font-bold">
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
                      <figure key={`${selectedPoint.id}-${index}`} className="w-[72vw] shrink-0 snap-start md:w-[320px]">
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
