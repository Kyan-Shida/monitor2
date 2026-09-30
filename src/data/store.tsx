import { useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { StoreContext as C } from "./storeContext";
import { advanceAutomation } from "./automation";
import { seed } from "./seed";
import { SAMPLE_MAP_IMAGE } from "./sampleMap";
import { transition, type Action } from "./engine";
import { roleOf } from "./roles";
import type { State } from "./types";
const KEY = "inspection-v14-prototype";
/** 当前数据模型版本，须与 types.ts 的 State.schema 一致 */
const SCHEMA = 6;
/**
 * 老缓存升级：schema 1 → 2 时补齐工单/验收/接管/反馈等新增集合，
 * 并按序回填机型、移动能力、约束、健康度、固件字段，避免页面读到 undefined；
 * schema 2 → 3 时补齐 Template.state（启用/停用），否则模板列表状态列会渲染出空徽标；
 * schema 5 → 6 时补齐「地图 → 巡检任务」链路新增集合（devices/logicalPoints/routes/…），
 * 老缓存缺这些集合时由 seed() 兜底合并，页面读不到 undefined
 * @param raw 本地缓存解析出的状态对象
 * @returns 当前版本状态；无法识别时返回 null，由调用方回落到 seed()
 */
export function migrate(raw: unknown): State | null {
  if (!raw || typeof raw !== "object") return null;
  const old = raw as Record<string, any>;
  if (old.schema === SCHEMA) return old as State;
  if ([1, 2, 3, 4, 5].includes(old.schema)) {
    const base = seed();
    const merged = { ...base, ...old, schema: SCHEMA } as State;
    if (old.schema === 1) {
      const oldRobots = (old.robots as any[]) || [];
      merged.robots = oldRobots.length
        ? oldRobots.map((r, i) => ({
            ...base.robots[i % base.robots.length],
            ...r,
          }))
        : base.robots;
    }
    // Template 新增 state 字段：老缓存逐条回填默认值，保留用户已建模板
    merged.templates = (merged.templates || []).map((t: any) => ({
      ...t,
      state: t.state === "停用" ? "停用" : "启用",
    }));
    return merged;
  }
  return null;
}
/**
 * 老缓存补齐：schema 6 的缓存缺两类后加的数据，按需从 seed() 回填，
 * 保证「打开地图就有底图可标注」「打开设备主数据就有台账」。
 * @description 两类回填都不会覆盖用户的主动操作：
 *              - 底图：用户「清除底图」写入的是空串 `""`，不是 `undefined`；
 *              - 设备：仅在整份集合缺失时回填，用户删改过的集合不会被覆盖。
 * @param s 迁移后的状态
 * @returns 补全后的状态（无需补全时原样返回）
 */
function withSeedDefaults(s: State): State {
  const needMapImage = s.maps?.some((m) => m.image === undefined);
  // 设备主数据 / 工厂树 / 巡检目标台账：老缓存缺任一项即整体回填（它们同源派生，必须成套）
  const needDevices =
    !s.devices?.length ||
    !s.logicalPoints?.length ||
    !s.instruments?.length ||
    !s.businessTargets?.length;
  // 旧缓存可能存有已下线的「试验发布」状态（平台不区分试验 / 正式版）→ 归一为「已发布」
  const needNormalize = s.maps?.some((m) => (m.state as string) === "试验发布");
  /**
   * 告警 / 工单被清空过的老缓存：回填示例，否则「工作台告警与闭环」与「告警事件」是空表，
   * 看不出分级与闭环推进（只为演示可读性，不影响任何业务逻辑）
   */
  const needAlarms = !s.alarms?.length;
  if (!needMapImage && !needDevices && !needNormalize && !needAlarms) return s;
  const base = seed();
  return {
    ...s,
    maps: s.maps.map((m) => ({
      ...m,
      ...(needMapImage && m.image === undefined
        ? { image: SAMPLE_MAP_IMAGE }
        : {}),
      ...((m.state as string) === "试验发布"
        ? { state: "已发布" as const }
        : {}),
    })),
    devices: needDevices ? base.devices : s.devices,
    logicalPoints: needDevices ? base.logicalPoints : s.logicalPoints,
    areas: needDevices ? base.areas : s.areas,
    instruments: needDevices ? base.instruments : s.instruments,
    requirements: needDevices ? base.requirements : s.requirements,
    businessTargets: needDevices ? base.businessTargets : s.businessTargets,
    alarms: needAlarms ? base.alarms : s.alarms,
    workOrders: needAlarms ? base.workOrders : s.workOrders,
  };
}
function initial() {
  try {
    return withSeedDefaults(migrate(JSON.parse(localStorage.getItem(KEY) || "null")) || seed());
  } catch {
    return seed();
  }
}
/**
 * 持久化当前状态到 localStorage
 * @description 以 file:// 直接打开（离线分发）时，部分浏览器会禁用本地存储并抛错，
 *              此处必须容错，否则一次写失败就会整页白屏；失败时降级为「仅内存」
 * @param n 待持久化的状态
 */
export function persist(n: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* 存储不可用：本次浏览改为纯内存态，刷新即回到初始演示数据 */
  }
}
export function Store({ children }: { children: ReactNode }) {
  const [s, set] = useState<State>(initial),
    [message, msg] = useState("");
  const latest = useRef(s);
  latest.current = s;
  useEffect(() => {
    const tab =
      globalThis.crypto?.randomUUID?.() ||
      `clock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) {
        try {
          const n = withSeedDefaults(migrate(JSON.parse(e.newValue)));
          if (n) {
            latest.current = n;
            set(n);
          }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    const timer = setInterval(() => {
      // One browser tab owns the mock clock; other tabs consume storage updates.
      try {
        const lease = JSON.parse(
          localStorage.getItem("inspection-clock-owner") || "null",
        );
        if (lease && lease.id !== tab && lease.until > Date.now()) return;
        localStorage.setItem(
          "inspection-clock-owner",
          JSON.stringify({ id: tab, until: Date.now() + 2500 }),
        );
      } catch {}
      const n = advanceAutomation(latest.current);
      if (n !== latest.current) {
        latest.current = n;
        set(n);
        persist(n);
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
      try {
        const lease = JSON.parse(
          localStorage.getItem("inspection-clock-owner") || "null",
        );
        if (lease?.id === tab)
          localStorage.removeItem("inspection-clock-owner");
      } catch {}
    };
  }, []);
  function act(a: Action, onSuccess?: (s: State) => void) {
    try {
      const n = transition(latest.current, a);
      latest.current = n;
      set(n);
      persist(n);
      msg("操作成功 · " + n.logs[0].object);
      setTimeout(() => msg(""), 4000);
      onSuccess?.(n);
      return true;
    } catch (e) {
      msg((e as Error).message);
      return false;
    }
  }
  /**
   * 切换演示角色：仅改 roleId，不触发业务状态机
   * @param rid 角色 ID，见 roles.ts
   */
  function setRole(rid: string) {
    const n = { ...latest.current, roleId: rid };
    latest.current = n;
    set(n);
    persist(n);
    msg(`已切换角色：${roleOf(rid).name}（${roleOf(rid).scope}）`);
    setTimeout(() => msg(""), 3000);
  }
  return (
    <C.Provider
      value={{
        s,
        act,
        message,
        setRole,
        reset: () => {
          const n = seed();
          latest.current = n;
          set(n);
          persist(n);
          msg("演示数据已重置");
        },
      }}
    >
      {children}
    </C.Provider>
  );
}
export const useStore = () => useContext(C);
