import type { Payload } from 'payload'

import type { LoggerLike } from '@/types'

import { seedLocations } from './seed'

const LOCATION_STARTUP_TASK_KEY = '__questuraLocationStartupTask'

export function ensureLocationStartupTask(
  payload: Payload,
  logger: LoggerLike,
): Promise<void> {
  const globalScope = globalThis as typeof globalThis & {
    [LOCATION_STARTUP_TASK_KEY]?: Promise<void>
  }

  if (globalScope[LOCATION_STARTUP_TASK_KEY]) {
    return globalScope[LOCATION_STARTUP_TASK_KEY]!
  }

  const task = (async () => {
    try {
      const result = await payload.find({
        collection: 'locations',
        limit: 1,
        depth: 0,
        overrideAccess: true,
      } as any)

      const count = typeof result.totalDocs === 'number' ? result.totalDocs : result.docs?.length ?? 0

      if (count === 0) {
        logger.info('No locations found. Seeding default locations.')
        await seedLocations(payload)
        logger.info('Location seeding complete.')
      } else {
        logger.info('Locations already present. Skipping seed.', { count })
      }
    } catch (error) {
      logger.warn('Location startup task failed.', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })()

  globalScope[LOCATION_STARTUP_TASK_KEY] = task
  return task
}
