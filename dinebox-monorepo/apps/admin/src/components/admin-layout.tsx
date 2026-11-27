import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  Armchair,
  BarChart3,
  KeyRound,
  LayoutGrid,
  LogOut,
  Printer,
  ReceiptText,
  ScrollText,
  Settings,
  UtensilsCrossed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { CashierOverview, MenuCode } from '@dinebox/types';
import { ROLE_LABELS } from '@dinebox/types';
import { formatMoney } from '@dinebox/utils';

import { adminFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MENU_TITLES, pathToMenuCode } from '@/lib/menu';
import { useConfirm } from '@/lib/store/confirm';
import { useToast } from '@/lib/store/toast';
import { LoadingScreen } from '@/components/feedback';
import { Modal } from '@/components/modal';

interface NavItem {
  code: MenuCode;
  path: string;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: '营业',
    items: [{ code: 'cashier', path: '/', label: '收银台', icon: LayoutGrid }],
  },
  {
    title: '商家管理',
    items: [
      { code: 'dishes', path: '/dishes', label: '菜品管理', icon: UtensilsCrossed },
      { code: 'tables', path: '/tables', label: '桌台管理', icon: Armchair },
      { code: 'printer', path: '/printers', label: '打印配置', icon: Printer },
      { code: 'orders', path: '/orders', label: '订单流水', icon: ReceiptText },
      { code: 'reports', path: '/reports', label: '轻量报表', icon: BarChart3 },
    ],
  },
  {
    title: '系统',
    items: [
      { code: 'audit', path: '/audit', label: '操作日志', icon: ScrollText },
      { code: 'settings', path: '/settings', label: '系统设置', icon: Settings },
    ],
  },
];

function passwordStrength(value: string): { label: string; color: string } {
  if (!value) return { label: '8-20 位，需包含字母和数字', color: 'var(--ink-3)' };
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[a-z]/i.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^a-z0-9]/i.test(value)) score += 1;
  if (score <= 2) return { label: '强度：弱', color: 'var(--price)' };
  if (score === 3) return { label: '强度：中', color: 'var(--warn)' };
  return { label: '强度：强', color: 'var(--ok)' };
}

/** 商家端框架：侧边栏（按角色菜单过滤）+ 顶栏 + 页面容器。 */
export function AdminLayout() {
  const { user, token, menus, shop, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const canCashier = user?.role === 'ADMIN' || menus.some((menu) => menu.code === 'cashier');
  const { data: overview } = useSWR<CashierOverview>(
    token && canCashier ? ['/cashier/overview', token] : null,
    () => adminFetch<CashierOverview>('/cashier/overview'),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const activeCode = pathToMenuCode(location.pathname);
  const title = activeCode ? MENU_TITLES[activeCode] : '商家管理端';
  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          user?.role === 'ADMIN' ? true : menus.some((menu) => menu.code === item.code),
        ),
      })).filter((group) => group.items.length > 0),
    [menus, user?.role],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!user) {
    return <LoadingScreen text="正在校验登录状态…" />;
  }

  const shopName = shop?.shopName ?? 'DineBox 点餐';
  const strength = passwordStrength(newPassword);

  const openPassword = (): void => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwdError('');
    setPwdOpen(true);
  };

  const submitPassword = async (): Promise<void> => {
    setPwdError('');
    if (!oldPassword) {
      setPwdError('请输入原密码');
      return;
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(newPassword)) {
      setPwdError('新密码需为 8-20 位，且包含字母和数字');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    setPwdSaving(true);
    try {
      await adminFetch('/auth/password', {
        method: 'POST',
        body: { oldPassword, newPassword },
      });
      toast('密码已修改，下次登录请使用新密码', 'success');
      setPwdOpen(false);
    } catch (error) {
      setPwdError(error instanceof Error ? error.message : '修改密码失败');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    const ok = await confirm({
      title: '退出登录？',
      text: '退出后需要重新输入账号密码登录。',
      okText: '退出登录',
      danger: false,
    });
    if (ok) {
      logout();
      toast('已退出商家端', 'success');
      navigate('/login', { replace: true });
    }
  };

  return (
    <div id="appShell" className="show">
      <aside className="sidebar">
        <div className="side-logo">
          <div className="mark">希</div>
          <div className="name">
            {shopName}
            <span>扫码点餐 · 局域网版</span>
          </div>
        </div>
        <nav className="nav">
          {visibleGroups.map((group) => (
            <div key={group.title}>
              <div className="nav-group">{group.title}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activeCode === item.code;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`nav-item ${active ? 'active' : ''}`}
                    end={item.path === '/'}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar">{Array.from(user.realName || user.username)[0] ?? 'A'}</div>
          <div className="info">
            <div className="uname">{user.realName || user.username}</div>
            <div className="urole">{ROLE_LABELS[user.role]}</div>
          </div>
          <button type="button" className="icon-btn" onClick={openPassword} title="修改密码">
            <KeyRound size={14} />
          </button>
          <button type="button" className="icon-btn" onClick={() => void handleLogout()} title="退出登录">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <div className="content">
        <div className="topbar">
          <div className="ptitle">{title}</div>
          <div className="chips">
            <div className="chip">
              今日订单 <b className="num">{overview?.stats.todayOrderCount ?? '—'}</b>
            </div>
            <div className="chip">
              今日营收{' '}
              <b className="num">
                ¥{overview ? formatMoney(overview.stats.todayRevenue) : '—'}
              </b>
            </div>
            <div className="chip">
              待结算 <b className="num">{overview?.stats.pendingOrderCount ?? '—'}</b>
              {' · '}挂单 <b className="num">{overview?.stats.hungOrderCount ?? '—'}</b>
            </div>
          </div>
        </div>
        <div className="pages">
          <Outlet />
        </div>
      </div>

      <Modal
        open={pwdOpen}
        title="修改密码"
        onClose={() => setPwdOpen(false)}
        width={400}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setPwdOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={pwdSaving}
              onClick={() => void submitPassword()}
            >
              {pwdSaving ? '提交中…' : '确认修改'}
            </button>
          </>
        }
      >
        <div className="field">
          <label>
            原密码 <i className="req">*</i>
          </label>
          <input
            type="password"
            value={oldPassword}
            placeholder="请输入原密码"
            autoComplete="current-password"
            onChange={(event) => {
              setOldPassword(event.target.value);
              setPwdError('');
            }}
          />
        </div>
        <div className="field">
          <label>
            新密码 <i className="req">*</i>
          </label>
          <input
            type="password"
            value={newPassword}
            placeholder="8-20 位，需包含字母和数字"
            autoComplete="new-password"
            onChange={(event) => {
              setNewPassword(event.target.value);
              setPwdError('');
            }}
          />
          <div className="form-hint" style={{ color: strength.color }}>
            {strength.label}
          </div>
        </div>
        <div className="field">
          <label>
            确认新密码 <i className="req">*</i>
          </label>
          <input
            type="password"
            value={confirmPassword}
            placeholder="再次输入新密码"
            autoComplete="new-password"
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setPwdError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitPassword();
              }
            }}
          />
        </div>
        <div className={`form-err ${pwdError ? 'show' : ''}`}>{pwdError}</div>
      </Modal>
    </div>
  );
}
