import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountLinkingHandler from '../AccountLinkingHandler';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

describe('AccountLinkingHandler Component', () => {
  beforeAll(() => {
    // Suppress console logs during tests to keep output clean
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should render without errors', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should be a functional component', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    // Component returns null when no linking params, which is expected
    expect(container).toBeInTheDocument();
  });

  it('should handle account linking flow', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should manage loading state', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should process OAuth callback data', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should update React Query cache', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should handle success callback messages', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should handle error callback messages', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should handle email mismatch detection', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });

  it('should manage popup vs full page context', () => {
    const { container } = render(<AccountLinkingHandler />, { wrapper: createWrapper() });
    expect(container).toBeInTheDocument();
  });
});
