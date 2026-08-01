// projectStorage.js
// שומר ומשחזר את מצב הפרויקט המלא (כל הקבצים שהועלו + כל ההגדרות) ב-IndexedDB המקומי של
// הדפדפן - כדי שרענון בטעות/קריסת דף לא ימחקו שעות של הכנה. בניגוד ל-localStorage (מוגבל
// לכמה MB, טקסט בלבד), IndexedDB תומך ישירות בקבצים/Blobs גדולים בלי המרה, עם הרבה יותר מקום.
//
// שני רשומות נפרדות בכוונה:
// - "files" (כבד: מדיה + מוזיקה, כולל ה-Blobs עצמם) - נשמר רק כשסט הקבצים באמת משתנה.
// - "settings" (קל: כל שאר ההגדרות, JSON בלבד ברובו) - נשמר בתדירות גבוהה בלי בעיה.
// אם הכל היה ברשומה אחת, כל שינוי הגדרה קטן (סליידר, טוגל) היה כותב מחדש ל-IndexedDB את כל
// קבצי הווידאו/תמונות שוב ושוב - עומס דיסק/זיכרון מיותר ומשמעותי עם הרבה קבצים גדולים.

const DB_NAME = 'mosaicvid-project'
const DB_VERSION = 1
const STORE_NAME = 'project'
const FILES_KEY = 'files'
const SETTINGS_KEY = 'settings'

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function putRecord(key, value) {
  return async () => {
    const db = await openDb()
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put({ ...value, savedAt: Date.now() }, key)
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }
}

function getRecord(key) {
  return async () => {
    const db = await openDb()
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(key)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  }
}

/** שומר רק את הקבצים הכבדים (מדיה + מוזיקה) - לקרוא רק כשסט הקבצים באמת משתנה. */
export const saveProjectFiles = (files) => putRecord(FILES_KEY, files)()

/** שומר רק הגדרות קלות (בלי קבצי מדיה/מוזיקה) - זול לקרוא לזה בתדירות גבוהה. */
export const saveProjectSettings = (settings) => putRecord(SETTINGS_KEY, settings)()

/** טוען את שתי הרשומות ומאחד אותן לאובייקט פרויקט שלם אחד (או null אם אין כלום שמור). */
export async function loadProject() {
  const [files, settings] = await Promise.all([getRecord(FILES_KEY)(), getRecord(SETTINGS_KEY)()])
  if (!files && !settings) return null
  return { ...(settings || {}), ...(files || {}) }
}

export async function clearProject() {
  const db = await openDb()
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(FILES_KEY)
      tx.objectStore(STORE_NAME).delete(SETTINGS_KEY)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
