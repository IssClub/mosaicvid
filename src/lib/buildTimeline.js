// buildTimeline.js
// בונה "לוח זמנים" (timeline) לכל פריט מדיה, עם שלוש פאזות:
// 1. כניסה (enterDuration) - התמונה נכנסת ומגיעה לגודל מלא במרכז המסך.
// 2. הצגה (stayDuration/displayDuration) - נשארת בגודל מלא, "רגע הצפייה".
// 3. נפילה לפסיפס (settleDuration) - מצטמצמת ונעה מהמרכז אל מקומה הסופי בפסיפס.
//
// חוקי התזמון בין פריטים:
// - פריט 'solo': תופס את המסך לבד - שום פריט אחר לא יכול להתחיל להיכנס עד שהוא מסיים את שלוש הפאזות.
// - פריט 'overlap': הפריט הבא יכול להתחיל להיכנס ברגע שהפריט הנוכחי מתחיל *לנפול* (לא צריך לחכות שיסיים).

/**
 * @returns {{schedule: Array, totalDuration:number}}
 */
export function buildTimeline(items, { enterDuration = 550, stayDuration = 500, settleDuration = 550, staggerGap = 150 } = {}) {
  let barrier = 0
  let maxEnd = 0
  let cursor = 0

  const schedule = items.map((item) => {
    const mode = item.entryMode === 'solo' ? 'solo' : 'overlap'
    const start = mode === 'solo' ? Math.max(barrier, maxEnd) : Math.max(barrier, cursor)

    const display = item.stayDuration ?? stayDuration
    const settle = item.settleDuration ?? settleDuration
    const enterEnd = start + enterDuration
    const displayEnd = enterEnd + display
    const end = displayEnd + settle

    maxEnd = Math.max(maxEnd, end)
    if (mode === 'solo') {
      barrier = end
    }
    // פריט overlap הבא יכול להתחיל ברגע שהפריט הזה מתחיל לנפול (+ מרווח קטן)
    cursor = displayEnd + staggerGap

    return { start, enterEnd, displayEnd, end, enterDuration, displayDuration: display, settleDuration: settle, mode }
  })

  return { schedule, totalDuration: maxEnd }
}
