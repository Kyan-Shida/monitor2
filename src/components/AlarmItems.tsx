/**
 * @file AlarmItems.tsx
 * @description 告警项清单（巡检目标台账「告警设置」与「告警管理 › 告警设置」共用）：
 *              **列表只做展示与删除，参数填写走抽屉**——字段就地编辑会挤成宽表格（旧版 minWidth=1500），
 *              改成只读行之后每格都是纯文本，宽度用 `fr` 分配，永远等于容器宽、不用左右拉动。
 *              「+ 告警等级配置」→ 抽屉填参数 → 保存；点列表任意一行 → 同一个抽屉编辑该条。
 *              走抽屉而非弹窗：填告警项时要对照上方列表已有条目（分类 / 等级 / 阈值口径）。
 *              第一条（主告警项）与台账的判定口径同源（judge / min / max / expected / level / 声光报警）。
 * @interaction data/alarmSettings.ts（upsertAlarmItem / checkAlarmItems）、
 *              pages/BusinessTargets.tsx、pages/AlarmSettings.tsx
 */
import { useState } from "react";
import { Btn, Drawer, Field } from "./UI";
import { ENV_RECOGNIZE_KINDS, checkAlarmItems } from "../data/alarmSettings";
import { Cascader, type CascaderOption } from "./Cascader";
import {
  ALARM_ITEM_KINDS,
  ALARM_LEVELS,
  type AlarmClass,
  type AlarmClassMain,
  type AlarmItem,
  type AlarmItemKind,
} from "../data/types";

/** 列表列头（与下面的取值顺序一一对应） */
const HEADS = [
  "告警分类",
  "预警类型",
  "环境识别分类",
  "告警等级",
  "判断规则",
  "异常名称",
  "触发逻辑",
  "声光报警（秒）",
  "操作",
];

/**
 * 一条告警项的列表展示值（与 HEADS 顺序对应）
 * @param simple 机器人预警：没有阈值判定与触发逻辑，这两列留「—」
 */
function cellsOf(x: AlarmItem, simple: boolean): string[] {
  return [
    x.alarmClass || "—",
    x.category,
    x.envKind || "—",
    x.level,
    simple
      ? "—"
      : x.judge === "数值范围"
        ? `${x.from ?? "—"} ~ ${x.to ?? "—"}`
        : x.value || "—",
    x.abnormalName || "—",
    simple
      ? "—"
      : x.triggerMode === "连续确认"
        ? `连续确认（${x.consecutive ?? 2} 次）`
        : "识别即触发",
    String(x.alarmSeconds ?? 0),
  ];
}

/**
 * 告警项参数弹窗（新增 / 编辑共用）
 * @param index null = 新增，其余为正在编辑的下标（只用于标题）
 * @param item 初始值
 * @param onSave 点保存时回传填好的整条告警项
 */
function AlarmItemDialog({
  index,
  item,
  alarmClasses,
  main,
  simple,
  onClose,
  onSave,
}: {
  index: number | null;
  item: AlarmItem;
  alarmClasses: AlarmClass[];
  /** 当前告警大类：级联只列该大类下的分类 */
  main: AlarmClassMain;
  /** 机器人预警：不配阈值判定与触发逻辑 */
  simple: boolean;
  onClose: () => void;
  onSave: (item: AlarmItem) => void;
}) {
  const [d, SETD] = useState<AlarmItem>(item);
  const range = d.judge === "数值范围";
  /** 机器人预警 / 识别故障都不是告警项判出来的：不配阈值判定与触发逻辑 */
  const hideRule = simple || d.alarmClass === "识别故障";
  /**
   * 告警分类级联：只列当前大类下的分类（业务预警的告警项不该选到机器人分类，反之亦然）
   * @description 叶子值 = 分类名，数据里只存分类名
   */
  const classOptions: CascaderOption[] = [main]
    .map((m) => ({
      value: `m:${m}`,
      label: m,
      children: alarmClasses
        .filter((c) => c.main === m)
        .map((c) => ({ value: c.name, label: c.name })),
    }))
    .filter((g) => g.children.length > 0);
  /** 复用台账保存时的同一套校验：非法值在抽屉里就拦住，不让它等到落库才报错 */
  const err = checkAlarmItems([d]);
  return (
    <Drawer
      title={index === null ? "添加告警项" : `编辑告警项 ${index + 1}`}
      subtitle={d.abnormalName || undefined}
      onClose={onClose}
      footer={
        <>
          {err && <span className="ai-err">{err}</span>}
          <Btn onClick={onClose}>取消</Btn>
          <Btn primary disabled={!!err} onClick={() => onSave(d)}>
            保存
          </Btn>
        </>
      }
    >
      <div className="form-grid ai-form">
        {/* 告警分类：级联选择（告警大类 › 分类），与巡检目标台账的选择器同款 */}
        <Field label="告警分类" required>
          <Cascader
            options={classOptions}
            value={d.alarmClass || ""}
            onChange={(v) => SETD({ ...d, alarmClass: v })}
            placeholder="请选择告警分类"
          />
        </Field>
        <Field label="预警类型" required>
          <select
            value={d.category}
            onChange={(e) =>
              SETD({ ...d, category: e.target.value as AlarmItemKind })
            }
          >
            {ALARM_ITEM_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="环境识别分类">
          <select
            value={d.envKind || ""}
            onChange={(e) => SETD({ ...d, envKind: e.target.value })}
          >
            <option value="">—</option>
            {ENV_RECOGNIZE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="告警等级" required>
          <select
            value={d.level}
            onChange={(e) =>
              SETD({ ...d, level: e.target.value as AlarmItem["level"] })
            }
          >
            {ALARM_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="异常名称" required>
          <input
            value={d.abnormalName}
            placeholder="触发后的异常名"
            onChange={(e) => SETD({ ...d, abnormalName: e.target.value })}
          />
        </Field>
        {/* 机器人预警 / 识别故障没有阈值判定与触发逻辑：这两项不出现（其余业务告警项保持原样） */}
        {!hideRule && (
          <>
            <Field label="判断规则" required>
              <span className="ai-rule">
                <select
                  aria-label="判断类型"
                  value={d.judge}
                  onChange={(e) => {
                    const judge = e.target.value as AlarmItem["judge"];
                    SETD({
                      ...d,
                      judge,
                      ...(judge === "数值范围"
                        ? { value: undefined }
                        : { from: undefined, to: undefined }),
                    });
                  }}
                >
                  <option>数值范围</option>
                  <option>期望状态</option>
                </select>
                {range ? (
                  <>
                    <input
                      aria-label="起始值"
                      type="number"
                      step="any"
                      value={d.from ?? 0}
                      onChange={(e) => SETD({ ...d, from: +e.target.value })}
                    />
                    <i>~</i>
                    <input
                      aria-label="结束值"
                      type="number"
                      step="any"
                      value={d.to ?? 0}
                      onChange={(e) => SETD({ ...d, to: +e.target.value })}
                    />
                  </>
                ) : (
                  <input
                    aria-label="判断值"
                    value={d.value || ""}
                    placeholder="例如 开启"
                    onChange={(e) => SETD({ ...d, value: e.target.value })}
                  />
                )}
              </span>
            </Field>
            <Field label="触发逻辑" required>
              <span className="ai-rule">
                <select
                  aria-label="触发逻辑"
                  value={d.triggerMode || "识别即触发"}
                  onChange={(e) =>
                    SETD({
                      ...d,
                      triggerMode: e.target.value as AlarmItem["triggerMode"],
                    })
                  }
                >
                  <option>识别即触发</option>
                  <option>连续确认</option>
                </select>
                {d.triggerMode === "连续确认" && (
                  <input
                    aria-label="连续确认次数"
                    type="number"
                    min={2}
                    placeholder="次数"
                    value={d.consecutive ?? 2}
                    onChange={(e) =>
                      SETD({ ...d, consecutive: Math.max(2, +e.target.value) })
                    }
                  />
                )}
              </span>
            </Field>
          </>
        )}
        <Field label="声光报警（秒）">
          <input
            type="number"
            min={0}
            value={d.alarmSeconds}
            onChange={(e) =>
              SETD({ ...d, alarmSeconds: Math.max(0, +e.target.value) })
            }
          />
        </Field>
      </div>
    </Drawer>
  );
}

/**
 * 告警项清单 + 参数弹窗
 * @param items 告警项清单
 * @param alarmClasses 告警分类候选（「告警管理 › 告警类别」里启用中的分类名）
 * @param makeItem 新建一条的默认值（分类按目标类型带出、异常名称按台账名预填）
 * @param onSave 保存（index = null 表示新增，其余为替换）
 * @param onRemove 删除某一条
 */
export function AlarmItems({
  items,
  alarmClasses,
  makeItem,
  onSave,
  onRemove,
  main = "业务预警",
}: {
  items: AlarmItem[];
  alarmClasses: AlarmClass[];
  makeItem: () => AlarmItem;
  onSave: (index: number | null, item: AlarmItem) => void;
  onRemove: (index: number) => void;
  /** 告警大类：机器人预警不配阈值判定与触发逻辑 */
  main?: AlarmClassMain;
}) {
  const simple = main === "机器人预警";
  /** 正在编辑的告警项：index = null 表示新增 */
  const [draft, SETDRAFT] = useState<{
    index: number | null;
    item: AlarmItem;
  } | null>(null);
  /**
   * 告警分类候选：已引用的分类被停用后仍要能回显，
   * 否则打开弹窗下拉对不上值、一保存就把原分类冲掉
   */
  const classes: AlarmClass[] = (() => {
    const list = [...alarmClasses];
    items.forEach((x) => {
      if (x.alarmClass && !list.some((c) => c.name === x.alarmClass))
        // 已引用但已停用 / 删除的分类也要能回显，大类未知时按业务预警兜底
        list.push({
          id: "",
          name: x.alarmClass,
          main: "业务预警",
          enabled: true,
        });
    });
    return list;
  })();
  /** 打开新增弹窗：用台账派生的默认值打底 */
  function openNew() {
    SETDRAFT({ index: null, item: makeItem() });
  }
  return (
    <>
      <div className="task-toolbar">
        <Btn primary onClick={openNew}>
          + 告警等级配置
        </Btn>
        <span className="muted">共 {items.length} 条告警项</span>
      </div>
      <div className="alarm-items">
        <div className="ai-row ai-head">
          {HEADS.map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
        {items.map((x, i) => (
          <div
            className="ai-row"
            key={x.id}
            onClick={() => SETDRAFT({ index: i, item: { ...x } })}
          >
            {cellsOf(x, simple || x.alarmClass === "识别故障").map((c, k) => (
              <span key={k} title={c}>
                {c}
              </span>
            ))}
            {/* 删除只作用自己：挡掉冒泡，免得顺手打开了编辑弹窗 */}
            <span onClick={(e) => e.stopPropagation()}>
              {/* 告警项由用户手动维护：允许删到空表（空表时保存会被拦住，提示去新增） */}
              <Btn danger onClick={() => onRemove(i)}>
                删除
              </Btn>
            </span>
          </div>
        ))}
        {!items.length && (
          <p className="ai-empty">还没有告警项，点「+ 告警等级配置」新增一条</p>
        )}
      </div>
      {draft && (
        <AlarmItemDialog
          index={draft.index}
          item={draft.item}
          alarmClasses={classes}
          main={main}
          simple={simple}
          onClose={() => SETDRAFT(null)}
          onSave={(it) => {
            onSave(draft.index, it);
            SETDRAFT(null);
          }}
        />
      )}
    </>
  );
}
