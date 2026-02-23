import type { PipelineDependencies } from "../../../../types/reviews-pipeline.types";
import { runTranslateAndMergeReviews } from "../../translate-merge/orchestration.service";

export interface PipelineMergeDependency {
  merge: PipelineDependencies["merge"];
}

export function createPipelineMergeDependency(): PipelineMergeDependency {
  return {
    merge: async (locationId, includeGoogle, includeTripadvisor) => {
      const merged = await runTranslateAndMergeReviews(locationId, {
        includeGoogle,
        includeTripadvisor,
      });

      return {
        filename: merged.filename,
        stats: merged.stats,
        rejectsReport: merged.rejectsReport,
      };
    },
  };
}
