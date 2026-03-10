import {
  useApproveItem,
  useRejectItem,
} from '../../../hooks';
import { useDialog } from '../../../providers/DialogProvider';
import { APPROVAL_DEFAULT_USER } from '../constants/approval.constants';

export function useApprovalQueueActions() {
  const dialog = useDialog();
  const approveMutation = useApproveItem();
  const rejectMutation = useRejectItem();

  async function handleApprove(item) {
    try {
      await approveMutation.mutateAsync({
        approvedBy: APPROVAL_DEFAULT_USER,
        contentId: item.content_id,
        contentType: item.content_type,
      });
    } catch (error) {
      await dialog.alert(`Error approving: ${error.message}`);
    }
  }

  async function handleReject(item, notes = null) {
    try {
      await rejectMutation.mutateAsync({
        approvedBy: APPROVAL_DEFAULT_USER,
        contentId: item.content_id,
        contentType: item.content_type,
        notes,
      });
    } catch (error) {
      await dialog.alert(`Error rejecting: ${error.message}`);
    }
  }

  return {
    handleApprove,
    handleReject,
    isMutating: approveMutation.isPending || rejectMutation.isPending,
  };
}
