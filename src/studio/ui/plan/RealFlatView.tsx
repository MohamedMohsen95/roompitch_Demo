// The real flat drawn from above, in metres: walls, doors and windows, names and sizes. On the plan screen it
// shows what changed from the tracing (orange, with the tracing's place dashed) and rooms that overlap; on the
// flat screen and the room map it is where you pick a room.
import { t } from "../../i18n.js";
import { orientCW } from "../../plan/flat.js";
import { realOf, realDiff, realOverlaps } from "../../plan/real.js";
import { roomBox } from "../../plan/correct.js";
import type { Flat } from "../../plan/flat";
import type { Point } from "../../types";

type Props = {
  flat: Flat;
  highlight?: string | null;
  diff?: boolean;                     // orange = changed from the tracing, dashed = the tracing's place
  status?: boolean;                   // colour rooms by their design status
  compact?: boolean;                  // no names or sizes (the small map)
  onPick?: (id: string) => void;
};

const pts = (o: Point[]) => o.map(p => p.join(",")).join(" ");
const centre = (o: Point[]): Point => {
  const xs = o.map(p => p[0]), ys = o.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};

export default function RealFlatView({flat, highlight = null, diff = false, status = false, compact = false, onPick}: Props){
  const real = realOf(flat);
  if (!real.spaces.length) return <p className="dnote">{t("realEmpty")}</p>;
  const all = real.spaces.flatMap(s => s.poly);
  const x0 = Math.min(...all.map(p => p[0])) - 0.3, y0 = Math.min(...all.map(p => p[1])) - 0.3;
  const w = Math.max(...all.map(p => p[0])) + 0.3 - x0, h = Math.max(...all.map(p => p[1])) + 0.3 - y0;
  const fs = Math.max(w, h) / (compact ? 30 : 45);
  const changed = diff ? realDiff(flat) : new Set<string>();
  const over = diff ? new Set(realOverlaps(flat).flat()) : new Set<string>();
  const byId = new Map(flat.spaces.map(s => [s.id, s]));
  return (
    <svg className={"realplan" + (compact ? " compact" : "")} viewBox={`${x0} ${y0} ${w} ${h}`} role="img" aria-label={t("realFlat")}>
      {real.spaces.map(r => {
        const s = byId.get(r.id), b = roomBox(flat, r.id), c = centre(r.poly);
        const cls = ["rroom", status && s ? "st-" + s.status : "", changed.has(r.id) ? "changed" : "", over.has(r.id) ? "over" : "", highlight === r.id ? "on" : ""].filter(Boolean).join(" ");
        const pick = onPick ? () => onPick(r.id) : undefined;
        return (
          <g key={r.id} className={cls} onClick={pick} role={pick ? "button" : undefined} tabIndex={pick ? 0 : undefined}
            aria-label={pick ? s?.name || t("spaceN", {n:1}) : undefined}
            onKeyDown={pick ? (e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); pick(); } }) : undefined}>
            <polygon points={pts(r.poly)} strokeWidth={0.15}/>
            {!compact && (
              <text x={c[0]} y={c[1]} fontSize={fs} textAnchor="middle">
                <tspan x={c[0]} dy={-fs * 0.2}>{s?.name || "—"}</tspan>
                {b && <tspan x={c[0]} dy={fs * 1.2} className="rsize">{(b.width / 100).toFixed(2)} × {(b.length / 100).toFixed(2)}</tspan>}
              </text>
            )}
          </g>
        );
      })}
      {diff && flat.scale && [...changed].map(id => {
        const s = byId.get(id);
        if (!s || s.outline.length < 3) return null;
        return <polygon key={"t" + id} className="rtrace" points={pts(orientCW(s.outline).map(p => [p[0] * flat.scale!, p[1] * flat.scale!] as Point))} strokeWidth={0.05}/>;
      })}
      {real.openings.map(o => {
        const type = flat.openings.find(x => x.id === o.id)?.type || "door";
        return <line key={o.id} className={"ropen " + type} x1={o.a[0]} y1={o.a[1]} x2={o.b[0]} y2={o.b[1]} strokeWidth={0.2}/>;
      })}
    </svg>
  );
}
