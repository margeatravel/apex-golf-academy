import React from 'react';

/**
 * Format a number as Mexican Pesos (string version, no MXN suffix).
 * Example: 14850 → "$14,850"
 */
export const fmtMXNStr = (n: number): string =>
  `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/**
 * Format a number as Mexican Pesos with a small MXN suffix (JSX).
 * Example: 14850 → $14,850 MXN (MXN rendered small)
 */
export const fmtMXN = (n: number): React.ReactNode => (
  <>
    {fmtMXNStr(n)}
    <span className="text-[0.55em] opacity-50 ml-0.5 font-normal">MXN</span>
  </>
);
