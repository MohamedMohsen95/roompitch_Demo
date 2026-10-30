// The studio's icons: one outline set, 16px on a 16px grid, 1.5px stroke, in the text colour.
import type { ReactNode } from "react";

const I = ({children, size = 16}: {children: ReactNode, size?: number}) => (
  <svg className="ico" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const IconBack = () => <I><path d="M10 3 5 8l5 5"/></I>;
export const IconMaximize = () => <I><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/></I>;
export const IconRestore = () => <I><path d="M13.5 6.5h-4v-4M9.5 6.5l4-4M2.5 9.5h4v4M6.5 9.5l-4 4"/></I>;
export const IconAlignLeft = () => <I><path d="M2.5 2v12M5 4h8v3H5zM5 9.5h5v3H5z"/></I>;
export const IconAlignHCenter = () => <I><path d="M8 2v2M8 7v2.5M8 12.5V14M4 4h8v3H4zM5.5 9.5h5v3h-5z"/></I>;
export const IconAlignRight = () => <I><path d="M13.5 2v12M3 4h8v3H3zM6 9.5h5v3H6z"/></I>;
export const IconAlignTop = () => <I><path d="M2 2.5h12M4 5h3v8H4zM9.5 5h3v5h-3z"/></I>;
export const IconAlignVCenter = () => <I><path d="M2 8h2M7 8h2.5M12.5 8H14M4 4h3v8H4zM9.5 5.5h3v5h-3z"/></I>;
export const IconAlignBottom = () => <I><path d="M2 13.5h12M4 3h3v8H4zM9.5 6h3v5h-3z"/></I>;
export const IconChevron = () => <I><path d="m4 6 4 4 4-4"/></I>;
export const IconMore = () => <I><circle cx="3.5" cy="8" r=".6" fill="currentColor"/><circle cx="8" cy="8" r=".6" fill="currentColor"/><circle cx="12.5" cy="8" r=".6" fill="currentColor"/></I>;
export const IconRoom = () => <I><path d="M2.5 2.5h11v11h-11z"/><path d="M2.5 9.5h4v4M9.5 2.5v3"/></I>;
export const IconSettings = () => <I><circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/></I>;
export const IconTag = () => <I><path d="M2.5 2.5h5l6 6-5 5-6-6z"/><circle cx="5.5" cy="5.5" r=".8" fill="currentColor"/></I>;
export const IconGlobe = () => <I><circle cx="8" cy="8" r="5.8"/><path d="M2.2 8h11.6M8 2.2c1.7 1.6 2.5 3.6 2.5 5.8S9.7 12.2 8 13.8C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2.2z"/></I>;
export const IconUser = () => <I><circle cx="8" cy="5.5" r="2.7"/><path d="M2.8 13.6c.8-2.3 2.8-3.6 5.2-3.6s4.4 1.3 5.2 3.6"/></I>;
export const IconFile = () => <I><path d="M4 1.8h5l3 3v9.4H4z"/><path d="M9 1.8v3h3M6 9h4M6 11.5h4"/></I>;
export const IconSun = () => <I><circle cx="8" cy="8" r="2.6"/><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/></I>;
export const IconUpload = () => <I><path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10.5v3h11v-3"/></I>;
export const IconRotate = () => <I><path d="M12.8 6.2A5 5 0 1 0 13 9.5"/><path d="M13.2 2.8v3.6H9.6"/></I>;   // clockwise
export const IconRotateCcw = () => <I><path d="M3.2 6.2A5 5 0 1 1 3 9.5"/><path d="M2.8 2.8v3.6h3.6"/></I>;
export const IconInfo = () => <I><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.8M8 5v.01"/></I>;
export const IconFocus =() => <I><path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/><circle cx="8" cy="8" r="2"/></I>;
export const IconLock = () => <I><path d="M3.5 7.5h9v6h-9z"/><path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5"/></I>;
export const IconUnlock = () => <I><path d="M3.5 7.5h9v6h-9z"/><path d="M5.5 7.5V5a2.5 2.5 0 0 1 4.9-.7"/></I>;
export const IconCopy =() => <I><path d="M5.5 5.5h8v8h-8z"/><path d="M10.5 5.5v-3h-8v8h3"/></I>;
export const IconTrash = () => <I><path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9"/></I>;
export const IconEdit = () => <I><path d="M10.5 3l2.5 2.5L6 12.5H3.5V10z"/></I>;
export const IconSwap = () => <I><path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5"/></I>;
export const IconCenter = () => <I><path d="M8 2v12M3 5.5h10v5H3z"/></I>;
export const IconWalk = () => <I><circle cx="9.2" cy="2.6" r="1.2"/><path d="M5 7.2l2.6-1.8 1.8.3 1.2 2.3 1.9.8"/><path d="M8.6 5.6 7.4 10l-2.4 3.5"/><path d="M7.4 10l2.3 1.4.6 2.6"/></I>;
export const IconHand = () => <I><path d="M5.5 8.5V3.8a1 1 0 0 1 2 0v3.7M7.5 7V2.8a1 1 0 0 1 2 0V7M9.5 7.2V3.8a1 1 0 0 1 2 0v5.4c0 2.6-1.6 4.3-4 4.3-1.7 0-2.6-.8-3.5-2.1L2.6 9.1a1 1 0 0 1 1.6-1.2l1.3 1.4"/></I>;
export const IconSound = () => <I><path d="M2.5 6v4h2.5L8.5 13V3L5 6z"/><path d="M11 5.8a3 3 0 0 1 0 4.4M12.8 4a5.5 5.5 0 0 1 0 8"/></I>;
export const IconMuted = () => <I><path d="M2.5 6v4h2.5L8.5 13V3L5 6z"/><path d="M11 6l3 4M14 6l-3 4"/></I>;
export const IconClose = () => <I><path d="M4 4l8 8M12 4l-8 8"/></I>;
export const IconArrowRight = () => <I><path d="M3 8h10M9 4l4 4-4 4"/></I>;
export const IconSelect = () => <I><path d="M3 2.5l9 4.2-3.9 1.4L6.7 12z"/></I>;
