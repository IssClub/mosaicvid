import { useEffect, useRef } from 'react'

const TILE_COLORS = ['#e8a33d', '#c4483a', '#f2ece1', '#b8794f']

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * מציג את נקודות הפסיפס כאריחי צילום קטנים, עם אנימציית "התכנסות" חלקה
 * בכל פעם שמערך הנקודות (points) משתנה - זהו אלמנט התצוגה החי של הצורה.
 * media (אופציונלי): מערך במקביל ל-points, כל איבר {thumbnailUrl} או null/undefined.
 * כאשר קיימת מדיה עם thumbnailUrl - מוצגת התמונה בפועל בתוך האריח; אחרת נופלים חזרה לאריח צבעוני.
 */
export default function ShapePreviewCanvas({ points, aspect = 1, media = null, className = '' }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const imageCacheRef = useRef(new Map())
  const stateRef = useRef({
    current: [],
    from: [],
    to: [],
    startTime: 0,
    duration: 900,
    seedColors: [],
    animId: null,
  })

  function getImage(url) {
    const cache = imageCacheRef.current
    let entry = cache.get(url)
    if (!entry) {
      const img = new Image()
      entry = { img, loaded: false }
      img.onload = () => {
        entry.loaded = true
        draw()
      }
      img.src = url
      cache.set(url, entry)
    }
    return entry.loaded ? entry.img : null
  }

  // כאשר הנקודות משתנות - מתחילים אנימציית מעבר חדשה
  useEffect(() => {
    const st = stateRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    const newTo = points.map((p) => ({ x: p.x, y: p.y }))

    let newFrom
    if (st.current.length === 0) {
      // רינדור ראשון: מפזרים את האריחים אקראית מסביב לקנבס לפני שהם מתכנסים
      newFrom = newTo.map(() => ({
        x: 0.5 + (Math.random() - 0.5) * 2.4,
        y: 0.5 + (Math.random() - 0.5) * 2.4,
      }))
    } else {
      // ממפים כמה שאפשר מהמצב הקודם, והשאר מתחילים ממיקום אקראי קרוב
      newFrom = newTo.map((_, i) => st.current[i] || {
        x: 0.5 + (Math.random() - 0.5) * 1.6,
        y: 0.5 + (Math.random() - 0.5) * 1.6,
      })
    }

    st.from = newFrom
    st.to = newTo
    st.startTime = performance.now()
    if (st.seedColors.length < newTo.length) {
      const extra = newTo.length - st.seedColors.length
      for (let i = 0; i < extra; i++) {
        st.seedColors.push(TILE_COLORS[Math.floor(Math.random() * TILE_COLORS.length)])
      }
    }

    if (st.animId) cancelAnimationFrame(st.animId)

    function frame(now) {
      const t = Math.min(1, (now - st.startTime) / st.duration)
      const eased = easeOutCubic(t)
      st.current = st.from.map((f, i) => ({
        x: f.x + (st.to[i].x - f.x) * eased,
        y: f.y + (st.to[i].y - f.y) * eased,
      }))
      draw()
      if (t < 1) {
        st.animId = requestAnimationFrame(frame)
      }
    }
    st.animId = requestAnimationFrame(frame)

    return () => {
      if (st.animId) cancelAnimationFrame(st.animId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points])

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const st = stateRef.current
    const n = Math.max(1, st.current.length)
    const tileSize = Math.max(4, Math.min(width, height) / Math.sqrt(n) * 0.72)

    st.current.forEach((p, i) => {
      const x = p.x * width
      const y = p.y * height
      const size = tileSize
      ctx.save()
      ctx.translate(x, y)
      const r = size * 0.22

      const mediaItem = media && media[i]
      const img = mediaItem && mediaItem.thumbnailUrl ? getImage(mediaItem.thumbnailUrl) : null

      if (img) {
        roundRect(ctx, -size / 2, -size / 2, size, size, r)
        ctx.clip()
        const scale = Math.max(size / img.width, size / img.height)
        const dw = img.width * scale
        const dh = img.height * scale
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
      } else {
        const color = st.seedColors[i] || '#e8a33d'
        ctx.fillStyle = color
        ctx.globalAlpha = 0.92
        roundRect(ctx, -size / 2, -size / 2, size, size, r)
        ctx.fill()
      }
      ctx.restore()
    })
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  // מתאימים את גודל הקנבס לקונטיינר, לפי יחס המסך המבוקש
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    function resize() {
      const cw = container.clientWidth
      const ch = container.clientHeight
      let w = cw
      let h = w / aspect
      if (h > ch) {
        h = ch
        w = h * aspect
      }
      canvas.width = Math.round(w * devicePixelRatio)
      canvas.height = Math.round(h * devicePixelRatio)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      draw()
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect])

  return (
    <div ref={containerRef} className={`flex items-center justify-center w-full h-full ${className}`}>
      <canvas ref={canvasRef} className="rounded-2xl" />
    </div>
  )
}
