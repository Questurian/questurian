"use client";

import SignInButton from "./buttons/SignInButton";
import UserIcon from "./icons/UserIcon";

interface AuthSlotProps {
  loading: boolean;
  isAuthenticated: boolean;
  isMember: boolean;
  signInClassName?: string;
  userIconClassName?: string;
}

/**
 * The navbar's right-hand control, in a box that is the same size before and
 * after the session request answers.
 *
 * `/api/me` is a client call and the public pages are statically cached, so
 * the navbar cannot know who is reading until after hydration — there is no
 * server render that could get this right. What it can do is stop the answer
 * from moving anything. This slot is always as wide as the widest control it
 * can end up holding, so the Subscribe button beside it paints once, at its
 * final position.
 *
 * The signed-in menu is the widest at every breakpoint — 58px against "Sign
 * in" at ~35px below 480, 68px against ~43px above it — so its size is what
 * the slot reserves. Measured in the browser at 375px and 1280px, 2026-09-20.
 *
 * Before this the slot had no width at all while loading, and the Subscribe
 * button jumped 58.7px to the left the moment "Sign in" arrived.
 *
 * While loading, the slot holds "Sign in" marked `nav-signin` + `data-pending`,
 * so an anonymous reader gets it in the same frame as Subscribe. A reader this
 * browser last saw signed in has `<html data-identity>` set by the pre-paint
 * hint (`lib/user/identityHint.ts`), and foundations.css hides the pending
 * control — visibility, not display, so the reserved width stays. Once
 * `/api/me` answers the marker is gone and React alone decides.
 */
export default function AuthSlot({
  loading,
  isAuthenticated,
  isMember,
  signInClassName = "",
  userIconClassName = "",
}: AuthSlotProps) {
  return (
    <span
      // Keep these two widths in step with UserIcon's own sizing.
      className="inline-flex h-8 min-w-[58px] shrink-0 items-center justify-end 480:h-10 480:min-w-[68px]"
    >
      {loading ? (
        <SignInButton className={`nav-signin ${signInClassName}`} pending />
      ) : isAuthenticated ? (
        <UserIcon buttonClassName={userIconClassName} isMember={isMember} />
      ) : (
        <SignInButton className={signInClassName} />
      )}
    </span>
  );
}
