// A number box that commits on the browser's "change" event (Enter, leaving the box, or the arrows),
// not on every keystroke like React's onChange. It shows `value` again whenever that changes.
import { useEffect, useRef, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | string;
  onCommit: (value: string, input: HTMLInputElement) => void;
};

export default function NumField({value, onCommit, ...rest}: Props){
  const ref = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const el = ref.current!;
    const fn = () => commit.current(el.value, el);
    el.addEventListener("change", fn);
    return () => el.removeEventListener("change", fn);
  }, []);
  // Show the current value unless the designer is typing in this box.
  useEffect(() => {
    const el = ref.current!;
    if (document.activeElement !== el) el.value = String(value);
  }, [value]);
  return <input ref={ref} type="number" defaultValue={value} {...rest}/>;
}
