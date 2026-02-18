import { AddLocation } from "./AddLocation";

export function AddRestaurantLocation() {
  return (
    <AddLocation
      forcedCategory="dining"
      heading="Add Restaurant"
      hideCategoryField
    />
  );
}
