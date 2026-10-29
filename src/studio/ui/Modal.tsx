// A dialog over a dimmed backdrop. Clicking the backdrop or pressing Escape closes it;
// the first field (or button) gets the focus when it opens.
import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;   // the sheet's class: "sheet3", "sheet3 wide", "sheet2", "authcard"
  children: ReactNode;
};

export default function Modal({open, onClose, labelledBy, className = "sheet3", children}: Props){
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape"){ e.stopPropagation(); close.current(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={sheet} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  );
}
