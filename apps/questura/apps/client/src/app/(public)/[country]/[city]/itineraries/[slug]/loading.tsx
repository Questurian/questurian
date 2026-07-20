import type { JSX } from 'react'

function Block({ className }: { className: string }): JSX.Element {
  return <span className={`itinerary-skeleton-block ${className}`} />
}

export default function ItineraryArticleLoading(): JSX.Element {
  return (
    <div
      aria-busy="true"
      data-article-layout="listicle"
      className="relative 1024:flex 1024:min-h-screen 1024:max-w-[1600px] 1024:mx-auto"
    >
      <div className="maps-article-column 1024:min-w-0 1024:pt-[25px]">
        <article className="maps-listicle-article min-h-screen bg-background sm:mx-auto sm:max-w-[600px] 1024:mx-0 1024:max-w-none">
          <section
            data-article-header
            aria-hidden="true"
            className="mx-3 overflow-hidden rounded-none border-[3px] border-double border-foreground bg-background px-4 pb-7 pt-7 380:mx-4 380:px-6 380:pb-8 380:pt-9 480:mx-5 480:px-7 480:pb-9 480:pt-10 550:mx-6 sm:mx-8 sm:px-10 sm:pb-10 sm:pt-12 768:mx-10 768:px-12 768:pb-11 768:pt-14 1024:mx-10 1024:p-0"
          >
            <div className="flex flex-col items-center text-center">
              <Block className="itinerary-skeleton-circle mb-5 size-20 380:size-24 480:size-28 sm:mb-6 sm:size-32 768:size-36" />

              <div className="flex w-full max-w-[34rem] flex-col items-center gap-2.5 480:gap-3">
                <Block className="h-7 w-[92%] 480:h-9 sm:h-10" />
                <Block className="h-7 w-[68%] 480:h-9 sm:h-10" />
              </div>

              <div className="mt-5 flex w-full max-w-[44ch] flex-col items-center gap-2">
                <Block className="h-4 w-[86%]" />
                <Block className="h-4 w-[64%]" />
              </div>

              <div className="my-5 flex w-full max-w-[44ch] items-center gap-2 sm:my-6">
                <Block className="h-[3px] flex-1" />
                <Block className="itinerary-skeleton-circle size-3.5" />
                <Block className="h-[3px] flex-1" />
              </div>

              <Block className="h-3 w-36" />
              <Block className="mt-2 h-3 w-24" />
              <Block className="mt-5 h-10 w-44 rounded-[6px]" />

              <div className="mt-4 flex gap-4">
                <Block className="h-3 w-16" />
                <Block className="h-3 w-16" />
              </div>
            </div>
          </section>

          <div aria-hidden="true" className="px-3 pb-2 pt-6 380:px-4 380:pb-3 380:pt-8 480:px-5 480:pb-4 480:pt-10 550:px-6 sm:px-8 sm:pb-5 sm:pt-10 768:px-10">
            <div className="space-y-3">
              <Block className="h-4 w-full" />
              <Block className="h-4 w-[96%]" />
              <Block className="h-4 w-[72%]" />
            </div>
          </div>

          <div aria-hidden="true" className="mx-3 mt-5 border-t-[3px] border-double border-foreground/55 380:mx-4 480:mx-5 550:mx-6 sm:mx-8 768:mx-10" />

          <div aria-hidden="true" className="px-3 pb-20 pt-6 380:px-4 380:pt-7 480:px-5 480:pb-24 480:pt-8 550:px-6 550:pt-10 sm:px-8 sm:pb-32 sm:pt-8 768:px-10">
            <div className="mb-5 flex gap-5 border-b border-foreground/15 pb-3">
              <Block className="h-3 w-14" />
              <Block className="h-3 w-14" />
            </div>

            <Block className="aspect-[16/10] w-full 380:aspect-[4/3] 480:aspect-[3/2] sm:aspect-[16/9]" />

            <div className="mt-5 space-y-3">
              <Block className="h-7 w-[76%]" />
              <Block className="h-4 w-[48%]" />
              <div className="pt-1">
                <Block className="h-4 w-full" />
                <Block className="mt-2 h-4 w-full" />
                <Block className="mt-2 h-4 w-[68%]" />
              </div>
              <Block className="mt-5 h-12 w-full rounded-md" />
            </div>
          </div>
        </article>
      </div>

      <div
        aria-hidden="true"
        className="maps-map-divider pointer-events-none hidden 1024:absolute 1024:bottom-0 1024:top-[25px] 1024:z-20 1024:block 1024:w-px"
      />

      <div
        aria-hidden="true"
        className="maps-map-column hidden 1024:sticky 1024:flex 1024:self-start 1024:flex-col"
      >
        <Block className="min-h-0 flex-1 rounded-none" />
        <div className="border-t border-black/10 bg-background px-4 py-3">
          <Block className="mb-3 h-3 w-28" />
          <div className="flex gap-2">
            <Block className="h-10 flex-1" />
            <Block className="h-10 flex-1" />
          </div>
        </div>
      </div>
    </div>
  )
}
