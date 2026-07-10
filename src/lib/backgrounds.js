// backgrounds.js
// מגדיר את אפשרויות הרקע לסרטון: צבע אחיד, אחד מכמה רקעים מעוצבים מראש, או תמונת רקע מותאמת אישית.
// כל הרקעים מצוירים ישירות על הקנבס (לא CSS) כדי שהתוצאה תהיה זהה גם בהפקת הווידאו הסופי.

export const PRESET_BACKGROUNDS = [
  { key: 'cream', label: 'קרם חם', colors: ['#f4efe6', '#e9dfcd'], angle: 135 },
  { key: 'midnight', label: 'חצות כחול', colors: ['#1c2431', '#0b0f16'], angle: 135 },
  { key: 'blush', label: 'ורוד עדין', colors: ['#f7dfe0', '#eec2c9'], angle: 135 },
  { key: 'sage', label: 'ירוק מרווה', colors: ['#e4ebe0', '#c3d2bb'], angle: 135 },
  { key: 'charcoal', label: 'פחם חגיגי', colors: ['#2b2622', '#171310'], angle: 135 },
]

function angleToCoords(angleDeg, w, h) {
  const rad = (angleDeg * Math.PI) / 180
  const cx = w / 2
  const cy = h / 2
  const len = Math.sqrt(w * w + h * h) / 2
  return {
    x0: cx - Math.cos(rad) * len,
    y0: cy - Math.sin(rad) * len,
    x1: cx + Math.cos(rad) * len,
    y1: cy + Math.sin(rad) * len,
  }
}

/**
 * מצייר את הרקע על הקנבס בהתאם לקונפיגורציה שנבחרה.
 * config: { type: 'color'|'preset'|'image', color, presetKey, image (HTMLImageElement|null) }
 */
export function renderBackground(ctx, width, height, config) {
  if (!config || config.type === 'color') {
    ctx.fillStyle = (config && config.color) || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    return
  }

  if (config.type === 'preset') {
    const preset = PRESET_BACKGROUNDS.find((p) => p.key === config.presetKey) || PRESET_BACKGROUNDS[0]
    const { x0, y0, x1, y1 } = angleToCoords(preset.angle, width, height)
    const grad = ctx.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, preset.colors[0])
    grad.addColorStop(1, preset.colors[1])
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, width, height)
    return
  }

  if (config.type === 'image') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    if (config.image) {
      const img = config.image
      const scale = Math.max(width / img.width, height / img.height)
      const dw = img.width * scale
      const dh = img.height * scale
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh)
    }
  }
}
