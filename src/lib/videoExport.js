// videoExport.js
// אחראי על הפקת קובץ ה-MP4 הסופי, בגישה דטרמיניסטית (לא הקלטה בזמן אמת):
// 1. עוברים על הציר פריים-אחר-פריים (לא בקצב ניגון אמיתי) - לכל פריים מזיזים כל וידאו רלוונטי
//    בדיוק לזמן הנכון שלו, מצלמים את הקנבס, ומקדדים בקבוצות קטנות (כדי לא לצבור זיכרון בלתי
//    מוגבל על סרטונים ארוכים).
// 2. מרנדרים את כל פס הקול (מוזיקה + קול וידאו + עמעום) בנפרד ובאופן לא-בזמן-אמת (OfflineAudioContext).
// 3. ממזגים את הווידאו (מקטעים מקודדים) עם פס הקול לקובץ MP4 אחד סופי.
// כך אין תלות בניגון בזמן אמת (שהיה שביר לעומס/טאב ברקע/נעילת מסך) ואין סחיפה בין קול לתמונה -
// הכל מחושב ממקור זמן משותף אחד.
//
// לסרטונים ארוכים/עם הרבה פריטים, הייצוא כולו מפוצל למספר "מקטעים" עצמאיים (ראו exportMp4
// למטה) - לכל מקטע יש מופע ffmpeg.wasm טרי משלו, כדי שזיכרון לא יצטבר לאורך כל הסרטון (מה
// שגרם בעבר לקריסת WASM מסוג "memory access out of bounds" בסרטונים ארוכים/כבדים). בסוף
// ממזגים את כל המקטעים (כולל הקול שלהם) לקובץ אחד רציף, בלי "תפר" נשמע/נראה.
//
// קובצי הליבה של ffmpeg (JS+WASM, כ-30MB) נטענים מ-CDN בזמן ריצה - עם כמה מקורות גיבוי,
// כדי שכשל חד-פעמי ברשת/CDN אחד לא ימנע את ההמרה.

import { renderAudioOffline, audioBufferToWav } from './audioRender'

const CORE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm',
]

// כמות פריימים לקבוצה - גבול עליון לזיכרון (קבוצה אחת בזמן נתון בזיכרון/במערכת הקבצים הוירטואלית
// של ffmpeg), כדי שמקטע ארוך לא יצבור ג'יגה-בייטים בבת אחת.
const CHUNK_FRAMES = 75
const EXPORT_FPS = 24
const JPEG_QUALITY = 0.88
// כל מקטע עצמאי מכסה עד כ-45 שניות מהציר בלבד - שמרני מאוד בכוונה. גם עם מופע ffmpeg טרי לכל
// מקטע ורזולוציה מוקטנת, עדיין ראינו תקיעות על 180+ פריטים; מקטעים קטנים בהרבה מצמצמים את
// שיא הזיכרון הנדרש בכל רגע נתון, גם אם זה אומר יותר טעינות מנוע לאורך הדרך.
const SEGMENT_DURATION_MS = 45000
// הפסקה קצרה בין מקטעים אחרי סיום/ניקוי אחד ולפני התחלת הבא - נותנת לדפדפן הזדמנות אמיתית
// לשחרר בפועל את הזיכרון של ה-Worker שסיים (terminate() לא בהכרח משחרר זיכרון באופן מיידי).
const BETWEEN_SEGMENTS_PAUSE_MS = 800

let ffmpegInstance = null
// יומן ההודעות הפנימי של ffmpeg (stderr/stdout בפועל) - נשמר תמיד כדי שאם ההמרה נכשלת נוכל
// להראות מה ffmpeg עצמו דיווח, במקום לנחש בעיוורון.
const recentLogs = []

function pushLog(message) {
  recentLogs.push(message)
  if (recentLogs.length > 200) recentLogs.shift()
}

// מאפשר לדווח על התקדמות בזמן אמת גם תוך כדי ffmpeg.exec() בודד (לא רק בין קריאות) - למשל
// קידוד קבוצת פריימים שיכול לקחת זמן משמעותי בפני עצמו. נרשם פעם אחת בלבד על מופע ה-ffmpeg
// (בדיוק כמו מאזין ה-log למעלה) כדי לא לצבור מאזינים כפולים בין ניסיונות ייצוא חוזרים.
let activeProgressMapper = null

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')

  let lastError = null
  for (const base of CORE_SOURCES) {
    try {
      const ffmpeg = new FFmpeg()
      ffmpeg.on('log', ({ message }) => pushLog(message))
      ffmpeg.on('progress', ({ progress }) => {
        if (activeProgressMapper && typeof progress === 'number' && progress >= 0 && progress <= 1) {
          activeProgressMapper(progress)
        }
      })
      await withTimeout(
        ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        }),
        LOAD_TIMEOUT_MS,
        `טעינת מנוע ההמרה מ-${base} נתקעה (לא הגיבה תוך ${LOAD_TIMEOUT_MS / 1000} שניות).`
      )
      ffmpegInstance = ffmpeg
      return ffmpeg
    } catch (e) {
      lastError = e
      // מקור אחד נכשל (רשת/CORS חד-פעמי) - מנסים את המקור הבא לפני שנכשל סופית
    }
  }
  throw lastError || new Error('לא הצלחנו לטעון את מנוע ההמרה מאף אחד מהמקורות')
}

/** מכריח יצירת מופע ffmpeg טרי לגמרי בקריאה הבאה ל-getFFmpeg() - במקום להמשיך עם מופע שאולי
 *  צבר זיכרון רב לאורך מקטעים קודמים, או קרס פנימית ונשאר במצב לא-שמיש. גם מסיים (terminate)
 *  את ה-Worker של המופע הישן בפועל - אחרת פעולה שנתקעה (וה-withTimeout רק "ויתר" עליה מבחינת
 *  JS) יכולה להישאר תקועה ולתפוס משאבים ברקע בלי סוף, גם אחרי שיצרנו מופע חדש. */
function resetFFmpeg() {
  const old = ffmpegInstance
  ffmpegInstance = null
  if (old) {
    try { old.terminate() } catch (e) { /* לא נתמך בגרסה זו/כבר מסתיים - לא קריטי */ }
  }
}

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('כשל בקידוד פריים כתמונה')); return }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject)
      },
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}

function padNum(n, width) {
  return String(n).padStart(width, '0')
}

// שגיאה מסומנת במיוחד לביטול יזום ע"י המשתמש - מאפשרת ל-App.jsx להבדיל בין "בוטל בכוונה"
// (לחזור למצב idle בשקט) לבין כישלון אמיתי (להראות הודעת שגיאה).
function createCancelledError() {
  const err = new Error('הייצוא בוטל.')
  err.isExportCancelled = true
  return err
}

// "כלב שמירה" - אם פעולה בודדת תקועה יותר מדי זמן (seek/toBlob/exec/load שנתקעים ולא מגיבים),
// עדיף להיכשל עם שגיאה ברורה מאשר להיתקע לנצח בשקט בלי שום משוב (בדיוק מה שקרה כשהמתנו שעות
// ולא קרה כלום - ffmpeg.exec()/ffmpeg.load() לא היו מוגנים בכלל, רק ציור הפריים הבודד).
const FRAME_TIMEOUT_MS = 20000
const EXEC_TIMEOUT_MS = 5 * 60000 // קידוד/מיזוג קבוצת פריימים לא אמור לקחת יותר מ-5 דקות
const LOAD_TIMEOUT_MS = 2 * 60000 // טעינת מנוע ה-ffmpeg (30MB) מ-CDN

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (v) => { clearTimeout(timeoutId); resolve(v) },
      (e) => { clearTimeout(timeoutId); reject(e) }
    )
  })
}

/**
 * לוכד פריים-אחר-פריים טווח זמן נתון (לא בזמן אמת), מקדד בקבוצות ל-mp4 חלקיים (וידאו בלבד,
 * בלי קול), ודוחף את שמות הקבצים (בתוך מערכת הקבצים הוירטואלית של ffmpeg) למערך chunkFiles.
 */
async function captureAndEncodeFrames({ renderFrameAt, getCanvas, startTimeMs, durationMs, ffmpeg, onProgress, isCancelled, chunkFiles }) {
  const frameIntervalMs = 1000 / EXPORT_FPS
  const totalFrames = Math.max(1, Math.ceil(durationMs / frameIntervalMs))
  let chunkIndex = 0

  for (let start = 0; start < totalFrames; start += CHUNK_FRAMES) {
    const end = Math.min(totalFrames, start + CHUNK_FRAMES)

    // מציירים ומקדדים כל פריים ברצף (הכרחי - הציור על אותו קנבס, אי אפשר לצייר את הבא לפני
    // שסיימנו ללכוד את הנוכחי), אבל אוספים את הבייטים בזיכרון בלי לכתוב לffmpeg עדיין.
    const frameBytes = []
    for (let f = start; f < end; f++) {
      if (isCancelled?.()) throw createCancelledError()
      const timeMs = startTimeMs + f * frameIntervalMs
      // seek מדויק בכל פריים (גם בוידאו) - יקר יותר מדילוג על כל פריים שני, אבל וידאו יוצא חלק
      // לגמרי. נוסה בעדיפות על מהירות כרגע.
      await withTimeout(renderFrameAt(timeMs, false), FRAME_TIMEOUT_MS, `פריים ${f}/${totalFrames} נתקע (ציור/seek לא הגיב תוך ${FRAME_TIMEOUT_MS / 1000} שניות) - כנראה קובץ וידאו בעייתי בין הפריטים. נסה שוב, ואם זה נכשל שוב באותו פריים בערך - כנראה יש קובץ ספציפי שגורם לזה.`)
      const canvas = getCanvas()
      if (!canvas) {
        throw new Error(`הקנבס נעלם באמצע הייצוא (פריים ${f}/${totalFrames}) - ייתכן שהעמוד נטען מחדש/רכיב הנגן קרס. נסה שוב בלי לרענן/לשנות הגדרות תוך כדי ייצוא.`)
      }
      frameBytes.push(await withTimeout(canvasToJpeg(canvas), FRAME_TIMEOUT_MS, `פריים ${f}/${totalFrames} נתקע בקידוד לתמונה (toBlob לא הגיב תוך ${FRAME_TIMEOUT_MS / 1000} שניות).`))
      // מדווחים על התקדמות רק כל כמה פריימים (לא על כל פריים בודד) - עדכון state בקצב של מאות
      // פריימים בשנייה גורם לרינדור מחדש של כל עץ הרכיבים בכל פעם (MosaicPlayer לא memoized),
      // מה שהופך את זה בעצמו לצוואר בקבוק אמיתי על סרטונים ארוכים.
      if (onProgress && (f % 5 === 0 || f === totalFrames - 1)) onProgress((f + 1) / totalFrames)
    }

    // כותבים את כל הקבוצה בבת אחת, במקביל - לכל קריאת writeFile יש עלות round-trip קבועה
    // (תקשורת עם ה-worker של ffmpeg) שמצטברת דרמטית אם ממתינים לכל קובץ בנפרד; מקבילית זה
    // הבדל של פי כמה-מאות בזמן הכולל.
    await Promise.all(frameBytes.map((bytes, i) => ffmpeg.writeFile(`f${padNum(i, 5)}.jpg`, bytes)))

    const chunkName = `chunk${padNum(chunkIndex, 4)}.mp4`
    const chunkFrameCount = end - start
    activeProgressMapper = (p) => {
      if (onProgress) onProgress((end - chunkFrameCount + p * chunkFrameCount) / totalFrames)
    }
    try {
      await withTimeout(
        ffmpeg.exec([
          '-framerate', String(EXPORT_FPS),
          '-i', 'f%05d.jpg',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          chunkName,
        ]),
        EXEC_TIMEOUT_MS,
        `קידוד קבוצת פריימים (${chunkName}) נתקע - לא הגיב תוך ${EXEC_TIMEOUT_MS / 60000} דקות.`
      )
    } finally {
      activeProgressMapper = null
      // מנקים את קבצי התמונות של הקבוצה הזו תמיד (גם אם הקידוד נכשל) - אין סיבה להשאיר אותם
      // במערכת הקבצים הוירטואלית של ffmpeg (שנשמרת במטמון בין ניסיונות ייצוא).
      await Promise.all(Array.from({ length: end - start }, (_, i) => ffmpeg.deleteFile(`f${padNum(i, 5)}.jpg`).catch(() => {})))
    }
    if (onProgress) onProgress(end / totalFrames)
    chunkFiles.push(chunkName)
    chunkIndex++
  }
}

// --- עזרי "חיתוך" רצועות שמע לטווח הזמן המקומי של מקטע נתון (segStart..segEnd בציר הגלובלי) ---

function clipMusicTrackToSegment(track, segStart, segEnd) {
  const clipDuration = track.trimEnd - track.trimStart
  const trackEnd = track.timelineStart + clipDuration
  const overlapStart = Math.max(track.timelineStart, segStart)
  const overlapEnd = Math.min(trackEnd, segEnd)
  if (overlapEnd <= overlapStart) return null
  const offsetFromTrackStart = overlapStart - track.timelineStart
  const newTrimStart = track.trimStart + offsetFromTrackStart
  const newTrimEnd = newTrimStart + (overlapEnd - overlapStart)
  return {
    ...track,
    trimStart: newTrimStart,
    trimEnd: newTrimEnd,
    timelineStart: overlapStart - segStart,
    // fade נשמר רק אם קצה החפיפה הוא גם הקצה האמיתי של הרצועה (לא נחתך ע"י גבול המקטע עצמו)
    fadeInMs: overlapStart === track.timelineStart ? (track.fadeInMs || 0) : 0,
    fadeOutMs: overlapEnd === trackEnd ? (track.fadeOutMs || 0) : 0,
  }
}

function clipVideoAudioToSegment(item, segStart, segEnd) {
  const itemEnd = item.startMs + item.durationMs
  const overlapStart = Math.max(item.startMs, segStart)
  const overlapEnd = Math.min(itemEnd, segEnd)
  if (overlapEnd <= overlapStart) return null
  return {
    file: item.file,
    startMs: overlapStart - segStart,
    durationMs: overlapEnd - overlapStart,
    bufferOffsetMs: overlapStart - item.startMs,
  }
}

function clipWindowToSegment(w, segStart, segEnd) {
  const overlapStart = Math.max(w.start, segStart)
  const overlapEnd = Math.min(w.end, segEnd)
  if (overlapEnd <= overlapStart) return null
  return { start: overlapStart - segStart, end: overlapEnd - segStart }
}

/**
 * מייצא מקטע יחיד (טווח זמן [startTimeMs, startTimeMs+durationMs) בציר הגלובלי) לקובץ MP4 עצמאי,
 * עם מופע ffmpeg טרי משלו - כדי שזיכרון לא יצטבר בין מקטעים.
 */
async function exportSegment({ renderFrameAt, getCanvas, startTimeMs, durationMs, musicTracks, videoAudioItems, duckWindows, onProgress, isCancelled }) {
  resetFFmpeg()
  const ffmpeg = await getFFmpeg()
  if (isCancelled?.()) throw createCancelledError()

  const chunkFiles = []
  try {
    await captureAndEncodeFrames({
      renderFrameAt,
      getCanvas,
      startTimeMs,
      durationMs,
      ffmpeg,
      isCancelled,
      chunkFiles,
      onProgress,
    })

    if (isCancelled?.()) throw createCancelledError()
    let hasAudio = true
    try {
      const audioBuffer = await renderAudioOffline({ musicTracks, videoAudioItems, duckWindows, totalDurationMs: durationMs })
      const wavBytes = audioBufferToWav(audioBuffer)
      await ffmpeg.writeFile('audio.wav', wavBytes)
    } catch (e) {
      // רינדור הקול נכשל (למשל אין שום מקור קול במקטע הזה) - ממשיכים בלי קול במקום להפיל הכל
      hasAudio = false
    }

    if (isCancelled?.()) throw createCancelledError()
    const listContent = chunkFiles.map((name) => `file '${name}'`).join('\n')
    await ffmpeg.writeFile('concat_list.txt', new TextEncoder().encode(listContent))
    await withTimeout(
      ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat_list.txt', '-c', 'copy', 'video_only.mp4']),
      EXEC_TIMEOUT_MS,
      `איחוד קבוצות הפריימים של המקטע נתקע - לא הגיב תוך ${EXEC_TIMEOUT_MS / 60000} דקות.`
    )

    const muxArgs = hasAudio
      ? ['-i', 'video_only.mp4', '-i', 'audio.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'segment_output.mp4']
      : ['-i', 'video_only.mp4', '-c:v', 'copy', '-movflags', '+faststart', 'segment_output.mp4']

    try {
      await withTimeout(ffmpeg.exec(muxArgs), EXEC_TIMEOUT_MS, `מיזוג הקול והווידאו של המקטע נתקע - לא הגיב תוך ${EXEC_TIMEOUT_MS / 60000} דקות.`)
    } catch (e) {
      throw new Error(`מיזוג מקטע נכשל (${e?.message || e}). יומן ffmpeg אחרון:\n${recentLogs.slice(-15).join('\n')}`)
    }

    const data = await ffmpeg.readFile('segment_output.mp4')
    if (!data || data.byteLength === 0) {
      throw new Error(`מקטע הופק ריק (0 בייט). יומן ffmpeg אחרון:\n${recentLogs.slice(-15).join('\n')}`)
    }
    return new Blob([data.buffer], { type: 'video/mp4' })
  } catch (err) {
    // כשל אמיתי (לא ביטול) עלול לנבוע מקריסה פנימית של מנוע ה-WASM עצמו (כמו
    // "RuntimeError: memory access out of bounds") - המופע עלול להיות פגום; מאפסים כדי שהמקטע
    // הבא (או ניסיון חוזר) יקבל מופע חדש ונקי במקום לרשת מצב שבור.
    if (!err?.isExportCancelled) resetFFmpeg()
    throw err
  } finally {
    const allCleanupNames = [...chunkFiles, 'concat_list.txt', 'video_only.mp4', 'audio.wav', 'segment_output.mp4']
    await Promise.all(allCleanupNames.map((name) => ffmpeg.deleteFile(name).catch(() => {})))
  }
}

/** ממזג רשימת מקטעי MP4 (Blobs) לקובץ אחד רציף, ללא קידוד מחדש (concat דמוקסר, מהיר ובלי אובדן איכות). */
async function mergeSegments(blobs) {
  resetFFmpeg()
  const ffmpeg = await getFFmpeg()
  const names = []
  try {
    for (let i = 0; i < blobs.length; i++) {
      const name = `seg${padNum(i, 4)}.mp4`
      const bytes = new Uint8Array(await blobs[i].arrayBuffer())
      await ffmpeg.writeFile(name, bytes)
      names.push(name)
    }
    const listContent = names.map((n) => `file '${n}'`).join('\n')
    await ffmpeg.writeFile('merge_list.txt', new TextEncoder().encode(listContent))
    await withTimeout(
      ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'merge_list.txt', '-c', 'copy', 'merged_output.mp4']),
      EXEC_TIMEOUT_MS,
      `המיזוג הסופי של כל המקטעים נתקע - לא הגיב תוך ${EXEC_TIMEOUT_MS / 60000} דקות.`
    )
    const data = await ffmpeg.readFile('merged_output.mp4')
    if (!data || data.byteLength === 0) {
      throw new Error('המיזוג הסופי של המקטעים הפיק קובץ ריק.')
    }
    return new Blob([data.buffer], { type: 'video/mp4' })
  } finally {
    await Promise.all([...names, 'merge_list.txt', 'merged_output.mp4'].map((n) => ffmpeg.deleteFile(n).catch(() => {})))
  }
}

/**
 * מייצא את הסרטון המלא ל-MP4: מפצל את הציר למקטעים עצמאיים (כדי שזיכרון לא יצטבר על סרטונים
 * ארוכים/כבדים), מייצא כל מקטע בנפרד עם מופע ffmpeg טרי, וממזג את כולם בסוף לקובץ אחד רציף.
 * @param {object} params
 * @param {(timeMs:number)=>Promise<void>} params.renderFrameAt
 * @param {()=>HTMLCanvasElement} params.getCanvas
 * @param {number} params.totalDurationMs
 * @param {Array} params.musicTracks
 * @param {Array} params.videoAudioItems
 * @param {Array} params.duckWindows
 * @param {(fraction:number, phase:'frames'|'audio'|'mux')=>void} [params.onProgress]
 * @param {()=>boolean} [params.isCancelled] - נבדק מדי פעם לאורך הייצוא; אם מחזיר true, הייצוא נעצר.
 * @returns {Promise<Blob>} mp4 blob
 */
export async function exportMp4({ renderFrameAt, getCanvas, totalDurationMs, musicTracks, videoAudioItems, duckWindows, onProgress, isCancelled }) {
  if (!renderFrameAt || !getCanvas) {
    throw new Error('נגן הווידאו עדיין לא מוכן לייצוא - נסה שוב בעוד רגע.')
  }
  recentLogs.length = 0

  const numParts = Math.max(1, Math.ceil(totalDurationMs / SEGMENT_DURATION_MS))
  const segmentDurationMs = totalDurationMs / numParts
  const segmentBlobs = []

  for (let i = 0; i < numParts; i++) {
    if (isCancelled?.()) throw createCancelledError()

    const segStart = i * segmentDurationMs
    const segEnd = i === numParts - 1 ? totalDurationMs : (i + 1) * segmentDurationMs
    const segDuration = segEnd - segStart

    const segMusic = musicTracks.map((t) => clipMusicTrackToSegment(t, segStart, segEnd)).filter(Boolean)
    const segVideoAudio = videoAudioItems.map((it) => clipVideoAudioToSegment(it, segStart, segEnd)).filter(Boolean)
    const segDuck = duckWindows.map((w) => clipWindowToSegment(w, segStart, segEnd)).filter(Boolean)

    try {
      const blob = await exportSegment({
        renderFrameAt,
        getCanvas,
        startTimeMs: segStart,
        durationMs: segDuration,
        musicTracks: segMusic,
        videoAudioItems: segVideoAudio,
        duckWindows: segDuck,
        isCancelled,
        onProgress: (frac) => onProgress?.((i + frac) / numParts, 'frames'),
      })
      segmentBlobs.push(blob)
    } catch (err) {
      // ניסיון הצלה: אם לפחות מקטע אחד כבר הצליח לפני הכישלון, נמזג רק אותם למקטע חלקי -
      // עדיף להוריד חלק ראשון של הסרטון מאשר לצאת בלי כלום.
      if (!err?.isExportCancelled && segmentBlobs.length > 0) {
        try {
          err.partialBlob = await mergeSegments(segmentBlobs)
          err.partialChunksCount = segmentBlobs.length
        } catch (mergeErr) {
          // גם ניסיון ההצלה נכשל - לא קריטי, פשוט לא נציע הורדה חלקית הפעם
        }
      }
      throw err
    }

    // הפסקה קצרה בין מקטעים - נותנת לדפדפן הזדמנות אמיתית לשחרר את זיכרון ה-Worker שסיים
    // עכשיו, לפני שהמקטע הבא (עם מופע ffmpeg טרי משלו) מתחיל לצרוך זיכרון נוסף.
    if (i < numParts - 1) {
      await new Promise((resolve) => setTimeout(resolve, BETWEEN_SEGMENTS_PAUSE_MS))
    }
  }

  onProgress?.(0, 'mux')
  const finalBlob = await mergeSegments(segmentBlobs)
  onProgress?.(1, 'mux')
  return finalBlob
}
