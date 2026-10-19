/**
 * @file auth.ts
 * @description 登录账号与会话（原型演示级，明文密码仅本机存储）：
 *              · 超级管理员：`level = super`，tenantId 留空 = 不限定租户，可在顶栏切换全部租户；
 *              · 租户管理员：`level = tenant`，绑定一个 tenantId，登录后只能看到该租户的数据；
 *              · 会话只存账号 id（`inspection-session`），密码不进存储；会话按租户 / 页面权限
 *                在 store 与 App 侧落地，不写进各租户的业务缓存。
 * @interaction store.tsx（signIn / signOut）、pages/Login.tsx、components/TenantSwitcher.tsx、App.tsx
 */
import { TENANTS } from "./tenants";

/** 账号级别：超级管理员（跨租户） / 租户管理员（单租户） */
export type AccountLevel = "super" | "tenant";

export interface AuthAccount {
  id: string;
  /** 登录账号 */
  username: string;
  /** 初始密码（演示明文，仅本机） */
  password: string;
  /** 显示姓名 */
  name: string;
  /** 岗位名称，顶栏用户菜单展示 */
  title: string;
  /** 所属租户：超级管理员留空 = 不限定 */
  tenantId: string;
  level: AccountLevel;
  /** 登录后套用的权限档位（roles.ts 的 id） */
  roleId: "admin" | "user";
}

/** 演示账号：1 个超级管理员 + 2 个租户管理员（与租户清单一一对应） */
export const ACCOUNTS: AuthAccount[] = [
  {
    id: "A-SUPER",
    username: "superadmin",
    password: "Super@2026",
    name: "王姐",
    title: "平台超级管理员",
    tenantId: "",
    level: "super",
    roleId: "admin",
  },
  {
    id: "A-HD",
    username: "hd.admin",
    password: "Hd@2026",
    name: "李工",
    title: "华东炼化 · 租户管理员",
    tenantId: TENANTS[0].id,
    level: "tenant",
    roleId: "admin",
  },
  {
    id: "A-XB",
    username: "xb.admin",
    password: "Xb@2026",
    name: "赵敏",
    title: "西部管道 · 租户管理员",
    tenantId: TENANTS[1].id,
    level: "tenant",
    roleId: "admin",
  },
];

/** 是否超级管理员（可切租户、可见租户管理页） */
export const isSuper = (a?: AuthAccount | null) => a?.level === "super";

/**
 * 校验账号密码
 * @param username 登录账号（大小写不敏感、忽略首尾空格）
 * @param password 密码
 * @returns 命中的账号；不匹配返回 null
 */
export function authenticate(username: string, password: string): AuthAccount | null {
  const u = String(username || "").trim().toLowerCase();
  return (
    ACCOUNTS.find((a) => a.username.toLowerCase() === u && a.password === password) ||
    null
  );
}

const SESSION_KEY = "inspection-session";

/** 读取当前会话（只存账号 id，账号信息按 id 回查） */
export function loadSession(): AuthAccount | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    return id ? ACCOUNTS.find((a) => a.id === id) || null : null;
  } catch {
    return null;
  }
}

/** 保存会话 */
export function saveSession(account: AuthAccount) {
  try {
    localStorage.setItem(SESSION_KEY, account.id);
  } catch {
    /* 存储不可用：本次浏览仍可继续，刷新后需重新登录 */
  }
}

/** 清除会话（退出登录） */
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 忽略 */
  }
}
