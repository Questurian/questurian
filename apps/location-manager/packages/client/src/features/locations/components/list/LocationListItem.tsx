import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatLocationHierarchy } from "@client/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@client/components/ui";
import { getCategoryBadgeStyles } from "../../utils";
import {
  useLocationDetail,
  useLocationItemMenu,
  useLocationDelete,
  useClipboardCopy,
} from "../../hooks";
import { LocationItemMenu } from "./LocationItemMenu";
import { LocationDetailView } from "./LocationDetailView";

interface LocationListItemProps {
  location: {
    id: number;
    name: string;
    title: string | null;
    category: string;
    location?: string;
  };
  onClick?: (id: number) => void;
}

export function LocationListItem({ location, onClick }: LocationListItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  // Custom hooks
  const { data: locationDetail, isLoading, error } = useLocationDetail(isExpanded ? location.id : null);
  const { isMenuOpen, menuRef, toggleMenu, closeMenu } = useLocationItemMenu();
  const { copyToClipboard } = useClipboardCopy();
  const {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
    isDeleting,
  } = useLocationDelete({
    locationId: location.id,
    onMenuClose: closeMenu,
  });

  const handleClick = () => {
    if (onClick) {
      onClick(location.id);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeMenu();
    navigate(`/edit/${location.id}`);
  };

  return (
    <div data-theme="light" className="border border-border rounded-lg p-4 bg-background transition-all duration-200 hover:shadow-sm hover:border-border">
      {/* Header Section */}
      <div
        className="flex items-start justify-between gap-3 cursor-pointer"
        onClick={handleClick}
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground text-base leading-tight truncate">
            {location.title || location.name}
          </h3>
          {location.location && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {formatLocationHierarchy(location.location)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <LocationItemMenu
            isOpen={isMenuOpen}
            onToggle={(e) => {
              e.stopPropagation();
              toggleMenu();
            }}
            onEdit={handleEditClick}
            onDelete={handleDeleteClick}
            menuRef={menuRef}
          />
          <span className={`text-xs font-medium uppercase tracking-wider px-2 py-1 rounded-md ${getCategoryBadgeStyles(location.category)}`}>
            {location.category}
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <LocationDetailView
          locationDetail={locationDetail}
          isLoading={isLoading}
          error={error}
          onCopyField={copyToClipboard}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{location.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
