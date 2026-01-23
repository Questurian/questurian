import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalApi } from '../api';
import { queryKeys } from '../api/queryKeys';

const approvalPendingAllKey = queryKeys.approvalPending('all');

function removePendingItem(items, contentType, contentId) {
  if (!items?.items) {
    return items;
  }

  return {
    ...items,
    items: items.items.filter(
      (item) => !(item.content_type === contentType && item.content_id === contentId)
    ),
  };
}

export function useApprovalPending(contentType = null) {
  return useQuery({
    queryKey: queryKeys.approvalPending(contentType),
    queryFn: () => approvalApi.getPending(contentType),
  });
}

export function useApprovalStats() {
  return useQuery({
    queryKey: queryKeys.approvalStats,
    queryFn: () => approvalApi.getStats(),
  });
}

export function useApproveItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contentType, contentId, approvedBy, notes }) =>
      approvalApi.approve(contentType, contentId, approvedBy, notes),
    onMutate: async ({ contentType, contentId }) => {
      await queryClient.cancelQueries({ queryKey: ['approval', 'pending'] });

      const previousAll = queryClient.getQueryData(approvalPendingAllKey);
      const filteredKey = contentType ? queryKeys.approvalPending(contentType) : null;
      const previousFiltered = filteredKey
        ? queryClient.getQueryData(filteredKey)
        : null;

      queryClient.setQueryData(approvalPendingAllKey, (old) =>
        removePendingItem(old, contentType, contentId)
      );

      if (filteredKey) {
        queryClient.setQueryData(filteredKey, (old) =>
          removePendingItem(old, contentType, contentId)
        );
      }

      return { previousAll, previousFiltered, filteredKey };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;

      if (context.previousAll) {
        queryClient.setQueryData(approvalPendingAllKey, context.previousAll);
      }
      if (context.filteredKey && context.previousFiltered) {
        queryClient.setQueryData(context.filteredKey, context.previousFiltered);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['approval', 'pending'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvalStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads });
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.elComercioPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useRejectItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ contentType, contentId, approvedBy, notes }) =>
      approvalApi.reject(contentType, contentId, approvedBy, notes),
    onMutate: async ({ contentType, contentId }) => {
      await queryClient.cancelQueries({ queryKey: ['approval', 'pending'] });

      const previousAll = queryClient.getQueryData(approvalPendingAllKey);
      const filteredKey = contentType ? queryKeys.approvalPending(contentType) : null;
      const previousFiltered = filteredKey
        ? queryClient.getQueryData(filteredKey)
        : null;

      queryClient.setQueryData(approvalPendingAllKey, (old) =>
        removePendingItem(old, contentType, contentId)
      );

      if (filteredKey) {
        queryClient.setQueryData(filteredKey, (old) =>
          removePendingItem(old, contentType, contentId)
        );
      }

      return { previousAll, previousFiltered, filteredKey };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;

      if (context.previousAll) {
        queryClient.setQueryData(approvalPendingAllKey, context.previousAll);
      }
      if (context.filteredKey && context.previousFiltered) {
        queryClient.setQueryData(context.filteredKey, context.previousFiltered);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['approval', 'pending'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvalStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads });
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.elComercioPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useBatchApprove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (items) => approvalApi.batchApprove(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval', 'pending'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvalStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads });
      queryClient.invalidateQueries({ queryKey: queryKeys.instagramPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.elComercioPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.diarioCorreoPosts });
      queryClient.invalidateQueries({ queryKey: queryKeys.scrapes });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
