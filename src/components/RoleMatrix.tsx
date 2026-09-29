/**
 * @file RoleMatrix.tsx
 * @description 角色权限矩阵：展示 12 个角色的默认落地页、数据范围、可见菜单、操作按钮与审批权限，并支持切换演示身份
 * @interaction 由 pages/Supporting.tsx 在 page === "roles" 时渲染
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { PERMS, canSee, roleOf, roles } from "../data/roles";
import { go, routeMeta, visiblePages } from "../data/navigation";
import { Badge, Btn, Note, Panel, Table } from "./UI";

/** 权限值 → 权限中文名，用于展示选中角色的按钮级权限 */
const permNames: Record<string, string> = Object.fromEntries(
  Object.entries(PERMS).map(([name, value]) => [value, name]),
);

export function RoleMatrix() {
  const { s, setRole } = useStore();
  const current = roleOf(s.roleId);
  const [picked, PICK] = useState(current.id);
  const role = roleOf(picked);
  /** 选中角色可见的页面（含被隐藏但白名单内的页面除外，只统计实际可见入口） */
  const visible = visiblePages.filter((p) => canSee(role, p.id, p.group));

  return (
    <>
      <Note>
        权限跟岗位走：角色只决定<b>可见菜单、数据范围、操作按钮、审批权限与默认视图</b>，
        不拆分页面。当前保留<b>管理员</b>与<b>非管理员</b>两类角色，
        差异集中在「系统设置」入口，以及配置 / 权限 / 审计 / 审批 / 口径类操作。
        当前演示身份为 <b>{current.name}</b>（{current.person} · {current.scope}）。
      </Note>

      <Panel title={`角色总览（${roles.length} 个角色）`}>
        <Table
          heads={["角色", "演示人员", "默认落地页", "数据范围", "可见中心数", "操作权限", "审批权限", "驾驶舱视图", "操作"]}
          rows={roles.map((r) => [
            <>
              {r.name}
              {r.id === current.id && <Badge>当前身份</Badge>}
            </>,
            r.person,
            routeMeta.find((x) => x.id === r.landing)?.name || r.landing,
            r.scope,
            `${r.centers.length} 个`,
            `${r.perms.length} 项`,
            r.approvals.length ? r.approvals.join(" / ") : "—",
            r.cockpitView,
            r.id === picked ? (
              <Badge>已选中</Badge>
            ) : (
              <Btn onClick={() => PICK(r.id)}>查看</Btn>
            ),
          ])}
        />
      </Panel>

      <Panel
        title={`权限详情 · ${role.name}`}
        extra={
          <span className="actions">
            <Btn
              primary
              onClick={() => {
                setRole(role.id);
                go(role.landing);
              }}
            >
              切换为该角色
            </Btn>
          </span>
        }
      >
        <Table
          heads={["权限要素", "内容"]}
          rows={[
            ["默认落地页", routeMeta.find((x) => x.id === role.landing)?.name || role.landing],
            ["数据范围", role.scope],
            ["可见一级中心", role.centers.join(" / ")],
            [
              "可见页面",
              role.pages === "*"
                ? `其可见中心下的全部页面（${visible.length} 个入口）`
                : visible.map((p) => p.name).join(" / "),
            ],
            [
              "操作权限（按钮级）",
              role.perms.length
                ? role.perms.map((p) => permNames[p] || p).join(" / ")
                : "—",
            ],
            ["审批权限", role.approvals.length ? role.approvals.join(" / ") : "—"],
            ["管理驾驶舱默认视图", role.cockpitView],
          ]}
        />
        <Note>
          非管理员不显示「系统设置」入口，且不具备配置编辑 / 配置发布、组织与权限编辑、
          审计查看、导出审批、口径管理等管理权限；管理员拥有全部权限点。
          按钮级权限通过 <b>&lt;Can perm="…"&gt;</b> 控制，切换到非管理员后可立即看到差异
          （例如调度指挥驾驶舱的远程接管 / 一键返航等操作入口会隐藏）。
        </Note>
      </Panel>
    </>
  );
}
