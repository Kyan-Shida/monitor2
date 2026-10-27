import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Lock, ShieldCheck } from "lucide-react";
import { useStore } from "../data/store";
import { go } from "../data/navigation";
import { allowedTenantIds } from "../data/auth";

/**
 * 顶栏常驻租户选择器（多租户省事版）
 * @description 仿 SaaS 的「组织 / 租户」上下文切换器：常驻顶栏、随时可切，
 *              切换即整份换数据（不同缓存键）。
 *              · 平台超管：默认处于「平台管理」视角，选任一厂区即进入该厂区业务视角，可选「平台管理」切回；
 *              · 客户管理员：可切本客户下的厂区；厂区管理员 / 普通用户锁定被授权范围。
 */
export function TenantSwitcher() {
  const { s, setTenant, account, platformMode, backToPlatform } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tenants = s.tenants || [];
  const current = tenants.find((t) => t.id === s.tenantId) || tenants[0];
  // 可切换厂区 = 账号有权限且启用的厂区；多于 1 个才显示切换器（客户管理员=本客户全部，用户=被授权厂区）
  const allowed = allowedTenantIds(account, tenants);
  const opts = tenants.filter((t) => allowed.includes(t.id) && t.status !== "停用");
  // 超管在平台管理视角下需要从这里切进业务；普通账号厂区多于 1 个才开放切换
  const isSuperUser = account?.level === "super";
  const onPlatform = isSuperUser && platformMode;
  const canSwitch = isSuperUser ? opts.length > 0 : opts.length > 1;

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  if (!tenants.length) return null;

  return (
    <div className="tenant-switcher" ref={ref}>
      <button
        className={"ts-btn" + (canSwitch ? "" : " locked")}
        aria-expanded={open}
        onClick={() => canSwitch && setOpen(!open)}
        disabled={!canSwitch}
        title={
          onPlatform
            ? "平台管理 · 切换到厂区可查看该厂区业务"
            : canSwitch
              ? `切换租户 · ${current?.name || ""}（整份数据隔离）`
              : `当前租户 · ${current?.name || ""}（账号仅限本租户）`
        }
      >
        {canSwitch ? <Boxes size={15} /> : <Lock size={13} />}
        <span className="ts-btn-name">
          {onPlatform ? "平台管理" : current?.name || "未选择租户"}
        </span>
        {canSwitch && <ChevronDown size={12} className="ts-caret" />}
      </button>
      {open && canSwitch && (
        <div className="ts-menu" role="menu">
          {/* 超管专属：回到平台管理（租户 / 账号） */}
          {isSuperUser && (
            <button
              role="menuitem"
              className={"ts-item" + (onPlatform ? " active" : "")}
              onClick={() => {
                backToPlatform();
                go("tenants");
                setOpen(false);
              }}
            >
              <ShieldCheck size={14} />
              <span>平台管理</span>
              {onPlatform && <Check size={13} className="ts-check" />}
            </button>
          )}
          {opts.map((t) => {
            const off = t.status === "停用";
            return (
              <button
                key={t.id}
                role="menuitem"
                // 停用租户不可切换：由「系统设置 › 租户管理」重新启用
                disabled={off}
                title={off ? "租户已停用，请先在「系统设置 › 租户管理」启用" : t.name}
                className={
                  "ts-item" +
                  (!onPlatform && t.id === s.tenantId ? " active" : "")
                }
                onClick={() => {
                  if (off) return;
                  setTenant(t.id);
                  // 超管切厂区即进入该厂区业务视角
                  if (isSuperUser) go("workbench");
                  setOpen(false);
                }}
              >
                <Boxes size={14} />
                <span>{t.name}</span>
                {off && <span className="ts-off">已停用</span>}
                {!onPlatform && t.id === s.tenantId && (
                  <Check size={13} className="ts-check" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
