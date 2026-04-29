import { User } from '@/lib/user/types';
import { useRouter } from 'next/navigation';

interface EmailSectionProps {
  user: User | null;
}

export function EmailSection({ user }: EmailSectionProps) {
  const router = useRouter();
  const hasPassword = user?.hasLocalPassword || user?.authProvider === 'local' || user?.authProvider === 'dual';

  return (
    <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-4 480:p-6 768:p-8">
      <div className="flex flex-col 480:flex-row 480:justify-between 480:items-start">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-[1rem] 480:text-[1.1rem] text-[#1A1A1A] mb-1.5 768:text-[1.2rem]">
            Email
          </h3>
          <p className="text-[0.8rem] 480:text-[0.84rem] text-[#6b6a68] leading-[1.65] mb-3 480:mb-4">
            Use this email to sign in. This is also where we&apos;ll send email communication and newsletters.
          </p>
          <div className="text-[0.85rem] 480:text-[0.9rem] text-[#1A1A1A] font-medium mb-1.5 break-all">
            {user?.email}
          </div>
          {!hasPassword && (
            <p className="text-[0.75rem] 480:text-[0.78rem] text-[#C65D3B]">
              You must add a password to your account before changing your email.
            </p>
          )}
        </div>
        {hasPassword ? (
          <button
            onClick={() => router.push('/account/change-email')}
            className="
              text-[0.82rem] text-[#6b6a68] hover:text-[#1A1A1A]
              underline underline-offset-2 480:ml-4 cursor-pointer
              transition-colors mt-3 480:mt-0 self-start
            "
          >
            Edit
          </button>
        ) : (
          <span className="text-[0.82rem] text-[#c4c2be] 480:ml-4 cursor-not-allowed mt-3 480:mt-0 self-start">
            Edit
          </span>
        )}
      </div>
    </div>
  );
}
