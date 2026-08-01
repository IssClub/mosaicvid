import { memo, useRef, useState } from 'react'

const MIN_CLIP_MS = 500
const TRACK_COLORS = ['#e8a33d', '#c4483a', '#8fae7d', '#7d9dae', '#ae7da3']

function fmt(ms) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default memo(function AudioTimeline({ tracks, totalDuration, onAddTracks, onUpdateTrack, onRemoveTrack }) {
  const inputRef = useRef(null)
  const barRef = useRef(null)
  const dragRef = useRef(null)
  const [, forceRender] = useState(0)

  function msPerPx() {
    const bar = barRef.current
    if (!bar) return 1
    return totalDuration / bar.clientWidth
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('audio/'))
    if (files.length) onAddTracks(files)
  }

  function startDrag(e, track, mode) {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = {
      mode, // 'move' | 'trimLeft' | 'trimRight'
      trackId: track.id,
      startX: e.clientX,
      initial: { ...track },
    }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }

  function onDragMove(e) {
    const d = dragRef.current
    if (!d) return
    const deltaMs = (e.clientX - d.startX) * msPerPx()
    const clipDuration = d.initial.trimEnd - d.initial.trimStart

    if (d.mode === 'move') {
      const newStart = Math.max(0, Math.min(totalDuration - clipDuration, d.initial.timelineStart + deltaMs))
      onUpdateTrack(d.trackId, { timelineStart: newStart })
    } else if (d.mode === 'trimLeft') {
      const maxTrimStart = d.initial.trimEnd - MIN_CLIP_MS
      const newTrimStart = Math.max(0, Math.min(maxTrimStart, d.initial.trimStart + deltaMs))
      const newTimelineStart = Math.max(0, d.initial.timelineStart + (newTrimStart - d.initial.trimStart))
      onUpdateTrack(d.trackId, { trimStart: newTrimStart, timelineStart: newTimelineStart })
    } else if (d.mode === 'trimRight') {
      const minTrimEnd = d.initial.trimStart + MIN_CLIP_MS
      const newTrimEnd = Math.max(minTrimEnd, Math.min(d.initial.durationMs, d.initial.trimEnd + deltaMs))
      onUpdateTrack(d.trackId, { trimEnd: newTrimEnd })
    }
  }

  function onDragEnd() {
    dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-[var(--text)]">מוזיקת רקע</h2>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent-amber)] text-[#1c1815] font-medium"
        >
          + הוסף שיר
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {tracks.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">אין עדיין מוזיקה. אפשר להוסיף כמה שירים ולגרור אותם על הציר.</p>
      ) : (
        <div className="space-y-2">
          <div ref={barRef} className="relative bg-[var(--surface)] rounded-lg h-14 overflow-hidden">
            {tracks.map((track, i) => {
              const clipDuration = track.trimEnd - track.trimStart
              const leftPct = (track.timelineStart / totalDuration) * 100
              const widthPct = (clipDuration / totalDuration) * 100
              const color = TRACK_COLORS[i % TRACK_COLORS.length]
              return (
                <div
                  key={track.id}
                  onPointerDown={(e) => startDrag(e, track, 'move')}
                  className="absolute top-1 h-12 rounded-md cursor-grab active:cursor-grabbing flex items-center px-2 text-[10px] text-white font-medium overflow-hidden select-none"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%`, background: color }}
                  title={`${track.name} — ${fmt(clipDuration)}`}
                >
                  <div
                    onPointerDown={(e) => startDrag(e, track, 'trimLeft')}
                    className="absolute right-0 top-0 bottom-0 w-2 bg-black/25 cursor-ew-resize"
                  />
                  <span className="truncate pointer-events-none">{track.name}</span>
                  <div
                    onPointerDown={(e) => startDrag(e, track, 'trimRight')}
                    className="absolute left-0 top-0 bottom-0 w-2 bg-black/25 cursor-ew-resize"
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[var(--muted)]">
            <span>0:00</span>
            <span>{fmt(totalDuration)}</span>
          </div>

          <div className="space-y-1.5">
            {tracks.map((track, i) => (
              <div key={track.id} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: TRACK_COLORS[i % TRACK_COLORS.length] }} />
                <span className="flex-1 truncate text-[var(--text)]">{track.name}</span>
                <span className="text-[var(--muted)] shrink-0">{fmt(track.trimEnd - track.trimStart)}</span>
                <button
                  onClick={() => onRemoveTrack(track.id)}
                  className="shrink-0 text-[var(--accent-coral)] hover:opacity-80 px-1"
                  aria-label="הסר שיר"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            גרור שיר כדי להזיז אותו על הציר. גרור את הקצוות כדי לחתוך התחלה/סוף. כשמתנגן וידאו עם קול, המוזיקה תתעמעם אוטומטית.
          </p>
        </div>
      )}
    </div>
  )
})
