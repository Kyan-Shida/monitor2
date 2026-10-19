/**
 * @file ImpersonationBanner.tsx
 * @description 全局角色模拟横幅：模拟期间常驻页面顶部，点击退出并恢复真实身份
 * @interaction 消费 data/roleAdmin.ts（impersonation）与 data/store.tsx（setRole）
 */
import { AlertTriangle } from "lucide-react";
import { useStore } from "../data/store";
import { endImpersonation, useRoleAdmin } from "../data/roleAdmin";

export function ImpersonationBanner() {
  const { setRole } = useStore();
  const { impersonation } = useRoleAdmin();
  if (!impersonation) return null;

  function exit() {
    const prev = endImpersonation();
    if (prev) setRole(prev);
  }

  return (
    <div className="impersonation-banner" role="alert">
      <AlertTriangle size={16} />
      <b>【警告】您当前正处于角色模拟状态</b>
      <span>当前角色：{impersonation.roleName}</span>
      <span className="ib-meta">
        操作人 {impersonation.operator} · IP {impersonation.ip} ·{" "}
        {impersonation.at}
      </span>
      <button onClick={exit}>点击退出模拟</button>
    </div>
  );
}
