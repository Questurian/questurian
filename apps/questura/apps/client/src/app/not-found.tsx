import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-md">
        <div className="bg-[#f7f6f2] border border-[#d7d4ce] rounded-sm p-8 text-center">
          <h1 className="font-display text-[2.1rem] text-[#1A1A1A]">
            404
          </h1>
          <p className="mt-2 font-display text-[1.15rem] text-[#1A1A1A]">
            Page Not Found
          </p>
          <p className="mt-2 text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-6">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <Link
            href="/"
            className="
              inline-block w-full bg-[#2C2C2C] hover:bg-[#1A1A1A]
              text-white text-center py-3.5 rounded
              text-[0.88rem] font-medium transition-colors
            "
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
