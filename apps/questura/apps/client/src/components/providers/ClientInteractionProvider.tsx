"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "./QueryProvider";
import type { LocationMenuResponse } from "@/features/Navigation/lib/fetchLocationMenu";

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
  /** Server-rendered nav menu, so opening it costs no request. */
  locationMenu?: LocationMenuResponse | null;
};

export function ClientInteractionProvider({
  children,
  modals = true,
  locationMenu = null,
}: ClientInteractionProviderProps) {
  return (
    <QueryProvider>
      {children}
      {modals ? (
        <>
          <LoginModalRenderer />
          <PasswordResetModalRenderer />
          <UserModalRenderer />
          <MenuModalRenderer locationMenu={locationMenu} />
        </>
      ) : null}
    </QueryProvider>
  );
}
