export function normalizeDocResponse<T extends { id?: string | number }>(
  result: unknown,
  context: string
): { message?: string; doc: T } {
  if (result && typeof result === "object") {
    const obj = result as { doc?: T; message?: string; id?: string | number };
    if (obj.doc && typeof obj.doc === "object") {
      return { message: obj.message, doc: obj.doc };
    }

    if (obj.id !== undefined) {
      return { message: "", doc: result as T };
    }
  }

  console.error(`[Payload] Unexpected ${context} response format`, result);
  throw new Error(`Unexpected Payload response format for ${context}`);
}
