/**
 * The Atlas route/waypoint mark as inline SVG.
 *
 * Two uses:
 *  - logo: compact mark next to the wordmark;
 *  - decorative motif: larger structural element on landing surfaces.
 *
 * The soft gap before the destination node is intentional brand: uncertainty
 * is part of the map, never faked as certainty.
 */

const PAPER = "#f5f2ea";
const LIME = "#a8d139";

export function RouteMark({
  size = 28,
  title = "Atlas",
  className,
}: {
  size?: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect x="0" y="0" width="64" height="64" rx="14" fill="#17191e" />
      {/* route: solid W1 -> W2 -> W3 */}
      <path
        d="M13 49 L29 35 L38 30"
        stroke={PAPER}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="13" cy="49" r="3" fill={PAPER} />
      <circle cx="29" cy="35" r="3" fill={PAPER} />
      {/* current position: ring */}
      <circle cx="38" cy="30" r="4" fill="#17191e" stroke={PAPER} strokeWidth="3" />
      {/* soft gap: dashed uncertainty segment */}
      <path
        d="M44 26 L50 21"
        stroke={PAPER}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="5 6"
        fill="none"
      />
      {/* destination: lime node */}
      <circle cx="52" cy="18" r="6" fill={LIME} stroke={PAPER} strokeWidth="2.5" />
    </svg>
  );
}
