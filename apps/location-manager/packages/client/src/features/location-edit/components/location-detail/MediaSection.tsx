import type { LocationResponse } from "@client/shared/services/api/types/location.types";
import { DetailSection, DetailRow, ReadOnlyValue } from "../DetailLayout";

export function MediaSection({ location }: { location: LocationResponse }) {
  return (
    <DetailSection title="Media">
      <DetailRow label="Uploads">
        <ReadOnlyValue value={location.uploads.length} />
      </DetailRow>
      <DetailRow label="Instagram embeds">
        <ReadOnlyValue value={location.instagram_embeds.length} />
      </DetailRow>
    </DetailSection>
  );
}
