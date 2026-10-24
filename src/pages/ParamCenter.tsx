/**
 * @file ParamCenter.tsx
 * @description 系统设置 › 参数配置中心：
 *   Tab1 事件告警参数 —— 全局监控阈值（带版本）+ 调试校验（模拟事件，样式与生产配置隔离）；
 *   Tab2 字典与业务参数 —— 列表化管理，新增 / 编辑走右侧抽屉，数据字典用键值对录入。
 * @interaction 路由 `settings`；引擎 action：SAVE_SYSTEM_RULES / EXTRA_SAVE / EXTRA_TOGGLE
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../data/store";
import { usePageSize, useViewState } from "../data/navigation";
import {
  Badge,
  Btn,
  Confirm,
  Empty,
  Field,
  Modal,
  Panel,
  Switch,
  Table,
} from "../components/UI";
import { Pager } from "../components/Business";
import { Segmented } from "../components/Segmented";
import { systemRulesOf } from "../data/alarmRules";
import type { Extra } from "../data/types";

type Tab = "alarm" | "dict";

/** 时间戳：保存参数版本 / 记录历史用 */
function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ── Tab1：事件告警参数 ── */
function AlarmParams() {
  const { s, act } = useStore();
  const saved = systemRulesOf(s);
  const [draft, D] = useState(saved);
  /** 本次会话的版本记录：保存后追加，支持回溯到旧参数 */
  const [history, HIST] = useState<
    { version: number; time: string; rules: typeof saved }[]
  >([]);
  const [openHistory, OPENHISTORY] = useState(false);

  function save() {
    if (act({ type: "SAVE_SYSTEM_RULES", rules: draft }))
      HIST([
        { version: saved.version + 1, time: stamp(), rules: draft },
        ...history,
      ]);
  }

  return (
    <>
      <Panel title="全局监控阈值配置">
        <div className="form-grid">
          {(
            [
              ["heartbeatSeconds", "心跳超时 / 秒"],
              ["dispatchSeconds", "下发回执超时 / 秒"],
              ["lowBattery", "低电量告警 / %"],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                type="number"
                min={1}
                value={draft[k]}
                onChange={(e) => D({ ...draft, [k]: +e.target.value })}
              />
            </Field>
          ))}
        </div>
        <p className="muted">
          低电量告警阈值与各机型最低可派电量分别维护。这里配置事件提示，调度仍执行机器人能力约束。
        </p>
        <div className="actions">
          <Badge>第 {saved.version} 版</Badge>
          <Btn primary onClick={save}>
            保存参数版本
          </Btn>
          <button className="link" onClick={() => OPENHISTORY(true)}>
            历史版本回溯
          </button>
        </div>
      </Panel>

      {openHistory && (
        <Modal
          title="历史版本回溯"
          onClose={() => OPENHISTORY(false)}
          footer={<Btn onClick={() => OPENHISTORY(false)}>关闭</Btn>}
        >
          <Table
            heads={["版本", "保存时间", "操作"]}
            rows={
              history.length
                ? history.map((h) => [
                    `第 ${h.version} 版`,
                    h.time,
                    <Btn
                      key={h.version}
                      small
                      onClick={() => {
                        D(h.rules);
                        OPENHISTORY(false);
                      }}
                    >
                      回溯
                    </Btn>,
                  ])
                : [["—", "本次会话尚未保存过参数", ""]]
            }
          />
        </Modal>
      )}
    </>
  );
}

/* ── Tab2：字典与业务参数 ── */
/** 类型筛选：按钮组替代下拉，选中态一眼可见 */
const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "全部类型", label: "全部" },
  { key: "业务参数", label: "业务参数" },
  { key: "数据字典", label: "数据字典" },
];

/**
 * 编号自动生成：随类型取前缀，同前缀最大号 +1
 * @description 业务参数 PARxx、数据字典 DICxx；编号由系统给出，用户只读
 */
function nextCode(items: Extra[], type: Extra["type"]) {
  const prefix = type === "数据字典" ? "DIC" : "PAR";
  const max = items.reduce((m, x) => {
    if (!x.id.startsWith(prefix)) return m;
    const n = Number(x.id.slice(prefix.length));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return prefix + String(max + 1).padStart(2, "0");
}

function DictParams() {
  const { s, act } = useStore();
  const [kw, KW] = useViewState("param.dict.kw", "");
  const [type, TYPE] = useViewState("param.dict.type", "全部类型");
  const [page, PAGE] = useViewState("param.dict.page", 1);
  const [size, SIZE] = usePageSize("param.dict.size");
  /** 编辑中的参数 id（空串 = 新增，null = 抽屉关闭） */
  const [editId, E] = useState<string | null>(null);

  const all = s.extras.filter((x) => x.category === "settings");
  const rows = all.filter(
    (x) =>
      (type === "全部类型" || (x.type || "业务参数") === type) &&
      (!kw.trim() || (x.id + x.name + x.detail).includes(kw.trim())),
  );
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  const shown = rows.slice((cur - 1) * size, cur * size);

  return (
    <>
      <Panel
        title="参数清单"
        extra={
          <div className="actions">
            <input
              placeholder="搜索参数名称或编号..."
              value={kw}
              onChange={(e) => {
                KW(e.target.value);
                PAGE(1);
              }}
            />
            <Segmented
              items={TYPE_FILTERS}
              value={type}
              onChange={(k) => {
                TYPE(k);
                PAGE(1);
              }}
            />
            <Btn primary onClick={() => E("")}>
              ＋ 新增参数
            </Btn>
          </div>
        }
      >
        <p className="muted">
          参数保存后立即生效；停用后调度与校验不再引用。数据字典用于下拉选项，业务参数用于阈值与数量配置。
        </p>
        <Table
          heads={["编号", "名称", "类型", "配置值 / 业务范围", "状态", "操作"]}
          rows={shown.map((x) => [
            x.id,
            x.name,
            <Badge tone={x.type === "数据字典" ? "blue" : undefined}>
              {x.type || "业务参数"}
            </Badge>,
            x.detail,
            <Badge>{x.status}</Badge>,
            <div className="actions">
              <Btn small onClick={() => E(x.id)}>
                编辑
              </Btn>
              <Btn small onClick={() => act({ type: "EXTRA_TOGGLE", id: x.id })}>
                {x.status === "启用" ? "停用" : "启用"}
              </Btn>
            </div>,
          ])}
        />
        {!rows.length ? (
          <Empty>没有匹配的参数，试试更换关键词或类型。</Empty>
        ) : (
          <Pager
            page={cur}
            count={rows.length}
            size={size}
            unit="条"
            onChange={PAGE}
            onSize={(n) => {
              SIZE(n);
              PAGE(1);
            }}
          />
        )}
      </Panel>

      {editId !== null && (
        <ParamDrawer
          item={all.find((x) => x.id === editId)}
          existing={s.extras}
          onClose={() => E(null)}
        />
      )}
    </>
  );
}

/* ── 参数抽屉：新增 / 编辑 ── */
function ParamDrawer({
  item,
  existing,
  onClose,
}: {
  item?: Extra;
  /** 已有参数：新增时用来推算下一个编号 */
  existing: Extra[];
  onClose: () => void;
}) {
  const { act } = useStore();
  const [name, NAME] = useState(item?.name ?? "");
  const [type, TYPE] = useState<Extra["type"]>(item?.type ?? "业务参数");
  const [detail, DETAIL] = useState(
    item?.type === "数据字典" ? "" : (item?.detail ?? ""),
  );
  const [values, VALUES] = useState(
    item?.values?.length ? item.values : [{ key: "", value: "" }],
  );
  const [status, STATUS] = useState(item?.status ?? "启用");
  const [ask, ASK] = useState(false);

  /* 编号不让人填：编辑沿用原编号，新增按当前类型自动生成（切类型即跟着变） */
  const code = item?.id ?? nextCode(existing, type);

  const dict = type === "数据字典";
  const ready =
    !!code.trim() &&
    !!name.trim() &&
    (dict ? values.some((v) => v.key.trim()) : !!detail.trim());

  function submit() {
    if (!ready) return;
    const ok = act({
      type: "EXTRA_SAVE",
      id: code.trim(),
      name: name.trim(),
      paramType: type,
      category: "settings",
      status,
      detail,
      values: dict ? values : [],
    });
    if (ok) onClose();
  }

  /* 挂 body：应用根 .app 带 transform: scale(整页缩放)，fixed 子元素会以它为基准被二次缩放，
     抽屉就不贴右边、也不满屏高度了，所以和 Modal 一样走 portal */
  return createPortal(
    <div className="overlay drawer-overlay" onClick={onClose}>
      <aside
        className="drawer param-drawer"
        role="dialog"
        aria-label={item ? "编辑参数" : "新增参数"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h3>{item ? "编辑参数" : "新增参数"}</h3>
            {item && (
              <small>
                {item.id} · {item.name}
              </small>
            )}
          </div>
          <button aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="drawer-body">
          <Field label="编号">
            <input value={code} readOnly />
          </Field>
          <Field label="名称" required>
            <input value={name} onChange={(e) => NAME(e.target.value)} />
          </Field>
          <Field label="类型">
            <select
              value={type}
              onChange={(e) => TYPE(e.target.value as Extra["type"])}
            >
              <option>业务参数</option>
              <option>数据字典</option>
            </select>
          </Field>

          {dict ? (
            <Field label="配置值（键值对）">
              <div className="kv-editor">
                {values.map((v, i) => (
                  <div className="kv-row" key={i}>
                    <input
                      placeholder="存储值"
                      value={v.key}
                      onChange={(e) =>
                        VALUES(
                          values.map((x, j) =>
                            j === i ? { ...x, key: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <input
                      placeholder="显示名"
                      value={v.value}
                      onChange={(e) =>
                        VALUES(
                          values.map((x, j) =>
                            j === i ? { ...x, value: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Btn
                      small
                      danger
                      onClick={() => VALUES(values.filter((_, j) => j !== i))}
                    >
                      删除
                    </Btn>
                  </div>
                ))}
                <Btn
                  small
                  onClick={() => VALUES([...values, { key: "", value: "" }])}
                >
                  ＋ 增加键值对
                </Btn>
              </div>
            </Field>
          ) : (
            <Field label="配置值 / 业务范围" required>
              <input
                value={detail}
                placeholder="例如 2 次 / 15 分钟"
                onChange={(e) => DETAIL(e.target.value)}
              />
            </Field>
          )}

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
        </div>

        <div className="drawer-foot">
          <Btn onClick={onClose}>取消</Btn>
          <Btn primary disabled={!ready} onClick={() => ASK(true)}>
            保存
          </Btn>
        </div>
        {/* 二次确认：挂在 .drawer 内部，点遮罩只关确认框、不连带关抽屉 */}
        {ask && (
          <Confirm
            title={item ? "保存参数" : "新增参数"}
            message={
              item
                ? `「${code} · ${name}」保存后立即生效。`
                : `将新增参数「${code} · ${name}」并立即生效。`
            }
            confirmText="保存"
            onClose={() => ASK(false)}
            onConfirm={submit}
          />
        )}
      </aside>
    </div>,
    document.body,
  );
}

export function ParamCenter() {
  const [tab, TAB] = useViewState<Tab>("param.center.tab", "alarm");
  return (
    <>
      <Segmented<Tab>
        items={[
          { key: "alarm", label: "事件告警参数" },
          { key: "dict", label: "字典与业务参数" },
        ]}
        value={tab}
        onChange={TAB}
      />
      {tab === "alarm" ? <AlarmParams /> : <DictParams />}
    </>
  );
}
