import { formatDegrees } from "./multiVariantCropper.geometry";

interface StraightenDialProps {
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function StraightenDial({
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: StraightenDialProps) {
  const tickValues = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const progress = ((value - min) / (max - min)) * 100;
  const activeLeft = value >= 0 ? 50 : progress;
  const activeWidth = Math.abs(progress - 50);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 text-xs">
        <div className="space-y-1">
          <p className="font-medium text-foreground">Straighten</p>
          <p className="text-muted-foreground">Fine tune the horizon with small angle adjustments.</p>
        </div>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 font-semibold text-foreground tabular-nums">
          {formatDegrees(value)}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-background/80 px-3 py-4">
        <div className="relative h-16">
          <div className="pointer-events-none absolute inset-x-3 top-1/2 h-1 -translate-y-1/2">
            <div className="absolute inset-0 rounded-full bg-border/70" />
            <div
              className="absolute top-0 h-full rounded-full bg-blue-500/80"
              style={{
                left: `${activeLeft}%`,
                width: `${activeWidth}%`,
              }}
            />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-7 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/70" />

          <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
            {tickValues.map((tickValue) => {
              const isCenter = tickValue === 0;
              const isMajor = tickValue % 5 === 0;

              return (
                <span
                  key={tickValue}
                  className={`block w-px rounded-full ${
                    isCenter
                      ? "h-7 bg-foreground/80"
                      : isMajor
                        ? "h-5 bg-foreground/45"
                        : "h-3 bg-foreground/20"
                  }`}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            disabled={disabled}
            aria-label="Straighten image"
            className="absolute inset-0 z-10 h-full w-full cursor-ew-resize appearance-none bg-transparent focus:outline-none disabled:cursor-not-allowed [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-[0_0_0_5px_rgba(59,130,246,0.2)] [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:shadow-[0_0_0_5px_rgba(59,130,246,0.2)] [&::-moz-range-track]:bg-transparent"
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{min}°</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-foreground/80">Level</span>
          <span>{max}°</span>
        </div>
      </div>
    </div>
  );
}
