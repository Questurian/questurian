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
        hover-lift animate-fade-in-up
      `}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={city.image}
          alt={city.name}
          className="w-full h-full object-cover image-zoom"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/80 via-[#1A1A1A]/20 to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 480:p-5 768:p-6 1024:p-8 z-10">
        <span className="inline-block w-fit px-2 768:px-3 py-0.5 768:py-1 bg-[#C65D3B] text-white text-[10px] 768:text-[11px] font-medium tracking-wider uppercase rounded-full mb-2 768:mb-3">
          {city.tag}
        </span>

        <h3 className={`${titleClasses[variant]} font-display text-white leading-none tracking-tight mb-1`}>
          {city.name}
        </h3>

        <div className="flex items-center gap-1.5 text-white/70">
          <span className="text-xs 768:text-sm tracking-wide">{city.displayCountry}</span>
          <span className="text-sm">{city.flag}</span>
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-[#C65D3B]/0 group-hover:bg-[#C65D3B]/10 transition-colors duration-500" />
    </div>
  );
}
