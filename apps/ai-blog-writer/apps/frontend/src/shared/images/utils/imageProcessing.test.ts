import { describe, expect, it } from 'vitest';
import type { Area } from 'react-easy-crop';
import {
  VARIANT_SEQUENCE,
  createMultiVariantImages,
  initializeCropStates,
} from './imageProcessing';

describe('imageProcessing crop states', () => {
  it('initializes draft crop areas without marking variants complete', () => {
    const states = initializeCropStates(1600, 1200);

    for (const type of VARIANT_SEQUENCE) {
      expect(states[type].draftAreaPixels).not.toBeNull();
      expect(states[type].croppedAreaPixels).toBeNull();
      expect(states[type].completed).toBe(false);
    }
  });

  it('requires confirmed crop areas before creating variants', async () => {
    const states = initializeCropStates(1600, 1200);
    const draftCrop = states.thumbnail.draftAreaPixels as Area;
    states.thumbnail = {
      ...states.thumbnail,
      croppedAreaPixels: draftCrop,
      completed: true,
    };

    await expect(
      createMultiVariantImages('blob:test', states, 'source.jpg')
    ).rejects.toThrow('Missing crop data for variant: square');
  });
});
