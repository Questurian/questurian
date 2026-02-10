'use client';

import { BedDouble, Compass, PlaneTakeoff } from 'lucide-react';

const navItems = [
  { label: 'Explore', Icon: Compass },
  { label: 'Stay', Icon: BedDouble },
  { label: 'Move', Icon: PlaneTakeoff },
] as const;

interface SubNavProps {
  className?: string;
  compact?: boolean;
}

export function SubNav({ className = '', compact = false }: SubNavProps) {
  return (
    <nav
      aria-label="Section navigation"
      className={`
        inline-flex items-center rounded-full ${compact ? 'p-0.5' : 'p-1'}
        border border-white/20
        bg-gradient-to-b from-white/16 to-white/6
        shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_20px_rgba(0,0,0,0.22)]
        backdrop-blur-sm
        ${className}
      `}
    >
      {navItems.map(({ label, Icon }, index) => (
        <button
          key={label}
          type="button"
          aria-pressed={index === 0}
          className={`
            inline-flex items-center gap-1.5 rounded-full
            ${compact ? 'h-7 px-3' : 'h-8 px-3.5'}
            uppercase tracking-[0.08em]
            ${compact ? 'text-[0.58rem] 550:text-[0.66rem]' : 'text-[0.62rem] 480:text-[0.68rem] 550:text-[0.73rem]'}
            font-semibold transition-all duration-200
            ${
              index === 0
                ? 'bg-white text-[#1f2226] shadow-[0_2px_10px_rgba(0,0,0,0.25)]'
                : 'text-white/85 hover:bg-white/12 hover:text-white'
            }
          `}
        >
          <Icon
            className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} ${index === 0 ? 'text-[#1f2226]' : 'text-white/75'}`}
          />
          {label}
        </button>
      ))}
    </nav>
  );
}
