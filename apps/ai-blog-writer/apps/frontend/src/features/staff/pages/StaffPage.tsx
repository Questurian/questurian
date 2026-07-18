import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, usePermissions } from '../../auth'
import {
  createStaffUser,
  fetchEmailLogs,
  fetchStaffUsers,
  promoteWriterToEditor,
  requestPasswordSetEmail,
} from '../api/staff.api'
import type { EmailLog, StaffUser } from '../types'

type CreateFormState = {
  email: string
  firstName: string
  lastName: string
  role: 'writer' | 'editor'
}

const EMPTY_CREATE_FORM: CreateFormState = {
  email: '',
  firstName: '',
  lastName: '',
  role: 'writer',
}

function staffDisplayName(user: StaffUser): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')
  return user.publicProfile?.displayName || fullName || '—'
}

/** The forgot-password email doubles as the staff invite (ADR-0023). */
const INVITE_EMAIL_TYPE = 'password-set-link'

const EMAIL_TYPE_LABELS: Record<string, string> = {
  [INVITE_EMAIL_TYPE]: 'Invite / password set',
}

function emailTypeLabel(emailType: string): string {
  return EMAIL_TYPE_LABELS[emailType] ?? emailType
}

function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Latest invite/password-set email per recipient, from the newest-first log. */
function latestInviteByRecipient(logs: EmailLog[]): Map<string, EmailLog> {
  const latest = new Map<string, EmailLog>()
  for (const log of logs) {
    if (log.emailType !== INVITE_EMAIL_TYPE) continue
    if (!latest.has(log.recipient)) latest.set(log.recipient, log)
  }
  return latest
}

export default function StaffPage() {
  const { token } = useAuth()
  const { canManageUsers, isLoading: permissionsLoading } = usePermissions()
  const queryClient = useQueryClient()

  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE_FORM)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const staffQuery = useQuery({
    queryKey: ['staff', 'list'],
    queryFn: () => fetchStaffUsers(token as string),
    enabled: Boolean(token) && canManageUsers,
  })

  const emailLogsQuery = useQuery({
    queryKey: ['staff', 'email-logs'],
    queryFn: () => fetchEmailLogs(token as string),
    enabled: Boolean(token) && canManageUsers,
  })

  const inviteStaff = useMutation({
    mutationFn: async (input: CreateFormState) => {
      const created = await createStaffUser(
        {
          email: input.email.trim().toLowerCase(),
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          role: input.role,
        },
        token as string,
      )
      // Invite-style onboarding: the random creation password is discarded;
      // the hire sets their own through this email.
      await requestPasswordSetEmail(created.email)
      return created
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['staff', 'email-logs'] })
      setCreateForm(EMPTY_CREATE_FORM)
      setErrorMessage(null)
      setStatusMessage(`Invite sent to ${created.email}. They set their own password by email.`)
    },
    onError: (error: Error) => {
      setStatusMessage(null)
      setErrorMessage(error.message)
    },
  })

  const resendInvite = useMutation({
    mutationFn: async (member: StaffUser) => {
      await requestPasswordSetEmail(member.email)
      return member
    },
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'email-logs'] })
      setErrorMessage(null)
      setStatusMessage(`Invite email re-sent to ${member.email}.`)
    },
    onError: (error: Error) => {
      setStatusMessage(null)
      setErrorMessage(error.message)
    },
  })

  const promote = useMutation({
    mutationFn: (user: StaffUser) => promoteWriterToEditor(user.id, token as string),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
      setErrorMessage(null)
      setStatusMessage(`${updated.email} is now an editor.`)
    },
    onError: (error: Error) => {
      setStatusMessage(null)
      setErrorMessage(error.message)
    },
  })

  if (permissionsLoading) {
    return (
      <div className="staff-page">
        <p className="staff-muted">Checking your access…</p>
      </div>
    )
  }

  if (!canManageUsers) {
    return (
      <div className="staff-page">
        <header className="staff-page-header">
          <h1>Staff</h1>
        </header>
        <p className="staff-muted">
          Staff management is available to admins only. If you need a change to your own author
          presence, head to My Profile instead.
        </p>
      </div>
    )
  }

  const staff = staffQuery.data ?? []
  const emailLogs = emailLogsQuery.data ?? []
  const lastInviteByEmail = latestInviteByRecipient(emailLogs)

  return (
    <div className="staff-page staff-page-wide">
      <header className="staff-page-header">
        <h1>Staff</h1>
        <p className="staff-muted">
          Create writer and editor accounts, promote writers, and edit any staff member's author
          profile. Admin accounts and offboarding are handled in the Payload admin panel.
        </p>
      </header>

      {statusMessage ? <p className="staff-banner staff-success">{statusMessage}</p> : null}
      {errorMessage ? <p className="staff-banner staff-error">{errorMessage}</p> : null}

      <section className="staff-card">
        <h2 className="staff-card-title">Invite a new staff member</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            inviteStaff.mutate(createForm)
          }}
        >
          <div className="staff-field-row">
            <label className="staff-field">
              <span>Company email</span>
              <input
                type="email"
                required
                placeholder="name@questurian.com"
                value={createForm.email}
                pattern=".+@questurian\.com"
                title="Staff accounts must use a @questurian.com email"
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </label>
            <label className="staff-field">
              <span>Role</span>
              <select
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm({ ...createForm, role: event.target.value as 'writer' | 'editor' })
                }
              >
                <option value="writer">Writer</option>
                <option value="editor">Editor</option>
              </select>
            </label>
          </div>
          <div className="staff-field-row">
            <label className="staff-field">
              <span>First name</span>
              <input
                type="text"
                value={createForm.firstName}
                onChange={(event) => setCreateForm({ ...createForm, firstName: event.target.value })}
              />
            </label>
            <label className="staff-field">
              <span>Last name</span>
              <input
                type="text"
                value={createForm.lastName}
                onChange={(event) => setCreateForm({ ...createForm, lastName: event.target.value })}
              />
            </label>
          </div>
          <footer className="staff-form-footer">
            <button type="submit" className="staff-button-primary" disabled={inviteStaff.isPending}>
              {inviteStaff.isPending ? 'Inviting…' : 'Create & send invite'}
            </button>
          </footer>
        </form>
      </section>

      <section className="staff-card">
        <h2 className="staff-card-title">Staff identities</h2>
        {staffQuery.isLoading ? <p className="staff-muted">Loading staff…</p> : null}
        {staffQuery.isError ? (
          <p className="staff-error">Could not load staff: {(staffQuery.error as Error).message}</p>
        ) : null}
        {!staffQuery.isLoading && staff.length === 0 && !staffQuery.isError ? (
          <p className="staff-muted">No staff identities found.</p>
        ) : null}
        {staff.length > 0 ? (
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Author page</th>
                  <th>Last invite</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td>{member.email}</td>
                    <td>{staffDisplayName(member)}</td>
                    <td>
                      <span className={`staff-role staff-role--${member.role}`}>{member.role}</span>
                    </td>
                    <td>{member.slug ? <code>/authors/{member.slug}</code> : '—'}</td>
                    <td className="staff-invite-cell">
                      {(() => {
                        const lastInvite = lastInviteByEmail.get(member.email)
                        if (!lastInvite) return <span className="staff-muted">—</span>
                        return (
                          <span
                            className={`staff-email-status staff-email-status--${lastInvite.status}`}
                            title={lastInvite.error ?? undefined}
                          >
                            {lastInvite.status === 'sent' ? 'Sent' : 'Failed'}{' '}
                            {formatLogTime(lastInvite.createdAt)}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="staff-actions-cell">
                      <Link className="staff-button-secondary staff-button-link" to={`/staff/${member.id}`}>
                        Edit profile
                      </Link>
                      <button
                        type="button"
                        className="staff-button-secondary"
                        disabled={resendInvite.isPending}
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Re-send the password-set invite email to ${member.email}?`,
                          )
                          if (confirmed) resendInvite.mutate(member)
                        }}
                      >
                        Resend invite
                      </button>
                      {member.role === 'writer' ? (
                        <button
                          type="button"
                          className="staff-button-secondary"
                          disabled={promote.isPending}
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Promote ${member.email} to editor? Roles are permanent — this cannot be undone.`,
                            )
                            if (confirmed) promote.mutate(member)
                          }}
                        >
                          Promote to editor
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="staff-card">
        <h2 className="staff-card-title">Email activity</h2>
        <p className="staff-muted">
          Delivery log for invites and other transactional emails. "Sent" means the provider
          accepted the message — it can still bounce if the mailbox doesn't exist yet, so re-send
          the invite once the address is live. Tracking can be switched off server-side with{' '}
          <code>EMAIL_TRACKING=false</code>.
        </p>
        {emailLogsQuery.isLoading ? <p className="staff-muted">Loading email activity…</p> : null}
        {emailLogsQuery.isError ? (
          <p className="staff-error">
            Could not load email activity: {(emailLogsQuery.error as Error).message}
          </p>
        ) : null}
        {!emailLogsQuery.isLoading && !emailLogsQuery.isError && emailLogs.length === 0 ? (
          <p className="staff-muted">No emails recorded yet (or tracking is disabled).</p>
        ) : null}
        {emailLogs.length > 0 ? (
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {emailLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatLogTime(log.createdAt)}</td>
                    <td>{emailTypeLabel(log.emailType)}</td>
                    <td>{log.recipient}</td>
                    <td>
                      <span className={`staff-email-status staff-email-status--${log.status}`}>
                        {log.status === 'sent' ? 'Sent' : 'Failed'}
                      </span>
                      {log.error ? <span className="staff-email-error">{log.error}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
