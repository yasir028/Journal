import React from 'react';

interface MindfulLogoProps {
  size?: number;
  showText?: boolean;
  showTagline?: boolean;
  className?: string;
}

const MindfulLogo: React.FC<MindfulLogoProps> = ({ size = 32, showText = false, showTagline = false, className = '' }) => {
  const id = React.useId().replace(/:/g, '_');
  const g = `url(#g${id})`;

  /*
   * M icon (viewBox 0 0 60 60) — matches reference logo structure:
   *
   *   Left leg  gap  Left wing     V space        Right wing  gap  Right leg
   *   x=0..9   4px   x=13..20top  x=20..40 top   x=40..47top  4px  x=51..60
   *                  x=15..22bot  x=22..38 bot   x=38..45bot
   *
   *   Wings converge toward centre over their height (y=0..48).
   *   3 ascending bars sit in the V space, all bottom-aligned at y=60.
   *
   *   Bar1 (short):  x=22, top=y48, h=12  → 20% height
   *   Bar2 (medium): x=27.5, top=y40, h=20 → 33%
   *   Bar3 (tall):   x=33, top=y32, h=28  → 47%
   *
   *   The 4px gap between each outer leg and its adjacent wing creates the
   *   clear separation visible in the reference logo.
   */

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stopColor="#1e3a8a" />
            <stop offset="55%"  stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#93c5fd" />
          </linearGradient>
        </defs>

        {/* Left outer vertical leg — full height */}
        <rect x="0" y="0" width="9" height="60" rx="2" fill={g} />

        {/* Left inner diagonal wing — 4px gap from leg, 7px wide, converges inward */}
        <polygon points="13,0 20,0 22,48 15,48" fill={g} />

        {/* Right inner diagonal wing — symmetric */}
        <polygon points="40,0 47,0 45,48 38,48" fill={g} />

        {/* Right outer vertical leg — full height */}
        <rect x="51" y="0" width="9" height="60" rx="2" fill={g} />

        {/* Bar 1 — shortest, aligns with wing bottoms */}
        <rect x="22" y="48" width="4.5" height="12" rx="1.5" fill={g} />

        {/* Bar 2 — medium */}
        <rect x="27.5" y="40" width="4.5" height="20" rx="1.5" fill={g} />

        {/* Bar 3 — tallest, rises into the V space */}
        <rect x="33" y="32" width="4.5" height="28" rx="1.5" fill={g} />

      </svg>

      {(showText || showTagline) && (
        <div className="flex flex-col">
          {showText && (
            <span className="font-bold text-xl tracking-[0.2em] text-text leading-none">
              MINDFUL
            </span>
          )}
          {showTagline && (
            <span style={{ color: 'var(--primary)' }} className="text-[0.58rem] tracking-[0.15em] mt-0.5">
              TRACK. ANALYZE. MASTER.
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default MindfulLogo;
