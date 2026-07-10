// shapeMask.js
// אחראי על יצירת "מסכה" (mask canvas) עבור כל סוג צורה — פרה-סט, מספר/טקסט, או תמונה מותאמת אישית.
// כל המסכות מיוצגות באותו אופן: קנבס שחור-לבן, כאשר פיקסלים "בהירים" (alpha/luminance גבוה) הם בתוך הצורה.
// זה מאפשר למנוע הדגימה (samplePoints.js) לעבוד בצורה אחידה על כל סוגי הצורות.

const MASK_SIZE = 600 // רזולוציית עבודה פנימית של המסכה (ריבוע), מנורמל בהמשך ליחס המסך בפועל

/**
 * יוצר מסכה של לב, ממורכז בקנבס ריבועי.
 */
function drawHeart(ctx, size) {
  const w = size
  const h = size
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  const topCurveHeight = h * 0.3
  ctx.moveTo(w / 2, h * 0.92)
  ctx.bezierCurveTo(w * 0.05, h * 0.55, w * 0.05, topCurveHeight * 0.6, w * 0.28, topCurveHeight * 0.35)
  ctx.bezierCurveTo(w * 0.42, topCurveHeight * 0.15, w / 2, topCurveHeight * 0.5, w / 2, topCurveHeight * 0.65)
  ctx.bezierCurveTo(w / 2, topCurveHeight * 0.5, w * 0.58, topCurveHeight * 0.15, w * 0.72, topCurveHeight * 0.35)
  ctx.bezierCurveTo(w * 0.95, topCurveHeight * 0.6, w * 0.95, h * 0.55, w / 2, h * 0.92)
  ctx.closePath()
  ctx.fill()
}

function drawCircle(ctx, size) {
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2)
  ctx.fill()
}

export const PRESET_SHAPES = {
  heart: { label: 'לב', draw: drawHeart },
  circle: { label: 'עיגול', draw: drawCircle },
}

/**
 * יוצר מסכת קנבס עבור צורת פרה-סט.
 */
export function createPresetMask(shapeKey) {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_SIZE
  canvas.height = MASK_SIZE
  const ctx = canvas.getContext('2d')
  const shape = PRESET_SHAPES[shapeKey]
  if (!shape) throw new Error(`Unknown preset shape: ${shapeKey}`)
  shape.draw(ctx, MASK_SIZE)
  return canvas
}

/**
 * יוצר מסכת קנבס עבור טקסט/מספר חופשי (רב-ספרתי, או כל טקסט קצר אחר).
 */
export function createTextMask(text) {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_SIZE
  canvas.height = MASK_SIZE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // מתאימים את גודל הפונט כך שהטקסט ימלא את הקנבס ברוחב, עם שוליים קטנים
  const safeText = String(text || '').trim() || '1'
  let fontSize = MASK_SIZE * 0.8
  ctx.font = `900 ${fontSize}px Heebo, sans-serif`
  let width = ctx.measureText(safeText).width
  const maxWidth = MASK_SIZE * 0.86
  if (width > maxWidth) {
    fontSize = fontSize * (maxWidth / width)
    ctx.font = `900 ${fontSize}px Heebo, sans-serif`
  }
  ctx.fillText(safeText, MASK_SIZE / 2, MASK_SIZE / 2 + fontSize * 0.03)
  return canvas
}

/**
 * יוצר מסכת קנבס מתמונה שהועלתה (סילואט/מסכה מותאמת אישית).
 * threshold: 0-255, פיקסלים בהירים מעל הסף נחשבים "בתוך" הצורה (ברירת מחדל: לפי alpha אם קיים, אחרת לפי בהירות הפוכה — רקע בהיר = מחוץ, אובייקט כהה = בתוך, ניתן להתאים)
 */
export async function createImageMask(file, { invert = false, threshold = 128 } = {}) {
  const imgUrl = URL.createObjectURL(file)
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = imgUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = MASK_SIZE
  canvas.height = MASK_SIZE
  const ctx = canvas.getContext('2d')

  // מרכזים את התמונה בתוך ריבוע העבודה (contain)
  const scale = Math.min(MASK_SIZE / img.width, MASK_SIZE / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = (MASK_SIZE - dw) / 2
  const dy = (MASK_SIZE - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)

  const imageData = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE)
  const data = imageData.data
  const out = ctx.createImageData(MASK_SIZE, MASK_SIZE)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
    let inside
    if (a < 250) {
      // יש שקיפות אמיתית בתמונה — נשתמש בערוץ אלפא
      inside = a > threshold
    } else {
      // אין שקיפות — נשתמש בבהירות (luminance)
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b
      inside = invert ? luminance > threshold : luminance < threshold
    }
    const v = inside ? 255 : 0
    out.data[i] = v
    out.data[i + 1] = v
    out.data[i + 2] = v
    out.data[i + 3] = v
  }
  ctx.putImageData(out, 0, 0)
  URL.revokeObjectURL(imgUrl)
  return canvas
}

export { MASK_SIZE }
