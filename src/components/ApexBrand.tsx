import React from "react";

type Size = "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, { box: number; mono: number; word: number; tag: number }> = {
  sm: { box: 28, mono: 16, word: 13, tag: 7 },
  md: { box: 38, mono: 22, word: 17, tag: 8 },
  lg: { box: 56, mono: 32, word: 22, tag: 9 },
  xl: { box: 72, mono: 42, word: 28, tag: 10 },
};

interface ApexMarkProps {
  size?: Size;
  className?: string;
  glow?: boolean;
}

export const ApexMark: React.FC<ApexMarkProps> = ({ size = "md", className = "", glow = false }) => {
  const s = SIZES[size];
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center ${className}`}
      style={{
        height: s.box,
        width: s.box,
        borderRadius: Math.round(s.box * 0.22),
        background: "linear-gradient(135deg, rgba(240,192,64,0.20), rgba(74,124,89,0.18))",
        border: "1px solid rgba(240,192,64,0.45)",
        boxShadow: glow
          ? "0 4px 20px rgba(240,192,64,0.35), 0 0 12px rgba(240,192,64,0.18)"
          : "0 0 12px rgba(240,192,64,0.15)",
      }}
      aria-hidden
    >
      <span
        className="font-apex text-gold-accent leading-none"
        style={{ fontSize: s.mono, letterSpacing: "0.02em" }}
      >
        A
      </span>
    </div>
  );
};

interface ApexBrandProps {
  size?: Size;
  showTagline?: boolean;
  taglineHiddenOnMobile?: boolean;
  className?: string;
  glow?: boolean;
  align?: "left" | "center";
}

export const ApexBrand: React.FC<ApexBrandProps> = ({
  size = "md",
  showTagline = true,
  taglineHiddenOnMobile = false,
  className = "",
  glow = false,
  align = "left",
}) => {
  const s = SIZES[size];
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${align === "center" ? "justify-center" : ""} ${className}`}
    >
      <ApexMark size={size} glow={glow} />
      <div className={`flex flex-col leading-none min-w-0 ${align === "center" ? "items-center text-center" : ""}`}>
        <span
          className="font-apex uppercase text-ivory tracking-[0.18em] truncate"
          style={{ fontSize: s.word }}
        >
          Apex Golf Academy
        </span>
        {showTagline && (
          <span
            className={`uppercase tracking-[0.32em] text-ivory/55 mt-1 truncate ${
              taglineHiddenOnMobile ? "hidden sm:block" : ""
            }`}
            style={{ fontSize: s.tag }}
          >
            by Santiago Castilla
          </span>
        )}
      </div>
    </div>
  );
};

export default ApexBrand;
