import { cn } from '../lib/cn.js';

/** Symbole Scolaly : carré indigo évidé de deux petits carrés, qui évoque un QR code. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" className={cn('size-[26px]', className)} aria-hidden="true">
      <rect width="26" height="26" rx="8" fill="var(--accent)" />
      <rect x="6" y="6" width="8" height="8" rx="2.5" fill="var(--surface)" />
      <rect x="15" y="15" width="5" height="5" rx="1.5" fill="var(--surface)" />
    </svg>
  );
}

/** Logotype « scolaly » en minuscules, avec son symbole. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-fg', className)}>
      <LogoMark />
      <span className="text-[19px] font-[650] tracking-[-0.04em]">scolaly</span>
    </span>
  );
}
