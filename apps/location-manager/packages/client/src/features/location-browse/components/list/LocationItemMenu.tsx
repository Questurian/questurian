import { Settings } from "lucide-react";
import { type RefObject } from "react";

interface LocationItemMenuProps {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onAdvanced: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

/**
 * Settings menu component for location list items
 * Shows Edit, Advanced Data, and Delete options in a dropdown
 */
export function LocationItemMenu({ isOpen, onToggle, onEdit, onAdvanced, onDelete, menuRef }: LocationItemMenuProps) {
  return (
    <div className="relative" ref={menuRef}>
      <Settings
        size={16}
        className="text-foreground cursor-pointer"
        onClick={onToggle}
      />
      {isOpen && (
        <div className="absolute right-full mr-2 top-0 z-10 bg-popover border border-border rounded-lg py-1 min-w-[160px] shadow-xl shadow-black/20">
          <button
            className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
            onClick={onAdvanced}
          >
            Advanced Data
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
