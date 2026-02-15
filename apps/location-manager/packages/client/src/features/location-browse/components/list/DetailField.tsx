import type { ReactNode } from "react";

interface DetailFieldProps {
  label: string;
  value: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
  valueClassName?: string;
}

/**
 * Reusable component for displaying a labeled field with optional copy functionality
 * @param label - Field label (e.g., "Address", "Phone")
 * @param value - Field value to display
 * @param onClick - Optional click handler (typically for copy-to-clipboard)
 * @param title - Optional tooltip text
 * @param className - Optional className for the container
 * @param valueClassName - Optional className for the value span
 */
export function DetailField({ label, value, onClick, title, className, valueClassName }: DetailFieldProps) {
  const defaultValueClassName = onClick
    ? "text-sm text-foreground cursor-pointer underline underline-offset-2 decoration-muted-foreground hover:decoration-foreground transition-colors"
    : "text-sm text-foreground";

  return (
    <div className={className || "flex items-baseline gap-2"}>
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-fit">
        {label}:
      </span>
      <span
        className={valueClassName || defaultValueClassName}
        onClick={onClick}
        title={title}
      >
        {value}
      </span>
    </div>
  );
}
