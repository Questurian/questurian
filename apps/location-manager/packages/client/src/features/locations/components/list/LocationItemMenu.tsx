import { Settings } from "lucide-react";
import { type RefObject } from "react";

interface LocationItemMenuProps {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

/**
 * Settings menu component for location list items
 * Shows Edit and Delete options in a dropdown
 */
export function LocationItemMenu({ isOpen, onToggle, onEdit, onDelete, menuRef }: LocationItemMenuProps) {
  return (
    <div className="relative" ref={menuRef}>
      <Settings
        size={16}
        className="text-foreground cursor-pointer"
        onClick={onToggle}
      />
      {isOpen && (
        <div data-theme="light" className="absolute right-full mr-2 top-0 z-10 bg-background border border-border rounded py-0.5 min-w-[80px] max-h-[77px]">
          <button
            className="w-full text-left px-2 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className="w-full text-left px-2 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
