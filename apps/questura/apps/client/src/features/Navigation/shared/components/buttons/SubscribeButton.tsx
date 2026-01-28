"use client";

/**
 * Breakpoints from globals.css:
 * --breakpoint-280: 280px
 * --breakpoint-320: 320px
 * --breakpoint-380: 380px
 * --breakpoint-640: 640px
 * --breakpoint-768: 768px
 * --breakpoint-1024: 1024px
 * --breakpoint-1280: 1280px
 * --breakpoint-1536: 1536px
 */
export default function SubscribeButton() {
  return (
    <button
      className={`
        /* Base styles */
        cursor-pointer
        h-[32px] w-[70px] px-1.5 text-[0.690rem]
        bg-[rgb(70,139,230)] text-white font-semibold rounded
        hover:opacity-90 transition-opacity
         /* 280px breakpoint */
         /* 320px breakpoint */
         /* 380px breakpoint */
         380:h-[32px] 380:w-[90px] 380:px-1.5 380:text-[0.690rem]
         /* 480px breakpoint */
         480:h-[40px] 480:w-[125px] 480:px-1.5 480:text-[.850rem]
         /* 550px breakpoint */
         550:h-[40px] 550:w-[234px] 550:px-1.5 550:text-[.850rem]
      `}
    >
      <span className="380:hidden">Subscribe</span>
      <span className="hidden 380:inline 550:hidden">Join: $1.50/wk</span>
      <span className="hidden 550:inline">Subscribe: Less than $1.50/wk</span>

    </button>
  );
}
