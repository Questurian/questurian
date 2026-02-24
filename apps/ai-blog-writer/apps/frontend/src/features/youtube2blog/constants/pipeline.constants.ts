export const STAGE_ORDER = [
  'stage_0',
  'stage_1',
  'stage_2',
  'stage_3',
  'stage_editorial_augmentation',
  'stage_4',
  'complete',
] as const

export const STAGE_LABELS: Record<string, string> = {
  stage_0: 'Stage 0: Input received',
  stage_1: 'Stage 1: Transcript cleaned',
  stage_2: 'Stage 2: Article classified',
  stage_3: 'Stage 3: Article composed',
  stage_editorial_augmentation: 'Stage 4: Editorial augmentation',
  stage_4: 'Stage 5: Title generated',
  complete: 'Complete',
}
