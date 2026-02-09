'use client';

import { Compass, Home, Plane } from 'lucide-react';

interface IntentCardProps {
  intent: {
    id: string;
    title: string;
    subtitle: string;
    verb: string;
    image: string;
    description: string;
    features: string[];
  };
  index: number;
  onSelect: (id: string) => void;
  cityName?: string;
  style?: React.CSSProperties;
}

const icons = [Compass, Home, Plane];

export function IntentCard({ intent, index, onSelect, cityName, style }: IntentCardProps) {
  const Icon = icons[index] || Compass;

  return (
    <button
      onClick={() => onSelect(intent.id)}
      style={style}
      className="
        group relative w-full text-left
        bg-white/60 backdrop-blur-sm
        border border-[#1A1A1A]/[0.06] hover:border-[#C65D3B]/30
        rounded-2xl p-6 768:p-8
        transition-all duration-300 ease-out
        hover:shadow-[0_8px_40px_-12px_rgba(198,93,59,0.12)]
        hover:-translate-y-1
        animate-fade-in-up
      "
    >
      {/* Top row: icon + number */}
      <div className="flex items-start justify-between mb-5">
        <div className="w-11 h-11 rounded-xl bg-[#C65D3B]/[0.08] group-hover:bg-[#C65D3B]/[0.14] flex items-center justify-center transition-colors duration-300">
          <Icon className="w-5 h-5 text-[#C65D3B]" strokeWidth={1.5} />
        </div>
        <span className="text-[#1A1A1A]/[0.08] text-5xl font-display leading-none select-none group-hover:text-[#C65D3B]/[0.1] transition-colors duration-300">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Title & subtitle */}
      <h3 className="text-xl 768:text-2xl font-display text-[#1A1A1A] leading-tight tracking-tight mb-1.5">
        {intent.title}
      </h3>
      <p className="text-[#C65D3B]/80 text-sm font-medium mb-3">
        {intent.subtitle}
      </p>

      {/* Description */}
      <p className="text-[#1A1A1A]/45 text-sm leading-relaxed mb-5">
        {intent.description}
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {intent.features.map((feature) => (
          <span
            key={feature}
            className="text-[11px] tracking-wide text-[#1A1A1A]/40 bg-[#1A1A1A]/[0.04] rounded-full px-3 py-1"
          >
            {feature}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-2 text-[#C65D3B]/60 group-hover:text-[#C65D3B] transition-colors duration-300">
        <span className="text-sm font-medium tracking-wide">
          {cityName ? `I want to ${intent.verb} ${cityName}` : 'Select'}
        </span>
        <svg className="w-4 h-4 transform group-hover:translate-x-1.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </div>
    </button>
  );
}
