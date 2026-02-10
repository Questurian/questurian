'use client';

const navItems = ['Explore', 'Stay', 'Move'] as const;

interface SubNavProps {
  className?: string;
}

export function SubNav({ className = '' }: SubNavProps) {
  return (
    <nav
      aria-label="Section navigation"
      className={`inline-flex rounded-full bg-white/10 p-1 ${className}`}
    >
      {navItems.map((item, index) => (
        <button
          key={item}
          type="button"
          aria-pressed={index === 0}
          className={`
            rounded-full px-4 py-1.5 uppercase tracking-[0.08em]
            text-[0.63rem] 480:text-[0.69rem] 550:text-[0.74rem]
            font-semibold transition-colors duration-200
            ${index === 0 ? 'bg-white text-[#222427]' : 'text-white/85 hover:text-white'}
          `}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}
