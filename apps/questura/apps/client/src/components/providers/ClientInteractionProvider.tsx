"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "./QueryProvider";

const LoginModalRenderer = dynamic(() => import("@/components/layout/LoginModalRenderer"), {
  ssr: false,
});
const PasswordResetModalRenderer = dynamic(
  () => import("@/components/layout/PasswordResetModalRenderer"),
  { ssr: false },
);
const UserModalRenderer = dynamic(() => import("@/components/layout/UserModalRenderer"), {
  ssr: false,
});
const MenuModalRenderer = dynamic(() => import("@/components/layout/MenuModalRenderer"), {
  ssr: false,
});

type ClientInteractionProviderProps = {
  children: unknown;
  modals?: boolean;
};

export function ClientInteractionProvider({
  children,
  modals = true,
}: ClientInteractionProviderProps) {
  return (
    <QueryProvider>
      {children}
      {modals ? (
        <>
          <LoginModalRenderer />
          <PasswordResetModalRenderer />
          <UserModalRenderer />
          <MenuModalRenderer />
        </>
      ) : null}
    </QueryProvider>
  );
}
