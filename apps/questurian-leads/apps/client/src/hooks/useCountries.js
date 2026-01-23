import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { countriesApi } from '../api';
import { queryKeys } from '../api/queryKeys';

export function useCountries() {
  return useQuery({
    queryKey: queryKeys.countries,
    queryFn: () => countriesApi.getAll(),
  });
}

export function useCreateCountry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => countriesApi.create(data),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.countries, (old) =>
        Array.isArray(old) ? [...old, created] : [created]
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.countries });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useUpdateCountry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => countriesApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.countries, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.id === updated.id ? updated : item))
          : old
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.countries });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

export function useDeleteCountry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) => countriesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.countries });
      const previous = queryClient.getQueryData(queryKeys.countries);

      queryClient.setQueryData(queryKeys.countries, (old) =>
        Array.isArray(old) ? old.filter((item) => item.id !== id) : old
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.countries, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.countries });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}
