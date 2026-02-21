"use client";

import { X, Compass, Home, Plane } from "lucide-react";

interface IntentModalProps {
  isOpen: boolean;
  cityName: string | null;
  onSelect: (mode: string) => void;
  onClose: () => void;
}

const intentOptions = [
  {
    id: "explore",
    label: "Explore",
    description: "Short trips & weekend escapes",
    Icon: Compass,
  },
  {
    id: "stay",
    label: "Stay",
    description: "Live like a local for months",
    Icon: Home,
  },
  {
    id: "move",
    label: "Move",
    description: "Start your new chapter here",
    Icon: Plane,
  },
] as const;

export default function IntentModal({ isOpen, cityName, onSelect, onClose }: IntentModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-sm rounded-2xl bg-[#f7f5f0] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/6 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A] tracking-tight">
              {cityName ? `What brings you to ${cityName}?` : "What's your intent?"}
            </h2>
            <p className="mt-0.5 text-xs text-[#1A1A1A]/45">
              You can always change this later
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#1A1A1A]/30 transition-colors hover:bg-black/5 hover:text-[#1A1A1A]/60"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {intentOptions.map(({ id, label, description, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className="flex items-center gap-3.5 rounded-xl border border-black/5 bg-white/70 px-4 py-3.5 text-left transition-all hover:-translate-y-px hover:border-[#C65D3B]/25 hover:shadow-[0_4px_20px_-6px_rgba(198,93,59,0.1)]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#C65D3B]/8">
                <Icon className="h-4 w-4 text-[#C65D3B]" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <span className="block text-sm font-medium text-[#1A1A1A]">{label}</span>
                <span className="block text-xs text-[#1A1A1A]/40">{description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
