/**
 * @file AlarmItemTable.tsx
 * @description 告警项表格（巡检目标台账「3、告警规则」与「告警管理 › 告警设置」共用同一张表）：
 *              一行一条告警项，**每条都能选模板（一键带出判断类型 / 阈值 / 等级 / 声光报警）
 *              或直接手填**；第一条（主告警项）与台账的判定口径同源。
 * @interaction data/alarmSettings.ts（itemFromTemplate / newAlarmItem / ENV_RECOGNIZE_KINDS）、
 *              pages/BusinessTargets.tsx、pages/AlarmSettings.tsx
 */
import { useState } from "react";
import { Btn, Table } from "./UI";
import { ENV_RECOGNIZE_KINDS } from "../data/alarmSettings";
import {
  ALARM_ITEM_KINDS,
  ALARM_LEVELS,
  type AlarmItem,
  type AlarmItemKind,
} from "../data/types";
import type { AlarmTemplate } from "../data/alarmTemplates";

/** 下拉里代表「手动填写」的哨兵值（模板 id 形如 TPL-xx，不会撞） */
const MANUAL = "__manual__";

/**
 * 「+ 告警等级配置」入口
 * @description 点按钮 → 按钮旁浮出选择：**手动填写**（落一条空项自己填）/
 *              **从模板带出**（选模板即带出判断类型 / 阈值 / 单位 / 等级 / 声光报警）
 */
export function AlarmItemAddBar({
  templates,
  onAddManual,
  onAddFromTemplate,
}: {
  /** 可引用的告警模板（启用中的） */
  templates: AlarmTemplate[];
  /** 手动新增一条空告警项 */
  onAddManual: () => void;
  /** 按模板新增一条（内容字段已带出） */
  onAddFromTemplate: (templateId: string) => void;
}) {
  const [open, SETOPEN] = useState(false);
  return (
    <div className="actions alarm-add-bar">
      <Btn primary onClick={() => SETOPEN((v) => !v)}>
        + 告警等级配置
      </Btn>
      {open && (
        <select
          autoFocus
          aria-label="告警项新增方式"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            SETOPEN(false);
            if (v === MANUAL) onAddManual();
            else onAddFromTemplate(v);
          }}
        >
          <option value="">选择新增方式…</option>
          <option value={MANUAL}>手动填写</option>
          {templates.length > 0 && (
            <optgroup label="从模板带出">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </div>
  );
}

/** 表格列头（两个页面共用，避免两处写法漂移） */
const HEADS = [
  "告警模板",
  "告警分类",
  "环境识别分类",
  "告警等级",
  "判断类型",
  "判断值",
  "起始值",
  "结束值",
  "异常名称",
  "声光报警（秒）",
  "",
];

/**
 * 告警项表格
 * @param items 告警项清单
 * @param templates 可引用的告警模板（启用中的）
 * @param onChange 改某一行（按下标 patch 单个字段）
 * @param onPickTemplate 某一行改选模板（空串 = 改为手填）
 * @param onRemove 删除某一行
 */
export function AlarmItemTable({
  items,
  templates,
  onChange,
  onPickTemplate,
  onRemove,
}: {
  items: AlarmItem[];
  templates: AlarmTemplate[];
  onChange: (index: number, patch: Partial<AlarmItem>) => void;
  onPickTemplate: (index: number, templateId: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Table
      heads={HEADS}
      className="alarm-item-table"
      // 列多且含输入框：给足最小宽度，容器窄时横向滑动（否则「0.2」会被压成一个字符）
      minWidth={1180}
      rows={items.map((x, i) => {
        const range = x.judge === "数值范围";
        return [
          /* 告警模板：选中即带出内容字段；选「手填」= 清掉模板引用，已带出的值保留可继续改 */
          <select
            aria-label="告警模板"
            value={x.templateId || ""}
            onChange={(e) => onPickTemplate(i, e.target.value)}
          >
            <option value="">手填</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>,
          // 告警分类：告警项自己的两档枚举（普通预警 = 数值 / 状态类，环境预警 = 环境识别类）
          <select
            aria-label="告警分类"
            value={x.category}
            onChange={(e) =>
              onChange(i, { category: e.target.value as AlarmItemKind })
            }
          >
            {ALARM_ITEM_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>,
          <select
            aria-label="环境识别分类"
            value={x.envKind || ""}
            onChange={(e) => onChange(i, { envKind: e.target.value })}
          >
            <option value="">—</option>
            {ENV_RECOGNIZE_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>,
          <select
            aria-label="告警等级"
            value={x.level}
            onChange={(e) =>
              onChange(i, { level: e.target.value as AlarmItem["level"] })
            }
          >
            {ALARM_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>,
          <select
            aria-label="判断类型"
            value={x.judge}
            onChange={(e) => {
              const judge = e.target.value as AlarmItem["judge"];
              onChange(i, {
                judge,
                ...(judge === "数值范围"
                  ? { value: undefined }
                  : { from: undefined, to: undefined }),
              });
            }}
          >
            <option>数值范围</option>
            <option>期望状态</option>
          </select>,
          range ? (
            <span className="muted">—</span>
          ) : (
            <input
              aria-label="判断值"
              value={x.value || ""}
              placeholder="例如 开启"
              onChange={(e) => onChange(i, { value: e.target.value })}
            />
          ),
          range ? (
            <input
              aria-label="起始值"
              type="number"
              step="any"
              value={x.from ?? 0}
              onChange={(e) => onChange(i, { from: +e.target.value })}
            />
          ) : (
            <span className="muted">—</span>
          ),
          range ? (
            <input
              aria-label="结束值"
              type="number"
              step="any"
              value={x.to ?? 0}
              onChange={(e) => onChange(i, { to: +e.target.value })}
            />
          ) : (
            <span className="muted">—</span>
          ),
          <input
            aria-label="异常名称"
            value={x.abnormalName}
            placeholder="触发后的异常名"
            onChange={(e) => onChange(i, { abnormalName: e.target.value })}
          />,
          <input
            aria-label="声光报警（秒）"
            type="number"
            min={0}
            value={x.alarmSeconds}
            onChange={(e) =>
              onChange(i, { alarmSeconds: Math.max(0, +e.target.value) })
            }
          />,
          <Btn danger disabled={items.length <= 1} onClick={() => onRemove(i)}>
            删除
          </Btn>,
        ];
      })}
    />
  );
}
