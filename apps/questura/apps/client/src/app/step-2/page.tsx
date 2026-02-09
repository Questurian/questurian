"use client";

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';

// City data (same as homepage)
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

// Intent data
const intents = [
  {
    id: 'explore',
    title: 'Explore',
    subtitle: 'Discover hidden gems in days',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80',
  },
  {
    id: 'stay',
    title: 'Stay',
    subtitle: 'Live like a local for months',
    image: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=600&q=80',
  },
  {
    id: 'move',
    title: 'Move',
    subtitle: 'Start your new chapter here',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80',
  },
];

interface IntentCardProps {
  intent: typeof intents[0];
  isSelected: boolean;
  onSelect: (id: string) => void;
  style?: React.CSSProperties;
}

function IntentCard({ intent, isSelected, onSelect, style }: IntentCardProps) {
  return (
    <div
      onClick={() => onSelect(intent.id)}
      style={style}
      className={`
        relative overflow-hidden rounded-2xl cursor-pointer group
        aspect-[3/4] min-h-[360px]
        transition-all duration-500 ease-out
        animate-fade-in-up
        ${isSelected ? 'ring-[3px] ring-[#2d9d78] ring-offset-2 ring-offset-[#f8f6f3]' : ''}
      `}
    >
      {/* Background Image */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={intent.image}
          alt={intent.title}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="absolute top-4 right-4 w-8 h-8 bg-[#2d9d78] rounded-full flex items-center justify-center z-10 shadow-lg animate-scale-in">
          <Check className="w-5 h-5 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
        {/* Intent Title */}
        <h3 className="text-3xl font-semibold text-white mb-2 tracking-tight">
          {intent.title}
        </h3>
        
        {/* Subtitle */}
        <p className="text-white/80 text-sm">
          {intent.subtitle}
        </p>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-[#2d9d78]/0 group-hover:bg-[#2d9d78]/10 transition-colors duration-500" />
    </div>
  );
}

function Step2Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIntent, setSelectedIntent] = useState<string | null>(null);

  const cityId = searchParams.get('city');
  const city = cities.find(c => c.id === cityId);

  // If no city selected, redirect back to homepage
  if (!city) {
    if (typeof window !== 'undefined') {
      router.push('/');
    }
    return null;
  }

  const handleBack = () => {
    router.push('/');
  };

  const handleIntentSelect = (intentId: string) => {
    setSelectedIntent(intentId);
    // Here you would typically navigate to the next step or save the selection
    // router.push(`/results?city=${cityId}&intent=${intentId}`);
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
          <span className="text-sm text-gray-500">Step 2 of 2</span>
          <div className="flex gap-1.5">
            <div className="w-8 h-2 rounded-full bg-[#2d9d78]" />
            <div className="w-8 h-2 rounded-full bg-[#2d9d78]" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 md:px-12 pb-16">
        {/* Back Link */}
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors mb-6 animate-fade-in-up"
          style={{ animationDelay: '0.05s' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Choose another city</span>
        </button>

        {/* Selected City Display */}
        <div className="flex items-center gap-3 mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {/* City Thumbnail */}
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={city.image}
              alt={city.name}
              className="w-full h-full object-cover"
            />
          </div>
          {/* City Info */}
          <div>
            <p className="text-sm text-[#2d9d78] font-medium">{city.country}</p>
            <p className="text-lg font-semibold text-gray-900">{city.name}</p>
          </div>
        </div>

        {/* Hero Text */}
        <div className="max-w-3xl mb-10 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <h1 className="text-5xl md:text-6xl font-serif text-gray-900 mb-4 tracking-tight leading-[1.1]">
            What brings you here?
          </h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            Tell us your intent and we&apos;ll personalize your experience.
          </p>
        </div>

        {/* Intent Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl">
          {intents.map((intent, index) => (
            <IntentCard
              key={intent.id}
              intent={intent}
              isSelected={selectedIntent === intent.id}
              onSelect={handleIntentSelect}
              style={{ animationDelay: `${0.2 + index * 0.1}s` }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

export default function Step2Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f8f6f3] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#2d9d78] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <Step2Content />
    </Suspense>
  );
}
