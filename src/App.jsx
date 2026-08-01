import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import ShapeSelector from './components/ShapeSelector'
import MediaUploader from './components/MediaUploader'
import BackgroundSelector from './components/BackgroundSelector'
import AnimationSettings from './components/AnimationSettings'
import AudioTimeline from './components/AudioTimeline'
import TextPagesEditor from './components/TextPagesEditor'
import ExportPanel from './components/ExportPanel'
import MosaicPlayer from './components/MosaicPlayer'
import { createPresetMask, createTextMask, createImageMask } from './lib/shapeMask'
import { samplePoints } from './lib/samplePoints'
import { buildMediaItem, seededShuffle } from './lib/mediaThumbnail'
import { buildTimeline } from './lib/buildTimeline'
import { AudioEngine } from './lib/audioEngine'
import { exportMp4 } from './lib/videoExport'
import { saveProjectFiles, saveProjectSettings, loadProject, clearProject } from './lib/projectStorage'

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
  const [holdDuration, setHoldDuration] = useState(3000)
  const [defaultEntryMode, setDefaultEntryMode] = useState('solo')

  const [musicTracks, setMusicTracks] = useState([])
  const [textPages, setTextPages] = useState([])

  // שחזור פרויקט - האם יש פרויקט שמור ב-IndexedDB מסשן קודם, ואם אנחנו כרגע באמצע שחזור שלו
  const [savedProjectInfo, setSavedProjectInfo] = useState(null)
  const [isRestoringProject, setIsRestoringProject] = useState(false)
  const skipAutoSaveRef = useRef(true) // לא לשמור לפני שהעמוד בכלל בדק אם יש פרויקט שמור קיים

  // שעון ניגון משותף - גם לקנבס וגם למנוע השמע, כדי ששניהם יהיו תמיד מסונכרנים
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const currentTimeRef = useRef(0)
  const clockRef = useRef({ animId: null, lastFrameTime: 0 })
  const exportCancelRef = useRef({ cancelled: false })
  const audioEngineRef = useRef(null)
  if (!audioEngineRef.current) audioEngineRef.current = new AudioEngine()
  const exportApiRef = useRef(null)

  const [exportStatus, setExportStatus] = useState('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportError, setExportError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [partialDownloadUrl, setPartialDownloadUrl] = useState(null)

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

  // בדיקה חד-פעמית בטעינת הדף אם יש פרויקט שמור מסשן קודם (לא טוענים אותו אוטומטית - שואלים קודם).
  // כל תגובות הצד (כולל שחרור skipAutoSaveRef) מוגנות ב-cancelled - קריטי כי React (ב-StrictMode,
  // dev בלבד) מריץ אפקטים כאלה פעמיים ברצף (mount→cleanup→mount) - בלי ההגנה הזו, ה"ניסיון" הראשון
  // שבוטל היה עדיין יכול לשחרר את הדגל *לפני* שהניסיון השני (האמיתי) הספיק למצוא את הפרויקט השמור,
  // מה שפותח חלון קצר שבו שמירה אוטומטית עם ה-state הריק הראשוני דורסת את מה שהיה שמור בפועל.
  useEffect(() => {
    let cancelled = false
    loadProject()
      .then((saved) => {
        if (cancelled) return
        if (saved && ((saved.mediaItems && saved.mediaItems.length > 0) || (saved.musicTracks && saved.musicTracks.length > 0))) {
          setSavedProjectInfo(saved)
        }
        skipAutoSaveRef.current = false
      })
      .catch(() => {
        // IndexedDB לא זמין/נכשל - פשוט אין שחזור, לא קריטי
        if (!cancelled) skipAutoSaveRef.current = false
      })
    return () => { cancelled = true }
  }, [])

  async function handleRestoreProject() {
    if (!savedProjectInfo) return
    setIsRestoringProject(true)
    skipAutoSaveRef.current = true
    try {
      const saved = savedProjectInfo
      const engine = audioEngineRef.current

      // שחזור פריטי מדיה - בונים מחדש thumbnail/videoUrl/durationMs מהקובץ המקורי (השמורים לא
      // תקפים יותר אחרי טעינה מחדש של הדף), תוך שימור entryMode/stayDuration שהמשתמש הגדיר.
      const restoredMedia = []
      let maxId = 0
      for (const raw of saved.mediaItems || []) {
        maxId = Math.max(maxId, raw.id)
        try {
          const built = await buildMediaItem(raw.file, raw.id)
          restoredMedia.push({ ...built, entryMode: raw.entryMode, ...(raw.stayDuration != null ? { stayDuration: raw.stayDuration } : {}) })
        } catch (e) {
          // פריט בודד שנכשל בשחזור - מדלגים עליו בלי להפיל את כל השחזור
        }
      }
      setMediaItems(restoredMedia)
      nextIdRef.current = maxId + 1

      // שחזור רצועות מוזיקה - צריך לפענח מחדש כל קובץ (ה-AudioBuffer לא נשמר, רק הקובץ המקורי)
      const restoredTracks = []
      let maxTrackId = 0
      for (const raw of saved.musicTracks || []) {
        maxTrackId = Math.max(maxTrackId, raw.id)
        try {
          await engine.loadTrack(raw.id, raw.file)
          restoredTracks.push({ id: raw.id, name: raw.name, durationMs: raw.durationMs, trimStart: raw.trimStart, trimEnd: raw.trimEnd, timelineStart: raw.timelineStart, volume: raw.volume })
        } catch (e) {
          // רצועה בודדת שנכשלה בפענוח - מדלגים
        }
      }
      setMusicTracks(restoredTracks)
      nextTrackIdRef.current = maxTrackId + 1

      setTextPages(saved.textPages || [])
      nextPageIdRef.current = Math.max(0, ...(saved.textPages || []).map((p) => p.id)) + 1

      if (saved.shapeMode) setShapeMode(saved.shapeMode)
      if (saved.presetKey) setPresetKey(saved.presetKey)
      if (saved.numberText) setNumberText(saved.numberText)
      if (saved.customFile) { setCustomFile(saved.customFile); setCustomFileName(saved.customFileName || '') }
      if (saved.aspectKey) setAspectKey(saved.aspectKey)
      if (saved.orderMode) setOrderMode(saved.orderMode)
      if (saved.background) setBackground(saved.background)
      if (saved.entryStyle) setEntryStyle(saved.entryStyle)
      if (typeof saved.stayDuration === 'number') setStayDuration(saved.stayDuration)
      if (typeof saved.settleDuration === 'number') setSettleDuration(saved.settleDuration)
      if (typeof saved.staggerGap === 'number') setStaggerGap(saved.staggerGap)
      if (typeof saved.holdDuration === 'number') setHoldDuration(saved.holdDuration)
      if (saved.defaultEntryMode) setDefaultEntryMode(saved.defaultEntryMode)
    } finally {
      setIsRestoringProject(false)
      setSavedProjectInfo(null)
      skipAutoSaveRef.current = false
    }
  }

  function handleDismissSavedProject() {
    setSavedProjectInfo(null)
    clearProject().catch(() => {})
  }

  // תמונת מצב של הקבצים הכבדים בלבד (מדיה + מוזיקה, כולל ה-Blobs) - נבנית בנפרד מההגדרות כדי
  // שנוכל לשמור אותה רק כשסט הקבצים באמת משתנה, לא בכל שינוי הגדרה קטן.
  const buildFilesSnapshot = useCallback(() => {
    const cleanMediaItems = mediaItems
      .filter((it) => !it.error)
      .map((it) => ({ id: it.id, file: it.file, entryMode: it.entryMode, ...(it.stayDuration != null ? { stayDuration: it.stayDuration } : {}) }))
    const cleanMusicTracks = musicTracks.map((t) => ({ id: t.id, file: t.file, name: t.name, durationMs: t.durationMs, trimStart: t.trimStart, trimEnd: t.trimEnd, timelineStart: t.timelineStart, volume: t.volume })).filter((t) => t.file)
    return { mediaItems: cleanMediaItems, musicTracks: cleanMusicTracks }
  }, [mediaItems, musicTracks])

  // תמונת מצב של ההגדרות הקלות בלבד (בלי קבצים) - זול לשמור אותה בתדירות גבוהה.
  const buildSettingsSnapshot = useCallback(() => ({
    textPages,
    shapeMode,
    presetKey,
    numberText,
    customFile,
    customFileName,
    aspectKey,
    orderMode,
    background,
    entryStyle,
    stayDuration,
    settleDuration,
    staggerGap,
    holdDuration,
    defaultEntryMode,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [textPages, shapeMode, presetKey, numberText, customFile, customFileName, aspectKey, orderMode, background, entryStyle, stayDuration, settleDuration, staggerGap, holdDuration, defaultEntryMode])

  // שמירה אוטומטית של הקבצים - רק כשסט המדיה/המוזיקה באמת משתנה (לא בכל שינוי הגדרה), כדי לא
  // לכתוב מחדש ל-IndexedDB קבצי וידאו כבדים על כל טוגל/סליידר קטן.
  // קריטי: לא שומרים כל עוד יש באנר שחזור ממתין (savedProjectInfo) - אחרת ה-state הריק/הנוכחי
  // (לפני שהמשתמש הספיק להחליט אם לשחזר) היה דורס את הפרויקט השמור עוד לפני שהוא נגע בכפתור!
  useEffect(() => {
    if (skipAutoSaveRef.current || isRestoringProject || savedProjectInfo) return
    const timeoutId = setTimeout(() => {
      saveProjectFiles(buildFilesSnapshot()).catch((e) => console.error('שמירת קבצי הפרויקט נכשלה:', e))
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [buildFilesSnapshot, isRestoringProject, savedProjectInfo])

  // שמירה אוטומטית של ההגדרות - זול, אז אפשר בתדירות גבוהה בלי חשש (אבל אותה הגנה מפני באנר ממתין).
  useEffect(() => {
    if (skipAutoSaveRef.current || isRestoringProject || savedProjectInfo) return
    const timeoutId = setTimeout(() => {
      saveProjectSettings(buildSettingsSnapshot()).catch((e) => console.error('שמירת הגדרות הפרויקט נכשלה:', e))
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [buildSettingsSnapshot, isRestoringProject, savedProjectInfo])

  // שמירה מיידית (בלי debounce) ממש לפני שהדף עומד להיסגר - כדי שגם אם קורה קריסה, לא נאבד
  // שינויים אחרונים שעדיין לא הספיקו להישמר.
  useEffect(() => {
    function saveBeforeUnload() {
      if (skipAutoSaveRef.current || isRestoringProject || savedProjectInfo) return
      saveProjectFiles(buildFilesSnapshot()).catch(() => {})
      saveProjectSettings(buildSettingsSnapshot()).catch(() => {})
    }
    window.addEventListener('beforeunload', saveBeforeUnload)
    return () => window.removeEventListener('beforeunload', saveBeforeUnload)
  }, [buildFilesSnapshot, buildSettingsSnapshot, isRestoringProject, savedProjectInfo])

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
      : points.map(() => ({ entryMode: defaultEntryMode }))
    return buildTimeline(itemsForTimeline, { stayDuration, settleDuration, staggerGap, holdDuration })
  }, [orderedMedia, points, stayDuration, settleDuration, staggerGap, holdDuration, defaultEntryMode])

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

  // קבצי הקול של פריטי וידאו (לרינדור הקול הלא-בזמן-אמת של הייצוא) - אותו חלון זמן בדיוק כמו duckWindows
  const videoAudioItems = useMemo(() => {
    if (!orderedMedia) return []
    return schedule
      .map((sch, i) => ({ sch, item: orderedMedia[i] }))
      .filter(({ item }) => item?.type === 'video' && item?.hasAudio && item?.file)
      .map(({ sch, item }) => ({
        file: item.file,
        startMs: sch.enterEnd + introInfo.totalDuration,
        durationMs: sch.displayEnd - sch.enterEnd,
      }))
  }, [schedule, orderedMedia, introInfo.totalDuration])

  // שירים בודדים (בלי חפיפה עם שכן) מתנגנים במלוא העוצמה מההתחלה ועד הסוף.
  // רק כששני שירים חופפים בפועל על הציר, מתווסף fade על אזור החפיפה כדי למנוע קפיצה/התנגשות ביניהם.
  const musicTracksWithFades = useMemo(() => {
    const sorted = [...musicTracks].sort((a, b) => a.timelineStart - b.timelineStart)
    return sorted.map((t, i) => {
      const duration = t.trimEnd - t.trimStart
      const start = t.timelineStart
      const end = start + duration
      const prev = sorted[i - 1]
      const next = sorted[i + 1]
      const fadeInMs = prev ? Math.max(0, Math.min(duration, prev.timelineStart + (prev.trimEnd - prev.trimStart) - start)) : 0
      const fadeOutMs = next ? Math.max(0, Math.min(duration, end - next.timelineStart)) : 0
      return { ...t, fadeInMs, fadeOutMs }
    })
  }, [musicTracks])

  // איפוס השעון כשהצורה/המדיה משתנים באופן מהותי - בלי להתחיל ניגון אוטומטית, רק בלחיצה מפורשת על Play
  useEffect(() => {
    setCurrentTime(0)
    currentTimeRef.current = 0
    setIsPlaying(false)
  }, [schedule, points])

  // לולאת הניגון המרכזית - מניעה גם את הקנבס וגם (בעקיפין) את המוזיקה.
  // משתמשים ב-setInterval ולא ב-requestAnimationFrame בכוונה: דפדפנים כמעט ומשהים לגמרי rAF
  // כשהכרטיסייה לא גלויה (טאב ברקע/חלון ממוזער/מסך נעול) - קטלני להקלטת ייצוא בזמן אמת שיכולה
  // לקחת דקות ארוכות. setInterval ממשיך לרוץ (עם throttling מתון בהרבה) גם ברקע, וה-dt מחושב
  // תמיד לפי זמן אמת אמיתי (performance.now()) כך שהקצב נשאר נכון גם אם הקריאות מתדלדלות.
  useEffect(() => {
    const st = clockRef.current
    if (st.animId) clearInterval(st.animId)
    if (!isPlaying) return

    st.lastFrameTime = performance.now()
    function tick() {
      const now = performance.now()
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
    }
    st.animId = setInterval(tick, 16)
    return () => clearInterval(st.animId)
  }, [isPlaying, grandTotalDuration])

  // סנכרון מנוע השמע: מתחיל/עוצר עם play/pause, ומתזמן מחדש כשהמוזיקה או חלונות העמעום משתנים
  useEffect(() => {
    const engine = audioEngineRef.current
    if (isPlaying) {
      engine.play(currentTimeRef.current, musicTracksWithFades, duckWindows)
    } else {
      engine.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, musicTracksWithFades, duckWindows])

  function handleSetCurrentTime(value) {
    currentTimeRef.current = value
    setCurrentTime(value)
  }

  const handleExportApiReady = useCallback((api) => {
    exportApiRef.current = api
  }, [])

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
        entryMode: defaultEntryMode,
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
        // ברירת מחדל: השיר החדש מתחיל מיד אחרי שהאחרון מסתיים (או מ-0 אם זה הראשון), ומנוגן
        // במלוא אורכו הטבעי - בלי לקצר/להזיז אותו מראש כדי "להתאים" לסוף הסרטון. אם הוא נמשך
        // מעבר לסוף בפועל, הוא פשוט ייחתך שם בבת אחת (בלי דהייה) - לא יוזז אחורה ולא יקוצר יזום.
        setMusicTracks((prev) => {
          const lastEnd = prev.reduce((max, t) => Math.max(max, t.timelineStart + (t.trimEnd - t.trimStart)), 0)
          return [
            ...prev,
            {
              id,
              file,
              name: file.name,
              durationMs,
              trimStart: 0,
              trimEnd: durationMs,
              timelineStart: lastEnd,
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
    if (!exportApiRef.current) return
    // שמירה מיידית (לא ממתינים ל-debounce) ממש לפני שמתחילים - זה בדיוק הרגע הכי מסוכן
    // (ייצוא ארוך שיכול לקרוס), אז חשוב שהמצב האחרון יהיה שמור לפני שמתחילים בכלל.
    saveProjectFiles(buildFilesSnapshot()).catch(() => {})
    saveProjectSettings(buildSettingsSnapshot()).catch(() => {})
    exportCancelRef.current.cancelled = false
    setExportStatus('recording')
    setExportProgress(0)
    setExportError('')
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
      setDownloadUrl(null)
    }
    if (partialDownloadUrl) {
      URL.revokeObjectURL(partialDownloadUrl)
      setPartialDownloadUrl(null)
    }
    const engine = audioEngineRef.current
    const musicTracksForExport = musicTracksWithFades
      .map((t) => ({ ...t, audioBuffer: engine.getBuffer(t.id) }))
      .filter((t) => t.audioBuffer)

    // מונע נעילת מסך/שינה של המחשב תוך כדי ייצוא ארוך - לא קריטי אם הדפדפן לא תומך, מדלגים בשקט.
    let wakeLock = null
    try { wakeLock = await navigator.wakeLock?.request('screen') } catch (e) { /* לא נתמך/נדחה - לא קריטי */ }

    try {
      const mp4Blob = await exportMp4({
        renderFrameAt: exportApiRef.current.renderFrameAt,
        getCanvas: exportApiRef.current.getCanvas,
        totalDurationMs: grandTotalDuration,
        musicTracks: musicTracksForExport,
        videoAudioItems,
        duckWindows,
        isCancelled: () => exportCancelRef.current.cancelled,
        onProgress: (frac, phase) => {
          setExportProgress(frac)
          setExportStatus(phase === 'frames' ? 'recording' : 'converting')
        },
      })
      const url = URL.createObjectURL(mp4Blob)
      setDownloadUrl(url)
      setExportStatus('done')
    } catch (e) {
      if (e?.isExportCancelled) {
        setExportStatus('idle')
      } else {
        console.error('Export failed:', e)
        setExportError(describeError(e))
        if (e?.partialBlob) {
          setPartialDownloadUrl(URL.createObjectURL(e.partialBlob))
        }
        setExportStatus('error')
      }
    } finally {
      try { wakeLock?.release() } catch (e) { /* לא קריטי */ }
      // הייצוא צייר על הקנבס פריימים אימפרטיבית לאורך כל הציר - משחזרים את התצוגה למיקום שבו
      // המשתמש נמצא בפועל בסקרפבר, כדי שהמסך לא יישאר "תקוע" על הפריים האחרון שיוצא.
      exportApiRef.current?.renderFrameAt(currentTimeRef.current)
    }
  }

  function handleCancelExport() {
    exportCancelRef.current.cancelled = true
  }

  return (
    <div className="min-h-screen w-full flex flex-col">
      <header className="px-6 md:px-10 pt-8 pb-4">
        <p className="text-xs tracking-widest text-[var(--muted)] uppercase mb-1">מחולל וידאו פסיפס</p>
        <h1 className="font-display text-3xl md:text-4xl text-[var(--text)]">
          כל תמונה. <span className="text-[var(--accent-amber)]">צורה אחת.</span>
        </h1>
      </header>

      {savedProjectInfo && (
        <div className="mx-6 md:mx-10 mb-4 p-4 rounded-xl bg-[var(--accent-amber)]/10 border border-[var(--accent-amber)]/40 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-sm text-[var(--text)]">
            נמצא פרויקט שמור מסשן קודם ({(savedProjectInfo.mediaItems || []).length} פריטי מדיה, {(savedProjectInfo.musicTracks || []).length} רצועות מוזיקה) - לשחזר אותו?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleRestoreProject}
              disabled={isRestoringProject}
              className="px-4 py-2 rounded-lg bg-[var(--accent-amber)] text-[#1c1815] text-sm font-medium disabled:opacity-60"
            >
              {isRestoringProject ? 'משחזר...' : 'שחזר פרויקט'}
            </button>
            <button
              onClick={handleDismissSavedProject}
              disabled={isRestoringProject}
              className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--muted)] text-sm disabled:opacity-60"
            >
              התחל מחדש
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 px-6 md:px-10 pb-10">
        <section className="bg-[var(--surface)]/60 border border-white/5 rounded-2xl p-6 space-y-8 overflow-y-auto max-h-[calc(100vh-180px)]">
          <ExportPanel
            status={exportStatus}
            progress={exportProgress}
            downloadUrl={downloadUrl}
            partialDownloadUrl={partialDownloadUrl}
            errorMessage={exportError}
            onStart={handleStartExport}
            onCancel={handleCancelExport}
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
            holdDuration={holdDuration}
            onHoldDurationChange={setHoldDuration}
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
            defaultEntryMode={defaultEntryMode}
            onDefaultEntryModeChange={setDefaultEntryMode}
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
              onExportApiReady={handleExportApiReady}
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
