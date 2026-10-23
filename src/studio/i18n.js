// Interface language (English / Arabic). Text in studio.html is tagged with data-i18n="key";
// text built in JS calls t("key"). The AI prompt is always English (see render-ai.js).

const STR = {
  en: {
    pageTitle: "RoomPitch Room Studio",
    tag: "Real render test · Cloudflare",
    langBtn: "عربي",
    length: "Length", width: "Width", height: "Height", m: "m",
    settings: "Settings", priceList: "Price list", exportPdf: "Export PDF", render: "Photoreal render",
    library: "Library", dragDrop: "Drag and drop",
    tabFurn: "Furniture", tabOpen: "Windows & doors", tabWall: "Walls", tabFloor: "Floors",
    planTitle: "Floor plan", planHint: "Drag pieces to move them · click a wall to select it", planAria: "Room floor plan",
    threeHint: "Drag to move · Shift+drag to raise · double-click or R to rotate",
    lighting: "Lighting", light_daylight: "Daylight", light_warm: "Warm interior", light_studio: "Studio (even)",
    sun: "Sun", sunTimeAria: "Time of day", facing: "Top of plan faces", season: "Season",
    dirN: "North", dirNE: "North-east", dirE: "East", dirSE: "South-east", dirS: "South", dirSW: "South-west", dirW: "West", dirNW: "North-west",
    season_summer: "Summer", season_equinox: "Spring / autumn", season_winter: "Winter",
    sunUp: "Sun {n}° above the horizon", sunSet: "The sun has set", north: "North", northLetter: "N",
    camCorner: "Corner", camDoor: "From door", camTop: "Top", camView: "View", viewSettings: "View settings",
    estTitle: "Estimate", estHint: "Updates as you design", estHide: "Hide estimate", estShow: "Show estimate",

    hintFurn: "Drag a piece onto the plan or the 3D view, or click it to place it in the middle of the room.",
    hintWall: "Drag a finish onto any wall, or select a wall and click a finish.",
    hintFloor: "Drag a finish onto the floor, or click it.",
    hintReplace: "Pick the new piece. It takes the old one's place and direction.",
    hintWallFirst: "Select a wall first in the plan or 3D view, or drag the finish onto it.",
    hintOpen: "Drag a window or door onto any wall, or select a wall and click one. Drag it in the plan to move it.",
    hintOpenWallFirst: "Drag it onto a wall, or select a wall first and then click it.",
    hintNoRoomOnWall: "There's no free space on that wall for it. Try another wall or make it narrower.",

    replacing: "Replacing: {name}", pickNew: "Pick the new piece from the library", cancel: "Cancel",
    nothingSel: "Nothing selected", nothingHint: "Click a piece, a wall or the floor",
    replace: "Replace", rotate: "Rotate 90°", duplicate: "Duplicate", delete: "Delete",
    applyAll: "Apply to all walls", removeFinish: "Remove finish", removeFloor: "Remove floor finish",
    floor: "Floor", wallN: "Wall {n}", roomSetup: "Room setup",
    fromFloor: "From floor", raiseHint: "Shift + drag in 3D, or PageUp / PageDown", fixedHeight: "Fixed height",
    onFloor: "On the floor", restsOn: "On the {name}", restOnSurface: "Rest on surface", restOnSurfaceHint: "Let it sit on the floor or the surface below it",
    dragToMove: "drag it in the plan to move", centerOnWall: "Center on wall", openingNoFit: "That size doesn't fit on this wall.",
    price: "Price", perM2: "per m²", perPiece: "per piece", cm: "cm", m2: "m²", pc: "pc",

    finishes: "Finishes", furniture: "Furniture", floorLine: "Floor: {name}", wallsLine: "Walls: {name}",
    subtotal: "Subtotal", fee: "Design fee ({p}%)", vat: "VAT ({p}%)", total: "Total",
    estNote: "Prices come from your price list. Change them in Price list, or select a piece, wall or the floor.",
    door: "Door", window: "Window",

    mTitle: "Photoreal render", sceneCap: "Your scene (sent to the AI)", aiCap: "AI render",
    shotAlt: "Snapshot of the 3D scene", outAlt: "Photoreal render",
    rendering: "Rendering…", accessLabel: "Access code (ACCESS_CODE in your .env file)", send: "Send",
    promptSum: "Prompt sent to the AI", again: "Render again", saveImg: "Save image", back: "Back to design",
    offline: "Open this page through the server: run npm run dev and go to /studio.html",
    noKeys: "No AI keys in .env. Add CF_ACCOUNT_ID and CF_API_TOKEN, then restart the server.",
    renderOff: "Rendering is off", sending: "Sending to {p}…", codeNeeded: "Access code needed",
    enterCode: "Enter the code from your .env file", wentWrong: "Something went wrong ({s})", failed: "Render failed",
    done: "Done in {s} s · {p}", noServer: "Could not reach the server. Make sure npm run dev is running.",

    setTitle: "Studio settings", setNote: "Saved on this device and used in every PDF.",
    studioName: "Studio name", designer: "Designer", phone: "Phone", email: "Email", logo: "Logo",
    uploadLogo: "Upload logo", removeLogo: "Remove logo", noLogo: "No logo yet",
    currency: "Currency", feePct: "Design fee %", vatPct: "VAT %", close: "Close",

    pricesTitle: "Price list", pricesNote: "Your prices, saved on this device. The estimate and the PDF use them.",
    wallsPerM2: "Walls (per m²)", floorsPerM2: "Floors (per m²)", furnPerPiece: "Furniture (per piece)",
    resetPrices: "Reset to example prices", resetConfirm: "Click again to reset all prices",

    pdfTitle: "Export PDF proposal", client: "Client name", project: "Project name", notes: "Notes for the client",
    validity: "Valid for (days)", pdfLang: "PDF language", createPdf: "Create PDF",
    pdfTip: "Your browser's print window opens: choose “Save as PDF”.",
    pdfNoRender: "No AI render yet, so the PDF uses the 3D view. Render first for a photoreal image.",

    pTitle: "Design proposal", preparedFor: "Prepared for", pProject: "Project", pRoom: "Room", pDate: "Date",
    proposed: "Proposed design", concept3d: "3D concept", alternatives: "Alternatives",
    planCap: "Floor plan with dimensions", breakdown: "Cost breakdown",
    item: "Item", qty: "Qty", unitPrice: "Unit price", amount: "Amount", pNotes: "Notes",
    valid: "This proposal is valid for {d} days from its date.",
    visual: "Images are concept visualisations. Final finishes and furniture may differ slightly.",
    signClient: "Client signature", signDesigner: "Designer signature", yourStudio: "Your studio",
    // Screen 1: new room
    newRoom: "New room", newRoomSub: "How do you want to start?",
    chooseManual: "I'll build the room myself", chooseManualSub: "Type the measurements, then place the doors and windows.",
    choosePhotos: "I have photos of the room", choosePhotosSub: "Upload photos and type the measurements. AI finds the doors and windows.",
    continueLast: "Continue last room", backChoice: "Back", startDesign: "Start designing",
    shapeTitle: "Room shape", shapeRect: "Rectangle", shapeL: "L-shape",
    lengthCm: "Length", widthCm: "Width", heightCm: "Ceiling height", cutLength: "Cut-out length", cutWidth: "Cut-out width",
    cutCorner: "Cut-out corner", corner_nw: "Top left", corner_ne: "Top right", corner_se: "Bottom right", corner_sw: "Bottom left",
    wallsTitle: "Walls", openingsTitle: "Doors and windows", addDoor: "Add door", addWindow: "Add window",
    door1: "Door", window1: "Window", onWall: "Wall", fromCorner: "From corner", oWidth: "Width", oHeight: "Height", oSill: "Sill",
    remove: "Remove", foundByAI: "found by AI", noOpenings: "No doors or windows yet.",
    previewHint: "Drag doors and windows along their wall.",
    errBeyondWall: "Goes past the end of the wall", errTooTall: "Taller than the ceiling", errOverlap: "Overlaps another door or window",
    errTooSmall: "Under 30 cm", err_tooSmall: "Each side needs at least 100 cm", err_cutTooBig: "The cut-out must be smaller than the room",
    err_tooLow: "The ceiling needs at least 200 cm",
    photosTitle: "Room photos", photosHint: "One photo per wall, showing the whole wall. Pick the wall for each photo, or select a photo and click its wall in the preview.",
    addPhotos: "Add photos", whichWall: "Wall…", removePhoto: "Remove", analyze: "Find doors and windows",
    analyzing: "Photo {i} of {n}…", analyzeDone: "Found {n} doors and windows. Check them below and fix anything that's off.",
    analyzeNone: "No doors or windows found. Add them by hand below.", untagged: "{n} photo(s) without a wall were skipped.",
    tooMany: "Only 8 photos per room: {n} not added.", droppedPieces: "{n} piece(s) from the saved room are no longer in the library and were left out.", needTag: "Pick the wall for each photo first.",
    analysisOff: "Photo analysis is off: add CF_ACCOUNT_ID and CF_API_TOKEN to .env and restart the server."
  },

  ar: {
    pageTitle: "RoomPitch استوديو الغرفة",
    tag: "تجربة ريندر حقيقي · Cloudflare",
    langBtn: "English",
    length: "الطول", width: "العرض", height: "الارتفاع", m: "م",
    settings: "الإعدادات", priceList: "قائمة الأسعار", exportPdf: "تصدير PDF", render: "ريندر واقعي",
    library: "المكتبة", dragDrop: "اسحب وأفلت",
    tabFurn: "الأثاث", tabOpen: "شبابيك وأبواب", tabWall: "الحوائط", tabFloor: "الأرضيات",
    planTitle: "المسقط", planHint: "اسحب القطع لتحريكها · اضغط على حائط لاختياره", planAria: "مسقط الغرفة",
    threeHint: "اسحب للتحريك · Shift + سحب للرفع · دبل كليك أو R للّف",
    lighting: "الإضاءة", light_daylight: "نهار", light_warm: "دافية", light_studio: "ستوديو (متساوية)",
    sun: "الشمس", sunTimeAria: "الساعة", facing: "أعلى المسقط ناحية", season: "الموسم",
    dirN: "الشمال", dirNE: "الشمال الشرقي", dirE: "الشرق", dirSE: "الجنوب الشرقي", dirS: "الجنوب", dirSW: "الجنوب الغربي", dirW: "الغرب", dirNW: "الشمال الغربي",
    season_summer: "الصيف", season_equinox: "الربيع / الخريف", season_winter: "الشتاء",
    sunUp: "الشمس على ارتفاع {n}° فوق الأفق", sunSet: "الشمس غربت", north: "الشمال", northLetter: "ش",
    camCorner: "زاوية", camDoor: "من الباب", camTop: "من أعلى", camView: "العرض", viewSettings: "إعدادات العرض",
    estTitle: "الميزانية", estHint: "تتحدث أثناء التصميم", estHide: "إخفاء الميزانية", estShow: "عرض الميزانية",

    hintFurn: "اسحب القطعة على المسقط أو الـ 3D، أو اضغط عليها لتوضع في منتصف الغرفة.",
    hintWall: "اسحب الخامة على أي حائط، أو اختر حائطًا ثم اضغط على الخامة.",
    hintFloor: "اسحب الخامة على الأرضية، أو اضغط عليها.",
    hintReplace: "اختر القطعة الجديدة، وستأخذ مكان القديمة واتجاهها.",
    hintWallFirst: "اختر حائطًا أولًا من المسقط أو الـ 3D، أو اسحب الخامة عليه.",
    hintOpen: "اسحب شباك أو باب على أي حائط، أو اختر حائطًا واضغط عليه. اسحبه في المسقط لتحريكه.",
    hintOpenWallFirst: "اسحبه على حائط، أو اختر حائطًا أولًا ثم اضغط عليه.",
    hintNoRoomOnWall: "مفيش مساحة فاضية له على الحائط ده. جرّب حائطًا تاني أو خلّيه أضيق.",

    replacing: "استبدال: {name}", pickNew: "اختر القطعة الجديدة من المكتبة", cancel: "إلغاء",
    nothingSel: "لا يوجد شيء مختار", nothingHint: "اضغط على قطعة أو حائط أو الأرضية",
    replace: "استبدال", rotate: "لف 90°", duplicate: "تكرار", delete: "حذف",
    applyAll: "نفس الخامة لكل الحوائط", removeFinish: "إزالة الخامة", removeFloor: "إزالة تشطيب الأرضية",
    floor: "الأرضية", wallN: "حائط {n}", roomSetup: "إعدادات الغرفة",
    fromFloor: "من الأرض", raiseHint: "Shift + سحب في الـ 3D، أو PageUp / PageDown", fixedHeight: "ارتفاع ثابت",
    onFloor: "على الأرض", restsOn: "على {name}", restOnSurface: "ينزل على السطح", restOnSurfaceHint: "خلّيه يقعد على الأرض أو على السطح اللي تحته",
    dragToMove: "اسحبه في المسقط لتحريكه", centerOnWall: "في نص الحائط", openingNoFit: "المقاس ده مش هيدخل على الحائط ده.",
    price: "السعر", perM2: "للمتر²", perPiece: "للقطعة", cm: "سم", m2: "م²", pc: "قطعة",

    finishes: "التشطيبات", furniture: "الأثاث", floorLine: "أرضية: {name}", wallsLine: "حوائط: {name}",
    subtotal: "المجموع", fee: "أتعاب التصميم ({p}%)", vat: "ضريبة القيمة المضافة ({p}%)", total: "الإجمالي",
    estNote: "الأسعار من قائمة أسعارك. عدّلها من «قائمة الأسعار»، أو اختر قطعة أو حائطًا أو الأرضية.",
    door: "باب", window: "شباك",

    mTitle: "ريندر واقعي", sceneCap: "المشهد بتاعك (المُرسل للـ AI)", aiCap: "ريندر الـ AI",
    shotAlt: "لقطة من المشهد 3D", outAlt: "الريندر الواقعي",
    rendering: "جاري الريندر…", accessLabel: "كود الدخول (ACCESS_CODE في ملف .env)", send: "إرسال",
    promptSum: "الوصف المُرسل للـ AI", again: "ريندر مرة أخرى", saveImg: "حفظ الصورة", back: "رجوع للتصميم",
    offline: "افتح الصفحة من السيرفر: شغّل npm run dev وافتح ‎/studio.html",
    noKeys: "لا توجد مفاتيح AI في ملف .env. أضف CF_ACCOUNT_ID و CF_API_TOKEN ثم أعد تشغيل السيرفر.",
    renderOff: "الريندر غير مُفعّل", sending: "جاري الإرسال إلى {p}…", codeNeeded: "مطلوب كود الدخول",
    enterCode: "اكتب الكود الموجود في ملف .env", wentWrong: "حدث خطأ ({s})", failed: "فشل الريندر",
    done: "تم في {s} ثانية · {p}", noServer: "تعذّر الوصول للسيرفر. تأكد أن npm run dev يعمل.",

    setTitle: "إعدادات المكتب", setNote: "تُحفظ على هذا الجهاز وتظهر في كل PDF.",
    studioName: "اسم المكتب", designer: "اسم المصمم", phone: "التليفون", email: "الإيميل", logo: "اللوجو",
    uploadLogo: "رفع اللوجو", removeLogo: "حذف اللوجو", noLogo: "لا يوجد لوجو",
    currency: "العملة", feePct: "أتعاب التصميم %", vatPct: "الضريبة %", close: "إغلاق",

    pricesTitle: "قائمة الأسعار", pricesNote: "أسعارك، محفوظة على هذا الجهاز. الميزانية والـ PDF يستخدمانها.",
    wallsPerM2: "الحوائط (للمتر²)", floorsPerM2: "الأرضيات (للمتر²)", furnPerPiece: "الأثاث (للقطعة)",
    resetPrices: "استرجاع الأسعار الأصلية", resetConfirm: "اضغط مرة أخرى لاسترجاع كل الأسعار",

    pdfTitle: "تصدير عرض السعر PDF", client: "اسم العميل", project: "اسم المشروع", notes: "ملاحظات للعميل",
    validity: "مدة صلاحية العرض (أيام)", pdfLang: "لغة الـ PDF", createPdf: "إنشاء PDF",
    pdfTip: "ستفتح نافذة الطباعة: اختر «Save as PDF» أو «حفظ كـ PDF».",
    pdfNoRender: "لم يتم عمل ريندر بعد، فالـ PDF سيستخدم لقطة الـ 3D. اعمل ريندر أولًا لصورة واقعية.",

    pTitle: "عرض تصميم", preparedFor: "مُقدَّم إلى", pProject: "المشروع", pRoom: "الغرفة", pDate: "التاريخ",
    proposed: "التصميم المقترح", concept3d: "تصور ثلاثي الأبعاد", alternatives: "بدائل",
    planCap: "المسقط بالأبعاد", breakdown: "تفاصيل التكلفة",
    item: "البند", qty: "الكمية", unitPrice: "سعر الوحدة", amount: "القيمة", pNotes: "ملاحظات",
    valid: "هذا العرض سارٍ لمدة {d} يومًا من تاريخه.",
    visual: "الصور تصوّر مبدئي للتصميم، وقد تختلف التشطيبات والأثاث النهائية اختلافًا بسيطًا.",
    signClient: "توقيع العميل", signDesigner: "توقيع المصمم", yourStudio: "اسم المكتب",
    // الشاشة الأولى: غرفة جديدة
    newRoom: "غرفة جديدة", newRoomSub: "كيف تريد أن تبدأ؟",
    chooseManual: "سأبني الغرفة بنفسي", chooseManualSub: "اكتب المقاسات، ثم ضع الأبواب والشبابيك.",
    choosePhotos: "لدي صور للغرفة", choosePhotosSub: "ارفع الصور واكتب المقاسات، وسيحدد الـ AI الأبواب والشبابيك.",
    continueLast: "أكمل آخر غرفة", backChoice: "رجوع", startDesign: "ابدأ التصميم",
    shapeTitle: "شكل الغرفة", shapeRect: "مستطيل", shapeL: "حرف L",
    lengthCm: "الطول", widthCm: "العرض", heightCm: "ارتفاع السقف", cutLength: "طول الجزء المقطوع", cutWidth: "عرض الجزء المقطوع",
    cutCorner: "مكان الجزء المقطوع", corner_nw: "أعلى الشمال", corner_ne: "أعلى اليمين", corner_se: "أسفل اليمين", corner_sw: "أسفل الشمال",
    wallsTitle: "الحوائط", openingsTitle: "الأبواب والشبابيك", addDoor: "إضافة باب", addWindow: "إضافة شباك",
    door1: "باب", window1: "شباك", onWall: "الحائط", fromCorner: "من الركن", oWidth: "العرض", oHeight: "الارتفاع", oSill: "من الأرض",
    remove: "حذف", foundByAI: "حدده الـ AI", noOpenings: "لا توجد أبواب أو شبابيك بعد.",
    previewHint: "اسحب الأبواب والشبابيك على حائطها.",
    errBeyondWall: "أطول من الحائط", errTooTall: "أعلى من السقف", errOverlap: "متداخل مع باب أو شباك آخر",
    errTooSmall: "أقل من 30 سم", err_tooSmall: "يجب أن يكون كل ضلع 100 سم على الأقل", err_cutTooBig: "يجب أن يكون الجزء المقطوع أصغر من الغرفة",
    err_tooLow: "يجب أن يكون السقف 200 سم على الأقل",
    photosTitle: "صور الغرفة", photosHint: "صورة لكل حائط تُظهر الحائط كاملًا. اختر الحائط لكل صورة، أو اختر صورة ثم اضغط على حائطها في المعاينة.",
    addPhotos: "إضافة صور", whichWall: "الحائط…", removePhoto: "حذف", analyze: "حدد الأبواب والشبابيك",
    analyzing: "صورة {i} من {n}…", analyzeDone: "تم العثور على {n} من الأبواب والشبابيك. راجعها بالأسفل وصحّح أي خطأ.",
    analyzeNone: "لم يتم العثور على أبواب أو شبابيك. أضفها يدويًا بالأسفل.", untagged: "تم تخطي {n} صورة بدون حائط.",
    tooMany: "الحد 8 صور لكل غرفة: لم تُضف {n}.", droppedPieces: "{n} قطعة من الغرفة المحفوظة لم تعد في المكتبة وتم استبعادها.", needTag: "اختر الحائط لكل صورة أولًا.",
    analysisOff: "تحليل الصور غير مُفعّل: أضف CF_ACCOUNT_ID و CF_API_TOKEN في ملف .env وأعد تشغيل السيرفر."
  }
};

const KEY = "rp_studio_lang";
let lang = (() => { try { return localStorage.getItem(KEY) === "ar" ? "ar" : "en"; } catch { return "en"; } })();
const listeners = [];

export const getLang = () => lang;

// t("key") in the interface language, or in `l` when given. {name}-style placeholders are filled from `vars`.
export function t(key, vars, l = lang){
  const s = STR[l][key] ?? STR.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "") : s;
}

// Display name of a catalog entry (finish or piece). Models from public/models only have an English name.
export const nameOf = (o, l = lang) => (l === "ar" && o.ar) || o.name;

// Fill every tagged element in the page and set the direction.
export function applyStatic(){
  const root = document.documentElement;
  root.lang = lang; root.dir = lang === "ar" ? "rtl" : "ltr";
  document.title = t("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-alt]").forEach(el => { el.alt = t(el.dataset.i18nAlt); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
}

export function setLang(l){
  lang = l === "ar" ? "ar" : "en";
  try { localStorage.setItem(KEY, lang); } catch { /* private window: the choice lasts until reload */ }
  applyStatic();
  listeners.forEach(fn => fn());
}

// Run `fn` after every language change (to redraw JS-built text).
export const onLangChange = (fn) => listeners.push(fn);
