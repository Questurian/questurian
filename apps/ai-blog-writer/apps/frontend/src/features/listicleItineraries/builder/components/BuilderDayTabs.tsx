type BuilderDayTabsProps = {
  dayCount: number
  activeDayIndex: number
  dayIds: string[]
  onActiveDayChange: (dayIndex: number) => void
}

export function BuilderDayTabs({
  dayCount,
  activeDayIndex,
  dayIds,
  onActiveDayChange,
}: BuilderDayTabsProps) {
  if (dayCount <= 1) return null

  return (
    <div className="stl-day-tabs" role="tablist" aria-label="Itinerary days">
      {Array.from({ length: dayCount }, (_, dayTabIndex) => (
        <button
          key={dayIds[dayTabIndex] ?? `day_tab_${dayTabIndex}`}
          type="button"
          className={activeDayIndex === dayTabIndex ? 'stl-day-tab stl-day-tab--active' : 'stl-day-tab'}
          role="tab"
          aria-selected={activeDayIndex === dayTabIndex}
          onClick={() => onActiveDayChange(dayTabIndex)}
        >
          Day {dayTabIndex + 1}
        </button>
      ))}
    </div>
  )
}
