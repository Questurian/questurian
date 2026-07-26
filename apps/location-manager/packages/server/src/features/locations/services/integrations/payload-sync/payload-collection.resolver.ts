import { NotFoundError } from "@shared/errors/http-error";
import type { LocationCategory } from "../../../models/location";
import type { LocationQueryService } from "../../core/location-query.service";
import type { PayloadCollection } from "../mappers/location-payload.mapper";
import { mapCategoryToCollection } from "../mappers";

/** Resolves the Payload collection independently of sync execution policy. */
export class PayloadCollectionResolver {
  constructor(private readonly locationQuery: LocationQueryService) {}

  forLocation(locationId: number): PayloadCollection {
    const location = this.locationQuery.getLocationById(locationId);
    if (!location) {
      throw new NotFoundError("Location", locationId);
    }

    return this.forCategory(location.category);
  }

  forCategory(category: LocationCategory): PayloadCollection {
    return mapCategoryToCollection(category);
  }
}
