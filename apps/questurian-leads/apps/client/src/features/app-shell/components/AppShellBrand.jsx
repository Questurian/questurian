import { Link } from 'react-router-dom';
import AppShellIcon from './AppShellIcon';

export default function AppShellBrand() {
  return (
    <div className="nav-brand">
      <Link to="/" className="nav-brand-link">
        <AppShellIcon name="brand" />
        <h1>Questurian</h1>
      </Link>
    </div>
  );
}
