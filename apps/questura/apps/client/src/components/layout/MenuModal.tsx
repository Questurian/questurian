"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useAuth } from "@/lib/user/hooks";
import { useLoginModalStore } from "@/lib/stores/loginModalStore";

interface MenuModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MenuModal({ isOpen, onClose }: MenuModalProps) {
  const { isAuthenticated } = useAuth();
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal);

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes menuSlideIn {
          from {
            transform: translateX(-18px);
            opacity: 0.65;
          }
          to {
            transform: translateX(0px);
            opacity: 1;
          }
        }

        @keyframes menuSlideDown {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(0);
          }
        }

        @keyframes menuFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .menu-sheet-enter {
          animation: menuSlideIn 0.25s ease-out forwards;
        }

        @media (min-width: 1024px) {
          .menu-sheet-enter {
            animation: menuSlideDown 0.35s ease-out forwards;
          }
        }

        .menu-overlay-enter {
          animation: menuFadeIn 0.2s ease-out forwards;
        }
      `}</style>

      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="Close menu"
          className="menu-overlay-enter absolute inset-0 bg-black/40"
          onClick={onClose}
        />

        <aside className="menu-sheet-enter relative h-full w-[84%] max-w-[360px] border-r border-white/15 bg-[#1f1f1f] px-5 py-6 text-white shadow-2xl 1024:w-full 1024:max-w-none 1024:border-r-0">
          <div className="mb-7 flex items-center justify-between">
            <h2 className="font-display text-[1.15rem] tracking-[0.08em] uppercase">
              Menu
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 transition-colors hover:bg-white/10 focus:outline-none"
              aria-label="Close modal"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          <div className="space-y-2">
            <Link
              href="/join"
              onClick={onClose}
              className="block rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold transition-colors hover:bg-white/10"
            >
              Join Membership
            </Link>

            {isAuthenticated ? (
              <Link
                href="/account"
                onClick={onClose}
                className="block rounded-xl border border-white/10 px-3.5 py-3 text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Account
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openLoginModal();
                }}
                className="block w-full rounded-xl border border-white/10 px-3.5 py-3 text-left text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Sign In
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
