import type { StagedSourceSnapshot } from "@questurian/lm-shared";

export function orderStagedSourceSnapshots(
  sources: readonly StagedSourceSnapshot[],
): StagedSourceSnapshot[] {
  return [...sources].sort((left, right) => {
    if (left.origin !== right.origin) return left.origin === "instagram" ? -1 : 1;
    if (left.origin === "instagram") {
      if (left.instagramEmbedId !== right.instagramEmbedId) {
        return (right.instagramEmbedId ?? 0) - (left.instagramEmbedId ?? 0);
      }
      return (left.sourcePosition ?? 0) - (right.sourcePosition ?? 0);
    }
    return right.uploadId - left.uploadId;
  });
}
