/**
 * @file PageTabs.tsx
 * @description 页签导航（仿浏览器多标签）：自动登记访问过的页面，支持快速切换、关闭与"关闭其他 / 全部"
 * @interaction App.tsx 在顶栏面包屑下方渲染；依赖 data/navigation（路由与跳转）、data/roles（权限过滤）
 */
import { useEffect, useState } from "react";
import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { go, routeMeta, type Route } from "../data/navigation";
import { canSee, type Role } from "../data/roles";

/** 单个页签：key 唯一标识（页面 + 对象 id），tab 记录该页内最后停留的子 Tab 以便切回时还原 */
export interface PageTab {
  key: string;
  page: string;
  id?: string;
  tab?: string;
  name: string;
  group: string;
}

/** 常驻页签（角色工作台）：不提供关闭按钮，也是关闭全部时的保底页 */
const PINNED = "workbench";
/** 页签上限：超出后淘汰最早打开的非常驻页签，避免演示时无限堆积 */
const MAX_TABS = 16;
const STORE_KEY = "pagetabs";

/**
 * 生成页签唯一标识
 * @param page 页面 ID
 * @param id 详情对象 ID（可无）
 * @returns 形如 `page` 或 `page/id` 的 key
 */
const tabKey = (page: string, id?: string) => page + (id ? "/" + id : "");

/**
 * 按页面 ID 取路由元信息
 * @param page 页面 ID
 * @returns 对应元信息；未知页面返回 undefined
 */
const metaOf = (page: string) => routeMeta.find((x) => x.id === page);

/**
 * 从会话存储恢复页签列表
 * @returns 上次会话的页签；无记录或存储被禁用时返回空数组
 */
function loadTabs(): PageTab[] {
  try {
    const arr = JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(arr)
      ? arr.filter(
          (t: PageTab) => t && t.page && t.name && !metaOf(t.page)?.parent,
        )
      : [];
  } catch {
    return [];
  }
}

/**
 * 持久化页签列表
 * @param tabs 待写入的页签
 */
function saveTabs(tabs: PageTab[]) {
  // 离线 file:// 打开时部分浏览器禁用会话存储，写失败不影响本次浏览
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(tabs));
  } catch {
    /* 忽略存储失败 */
  }
}

/**
 * 页签导航组件
 * @param route 当前路由（变化时自动登记 / 更新页签）
 * @param role 当前角色（切换角色后自动清掉无权限页签）
 * @param iconOf 页面 ID → 图标映射，由 App 传入以复用侧边栏同一套图标
 */
export function PageTabs({
  route,
  role,
  iconOf,
}: {
  route: Route;
  role: Role;
  iconOf: Record<string, LucideIcon>;
}) {
  const [tabs, setTabs] = useState<PageTab[]>(loadTabs);
  const [menuOpen, setMenuOpen] = useState(false);
  // 内置页（有 parent）复用其父级「二级目录」页签，不单独展示；页签仅登记二级目录页面
  const activeMeta = metaOf(route.page);
  const activePage = activeMeta?.parent || route.page;
  const activeId = activeMeta?.parent ? undefined : route.id;
  const activeKey = tabKey(activePage, activeId);

  // 首次挂载：清理残留的内置页页签（有 parent 的），并保证常驻工作台页签存在
  useEffect(() => {
    setTabs((prev) => {
      const cleaned = prev.filter(
        (t) => t.key === PINNED || !metaOf(t.page)?.parent,
      );
      if (cleaned.some((t) => t.key === PINNED)) return cleaned;
      const meta = metaOf(PINNED);
      return meta
        ? [
            { key: PINNED, page: PINNED, name: meta.name, group: meta.group },
            ...cleaned,
          ]
        : cleaned;
    });
  }, []);

  // 路由变化：登记新页签；内置页（有 parent）归属其父级「二级目录」页签，不单独展示
  useEffect(() => {
    const meta = metaOf(route.page);
    if (!meta) return; // 未知路由不登记
    // 内置页复用父级「二级目录」页签
    const tabPage = meta.parent || route.page;
    const tabId = meta.parent ? undefined : route.id;
    const tabMeta = metaOf(tabPage);
    if (!tabMeta) return;
    const key = tabKey(tabPage, tabId);
    setTabs((prev) => {
      const exists = prev.find((t) => t.key === key);
      if (exists)
        return exists.tab === route.tab
          ? prev
          : prev.map((t) => (t.key === key ? { ...t, tab: route.tab } : t));
      const next: PageTab[] = [
        ...prev,
        {
          key,
          page: tabPage,
          id: tabId,
          tab: route.tab,
          name: tabMeta.name,
          group: tabMeta.group,
        },
      ];
      // 超限淘汰：移除最早的非常驻、非当前页签
      if (next.length > MAX_TABS) {
        const drop = next.find((t) => t.key !== PINNED && t.key !== key);
        if (drop) next.splice(next.indexOf(drop), 1);
      }
      return next;
    });
  }, [route.page, route.id, route.tab]);

  // 角色切换：清掉当前角色无权访问的页签，避免切换后点页签落到权限提示页
  useEffect(() => {
    setTabs((prev) => {
      const next = prev.filter(
        (t) => t.key === PINNED || canSee(role, t.page, t.group),
      );
      return next.length === prev.length ? prev : next;
    });
    // 仅在角色变化时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id]);

  // 页签变化时持久化，刷新页面后仍保留
  useEffect(() => saveTabs(tabs), [tabs]);

  /**
   * 切换到指定页签（沿用该页签最后停留的子 Tab）
   * @param t 目标页签
   */
  const switchTo = (t: PageTab) => go(t.page, t.id, t.tab);

  /**
   * 关闭页签；若关闭的是当前页签，则激活其相邻页签
   * @param key 待关闭页签的 key
   */
  const close = (key: string) => {
    const idx = tabs.findIndex((t) => t.key === key);
    if (idx < 0) return;
    const next = tabs.filter((t) => t.key !== key);
    setTabs(next);
    if (key === activeKey) {
      // 优先激活同位置的右侧页签，越界则回落到最左（常驻工作台兜底）
      const neighbor = next[Math.min(idx, next.length - 1)];
      if (neighbor) go(neighbor.page, neighbor.id, neighbor.tab);
      else go(PINNED);
    }
  };

  /** 关闭其他页签：仅保留常驻页签与当前页签 */
  const closeOthers = () => {
    setTabs((prev) => prev.filter((t) => t.key === PINNED || t.key === activeKey));
    setMenuOpen(false);
  };

  /** 关闭全部页签：回到常驻工作台 */
  const closeAll = () => {
    setTabs((prev) => prev.filter((t) => t.key === PINNED));
    setMenuOpen(false);
    if (activeKey !== PINNED) go(PINNED);
  };

  return (
    <div className="page-tabs">
      <div className="page-tabs-scroll">
        {tabs.map((t) => {
          const Icon = iconOf[t.page];
          return (
            <div
              key={t.key}
              className={"page-tab" + (t.key === activeKey ? " active" : "")}
              title={t.name}
              onClick={() => switchTo(t)}
            >
              {Icon && <Icon size={13} className="page-tab-icon" />}
              <span className="page-tab-name">{t.name}</span>
              {t.key !== PINNED && (
                <button
                  className="page-tab-close"
                  title="关闭页签"
                  onClick={(e) => {
                    e.stopPropagation();
                    close(t.key);
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="page-tabs-tools">
        <button
          className="page-tabs-more"
          title="页签操作"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <ChevronDown size={14} />
        </button>
        {menuOpen && (
          <>
            <div className="page-tabs-mask" onClick={() => setMenuOpen(false)} />
            <div className="page-tabs-menu">
              <button onClick={closeOthers}>关闭其他页签</button>
              <button onClick={closeAll}>关闭全部页签</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
