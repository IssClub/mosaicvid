import { memo } from 'react'
import { ENTRY_STYLES, ENTRY_STYLE_LABELS } from '../lib/entryAnimations'

export default memo(function AnimationSettings({
  entryStyle,
  onEntryStyleChange,
  stayDuration,
  onStayDurationChange,
  settleDuration,
  onSettleDurationChange,
  staggerGap,
  onStaggerGapChange,
}) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-lg text-[var(--text)]">אנימציית כניסה (הגדרה גלובלית)</h2>

      <div>
        <label className="text-sm text-[var(--muted)] block mb-2">סגנון כניסה</label>
        <select
          value={entryStyle}
          onChange={(e) => onEntryStyleChange(e.target.value)}
          className="w-full bg-[var(--surface)] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent-amber)]"
        >
          <option value="random">אקראי לכל תמונה</option>
          {ENTRY_STYLES.map((s) => (
            <option key={s} value={s}>{ENTRY_STYLE_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-[var(--muted)]">משך הצגה בגודל מלא</label>
          <span className="text-[var(--accent-amber)] text-sm">{(stayDuration / 1000).toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={100}
          max={2000}
          step={50}
          value={stayDuration}
          onChange={(e) => onStayDurationChange(Number(e.target.value))}
          className="w-full accent-[var(--accent-amber)]"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-[var(--muted)]">משך הנפילה לפסיפס</label>
          <span className="text-[var(--accent-amber)] text-sm">{(settleDuration / 1000).toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={200}
          max={1500}
          step={50}
          value={settleDuration}
          onChange={(e) => onSettleDurationChange(Number(e.target.value))}
          className="w-full accent-[var(--accent-amber)]"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-[var(--muted)]">קצב חפיפה (בין פריטי "חפיפה")</label>
          <span className="text-[var(--accent-amber)] text-sm">{staggerGap}ms</span>
        </div>
        <input
          type="range"
          min={0}
          max={500}
          step={10}
          value={staggerGap}
          onChange={(e) => onStaggerGapChange(Number(e.target.value))}
          className="w-full accent-[var(--accent-amber)]"
        />
        <p className="text-xs text-[var(--muted)] mt-1">
          התמונה הבאה (אם מסומנת "חפיפה") נכנסת ברגע שהנוכחית מתחילה ליפול לפסיפס. ערך נמוך = הכניסה הבאה קרובה יותר לרגע הנפילה.
        </p>
      </div>
    </div>
  )
})
