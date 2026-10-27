/**
 * @file tenants.ts
 * @description 多租户（演示级）的**平台级租户清单**与持久化：
 *              · 清单跨租户同一份 —— 独立存 `inspection-tenants`，
 *                否则在 A 租户新增的租户切到 B 后就看不见了；
 *              · 各租户的业务数据仍走自己的缓存键（见 store.tsx 的 keyOf）；
 *              · 本文件只依赖 types.ts，seed.ts 从这里取清单，避免循环依赖。
 *              升级：租户（厂区）归属「客户 / 集团」（Customer），形成「客户 → 厂区」两级。
 * @interaction types.ts（Tenant / Customer）、seed.ts（seed / 名称前缀）、engine.ts（ADD/UPDATE_TENANT）、
 *              store.tsx（切换与持久化）、components/TenantSwitcher.tsx、pages/Tenants.tsx
 */
import type { Tenant, Customer } from "./types";

/** 默认租户：沿用老缓存键 inspection-v14-prototype，老数据零迁移 */
export const DEFAULT_TENANT = "T-DEFAULT";
/** 平台内置兜底客户：老缓存缺 customerId 的租户统一归属此处 */
export const DEFAULT_CUSTOMER = "C-DEFAULT";
/** 平台级客户清单存储键（不随租户切换） */
const CUSTOMER_KEY = "inspection-customers";

/** 演示用客户（集团）清单（首次进入的兜底数据） */
export const CUSTOMERS: Customer[] = [
  { id: "C-DEFAULT", name: "华东能源集团", code: "HD", updatedAt: "2026-10-20 10:00:00" },
  { id: "C-XB", name: "西部管道公司", code: "XB", updatedAt: "2026-10-20 10:00:00" },
  { id: "C-SHENHUA", name: "申花集团", code: "SH", updatedAt: "2026-10-25 14:30:00" },
];

/** 演示用租户（厂区）清单（首次进入的兜底数据） */
export const TENANTS: Tenant[] = [
  { id: "T-DEFAULT", name: "华东炼化", code: "HD", customerId: "C-DEFAULT", status: "启用" },
  { id: "T-XB", name: "西部管道", code: "XB", customerId: "C-XB", status: "启用" },
  { id: "T-SH-1", name: "申花一厂", code: "SH1", customerId: "C-SHENHUA", status: "启用" },
  { id: "T-SH-2", name: "申花二厂", code: "SH2", customerId: "C-SHENHUA", status: "启用" },
  { id: "T-SH-3", name: "申花三厂", code: "SH3", customerId: "C-SHENHUA", status: "启用" },
];

/** 租户清单的独立存储键（平台级，不随租户切换） */
const TENANT_KEY = "inspection-tenants";
/** 租户编码：2–6 位大写字母 / 数字（作为数据名称前缀，如 HD· / XB·） */
export const TENANT_CODE = /^[A-Z0-9]{2,6}$/;
/** 客户编码：2–6 位大写字母 / 数字 */
export const CUSTOMER_CODE = /^[A-Z0-9]{2,6}$/;

/**
 * 读取平台客户清单
 * @description 存储不可用 / 内容损坏时回落到内置演示清单（离线 file:// 场景也会走到这里）
 */
export function loadCustomers(): Customer[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      const list = raw as Customer[];
      // 补齐内置演示客户：老缓存缺申花集团等新客户时自动补上
      const ids = new Set(list.map((c) => c.id));
      const missing = CUSTOMERS.filter((c) => !ids.has(c.id));
      if (missing.length) {
        const merged = [...list, ...missing.map((c) => ({ ...c }))];
        saveCustomers(merged);
        return merged;
      }
      return list;
    }
  } catch {
    /* 存储不可用：用内置清单 */
  }
  return CUSTOMERS.map((c) => ({ ...c }));
}

/** 保存平台客户清单（新增 / 修改都写这一份） */
export function saveCustomers(list: Customer[]) {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(list));
  } catch {
    /* 存储不可用：本次浏览仅内存生效 */
  }
}

/**
 * 读取平台租户清单
 * @description 存储不可用 / 内容损坏时回落到内置演示清单（离线 file:// 场景也会走到这里）；
 *              老缓存缺 customerId 的租户统一补到 DEFAULT_CUSTOMER，避免升级后渲染空客户
 */
export function loadTenants(): Tenant[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TENANT_KEY) || "null");
    if (Array.isArray(raw) && raw.length) {
      const list = (raw as Tenant[]).map((t) => ({
        ...t,
        customerId: t.customerId || DEFAULT_CUSTOMER,
      }));
      // 补齐内置演示租户：老缓存只有华东 / 西部时，申花一 / 二 / 三厂也会出现
      const ids = new Set(list.map((t) => t.id));
      const missing = TENANTS.filter((t) => !ids.has(t.id));
      if (missing.length) {
        const merged = [...list, ...missing.map((t) => ({ ...t }))];
        saveTenants(merged);
        return merged;
      }
      return list;
    }
  } catch {
    /* 存储不可用：用内置清单 */
  }
  return TENANTS.map((t) => ({ ...t }));
}

/** 保存平台租户清单（切换 / 新增 / 修改都写这一份） */
export function saveTenants(list: Tenant[]) {
  try {
    localStorage.setItem(TENANT_KEY, JSON.stringify(list));
  } catch {
    /* 存储不可用：本次浏览仅内存生效 */
  }
}

/** 租户是否启用（停用后不能在顶部切换器选中） */
export const tenantEnabled = (t?: Tenant) => t?.status !== "停用";

/** 启用中的租户（切换器可选项） */
export const enabledTenants = (list: Tenant[]) => list.filter(tenantEnabled);

/** 某客户名下的全部租户（不分启用状态） */
export const tenantsOfCustomer = (list: Tenant[], customerId: string) =>
  list.filter((t) => t.customerId === customerId);

/** 按 id 取客户名（用于列表展示归属） */
export const customerNameOf = (list: Customer[], id?: string) =>
  list.find((c) => c.id === id)?.name || "—";
