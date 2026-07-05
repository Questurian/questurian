'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

export type ListicleMapPoint = {
  /** Listicle row id - rows can share a venue, so keys must come from the row. */
  id: string
  index: number
  title: string
  lat: number
  lng: number
}

type ListicleMapSyncValue = {
  points: ListicleMapPoint[]
  activeId: string | null
  registerEntry: (id: string, el: HTMLElement | null) => void
}

const ListicleMapSyncContext = createContext<ListicleMapSyncValue>({
  points: [],
  activeId: null,
  registerEntry: () => {},
})

// The workspace hoists a second @types/react copy, which makes TS reject
// Provider's ProviderExoticComponent type as a JSX element; alias it to a
// plain component signature (identical at runtime).
const MapSyncProvider = ListicleMapSyncContext.Provider as unknown as (props: {
  value: ListicleMapSyncValue
  children: ReactNode
}) => JSX.Element

export function useListicleMapSync(): ListicleMapSyncValue {
  return useContext(ListicleMapSyncContext)
}

/**
 * Tracks which listicle entry sits in a band around the viewport center and
 * exposes it as `activeId` so the map can follow the reader. No entry in the
 * band (e.g. the article header at the top of the page) means `activeId` is
 * null - the map shows the wide all-pins view.
 */
export function ListicleMapSyncProvider({
  points,
  children,
}: {
  points: ListicleMapPoint[]
  children: ReactNode
}): JSX.Element {
  const [activeId, setActiveId] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const elementsById = useRef(new Map<string, HTMLElement>())
  const idsByElement = useRef(new Map<Element, string>())
  const inBand = useRef(new Set<string>())

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = idsByElement.current.get(entry.target)
          if (!id) continue
          if (entry.isIntersecting) inBand.current.add(id)
          else inBand.current.delete(id)
        }

        let nextId: string | null = null
        let nextTop = Infinity
        for (const id of inBand.current) {
          const el = elementsById.current.get(id)
          if (!el) continue
          const top = el.getBoundingClientRect().top
          if (top < nextTop) {
            nextTop = top
            nextId = id
          }
        }
        setActiveId(nextId)
      },
      // Band from 35% to 45% of viewport height: the entry crossing it is
      // the one the reader is looking at.
      { rootMargin: '-35% 0px -55% 0px', threshold: 0 },
    )

    observerRef.current = observer
    for (const el of elementsById.current.values()) observer.observe(el)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [])

  const registerEntry = useCallback((id: string, el: HTMLElement | null) => {
    const previous = elementsById.current.get(id)
    if (previous) {
      observerRef.current?.unobserve(previous)
      idsByElement.current.delete(previous)
      elementsById.current.delete(id)
      inBand.current.delete(id)
    }
    if (el) {
      elementsById.current.set(id, el)
      idsByElement.current.set(el, id)
      observerRef.current?.observe(el)
    }
  }, [])

  const value = useMemo(
    () => ({ points, activeId, registerEntry }),
    [points, activeId, registerEntry],
  )

  return <MapSyncProvider value={value}>{children}</MapSyncProvider>
}
