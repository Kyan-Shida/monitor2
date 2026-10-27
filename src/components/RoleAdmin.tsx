/**
 * @file RoleAdmin.tsx
 * @description 角色 / 权限管理主页面：角色列表、权限配置、成员分配、角色模拟与审计日志
 * @interaction 由 pages/Supporting.tsx 在 page === "roles" 时渲染
 */
import { useMemo, useState } from "react";
import { Badge, Btn, Confirm, Drawer, Field, MultiSelect, Panel, Switch, Table } from "./UI";
import { Pager } from "./Business";
import { FilterPanel } from "./FilterPanel";
import { Segmented } from "./Segmented";
import { RoleDrawer } from "./RoleDrawer";
import { useStore } from "../data/store";
import { roleOf } from "../data/roles";
import { go, usePageSize, useViewState } from "../data/navigation";
import { loadCustomers, loadTenants } from "../data/tenants";
import {
  loadAccounts,
  addAccount,
  updateAccount,
  removeAccount,
  resetPassword,
  type AuthAccount,
} from "../data/auth";
import {
  assignMembers,
  membersOf,
  removeRole,
  roleOfAccount,
  startImpersonation,
  unlinkAccount,
  useRoleAdmin,
  type AdminRole,
  type RoleAuditLog,
} from "../data/roleAdmin";

/** 成员分配：从账号库勾选 */
function MemberForm({
  role,
  accounts,
  members,
  onClose,
}: {
  role: AdminRole;
  accounts: AuthAccount[];
  /** 对账后的真实成员：已剔除已删账号与已归其他角色的账号 */
  members: string[];
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(members);
  const [ask, ASK] = useState(false);
  const toggle = (id: string) =>
    setPicked(
      picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id],
    );

  return (
    <>
      <Drawer
        title={`分配成员 · ${role.name}`}
        className="account-drawer"
        onClose={onClose}
        footer={
          <>
            <Btn onClick={onClose}>取消</Btn>
            <Btn primary onClick={() => ASK(true)}>
              保存
            </Btn>
          </>
        }
      >
        <div className="role-members">
          {accounts.map((u) => (
            <label className="perm-action" key={u.id}>
              <input
                type="checkbox"
                checked={picked.includes(u.id)}
                onChange={() => toggle(u.id)}
              />
              {u.name}
              <small>
                {u.username} · {u.dept}
              </small>
            </label>
          ))}
        </div>
      </Drawer>
      {ask && (
        <Confirm
          title="保存成员分配"
          message={`「${role.name}」的成员将变更为 ${picked.length} 人。`}
          confirmText="保存"
          onClose={() => ASK(false)}
          onConfirm={() => {
            assignMembers(role.id, picked);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** 新增 / 编辑登录账号（账号统一来自 auth.ts） */
function AccountForm({
  account,
  roles,
  me,
  onClose,
}: {
  account?: AuthAccount;
  roles: AdminRole[];
  /** 当前登录者：决定可分配的客户 / 厂区 / 级别范围（超管全开） */
  me: AuthAccount;
  onClose: () => void;
}) {
  const customers = loadCustomers();
  const tenants = loadTenants();
  const current = account ? roleOfAccount(roles, account.id) : undefined;
  // 当前操作者能分配的客户 / 厂区范围：超管全开，其余锁定到自己的客户（厂区管理员再锁到本厂）
  const isSuper = me.level === "super";
  const scopeCustomers = isSuper
    ? customers
    : customers.filter((c) => c.id === me.customerId);
  const scopeTenants = isSuper
    ? tenants
    : me.level === "tenant"
      ? tenants.filter((t) => t.id === me.tenantId)
      : tenants.filter((t) => t.customerId === me.customerId);
  const [username, USERNAME] = useState(account?.username ?? "");
  const [password, PWD] = useState("");
  const [name, NAME] = useState(account?.name ?? "");
  const [dept, DEPT] = useState(account?.dept ?? "");
  const [customerId, CUSTOMER] = useState(
    isSuper ? (account?.customerId ?? "") : (me.customerId ?? ""),
  );
  const [tenantIds, TENANTS] = useState<string[]>(account?.tenantIds ?? []);
  const [status, STATUS] = useState<AuthAccount["status"]>(
    account?.status ?? "启用",
  );
  const [roleId, ROLEID] = useState(current?.id ?? roles[0]?.id ?? "");
  const [ask, ASK] = useState(false);

  // 换客户：清空已选厂区，避免残留别的客户的厂区
  const onCustomer = (cid: string) => {
    CUSTOMER(cid);
    TENANTS([]);
  };

  // 可分配厂区 = 当前所选客户下、且在操作者权限范围内的厂区
  const custTenants = scopeTenants.filter((t) => t.customerId === customerId);
  const allTenantIds = custTenants.map((t) => t.id);
  const allPicked =
    allTenantIds.length > 0 && allTenantIds.every((id) => tenantIds.includes(id));
  /**
   * 级别由厂区选择推导（不再单独填写）：
   * 勾 1 个 = 厂区管理员；全选 = 客户管理员；勾多个 = 普通用户
   */
  const derivedLevel: AuthAccount["level"] =
    allPicked && allTenantIds.length > 1
      ? "customer"
      : tenantIds.length === 1
        ? "tenant"
        : "user";
  const isSuperAccount = account?.level === "super";
  const ready =
    (isSuperAccount || (!!customerId && tenantIds.length > 0)) &&
    !!username.trim() &&
    !!name.trim() &&
    !!roleId &&
    (!!account || !!password.trim());

  return (
    <>
      <Drawer
        title={account ? "编辑账号" : "新增账号"}
        className="account-drawer"
        onClose={onClose}
        footer={
          <>
            <Btn onClick={onClose}>取消</Btn>
            <Btn primary disabled={!ready} onClick={() => ASK(true)}>
              保存
            </Btn>
          </>
        }
      >
        <Field label="登录账号" required>
          <input value={username} onChange={(e) => USERNAME(e.target.value)} />
        </Field>
        {!account && (
          <Field label="初始密码" required>
            <input
              type="password"
              value={password}
              onChange={(e) => PWD(e.target.value)}
            />
          </Field>
        )}
        <Field label="姓名" required>
          <input value={name} onChange={(e) => NAME(e.target.value)} />
        </Field>
        <Field label="所属部门">
          <input value={dept} onChange={(e) => DEPT(e.target.value)} />
        </Field>
        {!isSuperAccount && (
          <Field label="所属客户" required>
            <select
              value={customerId}
              disabled={!isSuper}
              onChange={(e) => onCustomer(e.target.value)}
            >
              {/* 平台超管需先选客户，厂区选项才会按客户收敛 */}
              {isSuper && <option value="">请选择客户</option>}
              {scopeCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!isSuperAccount && (
          <Field label="管理厂区" required>
            <MultiSelect
              options={allTenantIds}
              value={tenantIds}
              onChange={TENANTS}
              labelOf={(id) => tenants.find((t) => t.id === id)?.name || id}
              placeholder={
                custTenants.length ? "请选择厂区" : "请先选择所属客户"
              }
            />
            {custTenants.length > 1 && (
              <div className="actions" style={{ marginTop: 8 }}>
                <Btn small onClick={() => TENANTS(allPicked ? [] : allTenantIds)}>
                  {allPicked ? "清空" : "全选"}
                </Btn>
              </div>
            )}
          </Field>
        )}
        <Field label="所属角色" required>
          <select value={roleId} onChange={(e) => ROLEID(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="状态">
          <div className="switch-row">
            <Switch
              checked={status === "启用"}
              label="启用状态"
              onChange={(on) => STATUS(on ? "启用" : "停用")}
            />
            {status}
          </div>
        </Field>
      </Drawer>
      {ask && (
        <Confirm
          title={account ? "保存账号信息" : "创建账号"}
          message={
            account
              ? `「${username}」的信息保存后立即生效。`
              : `将新建账号「${username}」并绑定角色。`
          }
          confirmText="保存"
          onClose={() => ASK(false)}
          onConfirm={() => {
            const role = roles.find((r) => r.id === roleId);
            const baseRole = role?.baseRole ?? "user";
            const custName = customers.find((c) => c.id === customerId)?.name || "";
            const tenName = tenants.find((t) => t.id === tenantIds[0])?.name || "";
            // 级别由厂区勾选推导；超管账号本身不在此处维护
            const lv: AuthAccount["level"] = isSuperAccount ? "super" : derivedLevel;
            const title = isSuperAccount
              ? "平台超级管理员"
              : lv === "customer"
                ? `${custName} · 客户管理员`
                : lv === "tenant"
                  ? `${tenName} · 厂区管理员`
                  : `${custName} · 普通用户`;
            const finalTenantIds = isSuperAccount ? [] : tenantIds;
            // 主属厂区：厂区管理员 / 普通用户落到第一个勾选厂区，客户管理员不指定
            const mainTenantId =
              isSuperAccount || lv === "customer" ? undefined : tenantIds[0];
            const id = account?.id ?? `U-${Date.now().toString(36).toUpperCase()}`;
            if (account) {
              updateAccount(account.id, {
                username,
                password,
                name,
                customerId: isSuperAccount ? undefined : customerId,
                tenantId: mainTenantId,
                tenantIds: finalTenantIds,
                level: lv,
                roleId: baseRole,
                dept,
                status,
                title,
              });
            } else {
              addAccount({
                id,
                username,
                password,
                name,
                title,
                customerId: isSuperAccount ? undefined : customerId,
                tenantId: mainTenantId,
                tenantIds: finalTenantIds,
                level: lv,
                roleId: baseRole,
                dept,
                status,
              });
            }
            // 角色成员同步：先从其他角色移除，再加入所选角色，保证「所属角色」列与成员数一致
            for (const r of roles) {
              if (r.id !== roleId && r.members.includes(id))
                assignMembers(r.id, r.members.filter((x) => x !== id));
            }
            if (role && !role.members.includes(id))
              assignMembers(role.id, [...role.members, id]);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** 重置密码：管理员设定新密码，不展示原密码 */
function ResetPasswordForm({
  account,
  onClose,
}: {
  account: AuthAccount;
  onClose: () => void;
}) {
  const [password, PWD] = useState("");
  const [ask, ASK] = useState(false);
  const ready = !!password.trim();

  return (
    <>
      <Drawer
        title={`重置密码 · ${account.name}`}
        className="account-drawer"
        onClose={onClose}
        footer={
          <>
            <Btn onClick={onClose}>取消</Btn>
            <Btn primary disabled={!ready} onClick={() => ASK(true)}>
              确认重置
            </Btn>
          </>
        }
      >
        <Field label="新密码" required>
          <input
            type="password"
            value={password}
            onChange={(e) => PWD(e.target.value)}
          />
        </Field>
      </Drawer>
      {ask && (
        <Confirm
          title="重置密码"
          message={`重置后「${account.name}」需用新密码登录。`}
          confirmText="确认重置"
          danger
          onClose={() => ASK(false)}
          onConfirm={() => {
            resetPassword(account.id, password);
            onClose();
          }}
        />
      )}
    </>
  );
}

/** 审计日志 */
function AuditTable({ logs }: { logs: RoleAuditLog[] }) {
  return (
    <Table
      heads={["操作人", "操作类型", "操作对象", "变更前", "变更后", "操作时间"]}
      rows={logs.map((l) => [
        l.operator,
        <Badge>{l.action}</Badge>,
        l.target,
        <span className="muted">{l.before}</span>,
        l.after,
        <>
          {l.time}
          <small>IP {l.ip}</small>
        </>,
      ])}
    />
  );
}

export function RoleAdmin() {
  const { s, setRole, account, platformMode } = useStore();
  const { roles, logs, impersonation } = useRoleAdmin();
  /** 超管「平台管理」视角：只看租户账号，不展示角色模板 / 审计 */
  const platformOnly = account?.level === "super" && platformMode;
  // 账号统一来自 auth.ts（与登录 / 租户绑定同一份数据，避免账号对不上）
  const [accVer, BUMP] = useState(0);
  const accounts = useMemo(() => loadAccounts(), [accVer]);
  // 成员数与「账号管理」的所属角色同口径：只算账号库里的真实账号，一人一角色
  const aliveIds = useMemo(() => new Set(accounts.map((a) => a.id)), [accounts]);
  const membersOfRole = (r: AdminRole) => membersOf(roles, r, aliveIds);
  const tenants = useMemo(() => loadTenants(), []);
  const customers = useMemo(() => loadCustomers(), []);
  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name || id;
  const customerName = (id?: string) =>
    customers.find((c) => c.id === id)?.name || id || "—";
  const levelLabel = (lv?: string) =>
    lv === "super"
      ? "平台超管"
      : lv === "customer"
        ? "客户管理员"
        : lv === "tenant"
          ? "厂区管理员"
          : "普通用户";
  // 平台超管只做租户账号管理：默认落在账号页，且不展示角色 / 审计 tab
  const [tab, setTab] = useState<"roles" | "accounts" | "audit">(
    platformOnly ? "accounts" : "roles",
  );
  const [editId, setEditId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [delId, setDelId] = useState("");
  const [creating, setCreating] = useState(false);
  const [accountEditId, setAccountEditId] = useState("");
  const [accountCreating, setAccountCreating] = useState(false);
  const [accountDelId, setAccountDelId] = useState("");
  const [resetId, setResetId] = useState("");
  const [accountKw, ACCOUNTKW] = useViewState("roles.account.query", "");
  const [accountPage, ACCOUNTPAGE] = useViewState("roles.account.page", 1);
  const [accountSize, ACCOUNTSIZE] = usePageSize("roles.account.size");

  // 角色筛选：草稿条件，点「查询」才写回生效值
  const [roleKw, ROLEKW] = useViewState("roles.query", "");
  const [roleStatus, ROLESTATUS] = useViewState("roles.status", "全部");
  const [roleDraft, DRAFT] = useState({
    kw: roleKw,
    status: roleStatus,
  });
  const [roleFilterOpen, OPENFILTER] = useState(false);
  const [rolePage, ROLEPAGE] = useViewState("roles.page", 1);
  const [roleSize, ROLESIZE] = usePageSize("roles.size");

  // 审计日志筛选
  const [logKw, LOGKW] = useViewState("roles.log.query", "");
  const [logAction, LOGACTION] = useViewState("roles.log.action", "全部");
  const [logDraft, LOGDRAFT] = useState({ kw: logKw, action: logAction });
  const [logFilterOpen, OPENLOG] = useState(false);
  const [logPage, LOGPAGE] = useViewState("roles.log.page", 1);
  const [logSize, LOGSIZE] = usePageSize("roles.log.size");

  const roleList = roles.filter((r) => {
    if (roleKw && !(r.name + r.code + r.description).includes(roleKw))
      return false;
    if (roleStatus !== "全部" && r.status !== roleStatus) return false;
    return true;
  });
  const roleMax = Math.max(1, Math.ceil(roleList.length / roleSize));
  const roleCur = Math.min(rolePage, roleMax);
  const roleShown = roleList.slice((roleCur - 1) * roleSize, roleCur * roleSize);
  const roleFilterCount =
    (roleStatus !== "全部" ? 1 : 0) + (roleKw.trim() ? 1 : 0);

  // 账号列表范围：平台管理视角=全平台（不含超管）；客户管理员=本客户全部厂区账号；
  // 厂区管理员=主属本厂的账号（跨厂 / 集团级账号由上级管理，避免误改其授权）
  const meLevel = account?.level;
  const scopedAccounts = platformOnly
    ? accounts.filter((a) => a.level !== "super")
    : meLevel === "customer"
      ? accounts.filter(
          (a) => a.level !== "super" && a.customerId === account?.customerId,
        )
      : accounts.filter(
          (a) =>
            a.level !== "super" &&
            a.tenantId === s.tenantId &&
            (a.level !== "user" ||
              (a.tenantIds || []).every((id) => id === s.tenantId)),
        );
  const accountList = scopedAccounts.filter(
    (a) =>
      !accountKw ||
      (a.username + a.name + (a.dept || "")).includes(accountKw),
  );
  const accountMax = Math.max(1, Math.ceil(accountList.length / accountSize));
  const accountCur = Math.min(accountPage, accountMax);
  const accountShown = accountList.slice(
    (accountCur - 1) * accountSize,
    accountCur * accountSize,
  );
  const accountEdit = accounts.find((a) => a.id === accountEditId);
  const accountDel = accounts.find((a) => a.id === accountDelId);
  const resetAccount = accounts.find((a) => a.id === resetId);

  const logKinds = ["全部", ...new Set(logs.map((l) => l.action))];
  const logList = logs.filter(
    (l) =>
      (!logKw || (l.operator + l.target + l.before + l.after).includes(logKw)) &&
      (logAction === "全部" || l.action === logAction),
  );
  const logMax = Math.max(1, Math.ceil(logList.length / logSize));
  const logCur = Math.min(logPage, logMax);
  const logShown = logList.slice((logCur - 1) * logSize, logCur * logSize);
  const logFilterCount =
    (logAction !== "全部" ? 1 : 0) + (logKw.trim() ? 1 : 0);

  /** 展开 / 收起角色筛选：展开时用生效值回填草稿 */
  function toggleRoleFilter() {
    if (!roleFilterOpen) DRAFT({ kw: roleKw, status: roleStatus });
    OPENFILTER(!roleFilterOpen);
  }
  function applyRoleFilter() {
    ROLEKW(roleDraft.kw);
    ROLESTATUS(roleDraft.status);
    ROLEPAGE(1);
    OPENFILTER(false);
  }
  function resetRoleFilter() {
    DRAFT({ kw: "", status: "全部" });
    ROLEKW("");
    ROLESTATUS("全部");
    ROLEPAGE(1);
  }
  function toggleLogFilter() {
    if (!logFilterOpen) LOGDRAFT({ kw: logKw, action: logAction });
    OPENLOG(!logFilterOpen);
  }
  function applyLogFilter() {
    LOGKW(logDraft.kw);
    LOGACTION(logDraft.action);
    LOGPAGE(1);
    OPENLOG(false);
  }
  function resetLogFilter() {
    LOGDRAFT({ kw: "", action: "全部" });
    LOGKW("");
    LOGACTION("全部");
    LOGPAGE(1);
  }

  const editRole = roles.find((r) => r.id === editId);
  const memberRole = roles.find((r) => r.id === memberId);
  const delRole = roles.find((r) => r.id === delId);

  /** 模拟登录：切换全局权限并落到该模板的落地页 */
  function impersonate(role: AdminRole) {
    if (role.status === "禁用") return;
    startImpersonation(role, roleOf(s.roleId).id);
    setRole(role.baseRole);
    go(roleOf(role.baseRole).landing);
  }

  return (
    <>
      {/* 平台超管只有「账号管理」一个视图，不展示角色模板与审计入口 */}
      {!platformOnly && (
        <Segmented<"roles" | "accounts" | "audit">
          items={[
            { key: "roles", label: `角色列表（${roles.length}）` },
            { key: "accounts", label: `账号管理（${scopedAccounts.length}）` },
            { key: "audit", label: `审计日志（${logs.length}）` },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}

      {tab === "roles" && (
        <Panel
          className="panel-filters-wrap"
          title="角色列表"
          extra={
            <div className="actions">
              <Btn onClick={toggleRoleFilter}>
                {roleFilterOpen ? "收起筛选" : "筛选"}
                {roleFilterCount ? `（${roleFilterCount}）` : ""}
              </Btn>
              <Btn primary onClick={() => setCreating(true)}>
                ＋ 新增角色
              </Btn>
            </div>
          }
        >
          {roleFilterOpen && (
            <FilterPanel
              fields={[
                {
                  key: "kw",
                  label: "角色",
                  placeholder: "名称 / 编码 / 描述",
                },
                {
                  key: "status",
                  label: "状态",
                  options: ["全部", "启用", "禁用"],
                },
              ]}
              value={roleDraft}
              onChange={(next) => DRAFT({ ...roleDraft, ...next })}
              onSearch={applyRoleFilter}
              onReset={resetRoleFilter}
            />
          )}
          <Table
            heads={[
              "角色名称",
              "角色编码",
              "描述",
              "成员",
              "状态",
              "更新时间",
              "操作",
            ]}
            rows={roleShown.map((r) => [
              <>
                {r.name}
                {r.isSuper && <Badge tone="blue">内置</Badge>}
                {impersonation?.roleId === r.id && (
                  <Badge tone="red">模拟中</Badge>
                )}
              </>,
              <code>{r.code}</code>,
              <span className="muted">{r.description}</span>,
              `${membersOfRole(r).length} 人`,
              <Badge tone={r.status === "启用" ? "green" : "amber"}>
                {r.status}
              </Badge>,
              r.updatedAt,
              <div className="actions">
                <Btn small onClick={() => setMemberId(r.id)}>
                  分配成员
                </Btn>
                <Btn small onClick={() => setEditId(r.id)}>
                  编辑
                </Btn>
                <Btn
                  small
                  danger
                  disabled={r.isSuper}
                  onClick={() => setDelId(r.id)}
                >
                  删除
                </Btn>
                <Btn
                  small
                  disabled={r.isSuper || r.status === "禁用"}
                  onClick={() => impersonate(r)}
                >
                  模拟登录
                </Btn>
              </div>,
            ])}
          />
          <Pager
            page={roleCur}
            count={roleList.length}
            size={roleSize}
            unit="个角色"
            onChange={ROLEPAGE}
            onSize={(n) => {
              ROLESIZE(n);
              ROLEPAGE(1);
            }}
          />
        </Panel>
      )}

      {tab === "accounts" && (
        <Panel
          className="panel-filters-wrap"
          title="账号管理"
          extra={
            <div className="actions">
              <input
                placeholder="搜索登录账号 / 姓名 / 部门"
                value={accountKw}
                onChange={(e) => ACCOUNTKW(e.target.value)}
              />
              <Btn primary onClick={() => setAccountCreating(true)}>
                ＋ 新增账号
              </Btn>
            </div>
          }
        >
          <Table
            heads={[
              "登录账号",
              "姓名",
              "部门",
              "所属角色",
              "所属客户",
              "可访问厂区",
              "状态",
              "最近登录",
              "操作",
            ]}
            rows={accountShown.map((a) => [
              <code>{a.username}</code>,
              a.name,
              a.dept || "—",
              roleOfAccount(roles, a.id)?.name || "—",
              customerName(a.customerId),
              a.tenantIds?.length
                ? a.tenantIds.map(tenantName).join("、")
                : "全部",
              <Badge tone={a.status === "启用" ? "green" : "amber"}>
                {a.status}
              </Badge>,
              a.lastLogin || "—",
              <div className="actions">
                <Btn small onClick={() => setResetId(a.id)}>
                  重置密码
                </Btn>
                <Btn small onClick={() => setAccountEditId(a.id)}>
                  编辑
                </Btn>
                <Btn small danger onClick={() => setAccountDelId(a.id)}>
                  删除
                </Btn>
              </div>,
            ])}
          />
          <Pager
            page={accountCur}
            count={accountList.length}
            size={accountSize}
            unit="个账号"
            onChange={ACCOUNTPAGE}
            onSize={(n) => {
              ACCOUNTSIZE(n);
              ACCOUNTPAGE(1);
            }}
          />
        </Panel>
      )}

      {tab === "audit" && (
        <Panel
          className="panel-filters-wrap"
          title="审计日志"
          extra={
            <div className="actions">
              <Btn onClick={toggleLogFilter}>
                {logFilterOpen ? "收起筛选" : "筛选"}
                {logFilterCount ? `（${logFilterCount}）` : ""}
              </Btn>
            </div>
          }
        >
          {logFilterOpen && (
            <FilterPanel
              fields={[
                {
                  key: "kw",
                  label: "关键词",
                  placeholder: "操作人 / 对象 / 内容",
                },
                { key: "action", label: "操作类型", options: logKinds },
              ]}
              value={logDraft}
              onChange={(next) => LOGDRAFT({ ...logDraft, ...next })}
              onSearch={applyLogFilter}
              onReset={resetLogFilter}
            />
          )}
          <AuditTable logs={logShown} />
          <Pager
            page={logCur}
            count={logList.length}
            size={logSize}
            unit="条"
            onChange={LOGPAGE}
            onSize={(n) => {
              LOGSIZE(n);
              LOGPAGE(1);
            }}
          />
        </Panel>
      )}

      {(creating || editRole) && (
        <RoleDrawer
          role={editRole}
          onClose={() => {
            setCreating(false);
            setEditId("");
          }}
        />
      )}
      {memberRole && (
        <MemberForm
          role={memberRole}
          accounts={scopedAccounts}
          members={membersOfRole(memberRole)}
          onClose={() => setMemberId("")}
        />
      )}
      {(accountCreating || accountEdit) && (
        <AccountForm
          account={accountEdit}
          roles={roles}
          me={account!}
          onClose={() => {
            setAccountCreating(false);
            setAccountEditId("");
            // 账号存于 auth.ts（localStorage），保存后需触发列表重载
            BUMP((v) => v + 1);
          }}
        />
      )}
      {resetAccount && (
        <ResetPasswordForm
          account={resetAccount}
          onClose={() => setResetId("")}
        />
      )}
      {accountDel && (
        <Confirm
          title="删除账号"
          message={`删除后「${accountDel.name}」将无法登录，并从所属角色中解除关联。`}
          confirmText="确认删除"
          danger
          onClose={() => setAccountDelId("")}
          onConfirm={() => {
            removeAccount(accountDel.id);
            // 账号已删除，同步从各角色的 members 解除关联
            unlinkAccount(accountDel.id);
            BUMP((v) => v + 1);
            setAccountDelId("");
          }}
        />
      )}
      {delRole && (
        <Confirm
          title="删除角色"
          message={`删除后「${delRole.name}」的权限配置与成员关联将一并解除，成员回落为无角色状态。`}
          confirmText="确认删除"
          danger
          onClose={() => setDelId("")}
          onConfirm={() => {
            removeRole(delRole.id);
            setDelId("");
          }}
        />
      )}
    </>
  );
}
