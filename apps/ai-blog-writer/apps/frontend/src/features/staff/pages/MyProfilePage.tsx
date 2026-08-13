import { useAuth } from '../../auth'
import ProfileEditor from '../components/ProfileEditor'

export default function MyProfilePage() {
  const { user: authUser } = useAuth()

  if (!authUser?.id) return null

  return (
    <div className="staff-page">
      <header className="staff-page-header">
        <h1>My Profile</h1>
        <p className="staff-muted">
          How you appear as an author on the public site. Your author page goes live automatically
          once you have published work.
        </p>
      </header>
      <ProfileEditor userId={authUser.id} variant="self" />
    </div>
  )
}
