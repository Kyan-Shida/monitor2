/**
 * @file auth.ts
 * @description 登录账号与会话（原型演示级，明文密码仅本机存储）：
 *              · 超级管理员：`level = super`，**只有平台运营方（我们公司）有**，tenantId 留空 = 不限定租户，
 *                负责开通 / 停用 / 删除客户租户，可切换查看全部租户；
 *              · 普通管理员：`level = tenant`，开通租户时创建、交给客户自己使用，绑定一个 tenantId，
 *                登录后只能进自己厂区的平台；厂区内没有超级管理员，人员账号再由它在「账号管理」里另建；
 *              · 账号库落 `inspection-accounts`（平台级，不随租户切换），首次进入用内置账号兜底，
 *                开通新租户时追加一条租户管理员，刷新后仍可登录；
 *              · 会话只存账号 id（`inspection-session`），密码不进存储；会话按租户 / 页面权限
 *                在 store 与 App 侧落地，不写进各租户的业务缓存。
 * @interaction store.tsx（signIn / signOut）、pages/Login.tsx、pages/Tenants.tsx（开通租户时建号）、
 *              components/TenantSwitcher.tsx、App.tsx
 */
import { TENANTS } from "./tenants";

/** 账号级别：超级管理员（平台运营方，跨租户） / 普通管理员（客户厂区，单租户） */
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

/** 内置演示账号：无存储时的兜底清单（1 个平台超管 + 2 个客户厂区管理员） */
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
    title: "华东炼化 · 普通管理员",
    tenantId: TENANTS[0].id,
    level: "tenant",
    roleId: "admin",
  },
  {
    id: "A-XB",
    username: "xb.admin",
    password: "Xb@2026",
    name: "赵敏",
    title: "西部管道 · 普通管理员",
    tenantId: TENANTS[1].id,
    level: "tenant",
    roleId: "admin",
  },
];

/** 账号库的独立存储键（平台级，不随租户切换） */
const ACCOUNT_KEY = "inspection-accounts";

/**
 * 读取账号库
 * @description 存储不可用 / 内容损坏时回落到内置演示账号（离线 file:// 场景也会走到这里）；
 *              开通租户时追加的账号一并返回，登录页与登录校验都以这份为准
 */
export function loadAccounts(): AuthAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw as AuthAccount[];
  } catch {
    /* 存储不可用：用内置账号 */
  }
  return ACCOUNTS.map((a) => ({ ...a }));
}

/** 保存账号库（开通租户建号后写这一份） */
export function saveAccounts(list: AuthAccount[]) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(list));
  } catch {
    /* 存储不可用：本次浏览仅内存生效 */
  }
}

/** 密码规则：至少 8 位，且同时含字母与数字 */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
/** 密码规则的提示文案 */
export const PASSWORD_HINT = "至少 8 位，需同时包含字母与数字";
/** 登录名规则：字母开头，3–20 位字母 / 数字 / . _ - */
export const USERNAME_RULE = /^[A-Za-z][A-Za-z0-9._-]{2,19}$/;

/** 建号输入：开通租户时填写的管理员信息 */
export interface AccountInput {
  username: string;
  password: string;
  name: string;
}

/** 建号校验结果：按字段给出原因，键名与表单字段对应 */
export interface AccountErrors {
  name?: string;
  username?: string;
  password?: string;
}

/** 校验结果是否为空（全部通过） */
export const noAccountError = (e: AccountErrors) => !Object.keys(e).length;

/**
 * 校验待保存账号（开通租户建号 / 编辑租户改管理员共用）
 * @param input 登录账号 / 密码 / 姓名
 * @param list 现有账号库（登录名查重）
 * @param opts.selfId 正在编辑的账号 id，查重时排除自己
 * @param opts.passwordOptional 密码留空 = 沿用原密码（编辑态）
 * @returns 字段级错误；空对象 = 通过
 */
export function checkAccount(
  input: AccountInput,
  list: AuthAccount[],
  opts: { selfId?: string; passwordOptional?: boolean } = {},
): AccountErrors {
  const username = String(input.username || "").trim();
  const name = String(input.name || "").trim();
  const password = String(input.password || "");
  const errs: AccountErrors = {};
  if (!name) errs.name = "请填写管理员姓名";
  if (!username) errs.username = "请填写登录账号";
  else if (!USERNAME_RULE.test(username))
    errs.username = "字母开头的 3–20 位字母 / 数字 / . _ -";
  else if (
    list.some(
      (a) =>
        a.id !== opts.selfId &&
        a.username.toLowerCase() === username.toLowerCase(),
    )
  )
    errs.username = `登录账号「${username}」已被占用`;
  if (!password) {
    if (!opts.passwordOptional) errs.password = "请填写初始密码";
  } else if (!PASSWORD_RULE.test(password)) errs.password = PASSWORD_HINT;
  return errs;
}

/**
 * 由开通租户的输入生成租户管理员账号
 * @param tenant 已创建的租户（取其 id / 名称）
 * @param input 管理员登录账号 / 初始密码 / 姓名
 * @returns 绑定该租户、具备管理员档位的登录账号
 */
export function makeTenantAdmin(
  tenant: { id: string; name: string },
  input: AccountInput,
): AuthAccount {
  return {
    id: `A-${tenant.id}`,
    username: input.username.trim(),
    password: input.password,
    name: input.name.trim(),
    title: `${tenant.name} · 普通管理员`,
    tenantId: tenant.id,
    level: "tenant",
    roleId: "admin",
  };
}

/**
 * 追加一个登录账号
 * @returns 登录名或账号 id 重复时返回 false（不改动存储）
 */
export function addAccount(acc: AuthAccount): boolean {
  const list = loadAccounts();
  const dup = list.some(
    (a) =>
      a.id === acc.id || a.username.toLowerCase() === acc.username.toLowerCase(),
  );
  if (dup) return false;
  saveAccounts([...list, acc]);
  return true;
}

/**
 * 更新已有登录账号（编辑租户时改管理员姓名 / 登录账号 / 重置密码）
 * @param id 账号 id
 * @param input 表单输入；password 留空 = 沿用原密码
 * @param title 岗位文案（租户改名后同步）
 * @returns 账号不存在时返回 false
 */
export function updateAccount(
  id: string,
  input: AccountInput,
  title?: string,
): boolean {
  const list = loadAccounts();
  const old = list.find((a) => a.id === id);
  if (!old) return false;
  const next: AuthAccount = {
    ...old,
    username: input.username.trim(),
    name: input.name.trim(),
    password: input.password || old.password,
    ...(title ? { title } : {}),
  };
  saveAccounts(list.map((a) => (a.id === id ? next : a)));
  return true;
}

/** 某租户的管理员账号（租户管理列表展示用） */
export const tenantAdminOf = (list: AuthAccount[], tenantId: string) =>
  list.find((a) => a.level === "tenant" && a.tenantId === tenantId);

/**
 * 删除某租户的全部登录账号（删除租户时同步清理，否则会留下登不进任何租户的僵尸账号）
 * @description 超级管理员不绑定租户，不受影响
 * @returns 实际删除的账号数量
 */
export function removeTenantAccounts(tenantId: string): number {
  const list = loadAccounts();
  const keep = list.filter(
    (a) => !(a.level === "tenant" && a.tenantId === tenantId),
  );
  if (keep.length === list.length) return 0;
  saveAccounts(keep);
  return list.length - keep.length;
}

/** 是否超级管理员（平台运营方：可切租户、可见租户管理页） */
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
    loadAccounts().find(
      (a) => a.username.toLowerCase() === u && a.password === password,
    ) || null
  );
}

const SESSION_KEY = "inspection-session";

/** 读取当前会话（只存账号 id，账号信息按 id 回查） */
export function loadSession(): AuthAccount | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    return id ? loadAccounts().find((a) => a.id === id) || null : null;
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
