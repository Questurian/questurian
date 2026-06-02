import { createContext, useContext, type PropsWithChildren } from "react";
import type { NightlifeFormState } from "./nightlife-form.types";

const NightlifeFormContext = createContext<NightlifeFormState | null>(null);

export function NightlifeFormProvider({
  children,
  state,
}: PropsWithChildren<{ state: NightlifeFormState }>) {
  return <NightlifeFormContext.Provider value={state}>{children}</NightlifeFormContext.Provider>;
}

export function useNightlifeForm() {
  const context = useContext(NightlifeFormContext);
  if (!context) {
    throw new Error("useNightlifeForm must be used within NightlifeFormProvider");
  }
  return context;
}
