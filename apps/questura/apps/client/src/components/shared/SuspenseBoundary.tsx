import { Suspense, type JSX } from "react";

type SuspenseBoundaryProps = {
  fallback?: unknown;
  children: unknown;
};

export function SuspenseBoundary({ fallback, children }: SuspenseBoundaryProps): JSX.Element {
  const TypedSuspense = Suspense as unknown as (props: SuspenseBoundaryProps) => JSX.Element;
  return <TypedSuspense fallback={fallback}>{children}</TypedSuspense>;
}
