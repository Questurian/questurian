import type { JSX } from 'react'

export function ListicleSeparator(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="mx-3 flex items-center gap-1 text-foreground 380:mx-4 480:mx-5 550:mx-6 sm:mx-8 768:mx-10"
    >
      <div className="box-border min-h-[3px] flex-1 border-x-0 border-b-0 border-t-[3px] border-double border-t-foreground" />
      <div className="box-border size-[14px] shrink-0 rotate-45 border-[3px] border-double border-foreground bg-background" />
      <div className="box-border min-h-[3px] flex-1 border-x-0 border-b-0 border-t-[3px] border-double border-t-foreground" />
    </div>
  )
}
