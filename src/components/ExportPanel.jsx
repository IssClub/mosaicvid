import { memo } from 'react'

export default memo(function ExportPanel({ status, progress, downloadUrl, partialDownloadUrl, errorMessage, onStart, onCancel }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg text-[var(--text)]">הפקת הסרטון הסופי</h2>

      {status === 'idle' && (
        <button
          onClick={onStart}
          className="w-full py-3 rounded-xl bg-[var(--accent-amber)] text-[#1c1815] font-medium"
        >
          ייצוא סרטון (MP4)
        </button>
      )}

      {status === 'recording' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">
            מעבד את פריימי הסרטון... זה יכול לקחת כמה דקות לסרטון ארוך, אבל אפשר לעבור לכרטיסייה/חלון אחר בינתיים.
          </p>
          <div className="h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div className="h-full bg-[var(--accent-amber)] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-[var(--accent-amber)] text-left">{Math.round(progress * 100)}%</p>
          <button onClick={onCancel} className="w-full py-2 rounded-lg bg-[var(--surface-2)] text-[var(--accent-coral)] text-xs">
            בטל ייצוא
          </button>
        </div>
      )}

      {status === 'converting' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">מרנדר קול וממזג לקובץ MP4 סופי... כמעט מוכן.</p>
          <div className="h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div className="h-full bg-[var(--accent-amber)] transition-all" style={{ width: `${Math.max(5, Math.round(progress * 100))}%` }} />
          </div>
          <button onClick={onCancel} className="w-full py-2 rounded-lg bg-[var(--surface-2)] text-[var(--accent-coral)] text-xs">
            בטל ייצוא
          </button>
        </div>
      )}

      {status === 'done' && downloadUrl && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--accent-amber)]">הסרטון מוכן! 🎉</p>
          <a
            href={downloadUrl}
            download="mosaicvid.mp4"
            className="block w-full py-3 rounded-xl bg-[var(--accent-amber)] text-[#1c1815] font-medium text-center"
          >
            הורד את הסרטון (MP4)
          </a>
          <button onClick={onStart} className="w-full py-2 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)]">
            הפק שוב
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--accent-coral)]">הייצוא נכשל:</p>
          <p className="text-xs text-[var(--accent-coral)] whitespace-pre-wrap break-words bg-black/20 rounded-lg p-2 max-h-48 overflow-y-auto">{errorMessage}</p>
          {partialDownloadUrl && (
            <a
              href={partialDownloadUrl}
              download="mosaicvid-partial.mp4"
              className="block w-full py-3 rounded-xl bg-[var(--accent-amber)] text-[#1c1815] font-medium text-center"
            >
              הורד את החלק שכן הצליח (MP4 חלקי, בלי קול)
            </a>
          )}
          <button onClick={onStart} className="w-full py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-sm">
            נסה שוב (הכל)
          </button>
        </div>
      )}
    </div>
  )
})
