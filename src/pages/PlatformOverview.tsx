/**
 * @file PlatformOverview.tsx
 * @description 平台管理视角的「速览」：租户 / 客户 / 账号 / 角色的平台侧概览；
 *              版式沿用业务工作台（欢迎横幅 + 快捷入口 + KPI + 双栏面板），内容换成平台运营口径
 * @interaction 由 src/App.tsx 在 page === "workbench" 且处于平台管理视角时渲染
 */
import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Building2,
  ScrollText,
  Users,
} from "lucide-react";
import { go } from "../data/navigation";
import { useStore } from "../data/store";
import { loadCustomers, loadTenants } from "../data/tenants";
import { loadAccounts, tenantAdminOf } from "../data/auth";
import { useRoleAdmin } from "../data/roleAdmin";
import { Badge, Note } from "../components/UI";
import { Kpis } from "../components/Business";
import mascot from "../assets/mascot-robot.jpg";

/** 左栏租户列表最多展示条数，其余走「查看全部」进租户管理 */
const TENANT_LIMIT = 6;
/** 右栏最近操作条数 */
const LOG_LIMIT = 7;

export function PlatformOverview() {
  const { account } = useStore();
  const { logs } = useRoleAdmin();
  const tenants = useMemo(() => loadTenants(), []);
  const customers = useMemo(() => loadCustomers(), []);
  const accounts = useMemo(() => loadAccounts(), []);

  /** 当前时间：每 30 秒刷新，驱动问候语与日期 */
  const [now, SETN] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => SETN(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const enabled = tenants.filter((t) => t.status !== "停用").length;
  const customerName = (id?: string) =>
    customers.find((c) => c.id === id)?.name || id || "—";
  const shownTenants = tenants.slice(0, TENANT_LIMIT);
  const shownLogs = logs.slice(0, LOG_LIMIT);

  const h = now.getHours();
  const hello =
    h < 6 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  const dateStr = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()} 星期${"日一二三四五六"[now.getDay()]}`;

  /** 快捷入口：平台视角只有租户与账号两块（角色模板 / 审计属于租户内部事务） */
  const shortcuts = [
    { label: "租户管理", icon: Boxes, page: "tenants" },
    { label: "账号管理", icon: Users, page: "roles" },
  ];

  return (
    <div className="workbench-root">
      {/* 顶部：欢迎横幅与快捷入口并排（与业务工作台同版式） */}
      <div className="wb-top">
        <section className="wb-hero">
          <div className="wb-hero-text">
            <h2>Hi~ {hello}</h2>
            <p>欢迎回来，{account?.name || "管理员"}</p>
            <small>今天是 {dateStr}</small>
          </div>
          <img className="wb-hero-avatar" src={mascot} alt="巡检助手 3D 形象" />
        </section>
        <aside className="wb-shortcuts">
          <div className="wb-sc-title">快捷入口</div>
          <div
            className="wb-sc-grid"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          >
            {shortcuts.map(({ label, icon: Icon, page }) => (
              <button key={label} className="wb-sc-item" onClick={() => go(page)}>
                <span className="wb-sc-icon">
                  <Icon size={18} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* 平台侧 KPI：租户 / 客户 / 账号 / 角色四张卡，点击进对应管理页 */}
      <Kpis
        card
        items={[
          {
            label: "租户总数",
            value: tenants.length,
            unit: "个",
            icon: Boxes,
            tone: "blue",
            hint: `其中启用 ${enabled} 个`,
            group: "平台规模",
            action: () => go("tenants"),
          },
          {
            label: "客户（集团）",
            value: customers.length,
            unit: "家",
            icon: Building2,
            tone: "purple",
            hint: "租户按客户归属，一个客户可下辖多个厂区",
            group: "平台规模",
            action: () => go("tenants"),
          },
          {
            label: "平台账号",
            value: accounts.length,
            unit: "个",
            icon: Users,
            tone: "green",
            hint: "含平台超管与各厂区管理员",
            group: "平台规模",
            action: () => go("roles"),
          },
        ]}
      />

      <section className="wb-dashboard">
        {/* 左：租户状态总览 */}
        <div className="wb-dash-col wb-robots">
          <div className="wb-dash-head">
            <div className="wb-dash-head-title">
              <Boxes size={15} />
              租户状态总览
            </div>
            <button className="wb-dash-more" onClick={() => go("tenants")}>
              租户管理
            </button>
          </div>
          <div className="wb-robot-summary">
            <span className="wb-robot-state tone-green">
              <em>{enabled}</em>
              <small>启用</small>
            </span>
            <span className="wb-robot-state tone-gray">
              <em>{tenants.length - enabled}</em>
              <small>停用</small>
            </span>
            <span className="wb-robot-state tone-blue">
              <em>{customers.length}</em>
              <small>客户</small>
            </span>
          </div>
          <ul className="wb-robot-list">
            {shownTenants.map((t) => {
              const admin = tenantAdminOf(accounts, t.id);
              return (
                <li
                  key={t.id}
                  className="wb-robot-row"
                  onClick={() => go("tenants")}
                  title="前往租户管理"
                >
                  <div className="wb-robot-main">
                    <b>
                      {t.name}
                      <Badge tone={t.status === "停用" ? "amber" : "green"}>
                        {t.status === "停用" ? "停用" : "启用"}
                      </Badge>
                    </b>
                    <small>
                      {t.code} · {customerName(t.customerId)}
                    </small>
                  </div>
                  <span className="muted">{admin ? admin.username : "未绑定"}</span>
                </li>
              );
            })}
          </ul>
          {tenants.length > shownTenants.length && (
            <button
              className="wb-dash-more wb-robot-more"
              onClick={() => go("tenants")}
            >
              还有 {tenants.length - shownTenants.length} 个未展示 · 查看全部
            </button>
          )}
          {!tenants.length && <Note>还没有租户，先从「租户管理」开通第一个客户厂区。</Note>}
        </div>

        {/* 右：最近操作（审计日志） */}
        <div className="wb-dash-col wb-today">
          <div className="wb-dash-head">
            <div className="wb-dash-head-title">
              <ScrollText size={15} />
              最近操作
            </div>
          </div>
          <ul className="wb-robot-list">
            {shownLogs.map((l) => (
              <li
                key={l.id}
                className="wb-robot-row"
                onClick={() => go("audit")}
                title="前往日志中心"
              >
                <div className="wb-robot-main">
                  <b>
                    {l.action}
                    {l.target && l.target !== "—" && <Badge>{l.target}</Badge>}
                  </b>
                  <small>
                    {l.operator} · {l.time}
                  </small>
                  {/* 变更摘要：与审计日志页的「变更前 / 变更后」同源 */}
                  {(l.before !== "—" || l.after !== "—") && (
                    <small className="wb-robot-task">
                      {l.before} → {l.after}
                    </small>
                  )}
                </div>
                <span className="muted">{l.ip}</span>
              </li>
            ))}
          </ul>
          {!shownLogs.length && <Note>暂无操作记录。</Note>}
        </div>
      </section>
    </div>
  );
}
