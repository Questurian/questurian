import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, Instagram, Search, TicketPlus } from "lucide-react";
import type { LocationBasic } from "@client/shared/services/api/types";
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
import { useLocationDetail } from "../../hooks/useLocationDetail";
import { useLocationItemMenu } from "../../hooks/useLocationItemMenu";
import { useLocationDelete } from "../../hooks/useLocationDelete";
import { useClipboardCopy } from "../../hooks/useClipboardCopy";
import { LocationItemMenu } from "./LocationItemMenu";
import { LocationDetailView } from "../detail/LocationDetailView";
import { AdvancedDataModal } from "./AdvancedDataModal";
import { QuickAddTourModal } from "@client/shared/components/tours/QuickAddTourModal";

interface LocationListItemProps {
  location: LocationBasic;
  onClick?: (id: number) => void;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

function formatLocationSegmentForSearch(segment: string): string {
  return segment
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getLocationSegmentsForSearch(location: LocationBasic): string[] {
  const rawLocation = location.locationKey?.trim() || location.location?.trim() || "";

  if (!rawLocation) {
    return [];
  }

  const delimiter = rawLocation.includes("|")
    ? "|"
    : rawLocation.includes(">")
      ? ">"
      : null;

  const segments = delimiter ? rawLocation.split(delimiter) : [rawLocation];

  return segments
    .map((segment) => formatLocationSegmentForSearch(segment))
    .filter(Boolean);
}

function buildSearchQueries(location: LocationBasic): {
  google: string;
  tripAdvisor: string;
  instagram: string;
} {
  const title = (location.title || location.name || "").trim();
  const [countryFromLocation, city] = getLocationSegmentsForSearch(location);
  const country = countryFromLocation || (location.country ? formatLocationSegmentForSearch(location.country) : "");
  const baseQuery = [title, city, country].filter(Boolean).join(", ").trim() || title;

  return {
    google: baseQuery,
    tripAdvisor: `${baseQuery} TripAdvisor`,
    instagram: `${baseQuery} Instagram`,
  };
}

function buildGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function LocationListItem({
  location,
  onClick,
  isExpanded = false,
  onExpandedChange,
}: LocationListItemProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isQuickAddTourOpen, setIsQuickAddTourOpen] = useState(false);
  const navigate = useNavigate();
  const searchQueries = buildSearchQueries(location);
  const isAttraction = location.category === "attractions";

  // Custom hooks
  const { data: locationDetail, isLoading, error } = useLocationDetail(
    isExpanded || isAdvancedOpen ? location.id : null,
    location.category
  );
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
    category: location.category,
    onMenuClose: closeMenu,
  });

  const handleClick = () => {
    if (onClick) {
      onClick(location.id);
    } else {
      onExpandedChange?.(!isExpanded);
    }
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeMenu();
    navigate(`/edit/${location.category}/${location.id}`);
  };

  const handleAdvancedClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeMenu();
    setIsAdvancedOpen(true);
  };

  return (
    <div className="border border-border rounded-lg p-4 bg-card hover:bg-accent/30 transition-all duration-200">
      {/* Header Section */}
      <div
        className="flex items-start justify-between gap-3 cursor-pointer"
        onClick={handleClick}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <h3 className="font-medium text-foreground text-base leading-tight truncate min-w-0">
              {location.title || location.name}
            </h3>
            <div className="inline-flex items-center gap-1.5 shrink-0 text-[11px] text-muted-foreground/85">
              <a
                href={buildGoogleSearchUrl(searchQueries.google)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Search size={11} />
                Google
              </a>
              <span aria-hidden="true" className="text-muted-foreground/50">|</span>
              <a
                href={buildGoogleSearchUrl(searchQueries.tripAdvisor)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Compass size={11} />
                TripAdvisor
              </a>
              <span aria-hidden="true" className="text-muted-foreground/50">|</span>
              <a
                href={buildGoogleSearchUrl(searchQueries.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Instagram size={11} />
                Instagram
              </a>
            </div>
          </div>
          {location.location != null && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {formatLocationHierarchy(location.location)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {isAttraction && (
            <button
              type="button"
              aria-label="Quick-link tour"
              title="Quick-link tour"
              className="inline-flex items-center justify-center rounded p-1 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsQuickAddTourOpen(true);
              }}
            >
              <TicketPlus size={16} />
            </button>
          )}
          <LocationItemMenu
            isOpen={isMenuOpen}
            onToggle={(e) => {
              e.stopPropagation();
              toggleMenu();
            }}
            onEdit={handleEditClick}
            onAdvanced={handleAdvancedClick}
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

      {isAttraction && isQuickAddTourOpen && (
        <QuickAddTourModal
          open={isQuickAddTourOpen}
          onOpenChange={setIsQuickAddTourOpen}
          locationId={location.id}
          locationCategory={location.category}
          locationKey={location.locationKey}
          locationName={location.title || location.name}
        />
      )}

      <AdvancedDataModal
        isOpen={isAdvancedOpen}
        onOpenChange={setIsAdvancedOpen}
        locationDetail={locationDetail}
        isLoading={isLoading}
        error={error}
        onCopyField={copyToClipboard}
      />

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
