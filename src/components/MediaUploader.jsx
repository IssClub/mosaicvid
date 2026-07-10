import { memo, useRef, useState } from 'react'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'tif', 'tiff', 'avif']
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv', '3gp', 'ogv']

function extOf(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

function classifyFile(f) {
  if (f.type.startsWith('image/')) return 'image'
  if (f.type.startsWith('video/')) return 'video'
  // חלק מהדפדפנים/מערכות ההפעלה לא מזהים MIME type לקבצים מסוימים (למשל HEIC מאייפון) -
  // במקרה כזה בודקים לפי סיומת הקובץ במקום לזרוק אותו בשקט.
  const ext = extOf(f.name)
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image'
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video'
  return null
}

export default memo(function MediaUploader({ items, onAddFiles, onRemove, onRemoveErrors, onToggleEntryMode, orderMode, onOrderModeChange, onSetItemsDuration, onClearItemsDuration, defaultStayDuration }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [durationDraft, setDurationDraft] = useState(1000)

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function clearSelection() {
    setSelectedIds([])
  }
  const inputRef = useRef(null)
  const [skipped, setSkipped] = useState([])
  const errorCount = items.filter((it) => it.error).length

  function handleFiles(fileList) {
    const all = Array.from(fileList || [])
    const accepted = []
    const rejected = []
    for (const f of all) {
      if (classifyFile(f)) accepted.push(f)
      else rejected.push(f.name)
    }
    setSkipped(rejected)
    if (accepted.length) onAddFiles(accepted)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-[var(--text)]">מדיה שהועלתה</h2>
        <span className="text-[var(--accent-amber)] font-medium text-sm">
          {items.length} פריטים
          {items.some((it) => it.error) && (
            <span className="text-[var(--accent-coral)] mr-1">
              ({items.filter((it) => it.error).length} לא נתמכים)
            </span>
          )}
        </span>
      </div>

      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/15 rounded-xl py-8 cursor-pointer hover:border-[var(--accent-amber)] transition-colors">
        <span className="text-sm text-[var(--muted)]">גרור לכאן תמונות/וידאו, או לחץ לבחירה</span>
        <span className="text-xs text-[var(--muted)]">אפשר לבחור כמה קבצים בבת אחת</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {errorCount > 0 && (
        <div className="bg-[var(--accent-coral)]/10 border border-[var(--accent-coral)]/30 rounded-lg p-3 text-xs text-[var(--text)] flex items-center justify-between gap-3">
          <div>
            <p className="font-medium mb-1">{errorCount} פריטים מסומנים "לא נתמך" ולא ייכנסו לפסיפס.</p>
            <p className="text-[var(--muted)]">
              פורמטים: {Object.entries(
                items.filter((it) => it.error).reduce((acc, it) => {
                  const key = (it.format || '?').toUpperCase()
                  acc[key] = (acc[key] || 0) + 1
                  return acc
                }, {})
              ).map(([fmt, n]) => `${fmt} (${n})`).join(', ')}
            </p>
            <p className="text-[var(--muted)] mt-1">
              עבור על תמונה עם העכבר כדי לראות את שם הקובץ. אפשר להוריד אותן, או להמיר ל-JPG במחשב ולהעלות מחדש.
            </p>
          </div>
          <button
            onClick={onRemoveErrors}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-[var(--accent-coral)] text-white font-medium hover:opacity-90"
          >
            הסר את כולם
          </button>
        </div>
      )}

      {skipped.length > 0 && (
        <div className="bg-[var(--accent-coral)]/10 border border-[var(--accent-coral)]/30 rounded-lg p-3 text-xs text-[var(--text)]">
          <p className="font-medium mb-1">{skipped.length} קבצים לא הועלו כי הפורמט שלהם לא זוהה:</p>
          <p className="text-[var(--muted)] break-words">{skipped.slice(0, 12).join(', ')}{skipped.length > 12 ? ` ועוד ${skipped.length - 12}...` : ''}</p>
          <p className="text-[var(--muted)] mt-1">
            לרוב זה קורה עם תמונות HEIC מאייפון בדפדפנים שאינם Safari. נסה לייצא אותן כ-JPG, או פתח בספארי.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-[var(--muted)]">סדר שיוך התמונות לצורה</label>
        <div className="flex gap-2 bg-[var(--surface)] p-1 rounded-xl">
          {[
            { key: 'random', label: 'אקראי' },
            { key: 'upload', label: 'לפי סדר העלאה' },
            { key: 'filename', label: 'לפי שם קובץ' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => onOrderModeChange(opt.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                orderMode === opt.key
                  ? 'bg-[var(--accent-amber)] text-[#1c1815]'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {orderMode === 'filename' && (
          <p className="text-[10px] text-[var(--muted)]">
            כדי לשלוט בסדר המדויק, מספר את שמות הקבצים לפני ההעלאה (למשל 01.jpg, 02.jpg...).
          </p>
        )}
      </div>

      {items.length > 0 && (
        <>
          <p className="text-xs text-[var(--muted)]">
            לחץ על התג בפינת כל תמונה כדי לקבוע אם היא תיכנס <b>לבד</b> (מוקד תשומת לב) או <b>בחפיפה</b> (יחד עם שכנותיה, לסרטון קצר יותר).
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id)
              return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={`relative aspect-square rounded-lg overflow-hidden bg-[var(--surface-2)] group cursor-pointer ${
                  isSelected ? 'ring-2 ring-[var(--accent-amber)]' : ''
                }`}
              >
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                ) : item.error ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center px-1 bg-[var(--accent-coral)]/15" title={item.name}>
                    <span className="text-[9px] text-[var(--accent-coral)] leading-tight">לא נתמך</span>
                    {item.format && <span className="text-[8px] text-[var(--accent-coral)]/70">{item.format.toUpperCase()}</span>}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">טוען...</div>
                )}
                {item.type === 'video' && (
                  <span className="absolute bottom-1 left-1 bg-black/60 text-[10px] text-white px-1 rounded">וידאו</span>
                )}
                {item.type === 'image' && typeof item.stayDuration === 'number' && (
                  <span className="absolute top-1 left-1 bg-black/60 text-[9px] text-[var(--accent-amber)] px-1 rounded">
                    {(item.stayDuration / 1000).toFixed(1)}s
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleEntryMode(item.id) }}
                  className={`absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                    item.entryMode === 'solo'
                      ? 'bg-[var(--accent-coral)] text-white'
                      : 'bg-[var(--accent-amber)] text-[#1c1815]'
                  }`}
                  title="החלף מצב כניסה"
                >
                  {item.entryMode === 'solo' ? 'לבד' : 'חפיפה'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
                  className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="הסר"
                >
                  ×
                </button>
              </div>
              )
            })}
          </div>

          {selectedIds.length > 0 && (
            <div className="bg-[var(--surface-2)] border border-[var(--accent-amber)]/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text)]">{selectedIds.length} פריטים נבחרו</span>
                <button onClick={clearSelection} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">בטל בחירה</button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={100}
                  max={4000}
                  step={50}
                  value={durationDraft}
                  onChange={(e) => setDurationDraft(Number(e.target.value))}
                  className="flex-1 accent-[var(--accent-amber)]"
                />
                <span className="text-xs text-[var(--accent-amber)] w-12 shrink-0">{(durationDraft / 1000).toFixed(1)}s</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { onSetItemsDuration(selectedIds, durationDraft); clearSelection() }}
                  className="flex-1 py-1.5 rounded-lg bg-[var(--accent-amber)] text-[#1c1815] text-xs font-medium"
                >
                  קבע זמן שהייה לנבחרים
                </button>
                <button
                  onClick={() => { onClearItemsDuration(selectedIds); clearSelection() }}
                  className="py-1.5 px-3 rounded-lg bg-[var(--surface)] text-[var(--muted)] text-xs"
                >
                  אפס לברירת מחדל
                </button>
              </div>
              <p className="text-[10px] text-[var(--muted)]">
                שאר הפריטים שלא נבחרו ישתמשו בברירת המחדל הכללית ({(defaultStayDuration / 1000).toFixed(1)}s). לוידאו, קביעת זמן קצר מאורך הקליפ תקצר אותו.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
})

