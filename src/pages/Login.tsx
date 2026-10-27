/**
 * @file Login.tsx
 * @description 登录页（未登录时由 App.tsx 直接渲染，不套侧边栏 / 顶栏 / 页签）。
 *              账号分两类：超级管理员（可切全部租户）与租户管理员（锁定所属租户）；
 *              登录成功后由 store.signIn 载入对应租户的数据。
 * @interaction data/auth.ts（账号与会话）、data/store.tsx（signIn）
 */
import { useMemo, useState } from "react";
import { Boxes, LogIn, ShieldCheck } from "lucide-react";
import { useStore } from "../data/store";
import { loadAccounts } from "../data/auth";
import { loadTenants } from "../data/tenants";
import { Btn, Field } from "../components/UI";

export function Login() {
  const { signIn, message } = useStore();
  const [username, U] = useState("");
  const [password, P] = useState("");
  const [err, ERR] = useState("");
  // 登录页可选进入的厂区（留空 = 按账号权限自动进入）
  const [tenantId, T] = useState("");
  // 演示账号一览：含平台超管与各客户开通租户时创建的管理员
  const accounts = useMemo(() => loadAccounts(), []);
  const tenants = useMemo(
    () => loadTenants().filter((t) => t.status !== "停用"),
    [],
  );

  function submit() {
    if (!username.trim() || !password) {
      ERR("请输入账号与密码");
      return;
    }
    ERR("");
    // 失败原因（账号错误 / 租户停用）由 store 写入 message
    signIn(username, password, tenantId || undefined);
  }

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-brand">
          <span className="login-mark">
            <Boxes size={20} />
          </span>
          <div>
            <b>智能机器巡检平台</b>
            <small>INSPECTION PLATFORM</small>
          </div>
        </div>
        <div className="login-tags">
          <span>多租户</span>
          <span>巡检调度</span>
          <span>告警闭环</span>
        </div>
      </aside>
      <main className="login-main">
        <div className="login-card">
          <h2>
            <ShieldCheck size={18} />
            登录
          </h2>
          <Field label="登录账号" required>
            <input
              value={username}
              autoFocus
              autoComplete="username"
              placeholder="请输入账号"
              onChange={(e) => U(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
          <Field label="密码" required>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="请输入密码"
              onChange={(e) => P(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
          <Field label="厂区 / 租户">
            <select value={tenantId} onChange={(e) => T(e.target.value)}>
              <option value="">自动（按账号权限进入）</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          {(err || message) && <div className="login-error">{err || message}</div>}
          <Btn primary className="login-submit" onClick={submit}>
            <LogIn size={15} />
            登录
          </Btn>
          {/* 演示账号清单：点击任一账号快速填入账号密码 */}
          <div className="login-accounts-hint">演示账号 · 点击填入</div>
          <div className="login-accounts">
            {accounts.map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => {
                  U(a.username);
                  P(a.password);
                  ERR("");
                }}
              >
                <b>{a.name}</b>
                <code>
                  {a.username} / {a.password}
                </code>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
