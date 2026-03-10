import { useFeedCrudActions } from './useFeedCrudActions';
import { useFeedFetchActions } from './useFeedFetchActions';
import { useFeedFetchStatus } from './useFeedFetchStatus';

export function useFeedsPageActions({
  editingId,
  feeds,
  formData,
  onCancel,
}) {
  const fetchStatusState = useFeedFetchStatus();
  const crud = useFeedCrudActions({
    editingId,
    formData,
    onCancel,
  });
  const fetching = useFeedFetchActions({
    feeds,
    fetchStatusState,
  });

  return {
    activeFetchId: fetchStatusState.activeFetchId,
    fetchAllPending: fetching.fetchAllPending,
    fetchPending: fetching.fetchPending,
    fetchStatus: fetchStatusState.fetchStatus,
    handleDelete: crud.handleDelete,
    handleFetch: fetching.handleFetch,
    handleFetchAll: fetching.handleFetchAll,
    handleSubmit: crud.handleSubmit,
    isMutating:
      crud.isCrudPending ||
      fetching.fetchPending ||
      fetching.fetchAllPending,
  };
}
