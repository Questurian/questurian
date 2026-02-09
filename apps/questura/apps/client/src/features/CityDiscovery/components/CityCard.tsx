'use client';

import { City } from '../types';

interface CityCardProps {
  city: City;
  onSelect: (id: string) => void;
  variant?: 'default' | 'featured' | 'wide';
  style?: React.CSSProperties;
}

export function CityCard({ city, onSelect, variant = 'default', style }: CityCardProps) {
  const variantClasses = {
    default: 'aspect-[16/10] 480:aspect-[4/3] 768:aspect-[3/2]',
    featured: 'aspect-[16/10] 480:aspect-[16/9] 1024:aspect-auto 1024:h-full',
    wide: 'aspect-[16/10] 480:aspect-[4/3] 768:aspect-[3/2] 1024:aspect-[21/9]',
  };

  const titleClasses = {
    default: 'text-lg 480:text-xl 768:text-2xl 1024:text-3xl',
    featured: 'text-2xl 480:text-3xl 768:text-4xl 1024:text-5xl',
    wide: 'text-lg 480:text-xl 768:text-2xl 1024:text-4xl',
  };

  return (
    <div
      onClick={() => onSelect(city.id)}
      style={style}
      className={`
        relative overflow-hidden rounded-2xl cursor-pointer group w-full
        ${variantClasses[variant]}
        animate-fade-in-up transition-transform duration-500 ease-out hover:scale-[1.02]
      `}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={city.image}
          alt={city.name}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/80 via-[#1A1A1A]/20 to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 480:p-5 768:p-6 1024:p-8 z-10">
        {/* City Name - THE STAR: Larger, first in hierarchy */}
        <h3 className={`${titleClasses[variant]} font-display text-white leading-[0.9] tracking-tight mb-2 480:mb-3`}>
          {city.name}
        </h3>

        {/* Bottom row: Country flag + Name + Badge */}
        <div className="flex items-center gap-2 480:gap-3">
          {/* Country with Flag */}
          <div className="flex items-center gap-1.5 text-white/90">
            {/* SVG Flag from flagcdn.com */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://flagcdn.com/w40/${city.countryCode}.png`}
              srcSet={`https://flagcdn.com/w40/${city.countryCode}.png 1x, https://flagcdn.com/w80/${city.countryCode}.png 2x`}
              alt={`${city.displayCountry} flag`}
              className="w-4 h-3 480:w-5 480:h-4 object-cover rounded-sm shadow-sm"
            />
            <span className="text-xs 480:text-sm 768:text-base tracking-wide">{city.displayCountry}</span>
          </div>
          
          {/* Divider */}
          <span className="text-white/30">·</span>
          
          {/* Badge - Subtle but noticeable accent */}
          <span className="inline-flex items-center px-1.5 480:px-2 py-0.5 bg-white/15 backdrop-blur-sm text-white text-[10px] 480:text-[11px] 768:text-xs font-medium tracking-wider uppercase rounded">
            {city.tag}
          </span>
        </div>
      </div>


    </div>
  );
}
