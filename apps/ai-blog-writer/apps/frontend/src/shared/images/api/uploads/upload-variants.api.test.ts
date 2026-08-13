import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VARIANT_SEQUENCE, type ImageVariantType } from '../../utils/imageProcessing';
import { postFormData } from '../client/imageApiClient';
import { uploadVariantsApi, validateVariantFilesForUpload } from './upload-variants.api';

vi.mock('../client/imageApiClient', () => ({
  postFormData: vi.fn(),
}));

vi.mock('../errors/image-api-error.utils', () => ({
  normalizeRequestError: (error: unknown) => error,
  parseErrorMessage: vi.fn(),
}));

function fileFor(type: ImageVariantType) {
  return {
    type,
    file: new File([`bytes-${type}`], `${type}.webp`, { type: 'image/webp' }),
  };
}

describe('uploadVariantsApi validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts exactly one file for every required variant', () => {
    expect(() => {
      validateVariantFilesForUpload(VARIANT_SEQUENCE.map(fileFor));
    }).not.toThrow();
  });

  it('rejects missing variants before posting form data', async () => {
    await expect(
      uploadVariantsApi({
        variantFiles: VARIANT_SEQUENCE.slice(0, -1).map(fileFor),
        externalRef: 'featured-upload',
        altText: 'Alt text',
        locationRef: 1,
        photographerCredit: 'Credit',
      })
    ).rejects.toThrow('Exactly 7 crop variants are required before upload.');

    expect(postFormData).not.toHaveBeenCalled();
  });

  it('rejects duplicate variants before posting form data', async () => {
    const duplicateFiles = [
      ...VARIANT_SEQUENCE.slice(0, -1).map(fileFor),
      fileFor('wide'),
    ];

    await expect(
      uploadVariantsApi({
        variantFiles: duplicateFiles,
        externalRef: 'featured-upload',
        altText: 'Alt text',
        locationRef: 1,
        photographerCredit: 'Credit',
      })
    ).rejects.toThrow('Duplicate: wide.');

    expect(postFormData).not.toHaveBeenCalled();
  });
});
