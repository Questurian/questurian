"use client";

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';

// City data matching the screenshot
const cities = [
  {
    id: 'lima',
    name: 'Lima',
    country: 'Peru',
    flag: '🇵🇪',
    tag: 'Culinary Capital',
    image: 'https://images.unsplash.com/photo-1531969179221-3926e727d704?w=600&q=80',
  },
  {
    id: 'medellin',
    name: 'Medellín',
    country: 'Colombia',
    flag: '🇨🇴',
    tag: 'Digital Nomad Hub',
    image: 'https://images.unsplash.com/photo-1582993724324-71abc5a14629?w=600&q=80',
  },
  {
    id: 'cartagena',
    name: 'Cartagena',
    country: 'Colombia',
    flag: '🇨🇴',
    tag: 'Caribbean Charm',
    image: 'https://images.unsplash.com/photo-1584735422524-1c9c4c99f4cb?w=600&q=80',
  },
  {
    id: 'mexico-city',
    name: 'Mexico City',
    country: 'Mexico',
    flag: '🇲🇽',
    tag: 'Cultural Capital',
    image: 'https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?w=600&q=80',
  },
  {
    id: 'sao-paulo',
    name: 'São Paulo',
    country: 'Brazil',
    flag: '🇧🇷',
    tag: 'Urban Powerhouse',
    image: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&q=80',
  },
  {
    id: 'rio',
    name: 'Rio de Janeiro',
    country: 'Brazil',
    flag: '🇧🇷',
    tag: 'Tropical Paradise',
    image: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=600&q=80',
  },
  {
    id: 'buenos-aires',
    name: 'Buenos Aires',
    country: 'Argentina',
    flag: '🇦🇷',
    tag: 'European Soul',
    image: 'https://images.unsplash.com/photo-1612294037637-ec328d0e575e?w=600&q=80',
  },
];

interface CityCardProps {
  city: typeof cities[0];
  onSelect: (id: string) => void;
  style?: React.CSSProperties;
}

function CityCard({ city, onSelect, style }: CityCardProps) {
  return (
    <div
      onClick={() => onSelect(city.id)}
      style={style}
      className="
        relative overflow-hidden rounded-2xl cursor-pointer group
        aspect-[3/4] min-h-[320px]
        transition-all duration-500 ease-out
        animate-fade-in-up
      "
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={city.image}
          alt={city.name}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5 z-10">
        {/* City Name */}
        <h3 className="text-2xl font-semibold text-white mb-1 tracking-tight">
          {city.name}
        </h3>
        
        {/* Country with Flag */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-white/80 text-sm">{city.country}</span>
          <span className="text-lg">{city.flag}</span>
        </div>

        {/* Tag */}
        <span className="inline-block px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-white text-xs font-medium border border-white/10">
          {city.tag}
        </span>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-[#2d9d78]/0 group-hover:bg-[#2d9d78]/10 transition-colors duration-500" />
    </div>
  );
}

function HomeContent() {
  const router = useRouter();

  const handleCitySelect = (cityId: string) => {
    // Navigate to step 2 with the selected city
    router.push(`/step-2?city=${cityId}`);
  };

  return (
    <div className="min-h-screen bg-[#f8f6f3]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 md:px-12 py-6 animate-fade-in-down">
        {/* Logo */}
        <div className="flex items-center">
          <span className="text-xl font-bold tracking-tight text-gray-900">
            Questurian
          </span>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Step 1 of 2</span>
          <div className="flex gap-1.5">
            <div className="w-8 h-2 rounded-full bg-[#2d9d78]" />
            <div className="w-8 h-2 rounded-full bg-gray-200" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 md:px-12 pb-16">
        {/* Hero Text */}
        <div className="max-w-3xl mb-12 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-gray-900 mb-4 tracking-tight leading-[1.1]">
            Where to next?
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            Choose a city that speaks to you. Each one offers a unique rhythm of life.
          </p>
        </div>

        {/* City Grid - First Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          {cities.slice(0, 4).map((city, index) => (
            <CityCard
              key={city.id}
              city={city}
              onSelect={handleCitySelect}
              style={{ animationDelay: `${0.15 + index * 0.1}s` }}
            />
          ))}
        </div>

        {/* City Grid - Second Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12">
          {cities.slice(4).map((city, index) => (
            <CityCard
              key={city.id}
              city={city}
              onSelect={handleCitySelect}
              style={{ animationDelay: `${0.55 + index * 0.1}s` }}
            />
          ))}
          {/* Empty spacer for alignment on larger screens */}
          <div className="hidden lg:block" />
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm animate-fade-in" style={{ animationDelay: '1s' }}>
          More cities coming soon. We&apos;re curating the best destinations for you.
        </p>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2d9d78] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
