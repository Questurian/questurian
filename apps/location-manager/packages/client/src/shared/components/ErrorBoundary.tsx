import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: (reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      return fallback ? (
        fallback(this.reset)
      ) : (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm font-medium text-destructive">Something went wrong</p>
          <p className="mt-1 text-xs text-destructive/80">{error.message}</p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 rounded border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}
