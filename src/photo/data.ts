// The photo page's fixed data: styles, room types, the furniture catalog and the sample price list.
export type Named = {en: string, ar: string};
export type Style = Named & {id: string, tint: string, prompt: string};
export type Furniture = Named & {id: string, price: number, icon: string};
export type PriceItem = Named & {id: string, unit: string, price: number};
export type RoomDims = {L: number, W: number, H: number};

// Each style: label in both languages, the description sent to the AI,
// and a tint used only in demo mode.
export const STYLES: Style[] = [
  { id: "modern", en: "Modern", ar: "مودرن", tint: "#c9c3b8",
    prompt: "modern contemporary interior, clean lines, flat-panel joinery, warm neutral palette, matte finishes, concealed linear lighting, large-format porcelain floor" },
  { id: "japandi", en: "Japandi", ar: "جاباندي", tint: "#c8b59a",
    prompt: "Japandi interior, light oak wood, natural linen, low-profile furniture, muted earthy tones, paper lantern lighting, minimal calm decor" },
  { id: "neoclassic", en: "Neoclassic", ar: "نيوكلاسيك", tint: "#e2d3b5",
    prompt: "neoclassic luxury interior, wall moldings and panelling, cornice ceiling, cream and gold accents, marble floor, crystal chandelier, elegant upholstered furniture" },
  { id: "classic", en: "Classic", ar: "كلاسيك", tint: "#b08d5b",
    prompt: "classic traditional interior, carved wood furniture, rich fabrics, ornate ceiling details, warm lighting, patterned rug" },
  { id: "arabic", en: "Arabic Contemporary", ar: "عربي معاصر", tint: "#b98a5e",
    prompt: "contemporary Arabic interior, mashrabiya patterned screens, arches, warm sand and terracotta tones, brass details, low majlis-style seating, geometric patterns" },
  { id: "industrial", en: "Industrial", ar: "إندستريال", tint: "#7a756e",
    prompt: "industrial interior, exposed concrete, black steel frames, leather and reclaimed wood, Edison bulb pendants, polished concrete floor" },
  { id: "scandi", en: "Scandinavian", ar: "إسكندنافي", tint: "#e6e4df",
    prompt: "Scandinavian interior, white walls, pale wood floor, cozy textiles, simple functional furniture, soft daylight, plants" },
  { id: "minimal", en: "Minimalist", ar: "مينيمال", tint: "#efece6",
    prompt: "minimalist interior, very few pieces, monochrome warm white palette, hidden storage, seamless surfaces, soft indirect lighting" }
];

export const PRESERVE: Record<string, string> = {
  strict: "Keep the exact same camera angle, perspective, room dimensions, wall positions, window and door openings and ceiling height. Do not move or add walls, windows or doors.",
  balanced: "Keep the walls, windows and doors in the same positions and the same camera angle. You may redesign the ceiling, lighting and furniture layout.",
  creative: "Keep the same camera angle and the general shape of the room. You may freely redesign ceilings, add built-in joinery and architectural features."
};

export const ROOMS: (Named & {id: string})[] = [
  { id: "living", en: "Living room", ar: "ليفينج" },
  { id: "majlis", en: "Majlis", ar: "مجلس" },
  { id: "bedroom", en: "Bedroom", ar: "غرفة نوم" },
  { id: "dining", en: "Dining room", ar: "سفرة" },
  { id: "office", en: "Office", ar: "مكتب" },
  { id: "kitchen", en: "Kitchen", ar: "مطبخ" }
];

// Furniture "buy the look" catalog — draggable onto the room photo.
// Priced separately from the renovation budget above; each icon is a generic schematic glyph.
export const FURNITURE: Furniture[] = [
  { id: "sofa", en: "Sofa", ar: "كنبة", price: 1200,
    icon: '<path d="M5 11V9a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3 11h18v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 17v2M20 17v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: "armchair", en: "Armchair", ar: "كرسي فوتيه", price: 450,
    icon: '<path d="M6 10V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4 10h2v7H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Zm16 0h-2v7h2a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 10h12v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M5 17v2M19 17v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: "ctable", en: "Coffee table", ar: "ترابيزة وسط", price: 300,
    icon: '<rect x="3" y="8" width="18" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 11v8M19 11v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: "lamp", en: "Floor lamp", ar: "لامبة أرضية", price: 180,
    icon: '<path d="M12 7V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 3h8l2 4H6l2-4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 21h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: "rug", en: "Rug", ar: "سجادة", price: 350,
    icon: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="6" y="9" width="12" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>' },
  { id: "plant", en: "Plant", ar: "نبات", price: 120,
    icon: '<path d="M9 14h6l-1 7H10l-1-7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 14c0-4 3-5 5-7-4 0-6 2-6.5 5M12 14c0-5-3-6-5-8 4 0 6.5 2.5 7 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: "art", en: "Wall art", ar: "لوحة", price: 220,
    icon: '<rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 15l3.5-5 3 3.5L17 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="8" r="1.3" fill="currentColor"/>' },
  { id: "dtable", en: "Dining table", ar: "ترابيزة سفرة", price: 900,
    icon: '<rect x="2" y="9" width="20" height="2.6" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 11.6v7M19 11.6v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: "bed", en: "Bed", ar: "سرير", price: 1100,
    icon: '<path d="M3 20v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M3 17h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="5" y="12" width="5" height="3" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 11V6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' },
  { id: "wardrobe", en: "Wardrobe", ar: "دولاب", price: 1500,
    icon: '<rect x="5" y="3" width="14" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v18" stroke="currentColor" stroke-width="1.6"/><circle cx="10.4" cy="12" r="0.9" fill="currentColor"/><circle cx="13.6" cy="12" r="0.9" fill="currentColor"/>' }
];

// Units: m2floor / m2wall / m2ceiling are calculated from the room size.
// pc (piece) and lm (linear metre) quantities come from the room type below.
export const DEFAULT_PRICES: PriceItem[] = [
  { id: "floor",    en: "Flooring (porcelain / parquet)", ar: "أرضيات (بورسلين / باركيه)", unit: "m2floor",   price: 45 },
  { id: "paint",    en: "Wall paint incl. putty",         ar: "دهانات الحوائط شامل المعجون", unit: "m2wall",   price: 8 },
  { id: "ceiling",  en: "Gypsum ceiling + paint",         ar: "سقف جبس بورد + دهان",       unit: "m2ceiling", price: 30 },
  { id: "lighting", en: "Lighting points & fixtures",     ar: "نقاط وإضاءات",              unit: "pc", price: 40 },
  { id: "curtains", en: "Curtains (per window)",          ar: "ستائر (لكل شباك)",          unit: "pc", price: 250 },
  { id: "sofa",     en: "Sofa",                           ar: "كنبة",                      unit: "pc", price: 1200 },
  { id: "armchair", en: "Armchair",                       ar: "كرسي فوتيه",                unit: "pc", price: 450 },
  { id: "ctable",   en: "Coffee table",                   ar: "ترابيزة وسط",               unit: "pc", price: 300 },
  { id: "tvunit",   en: "TV unit",                        ar: "وحدة تلفزيون",              unit: "pc", price: 600 },
  { id: "rug",      en: "Rug",                            ar: "سجادة",                     unit: "pc", price: 350 },
  { id: "majlis",   en: "Majlis seating",                 ar: "جلسة مجلس",                 unit: "lm", price: 400 },
  { id: "bed",      en: "Bed",                            ar: "سرير",                      unit: "pc", price: 1100 },
  { id: "wardrobe", en: "Wardrobe",                       ar: "دولاب",                     unit: "pc", price: 1500 },
  { id: "nstand",   en: "Nightstand",                     ar: "كومودينو",                  unit: "pc", price: 200 },
  { id: "dtable",   en: "Dining table",                   ar: "ترابيزة سفرة",              unit: "pc", price: 900 },
  { id: "dchair",   en: "Dining chair",                   ar: "كرسي سفرة",                 unit: "pc", price: 150 },
  { id: "desk",     en: "Desk",                           ar: "مكتب",                      unit: "pc", price: 500 },
  { id: "ochair",   en: "Office chair",                   ar: "كرسي مكتب",                 unit: "pc", price: 300 },
  { id: "cabinets", en: "Kitchen cabinets",               ar: "دواليب مطبخ",               unit: "lm", price: 350 },
  { id: "decor",    en: "Decor & accessories package",    ar: "باقة ديكور وإكسسوارات",     unit: "pc", price: 400 }
];

// Default quantities for each room type. Functions receive the room size.
export const ROOM_ITEMS: Record<string, Record<string, number | ((d: RoomDims) => number)>> = {
  living:  { lighting: 6, curtains: 2, sofa: 1, armchair: 2, ctable: 1, tvunit: 1, rug: 1, decor: 1 },
  majlis:  { lighting: 8, curtains: 2, majlis: d => Math.round(2 * (d.L + d.W) * 0.6), ctable: 2, rug: 2, decor: 1 },
  bedroom: { lighting: 4, curtains: 1, bed: 1, wardrobe: 1, nstand: 2, rug: 1, decor: 1 },
  dining:  { lighting: 4, curtains: 1, dtable: 1, dchair: 6, rug: 1, decor: 1 },
  office:  { lighting: 4, curtains: 1, desk: 1, ochair: 1, armchair: 1, decor: 1 },
  kitchen: { lighting: 6, cabinets: d => Math.round((d.L + d.W) * 10) / 10 }
};

export const FINISH_MULT: Record<string, number> = { economy: 0.8, standard: 1, premium: 1.5 };
export const CURRENCIES = ["USD", "SAR", "AED", "QAR", "KWD", "BHD", "OMR", "EGP", "EUR", "GBP"];
export const MAX_SIDE = 1280; // photos are resized to this before sending to the AI
