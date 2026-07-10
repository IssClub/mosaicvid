// samplePoints.js
// לוקח מסכת צורה (מ-shapeMask.js) ומפיק ממנה N נקודות (מרכזי אריחים) שממלאות את הצורה בפסיפס
// צפוף וברור - גריד קשיח (לא פיזור אורגני) שבו אריחים שכנים נוגעים/חופפים קלות, בלי רווחים.
// המנוע מתאים את גודל הגריד אוטומטית לצפיפות האמיתית של הצורה הספציפית ולכמות האריחים המבוקשת.
// הנקודות מוחזרות בקואורדינטות מנורמלות: x,y בטווח [0,1] ביחס למסגרת הפלט (aspect = width/height).

function getMaskData(maskCanvas) {
  const ctx = maskCanvas.getContext('2d')
  const { width, height } = maskCanvas
  const imageData = ctx.getImageData(0, 0, width, height)
  return { data: imageData.data, width, height }
}

function isInside(maskData, x, y) {
  const { data, width, height } = maskData
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return false
  const idx = (yi * width + xi) * 4
  return data[idx] > 127
}

function getBoundingBox(maskData) {
  const { data, width, height } = maskData
  let minX = width, minY = height, maxX = 0, maxY = 0
  let found = false
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4
      if (data[idx] > 127) {
        found = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!found) return { minX: 0, minY: 0, maxX: width, maxY: height }
  return { minX, minY, maxX, maxY }
}

/**
 * דוגם תאי גריד קשיחים (ללא ג'יטר) בתוך תיבת התיחום, בגודל תא נתון.
 * מחזיר גם את אינדקסי הגריד (i,j) של כל תא, לצורך חישובי שכנות בהמשך.
 */
function sampleGrid(maskData, bbox, cellSize) {
  const shapeW = bbox.maxX - bbox.minX
  const shapeH = bbox.maxY - bbox.minY
  const cols = Math.max(1, Math.ceil(shapeW / cellSize))
  const rows = Math.max(1, Math.ceil(shapeH / cellSize))
  const cells = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = bbox.minX + (i + 0.5) * cellSize
      const cy = bbox.minY + (j + 0.5) * cellSize
      if (isInside(maskData, cx, cy)) {
        cells.push({ i, j, x: cx, y: cy })
      }
    }
  }
  return cells
}

function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(arr, rng) {
  const result = arr.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * מכווץ את רשימת התאים למספר המדויק הנדרש, על ידי הסרת התאים ה"שוליים ביותר"
 * (הכי מעט שכנים מלאים) - כך שהצמצום פוגע בקצוות הצורה ולא בליבה שלה.
 */
function trimCells(cells, targetCount, filledSet, rng) {
  function neighborScore(c) {
    let s = 0
    if (filledSet.has(`${c.i + 1},${c.j}`)) s++
    if (filledSet.has(`${c.i - 1},${c.j}`)) s++
    if (filledSet.has(`${c.i},${c.j + 1}`)) s++
    if (filledSet.has(`${c.i},${c.j - 1}`)) s++
    return s
  }
  const shuffled = seededShuffle(cells, rng)
  shuffled.sort((a, b) => neighborScore(a) - neighborScore(b))
  const excess = cells.length - targetCount
  const toRemove = new Set(shuffled.slice(0, excess).map((c) => `${c.i},${c.j}`))
  return cells.filter((c) => !toRemove.has(`${c.i},${c.j}`))
}

/**
 * מרחיב את רשימת התאים למספר המדויק הנדרש, על ידי הוספת תאים סמוכים לגבול הצורה הקיים
 * (עדיפות לתאים עם הכי הרבה שכנים מלאים - ממלאים קודם "מפרצים" פנימיים, ורק אז מרחיבים החוצה).
 */
function padCells(cells, targetCount, bbox, cellSize) {
  const filledSet = new Set(cells.map((c) => `${c.i},${c.j}`))
  let guard = 0
  while (cells.length < targetCount && guard < targetCount * 10) {
    guard++
    const candidates = new Map()
    for (const c of cells) {
      const neighbors = [
        [c.i + 1, c.j], [c.i - 1, c.j], [c.i, c.j + 1], [c.i, c.j - 1],
      ]
      for (const [ni, nj] of neighbors) {
        const key = `${ni},${nj}`
        if (filledSet.has(key)) continue
        if (!candidates.has(key)) {
          candidates.set(key, {
            i: ni,
            j: nj,
            x: bbox.minX + (ni + 0.5) * cellSize,
            y: bbox.minY + (nj + 0.5) * cellSize,
            score: 0,
          })
        }
        candidates.get(key).score++
      }
    }
    if (candidates.size === 0) break
    const sorted = [...candidates.values()].sort((a, b) => b.score - a.score)
    const needed = targetCount - cells.length
    const toAdd = sorted.slice(0, needed)
    for (const c of toAdd) {
      cells.push(c)
      filledSet.add(`${c.i},${c.j}`)
    }
  }
  return cells
}

/**
 * @param {HTMLCanvasElement} maskCanvas - מסכה שנוצרה ע"י shapeMask.js
 * @param {number} count - כמות הנקודות הרצויה (מספר הפריטים שהועלו)
 * @param {number} aspect - יחס רוחב/גובה של מסגרת הפלט
 * @param {number} seed - seed לרנדומיזציה יציבה
 * @returns {{points: {x:number,y:number}[], tileScale:number}}
 */
export function samplePoints(maskCanvas, count, aspect = 1, seed = 42) {
  const maskData = getMaskData(maskCanvas)
  const bbox = getBoundingBox(maskData)
  const rng = mulberry32(seed)

  const shapeW = Math.max(1, bbox.maxX - bbox.minX)
  const shapeH = Math.max(1, bbox.maxY - bbox.minY)
  const shapeArea = shapeW * shapeH * 0.6

  // ניחוש ראשוני לגודל תא לפי צפיפות רצויה, ואז כמה איטרציות לכיוונון עדין -
  // זו ההתאמה האוטומטית של המנוע לצורה הספציפית ולכמות האריחים.
  let cellSize = Math.sqrt(shapeArea / count)
  let cells = sampleGrid(maskData, bbox, cellSize)

  for (let iter = 0; iter < 10 && cells.length !== count; iter++) {
    const ratio = cells.length / count
    if (ratio === 0) {
      cellSize *= 0.6
    } else {
      cellSize *= Math.sqrt(ratio)
    }
    cells = sampleGrid(maskData, bbox, cellSize)
  }

  // כיוון עדין סופי למספר המדויק - קיצוץ שוליים או הרחבת גבול, לא פיזור רנדומלי גורף
  if (cells.length > count) {
    const filledSet = new Set(cells.map((c) => `${c.i},${c.j}`))
    cells = trimCells(cells, count, filledSet, rng)
  } else if (cells.length < count) {
    cells = padCells(cells, count, bbox, cellSize)
  }

  // מיפוי מרחב המסכה -> מרחב מסגרת הפלט (contain, ממורכז)
  const shapeCenterX = (bbox.minX + bbox.maxX) / 2
  const shapeCenterY = (bbox.minY + bbox.maxY) / 2
  const pad = 0.82
  const outW = aspect
  const outH = 1
  const scale = Math.min((outW * pad) / shapeW, (outH * pad) / shapeH)

  const normalized = cells.map((c) => ({
    x: 0.5 + (c.x - shapeCenterX) * scale / outW,
    y: 0.5 + (c.y - shapeCenterY) * scale / outH,
  }))

  // גודל אריח = בדיוק המרחק בין תאי הגריד (cellSize), כך שאריחים שכנים נוגעים זה בזה במדויק
  const tileScale = cellSize * scale / outH

  return { points: normalized, tileScale }
}
