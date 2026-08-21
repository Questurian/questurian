import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, usePermissions } from '../../auth'
import { avatarUrl, fetchEditableAuthors } from '../api/staff.api'

/**
 * The Author Directory (ADR-0011): every Author the signed-in operator may
 * edit, and the entry point for a delegated edit.
 *
 * Deliberately built on `authors`, not on `users`. An editor can read no staff
 * identity but their own, so a staff-shaped list is not buildable for them
 * without widening a credential store -- which ADR-0023 rejected. `authors` is
 * already readable by every active staff member, so this surface costs nothing
 * new.
 */
export default function AuthorDirectoryPage() {
  const { user } = useAuth()
  const { canEditOtherAuthors, canManageUsers, isLoading: permissionsLoading } = usePermissions()

  // Admins carry no filter because their access rule carries none; everyone
  // else gets the editor clause. Both mirror the server, which still enforces.
  const scope = canManageUsers ? 'all' : 'writers-and-orphans'

  const authorsQuery = useQuery({
    queryKey: ['authors', 'directory', scope, String(user?.id ?? '')],
    queryFn: () => fetchEditableAuthors(scope, user!.id),
    enabled: canEditOtherAuthors && Boolean(user?.id),
  })

  if (permissionsLoading) {
    return (
      <div className="staff-page">
        <p className="staff-muted">Checking your access…</p>
      </div>
    )
  }

  if (!canEditOtherAuthors) {
    return (
      <div className="staff-page">
        <header className="staff-page-header">
          <h1>Authors</h1>
        </header>
        <p className="staff-muted">
          Editing other people's author pages is available to editors and admins. To change how you
          appear, head to <Link to="/profile">My Profile</Link>.
        </p>
      </div>
    )
  }

  const authors = authorsQuery.data ?? []

  return (
    <div className="staff-page">
      <header className="staff-page-header">
        <h1>Authors</h1>
        <p className="staff-muted">
          Public author pages you can edit — photo, byline, bio, expertise and social links.{' '}
          {canManageUsers
            ? 'As an admin you can edit every author, and the author URL slug.'
            : 'As an editor you can edit writers and bylines with no account left behind them.'}
        </p>
      </header>

      {authorsQuery.isLoading ? <p className="staff-muted">Loading authors…</p> : null}

      {authorsQuery.isError ? (
        <p className="staff-error">
          Could not load authors: {(authorsQuery.error as Error).message}
        </p>
      ) : null}

      {authorsQuery.isSuccess && authors.length === 0 ? (
        <p className="staff-muted">No authors you can edit yet.</p>
      ) : null}

      <ul className="staff-author-list">
        {authors.map((author) => {
          const avatar = avatarUrl(author.avatar)
          const isOrphan = !author.user
          // The auth store stringifies its id (auth-state.ts), Payload returns
          // numbers -- compare as strings rather than trusting either shape.
          const linkedUserId =
            typeof author.user === 'object' && author.user !== null ? author.user.id : author.user
          const isSelf = linkedUserId != null && String(linkedUserId) === String(user?.id ?? '')

          return (
            <li key={author.id} className="staff-author-row">
              <Link className="staff-author-link" to={`/authors/${author.id}`}>
                {avatar ? (
                  <img className="staff-avatar staff-avatar--sm" src={avatar} alt="" />
                ) : (
                  <span className="staff-avatar staff-avatar--sm staff-avatar-empty" aria-hidden="true">
                    {author.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="staff-author-name">
                  {author.displayName}
                  {isSelf ? <span className="staff-hint"> (you)</span> : null}
                </span>
                {author.slug ? <code className="staff-author-slug">/authors/{author.slug}</code> : null}
                {isOrphan ? (
                  <span className="staff-chip staff-chip--muted" title="No staff account behind this byline">
                    unlinked
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
