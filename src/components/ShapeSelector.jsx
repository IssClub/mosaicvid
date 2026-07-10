import { memo } from 'react'
import { PRESET_SHAPES } from '../lib/shapeMask'

const ASPECT_OPTIONS = [
  { key: 'square', label: '1:1', value: 1 },
  { key: 'vertical', label: '9:16', value: 9 / 16 },
  { key: 'horizontal', label: '16:9', value: 16 / 9 },
]

export default memo(function ShapeSelector({
  shapeMode,
  onShapeModeChange,
  presetKey,
  onPresetChange,
  numberText,
  onNumberTextChange,
  onCustomImageChange,
  customFileName,
  count,
  onCountChange,
  aspectKey,
  onAspectChange,
  countLocked = false,
}) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-display text-lg text-[var(--text)] mb-3">צורת היעד</h2>
        <div className="flex gap-2 bg-[var(--surface)] p-1 rounded-xl">
          {[
            { key: 'preset', label: 'צורה קבועה' },
            { key: 'number', label: 'מספר' },
            { key: 'custom', label: 'תמונה משלי' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => onShapeModeChange(tab.key)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                shapeMode === tab.key
                  ? 'bg-[var(--accent-amber)] text-[#1c1815]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {shapeMode === 'preset' && (
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(PRESET_SHAPES).map(([key, shape]) => (
            <button
              key={key}
              onClick={() => onPresetChange(key)}
              className={`py-4 rounded-xl border transition-colors font-display text-base ${
                presetKey === key
                  ? 'border-[var(--accent-amber)] bg-[var(--surface-2)] text-[var(--accent-amber)]'
                  : 'border-white/10 text-[var(--muted)] hover:border-white/25'
              }`}
            >
              {shape.label}
            </button>
          ))}
        </div>
      )}

      {shapeMode === 'number' && (
        <div>
          <input
            type="text"
            value={numberText}
            onChange={(e) => onNumberTextChange(e.target.value)}
            placeholder="לדוגמה: 40 או 2026"
            className="w-full bg-[var(--surface)] border border-white/10 rounded-xl px-4 py-3 text-lg text-center font-display focus:outline-none focus:border-[var(--accent-amber)]"
          />
        </div>
      )}

      {shapeMode === 'custom' && (
        <div>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/15 rounded-xl py-8 cursor-pointer hover:border-[var(--accent-amber)] transition-colors">
            <span className="text-sm text-[var(--muted)]">
              {customFileName || 'העלה תמונת מסכה/סילואט'}
            </span>
            <span className="text-xs text-[var(--muted)]">PNG/JPG — רקע שקוף או פשוט עדיף</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onCustomImageChange(e.target.files[0])}
            />
          </label>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg text-[var(--text)]">כמות פריטים</h2>
          <span className="text-[var(--accent-amber)] font-medium">{count}</span>
        </div>
        {countLocked ? (
          <p className="text-xs text-[var(--muted)]">
            נקבע אוטומטית לפי כמות המדיה שהעלית. הסר קבצים כדי לשנות.
          </p>
        ) : (
          <>
            <input
              type="range"
              min={20}
              max={200}
              value={count}
              onChange={(e) => onCountChange(Number(e.target.value))}
              className="w-full accent-[var(--accent-amber)]"
            />
            <p className="text-xs text-[var(--muted)] mt-1">
              תצוגה מקדימה בלבד — לאחר העלאת מדיה הכמות תתעדכן אוטומטית.
            </p>
          </>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg text-[var(--text)] mb-3">יחס מסך לפלט</h2>
        <div className="flex gap-2">
          {ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onAspectChange(opt.key)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                aspectKey === opt.key
                  ? 'border-[var(--accent-amber)] text-[var(--accent-amber)] bg-[var(--surface-2)]'
                  : 'border-white/10 text-[var(--muted)] hover:border-white/25'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
})
