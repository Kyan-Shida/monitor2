/**
 * @file tenants.ts
 * @description 多租户（演示级）的**平台级租户清单**与持久化：
 *              · 清单跨租户同一份 —— 独立存 `inspection-tenants`，
 *                否则在 A 租户新增的租户切到 B 后就看不见了；
 *              · 各租户的业务数据仍走自己的缓存键（见 store.tsx 的 keyOf）；
 *              · 本文件只依赖 types.ts，seed.ts 从这里取清单，避免循环依赖。
 * @interaction types.ts（Tenant）、seed.ts（seed / 名称前缀）、engine.ts（ADD/UPDATE_TENANT）、
 *              store.tsx（切换与持久化）、components/TenantSwitcher.tsx、pages/Tenants.tsx
 */
import type { Tenant } from "./types";

/** 默认租户：沿用老缓存键 inspection-v14-prototype，老数据零迁移 */
export const DEFAULT_TENANT = "T-DEFAULT";
/** 演示用租户清单（首次进入的兜底数据） */
export const TENANTS: Tenant[] = [
  { id: "T-DEFAULT", name: "华东炼化", code: "HD", status: "启用" },
  { id: "T-XB", name: "西部管道", code: "XB", status: "启用" },
];
/** 租户清单的独立存储键（平台级，不随租户切换） */
const TENANT_KEY = "inspection-tenants";
/** 租户编码：2–6 位大写字母 / 数字（作为数据名称前缀，如 HD· / XB·） */
export const TENANT_CODE = /^[A-Z0-9]{2,6}$/;

/**
 * 读取平台租户清单
 * @description 存储不可用 / 内容损坏时回落到内置演示清单（离线 file:// 场景也会走到这里）
 */
export function loadTenants(): Tenant[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TENANT_KEY) || "null");
    if (Array.isArray(raw) && raw.length) return raw as Tenant[];
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
