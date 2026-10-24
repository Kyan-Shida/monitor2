/**
 * @file RoleDrawer.tsx
 * @description 角色侧边栏：基本信息 + 功能权限，新增与编辑共用
 * @interaction 由 components/RoleAdmin.tsx 在新增 / 编辑角色时打开
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Confirm, Field, Switch } from "./UI";
import {
  actionKey,
  addRole,
  menuTree,
  savePermissions,
  updateRole,
  type AdminRole,
  type MenuGroup,
  type MenuPage,
} from "../data/roleAdmin";

type Tab = "basic" | "menu";

/** 三态复选框：半选由 DOM 的 indeterminate 表达 */
function TriBox({
  checked,
  indeterminate = false,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={onChange}
    />
  );
}

export function RoleDrawer({
  role,
  onClose,
}: {
  role?: AdminRole;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("basic");
  const [name, setName] = useState(role?.name ?? "");
  const [code, setCode] = useState(role?.code ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [status, setStatus] = useState<AdminRole["status"]>(
    role?.status ?? "启用",
  );
  const [menus, setMenus] = useState(role?.menus ?? []);
  const [actions, setActions] = useState(role?.actions ?? []);
  /** 保存前再确认一次 */
  const [ask, ASK] = useState(false);

  /** 空白分组（页签已从侧边栏收起）不参与权限树 */
  const groups = menuTree.filter((g) => g.children.length > 0);
  const [activePage, setActivePage] = useState(
    groups[0]?.children[0]?.pageId ?? "",
  );

  const ready = !!name.trim() && !!code.trim();
  /** 编辑态只在权限确实变化时落库，避免每条都写一条审计 */
  const permsChanged =
    !!role &&
    JSON.stringify([menus, actions]) !==
      JSON.stringify([role.menus, role.actions]);

  function save() {
    if (!ready) return;
    const payload = { menus, actions };
    if (role) {
      updateRole(role.id, { name, code, description, status });
      if (permsChanged) savePermissions(role.id, payload);
    } else {
      const created = addRole({ name, code, description });
      savePermissions(created.id, payload);
    }
    onClose();
  }

  /** 一级中心：全选 / 全不选其下页面与按钮 */
  function toggleGroup(g: MenuGroup, next: boolean) {
    const pageIds = g.children.map((c) => c.pageId);
    const keys = g.children.flatMap((c) =>
      c.actions.map((a) => actionKey(c.pageId, a)),
    );
    setMenus(
      next
        ? [...new Set([...menus, ...pageIds])]
        : menus.filter((id) => !pageIds.includes(id)),
    );
    setActions(
      next
        ? [...new Set([...actions, ...keys])]
        : actions.filter((k) => !keys.includes(k)),
    );
  }

  /** 页面：勾选即授予该页全部按钮 */
  function togglePage(p: MenuPage) {
    const keys = p.actions.map((a) => actionKey(p.pageId, a));
    if (menus.includes(p.pageId)) {
      setMenus(menus.filter((id) => id !== p.pageId));
      setActions(actions.filter((k) => !keys.includes(k)));
    } else {
      setMenus([...menus, p.pageId]);
      setActions([...new Set([...actions, ...keys])]);
    }
  }

  function toggleAction(p: MenuPage, action: string) {
    const key = actionKey(p.pageId, action);
    setActions(
      actions.includes(key)
        ? actions.filter((k) => k !== key)
        : [...actions, key],
    );
  }

  const current = groups
    .flatMap((g) => g.children)
    .find((c) => c.pageId === activePage);

  /* 挂 body：应用根 .app 带 transform: scale(整页缩放)，fixed 子元素会以它为基准被二次缩放，
     抽屉就不贴右边、也不满屏高度了，所以和 Modal 一样走 portal */
  return createPortal(
    <div className="overlay drawer-overlay" onClick={onClose}>
      <aside
        className="drawer role-drawer"
        role="dialog"
        aria-label={role ? "编辑角色" : "新增角色"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h3>{role ? "编辑角色" : "新增角色"}</h3>
            {role && (
              <small>
                {role.name} · {role.code}
              </small>
            )}
          </div>
          <button aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="drawer-tabs">
          {(
            [
              ["basic", "基本信息"],
              ["menu", "功能权限"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === "basic" && (
            <div className="role-basic">
              <Field label="角色名称" required>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="角色编码" required>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="描述">
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Field label="状态">
                <div className="switch-row">
                  <Switch
                    checked={status === "启用"}
                    label="启用状态"
                    disabled={role?.isSuper}
                    onChange={(on) => setStatus(on ? "启用" : "禁用")}
                  />
                  {status}
                </div>
              </Field>
            </div>
          )}

          {tab === "menu" && (
            <div className="perm-menu">
              <div className="perm-tree">
                {groups.map((g) => {
                  const pageIds = g.children.map((c) => c.pageId);
                  const on = pageIds.filter((id) => menus.includes(id));
                  const all = pageIds.length > 0 && on.length === pageIds.length;
                  return (
                    <div className="perm-group" key={g.id}>
                      <label className="perm-group-head">
                        <TriBox
                          checked={all}
                          indeterminate={on.length > 0 && !all}
                          onChange={() => toggleGroup(g, !all)}
                        />
                        <b>{g.name}</b>
                        <span>
                          {on.length}/{pageIds.length}
                        </span>
                      </label>
                      <div className="perm-pages">
                        {g.children.map((c) => (
                          <div
                            key={c.pageId}
                            className={
                              "perm-page" +
                              (activePage === c.pageId ? " active" : "")
                            }
                            onClick={() => setActivePage(c.pageId)}
                          >
                            <input
                              type="checkbox"
                              checked={menus.includes(c.pageId)}
                              onChange={() => {
                                togglePage(c);
                                setActivePage(c.pageId);
                              }}
                            />
                            <span>{c.pageName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="perm-actions">
                {current ? (
                  <>
                    <div className="perm-actions-head">
                      <b>
                        {current.group} › {current.pageName}
                      </b>
                      <small>
                        {menus.includes(current.pageId)
                          ? `已授权 ${current.actions.filter((a) => actions.includes(actionKey(current.pageId, a))).length}/${current.actions.length}`
                          : "页面未授权"}
                      </small>
                    </div>
                    {current.actions.map((a) => (
                      <label className="perm-action" key={a}>
                        <input
                          type="checkbox"
                          disabled={!menus.includes(current.pageId)}
                          checked={actions.includes(
                            actionKey(current.pageId, a),
                          )}
                          onChange={() => toggleAction(current, a)}
                        />
                        {a}
                      </label>
                    ))}
                  </>
                ) : (
                  <p className="muted">选择左侧页面查看按钮权限</p>
                )}
              </div>
            </div>
          )}

        </div>

        <div className="drawer-foot">
          <Btn onClick={onClose}>取消</Btn>
          <Btn primary disabled={!ready} onClick={() => ASK(true)}>
            保存
          </Btn>
        </div>
        {/* 二次确认：挂在 .drawer 内部，点击遮罩只关确认框、不连带关掉抽屉 */}
        {ask && (
          <Confirm
            title={role ? "保存角色信息" : "创建角色"}
            message={
              role
                ? `「${name}」的信息与功能权限保存后立即生效。`
                : `将新建角色「${name}」并按勾选授予功能权限。`
            }
            confirmText="保存"
            onClose={() => ASK(false)}
            onConfirm={save}
          />
        )}
      </aside>
    </div>,
    document.body,
  );
}
