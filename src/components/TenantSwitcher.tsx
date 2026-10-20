import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Lock } from "lucide-react";
import { useStore } from "../data/store";
import { isSuper } from "../data/auth";

/**
 * 顶栏常驻租户选择器（多租户省事版）
 * @description 仿 SaaS 的「组织 / 租户」上下文切换器：常驻顶栏、随时可切，
 *              切换即整份换数据（不同缓存键）。仅超级管理员账号可切换；
 *              租户管理员锁定所属租户，按钮置灰并显示当前租户。
 */
export function TenantSwitcher() {
  const { s, setTenant, account } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tenants = s.tenants || [];
  const current = tenants.find((t) => t.id === s.tenantId) || tenants[0];
  const canSwitch = isSuper(account);

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
          canSwitch
            ? `切换租户 · ${current?.name || ""}（整份数据隔离）`
            : `当前租户 · ${current?.name || ""}（账号仅限本租户）`
        }
      >
        {canSwitch ? <Boxes size={15} /> : <Lock size={13} />}
        <span className="ts-btn-name">{current?.name || "未选择租户"}</span>
        {canSwitch && <ChevronDown size={12} className="ts-caret" />}
      </button>
      {open && canSwitch && (
        <div className="ts-menu" role="menu">
          {tenants.map((t) => {
            const off = t.status === "停用";
            return (
              <button
                key={t.id}
                role="menuitem"
                // 停用租户不可切换：由「系统设置 › 租户管理」重新启用
                disabled={off}
                title={off ? "租户已停用，请先在「系统设置 › 租户管理」启用" : t.name}
                className={"ts-item" + (t.id === s.tenantId ? " active" : "")}
                onClick={() => {
                  if (off) return;
                  setTenant(t.id);
                  setOpen(false);
                }}
              >
                <Boxes size={14} />
                <span>{t.name}</span>
                {off && <span className="ts-off">已停用</span>}
                {t.id === s.tenantId && <Check size={13} className="ts-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
