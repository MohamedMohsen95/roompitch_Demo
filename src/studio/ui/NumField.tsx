// A number box that commits on the browser's "change" event (Enter, leaving the box, or the arrows),
// not on every keystroke like React's onChange. It shows `value` again whenever that changes.
// With `fit`, the box sizes itself to the number (CSS reads --chars), growing as the designer types.
import { useEffect, useRef, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | string;
  fit?: boolean;
  onCommit: (value: string, input: HTMLInputElement) => void;
};

export default function NumField({value, onCommit, fit, ...rest}: Props){
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current!;
    const fn = () => commit.current(el.value, el);
    const size = () => { if (fit) el.style.setProperty("--chars", String(Math.max(1, el.value.length))); };
    el.addEventListener("change", fn);
    el.addEventListener("input", size);
    return () => { el.removeEventListener("change", fn); el.removeEventListener("input", size); };
  }, []);
  // Show the current value unless the designer is typing in this box.
  useEffect(() => {
    const el = ref.current!;
    if (document.activeElement !== el) el.value = String(value);
    if (fit) el.style.setProperty("--chars", String(Math.max(1, el.value.length)));
  }, [value]);
  return <input ref={ref} type="number" defaultValue={value} {...rest}/>;
}
