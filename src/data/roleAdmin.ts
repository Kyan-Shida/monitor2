/**
 * @file roleAdmin.ts
 * @description 角色 / 权限管理的数据模型与本地存储，对应 User / Role / Menu_Permission /
 *              Role_Menu_Relation / Audit_Log
 * @interaction 被 components/RoleAdmin.tsx、RoleDrawer.tsx、ImpersonationBanner.tsx 消费
 */
import { useSyncExternalStore } from "react";
import { groups, visiblePages } from "./navigation";



/** 未单独配置的页面只有「查看」，避免凭空生成导出 / 删除这类不存在的动作 */
const BASE_ACTIONS = ["查看"];

/**
 * 页面专属动作（Menu_Permission 的按钮层）
 * @description 按各页面实际渲染的工具栏 / 行内操作逐页核对，页面没有的动作不列
 */
const PAGE_ACTIONS: Record<string, string[]> = {
  workbench: ["查看"],
  templates: ["查看", "新建", "编辑", "删除"],
  plans: ["查看", "新建", "编辑"],
  tasks: ["查看", "新建", "删除", "取消"],
  quick: ["查看", "新建"],
  dispatch: ["查看", "调度下发", "紧急插队", "临时任务", "撤回"],
  alarms: ["查看", "确认告警", "关闭告警", "现场派单"],
  "alarm-settings": ["查看", "编辑"],
  "alarm-classes": ["查看", "新增", "编辑", "删除"],
  "alarm-push": ["查看", "新增", "编辑", "删除"],
  equipment: ["查看", "新增", "编辑", "删除", "导入"],
  points: ["查看", "新增", "编辑", "删除"],
  annotation: ["查看", "新增", "编辑", "导入"],
  maps: ["查看", "新增", "编辑", "删除", "发布"],
  robots: ["查看", "新增", "编辑"],
  metrics: ["查看"],
  results: ["查看"],
  report: ["查看", "导出"],
  admin: ["查看", "新增", "编辑", "删除", "导入"],
  requirements: ["查看", "新增", "编辑"],
  payloads: ["查看", "新增", "编辑", "删除"],
  roles: ["查看", "新增", "编辑", "删除", "分配成员", "模拟登录"],
  audit: ["查看", "导出"],
  settings: ["查看", "新增", "编辑"],
};

/** 按钮权限键：`页面ID:动作` */
export const actionKey = (pageId: string, action: string) =>
  `${pageId}:${action}`;

export interface MenuPage {
  pageId: string;
  pageName: string;
  group: string;
  actions: string[];
}
export interface MenuGroup {
  id: string;
  name: string;
  children: MenuPage[];
}

/** 菜单权限树：一级中心 → 二级页面 → 页面按钮 */
export const menuTree: MenuGroup[] = groups.map(([name]) => ({
  id: name,
  name,
  children: visiblePages
    .filter((p) => p.group === name && !p.parent)
    .map((p) => ({
      pageId: p.id,
      pageName: p.name,
      group: name,
      actions: PAGE_ACTIONS[p.id] ?? BASE_ACTIONS,
    })),
}));

const ALL_PAGES = menuTree.flatMap((g) => g.children.map((c) => c.pageId));
const ALL_ACTIONS = menuTree.flatMap((g) =>
  g.children.flatMap((c) => c.actions.map((a) => actionKey(c.pageId, a))),
);
/** 按一级中心取页面 ID */
const pagesOf = (...names: string[]) =>
  menuTree
    .filter((g) => names.includes(g.name))
    .flatMap((g) => g.children.map((c) => c.pageId));
/** 取指定页面下的全部按钮键 */
const actionsOf = (pages: string[], kinds?: string[]) =>
  menuTree
    .flatMap((g) => g.children)
    .filter((c) => pages.includes(c.pageId))
    .flatMap((c) =>
      c.actions
        .filter((a) => !kinds || kinds.includes(a))
        .map((a) => actionKey(c.pageId, a)),
    );

/** 登录账号（User）：账号密码 + 人员信息，角色通过 members 关联 */
export interface Account {
  id: string;
  /** 登录账号 */
  login: string;
  /** 初始密码（原型演示明文，列表展示掩码） */
  password: string;
  name: string;
  dept: string;
  status: "启用" | "禁用";
  /** 最近登录时间 */
  lastLogin: string;
}

/** 默认账号库：覆盖各业务部门 */
export function seedAccounts(): Account[] {
  return [
    {
      id: "U-001",
      login: "wang.jie",
      password: "Init@2026",
      name: "王姐",
      dept: "信息中心",
      status: "启用",
      lastLogin: "2026-10-19 09:02:11",
    },
    {
      id: "U-002",
      login: "zhou.lao",
      password: "Init@2026",
      name: "老周",
      dept: "设备部",
      status: "启用",
      lastLogin: "2026-10-19 08:41:37",
    },
    {
      id: "U-003",
      login: "li.gong",
      password: "Init@2026",
      name: "李工",
      dept: "设备部",
      status: "启用",
      lastLogin: "2026-10-18 17:22:05",
    },
    {
      id: "U-004",
      login: "chen.gong",
      password: "Init@2026",
      name: "陈工",
      dept: "生产一部",
      status: "启用",
      lastLogin: "2026-10-18 15:10:48",
    },
    {
      id: "U-005",
      login: "zhao.min",
      password: "Init@2026",
      name: "赵敏",
      dept: "安环部",
      status: "启用",
      lastLogin: "2026-10-17 10:33:19",
    },
    {
      id: "U-006",
      login: "sun.lei",
      password: "Init@2026",
      name: "孙磊",
      dept: "生产二部",
      status: "禁用",
      lastLogin: "2026-09-30 16:08:52",
    },
    {
      id: "U-007",
      login: "zhou.ning",
      password: "Init@2026",
      name: "周宁",
      dept: "调度中心",
      status: "启用",
      lastLogin: "2026-10-19 08:05:44",
    },
    {
      id: "U-008",
      login: "wu.tong",
      password: "Init@2026",
      name: "吴桐",
      dept: "区域巡检组",
      status: "启用",
      lastLogin: "2026-10-16 14:27:30",
    },
  ];
}

/** 角色（Role） */
export interface AdminRole {
  id: string;
  /** 角色编码 */
  code: string;
  name: string;
  description: string;
  status: "启用" | "禁用";
  updatedAt: string;
  /** 超级管理员：不可删除、不可禁用 */
  isSuper?: boolean;
  /** 生效时套用的权限模板：admin / user（与 roles.ts 的两套角色能力对齐） */
  baseRole: "admin" | "user";
  /** Role_Menu_Relation：已授权页面 */
  menus: string[];
  /** Role_Menu_Relation：已授权按钮 */
  actions: string[];
  /** 成员（User.id） */
  members: string[];
}

/** 审计日志（Audit_Log） */
export interface RoleAuditLog {
  id: string;
  operator: string;
  action: string;
  target: string;
  before: string;
  after: string;
  time: string;
  ip: string;
}

/** 角色模拟状态（上帝视角） */
export interface Impersonation {
  roleId: string;
  roleName: string;
  operator: string;
  ip: string;
  at: string;
  prevRoleId: string;
}

export interface RoleAdminState {
  roles: AdminRole[];
  accounts: Account[];
  logs: RoleAuditLog[];
  impersonation: Impersonation | null;
}

/** 固定演示操作人与来源 IP（原型不接真实登录） */
export const OPERATOR = "王姐";
const IP = "10.20.31.56";

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 权限摘要：审计日志里的「变更前 / 变更后」 */
export function describeRole(r: Pick<AdminRole, "menus" | "actions">) {
  return `菜单 ${r.menus.length} 个 · 按钮 ${r.actions.length} 项`;
}

function seedRoles(): AdminRole[] {
  const allCenterPages = pagesOf(
    "工作台",
    "巡检执行",
    "调度中心",
    "告警管理",
    "资源与地图",
    "后台管理",
    "机器人管理",
    "分析与报表",
  );
  return [
    {
      id: "ROLE-SUPER",
      code: "SUPER_ADMIN",
      name: "超级管理员",
      description: "平台最高权限，负责组织、角色、审计与全网数据",
      status: "启用",
      updatedAt: "2026-10-18 09:12:00",
      isSuper: true,
      baseRole: "admin",
      menus: ALL_PAGES,
      actions: ALL_ACTIONS,
      members: ["U-001"],
    },
    {
      id: "ROLE-INSPECT",
      code: "INSPECT_ADMIN",
      name: "巡检管理员",
      description: "负责巡检计划、任务调度、结果复核与告警处置",
      status: "启用",
      updatedAt: "2026-10-17 16:40:00",
      baseRole: "admin",
      menus: allCenterPages,
      actions: actionsOf(allCenterPages),
      members: ["U-002", "U-003"],
    },
    {
      id: "ROLE-DISPATCH",
      code: "DISPATCHER",
      name: "调度员",
      description: "编排任务队列、下发调度指令与处理临时插单",
      status: "启用",
      updatedAt: "2026-10-16 11:08:00",
      baseRole: "user",
      menus: pagesOf("工作台", "巡检执行", "调度中心", "机器人管理", "分析与报表"),
      actions: actionsOf(
        pagesOf("工作台", "巡检执行", "调度中心", "机器人管理", "分析与报表"),
      ),
      members: ["U-007"],
    },
    {
      id: "ROLE-FIELD",
      code: "FIELD_GUARD",
      name: "现场保障员",
      description: "现场接管、紧急停止与告警现场处置",
      status: "启用",
      updatedAt: "2026-10-15 14:25:00",
      baseRole: "user",
      menus: pagesOf("工作台", "巡检执行", "告警管理", "资源与地图"),
      actions: actionsOf(
        pagesOf("工作台", "巡检执行", "告警管理", "资源与地图"),
      ),
      members: ["U-004", "U-008"],
    },
    {
      id: "ROLE-VIEWER",
      code: "VIEWER",
      name: "只读观察员",
      description: "跨区域查看巡检进度、结果与报表，不可修改数据",
      status: "禁用",
      updatedAt: "2026-10-12 10:02:00",
      baseRole: "user",
      menus: ALL_PAGES,
      actions: actionsOf(ALL_PAGES, ["查看", "导出"]),
      members: ["U-005", "U-006"],
    },
  ];
}

function seedLogs(): RoleAuditLog[] {
  return [
    {
      id: "AL-20261018-01",
      operator: "王姐",
      action: "修改权限",
      target: "巡检管理员",
      before: "菜单 21 个 · 按钮 84 项",
      after: "菜单 21 个 · 按钮 86 项",
      time: "2026-10-18 09:20:41",
      ip: IP,
    },
    {
      id: "AL-20261017-02",
      operator: "王姐",
      action: "新增角色",
      target: "现场保障员",
      before: "—",
      after: "菜单 12 个 · 按钮 41 项",
      time: "2026-10-17 16:41:03",
      ip: IP,
    },
    {
      id: "AL-20261015-03",
      operator: "王姐",
      action: "模拟登录",
      target: "调度员",
      before: "—",
      after: "以「调度员」身份进入系统（user 权限模板）",
      time: "2026-10-15 14:26:18",
      ip: IP,
    },
  ];
}

const KEY = "inspection-role-admin-v1";

/**
 * 旧缓存收敛：清除已下线的数据范围 / 审批字段，
 * 并剔除页面已经不存在的菜单与按钮
 */
function normalize(raw: RoleAdminState): RoleAdminState {
  return {
    ...raw,
    accounts: raw.accounts?.length ? raw.accounts : seedAccounts(),
    roles: raw.roles.map((r) => {
      const next = { ...r } as AdminRole & {
        dataTargets?: string[];
        dataScope?: string;
        approvals?: string[];
      };
      delete next.dataTargets;
      delete next.dataScope;
      delete next.approvals;
      const validPages = new Set(ALL_PAGES);
      const validActions = new Set(ALL_ACTIONS);
      next.menus = (next.menus || []).filter((id) => validPages.has(id));
      next.actions = (next.actions || []).filter((k) => validActions.has(k));
      return next;
    }),
  };
}

function load(): RoleAdminState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw?.roles?.length) return normalize(raw as RoleAdminState);
  } catch {
    /* 本地存储不可用：退回内存里的初始演示数据 */
  }
  return {
    roles: seedRoles(),
    accounts: seedAccounts(),
    logs: seedLogs(),
    impersonation: null,
  };
}

let state: RoleAdminState = load();
const listeners = new Set<() => void>();

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用：仅内存生效 */
  }
  listeners.forEach((fn) => fn());
}

function set(next: RoleAdminState) {
  state = next;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** 订阅角色 / 审计数据（跨组件共享同一份本地状态） */
export const useRoleAdmin = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

function entry(
  action: string,
  target: string,
  before: string,
  after: string,
): RoleAuditLog {
  return {
    id: `AL-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    operator: OPERATOR,
    action,
    target,
    before,
    after,
    time: stamp(),
    ip: IP,
  };
}

function commit(next: RoleAdminState, log: RoleAuditLog) {
  set({ ...next, logs: [log, ...next.logs].slice(0, 200) });
}

/** 新增角色 */
export function addRole(input: Pick<AdminRole, "name" | "code" | "description">) {
  const role: AdminRole = {
    ...input,
    id: `ROLE-${Date.now().toString(36).toUpperCase()}`,
    status: "启用",
    updatedAt: stamp(),
    baseRole: "user",
    menus: [],
    actions: [],
    members: [],
  };
  commit(
    { ...state, roles: [...state.roles, role] },
    entry("新增角色", role.name, "—", describeRole(role)),
  );
  return role;
}

/** 编辑角色基本信息 */
export function updateRole(
  id: string,
  patch: Pick<AdminRole, "name" | "code" | "description" | "status">,
) {
  const before = state.roles.find((r) => r.id === id);
  if (!before) return;
  const after: AdminRole = {
    ...before,
    ...patch,
    // 超级管理员不可禁用
    status: before.isSuper ? "启用" : patch.status,
    updatedAt: stamp(),
  };
  commit(
    { ...state, roles: state.roles.map((r) => (r.id === id ? after : r)) },
    entry("编辑角色", before.name, before.description, after.description),
  );
}

/** 删除角色（超级管理员拒删） */
export function removeRole(id: string) {
  const role = state.roles.find((r) => r.id === id);
  if (!role || role.isSuper) return false;
  commit(
    { ...state, roles: state.roles.filter((r) => r.id !== id) },
    entry("删除角色", role.name, describeRole(role), "已删除"),
  );
  return true;
}

/** 保存功能权限 */
export function savePermissions(
  id: string,
  patch: Pick<AdminRole, "menus" | "actions">,
) {
  const before = state.roles.find((r) => r.id === id);
  if (!before) return;
  const after: AdminRole = { ...before, ...patch, updatedAt: stamp() };
  commit(
    { ...state, roles: state.roles.map((r) => (r.id === id ? after : r)) },
    entry("修改权限", before.name, describeRole(before), describeRole(after)),
  );
}

/** 分配成员 */
export function assignMembers(id: string, members: string[]) {
  const before = state.roles.find((r) => r.id === id);
  if (!before) return;
  const after: AdminRole = { ...before, members, updatedAt: stamp() };
  commit(
    { ...state, roles: state.roles.map((r) => (r.id === id ? after : r)) },
    entry(
      "分配成员",
      before.name,
      `${before.members.length} 人`,
      `${members.length} 人`,
    ),
  );
}

/** 账号所属角色：由角色的 members 反查 */
export const roleOfAccount = (roles: AdminRole[], accountId: string) =>
  roles.find((r) => r.members.includes(accountId));

/** 新增账号：创建登录凭证并挂到指定角色 */
export function addAccount(input: {
  login: string;
  password: string;
  name: string;
  dept: string;
  roleId: string;
}) {
  const account: Account = {
    id: `U-${Date.now().toString(36).toUpperCase()}`,
    login: input.login,
    password: input.password,
    name: input.name,
    dept: input.dept,
    status: "启用",
    lastLogin: "—",
  };
  const roles = state.roles.map((r) =>
    r.id === input.roleId
      ? { ...r, members: [...r.members, account.id], updatedAt: stamp() }
      : r,
  );
  commit(
    { ...state, accounts: [...state.accounts, account], roles },
    entry(
      "新增账号",
      `${input.name}（${input.login}）`,
      "—",
      `所属角色：${state.roles.find((r) => r.id === input.roleId)?.name ?? "—"}`,
    ),
  );
  return account;
}

/** 编辑账号：登录名 / 姓名 / 部门 / 状态 / 归属角色 */
export function updateAccount(
  id: string,
  patch: {
    login: string;
    name: string;
    dept: string;
    status: Account["status"];
    roleId: string;
  },
) {
  const before = state.accounts.find((a) => a.id === id);
  if (!before) return;
  const roles = state.roles.map((r) => {
    const has = r.members.includes(id);
    if (r.id === patch.roleId)
      return has ? r : { ...r, members: [...r.members, id] };
    return has ? { ...r, members: r.members.filter((x) => x !== id) } : r;
  });
  commit(
    {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id === id
          ? {
              ...a,
              login: patch.login,
              name: patch.name,
              dept: patch.dept,
              status: patch.status,
            }
          : a,
      ),
      roles,
    },
    entry("编辑账号", before.name, before.dept, patch.dept),
  );
}

/** 重置密码：管理员设定新密码，审计只记动作不记内容 */
export function resetPassword(id: string, password: string) {
  const account = state.accounts.find((a) => a.id === id);
  if (!account) return;
  commit(
    {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id === id ? { ...a, password } : a,
      ),
    },
    entry("重置密码", account.name, "已加密存储", "已重置"),
  );
}

/** 删除账号：同时从所有角色中解除关联 */
export function removeAccount(id: string) {
  const account = state.accounts.find((a) => a.id === id);
  if (!account) return false;
  commit(
    {
      ...state,
      accounts: state.accounts.filter((a) => a.id !== id),
      roles: state.roles.map((r) =>
        r.members.includes(id)
          ? { ...r, members: r.members.filter((x) => x !== id) }
          : r,
      ),
    },
    entry(
      "删除账号",
      `${account.name}（${account.login}）`,
      "已启用",
      "已删除",
    ),
  );
  return true;
}

/** 进入角色模拟：记录审计，返回模拟上下文 */
export function startImpersonation(role: AdminRole, prevRoleId: string) {
  const imp: Impersonation = {
    roleId: role.id,
    roleName: role.name,
    operator: OPERATOR,
    ip: IP,
    at: stamp(),
    // 已在模拟中时沿用最初的真实身份，避免退出后回落到上一个模拟角色
    prevRoleId: state.impersonation?.prevRoleId || prevRoleId,
  };
  commit(
    { ...state, impersonation: imp },
    entry(
      "模拟登录",
      role.name,
      "—",
      `以「${role.name}」身份进入系统（${role.baseRole} 权限模板）`,
    ),
  );
  return imp;
}

/** 退出角色模拟：返回需要恢复的真实角色 ID */
export function endImpersonation() {
  const imp = state.impersonation;
  if (!imp) return undefined;
  commit(
    { ...state, impersonation: null },
    entry("退出模拟", imp.roleName, "模拟中", "恢复正常身份"),
  );
  return imp.prevRoleId;
}
