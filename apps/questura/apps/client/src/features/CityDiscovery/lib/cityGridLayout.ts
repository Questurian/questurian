import { cities } from './data';

export type CardVariant = 'default' | 'featured';
export type FeaturedCityId = 'lima' | 'medellin' | 'cartagena' | 'mexico-city' | 'sao-paulo' | 'rio';
export type LayoutRequestMode = 'hover' | 'canonical';

export interface LayoutSlot {
  colStart: 1 | 2 | 3;
  rowStart: 1 | 2 | 3;
  colSpan: 1 | 2;
  rowSpan: 1 | 2;
  variant: CardVariant;
}

export interface GridCell {
  col: 1 | 2 | 3;
  row: 1 | 2 | 3;
}

export interface LayoutRequest {
  cityId: FeaturedCityId;
  mode: LayoutRequestMode;
}

export const TOP_GRID_ANIMATION_DELAYS = ['0.5s', '0.57s', '0.64s', '0.71s', '0.78s', '0.85s'];
export const FLIP_DURATION_MS = 620;
export const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const CANONICAL_FEATURED_CITY: FeaturedCityId = 'lima';
export const TOP_GRID_CITY_IDS: FeaturedCityId[] = ['lima', 'medellin', 'cartagena', 'mexico-city', 'sao-paulo', 'rio'];
export const TOP_GRID_CITIES = cities.slice(0, 6) as Array<(typeof cities)[number] & { id: FeaturedCityId }>;

const BASE_CELL_BY_CITY_ID: Record<FeaturedCityId, GridCell> = {
  lima: { col: 1, row: 1 },
  medellin: { col: 3, row: 1 },
  cartagena: { col: 3, row: 2 },
  'mexico-city': { col: 1, row: 3 },
  'sao-paulo': { col: 2, row: 3 },
  rio: { col: 3, row: 3 },
};

const ALL_GRID_CELLS: GridCell[] = [
  { col: 1, row: 1 },
  { col: 2, row: 1 },
  { col: 3, row: 1 },
  { col: 1, row: 2 },
  { col: 2, row: 2 },
  { col: 3, row: 2 },
  { col: 1, row: 3 },
  { col: 2, row: 3 },
  { col: 3, row: 3 },
];

function getCellKey(cell: GridCell): string {
  return `${cell.col}-${cell.row}`;
}

function clampFeaturedStart(value: number): 1 | 2 {
  if (value <= 1) return 1;
  return 2;
}

export function getLayoutSlotClassName(slot: LayoutSlot): string {
  const sharedClasses = `1024:col-start-${slot.colStart} 1024:row-start-${slot.rowStart}`;

  if (slot.variant === 'featured') {
    return `380:col-span-2 1024:col-span-${slot.colSpan} 1024:row-span-${slot.rowSpan} ${sharedClasses}`;
  }

  return sharedClasses;
}

export function resolveLayoutSlots(
  featuredCityId: FeaturedCityId,
  anchorCell?: GridCell
): Record<FeaturedCityId, LayoutSlot> {
  const featuredBaseCell = anchorCell ?? BASE_CELL_BY_CITY_ID[featuredCityId];
  const featuredStartCol = clampFeaturedStart(featuredBaseCell.col - 1);
  const featuredStartRow = clampFeaturedStart(featuredBaseCell.row - 1);
  const featuredOccupiedCells = new Set<string>([
    getCellKey({ col: featuredStartCol, row: featuredStartRow }),
    getCellKey({ col: (featuredStartCol + 1) as 2 | 3, row: featuredStartRow }),
    getCellKey({ col: featuredStartCol, row: (featuredStartRow + 1) as 2 | 3 }),
    getCellKey({ col: (featuredStartCol + 1) as 2 | 3, row: (featuredStartRow + 1) as 2 | 3 }),
  ]);

  const availableCells = ALL_GRID_CELLS.filter((cell) => !featuredOccupiedCells.has(getCellKey(cell)));
  const slotByCityId = {} as Record<FeaturedCityId, LayoutSlot>;

  slotByCityId[featuredCityId] = {
    colStart: featuredStartCol,
    rowStart: featuredStartRow,
    colSpan: 2,
    rowSpan: 2,
    variant: 'featured',
  };

  let availableCellIndex = 0;
  TOP_GRID_CITY_IDS.forEach((cityId) => {
    if (cityId === featuredCityId) {
      return;
    }

    const nextCell = availableCells[availableCellIndex];
    availableCellIndex += 1;

    slotByCityId[cityId] = {
      colStart: nextCell.col,
      rowStart: nextCell.row,
      colSpan: 1,
      rowSpan: 1,
      variant: 'default',
    };
  });

  return slotByCityId;
}
