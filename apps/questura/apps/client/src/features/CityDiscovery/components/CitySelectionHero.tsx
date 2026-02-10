interface CitySelectionHeroProps {
  label: string;
  headingLevel?: 'h1' | 'h2';
  headingSize?: 'hero' | 'reference';
  animated?: boolean;
}

export function CitySelectionHero({
  label,
  headingLevel = 'h1',
  headingSize = 'hero',
  animated = false,
}: CitySelectionHeroProps) {
  const labelClassName = `text-[#C65D3B] text-xs 480:text-sm tracking-[0.2em] uppercase mb-3${
    animated ? ' animate-slide-in-right' : ''
  }`;
  const headingSizeClassName =
    headingSize === 'hero'
      ? 'text-4xl 480:text-5xl 768:text-6xl 1024:text-7xl'
      : 'text-3xl 480:text-4xl 768:text-5xl 1024:text-6xl';
  const headingClassName = `${headingSizeClassName} font-display text-[#1A1A1A] leading-[0.95] tracking-tight${
    animated ? ' animate-text-reveal' : ''
  }`;
  const descriptionClassName = `mt-4 480:mt-5 768:mt-6 text-sm 480:text-base 768:text-lg text-[#1A1A1A]/60 max-w-lg leading-relaxed${
    animated ? ' animate-fade-in-up' : ''
  }`;
  const labelStyle = animated ? { animationDelay: '0.1s' } : undefined;
  const headingStyle = animated ? { animationDelay: '0.2s' } : undefined;
  const descriptionStyle = animated ? { animationDelay: '0.4s' } : undefined;
  const headingContent = (
    <>
      Where to
      <br />
      <span className="italic">next?</span>
    </>
  );

  return (
    <div className="max-w-4xl mb-8 480:mb-10 768:mb-14 1024:mb-16">
      <p className={labelClassName} style={labelStyle}>
        {label}
      </p>
      {headingLevel === 'h2' ? (
        <h2 className={headingClassName} style={headingStyle}>
          {headingContent}
        </h2>
      ) : (
        <h1 className={headingClassName} style={headingStyle}>
          {headingContent}
        </h1>
      )}
      <p className={descriptionClassName} style={descriptionStyle}>
        Select a city that resonates with your rhythm. Each destination offers a unique way of life.
      </p>
    </div>
  );
}
