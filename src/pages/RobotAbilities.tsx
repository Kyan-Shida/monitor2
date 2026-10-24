/**
 * @file RobotAbilities.tsx
 * @description 后台管理 › 机器人能力：能力参数由后台能力数据库同步进来，
 *   页面做「能力类型 → 能力参数」的浏览与检索，显示每个参数被巡检项引用的数量，
 *   并支持**参数级启停**（停用后不再作为巡检项「能力项」的可选项；新增 / 删除仍留在后台能力库，
 *   避免两处数据打架）。启停走二次确认，误点不会直接改状态。
 * @interaction 路由 `payloads`；巡检项的能力项候选取自这里（见 components/InspectItemDrawer.tsx）；
 *              引擎动作：SET_ABILITY_STATE
 */
import { useState } from "react";
import { CatalogTree } from "../components/CatalogTree";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { Badge, Empty, Panel, Switch, Table } from "../components/UI";
import { Pager } from "../components/Business";
import {
  DeleteConfirm,
  type DeleteConfirmState,
} from "../components/ListDelete";
import type { RobotAbilityParam } from "../data/types";

export function RobotAbilities() {
  const { s, act } = useStore();
  const kinds = s.robotAbilities || [];
  /** 左侧目录选中的能力类型（默认第一类） */
  const [cur, CUR] = useState(() => kinds[0]?.id || "");
  const kind = kinds.find((k) => k.id === cur) || kinds[0];
  const total = kinds.reduce((n, k) => n + k.params.length, 0);

  const [kw, KW] = useViewState("robotAbilities.kw", "");
  const [pn, PN] = useViewState("robotAbilities.page", 1);
  const [pageSize, SETPAGESIZE] = usePageSize("robotAbilities.size");
  /** 启停二次确认：待确认的能力参数 */
  const [confirm, setConfirm] = useState<DeleteConfirmState | null>(null);

  /** 巡检点上的全部巡检项（能力项挂在巡检项上） */
  const specs = (s.points || []).flatMap((p) => p.inspectItems || []);
  /** 被引用数：巡检项的能力项按参数名关联 */
  const usedBy = (name: string) =>
    specs.filter((it) => (it.abilities || []).some((a) => a.param === name))
      .length;

  const key = kw.trim();
  const params = (kind?.params || []).filter(
    (p) =>
      !key ||
      p.name.includes(key) ||
      (p.models || []).join(" / ").includes(key),
  );
  const pages = Math.max(1, Math.ceil(params.length / pageSize));
  const curPn = Math.min(Math.max(1, pn), pages);
  const pageRows = params.slice((curPn - 1) * pageSize, curPn * pageSize);

  /**
   * 打开启停二次确认
   * @param p 待切换的能力参数
   * @param used 已被多少个巡检项引用（停用时据此说明影响面）
   */
  const askToggle = (p: RobotAbilityParam, used: number) => {
    const off = p.state === "停用";
    setConfirm({
      title: off ? "启用能力参数" : "停用能力参数",
      okText: off ? "确认启用" : "确认停用",
      text: off ? (
        <>
          启用后「<b>{p.name}</b>」将重新出现在巡检项的「能力项」候选里。
        </>
      ) : (
        <>
          停用后「<b>{p.name}</b>」不再出现在巡检项的「能力项」候选里。
          {used
            ? `当前已有 ${used} 个巡检项引用它，这些巡检项照旧运行，不受影响。`
            : ""}
        </>
      ),
      run: () =>
        act({
          type: "SET_ABILITY_STATE",
          id: p.id,
          state: off ? "启用" : "停用",
        }),
    });
  };

  return (
    <div className="device-layout">
      {/* 左侧：能力类型目录（与设备台账同一套树组件） */}
      <CatalogTree
        ariaLabel="能力类型"
        rootLabel="能力类型"
        rootCount={kinds.length}
        rootSelectable={false}
        nodes={kinds.map((k) => ({
          key: k.id,
          label: k.name,
          count: k.params.length,
        }))}
        value={kind?.id ?? ""}
        onChange={(id) => {
          CUR(id);
          PN(1);
        }}
      />

      {/* 右侧：该类型下的能力参数（只读 + 启停） */}
      <div className="device-main">
        <Panel
          title={kind ? kind.name : "能力参数"}
          extra={
            <div className="actions">
              <input
                placeholder="搜索能力参数 / 机型"
                value={kw}
                onChange={(e) => {
                  KW(e.target.value);
                  PN(1);
                }}
              />
              <span className="muted">
                共 {params.length} 项 · 全部 {total} 项
              </span>
            </div>
          }
        >
          <Table
            heads={["能力参数", "适用机型", "被引用", "状态"]}
            rows={pageRows.map((p) => {
              const used = usedBy(p.name);
              return [
                <b>{p.name}</b>,
                <span className="muted">
                  {(p.models || []).join(" / ") || "不限机型"}
                </span>,
                used ? `${used} 个巡检项` : "—",
                // 状态 = 开关：点一下弹二次确认，确认后才改后台能力库的启停
                <Switch
                  checked={p.state !== "停用"}
                  label={`${p.name} 启停状态`}
                  onChange={() => askToggle(p, used)}
                />,
              ];
            })}
          />
          {!params.length ? (
            <Empty>没有匹配的能力参数。</Empty>
          ) : (
            <Pager
              page={curPn}
              count={params.length}
              size={pageSize}
              onChange={PN}
              onSize={(n) => {
                SETPAGESIZE(n);
                PN(1);
              }}
            />
          )}
        </Panel>
      </div>

      {/* 启停二次确认（与列表删除共用同一个确认弹窗，仅按钮文案不同） */}
      <DeleteConfirm state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
