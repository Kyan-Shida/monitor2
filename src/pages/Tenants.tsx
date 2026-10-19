/**
 * @file Tenants.tsx
 * @description 系统设置 › 租户管理：平台级租户清单（名称 / 编码 / 启用停用）。
 *              · 清单跨租户同一份（data/tenants.ts 独立存储），新增后切到别的租户也看得见；
 *              · 编码是数据名称前缀（如 HD· / XB·），创建后不可改；
 *              · 停用校验由 engine 的 UPDATE_TENANT 把关：当前租户不能停用、至少保留一个启用租户；
 *                停用后的租户在顶部切换器中禁用。
 * @interaction data/tenants.ts、engine.ts（ADD_TENANT / UPDATE_TENANT）、components/TenantSwitcher.tsx
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import type { Tenant } from "../data/types";
import { Btn, Panel, Table, Field, Badge, Modal } from "../components/UI";
import { Pager } from "../components/Business";

/** 新建一条空白租户（「+ 添加租户」用） */
const blankTenant = (): Tenant => ({
  id: "",
  name: "",
  code: "",
  status: "启用",
});

export function Tenants() {
  const { s, act } = useStore();
  const list = s.tenants || [];
  const [edit, E] = useState<Tenant | null>(null);
  const [pn, PN] = useViewState("tenants.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("tenants.size");

  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = list.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <Panel
      title="租户管理"
      extra={
        <div className="actions">
          <Btn primary onClick={() => E(blankTenant())}>
            + 添加租户
          </Btn>
        </div>
      }
    >
      <Table
        heads={["租户名称", "租户编码", "状态", "当前使用", "更新时间"]}
        rows={pageRows.map((t) => [
          // 租户名称即编辑入口
          <button type="button" className="rt-link" onClick={() => E({ ...t })}>
            {t.name}
          </button>,
          t.code,
          // 状态直接落库：停用后顶部切换器不可选中（当前租户停用会被引擎拒绝）
          <button
            type="button"
            role="switch"
            aria-checked={t.status !== "停用"}
            className={"switch-btn" + (t.status !== "停用" ? " on" : "")}
            onClick={() =>
              act({
                type: "UPDATE_TENANT",
                tenant: {
                  ...t,
                  status: t.status === "停用" ? "启用" : "停用",
                },
              })
            }
          >
            {t.status === "停用" ? "停用" : "启用"}
          </button>,
          t.id === s.tenantId ? <Badge>当前</Badge> : <span className="muted">—</span>,
          <span className="muted">{t.updatedAt || "—"}</span>,
        ])}
      />
      <Pager
        page={cur}
        count={list.length}
        size={pageSize}
        onChange={PN}
        onSize={(n) => {
          SETPAGESIZE(n);
          PN(1);
        }}
      />
      {edit && (
        <Modal
          title={edit.id ? "编辑租户" : "添加租户"}
          onClose={() => E(null)}
        >
          <Field label="租户名称" required>
            <input
              value={edit.name}
              placeholder="例如 华南石化"
              onChange={(e) => E({ ...edit, name: e.target.value })}
            />
          </Field>
          <Field label={edit.id ? "租户编码（创建后不可改）" : "租户编码"} required>
            <input
              value={edit.code}
              placeholder="2–6 位大写字母或数字，如 HN"
              disabled={!!edit.id}
              onChange={(e) => E({ ...edit, code: e.target.value.toUpperCase() })}
            />
          </Field>
          {edit.id && (
            <Field label="状态">
              <select
                value={edit.status}
                onChange={(e) =>
                  E({ ...edit, status: e.target.value as Tenant["status"] })
                }
              >
                <option>启用</option>
                <option>停用</option>
              </select>
            </Field>
          )}
          <div className="modal-actions">
            <Btn onClick={() => E(null)}>取消</Btn>
            <Btn
              primary
              disabled={!edit.name.trim() || !edit.code.trim()}
              onClick={() => {
                const ok = act({
                  type: edit.id ? "UPDATE_TENANT" : "ADD_TENANT",
                  tenant: edit,
                });
                if (ok) E(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
