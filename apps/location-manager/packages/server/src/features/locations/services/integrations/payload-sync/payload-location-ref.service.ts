import { BadRequestError } from "@shared/errors/http-error";
import { updateLocationById } from "../../../repositories/core";
import type { LocationResponse } from "../../../models/location";
import type { PayloadApiClient } from "../clients/payload-api.client";

export interface ResolvedLocationRef {
  value: string;
  source: "stored" | "auto-resolved (was null)";
}

/** Resolves and persists the Payload hierarchy reference required by location sync. */
export class PayloadLocationRefService {
  constructor(private readonly payloadClient: PayloadApiClient) {}

  async resolve(location: LocationResponse): Promise<ResolvedLocationRef> {
    const storedRef = location.payload_location_ref;
    if (storedRef) {
      console.log(`✓ Using stored locationRef for location ${location.id}: ${storedRef}`);
      return { value: storedRef, source: "stored" };
    }

    console.warn(
      `⚠️  Location ${location.id} missing payload_location_ref, auto-resolving...`
    );

    // Keep this dynamic import to avoid the circular dependency guarded by the legacy service.
    const { resolvePayloadLocationRef } = await import("../resolvers");
    const resolvedRef = await resolvePayloadLocationRef(location, this.payloadClient);

    if (!resolvedRef) {
      throw new BadRequestError(
        `Failed to resolve Payload location for locationKey: ${location.locationKey || "none"}. ` +
          "Ensure the location hierarchy exists in Payload CMS."
      );
    }

    const updated = updateLocationById(location.id, {
      payload_location_ref: resolvedRef,
    });
    if (!updated) {
      console.warn(
        `⚠️  Failed to save payload_location_ref to database for location ${location.id}`
      );
    } else {
      console.log(`✅ Auto-resolved and saved locationRef: ${resolvedRef}`);
    }

    return { value: resolvedRef, source: "auto-resolved (was null)" };
  }
}
