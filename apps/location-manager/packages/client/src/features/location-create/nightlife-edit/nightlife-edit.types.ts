import { z } from "zod";
import { NIGHTLIFE_IDEAL_FOR_TAGS } from "@questurian/lm-shared";
import { addNightlifeSchema } from "../validation/add-nightlife.schema";
import { NIGHTLIFE_FORM_DEFAULT_VALUES } from "../nightlife-create/nightlife-create.types";

export const editNightlifeSchema = addNightlifeSchema.extend({
  countryCode: z
    .string()
    .trim()
    .length(2, "Country code must be 2 letters")
    .transform((value) => value.toUpperCase()),
});

export type EditNightlifeFormData = z.infer<typeof editNightlifeSchema>;
export type NightlifeEditMultiField = "music" | "spaceLayout" | "vibe" | "musicFormat" | "dressCode";

export const NIGHTLIFE_EDIT_FORM_DEFAULT_VALUES: EditNightlifeFormData = {
  ...NIGHTLIFE_FORM_DEFAULT_VALUES,
  idealFor: [NIGHTLIFE_IDEAL_FOR_TAGS[0]],
};

export const NIGHTLIFE_COUNTRY_OPTIONS = [
  { value: "PE", label: "Peru (PE)" },
  { value: "CO", label: "Colombia (CO)" },
  { value: "BR", label: "Brazil (BR)" },
  { value: "MX", label: "Mexico (MX)" },
  { value: "AR", label: "Argentina (AR)" },
  { value: "CL", label: "Chile (CL)" },
];
