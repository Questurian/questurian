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
 * Still visible, and not fixable here: a signed-in member sees the Subscribe
 * button for one beat before it is removed, because membership is only known
 * once the same request answers. Reserving its 234px for everyone would be a
 * worse trade.
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
      {loading ? null : isAuthenticated ? (
        <UserIcon buttonClassName={userIconClassName} isMember={isMember} />
      ) : (
        <SignInButton className={signInClassName} />
      )}
    </span>
  );
}
