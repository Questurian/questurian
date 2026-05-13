import type { Payload } from 'payload'

export type PayloadFindWhere = NonNullable<Parameters<Payload['find']>[0]['where']>
