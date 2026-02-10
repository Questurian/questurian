import Link from 'next/link';

export function AdminRedirectView() {
  return (
    <div className="min-h-screen">
      <div className="px-6 pt-16 pb-16 768:pt-24">
        <div className="max-w-md mx-auto text-center">
          <h1 className="font-display text-[1.55rem] text-[#1A1A1A] mb-4 768:text-[1.85rem]">
            Admin Access
          </h1>
          <p className="text-[0.92rem] text-[#6b6a68] leading-[1.65] mb-8">
            Admin and editor accounts use the admin panel.
          </p>
          <Link
            href="/admin"
            className="
              inline-block bg-[#2C2C2C] hover:bg-[#1A1A1A]
              text-white py-3 px-8 rounded
              text-[0.88rem] font-medium transition-colors
              cursor-pointer
            "
          >
            Go to Admin Panel
          </Link>
        </div>
      </div>
    </div>
  );
}
