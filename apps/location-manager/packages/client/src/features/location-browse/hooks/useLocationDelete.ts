import { useState } from "react";
import { useToast } from "@client/shared/hooks/useToast";
import { useDeleteLocation } from "@client/shared/services/api/hooks";

interface UseLocationDeleteProps {
  locationId: number;
  onMenuClose: () => void;
}

/**
 * Hook for managing location deletion with confirmation dialog
 * @param locationId - ID of the location to delete
 * @param onMenuClose - Callback to close the settings menu
 * @returns Delete dialog state, handlers, and loading state
 */
export function useLocationDelete({ locationId, onMenuClose }: UseLocationDeleteProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { showToast } = useToast();
  const deleteLocationMutation = useDeleteLocation();

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMenuClose(); // Close the menu
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      await deleteLocationMutation.mutateAsync(locationId);
      showToast('Location deleted successfully', { x: window.innerWidth / 2, y: 100 });
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete location:', error);
      showToast('Failed to delete location', { x: window.innerWidth / 2, y: 100 });
    }
  };

  const handleDeleteCancel = () => {
    setIsDeleteDialogOpen(false);
  };

  return {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    handleDeleteClick,
    handleDeleteConfirm,
    handleDeleteCancel,
    isDeleting: deleteLocationMutation.isPending,
  };
}
