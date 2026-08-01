import { useEffect, useMemo, useRef, useState } from 'react'
import { renderBackground } from '../lib/backgrounds'
import { getEntryTransform, pickStyleForItem, ENTRY_STYLES } from '../lib/entryAnimations'

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function naturalSize(source) {
  if (!source) return { width: 1, height: 1 }
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth || 1, height: source.videoHeight || 1 }
  }
  return { width: source.width || 1, height: source.height || 1 }
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

// גודל מקסימלי (פיקסלים בציר הארוך) לתמונה ממוזערת שמוחזקת בזיכרון לאחר שפריט "התיישב" באריח הסופי -
// הרבה יותר קטן מהתמונה המקורית (עד 1600px), כדי שמאות פריטים לא יצברו ג'יגה-בייטים של זיכרון תמונות
// מפוענחות לכל אורך הסרטון.
const SETTLED_TILE_CACHE_SIZE = 320

function downscaleForTile(source, maxSize) {
  const { width: nw, height: nh } = naturalSize(source)
  const scale = Math.min(1, maxSize / Math.max(nw, nh))
  const w = Math.max(1, Math.round(nw * scale))
  const h = Math.max(1, Math.round(nh * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(source, 0, 0, w, h)
  return c
}

/**
 * מצייר דף טקסט (פתיחה/סיום) - רקע (צבע/עיצוב), עם אנימציית כניסה ודהייה ביציאה.
 */
function drawTextPage(ctx, width, height, page, sch, localTime) {
  if (page.bgType === 'preset') {
    renderBackground(ctx, width, height, { type: 'preset', presetKey: page.bgPresetKey })
  } else {
    ctx.fillStyle = page.bgColor || '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }

  const style = page.entryStyle === 'random' ? ENTRY_STYLES[Math.abs(hashStr(String(page.id))) % ENTRY_STYLES.length] : page.entryStyle
  const enterDuration = Math.max(1, sch.enterEnd - sch.start)
  const rawT = (localTime - sch.start) / enterDuration
  const center = { x: width / 2, y: height / 2 }
  const tr = getEntryTransform(style, rawT, center, width, height)

  const entering = localTime < sch.enterEnd
  let alpha = entering ? tr.alpha : 1
  if (localTime > sch.exitStart) {
    const exitT = (localTime - sch.exitStart) / Math.max(1, sch.end - sch.exitStart)
    alpha = Math.max(0, 1 - exitT)
  }
  const scaleX = entering ? tr.scaleX : 1
  const scaleY = entering ? tr.scaleY : 1
  const px = entering ? tr.x : center.x
  const py = entering ? tr.y : center.y
  const rotation = entering ? tr.rotation : 0

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(px, py)
  if (rotation) ctx.rotate(rotation)
  ctx.scale(scaleX, scaleY)

  const fontSize = Math.round(height * 0.07)
  ctx.font = `700 ${fontSize}px "Frank Ruhl Libre", serif`
  ctx.fillStyle = page.textColor || '#1c1815'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = (page.text || '').split('\n')
  const lineHeight = fontSize * 1.3
  const totalH = lines.length * lineHeight
  lines.forEach((line, i) => {
    const y = -totalH / 2 + lineHeight / 2 + i * lineHeight
    ctx.fillText(line, 0, y)
  })
  ctx.restore()
}

/**
 * נגן פסיפס - כל תמונה/וידאו עובר שלושה שלבים:
 * 1. כניסה - מגיע למרכז המסך בגודל מלא (שומר על יחס הממדים המקורי).
 * 2. הצגה - וידאו: מנגן בפועל את מלוא אורכו (מחליף את משך ההשהייה). תמונה: נשארת סטטית.
 * 3. נפילה - מצטמצם ונע מהמרכז אל מקומו הסופי בפסיפס (הופך בהדרגה לריבוע חתוך). וידאו נופל כפריים הראשון שלו.
 *
 * לפני/אחרי הפסיפס, אפשר להציג דפי טקסט (פתיחה/סיום) - introPages/outroPages, עם לוח הזמנים שלהם.
 */
export default function MosaicPlayer({
  points,
  tileScale = 0.05,
  media,
  schedule,
  totalDuration,
  aspect = 1,
  background,
  entryStyleSetting = 'random',
  currentTime,
  isPlaying,
  onSetCurrentTime,
  onSetIsPlaying,
  introPages = [],
  introSchedule = [],
  introTotalDuration = 0,
  outroPages = [],
  outroSchedule = [],
  audioEngine = null,
  onExportApiReady,
  className = '',
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const imageCacheRef = useRef(new Map())
  const videoElsRef = useRef(new Map())
  const bgImageRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  const itemStyles = useMemo(() => {
    const rng = mulberry32(11)
    return (media || []).map((_, i) => pickStyleForItem(entryStyleSetting, i, rng))
  }, [media, entryStyleSetting])

  useEffect(() => {
    if (background?.type === 'image' && background.imageFile) {
      const url = URL.createObjectURL(background.imageFile)
      const img = new Image()
      img.onload = () => {
        bgImageRef.current = img
        draw()
      }
      img.src = url
      return () => URL.revokeObjectURL(url)
    } else {
      bgImageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background?.type, background?.imageFile])

  /**
   * טוען ומחזיר תמונה עבור ציור. wantFull=true (כניסה/הצגה/נפילה) מחזיר את התמונה בגודל המלא.
   * wantFull=false (הפריט כבר התיישב באריח הסופי) מוזערת אותה לגודל אריח ומשחררת את הגרסה הכבדה
   * מהזיכרון - קריטי עם הרבה פריטים, אחרת כל תמונה שכבר "סיימה את תפקידה" ממשיכה לתפוס זיכרון
   * מלא לכל אורך הסרטון (בדיוק כמו disposeVideo לוידאו).
   */
  function getImage(url, wantFull) {
    const cache = imageCacheRef.current
    let entry = cache.get(url)
    if (!entry) {
      entry = { full: null, small: null, loading: false }
      cache.set(url, entry)
    }

    if (!wantFull) {
      if (entry.full && !entry.small) {
        entry.small = downscaleForTile(entry.full, SETTLED_TILE_CACHE_SIZE)
        entry.full = null
      }
      if (entry.small) return entry.small
      if (!entry.loading) {
        entry.loading = true
        const img = new Image()
        img.onload = () => {
          entry.small = downscaleForTile(img, SETTLED_TILE_CACHE_SIZE)
          entry.loading = false
          draw()
        }
        img.src = url
      }
      return null
    }

    // צריך גודל מלא - אם קיימת רק גרסה ממוזערת (למשל גרירה אחורה בציר לפני שהפריט התיישב),
    // טוענים מחדש מהמקור (מהיר - הדפדפן כבר שמר את הקובץ במטמון הרשת).
    if (entry.full) return entry.full
    if (!entry.loading) {
      entry.loading = true
      const img = new Image()
      img.onload = () => {
        entry.full = img
        entry.loading = false
        draw()
      }
      img.src = url
    }
    return entry.small
  }

  function getVideoEl(item) {
    const cache = videoElsRef.current
    let entry = cache.get(item.id)
    if (!entry) {
      const el = document.createElement('video')
      el.src = item.videoUrl
      el.muted = false
      el.playsInline = true
      el.preload = 'auto'
      el.loop = false
      entry = { el, ready: false, disposed: false, started: false }
      el.addEventListener('loadeddata', () => {
        entry.ready = true
        draw()
      })
      cache.set(item.id, entry)
      if (audioEngine) audioEngine.connectVideoElement(el)
    } else if (entry.disposed) {
      // הוידאו שוחרר קודם (כדי לחסוך זיכרון) - טוענים אותו מחדש אם חוזרים אליו (למשל גרירה אחורה בציר)
      entry.el.src = item.videoUrl
      entry.ready = false
      entry.disposed = false
      entry.started = false
    }
    return entry
  }

  /**
   * משחרר את הזיכרון הכבד שהוידאו הזה מחזיק (הבאפר המפוענח), ברגע שהוא כבר לא צריך לנגן בפועל.
   * קריטי כשיש הרבה קטעי וידאו בפסיפס - בלי זה, כל וידאו שכבר "סיים את תפקידו" ממשיך לתפוס זיכרון
   * לכל אורך הסרטון, מה שגורם לתקיעות עם הרבה קבצים.
   */
  function disposeVideo(vs) {
    if (vs.disposed) return
    try {
      vs.el.pause()
      vs.el.removeAttribute('src')
      vs.el.load()
    } catch (e) { /* לא קריטי */ }
    vs.disposed = true
  }

  function drawInBox(ctx, source, cx, cy, boxW, boxH, radius) {
    const { width: nw, height: nh } = naturalSize(source)
    roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, radius)
    ctx.save()
    ctx.clip()
    const scale = Math.max(boxW / nw, boxH / nh)
    const dw = nw * scale
    const dh = nh * scale
    try {
      ctx.drawImage(source, cx - dw / 2, cy - dh / 2, dw, dh)
    } catch (e) {
      // מקור לא מוכן עדיין לציור (למשל וידאו שטרם טען פריים) - מדלגים בשקט
    }
    ctx.restore()
  }

  /**
   * מצייר פריים בודד. overrideT מאפשר לצייר פריים בזמן מסוים באופן אימפרטיבי (למשל לייצוא
   * דטרמיניסטי פריים-אחר-פריים) בלי לעבור דרך ה-prop/state הרגיל של currentTime.
   */
  function draw(overrideT) {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const time = overrideT ?? currentTime

    const introDur = introTotalDuration || 0
    const mosaicEnd = introDur + totalDuration

    // שלב דפי פתיחה
    if (introPages.length > 0 && time < introDur) {
      const idx = introSchedule.findIndex((s) => time < s.end)
      const activeIdx = idx === -1 ? introSchedule.length - 1 : idx
      if (introSchedule[activeIdx]) {
        drawTextPage(ctx, width, height, introPages[activeIdx], introSchedule[activeIdx], time)
      }
      return
    }

    // שלב דפי סיום
    if (outroPages.length > 0 && time >= mosaicEnd) {
      const localT = time - mosaicEnd
      const idx = outroSchedule.findIndex((s) => localT < s.end)
      const activeIdx = idx === -1 ? outroSchedule.length - 1 : idx
      if (outroSchedule[activeIdx]) {
        drawTextPage(ctx, width, height, outroPages[activeIdx], outroSchedule[activeIdx], localT)
      }
      return
    }

    // שלב הפסיפס עצמו - הזמן הפנימי שלו מוזז אחרי דפי הפתיחה
    const t = time - introDur

    const bgConfig = background?.type === 'image' ? { ...background, image: bgImageRef.current } : background
    renderBackground(ctx, width, height, bgConfig)

    const tileSize = Math.max(4, tileScale * height * 1.15)
    const fullSize = Math.min(width, height) * 0.82
    const center = { x: width / 2, y: height / 2 }

    points.forEach((p, i) => {
      const sch = schedule[i]
      if (!sch || t < sch.start) return

      const target = { x: p.x * width, y: p.y * height }
      const mediaItem = media && media[i]
      const isVideo = mediaItem?.type === 'video' && mediaItem.videoUrl
      const settled = t >= sch.end
      const staticImg = mediaItem?.thumbnailUrl ? getImage(mediaItem.thumbnailUrl, !settled) : null

      // תיבת "גודל מלא" ששומרת על יחס הממדים הטבעי, חסומה בתוך fullSize
      const refForAspect = staticImg
      let fullBoxW = fullSize
      let fullBoxH = fullSize
      if (refForAspect) {
        const r = refForAspect.width / refForAspect.height
        if (r >= 1) {
          fullBoxW = fullSize
          fullBoxH = fullSize / r
        } else {
          fullBoxH = fullSize
          fullBoxW = fullSize * r
        }
      }

      let cx, cy, boxW, boxH, alpha, radius
      let drawSource = staticImg

      if (t < sch.enterEnd) {
        const rawT = (t - sch.start) / sch.enterDuration
        const style = itemStyles[i] || 'fadeScale'
        const tr = getEntryTransform(style, rawT, center, width, height)
        cx = tr.x
        cy = tr.y
        boxW = fullBoxW * tr.scaleX
        boxH = fullBoxH * tr.scaleY
        alpha = tr.alpha
        radius = Math.min(boxW, boxH) * 0.06
        if (tr.rotation) {
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.translate(cx, cy)
          ctx.rotate(tr.rotation)
          if (drawSource) drawInBox(ctx, drawSource, 0, 0, boxW, boxH, radius)
          else { ctx.fillStyle = '#e8a33d'; roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, radius); ctx.fill() }
          ctx.restore()
          if (isVideo) {
            const vs = getVideoEl(mediaItem)
            if (!vs.el.paused) vs.el.pause()
          }
          return
        }
      } else if (t < sch.displayEnd) {
        // שלב הצגה: וידאו מנגן בפועל; תמונה נשארת סטטית
        cx = center.x
        cy = center.y
        boxW = fullBoxW
        boxH = fullBoxH
        alpha = 1
        radius = Math.min(boxW, boxH) * 0.06

        if (isVideo) {
          const vs = getVideoEl(mediaItem)
          const localTime = (t - sch.enterEnd) / 1000
          if (!vs.started) {
            // וידאו טרי שנכנס לשלב ההצגה בפעם הראשונה - מוודאים שהוא מתחיל בדיוק מ-0, לא ממקום שרירותי
            try { vs.el.currentTime = Math.max(0, localTime) } catch (e) { /* seek in progress */ }
            vs.started = true
          }
          if (isPlayingRef.current) {
            if (vs.el.paused && !vs.el.ended) vs.el.play().catch(() => {})
            // תיקון סחיפה גם תוך כדי ניגון בפועל - מונע מצב שבו הוידאו "מסיים מוקדם" (כי התחיל מהיסט שגוי)
            // וקופץ חזרה להתחלה עם עוד ניגון שיורי בסוף החלון
            if (Math.abs(vs.el.currentTime - localTime) > 0.6) {
              try { vs.el.currentTime = Math.max(0, localTime) } catch (e) { /* seek in progress */ }
            }
          } else {
            if (!vs.el.paused) vs.el.pause()
            if (Math.abs(vs.el.currentTime - localTime) > 0.08) {
              try { vs.el.currentTime = Math.max(0, localTime) } catch (e) { /* seek in progress */ }
            }
          }
          drawSource = vs.ready ? vs.el : staticImg
        }
      } else if (t < sch.end) {
        // שלב נפילה - תמיד כפריים סטטי (גם עבור וידאו). משחררים כאן את זיכרון הוידאו שכבר לא נחוץ.
        if (isVideo) {
          const vs = getVideoEl(mediaItem)
          disposeVideo(vs)
        }
        const rawT = (t - sch.displayEnd) / sch.settleDuration
        const et = easeInOutCubic(Math.min(1, Math.max(0, rawT)))
        cx = center.x + (target.x - center.x) * et
        cy = center.y + (target.y - center.y) * et
        boxW = fullBoxW + (tileSize - fullBoxW) * et
        boxH = fullBoxH + (tileSize - fullBoxH) * et
        alpha = 1
        radius = (Math.min(boxW, boxH) * 0.06) + (tileSize * 0.22 - Math.min(boxW, boxH) * 0.06) * et
      } else {
        if (isVideo) {
          const vs = getVideoEl(mediaItem)
          disposeVideo(vs)
        }
        cx = target.x
        cy = target.y
        boxW = tileSize
        boxH = tileSize
        alpha = 1
        radius = tileSize * 0.22
      }

      ctx.save()
      ctx.globalAlpha = alpha
      if (drawSource) {
        drawInBox(ctx, drawSource, cx, cy, boxW, boxH, radius)
      } else {
        ctx.fillStyle = '#e8a33d'
        roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, radius)
        ctx.fill()
      }
      ctx.restore()
    })
  }

  /** מחכה שוידאו נתון יגיע בדיוק (או קרוב ככל האפשר) לזמן היעד, לפני שממשיכים לצייר אותו. */
  function seekVideoPrecise(vs, targetSec) {
    return new Promise((resolve) => {
      const target = Math.max(0, targetSec)
      if (vs.el.readyState >= 2 && Math.abs(vs.el.currentTime - target) < 0.01) {
        resolve()
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        vs.el.removeEventListener('seeked', finish)
        clearTimeout(timeoutId)
        resolve()
      }
      vs.el.addEventListener('seeked', finish)
      // רשת/קידוד תקוע לא אמור לתקוע את כל הייצוא - אחרי המתנה סבירה ממשיכים עם מה שיש
      const timeoutId = setTimeout(finish, 1000)
      try {
        vs.el.currentTime = target
      } catch (e) {
        finish()
      }
    })
  }

  /**
   * מצייר פריים אחד בזמן נתון (ms) באופן אימפרטיבי, אחרי שסידר/חיכה לכל וידאו רלוונטי להגיע
   * בדיוק לזמן המקומי הנכון שלו - משמש את הייצוא הדטרמיניסטי (פריים-אחר-פריים, לא בזמן אמת).
   */
  async function renderFrameAt(timeMs, skipVideoSeek) {
    const introDur = introTotalDuration || 0
    const t = timeMs - introDur
    if (t >= 0 && t < totalDuration && !skipVideoSeek) {
      // חיפוש מדויק (seek) בוידאו הוא הפעולה היקרה ביותר בייצוא (עשרות-מאות מ"ש לכל קריאה, כי
      // הדפדפן צריך לפענח בפועל את הפריים המבוקש) - skipVideoSeek מאפשר לדלג עליו בחלק
      // מהפריימים (ולצייר עם הפריים המפוענח הקודם) כדי לקצר דרמטית ייצוא עם הרבה תוכן וידאו.
      const seeks = []
      points.forEach((p, i) => {
        const sch = schedule[i]
        if (!sch) return
        const mediaItem = media && media[i]
        const isVideo = mediaItem?.type === 'video' && mediaItem.videoUrl
        if (isVideo && t >= sch.enterEnd && t < sch.displayEnd) {
          const vs = getVideoEl(mediaItem)
          if (vs.el.paused === false) vs.el.pause()
          const localTime = (t - sch.enterEnd) / 1000
          seeks.push(seekVideoPrecise(vs, localTime))
        }
      })
      if (seeks.length) await Promise.all(seeks)
    }
    draw(timeMs)
  }

  useEffect(() => {
    if (onExportApiReady) {
      onExportApiReady({ renderFrameAt, getCanvas: () => canvasRef.current })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onExportApiReady, points, media, schedule, totalDuration, introTotalDuration])

  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, points, media, background, tileScale, introPages, outroPages])

  useEffect(() => {
    // עצירת כל הוידאו הפעילים כשהצורה/מדיה משתנה
    videoElsRef.current.forEach((v) => { try { v.el.pause() } catch (e) {} })
  }, [schedule, points])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    function resize() {
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (cw <= 0 || ch <= 0) return // המכל זמנית ללא שטח (למשל תוך כדי מעבר למסך מלא) - מדלגים כדי לא לאפס את הקנבס לגודל 0
      let w = cw
      let h = w / aspect
      if (h > ch) {
        h = ch
        w = h * aspect
      }
      // רזולוציית הקנבס בפועל (שהיא גם מה שמוקלט לייצוא) קבועה תמיד בציר הארוך, בלי שום קשר לגודל
      // התצוגה על המסך כרגע - כדי שהייצוא לא ייצא באיכות נמוכה סתם כי חלון הדפדפן/DevTools
      // מכווצים את שטח התצוגה. ה-CSS (style.width/height) בלבד קובע איך זה נראה על המסך;
      // רזולוציית הפיקסלים בפועל תמיד קבועה.
      // 1280 (במקום 1920 המקורי) - כדי לצמצם את צריכת הזיכרון הפנימית של ffmpeg.wasm בייצוא
      // (שקרסה עם "RuntimeError: memory access out of bounds" ב-1920 עם 180+ פריטים).
      const TARGET_LONG_EDGE = 1280
      let pw, ph
      if (aspect >= 1) {
        pw = TARGET_LONG_EDGE
        ph = Math.round(TARGET_LONG_EDGE / aspect)
      } else {
        ph = TARGET_LONG_EDGE
        pw = Math.round(TARGET_LONG_EDGE * aspect)
      }
      canvas.width = pw
      canvas.height = ph
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      draw()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect])

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
      setTimeout(() => {
        const container = containerRef.current
        if (container) {
          const ev = new Event('resize')
          window.dispatchEvent(ev)
        }
      }, 50)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    if (!document.fullscreenElement) {
      wrapper.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  const grandTotalDuration = (introTotalDuration || 0) + totalDuration + (outroSchedule.length ? outroSchedule[outroSchedule.length - 1].end : 0)

  return (
    <div ref={wrapperRef} className={`w-full h-full flex flex-col gap-3 ${isFullscreen ? 'bg-[var(--bg)] p-6 justify-center' : ''}`}>
      <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-0 relative">
        <canvas ref={canvasRef} className={`rounded-2xl ${className}`} />
        <button
          onClick={toggleFullscreen}
          className="absolute top-2 left-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white text-xs hover:bg-black/70 transition-colors"
          title="תצוגה במסך מלא"
        >
          {isFullscreen ? 'X' : '⛶'}
        </button>
      </div>
      <div className="flex items-center gap-3 px-1">
        <button
          onClick={() => onSetIsPlaying((p) => !p)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--accent-amber)] text-[#1c1815] shrink-0"
        >
          {isPlaying ? '❚❚' : '►'}
        </button>
        <button
          onClick={() => {
            onSetIsPlaying(false)
            onSetCurrentTime(grandTotalDuration)
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text)] text-xs shrink-0 border border-white/10"
          title="דלג לסוף - הצג את הפסיפס המוגמר"
        >
          ⏭
        </button>
        <input
          type="range"
          min={0}
          max={grandTotalDuration || 1}
          value={currentTime}
          onChange={(e) => {
            onSetIsPlaying(false)
            onSetCurrentTime(Number(e.target.value))
          }}
          className="flex-1 accent-[var(--accent-amber)]"
        />
        <span className="text-xs text-[var(--muted)] w-16 text-left shrink-0">
          {(currentTime / 1000).toFixed(1)}s / {(grandTotalDuration / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  )
}
