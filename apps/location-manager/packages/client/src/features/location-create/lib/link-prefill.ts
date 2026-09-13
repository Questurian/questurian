import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Step-one values handed over in the address, so another tool can open an Add
 * form already filled in: `/add/dining?name=…&address=…&tripadvisorUrl=…`.
 *
 * Only the fields the operator would type before running the Google lookup.
 * The lookup itself is not started -- it spends, and it is still the
 * operator's press.
 */
export interface LinkPrefill {
  name: string;
  address: string;
  tripadvisorUrl: string;
}

export function readLinkPrefill(params: URLSearchParams): LinkPrefill | null {
  const value = (key: string) => params.get(key)?.trim() ?? "";
  const prefill = {
    name: value("name"),
    address: value("address"),
    tripadvisorUrl: value("tripadvisorUrl"),
  };
  return prefill.name || prefill.address ? prefill : null;
}

/**
 * Apply a link's values once, over any restored draft, then take them out of
 * the address so a reload does not overwrite what the operator changed since.
 *
 * Declare it after the form's draft hook: effects run in order, so the link
 * lands on top of the draft. No run-once guard on purpose -- StrictMode mounts
 * twice and restores the draft twice, and the link has to win both times.
 */
export function useLinkPrefill(apply: (prefill: LinkPrefill) => void) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const prefill = readLinkPrefill(params);
    if (!prefill) return;
    apply(prefill);
    setParams({}, { replace: true });
    // Read on mount only; the address is cleared right after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
