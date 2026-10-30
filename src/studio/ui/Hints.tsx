// How to use a view, in its bottom corner: the first tip with an info icon. Clicking it opens a card listing
// every tip (the hint text's " · "-separated parts), one per line; clicking again (or Escape) closes it.
import { useId, useState } from "react";
import { t } from "../i18n.js";
import { IconInfo } from "./Icons";

export default function Hints({text}: {text: string}){
  const [open, setOpen] = useState(false);
  const id = useId(), tips = text.split(" · ");
  return (
    <div className={"hints" + (open ? " open" : "")} onKeyDown={e => { if (e.key === "Escape" && open){ e.stopPropagation(); setOpen(false); } }}>
      {open && <ul id={id}>{tips.map(tip => <li key={tip}>{tip}</li>)}</ul>}
      <button type="button" aria-expanded={open} aria-controls={open ? id : undefined} title={t(open ? "hideTips" : "showTips")}
        onClick={() => setOpen(!open)}>
        <IconInfo/><span>{open ? t("hideTips") : tips[0]}</span>
      </button>
    </div>
  );
}
