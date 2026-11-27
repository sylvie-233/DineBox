import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import type { MenuCode } from '@dinebox/types';

import { AdminLayout } from '@/components/admin-layout';
import { LoadingScreen } from '@/components/feedback';
import { useAuth } from '@/lib/auth';
import { firstMenuPath } from '@/lib/menu';
import { AuditPage } from '@/pages/audit';
import { CashierPage } from '@/pages/cashier';
import { DishesPage } from '@/pages/dishes';
import { LoginPage } from '@/pages/login';
import { OrdersPage } from '@/pages/orders';
import { PrintersPage } from '@/pages/printers';
import { ReportsPage } from '@/pages/reports';
import { SettingsPage } from '@/pages/settings';
import { TablesPage } from '@/pages/tables';

function RequireAuth() {
  const { initialized, token, user } = useAuth();
  if (!initialized) {
    return <LoadingScreen text="正在校验登录状态…" />;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (!user) {
    return <LoadingScreen text="正在加载账号信息…" />;
  }
  return <Outlet />;
}

function AccessDenied() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="page show">
      <div className="card" style={{ padding: 48, textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>当前账号没有可访问的菜单</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.8 }}>
          请联系管理员在「系统设置 → 角色菜单权限」中为
          {user?.role === 'CASHIER' ? '收银员' : '该角色'}开通至少一个菜单。
        </div>
        <button
          type="button"
          className="btn"
          style={{ marginTop: 18 }}
          onClick={() => {
            logout();
            navigate('/login', { replace: true });
          }}
        >
          退出登录
        </button>
      </div>
    </div>
  );
}

function MenuGuard({ code, children }: { code: MenuCode; children: React.ReactNode }) {
  const { user, menus } = useAuth();
  const location = useLocation();
  if (!user) {
    return <LoadingScreen />;
  }
  const allowed = user.role === 'ADMIN' || menus.some((menu) => menu.code === code);
  if (allowed) {
    return <>{children}</>;
  }
  const target = firstMenuPath(menus);
  if (target === location.pathname) {
    return <AccessDenied />;
  }
  return <Navigate to={target} replace />;
}

function IndexPage() {
  const { menus } = useAuth();
  if (menus.length === 0) {
    return <AccessDenied />;
  }
  const target = firstMenuPath(menus);
  if (target === '/') {
    return (
      <MenuGuard code="cashier">
        <CashierPage />
      </MenuGuard>
    );
  }
  return <Navigate to={target} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AdminLayout />}>
          <Route index element={<IndexPage />} />
          <Route
            path="dishes"
            element={
              <MenuGuard code="dishes">
                <DishesPage />
              </MenuGuard>
            }
          />
          <Route
            path="tables"
            element={
              <MenuGuard code="tables">
                <TablesPage />
              </MenuGuard>
            }
          />
          <Route
            path="printers"
            element={
              <MenuGuard code="printer">
                <PrintersPage />
              </MenuGuard>
            }
          />
          <Route
            path="orders"
            element={
              <MenuGuard code="orders">
                <OrdersPage />
              </MenuGuard>
            }
          />
          <Route
            path="reports"
            element={
              <MenuGuard code="reports">
                <ReportsPage />
              </MenuGuard>
            }
          />
          <Route
            path="audit"
            element={
              <MenuGuard code="audit">
                <AuditPage />
              </MenuGuard>
            }
          />
          <Route
            path="settings"
            element={
              <MenuGuard code="settings">
                <SettingsPage />
              </MenuGuard>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
