/**
 * @file EvidenceList.tsx
 * @description 现场记录证据清单：按巡检点**实际记录的采集方式**（可见光 / 红外 / 气体 / 声音）
 *              逐类列出证据（照片 / 红外热成像 / 气体浓度曲线 / 声纹音频），另加机器人巡检视频流；
 *              点「查看」在弹窗里预览对应证据（演示示意，视频留存对接工厂 NVR）
 * @interaction 由 src/pages/Results.tsx 的告警详情「现场记录」区块引用
 */
import { useState } from "react";
import type { CaptureKind, Point, State } from "../data/types";
import { captureKindsOfPoint } from "../data/deviceMaster";
import { Btn, Modal, Note, Table } from "./UI";
import { Video } from "./Video";

/** 采集方式 → 证据条目（类型名 / 采集通道 / 说明） */
const KIND_EVIDENCE: Record<
  CaptureKind,
  { type: string; channel: string; note: string; preview: Preview }
> = {
  可见光: {
    type: "照片",
    channel: "CAM-01 · 1080P",
    note: "检测目标关键帧截图（目标身份已关联）",
    preview: "video",
  },
  红外: {
    type: "红外热成像",
    channel: "IR-01 · 640×512",
    note: "热像图 + 逐点测温读数",
    preview: "thermal",
  },
  气体: {
    type: "气体浓度曲线",
    channel: "GAS-01 · 泵吸式",
    note: "采样时序曲线 + 峰值浓度",
    preview: "gas",
  },
  声音: {
    type: "声纹 / 音频",
    channel: "MIC-01 · 20Hz–20kHz",
    note: "现场录音 + 声纹频谱",
    preview: "audio",
  },
};

/** 证据预览分支：可出画面的走 Video，纯波形 / 频谱的用文字说明 */
type Preview = "video" | "thermal" | "gas" | "audio";

interface EvRow {
  type: string;
  channel: string;
  time: string;
  note: string;
  preview: Preview;
}

/**
 * 现场记录证据清单
 * @description 一个巡检点可能覆盖多种采集方式（可见光拍表盘 / 红外拍罐壁 / 气体采样 / 录音声纹），
 *              所以现场记录按该点实际配置的采集方式逐类列出，而不是固定只放一个视频；
 *              视频流常驻（机器人本体相机全程录像，与检测目标无关）
 * @param s 全局状态
 * @param p 告警关联的物理点位（无点位时只留视频流）
 * @param robotId 执行机器人（标注视频来源）
 * @param time 采集时间
 */
export function EvidenceList({
  s,
  p,
  robotId,
  time,
}: {
  s: State;
  p?: Point;
  robotId?: string;
  time: string;
}) {
  const [open, setOpen] = useState<EvRow | null>(null);
  // 点位覆盖的采集方式（至少可见光）→ 逐类一条证据；点位缺失时只保留视频流
  const kinds = p ? captureKindsOfPoint(s, p) : [];
  const rows: EvRow[] = [
    {
      type: "视频流",
      channel: `${robotId || "—"} · CAM-01`,
      time,
      note: "该点位巡检录像片段（留存对接工厂 NVR）",
      preview: "video",
    },
    ...kinds.map((k) => ({ ...KIND_EVIDENCE[k], time })),
  ];
  return (
    <>
      <Table
        heads={["证据类型", "采集通道", "采集时间", "说明", "操作"]}
        rows={rows.map((x) => [
          x.type,
          x.channel,
          x.time,
          x.note,
          <Btn small key={x.type} onClick={() => setOpen(x)}>
            查看
          </Btn>,
        ])}
      />
      <Note>
        证据为演示示意；巡检视频留存与回放对接工厂 NVR，平台仅提供回放入口与关键帧截图。
      </Note>
      {open && (
        <Modal
          title={`现场记录 · ${open.type}`}
          onClose={() => setOpen(null)}
        >
          {open.preview === "gas" || open.preview === "audio" ? (
            <Note>
              {open.preview === "gas"
                ? "气体采样时序曲线示意（泵吸式）：本次采样已留档，峰值浓度见告警读数。"
                : "声纹频谱示意：现场录音与频谱已留档（演示示意，非真实音频）。"}
            </Note>
          ) : (
            <Video
              live={false}
              label={open.preview === "thermal" ? `${p?.name || "检测目标"} 热像` : p?.name}
              robotId={robotId}
            />
          )}
          <p>
            证据类型 <b>{open.type}</b> · 采集通道 <b>{open.channel}</b>
          </p>
          <p>
            采集时间 <b>{open.time}</b>
          </p>
        </Modal>
      )}
    </>
  );
}
