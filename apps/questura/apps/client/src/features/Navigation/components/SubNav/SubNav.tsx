'use client';

import { ArgentinaFlag, BrazilFlag, ColombianFlag, PeruFlag } from '@/components/shared/flags';

const countries = [
  { name: 'Peru', Flag: PeruFlag },
  { name: 'Colombia', Flag: ColombianFlag },
  { name: 'Argentina', Flag: ArgentinaFlag },
  { name: 'Brazil', Flag: BrazilFlag },
];

export function SubNav() {
  return (
    <nav
      className={`
        /* Base styles */
        border-t-[0.5px] border-white
        bg-[rgb(31,31,31)]
        h-[65px]
        overflow-x-auto
        [&::-webkit-scrollbar]:hidden
        [-ms-overflow-style:none]
        [scrollbar-width:none]
      `}
    >
      <div
        className={`
          /* Base styles */
          flex items-center justify-center
          gap-4
          max-w-[1024px]
          w-fit
          min-w-full
          h-full
          mx-auto
        `}
      >
        {countries.map(({ name, Flag }) => (
          <div
            key={name}
            className={`
              /* Base styles */
              flex items-center justify-center
              gap-2 cursor-pointer
              px-3 py-2
              transition-colors duration-200
              hover:bg-white/10
            `}
          >
            <Flag
              className={`
                /* Base styles */
                h-5 w-5
              `}
            />
            <span
              className={`
                /* Base styles */
                text-base font-bold text-white
              `}
            >
              {name}
            </span>
          </div>
        ))}
      </div>
    </nav>
  );
}
