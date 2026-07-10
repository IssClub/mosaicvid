import { useEffect, useMemo, useState, useRef } from 'react'
import ShapeSelector from './components/ShapeSelector'
import MediaUploader from './components/MediaUploader'
import BackgroundSelector from './components/BackgroundSelector'
import AnimationSettings from './components/AnimationSettings'
import AudioTimeline, { DEFAULT_FADE_MS } from './components/AudioTimeline'
import TextPagesEditor from './components/TextPagesEditor'
import ExportPanel from './components/ExportPanel'
import MosaicPlayer from './components/MosaicPlayer'
import { createPresetMask, createTextMask, createImageMask } from './lib/shapeMask'
import { samplePoints } from './lib/samplePoints'
import { buildMediaItem, seededShuffle } from './lib/mediaThumbnail'
import { buildTimeline } from './lib/buildTimeline'
import { AudioEngine } from './lib/audioEngine'
import { recordTimeline, convertWebmToMp4 } from './lib/videoExport'

const ASPECT_VALUES = { square: 1, vertical: 9 / 16, horizontal: 16 / 9 }
const DEFAULT_PREVIEW_COUNT = 60
const PAGE_ENTER_MS = 500
const PAGE_EXIT_MS = 400

function buildPagesSchedule(pages) {
  let cursor = 0
  const schedule = pages.map((p) => {
    const start = cursor
    const end = start + p.durationMs
    cursor = end
    return {
      start,
      end,
      enterEnd: start + Math.min(PAGE_ENTER_MS, p.durationMs * 0.4),
      exitStart: end - Math.min(PAGE_EXIT_MS, p.durationMs * 0.3),
    }
  })
  return { schedule, totalDuration: cursor }
}

export default function App() {
  const [shapeMode, setShapeMode] = useState('preset')
  const [presetKey, setPresetKey] = useState('heart')
  const [numberText, setNumberText] = useState('40')
  const [customFile, setCustomFile] = useState(null)
  const [customFileName, setCustomFileName] = useState('')
  const [previewCount, setPreviewCount] = useState(DEFAULT_PREVIEW_COUNT)
  const [aspectKey, setAspectKey] = useState('square')
  const [maskCanvas, setMaskCanvas] = useState(null)
  const [error, setError] = useState('')

  const [mediaItems, setMediaItems] = useState([])
  const [orderMode, setOrderMode] = useState('random')
  const nextIdRef = useRef(1)
  const nextTrackIdRef = useRef(1)
  const nextPageIdRef = useRef(1)

  const [background, setBackground] = useState({ type: 'color', color: '#ffffff' })
  const [entryStyle, setEntryStyle] = useState('random')
  const [stayDuration, setStayDuration] = useState(500)
  const [settleDuration, setSettleDuration] = useState(550)
  const [staggerGap, setStaggerGap] = useState(150)

  const [musicTracks, setMusicTracks] = useState([])
  const [textPages, setTextPages] = useState([])

  // שעון ניגון משותף - גם לקנבס וגם למנוע השמע, כדי ששניהם יהיו תמיד מסונכרנים
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true)
  const currentTimeRef = useRef(0)
  const clockRef = useRef({ animId: null, lastFrameTime: 0 })
  const audioEngineRef = useRef(null)
  if (!audioEngineRef.current) audioEngineRef.current = new AudioEngine()
  const canvasElRef = useRef(null)

  const [exportStatus, setExportStatus] = useState('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [webmUrl, setWebmUrl] = useState(null)
  const webmBlobRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function build() {
      try {
        setError('')
        if (shapeMode === 'preset') {
          setMaskCanvas(createPresetMask(presetKey))
        } else if (shapeMode === 'number') {
          setMaskCanvas(createTextMask(numberText))
        } else if (shapeMode === 'custom') {
          if (!customFile) {
            setMaskCanvas(null)
            return
          }
          const mask = await createImageMask(customFile)
          if (!cancelled) setMaskCanvas(mask)
        }
      } catch (e) {
        setError('לא הצלחנו ליצור את הצורה מהקובץ הזה. נסה תמונה אחרת.')
      }
    }
    build()
    return () => {
      cancelled = true
    }
  }, [shapeMode, presetKey, numberText, customFile])

  const aspect = ASPECT_VALUES[aspectKey]
  // פריטים שנכשלה עבורם ההמרה/טעינה לא נכנסים לפסיפס (הם עדיין מוצגים ברשימת המדיה עם תג "לא נתמך")
  const validMediaItems = useMemo(() => mediaItems.filter((it) => !it.error), [mediaItems])
  const count = validMediaItems.length > 0 ? validMediaItems.length : previewCount

  const { points, tileScale } = useMemo(() => {
    if (!maskCanvas) return { points: [], tileScale: 0.05 }
    try {
      return samplePoints(maskCanvas, count, aspect, 7)
    } catch (e) {
      return { points: [], tileScale: 0.05 }
    }
  }, [maskCanvas, count, aspect])

  // שיוך מדיה לנקודות - לפי מצב הסדר שנבחר (אקראי / סדר העלאה / שם קובץ)
  const orderedMedia = useMemo(() => {
    if (validMediaItems.length === 0) return null
    if (orderMode === 'filename') {
      return [...validMediaItems].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    }
    if (orderMode === 'upload') return validMediaItems
    return seededShuffle(validMediaItems, 99)
  }, [validMediaItems, orderMode])

  // לוח הזמנים לכניסת הפריטים, לפי מצב solo/overlap של כל אחד (זהו הזמן הפנימי של הפסיפס עצמו, מתחיל מ-0)
  const { schedule, totalDuration } = useMemo(() => {
    const itemsForTimeline = orderedMedia && orderedMedia.length > 0
      ? orderedMedia
      : points.map(() => ({ entryMode: 'overlap' }))
    return buildTimeline(itemsForTimeline, { stayDuration, settleDuration, staggerGap })
  }, [orderedMedia, points, stayDuration, settleDuration, staggerGap])

  // דפי פתיחה/סיום ולוחות הזמנים שלהם
  const introPages = useMemo(() => textPages.filter((p) => p.position === 'intro'), [textPages])
  const outroPages = useMemo(() => textPages.filter((p) => p.position === 'outro'), [textPages])
  const introInfo = useMemo(() => buildPagesSchedule(introPages), [introPages])
  const outroInfo = useMemo(() => buildPagesSchedule(outroPages), [outroPages])

  // אורך הסרטון הכולל: דפי פתיחה + הפסיפס + דפי סיום
  const grandTotalDuration = introInfo.totalDuration + totalDuration + outroInfo.totalDuration

  // חלונות "עמעום" - מתי בציר הזמן הכללי וידאו עם קול בפועל מתנגן, כדי להנמיך את המוזיקה
  const duckWindows = useMemo(() => {
    if (!orderedMedia) return []
    return schedule
      .map((sch, i) => ({ sch, item: orderedMedia[i] }))
      .filter(({ item }) => item?.type === 'video' && item?.hasAudio)
      .map(({ sch }) => ({ start: sch.enterEnd + introInfo.totalDuration, end: sch.displayEnd + introInfo.totalDuration }))
  }, [schedule, orderedMedia, introInfo.totalDuration])

  // איפוס השעון כשהצורה/המדיה משתנים באופן מהותי
  useEffect(() => {
    setCurrentTime(0)
    currentTimeRef.current = 0
    setIsPlaying(true)
  }, [schedule, points])

  // לולאת הניגון המרכזית - מניעה גם את הקנבס וגם (בעקיפין) את המוזיקה
  useEffect(() => {
    const st = clockRef.current
    if (st.animId) cancelAnimationFrame(st.animId)
    if (!isPlaying) return

    st.lastFrameTime = performance.now()
    function tick(now) {
      const dt = now - st.lastFrameTime
      st.lastFrameTime = now
      setCurrentTime((t) => {
        const next = t + dt
        if (next >= grandTotalDuration) {
          setIsPlaying(false)
          currentTimeRef.current = grandTotalDuration
          return grandTotalDuration
        }
        currentTimeRef.current = next
        return next
      })
      st.animId = requestAnimationFrame(tick)
    }
    st.animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(st.animId)
  }, [isPlaying, grandTotalDuration])

  // סנכרון מנוע השמע: מתחיל/עוצר עם play/pause, ומתזמן מחדש כשהמוזיקה או חלונות העמעום משתנים
  useEffect(() => {
    const engine = audioEngineRef.current
    if (isPlaying) {
      engine.play(currentTimeRef.current, musicTracks, duckWindows)
    } else {
      engine.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, musicTracks, duckWindows])

  function handleSetCurrentTime(value) {
    currentTimeRef.current = value
    setCurrentTime(value)
  }

  function handleCanvasReady(el) {
    canvasElRef.current = el
  }

  function handleCustomImageChange(file) {
    setCustomFile(file)
    setCustomFileName(file.name)
  }

  async function handleAddFiles(files) {
    const newItems = files.map((file) => ({ id: nextIdRef.current++, file }))
    setMediaItems((prev) => [
      ...prev,
      ...newItems.map((n) => ({
        id: n.id,
        file: n.file,
        type: n.file.type.startsWith('video/') ? 'video' : 'image',
        thumbnailUrl: null,
        name: n.file.name,
        entryMode: 'overlap',
      })),
    ])

    for (const n of newItems) {
      const built = await buildMediaItem(n.file, n.id)
      const stayOverride = built.type === 'video' ? { stayDuration: built.durationMs } : {}
      setMediaItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, ...built, ...stayOverride } : it)))
    }
  }

  function handleRemoveMedia(id) {
    setMediaItems((prev) => {
      const item = prev.find((it) => it.id === id)
      if (item?.type === 'image' && item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl)
      if (item?.type === 'video' && item.videoUrl) URL.revokeObjectURL(item.videoUrl)
      return prev.filter((it) => it.id !== id)
    })
  }

  function handleToggleEntryMode(id) {
    setMediaItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, entryMode: it.entryMode === 'solo' ? 'overlap' : 'solo' } : it))
    )
  }

  function handleRemoveErrors() {
    setMediaItems((prev) => prev.filter((it) => !it.error))
  }

  function handleSetItemsDuration(ids, ms) {
    setMediaItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, stayDuration: ms } : it)))
  }

  function handleClearItemsDuration(ids) {
    setMediaItems((prev) =>
      prev.map((it) => {
        if (!ids.includes(it.id)) return it
        const { stayDuration, ...rest } = it
        // וידאו חוזר לברירת המחדל שלו (משך הקליפ המקורי), תמונה חוזרת לברירת המחדל הכללית
        return it.type === 'video' ? { ...rest, stayDuration: it.durationMs } : rest
      })
    )
  }

  async function handleAddMusicTracks(files) {
    const engine = audioEngineRef.current
    for (const file of files) {
      const id = nextTrackIdRef.current++
      try {
        const durationMs = await engine.loadTrack(id, file)
        // ברירת מחדל: השיר החדש מתחיל מיד אחרי שהאחרון מסתיים (או מ-0 אם זה הראשון)
        setMusicTracks((prev) => {
          const lastEnd = prev.reduce((max, t) => Math.max(max, t.timelineStart + (t.trimEnd - t.trimStart)), 0)
          const trimEnd = Math.min(durationMs, grandTotalDuration)
          return [
            ...prev,
            {
              id,
              name: file.name,
              durationMs,
              trimStart: 0,
              trimEnd,
              timelineStart: Math.min(lastEnd, Math.max(0, grandTotalDuration - trimEnd)),
              fadeInMs: DEFAULT_FADE_MS,
              fadeOutMs: DEFAULT_FADE_MS,
              volume: 1,
            },
          ]
        })
      } catch (e) {
        // קובץ שמע לא תקין/נכשל בטעינה - מדלגים
      }
    }
  }

  function handleUpdateMusicTrack(id, patch) {
    setMusicTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function handleRemoveMusicTrack(id) {
    audioEngineRef.current.removeTrack(id)
    setMusicTracks((prev) => prev.filter((t) => t.id !== id))
  }

  function handleAddTextPage(position) {
    setTextPages((prev) => [
      ...prev,
      {
        id: nextPageIdRef.current++,
        position,
        text: 'כותרת חדשה',
        bgType: 'color',
        bgColor: '#ffffff',
        bgPresetKey: 'cream',
        textColor: '#1c1815',
        entryStyle: 'fadeScale',
        durationMs: 2500,
      },
    ])
  }

  function handleUpdateTextPage(id, patch) {
    setTextPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function handleRemoveTextPage(id) {
    setTextPages((prev) => prev.filter((p) => p.id !== id))
  }

  function handleReorderTextPage(id, direction) {
    setTextPages((prev) => {
      const page = prev.find((p) => p.id === id)
      if (!page) return prev
      const sameGroup = prev.filter((p) => p.position === page.position)
      const idx = sameGroup.findIndex((p) => p.id === id)
      const swapIdx = idx + direction
      if (swapIdx < 0 || swapIdx >= sameGroup.length) return prev
      const otherPage = sameGroup[swapIdx]
      const idxInFull = prev.findIndex((p) => p.id === id)
      const otherIdxInFull = prev.findIndex((p) => p.id === otherPage.id)
      const next = [...prev]
      ;[next[idxInFull], next[otherIdxInFull]] = [next[otherIdxInFull], next[idxInFull]]
      return next
    })
  }

  function describeError(e) {
    if (!e) return 'שגיאה לא ידועה'
    if (e.message) return e.message
    if (typeof e === 'string') return e
    try {
      return JSON.stringify(e)
    } catch (err) {
      return String(e)
    }
  }

  async function handleStartExport() {
    if (!canvasElRef.current) return
    setExportStatus('recording')
    setExportProgress(0)
    setExportError('')
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
      setDownloadUrl(null)
    }
    if (webmUrl) {
      URL.revokeObjectURL(webmUrl)
      setWebmUrl(null)
    }
    webmBlobRef.current = null
    const engine = audioEngineRef.current
    const audioStream = engine.startExportCapture()
    let webmBlob
    try {
      webmBlob = await recordTimeline({
        canvas: canvasElRef.current,
        audioStream,
        totalDurationMs: grandTotalDuration,
        onProgress: setExportProgress,
        onSeek: handleSetCurrentTime,
        onPlayStateChange: setIsPlaying,
      })
      engine.stopExportCapture()
    } catch (e) {
      engine.stopExportCapture()
      console.error('Recording failed:', e)
      setExportError(describeError(e))
      setExportStatus('error')
      return
    }

    // ההקלטה עצמה הצליחה - שומרים אותה כגיבוי מיד, כדי שלא נאבד אותה גם אם ההמרה ל-MP4 תיכשל
    webmBlobRef.current = webmBlob
    setWebmUrl(URL.createObjectURL(webmBlob))
    await attemptMp4Conversion(webmBlob)
  }

  async function attemptMp4Conversion(webmBlob) {
    setExportStatus('converting')
    setExportProgress(0)
    try {
      const mp4Blob = await convertWebmToMp4(webmBlob, setExportProgress)
      const url = URL.createObjectURL(mp4Blob)
      setDownloadUrl(url)
      setExportStatus('done')
    } catch (e) {
      console.error('MP4 conversion failed:', e)
      setExportError(describeError(e))
      setExportStatus('mp4-failed')
    }
  }

  function handleRetryMp4() {
    if (webmBlobRef.current) attemptMp4Conversion(webmBlobRef.current)
  }

  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="px-6 md:px-10 pt-8 pb-4">
        <p className="text-xs tracking-widest text-[var(--muted)] uppercase mb-1">מחולל וידאו פסיפס</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--text)]">
          כל תמונה. <span className="text-[var(--accent-amber)]">צורה אחת.</span>
        </h1>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 px-6 md:px-10 pb-10">
        <section className="bg-[var(--surface)]/60 border border-white/5 rounded-2xl p-6 space-y-8 overflow-y-auto max-h-[calc(100vh-180px)]">
          <ExportPanel
            status={exportStatus}
            progress={exportProgress}
            downloadUrl={downloadUrl}
            webmUrl={webmUrl}
            errorMessage={exportError}
            onStart={handleStartExport}
            onRetryMp4={handleRetryMp4}
          />

          <div className="h-px bg-white/5" />
          <ShapeSelector
            shapeMode={shapeMode}
            onShapeModeChange={setShapeMode}
            presetKey={presetKey}
            onPresetChange={setPresetKey}
            numberText={numberText}
            onNumberTextChange={setNumberText}
            onCustomImageChange={handleCustomImageChange}
            customFileName={customFileName}
            count={count}
            onCountChange={setPreviewCount}
            aspectKey={aspectKey}
            onAspectChange={setAspectKey}
            countLocked={validMediaItems.length > 0}
          />
          {error && <p className="text-sm text-[var(--accent-coral)]">{error}</p>}

          <div className="h-px bg-white/5" />
          <TextPagesEditor
            pages={textPages}
            onAddPage={handleAddTextPage}
            onUpdatePage={handleUpdateTextPage}
            onRemovePage={handleRemoveTextPage}
            onReorderPage={handleReorderTextPage}
          />

          <div className="h-px bg-white/5" />
          <BackgroundSelector background={background} onChange={setBackground} />

          <div className="h-px bg-white/5" />
          <AnimationSettings
            entryStyle={entryStyle}
            onEntryStyleChange={setEntryStyle}
            stayDuration={stayDuration}
            onStayDurationChange={setStayDuration}
            settleDuration={settleDuration}
            onSettleDurationChange={setSettleDuration}
            staggerGap={staggerGap}
            onStaggerGapChange={setStaggerGap}
          />

          <div className="h-px bg-white/5" />
          <AudioTimeline
            tracks={musicTracks}
            totalDuration={grandTotalDuration}
            onAddTracks={handleAddMusicTracks}
            onUpdateTrack={handleUpdateMusicTrack}
            onRemoveTrack={handleRemoveMusicTrack}
          />

          <div className="h-px bg-white/5" />
          <MediaUploader
            items={mediaItems}
            onAddFiles={handleAddFiles}
            onRemove={handleRemoveMedia}
            onRemoveErrors={handleRemoveErrors}
            onToggleEntryMode={handleToggleEntryMode}
            orderMode={orderMode}
            onOrderModeChange={setOrderMode}
            onSetItemsDuration={handleSetItemsDuration}
            onClearItemsDuration={handleClearItemsDuration}
            defaultStayDuration={stayDuration}
          />
        </section>

        <section className="bg-[var(--surface)]/30 border border-white/5 rounded-2xl p-4 md:p-8 flex items-center justify-center min-h-[420px]">
          {points.length > 0 ? (
            <MosaicPlayer
              points={points}
              tileScale={tileScale}
              media={orderedMedia}
              schedule={schedule}
              totalDuration={totalDuration}
              aspect={aspect}
              background={background}
              entryStyleSetting={entryStyle}
              currentTime={currentTime}
              isPlaying={isPlaying}
              onSetCurrentTime={handleSetCurrentTime}
              onSetIsPlaying={setIsPlaying}
              introPages={introPages}
              introSchedule={introInfo.schedule}
              introTotalDuration={introInfo.totalDuration}
              outroPages={outroPages}
              outroSchedule={outroInfo.schedule}
              audioEngine={audioEngineRef.current}
              onCanvasReady={handleCanvasReady}
              className="max-w-full max-h-full"
            />
          ) : (
            <p className="text-[var(--muted)] text-sm">בחר צורה כדי לראות תצוגה מקדימה</p>
          )}
        </section>
      </main>

      <footer className="px-6 md:px-10 pb-6 text-xs text-[var(--muted)]">
        {points.length} אריחים, {mediaItems.length} פריטי מדיה, {musicTracks.length} רצועות מוזיקה, {textPages.length} דפי טקסט, אורך כולל: {(grandTotalDuration / 1000).toFixed(1)} שניות
      </footer>
    </div>
  )
}
