// videoExport.js
// אחראי על הפקת קובץ הווידאו הסופי: מקליט את הקנבס + האודיו בזמן אמת (רצף אחד מלא, בדיוק כמו
// שהמשתמש רואה בתצוגה המקדימה), ואז ממיר את התוצאה (webm) ל-MP4 בעזרת ffmpeg.wasm - כדי שהקובץ
// יהיה תואם לכל מכשיר (טלפון/טלוויזיה/מחשב), לא רק דפדפנים.
// קובצי הליבה של ffmpeg (JS+WASM, כ-30MB) נטענים מ-CDN בזמן ריצה - עם כמה מקורות גיבוי,
// כדי שכשל חד-פעמי ברשת/CDN אחד לא ימנע את ההמרה.

const CORE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd',
]

let ffmpegInstance = null

async function getFFmpeg(onLog) {
  if (ffmpegInstance) return ffmpegInstance
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { toBlobURL } = await import('@ffmpeg/util')

  let lastError = null
  for (const base of CORE_SOURCES) {
    try {
      const ffmpeg = new FFmpeg()
      if (onLog) ffmpeg.on('log', ({ message }) => onLog(message))
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      ffmpegInstance = ffmpeg
      return ffmpeg
    } catch (e) {
      lastError = e
      // מקור אחד נכשל (רשת/CORS חד-פעמי) - מנסים את המקור הבא לפני שנכשל סופית
    }
  }
  throw lastError || new Error('לא הצלחנו לטעון את מנוע ההמרה מאף אחד מהמקורות')
}

/**
 * מקליט את הקנבס + זרם אודיו נתון, תוך ניגון מלא של הציר מ-0 ועד הסוף.
 * onProgress(fraction) מדווח על התקדמות ההקלטה (0..1).
 * onSeek(ms) ו-onPlayStateChange(playing) מפעילים בפועל את הניגון בממשק (canvas + audio) בזמן אמת.
 * @returns {Promise<Blob>} webm blob
 */
export function recordTimeline({ canvas, audioStream, totalDurationMs, fps = 30, onProgress, onSeek, onPlayStateChange }) {
  return new Promise((resolve, reject) => {
    try {
      const canvasStream = canvas.captureStream(fps)
      const tracks = [...canvasStream.getVideoTracks()]
      if (audioStream) tracks.push(...audioStream.getAudioTracks())
      const combined = new MediaStream(tracks)

      let mimeType = 'video/webm;codecs=vp9,opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8,opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'

      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 6_000_000 })
      const chunks = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error'))
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: 'video/webm' }))
      }

      // מתחילים מהתחלת הציר, ומפעילים ניגון אמיתי (זו הקלטה בזמן אמת - לא ניתן להאיץ)
      onSeek(0)
      recorder.start(250)
      onPlayStateChange(true)

      const startTime = performance.now()
      function tick() {
        const elapsed = performance.now() - startTime
        onProgress(Math.min(1, elapsed / totalDurationMs))
        if (elapsed >= totalDurationMs + 150) {
          onPlayStateChange(false)
          recorder.stop()
          combined.getTracks().forEach((t) => t.stop())
        } else {
          requestAnimationFrame(tick)
        }
      }
      requestAnimationFrame(tick)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * ממיר webm ל-mp4 (H.264/AAC) באמצעות ffmpeg.wasm - לתאימות מלאה לכל מכשיר.
 * onProgress(fraction) מדווח על התקדמות ההמרה (0..1, מבוסס על אירועי progress של ffmpeg).
 */
export async function convertWebmToMp4(webmBlob, onProgress) {
  const ffmpeg = await getFFmpeg()
  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      if (typeof progress === 'number' && progress >= 0 && progress <= 1) onProgress(progress)
    })
  }
  const { fetchFile } = await import('@ffmpeg/util')
  await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob))
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    'output.mp4',
  ])
  const data = await ffmpeg.readFile('output.mp4')
  await ffmpeg.deleteFile('input.webm')
  await ffmpeg.deleteFile('output.mp4')
  return new Blob([data.buffer], { type: 'video/mp4' })
}
