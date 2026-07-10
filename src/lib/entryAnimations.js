// entryAnimations.js
// ספריית סגנונות אנימציית כניסה מגוונת (בסגנון PowerPoint). כל פונקציה מקבלת התקדמות t (0..1),
// את מיקום היעד בפיקסלים, ואת מידות הקנבס - ומחזירה טרנספורם {x, y, scaleX, scaleY, rotation, alpha}.

export const ENTRY_STYLES = [
  'fadeScale',
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
  'zoomSpin',
  'dropBounce',
  'popIn',
  'spiralIn',
  'flipHorizontal',
  'flipVertical',
  'diagonalTL',
  'diagonalTR',
  'diagonalBL',
  'diagonalBR',
  'wobbleIn',
]

export const ENTRY_STYLE_LABELS = {
  fadeScale: 'התגבשות עדינה',
  slideUp: 'החלקה מלמטה',
  slideDown: 'החלקה מלמעלה',
  slideLeft: 'החלקה מימין',
  slideRight: 'החלקה משמאל',
  zoomSpin: 'זום + סיבוב',
  dropBounce: 'נפילה עם קפיצה',
  popIn: 'קפיצה פנימה',
  spiralIn: 'ספירלה',
  flipHorizontal: 'היפוך אופקי',
  flipVertical: 'היפוך אנכי',
  diagonalTL: 'אלכסון מפינה עליונה-שמאל',
  diagonalTR: 'אלכסון מפינה עליונה-ימין',
  diagonalBL: 'אלכסון מפינה תחתונה-שמאל',
  diagonalBR: 'אלכסון מפינה תחתונה-ימין',
  wobbleIn: 'כניסה מתנדנדת',
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function easeOutBounce(t) {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) return n1 * t * t
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
  return n1 * (t -= 2.625 / d1) * t + 0.984375
}

export function getEntryTransform(style, rawT, target, canvasWidth, canvasHeight) {
  const clamped = Math.min(1, Math.max(0, rawT))
  const t = easeOutCubic(clamped)
  const dist = Math.min(canvasWidth, canvasHeight) * 0.45
  const base = { x: target.x, y: target.y, scaleX: 1, scaleY: 1, rotation: 0, alpha: t }

  switch (style) {
    case 'slideUp':
      return { ...base, y: target.y + dist * (1 - t) }
    case 'slideDown':
      return { ...base, y: target.y - dist * (1 - t) }
    case 'slideLeft':
      return { ...base, x: target.x + dist * (1 - t) }
    case 'slideRight':
      return { ...base, x: target.x - dist * (1 - t) }
    case 'zoomSpin':
      return { ...base, scaleX: 0.2 + 0.8 * t, scaleY: 0.2 + 0.8 * t, rotation: (1 - t) * Math.PI * 0.9 }
    case 'dropBounce': {
      const bt = easeOutBounce(clamped)
      return { x: target.x, y: target.y - dist * 0.6 * (1 - bt), scaleX: 1, scaleY: 1, rotation: 0, alpha: Math.min(1, clamped * 3) }
    }
    case 'popIn': {
      const bt = easeOutBack(clamped)
      return { ...base, scaleX: Math.max(0, bt), scaleY: Math.max(0, bt) }
    }
    case 'spiralIn': {
      const angle = (1 - clamped) * Math.PI * 4
      const radius = dist * (1 - t)
      return {
        x: target.x + Math.cos(angle) * radius,
        y: target.y + Math.sin(angle) * radius,
        scaleX: 0.25 + 0.75 * t,
        scaleY: 0.25 + 0.75 * t,
        rotation: angle * 0.3,
        alpha: t,
      }
    }
    case 'flipHorizontal':
      return { ...base, scaleX: t, scaleY: 1 }
    case 'flipVertical':
      return { ...base, scaleX: 1, scaleY: t }
    case 'diagonalTL':
      return { ...base, x: target.x - dist * 0.7 * (1 - t), y: target.y - dist * 0.7 * (1 - t) }
    case 'diagonalTR':
      return { ...base, x: target.x + dist * 0.7 * (1 - t), y: target.y - dist * 0.7 * (1 - t) }
    case 'diagonalBL':
      return { ...base, x: target.x - dist * 0.7 * (1 - t), y: target.y + dist * 0.7 * (1 - t) }
    case 'diagonalBR':
      return { ...base, x: target.x + dist * 0.7 * (1 - t), y: target.y + dist * 0.7 * (1 - t) }
    case 'wobbleIn': {
      const wobble = Math.sin(clamped * 14) * (1 - clamped) * 0.35
      return { ...base, x: target.x - dist * 0.5 * (1 - t), rotation: wobble }
    }
    case 'fadeScale':
    default:
      return { ...base, scaleX: 0.35 + 0.65 * t, scaleY: 0.35 + 0.65 * t }
  }
}

export function pickStyleForItem(style, index, seedRng) {
  if (style !== 'random') return style
  return ENTRY_STYLES[Math.floor(seedRng() * ENTRY_STYLES.length)]
}
