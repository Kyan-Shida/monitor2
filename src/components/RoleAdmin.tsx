/**
 * @file RoleAdmin.tsx
 * @description 角色 / 权限管理主页面：角色列表、权限配置、成员分配、角色模拟与审计日志
 * @interaction 由 pages/Supporting.tsx 在 page === "roles" 时渲染
 */
import { useState } from "react";
import { Badge, Btn, Confirm, Field, Modal, Panel, Switch, Table } from "./UI";
import { Pager } from "./Business";
import { FilterPanel } from "./FilterPanel";
import { Segmented } from "./Segmented";
import { RoleDrawer } from "./RoleDrawer";
import { useStore } from "../data/store";
import { roleOf } from "../data/roles";
import { go, usePageSize, useViewState } from "../data/navigation";
import {
  addAccount,
  assignMembers,
  removeAccount,
  removeRole,
  resetPassword,
  roleOfAccount,
  startImpersonation,
  updateAccount,
  useRoleAdmin,
  type Account,
  type AdminRole,
  type RoleAuditLog,
} from "../data/roleAdmin";

/** 成员分配：从账号库勾选 */
function MemberForm({
  role,
  accounts,
  onClose,
}: {
  role: AdminRole;
  accounts: Account[];
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(role.members);
  const [ask, ASK] = useState(false);
  const toggle = (id: string) =>
    setPicked(
      picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id],
    );

  return (
    <>
      <Modal
        title={`分配成员 · ${role.name}`}
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
                {u.login} · {u.dept}
              </small>
            </label>
          ))}
        </div>
      </Modal>
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

/** 新增 / 编辑登录账号 */
function AccountForm({
  account,
  roles,
  onClose,
}: {
  account?: Account;
  roles: AdminRole[];
  onClose: () => void;
}) {
  const current = account ? roleOfAccount(roles, account.id) : undefined;
  const [login, LOGIN] = useState(account?.login ?? "");
  const [password, PWD] = useState("");
  const [name, NAME] = useState(account?.name ?? "");
  const [dept, DEPT] = useState(account?.dept ?? "");
  const [status, STATUS] = useState<Account["status"]>(
    account?.status ?? "启用",
  );
  const [roleId, ROLEID] = useState(current?.id ?? roles[0]?.id ?? "");
  const [ask, ASK] = useState(false);
  const ready =
    !!login.trim() &&
    !!name.trim() &&
    !!roleId &&
    (!!account || !!password.trim());

  return (
    <>
      <Modal
        title={account ? "编辑账号" : "新增账号"}
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
          <input value={login} onChange={(e) => LOGIN(e.target.value)} />
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
              onChange={(on) => STATUS(on ? "启用" : "禁用")}
            />
            {status}
          </div>
        </Field>
      </Modal>
      {ask && (
        <Confirm
          title={account ? "保存账号信息" : "创建账号"}
          message={
            account
              ? `「${login}」的信息保存后立即生效。`
              : `将新建账号「${login}」并绑定角色。`
          }
          confirmText="保存"
          onClose={() => ASK(false)}
          onConfirm={() => {
            if (account)
              updateAccount(account.id, {
                login,
                name,
                dept,
                status,
                roleId,
              });
            else addAccount({ login, password, name, dept, roleId });
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
  account: Account;
  onClose: () => void;
}) {
  const [password, PWD] = useState("");
  const [ask, ASK] = useState(false);
  const ready = !!password.trim();

  return (
    <>
      <Modal
        title={`重置密码 · ${account.name}`}
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
      </Modal>
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
  const { s, setRole } = useStore();
  const { roles, accounts, logs, impersonation } = useRoleAdmin();
  const [tab, setTab] = useState<"roles" | "accounts" | "audit">("roles");
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

  const accountList = accounts.filter(
    (a) => !accountKw || (a.login + a.name + a.dept).includes(accountKw),
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
      <Segmented<"roles" | "accounts" | "audit">
        items={[
          { key: "roles", label: `角色列表（${roles.length}）` },
          { key: "accounts", label: `账号管理（${accounts.length}）` },
          { key: "audit", label: `审计日志（${logs.length}）` },
        ]}
        value={tab}
        onChange={setTab}
      />

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
                {r.isSuper && <Badge tone="blue">超级管理员</Badge>}
                {impersonation?.roleId === r.id && (
                  <Badge tone="red">模拟中</Badge>
                )}
              </>,
              <code>{r.code}</code>,
              <span className="muted">{r.description}</span>,
              `${r.members.length} 人`,
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
              "状态",
              "最近登录",
              "操作",
            ]}
            rows={accountShown.map((a) => [
              <code>{a.login}</code>,
              a.name,
              a.dept,
              roleOfAccount(roles, a.id)?.name || "—",
              <Badge tone={a.status === "启用" ? "green" : "amber"}>
                {a.status}
              </Badge>,
              a.lastLogin,
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
          accounts={accounts}
          onClose={() => setMemberId("")}
        />
      )}
      {(accountCreating || accountEdit) && (
        <AccountForm
          account={accountEdit}
          roles={roles}
          onClose={() => {
            setAccountCreating(false);
            setAccountEditId("");
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
