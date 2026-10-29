// Reading sizes written on floor plans: feet-and-inches, metres, centimetres, millimetres -> whole centimetres.
// A number without a unit is not a length (null), so a room number or a stray digit is never taken as a size.

const FT = 30.48, IN = 2.54;

// Typographic marks to plain ' and ".
const norm = (s) => String(s ?? "")
  .replace(/[′’‘`´]/g, "'")
  .replace(/[″”“]/g, '"')
  .replace(/''/g, '"')
  .trim();

const FEET = /^(\d+(?:\.\d+)?)\s*'\s*(?:-?\s*(\d+(?:\.\d+)?)\s*"?)?$/;   // 12'  12'-6"  12' 6"  12'6
const INCH = /^(\d+(?:\.\d+)?)\s*"$/;                                    // 30"
const METRIC = /^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/i;

// One length -> cm (rounded), or null.
export function parseLength(text){
  const s = norm(text);
  if (!s) return null;
  let m = s.match(FEET);
  if (m) return Math.round(parseFloat(m[1]) * FT + (m[2] ? parseFloat(m[2]) * IN : 0));
  m = s.match(INCH);
  if (m) return Math.round(parseFloat(m[1]) * IN);
  m = s.match(METRIC);
  if (m){
    const v = parseFloat(m[1].replace(",", ".")), u = m[2].toLowerCase();
    return Math.round(u === "m" ? v * 100 : u === "cm" ? v : v / 10);
  }
  return null;
}

// "12'-0\" X 29'-10\"", "3.5 x 4 m", "350x400cm" -> [cm, cm], or null.
// A unit written only after the second number applies to both.
export function parseRoomSize(text){
  const s = norm(text);
  if (!s) return null;
  const parts = s.split(/\s*[x×*]\s*/i);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let a = parseLength(parts[0]);
  const b = parseLength(parts[1]);
  if (a == null && b != null && /^\d+(?:[.,]\d+)?$/.test(parts[0])){
    const unit = parts[1].match(/(mm|cm|m)$/i);
    if (unit) a = parseLength(parts[0] + unit[1]);
  }
  return a != null && b != null ? [a, b] : null;
}
