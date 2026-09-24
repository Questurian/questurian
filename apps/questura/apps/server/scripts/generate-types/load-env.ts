import { loadEnv } from 'payload/node'

// Imported before the config so `.env` is in place when the config's module
// scope reads it, the same order `payload generate:types` loads them in.
loadEnv()
