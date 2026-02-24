export function getParamValue(param: string | string[] | undefined): string | undefined {
  if (typeof param === "string") {
    return param;
  }

  if (Array.isArray(param)) {
    return param[0];
  }

  return undefined;
}

export function formatSlugLabel(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
