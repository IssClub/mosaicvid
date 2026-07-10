import { memo } from 'react'

export default memo(function ExportPanel({ status, progress, downloadUrl, webmUrl, errorMessage, onStart, onRetryMp4 }) {
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
          <p className="text-xs text-[var(--muted)]">מקליט את הסרטון בזמן אמת... אל תסגור את הכרטיסייה.</p>
          <div className="h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div className="h-full bg-[var(--accent-amber)] transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-[var(--accent-amber)] text-left">{Math.round(progress * 100)}%</p>
        </div>
      )}

      {status === 'converting' && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">ההקלטה הושלמה. ממיר עכשיו ל-MP4 (תואם לכל מכשיר)... זה יכול לקחת כמה דקות.</p>
          <div className="h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <div className="h-full bg-[var(--accent-amber)] transition-all" style={{ width: `${Math.max(5, Math.round(progress * 100))}%` }} />
          </div>
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

      {status === 'mp4-failed' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--accent-coral)]">ההקלטה הצליחה, אבל ההמרה ל-MP4 נכשלה: {errorMessage}</p>
          {webmUrl && (
            <a
              href={webmUrl}
              download="mosaicvid.webm"
              className="block w-full py-3 rounded-xl bg-[var(--accent-amber)] text-[#1c1815] font-medium text-center"
            >
              הורד את הסרטון (WebM) - עובד במחשב ורוב הדפדפנים
            </a>
          )}
          <button onClick={onRetryMp4} className="w-full py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-sm">
            נסה שוב להמיר ל-MP4 (בלי להקליט מחדש)
          </button>
          <button onClick={onStart} className="w-full py-2 rounded-lg text-xs text-[var(--muted)] hover:text-[var(--text)]">
            הפק את כל הסרטון מחדש
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--accent-coral)]">משהו השתבש בהקלטה: {errorMessage}</p>
          <button onClick={onStart} className="w-full py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] text-sm">
            נסה שוב
          </button>
        </div>
      )}
    </div>
  )
})
