// A button that opens a small floating panel: a menu of actions, or a popover of settings.
// Closes on a click outside, on Escape (focus returns to the button) and, for menus, after an item is chosen.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Props = {
  label: string;                 // the button's accessible name (and its text unless `face` is given)
  face?: ReactNode;              // what the button shows instead of the label (an icon, an avatar)
  className?: string;
  align?: "start" | "end";       // which edge of the button the panel lines up with
  kind?: "menu" | "popover";
  children: (close: () => void) => ReactNode;
};

export default function Menu({label, face, className = "btn", align = "end", kind = "menu", children}: Props){
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape"){ e.stopPropagation(); setOpen(false); btn.current?.focus(); return; }
      if (kind !== "menu" || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
      // Arrow keys walk the menu's items.
      const items = [...panel.current!.querySelectorAll<HTMLElement>("[role=menuitem]")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      e.preventDefault();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    panel.current?.querySelector<HTMLElement>(kind === "menu" ? "[role=menuitem]" : "select, input, button")?.focus();
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open, kind]);

  return (
    <div className="menu" ref={box}>
      <button ref={btn} className={className + (open ? " open" : "")} type="button" aria-haspopup={kind === "menu" ? "menu" : "dialog"}
        aria-expanded={open} aria-controls={id} aria-label={face ? label : undefined} title={face ? label : undefined}
        onClick={() => setOpen(o => !o)}>
        {face ?? label}
      </button>
      {open && (
        <div ref={panel} id={id} className={"menupanel " + align + (kind === "popover" ? " pop" : "")}
          role={kind === "menu" ? "menu" : "dialog"} aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

// One action inside a menu.
export function MenuItem({icon, label, hint, danger, disabled, onClick}: {icon?: ReactNode, label: string, hint?: string, danger?: boolean, disabled?: boolean, onClick: () => void}){
  return (
    <button className={"menuitem" + (danger ? " danger" : "")} type="button" role="menuitem" disabled={disabled} onClick={onClick}>
      {icon}<span>{label}</span>{hint && <small>{hint}</small>}
    </button>
  );
}
