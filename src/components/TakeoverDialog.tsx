import { useState } from "react";
import { X } from "lucide-react";
import { Badge, Btn, Note, Steps } from "./UI";
import { useStore } from "../data/store";
import { Can } from "./Can";
import { PERMS } from "../data/roles";
import { fmtDate } from "../data/types";
/**
 * @file TakeoverDialog.tsx
 * @description 驾驶舱「接管会话」浮层：就地走完 进行接管 → 暂停确认 → 人工遥控 → 退出 / 释放并恢复，
 *              不跳页（跳页会丢失当前选中设备与三栏上下文）
 * @interaction DispatchCockpit.tsx「当前设备」卡的接管胶囊按钮（既是入口也是状态显示）
 * @note 形态取舍：不是带遮罩的居中弹窗，而是从左栏按钮处向上浮出的窄浮层（z5）——
 *       接管期间用户仍要盯着视频看现场并直接用底部操控面板遥控，弹窗不该挡住画面；
 *       接管一生效即自动关闭，状态由按钮上的「接管 · 已接管」与灯点继续表达
 * @note 状态机口径与 pages/Execution.tsx 的 ControlConsole 完全一致（TAKEOVER / CONTROL_ACK / CONTROL_EXIT /
 *       CONTROL_RELEASE / START），不另造流程；区别只有两点：① 会话用宽口径查找（含「待暂停确认 / 退出核对中」，
 *       否则"确认机器人已暂停"的入口出不来）② 恢复任务留在本页，不跳执行监控
 */

/** 接管须知：均为系统真实约束（engine 的会话校验），不是泛泛提示 */
const NOTES = [
  "接管期间该机器人暂停自主任务，控制权独占且有时效；",
  "离线设备不可接管，低电量设备会被执行约束拦截；",
  "退出接管后机器人保持暂停，需确认现场安全再释放控制权；",
  "释放后若原地有暂停任务，需明确恢复，否则不会自动继续。",
];

export function TakeoverDialog({
  robotId,
  onClose,
  onOpenConsole,
  onResume,
}: {
  /** 接管对象 */
  robotId: string;
  onClose: () => void;
  /** 次级入口：需要地图 / 视频 / 遥控回执等完整能力时，再进「人工操作与遥控」页 */
  onOpenConsole: () => void;
  /** 释放控制权后原地有暂停任务时，明确恢复该任务（留在本页，不跳页） */
  onResume: (taskId: string) => void;
}) {
  const { s, act } = useStore();
  const r = s.robots.find((x) => x.id === robotId)!;
  /** 在用会话：宽口径（含待暂停确认 / 退出核对中），与 ControlConsole 一致 */
  const x = s.sessions.find(
    (y) => y.robotId === r.id && !["已释放", "已超时"].includes(y.state),
  );
  const t = s.tasks.find((y) => y.id === r.current);
  /** 释放前的人工核对勾选：引擎要求 checked 为真才允许释放 */
  const [checked, C] = useState(false);
  const current = x
    ? x.state === "待暂停确认"
      ? 1
      : x.state === "已接管"
        ? 2
        : 3
    : 0;
  // 有效期只到分钟：与全平台时间口径一致（YYYY-MM-DD HH:mm 取时刻部分）
  const until = fmtDate(new Date(x?.expires ?? 0)).slice(11);

  return (
    <div className="ds-peek">
      <header className="ds-peek-bar">
        <b>{r.name}</b>
        <Badge>{x ? x.state : "未接管"}</Badge>
        <span className="ds-peek-sub">
          {r.id} · {r.deviceType} · 电量 {r.battery}%
        </span>
        <button className="ds-peek-btn" onClick={onClose} title="关闭">
          <X size={13} />
        </button>
      </header>

      <div className="ds-peek-body">
        <Steps
          items={["进行接管", "暂停确认", "人工遥控", "释放并恢复"]}
          current={current}
        />

        {!x && (
          <Note>
            接管后该机器人会暂停自主任务，控制权独占且有时效；现场确认机器人已停止后即可开始人工遥控。
          </Note>
        )}
        {x?.state === "待暂停确认" && (
          <Note>
            接管申请已提交，机器人正在暂停当前任务。请现场确认机器人已停止，再点下方按钮取得控制权。
          </Note>
        )}
        {x?.state === "已接管" && (
          <Note>
            已接管（会话 {x.id}，至 {until} 到期）。在底部操控面板下发指令即可，浮层可关闭。
          </Note>
        )}
        {x?.state === "退出核对中" && (
          <Note>已退出人工接管，机器人保持暂停状态。确认现场安全后再释放控制权。</Note>
        )}
        {!x && t?.state === "暂停" && (
          <Note>
            该机器人上仍有暂停任务「{t.name}」，控制权释放后需明确恢复，否则不会自动继续。
          </Note>
        )}
        {x?.state === "退出核对中" && (
          <label className="takeover-check">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => C(e.target.checked)}
            />
            已确认现场安全，可释放控制权
          </label>
        )}

        {!x && (
          <>
            <h4 className="peek-title">接管须知</h4>
            <ul className="takeover-notes">
              {NOTES.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* 动作条随会话状态变化，始终保持"取消在左、主动作在右" */}
      <footer className="ds-peek-actions">
        <Btn onClick={onClose}>{x ? "关闭" : "取消"}</Btn>
        {!x && (
          <Can perm={PERMS.接管申请}>
            <Btn
              primary
              disabled={r.state === "离线"}
              onClick={() => act({ type: "TAKEOVER", robotId: r.id })}
            >
              {r.state === "离线" ? "设备离线，不可接管" : "进行接管"}
            </Btn>
          </Can>
        )}
        {x?.state === "待暂停确认" && (
          <Btn primary onClick={() => act({ type: "CONTROL_ACK", id: x.id })}>
            确认机器人已暂停
          </Btn>
        )}
        {x?.state === "已接管" && (
          <>
            <Btn onClick={onOpenConsole}>进入完整操控台 →</Btn>
            <Btn primary onClick={() => act({ type: "CONTROL_EXIT", id: x.id })}>
              退出人工接管
            </Btn>
          </>
        )}
        {x?.state === "退出核对中" && (
          <Btn
            primary
            disabled={!checked}
            onClick={() => act({ type: "CONTROL_RELEASE", id: x.id, checked })}
          >
            释放控制权
          </Btn>
        )}
        {!x && t?.state === "暂停" && (
          <Btn primary onClick={() => onResume(t.id)}>
            明确恢复任务
          </Btn>
        )}
      </footer>
    </div>
  );
}
