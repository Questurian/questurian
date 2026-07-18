import type { CollectionConfig } from 'payload'
import { isAdmin } from '../../auth/access/isAdmin'

/**
 * EmailLogs — append-only delivery log for transactional emails.
 *
 * Rows are written server-side only (via recordEmailLog in ../lib/email-log);
 * the REST/admin surface is read-only for admins so the log stays a faithful
 * audit trail. Admins may delete rows to prune history.
 *
 * Tracking is optional by design: set EMAIL_TRACKING=false to stop writing
 * rows without touching any send path, or drop this collection + the
 * recordEmailLog call sites to remove the system entirely.
 */
export const EmailLogs: CollectionConfig = {
  slug: 'email-logs',
  // Read-only audit rows never need admin-panel edit locking, and opting out
  // keeps this collection out of payload_locked_documents_rels.
  lockDocuments: false,
  admin: {
    group: 'Core',
    useAsTitle: 'subject',
    defaultColumns: ['emailType', 'recipient', 'status', 'createdAt'],
    description:
      'Delivery log of transactional emails (invites, password resets, membership notices). Read-only; disable tracking with EMAIL_TRACKING=false.',
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'emailType',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Machine-readable email kind, e.g. password-set-link, welcome email.' },
    },
    {
      name: 'recipient',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Destination email address.' },
    },
    {
      name: 'subject',
      type: 'text',
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      options: [
        { label: 'Sent', value: 'sent' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: {
        description:
          'Sent = accepted by the email provider. Delivery/bounce tracking would need provider webhooks.',
      },
    },
    {
      name: 'error',
      type: 'text',
      admin: { description: 'Provider error message when status is failed.' },
    },
  ],
}
