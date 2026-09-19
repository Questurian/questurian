/**
 * Where reader-facing photos come from (issue #566).
 *
 * Since `disablePayloadAccessControl` shipped on the server, every `<img src>`
 * and every `srcset` rung points at the Bunny pull zone rather than at
 * `api.questurian.com`. That makes the first photo on a cold visit pay for a
 * DNS lookup and a TLS handshake against a second origin before a byte moves,
 * which is what the preconnect in the root layout exists to remove.
 *
 * The host is not written down here. It is configuration, exactly as it is on
 * the server (`BUNNY_STORAGE_HOSTNAME`), so the two cannot be edited apart.
 * `NEXT_PUBLIC_*` is inlined at build time, so this is a constant in the
 * bundle, not a runtime lookup.
 *
 * Unset means no preconnect -- a missed optimisation, never a broken page. The
 * image URLs themselves come from the server and do not depend on this value.
 */
const configured = process.env.NEXT_PUBLIC_IMAGE_CDN_ORIGIN?.trim()

export const IMAGE_CDN_ORIGIN: string | null = configured ? configured : null
