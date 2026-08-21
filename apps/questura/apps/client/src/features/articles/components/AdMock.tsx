/**
 * The mock ad surface, shared by the rail and the reading column so the two
 * read as one system.
 *
 * Placeholder for now. When a network is wired in, the creative mounts inside
 * `AdMockSurface`'s box from a client component -- the standard article shell
 * is `force-static`, so no ad script may run during the cached server render,
 * and none of it may touch a node React updates (see `InstagramEmbedBlock`).
 *
 * The "Advertisement" label is not decoration. It is the disclosure, and it
 * stays visible on every slot.
 */

const sansClass = 'font-[family-name:var(--font-dm-sans)]'

export function AdLabel({ className = '' }: { className?: string }) {
  return (
    <p
      className={`text-center ${sansClass} text-[9px] uppercase tracking-[0.2em] text-foreground/40 ${className}`}
    >
      Advertisement
    </p>
  )
}

/**
 * The reserved box. Always give it a fixed height through `className` -- an ad
 * that sizes itself after load shoves the article down under the reader.
 */
export function AdMockSurface({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex w-full items-center justify-center border border-foreground/12 bg-foreground/[0.04] ${className}`}
      aria-hidden
    >
      <span className={`${sansClass} text-[10px] uppercase tracking-[0.16em] text-foreground/25`}>
        Ad space
      </span>
    </div>
  )
}
