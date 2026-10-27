/**
 * @file Tenants.tsx
 * @description 系统设置 › 租户管理：平台级租户清单（名称 / 编码 / 管理员 / 启用停用）。
 *              · 清单跨租户同一份（data/tenants.ts 独立存储），新增后切到别的租户也看得见；
 *              · 编码是数据名称前缀（如 HD· / XB·），创建后不可改；
 *              · 「添加租户」同时为该客户创建厂区普通管理员（登录账号 + 初始密码），
 *                建完即可在登录页直接登录进自己厂区，账号落 data/auth.ts 的 inspection-accounts；
 *              · 编辑租户可一并改管理员姓名 / 登录账号 / 重设密码（密码留空 = 不改）：
 *                租户改名后管理员岗位文案同步；
 *              · 删除租户会连带清掉该租户的管理员账号与业务缓存；
 *              · 停用校验由 engine 的 UPDATE_TENANT 把关：当前租户不能停用、至少保留一个启用租户；
 *                停用后的租户在顶部切换器中禁用。
 * @interaction data/tenants.ts（TENANT_CODE）、data/auth.ts（建号 / 改号 / 账号库）、
 *              engine.ts（ADD_TENANT / UPDATE_TENANT / DELETE_TENANT）、
 *              components/TenantSwitcher.tsx、pages/Login.tsx
 */
import { useMemo, useState } from "react";
import { dropTenantCache, useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import type { Tenant, Customer } from "../data/types";
import {
  TENANT_CODE,
  CUSTOMER_CODE,
  loadCustomers,
  saveCustomers,
  customerNameOf,
  DEFAULT_CUSTOMER,
} from "../data/tenants";
import {
  addAccount,
  checkAccount,
  loadAccounts,
  makeTenantAdmin,
  removeTenantAccounts,
  tenantAdminOf,
  updateAccount,
} from "../data/auth";
import { Btn, Panel, Table, Field, Badge, Modal, Drawer, Note } from "../components/UI";
import { Pager } from "../components/Business";

/** 弹窗草稿：租户字段 + 该租户管理员账号（密码不回填，留空 = 不改） */
type Draft = Tenant & {
  /** 所属客户（集团）：平台超管开厂区时指定；客户管理员锁定本客户 */
  customerId: string;
  adminName: string;
  adminUser: string;
  adminPwd: string;
  adminPwd2: string;
};

/** 新建一条空白草稿（「+ 添加租户」用） */
const blankDraft = (): Draft => ({
  id: "",
  name: "",
  code: "",
  status: "启用",
  customerId: "",
  adminName: "",
  adminUser: "",
  adminPwd: "",
  adminPwd2: "",
});

export function Tenants() {
  const { s, act, account, platformMode } = useStore();
  const list = s.tenants || [];
  /** 超管的平台管理视角不落在任何租户内，「当前使用」列无意义，整列隐藏 */
  const showCurrent = !(account.level === "super" && platformMode);
  // 客户管理员只看本客户下的厂区；平台超管看全部
  const visible =
    account.level === "customer"
      ? list.filter((t) => t.customerId === account.customerId)
      : list;
  const [edit, E] = useState<Draft | null>(null);
  /** 待删除租户：非空时弹二次确认 */
  const [del, DEL] = useState<Tenant | null>(null);
  const [errs, ERRS] = useState<Record<string, string>>({});
  /** 账号库版本：账号存 localStorage、不由 store 驱动，建号 / 改号后 +1 触发列表重渲染 */
  const [accVer, BUMP] = useState(0);
  const accounts = useMemo(() => loadAccounts(), [accVer]);
  /** 客户（集团）清单：用于列表「所属客户」列与表单「所属客户」下拉（custVer 触发重载） */
  const [custVer, BUMPC] = useState(0);
  const customers = useMemo(() => loadCustomers(), [custVer]);
  /** 新建客户内联表单：添加租户时可直接补建客户 */
  const [custOpen, CUSTOPEN] = useState(false);
  const [custName, CUSTNAME] = useState("");
  const [custCode, CUSTCODE] = useState("");
  const [custErr, CUSTERR] = useState("");
  const [pn, PN] = useViewState("tenants.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("tenants.size");

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const cur = Math.min(Math.max(1, pn), pages);
  const pageRows = visible.slice((cur - 1) * pageSize, cur * pageSize);

  /** 打开弹窗并清掉上一次的校验提示 */
  const open = (d: Draft) => {
    ERRS({});
    E(d);
  };

  /** 内联新建客户：写入平台客户清单并选中，供租户归属 */
  const createCustomer = () => {
    const name = custName.trim();
    const code = custCode.trim().toUpperCase();
    if (!name) return CUSTERR("请填写客户名称");
    if (!CUSTOMER_CODE.test(code)) return CUSTERR("客户编码为 2–6 位大写字母或数字");
    if (customers.some((c) => c.code === code)) return CUSTERR("客户编码已存在");
    const next: Customer = {
      id: `C-${Date.now().toString(36).toUpperCase()}`,
      name,
      code,
    };
    saveCustomers([...customers, next]);
    BUMPC((v) => v + 1);
    E((d) => (d ? { ...d, customerId: next.id } : d));
    CUSTOPEN(false);
    CUSTNAME("");
    CUSTCODE("");
    CUSTERR("");
  };

  /** 打开编辑弹窗：带回该租户现有管理员账号（密码不回填，留空即不改） */
  function openEdit(t: Tenant) {
    const admin = tenantAdminOf(accounts, t.id);
    open({
      ...t,
      adminName: admin?.name || "",
      adminUser: admin?.username || "",
      adminPwd: "",
      adminPwd2: "",
    });
  }

  /**
   * 保存：新增先建租户、成功回调里再建管理员；编辑先改租户、成功回调里再改管理员
   * @description 账号字段不进租户对象，提交前显式挑出四个租户字段，避免污染清单
   */
  function save() {
    if (!edit) return;
    const next: Tenant = {
      id: edit.id,
      name: edit.name.trim(),
      code: edit.code.trim().toUpperCase(),
      status: edit.status,
      // 客户管理员锁定本客户；平台超管必须选一个客户
      customerId: edit.customerId || DEFAULT_CUSTOMER,
      updatedAt: edit.updatedAt,
    };
    const bad: Record<string, string> = {};
    if (!next.name) bad.name = "请填写租户名称";
    if (!next.code) bad.code = "请填写租户编码";
    else if (!TENANT_CODE.test(next.code)) bad.code = "2–6 位大写字母或数字";
    if (!next.customerId) bad.customerId = "请选择所属客户";

    // 已有管理员：姓名 / 账号必填、密码留空即不改；未绑定管理员的租户：整组留空则不建号
    const self = next.id ? tenantAdminOf(accounts, next.id) : undefined;
    const touched =
      !!edit.adminName.trim() || !!edit.adminUser.trim() || !!edit.adminPwd;
    if (!next.id || self || touched) {
      const ae = checkAccount(
        {
          username: edit.adminUser,
          password: edit.adminPwd,
          name: edit.adminName,
        },
        accounts,
        { selfId: self?.id, passwordOptional: !!self && !edit.adminPwd },
      );
      if (ae.name) bad.adminName = ae.name;
      if (ae.username) bad.adminUser = ae.username;
      if (ae.password) bad.adminPwd = ae.password;
      // 填了密码就要确认两遍一致（新增态必填）
      if (!next.id || edit.adminPwd || edit.adminPwd2) {
        if (!edit.adminPwd2) bad.adminPwd2 = "请再次输入密码";
        else if (edit.adminPwd2 !== edit.adminPwd)
          bad.adminPwd2 = "两次输入不一致";
      }
    }
    if (Object.keys(bad).length) {
      ERRS(bad);
      return;
    }
    ERRS({});

    if (next.id) {
      const ok = act({ type: "UPDATE_TENANT", tenant: next }, () => {
        if (self) {
          const changed = updateAccount(
            self.id,
            {
              username: edit.adminUser,
              password: edit.adminPwd,
              name: edit.adminName,
            },
            `${next.name} · 厂区管理员`,
          );
          if (changed) BUMP((v) => v + 1);
        } else if (touched) {
          // 历史租户没绑管理员：这次填了账号就补一条
          if (addAccount(makeTenantAdmin(next, {
            username: edit.adminUser,
            password: edit.adminPwd,
            name: edit.adminName,
          })))
            BUMP((v) => v + 1);
        }
      });
      if (ok) E(null);
      return;
    }

    // 新建：engine 生成租户 id 后按「名称 + 编码」找回该条，再补一条绑定它的管理员账号
    const ok = act({ type: "ADD_TENANT", tenant: next }, (n) => {
      const created = (n.tenants || []).find(
        (t) => t.code === next.code && t.name === next.name,
      );
      if (!created) return;
      const admin = makeTenantAdmin(created, {
        username: edit.adminUser,
        password: edit.adminPwd,
        name: edit.adminName,
      });
      if (addAccount(admin)) BUMP((v) => v + 1);
    });
    if (ok) E(null);
  }

  /**
   * 删除租户：清单由引擎改（不能删当前租户、至少留一个），
   * 该租户的管理员账号与业务缓存在这里一并清掉，不留僵尸账号和残留数据
   */
  function doDelete(t: Tenant) {
    if (!act({ type: "DELETE_TENANT", id: t.id })) return;
    removeTenantAccounts(t.id);
    dropTenantCache(t.id);
    BUMP((v) => v + 1);
    DEL(null);
  }

  /** 新增态必填整组账号字段；编辑态只在填了内容时才要求填完 */
  const isNew = !edit?.id;

  return (
    <Panel
      title="租户管理"
      extra={
        <div className="actions">
          <Btn
            primary
            onClick={() =>
              open({
                ...blankDraft(),
                customerId: account.level === "customer" ? account.customerId || "" : "",
              })
            }
          >
            + 添加租户
          </Btn>
        </div>
      }
    >
      <Table
        heads={[
          "租户名称",
          "租户编码",
          "所属客户",
          "管理员账号",
          "状态",
          ...(showCurrent ? ["当前使用"] : []),
          "更新时间",
          "操作",
        ]}
        rows={pageRows.map((t) => {
          const admin = tenantAdminOf(accounts, t.id);
          return [
            // 租户名称即编辑入口
            <button type="button" className="rt-link" onClick={() => openEdit(t)}>
              {t.name}
            </button>,
            t.code,
            customerNameOf(customers, t.customerId),
            admin ? (
              <code>{admin.username}</code>
            ) : (
              <span className="muted">未绑定</span>
            ),
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
            ...(showCurrent
              ? [
                  t.id === s.tenantId ? (
                    <Badge>当前</Badge>
                  ) : (
                    <span className="muted">—</span>
                  ),
                ]
              : []),
            <span className="muted">{t.updatedAt || "—"}</span>,
            <span className="rt-links">
              <button type="button" className="rt-link" onClick={() => openEdit(t)}>
                编辑
              </button>
              <button
                type="button"
                className="rt-link danger"
                onClick={() => DEL(t)}
              >
                删除
              </button>
            </span>,
          ];
        })}
      />
      <Pager
        page={cur}
        count={visible.length}
        size={pageSize}
        onChange={PN}
        onSize={(n) => {
          SETPAGESIZE(n);
          PN(1);
        }}
      />
      {/* 新增态一次建两样东西（租户 + 客户自己的管理员），编辑态也能一并改管理员 */}
      {edit && (
        <Drawer
          title={edit.id ? "编辑租户" : "添加租户"}
          className="tenant-drawer"
          onClose={() => E(null)}
          footer={
            <>
              <Btn onClick={() => E(null)}>取消</Btn>
              <Btn
                primary
                disabled={
                  !edit.name.trim() ||
                  !edit.code.trim() ||
                  (isNew &&
                    (!edit.adminName.trim() ||
                      !edit.adminUser.trim() ||
                      !edit.adminPwd ||
                      !edit.adminPwd2))
                }
                onClick={save}
              >
                保存
              </Btn>
            </>
          }
        >
          <div className="tenant-form">
            <Field
              label="所属客户"
              required
              className="span-2"
              error={errs.customerId}
            >
              <div className="customer-pick">
                <select
                  value={edit.customerId}
                  disabled={account.level === "customer"}
                  onChange={(e) => E({ ...edit, customerId: e.target.value })}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {/* 客户管理员的客户固定，其余角色可顺手补建新客户 */}
                {account.level !== "customer" && (
                  <Btn small onClick={() => CUSTOPEN((v) => !v)}>
                    {custOpen ? "取消" : "+ 新建客户"}
                  </Btn>
                )}
              </div>
              {custOpen && (
                <div className="customer-new">
                  <input
                    placeholder="客户名称，如 华南石化"
                    value={custName}
                    onChange={(e) => CUSTNAME(e.target.value)}
                  />
                  <input
                    placeholder="客户编码，如 HN"
                    value={custCode}
                    onChange={(e) => CUSTCODE(e.target.value.toUpperCase())}
                  />
                  <Btn small primary onClick={createCustomer}>
                    创建
                  </Btn>
                </div>
              )}
              {custErr && <span className="customer-err">{custErr}</span>}
            </Field>
            <Field
              label="租户名称"
              required
              className="span-2"
              error={errs.name}
            >
              <input
                value={edit.name}
                placeholder="例如 华南石化"
                onChange={(e) => E({ ...edit, name: e.target.value })}
              />
            </Field>
            <Field
              label={edit.id ? "租户编码（创建后不可改）" : "租户编码"}
              required
              className="span-2"
              error={errs.code}
            >
              <input
                value={edit.code}
                placeholder="2–6 位大写字母或数字，如 HN"
                disabled={!!edit.id}
                onChange={(e) => E({ ...edit, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="管理员姓名" required={isNew} error={errs.adminName}>
              <input
                value={edit.adminName}
                placeholder="客户方负责人"
                onChange={(e) => E({ ...edit, adminName: e.target.value })}
              />
            </Field>
            <Field label="登录账号" required={isNew} error={errs.adminUser}>
              <input
                value={edit.adminUser}
                placeholder="如 hn.admin"
                autoComplete="off"
                onChange={(e) => E({ ...edit, adminUser: e.target.value.trim() })}
              />
            </Field>
            <Field
              label={edit.id ? "新密码" : "初始密码"}
              required={isNew}
              error={errs.adminPwd}
            >
              <input
                type="password"
                value={edit.adminPwd}
                placeholder={
                  edit.id ? "留空则不修改密码" : "至少 8 位，含字母与数字"
                }
                autoComplete="new-password"
                onChange={(e) => E({ ...edit, adminPwd: e.target.value })}
              />
            </Field>
            <Field label="确认密码" required={isNew} error={errs.adminPwd2}>
              <input
                type="password"
                value={edit.adminPwd2}
                placeholder="再次输入密码"
                autoComplete="new-password"
                onChange={(e) => E({ ...edit, adminPwd2: e.target.value })}
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
          </div>
        </Drawer>
      )}
      {/* 删除租户：账号与业务数据一并清除，二次确认避免误删 */}
      {del && (
        <Modal title="删除租户" slim onClose={() => DEL(null)}>
          <Note>
            将删除租户「{del.name}」及其管理员账号、全部业务数据，删除后不可恢复。
          </Note>
          <div className="modal-actions">
            <Btn onClick={() => DEL(null)}>取消</Btn>
            <Btn danger onClick={() => doDelete(del)}>
              确认删除
            </Btn>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
