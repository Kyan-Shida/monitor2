import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Lock } from "lucide-react";
import { useStore } from "../data/store";

/**
 * 顶栏常驻租户选择器（多租户省事版）
 * @description 仿 SaaS 的「组织 / 租户」上下文切换器：常驻顶栏、随时可切，
 *              切换即整份换数据（不同缓存键）。仅超管可切换，其余角色锁定并提示。
 */
export function TenantSwitcher() {
  const { s, setTenant } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tenants = s.tenants || [];
  const current = tenants.find((t) => t.id === s.tenantId) || tenants[0];
  const canSwitch = s.roleId === "admin";

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
        className="ts-btn"
        onClick={() => canSwitch && setOpen(!open)}
        disabled={!canSwitch}
        title={
          canSwitch
            ? `切换租户 · ${current?.name || ""}（整份数据隔离）`
            : "当前角色无租户切换权限"
        }
      >
        {canSwitch ? <Boxes size={17} /> : <Lock size={14} />}
      </button>
      {open && canSwitch && (
        <div className="ts-menu" role="menu">
          {tenants.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              className={"ts-item" + (t.id === s.tenantId ? " active" : "")}
              onClick={() => {
                setTenant(t.id);
                setOpen(false);
              }}
            >
              <Boxes size={14} />
              <span>{t.name}</span>
              {t.id === s.tenantId && <Check size={13} className="ts-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
