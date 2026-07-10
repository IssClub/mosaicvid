// mediaThumbnail.js
// אחראי על יצירת "פריים" ייצוגי לכל פריט מדיה שהועלה.
// עבור תמונה: object URL של הקובץ (או של גרסה מומרת ל-JPEG אם מדובר ב-HEIC/HEIF, שדפדפנים
// שאינם Safari לא יודעים לפענח באופן טבעי).
// עבור וידאו: תופסים פריים קפוא (dataURL) מתוך הסרטון, בהתאם להחלטה שוידאו בפסיפס הסופי קופא לתמונה סטטית.

function extOf(name) {
  return (/\.([a-zA-Z0-9]+)$/.exec(name || '') || [])[1]?.toLowerCase() || ''
}

/**
 * טוען תמונה מכתובת נתונה ומחזיר את אלמנט ה-Image הטעון, או null אם הדפדפן לא מצליח לפענח אותה.
 * חלק מהפורמטים (למשל TIFF) עוברים את בדיקת הסיומת אבל בפועל הדפדפן לא יודע להציג אותם -
 * במקרה כזה, בלי הבדיקה הזו, הפריט היה נשאר תקוע במצב "טוען..." לנצח במקום להיות מסומן כלא נתמך.
 */
function loadImageElement(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * מקטין תמונה גדולה (למשל 4000x3000 מהטלפון) לרזולוציה סבירה למסך (maxDim לצלע הארוכה).
 * זה קריטי לביצועים: בלי זה, 100+ תמונות במלוא הרזולוציה המקורית נשארות בזיכרון לכל אורך הסרטון
 * גם אחרי שהן כבר מוצגות כאריח פסיפס קטנטן - מה שגורם לתקיעות עם הרבה קבצים.
 */
function downscaleImage(img, maxDim = 1600) {
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  if (scale >= 1) return null // כבר קטנה מספיק, אין טעם להקטין
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85))
}
function isHeicFile(file) {
  const type = (file.type || '').toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  return ['heic', 'heif'].includes(extOf(file.name))
}

/**
 * ממיר קובץ HEIC/HEIF ל-JPEG בדפדפן (כדי שיהיה ניתן להצגה בכל דפדפן, לא רק Safari).
 * אם הקובץ אינו HEIC, או שההמרה נכשלת, מחזיר את הקובץ המקורי כפי שהוא.
 */
async function toRenderableImageFile(file) {
  if (!isHeicFile(file)) return file
  try {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
    const blob = Array.isArray(converted) ? converted[0] : converted
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
  } catch (e) {
    return null // ההמרה נכשלה - אין דרך אחרת להציג את הקובץ הזה בדפדפן הזה
  }
}

/**
 * מזהה (במידת האפשר - זו לא בדיקה מושלמת בכל הדפדפנים) אם לקובץ וידאו יש בפועל פס קול.
 * משמש לקביעה אוטומטית מתי צריך לעמעם את המוזיקה ברקע.
 */
function detectHasAudio(video) {
  return !!(
    video.mozHasAudio ||
    (video.audioTracks && video.audioTracks.length > 0) ||
    video.webkitAudioDecodedByteCount > 0
  )
}

/**
 * תופס פריים קפוא (הפריים הראשון, כמו preview בסייר קבצים) מתוך קובץ וידאו, ומחזיר גם את משכו וקיום קול.
 */
function captureVideoFrameAndDuration(file, atSeconds = 0.05) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    function cleanup() {
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }

    function onMeta() {
      const t = Math.min(atSeconds, Math.max(0, (video.duration || 0) - 0.03))
      video.currentTime = t
    }

    function onSeeked() {
      try {
        const maxDim = 1600
        const vw = video.videoWidth || 400
        const vh = video.videoHeight || 400
        const scale = Math.min(1, maxDim / Math.max(vw, vh))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(vw * scale)
        canvas.height = Math.round(vh * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        const durationMs = (video.duration || 2) * 1000
        const hasAudio = detectHasAudio(video)
        cleanup()
        // לא מוחקים את ה-URL - הוא נשאר בשימוש לניגון בפועל בנגן
        resolve({ thumbnailUrl: dataUrl, durationMs, videoUrl: url, hasAudio })
      } catch (e) {
        cleanup()
        URL.revokeObjectURL(url)
        reject(e)
      }
    }

    function onError(e) {
      cleanup()
      URL.revokeObjectURL(url)
      reject(e)
    }

    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
  })
}

/**
 * בונה item מלא (id, file, type, thumbnailUrl) מתוך File גולמי.
 */
export async function buildMediaItem(file, id) {
  const ext = extOf(file.name)
  const isVideo = file.type.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', '3gp', 'ogv'].includes(ext)
  if (isVideo) {
    try {
      const { thumbnailUrl, durationMs, videoUrl, hasAudio } = await captureVideoFrameAndDuration(file)
      return {
        id,
        file,
        type: 'video',
        thumbnailUrl,
        videoUrl,
        durationMs,
        hasAudio,
        name: file.name,
        format: ext,
      }
    } catch (e) {
      return { id, file, type: 'video', thumbnailUrl: null, videoUrl: null, durationMs: 2000, hasAudio: false, name: file.name, format: ext, error: true }
    }
  }

  const renderableFile = await toRenderableImageFile(file)
  if (!renderableFile) {
    // ההמרה מ-HEIC נכשלה - אין דרך להציג את התמונה הזו בדפדפן הזה
    return { id, file, type: 'image', thumbnailUrl: null, name: file.name, format: ext, error: true }
  }

  const originalUrl = URL.createObjectURL(renderableFile)
  const img = await loadImageElement(originalUrl)
  if (!img) {
    URL.revokeObjectURL(originalUrl)
    // הפורמט עבר את בדיקת הסיומת, אבל הדפדפן בפועל לא יודע לפענח אותו (למשל TIFF מסוימים)
    return { id, file, type: 'image', thumbnailUrl: null, name: file.name, format: ext, error: true }
  }

  const smallerBlob = await downscaleImage(img, 1600)
  const finalUrl = smallerBlob ? URL.createObjectURL(smallerBlob) : originalUrl
  if (smallerBlob) URL.revokeObjectURL(originalUrl) // התמונה המקורית (הגדולה) כבר לא נחוצה

  return {
    id,
    file,
    type: 'image',
    thumbnailUrl: finalUrl,
    name: file.name,
    format: ext,
  }
}

/**
 * ערבוב פשוט (Fisher-Yates) עם seed, כדי לקבל תוצאה יציבה בין רינדורים.
 */
export function seededShuffle(array, seed = 1) {
  const result = array.slice()
  let a = seed
  function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
