// audioRender.js
// מרנדר את פס הקול המלא של הסרטון (מוזיקה + קול וידאו + עמעום) לא בזמן אמת אלא באמצעות
// OfflineAudioContext - מחושב מתמטית מהיר ככל שהמעבד מאפשר, ולכן תמיד מדויק ותמיד מסתיים
// בזמן סביר, בלי תלות בניגון בזמן אמת (ולכן גם בלי הסחיפה/חוסר הסנכרון שיכולים לקרות בהקלטה חיה).

const DUCK_VOLUME = 0.08
const DUCK_TRANSITION_MS = 400
const SAMPLE_RATE = 44100

/**
 * מרנדר פס קול שלם לפי אותה לוגיקת תזמון בדיוק כמו audioEngine.play() (מוזיקה עם fade/ducking,
 * וקול של פריטי וידאו בחלון ה"הצגה" שלהם), אבל באופן דטרמיניסטי לא בזמן אמת.
 * @param {object} params
 * @param {Array} params.musicTracks - [{id, audioBuffer, trimStart, trimEnd, timelineStart, fadeInMs, fadeOutMs, volume}]
 * @param {Array} params.videoAudioItems - [{file, startMs, durationMs}] - חלון ה"הצגה" בציר הזמן הכללי
 * @param {Array} params.duckWindows - [{start, end}] בציר הזמן הכללי (ms)
 * @param {number} params.totalDurationMs
 * @returns {Promise<AudioBuffer>}
 */
export async function renderAudioOffline({ musicTracks = [], videoAudioItems = [], duckWindows = [], totalDurationMs }) {
  const totalSec = Math.max(0.1, totalDurationMs / 1000)
  const ctx = new OfflineAudioContext(2, Math.ceil(totalSec * SAMPLE_RATE), SAMPLE_RATE)
  const masterGain = ctx.createGain()
  masterGain.connect(ctx.destination)

  const decodeCache = new Map()
  async function decodeFile(file) {
    const key = file
    if (decodeCache.has(key)) return decodeCache.get(key)
    const promise = file.arrayBuffer().then((buf) => ctx.decodeAudioData(buf))
    decodeCache.set(key, promise)
    return promise
  }

  // רצועות מוזיקה - עוברות דרך masterGain (מושפעות מעקומת העמעום), עם fade-in/out לפי חפיפה.
  // AudioBuffer הוא לא ספציפי ל-context מסוים (בניגוד ל-AudioNode) - אפשר להשתמש בבאפר שכבר
  // פוענח פעם אחת ע"י audioEngine.js הרגיל, בלי לפענח מחדש את הקובץ כאן.
  for (const track of musicTracks) {
    try {
      const audioBuffer = track.audioBuffer
      if (!audioBuffer) continue
      const clipDuration = track.trimEnd - track.trimStart
      if (clipDuration <= 0) continue
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      const gainNode = ctx.createGain()
      source.connect(gainNode)
      gainNode.connect(masterGain)

      const startSec = track.timelineStart / 1000
      const clipEndSec = startSec + clipDuration / 1000
      const vol = track.volume ?? 1
      const fadeInSec = (track.fadeInMs || 0) / 1000
      const fadeOutSec = (track.fadeOutMs || 0) / 1000

      if (fadeInSec > 0) {
        gainNode.gain.setValueAtTime(0, startSec)
        gainNode.gain.linearRampToValueAtTime(vol, startSec + fadeInSec)
      } else {
        gainNode.gain.setValueAtTime(vol, startSec)
      }
      if (fadeOutSec > 0) {
        gainNode.gain.setValueAtTime(vol, Math.max(startSec, clipEndSec - fadeOutSec))
        gainNode.gain.linearRampToValueAtTime(0, clipEndSec)
      }

      source.start(Math.max(0, startSec), track.trimStart / 1000, clipDuration / 1000)
    } catch (e) {
      // קובץ שמע לא תקין/נכשל בפענוח - מדלגים על הרצועה הזו בלי להפיל את כל הרינדור
    }
  }

  // קול של פריטי וידאו - לא עובר דרך masterGain (לא מושפע מעקומת העמעום), בדיוק כמו audioEngine.js.
  // bufferOffsetMs (אופציונלי) - מאיזו נקודה בתוך קובץ הקול המקורי להתחיל; משמש כשהייצוא מפוצל
  // לכמה מקטעים ווידאו מסוים "נחתך" באמצע ע"י גבול מקטע - הקול צריך להמשיך מהנקודה הנכונה.
  for (const item of videoAudioItems) {
    try {
      const audioBuffer = await decodeFile(item.file)
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      const startSec = item.startMs / 1000
      const bufferOffsetSec = (item.bufferOffsetMs || 0) / 1000
      const durationSec = Math.min(audioBuffer.duration - bufferOffsetSec, item.durationMs / 1000)
      if (durationSec <= 0) continue
      source.start(Math.max(0, startSec), bufferOffsetSec, durationSec)
    } catch (e) {
      // לווידאו הזה אין קול תקין/נכשל בפענוח - מדלגים, הווידאו עצמו עדיין יופיע ויזואלית
    }
  }

  // עקומת ה-ducking - זהה ללוגיקה ב-audioEngine.play()
  masterGain.gain.setValueAtTime(1, 0)
  duckWindows.forEach((w) => {
    const downEndSec = Math.min(w.start + DUCK_TRANSITION_MS, w.end) / 1000
    const upStartSec = Math.max(w.end - DUCK_TRANSITION_MS, w.start) / 1000
    masterGain.gain.setValueAtTime(1, w.start / 1000)
    masterGain.gain.linearRampToValueAtTime(DUCK_VOLUME, downEndSec)
    masterGain.gain.setValueAtTime(DUCK_VOLUME, upStartSec)
    masterGain.gain.linearRampToValueAtTime(1, w.end / 1000)
  })

  return ctx.startRendering()
}

/** ממיר AudioBuffer ל-bytes של קובץ WAV (PCM 16-bit) - פורמט שffmpeg קורא בלי שום תלות חיצונית. */
export function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const numFrames = audioBuffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData = []
  for (let ch = 0; ch < numChannels; ch++) channelData.push(audioBuffer.getChannelData(ch))

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Uint8Array(buffer)
}
