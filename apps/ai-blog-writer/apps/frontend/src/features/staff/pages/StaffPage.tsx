import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth, usePermissions } from '../../auth'
import {
  createStaffUser,
  fetchStaffUsers,
  promoteWriterToEditor,
  requestPasswordSetEmail,
} from '../api/staff.api'
import type { StaffUser } from '../types'

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
      setCreateForm(EMPTY_CREATE_FORM)
      setErrorMessage(null)
      setStatusMessage(`Invite sent to ${created.email}. They set their own password by email.`)
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

  return (
    <div className="staff-page staff-page-wide">
      <header className="staff-page-header">
        <h1>Staff</h1>
        <p className="staff-muted">
          Create writer and editor accounts and promote writers. Admin accounts and offboarding are
          handled in the Payload admin panel.
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
                    <td>
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
    </div>
  )
}
