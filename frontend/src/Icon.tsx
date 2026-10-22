import type { CSSProperties } from 'react'
// Local SVG shapes avoid external icon/font requests; keys constrain the component's name prop.
const paths = {
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" />
      <circle cx="9" cy="7" r="4" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18M8 16v-5M13 16V7M18 16v-8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M12 3v12m-5-5 5 5 5-5" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M12 16V3m-5 5 5-5 5 5" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2" />
    </>
  ),
  edit: (
    <>
      <path d="m16 3 5 5L9 20H4v-5Zm-2 2 5 5" />
    </>
  ),
  archive: (
    <>
      <path d="M4 8v12h16V8M9 12h6" />
      <rect x="2" y="3" width="20" height="5" rx="1" />
    </>
  ),
  restore: (
    <>
      <path d="M3 10a9 9 0 1 1 2 8M3 3v7h7M12 7v10m-4-6 4-4 4 4" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9ZM14 2v7h7M7 13h10M7 17h7" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 3v6h-6M3 21v-6h6M20 9a8 8 0 0 0-13.8-5M4 15a8 8 0 0 0 13.8 5" />
    </>
  ),
} as const
/** Decorative icon only: the surrounding button/text must supply its accessible label.
 * currentColor inherits interaction/disabled colors; size is in CSS pixels.
 */
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: keyof typeof paths
  size?: number
  style?: CSSProperties
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {paths[name]}
    </svg>
  )
}
