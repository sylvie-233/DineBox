import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/store/toast';
import { LoadingScreen } from '@/components/feedback';

/** 商家端登录页：管理员 / 收银员共用，角色由账号决定。 */
export function LoginPage() {
  const navigate = useNavigate();
  const { login, user, token, initialized } = useAuth();
  const { toast } = useToast();
  const passwordRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialized && token && user) {
      navigate('/', { replace: true });
    }
  }, [initialized, token, user, navigate]);

  if (initialized && token && !user) {
    return <LoadingScreen text="正在恢复登录状态…" />;
  }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入账号与密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const profile = await login(username.trim(), password, remember);
      toast(`欢迎回来，${profile.realName || profile.username}`, 'success');
      navigate('/', { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败，请重试');
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="login-wrap">
        <div className="login-brand">
          <div className="mark" style={{ fontSize: 22, fontWeight: 800 }}>希</div>
          <h1>DineBox 点餐</h1>
          <div className="b-sub">扫码点餐 · 商家管理端</div>
          <div className="feat">
            <i />
            顾客扫码点餐 · 桌号自动带入
          </div>
          <div className="feat">
            <i />
            收银结算 · 改单 / 退菜 / 抹零
          </div>
          <div className="feat">
            <i />
            局域网小票打印 · ESC/POS
          </div>
          <div className="feat">
            <i />
            营业流水 · 报表与对账导出
          </div>
          <div className="b-foot">局域网版 · 数据存储于本地门店主机</div>
        </div>

        <form className="login-form" onSubmit={submit} autoComplete="off">
          <div className="login-title">登录商家端</div>
          <div className="login-sub">管理员与收银员共用登录入口，角色由账号决定</div>

          <div className="field">
            <label>账号</label>
            <input
              value={username}
              placeholder="请输入账号"
              autoComplete="username"
              autoFocus
              onChange={(event) => {
                setUsername(event.target.value);
                setError('');
              }}
            />
          </div>

          <div className="field">
            <label>密码</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              placeholder="请输入密码"
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
            />
          </div>

          <div className="login-error">{error}</div>

          <div
            style={{
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--ink-3)',
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                style={{ width: 14, height: 14, padding: 0, accentColor: 'var(--primary)' }}
              />
              记住我
            </label>
            <span>忘记密码请联系管理员重置</span>
          </div>

          <button type="submit" className="btn-dark" disabled={loading}>
            {loading ? '登录中…' : '登 录'}
          </button>

        </form>
      </div>
      <p
        style={{
          marginTop: 18,
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--ink-3)',
          letterSpacing: 1,
        }}
      >
        DineBox · 店内局域网扫码点餐
      </p>
      </div>
    </div>
  );
}
