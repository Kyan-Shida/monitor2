/**
 * @file RobotAbilities.tsx
 * @description 后台管理 › 机器人能力：维护机器人**能干什么**。
 *   版式参考「设备台账」：**左侧能力类型目录，右侧展示该类型下的能力参数**（两级清单 —— 能力类型 → 能力参数）。
 *   巡检项的「能力项」其能力参数候选取自这里；停用后不再作为可选项。
 * @interaction 路由 `payloads`（原「机器人上装能力」页）；引擎动作：
 *              ADD_ROBOT_ABILITY_PARAM / SET_ROBOT_ABILITY_STATE / DELETE_ROBOT_ABILITY_PARAM
 */
import { useState } from "react";
import { Folder } from "lucide-react";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import { Badge, Btn, Empty, Field, Modal, Panel, Table } from "../components/UI";
import { Pager } from "../components/Business";
import { DeleteConfirm } from "../components/ListDelete";

/** 新增能力参数弹窗 */
type AddForm = { kindId: string; name: string };
/** 删除二次确认 */
type Confirm = { title: string; text: string; run: () => boolean };

export function RobotAbilities() {
  const { s, act } = useStore();
  const kinds = s.robotAbilities || [];
  /** 左侧目录选中的能力类型（默认第一类） */
  const [cur, CUR] = useState(() => kinds[0]?.id || "");
  const kind = kinds.find((k) => k.id === cur) || kinds[0];
  const [form, FORM] = useState<AddForm | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const total = kinds.reduce((n, k) => n + k.params.length, 0);
  /** 当前能力类型的参数列表 + 分页切片（切换类型时页码回第 1 页） */
  const params = kind?.params || [];
  const [pn, PN] = useViewState("robotAbilities.page", 1);
  // 每页条数：与全站列表口径一致（默认 5 条，可切 10 / 20）
  const [pageSize, SETPAGESIZE] = usePageSize("robotAbilities.size");
  const pages = Math.max(1, Math.ceil(params.length / pageSize));
  const curPn = Math.min(Math.max(1, pn), pages);
  const pageRows = params.slice((curPn - 1) * pageSize, curPn * pageSize);

  return (
    <>
      <div className="device-layout">
        {/* 左侧：能力类型目录（分组），点选即切换右侧参数表 */}
        <aside className="rab-side">
          <div className="rab-side-head">
            能力类型
            <span className="rab-count">
              {kinds.length}
            </span>
          </div>
          <div className="rab-side-list">
            {kinds.map((k) => (
              <button
                key={k.id}
                type="button"
                className={"rab-side-item" + (k.id === kind?.id ? " on" : "")}
                onClick={() => {
                  CUR(k.id);
                  PN(1);
                }}
              >
                <Folder size={14} />
                <span>{k.name}</span>
                <span className="rab-count">{k.params.length}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* 右侧：所选能力类型下的能力参数（具体项） */}
        <div className="device-main">
          <Panel
            title={kind ? kind.name : "能力参数"}
            extra={
              <div className="actions">
                <span className="muted">
                  共 {kind?.params.length || 0} 项 · 全部 {total} 项
                </span>
                <Btn
                  primary
                  disabled={!kind}
                  onClick={() => kind && FORM({ kindId: kind.id, name: "" })}
                >
                  ＋ 新增参数
                </Btn>
              </div>
            }
          >
            <Table
              heads={["能力参数", "适用机型", "状态", "操作"]}
              rows={pageRows.map((p) => [
                <b>{p.name}</b>,
                <span className="muted">
                  {(p.models || []).join(" / ") || "不限机型"}
                </span>,
                <Badge tone={p.state === "停用" ? "amber" : "green"}>
                  {p.state === "停用" ? "停用" : "启用"}
                </Badge>,
                <div className="actions">
                  <Btn
                    onClick={() =>
                      act({
                        type: "SET_ROBOT_ABILITY_STATE",
                        kindId: kind!.id,
                        paramId: p.id,
                        state: p.state === "停用" ? "启用" : "停用",
                      })
                    }
                  >
                    {p.state === "停用" ? "启用" : "停用"}
                  </Btn>
                  <Btn
                    danger
                    onClick={() =>
                      setConfirm({
                        title: "删除能力参数",
                        text: `确认删除「${kind!.name} › ${p.name}」？已引用该参数的巡检项不受影响，但后续不能再选。`,
                        run: () =>
                          act({
                            type: "DELETE_ROBOT_ABILITY_PARAM",
                            kindId: kind!.id,
                            paramId: p.id,
                          }),
                      })
                    }
                  >
                    删除
                  </Btn>
                </div>,
              ])}
            />
            {!params.length ? (
              <Empty>该能力类型下暂无参数。</Empty>
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
      </div>

      {/* 新增能力参数 */}
      {form && (
        <Modal title="新增能力参数" onClose={() => FORM(null)}>
          <Field label="能力类型">
            <select
              value={form.kindId}
              onChange={(e) => FORM({ ...form, kindId: e.target.value })}
            >
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="能力参数名称">
            <input
              value={form.name}
              placeholder="例如 红外识别"
              onChange={(e) => FORM({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => FORM(null)}>取消</Btn>
            <Btn
              primary
              disabled={!form.name.trim()}
              onClick={() => {
                const ok = act({
                  type: "ADD_ROBOT_ABILITY_PARAM",
                  kindId: form.kindId,
                  name: form.name,
                });
                if (ok) FORM(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 删除二次确认（通用组件） */}
      <DeleteConfirm state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
