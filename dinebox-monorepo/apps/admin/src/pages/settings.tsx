import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';

import type {
  AdminUserRow,
  Role,
  ShopConfigSaveInput,
  SystemSettings,
} from '@dinebox/types';
import { ROLE_LABELS } from '@dinebox/types';

import { adminFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useConfirm } from '@/lib/store/confirm';
import { useToast } from '@/lib/store/toast';
import { EmptyState, LoadingRows } from '@/components/feedback';
import { Modal } from '@/components/modal';

const MENU_DESCRIPTIONS: Record<string, string> = {
  cashier: '桌台概览、改单/退菜/挂单/结算与今日流水',
  dishes: '分类、菜品、规格组、售罄与加料维护',
  tables: '区域、桌台与二维码生成',
  printer: '打印机、ESC/POS 模板与打印日志',
  orders: '历史订单筛选、详情与 Excel 导出',
  reports: '经营报表、趋势、排行与对账',
  audit: '登录与业务操作留痕（仅管理员）',
  settings: '门店信息、账号与角色菜单权限（仅管理员）',
};

const CASHIER_ASSIGNABLE = new Set(['cashier', 'dishes', 'tables', 'printer', 'orders', 'reports']);

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { data, error, isLoading, mutate } = useSWR<SystemSettings>(['/settings'], () =>
    adminFetch<SystemSettings>('/settings'),
  );

  const [shopName, setShopName] = useState('');
  const [receiptTitle, setReceiptTitle] = useState('');
  const [openTime, setOpenTime] = useState('10:30');
  const [closeTime, setCloseTime] = useState('21:30');
  const [phone, setPhone] = useState('');
  const [roundOffEnabled, setRoundOffEnabled] = useState(true);
  const [roundOffRule, setRoundOffRule] = useState<'ANGLE' | 'ANGLE5' | 'NONE'>('ANGLE');
  const [savingShop, setSavingShop] = useState(false);

  const [cashierMenus, setCashierMenus] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newRealName, setNewRealName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('CASHIER');
  const [creatingUser, setCreatingUser] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editRealName, setEditRealName] = useState('');
  const [editRole, setEditRole] = useState<Role>('CASHIER');
  const [editStatus, setEditStatus] = useState<'ENABLED' | 'DISABLED'>('ENABLED');
  const [editPassword, setEditPassword] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  useEffect(() => {
    if (!data) return;
    setShopName(data.shop.shopName);
    setReceiptTitle(data.shop.receiptTitle);
    setOpenTime(data.shop.openTime);
    setCloseTime(data.shop.closeTime);
    setPhone(data.shop.phone);
    setRoundOffEnabled(data.shop.roundOffEnabled);
    setRoundOffRule(data.shop.roundOffRule);
    setCashierMenus(data.roleMenus.CASHIER);
  }, [data]);

  const adminMenus = useMemo(() => data?.menus ?? [], [data?.menus]);

  if (isLoading && !data) {
    return (
      <div className="page show">
        <LoadingRows rows={8} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page show">
        <div className="card">
          <EmptyState title="设置加载失败" text={error?.message} />
        </div>
      </div>
    );
  }

  const saveShop = async (): Promise<void> => {
    if (!shopName.trim()) {
      toast('请输入门店名称', 'error');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime)) {
      toast('营业时间格式应为 HH:MM', 'error');
      return;
    }
    const payload: ShopConfigSaveInput = {
      shopName: shopName.trim(),
      receiptTitle: receiptTitle.trim(),
      openTime,
      closeTime,
      phone: phone.trim(),
      roundOffEnabled,
      roundOffRule,
    };
    setSavingShop(true);
    try {
      await adminFetch('/settings/shop', { method: 'PUT', body: payload });
      toast('门店设置已保存', 'success');
      await mutate();
      await refresh();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    } finally {
      setSavingShop(false);
    }
  };

  const savePermissions = async (): Promise<void> => {
    const assignable = cashierMenus.filter((code) => CASHIER_ASSIGNABLE.has(code));
    if (assignable.length === 0) {
      toast('请至少为收银员保留一个菜单', 'error');
      return;
    }
    setSavingPerms(true);
    try {
      await adminFetch('/settings/permissions', {
        method: 'PUT',
        body: { cashierMenuCodes: assignable },
      });
      toast('角色菜单权限已保存，收银员侧边栏即时生效', 'success');
      await mutate();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    } finally {
      setSavingPerms(false);
    }
  };

  const resetPermissions = async (): Promise<void> => {
    const ok = await confirm({
      title: '恢复默认权限？',
      text: '收银员将只保留「收银台」菜单，已登录的收银员侧边栏会立即刷新。',
      okText: '恢复默认',
      danger: false,
    });
    if (!ok) return;
    try {
      await adminFetch('/settings/permissions/reset', { method: 'POST' });
      toast('已恢复默认权限', 'success');
      await mutate();
    } catch (resetError) {
      toast(resetError instanceof Error ? resetError.message : '操作失败', 'error');
    }
  };

  const createUser = async (): Promise<void> => {
    if (!newUsername.trim() || newPassword.length < 6) {
      toast('请输入账号，初始密码至少 6 位', 'error');
      return;
    }
    setCreatingUser(true);
    try {
      await adminFetch('/settings/users', {
        method: 'POST',
        body: {
          username: newUsername.trim(),
          realName: newRealName.trim(),
          password: newPassword,
          role: newRole,
        },
      });
      toast('账号已新增', 'success');
      setNewUsername('');
      setNewRealName('');
      setNewPassword('');
      setNewRole('CASHIER');
      await mutate();
    } catch (createError) {
      toast(createError instanceof Error ? createError.message : '新增失败', 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  const openUserEdit = (row: AdminUserRow): void => {
    setEditingUser(row);
    setEditRealName(row.realName);
    setEditRole(row.role);
    setEditStatus(row.status);
    setEditPassword('');
  };

  const saveUser = async (): Promise<void> => {
    if (!editingUser) return;
    if (editPassword && editPassword.length < 6) {
      toast('新密码至少 6 位', 'error');
      return;
    }
    setSavingUser(true);
    try {
      await adminFetch(`/settings/users/${editingUser.id}`, {
        method: 'PUT',
        body: {
          realName: editRealName.trim(),
          role: editRole,
          status: editStatus,
          ...(editPassword ? { password: editPassword } : {}),
        },
      });
      toast('账号已更新，角色变更将在对方重新登录后完全生效', 'success');
      setEditingUser(null);
      await mutate();
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const toggleUserStatus = async (row: AdminUserRow): Promise<void> => {
    const next = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    const ok = await confirm({
      title: next === 'DISABLED' ? `禁用账号 ${row.username}？` : `启用账号 ${row.username}？`,
      text:
        next === 'DISABLED'
          ? '禁用后该账号的登录令牌将立即失效，无法再登录商家端。'
          : '启用后该账号可正常登录商家端。',
      okText: next === 'DISABLED' ? '禁用账号' : '启用账号',
      danger: next === 'DISABLED',
    });
    if (!ok) return;
    try {
      await adminFetch(`/settings/users/${row.id}`, {
        method: 'PUT',
        body: { status: next },
      });
      toast(next === 'DISABLED' ? '账号已禁用' : '账号已启用', 'success');
      await mutate();
    } catch (statusError) {
      toast(statusError instanceof Error ? statusError.message : '操作失败', 'error');
    }
  };

  return (
    <div className="page show">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>系统设置</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
            门店信息、抹零开关、账号与角色菜单权限
          </div>
        </div>
        <button type="button" className="btn sm" onClick={() => void mutate()}>
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">门店信息</div>
            <div className="field">
              <label>
                门店名称 <i className="req">*</i>
              </label>
              <input value={shopName} onChange={(event) => setShopName(event.target.value)} />
            </div>
            <div className="field">
              <label>小票抬头</label>
              <input
                value={receiptTitle}
                placeholder="留空时使用门店名称"
                onChange={(event) => setReceiptTitle(event.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>营业开始</label>
                <input value={openTime} placeholder="10:30" onChange={(event) => setOpenTime(event.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>营业结束</label>
                <input value={closeTime} placeholder="21:30" onChange={(event) => setCloseTime(event.target.value)} />
              </div>
              <div className="field" style={{ flex: 1.4 }}>
                <label>联系电话</label>
                <input value={phone} placeholder="0731-8888 8888" onChange={(event) => setPhone(event.target.value)} />
              </div>
            </div>
            <div className="form-hint">营业时间展示在顾客点餐页顶部；联系电话打印在结账单底部。</div>
            <button
              type="button"
              className="btn primary"
              style={{ marginTop: 10 }}
              disabled={savingShop}
              onClick={() => void saveShop()}
            >
              {savingShop ? '保存中…' : '保存设置'}
            </button>
          </div>

          <div className="card">
            <div className="card-title">功能开关</div>
            <div className="settle-line" style={{ padding: '4px 0' }}>
              <span>抹零功能（收银台显示抹零选项）</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={roundOffEnabled}
                  onChange={(event) => setRoundOffEnabled(event.target.checked)}
                />
                <span className="track" />
              </label>
            </div>
            <div className="settle-line" style={{ padding: '4px 0' }}>
              <span>抹零规则</span>
              <select
                value={roundOffRule}
                disabled={!roundOffEnabled}
                onChange={(event) =>
                  setRoundOffRule(event.target.value as 'ANGLE' | 'ANGLE5' | 'NONE')
                }
                style={{
                  width: 260,
                  height: 34,
                  border: '1px solid var(--line)',
                  borderRadius: 9,
                  padding: '0 10px',
                  background: '#fff',
                  color: 'var(--ink)',
                }}
              >
                <option value="ANGLE">抹到元（¥47.80 → ¥47）</option>
                <option value="ANGLE5">抹到 5 角（¥47.80 → ¥47.50）</option>
                <option value="NONE">不抹零</option>
              </select>
            </div>
            <div className="form-hint">
              抹零仅在结算时生效，按「应收 = 菜品合计 - 抹零」记账；关闭后按原价结算。
            </div>
          </div>
        </div>

        <div className="card" style={{ flex: 1.2, minWidth: 0 }}>
          <div className="card-title">
            用户账号管理
            <span className="sub">角色：管理员 / 收银员</span>
          </div>
          <div className="table-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>姓名</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th style={{ width: 142 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((row) => (
                  <tr key={row.id}>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {row.username}
                      {row.id === user?.id ? <span className="mini-muted">（我）</span> : null}
                    </td>
                    <td>{row.realName || '—'}</td>
                    <td>
                      <span className={`tag ${row.role === 'ADMIN' ? 'pending' : 'off'}`}>
                        {ROLE_LABELS[row.role]}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${row.status === 'ENABLED' ? 'badge-green' : 'badge-gray'}`}>
                        {row.status === 'ENABLED' ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="btn-text" onClick={() => openUserEdit(row)}>
                          编辑
                        </button>
                        {row.id !== user?.id ? (
                          <button
                            type="button"
                            className={`btn-text ${row.status === 'ENABLED' ? 'danger' : ''}`}
                            onClick={() => void toggleUserStatus(row)}
                          >
                            {row.status === 'ENABLED' ? '禁用' : '启用'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={newUsername}
              placeholder="账号名（如 cashier03）"
              style={{ flex: 1.1, height: 36 }}
              onChange={(event) => setNewUsername(event.target.value)}
            />
            <input
              value={newRealName}
              placeholder="姓名（选填）"
              style={{ flex: 0.9, height: 36 }}
              onChange={(event) => setNewRealName(event.target.value)}
            />
            <select
              value={newRole}
              style={{ height: 36, width: 100 }}
              onChange={(event) => setNewRole(event.target.value as Role)}
            >
              <option value="CASHIER">收银员</option>
              <option value="ADMIN">管理员</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              value={newPassword}
              placeholder="初始密码（至少 6 位）"
              style={{ flex: 1, height: 36 }}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <button
              type="button"
              className="btn primary"
              disabled={creatingUser}
              onClick={() => void createUser()}
            >
              {creatingUser ? '新增中…' : '新增账号'}
            </button>
          </div>
          <div className="form-hint">
            新账号默认启用；收银员的可见菜单由下方「角色菜单权限」控制。
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          角色菜单权限
          <span className="sub">配置收银员侧边栏可见菜单 · 管理员固定拥有全部权限</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn sm" onClick={() => void resetPermissions()}>
              恢复默认
            </button>
            <button
              type="button"
              className="btn sm primary"
              disabled={savingPerms}
              onClick={() => void savePermissions()}
            >
              {savingPerms ? '保存中…' : '保存权限'}
            </button>
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>菜单</th>
              <th style={{ width: 110 }}>管理员</th>
              <th style={{ width: 110 }}>收银员</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {adminMenus.map((menu) => {
              const assignable = CASHIER_ASSIGNABLE.has(menu.code);
              return (
                <tr key={menu.code}>
                  <td style={{ fontWeight: 600 }}>
                    {menu.name}
                    <span className="mini-muted" style={{ marginLeft: 6 }}>
                      {menu.code}
                    </span>
                  </td>
                  <td>
                    <label className="switch" style={{ opacity: 0.55 }}>
                      <input type="checkbox" checked disabled readOnly />
                      <span className="track" />
                    </label>
                  </td>
                  <td>
                    {assignable ? (
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={cashierMenus.includes(menu.code)}
                          onChange={(event) => {
                            setCashierMenus((previous) =>
                              event.target.checked
                                ? [...previous, menu.code]
                                : previous.filter((code) => code !== menu.code),
                            );
                          }}
                        />
                        <span className="track" />
                      </label>
                    ) : (
                      <span className="badge badge-gray">仅管理员</span>
                    )}
                  </td>
                  <td className="mini-muted">{MENU_DESCRIPTIONS[menu.code] ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="form-hint">
          保存后即时生效：已登录收银员刷新侧边栏即可看到变化；被隐藏的页面直接输入地址也会被拦截。
          建议至少保留「收银台」，避免角色无可用页面。
        </div>
      </div>

      <Modal
        open={Boolean(editingUser)}
        title={`编辑账号 · ${editingUser?.username ?? ''}`}
        onClose={() => setEditingUser(null)}
        width={430}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditingUser(null)}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={savingUser}
              onClick={() => void saveUser()}
            >
              {savingUser ? '保存中…' : '保存'}
            </button>
          </>
        }
      >
        {editingUser ? (
          <>
            <div className="field">
              <label>姓名 / 昵称</label>
              <input value={editRealName} onChange={(event) => setEditRealName(event.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>角色</label>
                <select
                  value={editRole}
                  disabled={editingUser.id === user?.id}
                  onChange={(event) => setEditRole(event.target.value as Role)}
                  style={{ width: '100%', height: 40 }}
                >
                  <option value="CASHIER">收银员</option>
                  <option value="ADMIN">管理员</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>状态</label>
                <select
                  value={editStatus}
                  disabled={editingUser.id === user?.id}
                  onChange={(event) =>
                    setEditStatus(event.target.value as 'ENABLED' | 'DISABLED')
                  }
                  style={{ width: '100%', height: 40 }}
                >
                  <option value="ENABLED">启用</option>
                  <option value="DISABLED">禁用</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>重置密码（选填）</label>
              <input
                type="password"
                value={editPassword}
                placeholder="留空表示不修改，至少 6 位"
                autoComplete="new-password"
                onChange={(event) => setEditPassword(event.target.value)}
              />
            </div>
            <div className="form-hint">
              角色调整后，对方需要重新登录以刷新菜单与接口权限；禁用账号会立即使其令牌失效。
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
