import { mockUsers } from './data';

// Mock React Query hooks
export const mockUseMutation = jest.fn();
export const mockUseQuery = jest.fn();
export const mockUseQueryClient = jest.fn();

/**
 * Setup basic React Query mocks for testing
 */
export const setupReactQueryMocks = () => {
  // Reset all mocks
  mockUseMutation.mockReset();
  mockUseQuery.mockReset();
  mockUseQueryClient.mockReset();

  // Default mutation mock
  mockUseMutation.mockReturnValue({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
    status: 'idle',
    reset: jest.fn(),
  });

  // Default query mock
  mockUseQuery.mockReturnValue({
    data: mockUsers.freeMember,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });

  // Default query client mock
  mockUseQueryClient.mockReturnValue({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
    removeQueries: jest.fn(),
  });
};

/**
 * Helper to setup a mutation with custom behavior
 */
export const setupMutationMock = (
  onSuccess?: jest.Mock,
  onError?: jest.Mock,
  isPending = false
) => {
  mockUseMutation.mockReturnValue({
    mutate: jest.fn((data, options) => {
      if (isPending) return;
      if (onSuccess) onSuccess(data);
      options?.onSuccess?.(data);
    }),
    mutateAsync: jest.fn(),
    isPending,
    isSuccess: !isPending,
    isError: false,
    error: null,
    data: undefined,
    status: isPending ? 'pending' : 'success',
    reset: jest.fn(),
  });
};

/**
 * Helper to setup a query with custom data
 */
export const setupQueryMock = (data: any, isLoading = false) => {
  mockUseQuery.mockReturnValue({
    data,
    isLoading,
    isError: false,
    error: null,
    refetch: jest.fn(),
  });
};
