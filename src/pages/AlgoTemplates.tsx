/**
 * @file AlgoTemplates.tsx
 * @description 后台管理 › 算法模板管理：平台可用的 AI 能力（算法）清单的唯一维护入口。
 *              从「工厂基础数据」的算法 Tab 独立成页 —— 算法是**被引用**的主数据
 *              （巡检目标台账 / 快速新建台账 / 巡检点编辑按名称引用），
 *              与区域 / 设备 / 仪表这类"工厂已有数据"性质不同，故单独成菜单。
 * @interaction 路由 `algo-templates`（后台管理）；旧深链 `admin?tab=algo` 由 App 转发到本页；
 *              引擎动作 ADD_ALGO_CONFIG / UPDATE_ALGO_CONFIG / SET_ALGO_STATE / DELETE_ALGO_CONFIG；
 *              数据集合 State.algoConfigs（seed 提供示例算法）
 */
import { useState } from "react";
import { useStore } from "../data/store";
import { Badge, Btn, Empty, Field, Modal, Note, Panel, Table } from "../components/UI";
import { ALGO_LIBRARY, algoDeploys, algoKinds } from "../data/types";
import type { AlgoDeploy, AlgoKind } from "../data/types";

/** 算法表单：编码在编辑态不可改（是平台侧唯一标识） */
type AlgoForm = {
  mode: "add" | "edit";
  id: string;
  name: string;
  deploy: AlgoDeploy;
  adapt: AlgoKind[];
};
/** 删除二次确认 */
type Confirm = { title: string; text: string; run: () => boolean };

export function AlgoTemplates() {
  const { s, act } = useStore();
  const algos = s.algoConfigs || [];
  const [form, setForm] = useState<AlgoForm | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** 「从算法库启用」弹窗：厂区**不手写算法**，只勾选平台算法库里的条目 */
  const [libOpen, setLibOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  /** 算法库里尚未在厂区启用的条目 */
  const available = ALGO_LIBRARY.filter(
    (x) => !algos.some((a) => a.id === x.id),
  );
  /** 算法被多少条巡检目标台账按名称引用（停用后不再作为新台账可选项） */
  const refCountOf = (name: string) =>
    (s.businessTargets || []).filter((b) => b.algorithm === name).length;
  return (
    <>
      <Note>
        算法（AI 能力）是平台主数据：按名称被「巡检目标台账 › 算法 / AI 表达方式」引用，
        「关联台账」列展示当前引用该算法的目标台账条数；停用后不再作为新台账的可选项。
        算法本体在平台侧运行，此处只维护清单与适配口径。
      </Note>

      <Panel
        title="算法模板 · AI 能力清单"
        extra={
          <Btn
            primary
            disabled={!available.length}
            onClick={() => {
              setPicked([]);
              setLibOpen(true);
            }}
          >
            ＋ 新增算法
          </Btn>
        }
      >
        <Table
          heads={[
            "算法编码",
            "算法名称",
            "部署位置",
            "适配检测类型",
            "关联台账",
            "状态",
            "操作",
          ]}
          rows={algos.map((a) => [
            <b>{a.id}</b>,
            a.name,
            <Badge>{a.deploy}</Badge>,
            a.adapt.length ? (
              a.adapt.map((k) => <Badge key={k}>{k}</Badge>)
            ) : (
              <span className="muted">待配置</span>
            ),
            <b>{refCountOf(a.name)}</b>,
            <Badge tone={a.state === "停用" ? "amber" : "green"}>{a.state}</Badge>,
            <div className="actions">
              <Btn
                onClick={() =>
                  setForm({
                    mode: "edit",
                    id: a.id,
                    name: a.name,
                    deploy: a.deploy,
                    adapt: a.adapt,
                  })
                }
              >
                编辑
              </Btn>
              <Btn
                onClick={() =>
                  act({
                    type: "SET_ALGO_STATE",
                    id: a.id,
                    state: a.state === "启用" ? "停用" : "启用",
                  })
                }
              >
                {a.state === "启用" ? "停用" : "启用"}
              </Btn>
              <Btn
                danger
                onClick={() =>
                  setConfirm({
                    title: "删除算法",
                    text: `确认删除算法「${a.name}」？删除后引用它的巡检目标台账将失去算法口径。`,
                    run: () => act({ type: "DELETE_ALGO_CONFIG", id: a.id }),
                  })
                }
              >
                删除
              </Btn>
            </div>,
          ])}
        />
      </Panel>

      {/* 算法：新增 / 编辑 */}
      {form && (
        <Modal
          title={form.mode === "edit" ? "编辑算法" : "新增算法"}
          onClose={() => setForm(null)}
        >
          <Field label="算法编码">
            <input
              value={form.id}
              disabled={form.mode === "edit"}
              placeholder="例如 ALG-06"
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </Field>
          <Field label="算法名称">
            <input
              value={form.name}
              placeholder="例如 表计读数识别 v1.3"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="部署位置">
            <select
              value={form.deploy}
              onChange={(e) =>
                setForm({ ...form, deploy: e.target.value as AlgoDeploy })
              }
            >
              {algoDeploys.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="适配检测类型">
            <div className="actions">
              {algoKinds.map((k) => (
                <label key={k} className="inline-filter">
                  <input
                    type="checkbox"
                    checked={form.adapt.includes(k)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        adapt: e.target.checked
                          ? [...form.adapt, k]
                          : form.adapt.filter((x) => x !== k),
                      })
                    }
                  />
                  <span>{k}</span>
                </label>
              ))}
            </div>
          </Field>
          <Note>
            算法按名称被巡检目标台账引用；适配检测类型为空表示「待配置」。
          </Note>
          <div className="modal-actions">
            <Btn onClick={() => setForm(null)}>取消</Btn>
            <Btn
              primary
              disabled={!form.id.trim() || !form.name.trim()}
              onClick={() => {
                const ok = act({
                  type:
                    form.mode === "edit"
                      ? "UPDATE_ALGO_CONFIG"
                      : "ADD_ALGO_CONFIG",
                  id: form.id.trim(),
                  name: form.name.trim(),
                  deploy: form.deploy,
                  adapt: form.adapt,
                });
                if (ok) setForm(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 删除二次确认 */}
      {/* 从平台算法库勾选启用：列表展示的就是厂区勾选后的算法清单 */}
      {libOpen && (
        <Modal title="从算法库启用" wide onClose={() => setLibOpen(false)}>
          <Table
            heads={[
              <input
                type="checkbox"
                aria-label="全选可启用算法"
                checked={picked.length > 0 && picked.length === available.length}
                onChange={(e) =>
                  setPicked(e.target.checked ? available.map((x) => x.id) : [])
                }
              />,
              "算法名称",
              "部署位置",
              "检测类型",
            ]}
            rows={available.map((x) => [
              <input
                type="checkbox"
                aria-label={`选择 ${x.name}`}
                checked={picked.includes(x.id)}
                onChange={(e) =>
                  setPicked(
                    e.target.checked
                      ? [...picked, x.id]
                      : picked.filter((y) => y !== x.id),
                  )
                }
              />,
              <b>{x.name}</b>,
              <span className="muted">{x.deploy}</span>,
              <span className="muted">{x.adapt.join(" / ") || "待配置"}</span>,
            ])}
          />
          {!available.length && <Empty>算法库里的算法都已启用。</Empty>}
          <div className="modal-actions">
            <Btn onClick={() => setLibOpen(false)}>取消</Btn>
            <Btn
              primary
              disabled={!picked.length}
              onClick={() => {
                const ok = act({ type: "ENABLE_ALGOS", ids: picked });
                if (ok) setLibOpen(false);
              }}
            >
              确认启用{picked.length ? `（${picked.length}）` : ""}
            </Btn>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.text}</p>
          <div className="modal-actions">
            <Btn onClick={() => setConfirm(null)}>取消</Btn>
            <Btn
              primary
              onClick={() => {
                if (confirm.run() !== false) setConfirm(null);
              }}
            >
              确认删除
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
