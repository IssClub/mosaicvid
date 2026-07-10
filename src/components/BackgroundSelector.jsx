import { memo } from 'react'
import { PRESET_BACKGROUNDS } from '../lib/backgrounds'

export default memo(function BackgroundSelector({ background, onChange }) {
  function setType(type) {
    onChange({ ...background, type })
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-[var(--text)]">רקע הסרטון</h2>
      <div className="flex gap-2 bg-[var(--surface)] p-1 rounded-xl">
        {[
          { key: 'color', label: 'צבע אחיד' },
          { key: 'preset', label: 'עיצוב מוכן' },
          { key: 'image', label: 'תמונה משלי' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setType(tab.key)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              background.type === tab.key
                ? 'bg-[var(--accent-amber)] text-[#1c1815]'
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {background.type === 'color' && (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={background.color || '#ffffff'}
            onChange={(e) => onChange({ ...background, color: e.target.value })}
            className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border border-white/10"
          />
          <button
            onClick={() => onChange({ ...background, color: '#ffffff' })}
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] underline"
          >
            אפס ללבן
          </button>
        </div>
      )}

      {background.type === 'preset' && (
        <div className="grid grid-cols-3 gap-2">
          {PRESET_BACKGROUNDS.map((p) => (
            <button
              key={p.key}
              onClick={() => onChange({ ...background, presetKey: p.key })}
              className={`h-14 rounded-lg border-2 text-[10px] text-white/90 flex items-end p-1 ${
                background.presetKey === p.key ? 'border-[var(--accent-amber)]' : 'border-transparent'
              }`}
              style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {background.type === 'image' && (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/15 rounded-xl py-6 cursor-pointer hover:border-[var(--accent-amber)] transition-colors">
          <span className="text-sm text-[var(--muted)]">
            {background.imageName || 'העלה תמונת רקע'}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onChange({ ...background, imageFile: file, imageName: file.name })
            }}
          />
        </label>
      )}
    </div>
  )
})
