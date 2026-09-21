"use client";

import { AuthSlot, Logo, MenuIcon, SubscribeButton } from "./components";
import Link from "@/components/navigation/PublicLink";
import { useAuth } from "@/lib/user/hooks";
import { useMembership } from "@/features/Payments/hooks/useMembership";

export default function MobileNavbar() {
  const { user, loading, isAuthenticated } = useAuth();
  const { isActive } = useMembership(user);
  const shouldShowSubscribe = !isAuthenticated || !isActive;

  return (
    <nav className="h-[55px] min-h-[55px] w-full border-b border-black/10 bg-[#ece9e3] px-4 py-0">
      <div className="flex h-[55px] min-h-[55px] items-center justify-between gap-3 max-[379.98px]:gap-2.5">
        <div className="flex min-h-8 min-w-0 flex-1 items-center gap-2 max-[379.98px]:gap-2.5">
          <MenuIcon
            buttonClassName="h-8 w-8 shrink-0"
            iconClassName="!text-black block h-5 w-5 translate-y-px"
          />
          <Link
            href="/"
            data-no-hover-underline
            className="inline-flex min-w-0 cursor-pointer items-center self-center"
          >
            <Logo
              variant="inline"
              className="whitespace-nowrap font-bold leading-none text-[1.02rem] tracking-[0.06em] max-[479.98px]:font-extrabold 480:text-[1.35rem]"
            />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2 max-[379.98px]:gap-2.5">
          {/* Public purchase link must not wait for the session request. */}
          {(loading || shouldShowSubscribe) ? (
            <Link href="/join" className="flex h-8 items-center max-[379.98px]:h-auto">
              <SubscribeButton />
            </Link>
          ) : null}
          <AuthSlot
            loading={loading}
            isAuthenticated={isAuthenticated}
            isMember={isActive}
            signInClassName="!text-black h-8 inline-flex items-center leading-none text-[0.69rem]"
            userIconClassName="shrink-0"
          />
        </div>
      </div>
    </nav>
  );
}
