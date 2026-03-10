import { Outlet } from 'react-router-dom';
import AppShell from '../features/app-shell/components/AppShell';
import { useAppShellData } from '../features/app-shell/hooks/useAppShellData';
import { useAppShellMenu } from '../features/app-shell/hooks/useAppShellMenu';

export default function Layout() {
  const data = useAppShellData();
  const menu = useAppShellMenu({ logout: data.logout });

  return (
    <AppShell data={data} menu={menu}>
      <Outlet />
    </AppShell>
  );
}
