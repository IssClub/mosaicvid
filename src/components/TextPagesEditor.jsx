import { memo } from 'react'
import { PRESET_BACKGROUNDS } from '../lib/backgrounds'
import { ENTRY_STYLES, ENTRY_STYLE_LABELS } from '../lib/entryAnimations'

export default memo(function TextPagesEditor({ pages, onAddPage, onUpdatePage, onRemovePage, onReorderPage }) {
  const introPages = pages.filter((p) => p.position === 'intro')
  const outroPages = pages.filter((p) => p.position === 'outro')

  function renderPageCard(page, index, list) {
    return (
      <div key={page.id} className="bg-[var(--surface)] rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">דף {index + 1}</span>
          <div className="flex items-center gap-1">
            <button
              disabled={index === 0}
              onClick={() => onReorderPage(page.id, -1)}
              className="w-6 h-6 flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text)] disabled:opacity-30"
            >
              ↑
            </button>
            <button
              disabled={index === list.length - 1}
              onClick={() => onReorderPage(page.id, 1)}
              className="w-6 h-6 flex items-center justify-center rounded bg-[var(--surface-2)] text-[var(--text)] disabled:opacity-30"
            >
              ↓
            </button>
            <button
              onClick={() => onRemovePage(page.id)}
              className="w-6 h-6 flex items-center justify-center rounded bg-[var(--accent-coral)]/20 text-[var(--accent-coral)]"
            >
              ×
            </button>
          </div>
        </div>

        <textarea
          value={page.text}
          onChange={(e) => onUpdatePage(page.id, { text: e.target.value })}
          placeholder="הטקסט שיוצג (אפשר כמה שורות)"
          rows={2}
          className="w-full bg-[var(--surface-2)] border border-white/10 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-[var(--accent-amber)]"
        />

        <div className="flex items-center gap-2">
          <input
            type="color"
            value={page.textColor}
            onChange={(e) => onUpdatePage(page.id, { textColor: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
            title="צבע הטקסט"
          />
          <div className="flex-1 grid grid-cols-3 gap-1">
            <button
              onClick={() => onUpdatePage(page.id, { bgType: 'color' })}
              className={`text-[10px] py-1 rounded ${page.bgType === 'color' ? 'bg-[var(--accent-amber)] text-[#1c1815]' : 'bg-[var(--surface-2)] text-[var(--muted)]'}`}
            >
              צבע
            </button>
            <button
              onClick={() => onUpdatePage(page.id, { bgType: 'preset' })}
              className={`text-[10px] py-1 rounded ${page.bgType === 'preset' ? 'bg-[var(--accent-amber)] text-[#1c1815]' : 'bg-[var(--surface-2)] text-[var(--muted)]'}`}
            >
              עיצוב
            </button>
            <select
              value={page.entryStyle}
              onChange={(e) => onUpdatePage(page.id, { entryStyle: e.target.value })}
              className="text-[10px] bg-[var(--surface-2)] text-[var(--muted)] rounded px-1 focus:outline-none"
            >
              <option value="random">כניסה אקראית</option>
              {ENTRY_STYLES.map((s) => (
                <option key={s} value={s}>{ENTRY_STYLE_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {page.bgType === 'color' && (
          <input
            type="color"
            value={page.bgColor}
            onChange={(e) => onUpdatePage(page.id, { bgColor: e.target.value })}
            className="w-full h-8 rounded cursor-pointer bg-transparent border border-white/10"
            title="צבע רקע"
          />
        )}
        {page.bgType === 'preset' && (
          <div className="grid grid-cols-5 gap-1">
            {PRESET_BACKGROUNDS.map((p) => (
              <button
                key={p.key}
                onClick={() => onUpdatePage(page.id, { bgPresetKey: p.key })}
                className={`h-8 rounded border-2 ${page.bgPresetKey === p.key ? 'border-[var(--accent-amber)]' : 'border-transparent'}`}
                style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
                title={p.label}
              />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--muted)]">משך הצגה</label>
          <span className="text-xs text-[var(--accent-amber)]">{(page.durationMs / 1000).toFixed(1)}s</span>
        </div>
        <input
          type="range"
          min={1000}
          max={6000}
          step={100}
          value={page.durationMs}
          onChange={(e) => onUpdatePage(page.id, { durationMs: Number(e.target.value) })}
          className="w-full accent-[var(--accent-amber)]"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg text-[var(--text)]">דפי טקסט (פתיחה/סיום)</h2>
      <p className="text-xs text-[var(--muted)]">
        דפי פתיחה מוצגים לפני הפסיפס, ודפי סיום אחריו. אפשר להוסיף כמה שרוצים ולסדר אותם.
      </p>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-[var(--text)]">דפי פתיחה</h3>
          <button
            onClick={() => onAddPage('intro')}
            className="text-xs px-2.5 py-1 rounded-lg bg-[var(--accent-amber)] text-[#1c1815] font-medium"
          >
            + הוסף
          </button>
        </div>
        <div className="space-y-2">
          {introPages.map((p, i) => renderPageCard(p, i, introPages))}
          {introPages.length === 0 && <p className="text-xs text-[var(--muted)]">אין דפי פתיחה</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-[var(--text)]">דפי סיום</h3>
          <button
            onClick={() => onAddPage('outro')}
            className="text-xs px-2.5 py-1 rounded-lg bg-[var(--accent-amber)] text-[#1c1815] font-medium"
          >
            + הוסף
          </button>
        </div>
        <div className="space-y-2">
          {outroPages.map((p, i) => renderPageCard(p, i, outroPages))}
          {outroPages.length === 0 && <p className="text-xs text-[var(--muted)]">אין דפי סיום</p>}
        </div>
      </div>
    </div>
  )
})
