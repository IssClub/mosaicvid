// audioEngine.js
// מנגן מוזיקת רקע בזמן אמת עם Web Audio API. תומך בכמה רצועות בו-זמנית (כל אחת עם חיתוך/trim,
// מיקום על ציר הזמן, ו-fade-in/fade-out), וב"עמעום" (ducking) אוטומטי של כל ערוצי המוזיקה יחד
// כשמתנגן וידאו עם קול בתוך הפסיפס.

const DUCK_VOLUME = 0.25
const DUCK_TRANSITION_MS = 400

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.masterGain = null
    this.activeSources = []
    this.buffers = new Map()
    this.videoSources = new Map() // videoEl -> { source, gain }
    this.recordingDestination = null
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)()
      this.masterGain = this.ctx.createGain()
      this.masterGain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  /**
   * מחבר אלמנט <video> לגרף האודיו של Web Audio (נדרש כדי שנוכל ללכוד את הקול שלו בהקלטת הייצוא).
   * הקול של הווידאו לא עובר דרך ה-master gain (ולכן לא מושפע מעקומת ה-ducking) - רק המוזיקה מתעמעמת.
   */
  connectVideoElement(videoEl) {
    const ctx = this.ensureContext()
    if (this.videoSources.has(videoEl)) return
    try {
      const source = ctx.createMediaElementSource(videoEl)
      const gain = ctx.createGain()
      gain.gain.value = 1
      source.connect(gain)
      gain.connect(ctx.destination)
      if (this.recordingDestination) gain.connect(this.recordingDestination)
      this.videoSources.set(videoEl, { source, gain })
    } catch (e) {
      // כבר מחובר או שהדפדפן לא תומך - לא קריטי, הווידאו פשוט לא ישתתף בהקלטה
    }
  }

  /** מתחיל ללכוד את כל פלט האודיו (מוזיקה + וידאו) ליעד הקלטה נפרד. מחזיר MediaStream. */
  startExportCapture() {
    const ctx = this.ensureContext()
    if (!this.recordingDestination) {
      this.recordingDestination = ctx.createMediaStreamDestination()
    }
    this.masterGain.connect(this.recordingDestination)
    this.videoSources.forEach(({ gain }) => gain.connect(this.recordingDestination))
    return this.recordingDestination.stream
  }

  stopExportCapture() {
    if (!this.recordingDestination) return
    try { this.masterGain.disconnect(this.recordingDestination) } catch (e) {}
    this.videoSources.forEach(({ gain }) => {
      try { gain.disconnect(this.recordingDestination) } catch (e) {}
    })
  }

  /** טוען קובץ שמע לרצועה נתונה, ומחזיר את משכו המקורי (מ"ש). */
  async loadTrack(trackId, file) {
    const ctx = this.ensureContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    this.buffers.set(trackId, audioBuffer)
    return audioBuffer.duration * 1000
  }

  removeTrack(trackId) {
    this.buffers.delete(trackId)
  }

  stopAll() {
    this.activeSources.forEach(({ source }) => {
      try { source.stop() } catch (e) { /* כבר הופסק */ }
    })
    this.activeSources = []
  }

  /**
   * מתחיל ניגון מכל הרצועות הרלוונטיות, החל ממיקום נתון בציר הזמן הכללי (ms).
   * tracks: [{id, trimStart, trimEnd, timelineStart, fadeInMs, fadeOutMs, volume}] (זמנים ב-ms)
   * duckWindows: [{start, end}] בציר הזמן הכללי (ms)
   */
  play(fromMs, tracks, duckWindows) {
    this.stopAll()
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime

    tracks.forEach((track) => {
      const buffer = this.buffers.get(track.id)
      if (!buffer) return
      const clipDuration = track.trimEnd - track.trimStart
      const clipEnd = track.timelineStart + clipDuration
      if (fromMs >= clipEnd) return

      const gainNode = ctx.createGain()
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gainNode)
      gainNode.connect(this.masterGain)

      let offsetIntoClip, when
      if (fromMs >= track.timelineStart) {
        offsetIntoClip = (fromMs - track.timelineStart) / 1000
        when = now
      } else {
        offsetIntoClip = 0
        when = now + (track.timelineStart - fromMs) / 1000
      }
      const bufferOffset = track.trimStart / 1000 + offsetIntoClip
      const remaining = (clipEnd - Math.max(fromMs, track.timelineStart)) / 1000

      const vol = track.volume ?? 1
      const fadeInSec = (track.fadeInMs || 0) / 1000
      const fadeOutSec = (track.fadeOutMs || 0) / 1000
      const clipStartCtx = when - offsetIntoClip
      const clipEndCtx = clipStartCtx + clipDuration / 1000

      if (fadeInSec > 0 && when < clipStartCtx + fadeInSec) {
        gainNode.gain.setValueAtTime(0, Math.max(when, clipStartCtx))
        gainNode.gain.linearRampToValueAtTime(vol, clipStartCtx + fadeInSec)
      } else {
        gainNode.gain.setValueAtTime(vol, when)
      }
      if (fadeOutSec > 0) {
        const foStart = Math.max(when, clipEndCtx - fadeOutSec)
        gainNode.gain.setValueAtTime(vol, foStart)
        gainNode.gain.linearRampToValueAtTime(0, clipEndCtx)
      }

      try {
        source.start(when, Math.max(0, bufferOffset), Math.max(0, remaining))
        this.activeSources.push({ trackId: track.id, source, gainNode })
      } catch (e) { /* התזמון לא תקין - מדלגים על הרצועה הזו */ }
    })

    // עקומת ה-ducking על ה-master gain (משותפת לכל הרצועות יחד)
    this.masterGain.gain.cancelScheduledValues(now)
    this.masterGain.gain.setValueAtTime(1, now)
    duckWindows.forEach((w) => {
      if (w.end <= fromMs) return
      const duckStart = Math.max(w.start, fromMs)
      const startCtx = now + (duckStart - fromMs) / 1000
      const downEndCtx = now + (Math.min(w.start + DUCK_TRANSITION_MS, w.end) - fromMs) / 1000
      const upStartCtx = now + (Math.max(w.end - DUCK_TRANSITION_MS, w.start) - fromMs) / 1000
      const upEndCtx = now + (w.end - fromMs) / 1000
      this.masterGain.gain.setValueAtTime(1, startCtx)
      this.masterGain.gain.linearRampToValueAtTime(DUCK_VOLUME, downEndCtx)
      this.masterGain.gain.setValueAtTime(DUCK_VOLUME, upStartCtx)
      this.masterGain.gain.linearRampToValueAtTime(1, upEndCtx)
    })
  }

  pause() {
    this.stopAll()
  }
}
