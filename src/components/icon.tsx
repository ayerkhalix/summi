import type { CSSProperties } from "react";
type IconName =
  | "arrow"
  | "plus"
  | "join"
  | "sound"
  | "mute"
  | "settings"
  | "close"
  | "check"
  | "copy"
  | "eye"
  | "users"
  | "help"
  | "leave"
  | "wifi"
  | "crown"
  | "shuffle";
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  const shapes: Record<IconName, React.ReactNode> = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    join: (
      <>
        <path d="M14 4h5v16h-5M3 12h12m-5-5 5 5-5 5" />
      </>
    ),
    sound: (
      <>
        <path d="m11 5-6 4H2v6h3l6 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="m11 5-6 4H2v6h3l6 4ZM16 9l6 6m0-6-6 6" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="8" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 20v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 8a2.5 2.5 0 1 1 3 3.5c-.5.3-.5 1-.5 1.5M12 17h.01" />
      </>
    ),
    leave: (
      <>
        <path d="M10 4H4v16h6m3-13 5 5-5 5m-5-5h10" />
      </>
    ),
    wifi: (
      <>
        <path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0M12 20h.01" />
      </>
    ),
    crown: (
      <>
        <path d="m3 6 5 4 4-7 4 7 5-4-2 12H5ZM6 21h12" />
      </>
    ),
    shuffle: (
      <>
        <path d="M3 6h3c6 0 6 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {shapes[name]}
    </svg>
  );
}
