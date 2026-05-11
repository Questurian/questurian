import type { ButtonHTMLAttributes, JSX } from 'react'

export type AddOnGoogleButtonVariant = 'google' | 'editorial'

export type AddOnGoogleButtonProps = {
  /**
   * Visual variant.
   * - `'google'` — Google-branded button (white surface, Roboto, 4px corners,
   *   official-feeling Google G logo). Use this anywhere we want the action
   *   to read as a first-party Google integration.
   * - `'editorial'` — Pill button styled to match the magazine header
   *   (Playfair display font, full rounded corners, foreground border).
   *   Use this on heavily editorial surfaces where a plain Google button
   *   would clash with the typographic system.
   */
  variant?: AddOnGoogleButtonVariant
  label?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

function GoogleG({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

/**
 * "Add Us On Google" button with two visual treatments.
 * Default is `'google'` (Material-style, brand-faithful).
 */
export function AddOnGoogleButton({
  variant = 'google',
  label = 'Add Us On Google',
  className,
  type = 'button',
  ...rest
}: AddOnGoogleButtonProps): JSX.Element {
  if (variant === 'editorial') {
    return (
      <button
        type={type}
        className={[
          'inline-flex items-center justify-center gap-2',
          'rounded-full border border-foreground/25 bg-background',
          'px-4 py-2 font-display text-[12px] font-medium tracking-[0.01em] text-foreground',
          'transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06]',
          '380:px-5 380:py-2.5 380:text-[13px]',
          'sm:px-6 sm:py-2.5 sm:text-[14px]',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        <GoogleG size={16} />
        {label}
      </button>
    )
  }

  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2.5',
        'rounded-[6px] border border-foreground/15 bg-[var(--cream)]',
        'px-4 py-[9px] font-roboto text-[14px] font-medium leading-none tracking-[0.01em] text-foreground',
        'shadow-[0_1px_2px_rgba(26,26,26,0.05)] transition-[box-shadow,background-color,border-color] duration-150',
        'hover:border-foreground/25 hover:bg-[#FFFCF6] hover:shadow-[0_1px_2px_rgba(26,26,26,0.06),0_2px_6px_rgba(26,26,26,0.06)]',
        'active:bg-[var(--background-warm)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a73e8]',
        '380:px-[18px] 380:py-[10px]',
        'sm:px-5 sm:py-[11px]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      <GoogleG size={18} />
      {label}
    </button>
  )
}
