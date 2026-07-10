# MosaicVid — מחולל וידאו פסיפס

## מה זה הפרויקט
אפליקציית React+Vite (client-side בלבד, ללא backend) שלוקחת עשרות/מאות תמונות ווידאו,
ומרכיבה מהם סרטון פסיפס: כל פריט מגיע למרכז המסך בגודל מלא, נשאר להצגה, ואז "נופל"
למקומו הסופי בתוך צורה (לב, מספר, תמונה מותאמת אישית...). יש מוזיקת רקע עם עמעום
אוטומטי כשוידאו עם קול מתנגן, דפי טקסט לפני/אחרי, וייצוא לקובץ MP4 אמיתי.

**הכל רץ בדפדפן של המשתמש — אין שרת.** ההמרה הסופית ל-MP4 גם היא קורית בדפדפן
(ffmpeg.wasm), רק קובצי המנוע (30MB) נטענים מ-CDN בזמן ריצה.

## מצב נוכחי — הכל עובד, זה שלב תחזוקה/שיפורים
כל 6 השלבים המקוריים מהספק הושלמו:
1. ✅ שלד + מנוע צורה (גריד קשיח, אריחים נוגעים/חופפים - לא פיזור אקראי)
2. ✅ העלאת מדיה (כולל המרת HEIC בדפדפן, הקטנת תמונות ל-1600px למניעת עומס זיכרון)
3. ✅ מנוע אנימציה (כניסה/הצגה/נפילה, 16 סגנונות כניסה)
4. ✅ מוזיקה + עמעום (Web Audio API, ציר גרירה+חיתוך, ducking אוטומטי)
5. ✅ הפקת MP4 (MediaRecorder + ffmpeg.wasm, עם גיבוי WebM אם ההמרה נכשלת)
6. ✅ דפי טקסט (פתיחה/סיום), סדר שיוך תמונות (אקראי/העלאה/שם קובץ), זמן שהייה מותאם לפריטים נבחרים

## דברים חשובים שכבר תוקנו (אל תחזור על הבאגים האלה!)
- **זיכרון**: תמונות מוקטנות ל-1600px מקס (`mediaThumbnail.js`), וידאו משחרר את עצמו
  (`disposeVideo` ב-`MosaicPlayer.jsx`) ברגע שהוא נופל למקום - קריטי עם 100+ קבצים.
- **וידאו שקופץ להתחלה**: תוקן ע"י כפיית `currentTime=0` ברגע הכניסה לשלב ההצגה + תיקון
  סחיפה תוך כדי ניגון (חפש `vs.started` ו-`!vs.el.ended` ב-MosaicPlayer.jsx).
- **ffmpeg-core**: לא ניתן לייבא אותו כ-import מקומי (ה-validator/exports חוסמים דיפ-אימפורט
  ל-node_modules) - הפתרון שעובד הוא CDN עם שרשרת גיבוי (jsdelivr → unpkg), ראה `videoExport.js`.
- **React.memo**: ShapeSelector/MediaUploader/BackgroundSelector/AnimationSettings/AudioTimeline
  עטופים ב-memo כי currentTime מתעדכן 60 פעם בשנייה ב-App - בלי memo כל הפאנל הצידי מרנדר
  מחדש כל פריים וגורם לתקיעות.
- **HEIC**: מומר ל-JPEG בדפדפן עם heic2any (dynamic import, לא בבאנדל הראשי).

## מבנה קבצים
```
src/
  App.jsx                    - state מרכזי, שעון ניגון משותף (RAF), כל ה-handlers
  components/
    MosaicPlayer.jsx          - הקנבס עצמו: draw(), ניהול video/image elements, טקסט פתיחה/סיום
    MediaUploader.jsx         - העלאה, בחירת סדר, בחירת פריטים לזמן שהייה מותאם
    AudioTimeline.jsx         - ציר מוזיקה (גרירה/חיתוך)
    TextPagesEditor.jsx       - עריכת דפי פתיחה/סיום
    ExportPanel.jsx           - כפתור ייצוא + מצבי progress/done/error/mp4-failed
    ShapeSelector.jsx         - בחירת צורה/מספר/תמונה + יחס מסך
    BackgroundSelector.jsx    - רקע (צבע/עיצוב/תמונה)
    AnimationSettings.jsx     - הגדרות זמנים גלובליות (stay/settle/stagger)
    ShapePreviewCanvas.jsx    - ⚠️ לא בשימוש כרגע, קובץ ישן - אפשר להתעלם/למחוק
  lib/
    samplePoints.js           - מנוע דגימת הגריד הקשיח מתוך המסכה
    shapeMask.js               - יצירת מסכות (preset/מספר/תמונה)
    buildTimeline.js           - לוח זמנים solo/overlap לכל פריט
    entryAnimations.js         - 16 סגנונות כניסה
    backgrounds.js              - עיצובי רקע מוכנים
    mediaThumbnail.js           - עיבוד תמונה/וידאו בהעלאה (כולל HEIC, הקטנה, זיהוי קול)
    audioEngine.js               - Web Audio: רצועות מוזיקה, ducking, חיבור אודיו של וידאו
    videoExport.js                - MediaRecorder + ffmpeg.wasm להפקת MP4
```

## טכנולוגיה
React 19 + Vite + Tailwind. תלויות עיקריות: `heic2any`, `@ffmpeg/ffmpeg`, `@ffmpeg/util`.
Build: `npm run build`. אין טסטים אוטומטיים מוגדרים כרגע.

## פריסה
עברנו מ-AppDeploy ל-GitHub + GitHub Pages (כדי לחסוך טוקנים על שינויים קטנים).
אחרי כל שינוי: `npm run build`, ודא שאין שגיאות, ואז git commit + push (עם אישור המשתמש).

## מה עוד אפשר לשפר (לא דחוף, לפי בקשת המשתמש בעתיד)
- ShapePreviewCanvas.jsx הישן אפשר למחוק אם לא ישמש.
- אין עדיין fade-in/out ידני לכל רצועת מוזיקה בנפרד (יש ברירת מחדל קבועה של שנייה).
- ה-QA האוטומטי (screenshots) שהיה ב-AppDeploy לא קיים יותר - יש לבדוק ידנית אחרי כל שינוי.
