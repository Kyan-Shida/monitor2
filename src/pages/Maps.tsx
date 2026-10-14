/**
 * @file Maps.tsx
 * @description 地图管理（第一个模块）：**只管理纯点云地图文件**
 *              ——MAP-02 口径：**采集一趟、产出两件；存储两份、上传两处；模块两个、ID 一绑**。
 *              本模块负责其中的 ① <b>点云地图文件</b>：
 *              ① 地图列表（筛选 / 搜索 / 分页，展示空间版本、区域、状态、底图与下发情况）
 *              ② 「＋ 导入地图」：上传纯点云地图（**不含任何定位ID与巡检点**）
 *              ③ 地图下发与机器同步（抽屉，见 components/MapDispatch.tsx）
 *              另一件产出（**巡检点标定文件**）归第二个模块：「巡检点管理」
 *              （见 components/PointCalibration.tsx），两者按**定位 ID**绑定。
 * @interaction 详情页由 App.tsx 按路由 `map-detail` 渲染；本文件仅负责列表与旧深链兼容分支
 */
import { useEffect, useState } from "react";
import { useStore } from "../data/store";
import { go, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Empty,
  Panel,
  Table,
  Field,
  Note,
  Modal,
} from "../components/UI";
import { Pager } from "../components/Business";
import { MapOnboarding } from "../components/MapOnboarding";
import { MapSurveyPanel } from "../components/MapSurveyPanel";
import { SAMPLE_MAP_FILE, SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { MAP_IMAGE_MAX_SIZE } from "../data/types";
import type { MapAsset, MapPacket } from "../data/types";
import { areaOptions } from "../data/deviceMaster";

/**
 * 旧深链保留分支（不在工具栏暴露，仅由 URL `?tab=` 进入）
 * @description 地图详情与机器人同步已迁到内置页 / 抽屉；
 *              此处仅保留历史深链与"后置能力"（上线工作台、建图与坐标、变化管理）不被断链
 */
const LEGACY_TABS: Record<string, string> = {
  workflow: "地图上线工作台（旧版）",
  survey: "建图与坐标（后置能力）",
  changes: "地图 / 点位变化管理",
};
/** 地图列表每页条数（原型固定值，与其余列表页一致的操作方式） */
const PAGE_SIZE = 8;

export function Maps({ tab = "list", id }: { tab?: string; id?: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  const [modal, M] = useState(""),
    [name, N] = useState("罐区补充采集地图"),
    /** 地图所属区域：既可从既有区域下拉选择，也允许用户输入新区域 */
    [region, RG] = useState("一期罐区"),
    [file, F] = useState(""),
    [cloud, C] = useState(""),
    [video, V] = useState(""),
    /** 底图（data URL） */
    [image, IMG] = useState(""),
    [importErr, ER] = useState(""),
    [note, NO] = useState(""),
    [kind, K] = useState("仅业务属性变更"),
    [pid, P] = useState("P002"),
    /** 导入地图前的二次确认开关 */
    [confirmImport, CI] = useState(false);
  /** 「新增地图」：选中的在线机器人 / 数据包回传进度 / 是否正在回传 */
  const [scanRid, SRID] = useState("");
  const [pct, SETPCT] = useState(0);
  const [scanning, SETSCANNING] = useState(false);
  /** 「构建地图」弹窗：待转成可标定 SLAM 地图的数据包 + 目标地图名称 / 区域 */
  const [packet, PKT] = useState<MapPacket | null>(null);
  const [pkName, PKN] = useState("");
  const [pkRegion, PKR] = useState("一期罐区");
  /** 卡片「⋯」：当前打开更多操作的地图 id */
  const [moreId, MORED] = useState("");
  /** 重命名弹窗：地图或数据包（kind 区分） */
  const [rename, RN] = useState<{
    kind: "map" | "packet";
    id: string;
    name: string;
  } | null>(null);
  /** 待删除的数据包 / 地图（二次确认） */
  const [delPacket, DELPKT] = useState<MapPacket | null>(null);
  const [delMap, DELM] = useState<MapAsset | null>(null);
  const [query, Q] = useViewState("maps.query", ""),
    [regionF, RF] = useViewState("maps.filter.region", "全部"),
    [stateF, SF] = useViewState("maps.filter.state", "全部"),
    [pager, PG] = useViewState("maps.page", 1);

  /** 在线机器人（非离线）：只有在线机器才能扫描回传数据包 */
  const onlineRobots = s.robots.filter((r) => r.state !== "离线");
  /** 正在回传的机器人名（弹窗文案用） */
  const scanRobotName =
    s.robots.find((r) => r.id === scanRid)?.name || "所选机器人";
  /** 地图数据包（还不是地图）：与地图卡片同区展示 */
  const packets = s.mapPackets || [];
  /** 「⋯」当前指向的对象：数据包或地图（两者 id 前缀不同，按存在性判断） */
  const morePacket = packets.find((k) => k.id === moreId);
  const moreMap = s.maps.find((x) => x.id === moreId);

  /** 数据包回传进度：模拟机器人扫描 + 回传（原型按固定节拍推进） */
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(
      () => SETPCT((p) => Math.min(100, p + 6 + Math.round(Math.random() * 10))),
      150,
    );
    return () => clearInterval(t);
  }, [scanning]);
  /** 回传完成：登记数据包并关闭弹窗（数据包还不是地图，需再「编辑」才落为地图） */
  useEffect(() => {
    if (!scanning || pct < 100) return;
    act({ type: "ADD_MAP_PACKET", robotId: scanRid, image: SAMPLE_MAP_IMAGE });
    SETSCANNING(false);
    SETPCT(0);
    SRID("");
    M("");
  }, [scanning, pct, scanRid, act]);

  /** 使用示例点云地图：一键填好底图与原始资料（**不含任何点位信息**） */
  function useSample() {
    ER("");
    if (!name.trim()) N("二期装置区示例地图");
    F(SAMPLE_MAP_FILE);
    IMG(SAMPLE_MAP_IMAGE);
    C("sample-multimodal.pcd");
    V("sample-video.mp4");
  }
  /** 二次确认通过后真正执行导入：把表单内容创建为一张「未发布」地图 */
  function doImport() {
    if (
      act({
        type: "IMPORT",
        name,
        region,
        file: file || "map-" + Date.now().toString(36) + ".map",
        image,
        cloud,
        video,
      })
    ) {
      CI(false);
      M("");
    }
  }
  /** 选择本地地图图片：读为底图（地图是纯点云，上传不携带任何点位 / 业务信息） */
  async function pickImage(file?: File) {
    ER("");
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return ER("请选择图片文件（JPG / PNG / WebP）。");
    if (file.size > MAP_IMAGE_MAX_SIZE)
      return ER(
        `图片过大（建议 ${MAP_IMAGE_MAX_SIZE / 1024 / 1024} MB 以内），请压缩后再上传。`,
      );
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error());
        r.readAsDataURL(file);
      });
      IMG(dataUrl);
      F(file.name);
      if (!name.trim()) N(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      ER("图片无法读取，请换一张有效图片后重试。");
    }
  }
  const legacy = LEGACY_TABS[tab];
  if (legacy)
    return (
      <>
        <div className="context-bar">
          <b>{legacy}</b>
          <span>该视图已不再作为地图管理主入口，仅为兼容历史深链保留</span>
          <Btn primary onClick={() => go("map-detail", m.id)}>
            打开地图详情
          </Btn>
        </div>
        {tab === "workflow" && <MapOnboarding key={m.id} mapId={m.id} />}
        {tab === "survey" && <MapSurveyPanel key={m.id} mapId={m.id} />}
        {tab === "changes" && (
          <Panel
            title="现场变化与影响处理"
            extra={
              <Btn primary onClick={() => M("change")}>
                登记变化
              </Btn>
            }
          >
            <Table
              heads={["编号 / 来源", "类型 / 证据", "状态", "影响", "操作"]}
              rows={s.changes
                .filter((c) => c.mapId === m.id)
                .map((c) => [
                  <>
                    {c.id}
                    <small>{c.source}</small>
                  </>,
                  <>
                    {c.type}
                    <small>{c.note}</small>
                  </>,
                  <Badge>{c.state}</Badge>,
                  c.pointId,
                  <div className="actions">
                    <Btn
                      disabled={c.state !== "待确认"}
                      onClick={() => act({ type: "CHANGE_CONFIRM", id: c.id })}
                    >
                      确认影响
                    </Btn>
                    <Btn
                      disabled={c.state !== "维护中"}
                      onClick={() => {
                        P(c.id);
                        F("");
                        M("revision");
                      }}
                    >
                      提交修订
                    </Btn>
                    <Btn
                      disabled={c.state !== "待同步"}
                      onClick={() => act({ type: "CHANGE_CLOSE", id: c.id })}
                    >
                      核对并关闭
                    </Btn>
                  </div>,
                ])}
            />
          </Panel>
        )}
        {changeModals()}
      </>
    );

  const regions = ["全部", ...new Set(s.maps.map((x) => x.region))];
  // 状态是派生值：未发布 = 当前版本还没下发给所有旧版本机器（新图从未下发也算）；已发布 = 已下发到位
  const states = ["全部", "未发布", "已发布"];
  const kw = query.trim();
  const list = s.maps.filter(
    (x) =>
      (!kw || (x.name + x.id + x.region).includes(kw)) &&
      (regionF === "全部" || x.region === regionF) &&
      (stateF === "全部" || x.state === stateF),
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <>
      <div className="toolbar">
        <div className="actions">
          <label className="inline-filter">
            <span>区域：</span>
            <select value={regionF} onChange={(e) => RF(e.target.value)}>
              {regions.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="inline-filter">
            <span>状态：</span>
            <select value={stateF} onChange={(e) => SF(e.target.value)}>
              {states.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <input
            placeholder="搜索地图名称 / 编号 / 区域"
            value={query}
            onChange={(e) => Q(e.target.value)}
          />
        </div>
        <div className="actions">
          <Btn
            onClick={() => {
              SRID("");
              SETPCT(0);
              SETSCANNING(false);
              M("scan");
            }}
          >
            ＋ 新增地图
          </Btn>
          <Btn
            primary
            onClick={() => {
              M("import");
              ER("");
              IMG("");
              F("");
            }}
          >
            ＋ 导入地图
          </Btn>
        </div>
      </div>
      <Panel
        title="地图列表"
        extra={<span>{packets.length + list.length} 张</span>}
      >
        {!packets.length && !rows.length ? (
          <Empty>
            还没有地图。点「＋ 新增地图」让在线机器人扫描回传数据包，或「＋ 导入地图」上传现成的纯点云地图。
          </Empty>
        ) : (
          <div className="map-cards">
            {/*
              地图数据包（还不是地图）：与地图同一卡片样式，名称用醒目色标出；
              「编辑」命名 / 定区域后才经 IMPORT 落为正式地图
            */}
            {packets.map((k) => (
              <article className="map-card packet" key={k.id}>
                <div className="map-card-img">
                  <img src={k.image || SAMPLE_MAP_IMAGE} alt={k.name} />
                </div>
                <div className="map-card-body">
                  <div className="map-card-name">
                    <b>{k.name}</b>
                    <small>
                      {k.source} · {k.at}
                    </small>
                  </div>
                  <div className="map-card-actions">
                    <Btn disabled title="数据包还不是地图，请先「构建地图」">
                      导航
                    </Btn>
                    <Btn
                      onClick={() => {
                        PKT(k);
                        PKN(k.name);
                        PKR(areaOptions(s)[0] || "一期罐区");
                      }}
                    >
                      编辑
                    </Btn>
                    <Btn onClick={() => MORED(k.id)}>⋯</Btn>
                  </div>
                </div>
              </article>
            ))}
            {rows.map((x) => (
              <article className="map-card" key={x.id}>
                <div className="map-card-img">
                  <img src={x.image || SAMPLE_MAP_IMAGE} alt={x.name} />
                </div>
                <div className="map-card-body">
                  <div className="map-card-name">
                    <b>{x.name}</b>
                    <small>
                      {x.region} · V{x.version} · {x.state}
                      {x.updatedAt ? ` · ${x.updatedAt}` : ""}
                    </small>
                  </div>
                  <div className="map-card-actions">
                    <Btn
                      title="下发到机器人（机器人据此导航）"
                      onClick={() => go("map-detail", x.id, "sync")}
                    >
                      导航
                    </Btn>
                    <Btn
                      title="进入标定工作台：打点、连线成路网"
                      onClick={() => go("map-calibrate", x.id)}
                    >
                      编辑
                    </Btn>
                    <Btn onClick={() => MORED(x.id)}>⋯</Btn>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <Pager page={cur} count={list.length} size={PAGE_SIZE} onChange={PG} />
      </Panel>

      {modal === "scan" && (
        <Modal
          title="新增地图"
          onClose={() => {
            SETSCANNING(false);
            SETPCT(0);
            M("");
          }}
        >
          <Field label="选择在线机器人（由它扫描并回传数据包）">
            <select
              value={scanRid}
              disabled={scanning}
              onChange={(e) => SRID(e.target.value)}
            >
              <option value="">请选择</option>
              {onlineRobots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}（{r.state}）
                </option>
              ))}
            </select>
          </Field>
          <Note>
            选择机器人后开始扫描：机器人按当前位置建图，地图数据包回传平台。
            <b>回传完成的数据包还不是地图</b>，需在列表里「编辑」命名 / 定区域后，才成为正式地图。
          </Note>
          {scanning && (
            <div style={{ marginTop: 12 }}>
              <p className="muted">
                正在接收「{scanRobotName}」的地图数据包… {pct}%
              </p>
              <progress value={pct} max={100} />
            </div>
          )}
          <div className="modal-actions">
            <Btn
              onClick={() => {
                SETSCANNING(false);
                SETPCT(0);
                M("");
              }}
            >
              取消
            </Btn>
            <Btn
              primary
              disabled={!scanRid || scanning}
              onClick={() => {
                SETPCT(0);
                SETSCANNING(true);
              }}
            >
              开始扫描
            </Btn>
          </div>
        </Modal>
      )}

      {/* 构建地图：把数据包转成**可标定的 SLAM 地图**（命名 / 定区域） */}
      {packet && (
        <Modal title="构建地图" onClose={() => PKT(null)}>
          <Note>
            数据包「{packet.name}」来自 {packet.robotId}（{packet.at}）。
            填写地图名称与所属区域后，它将作为一张<b>可标定的 SLAM 地图</b>进入列表——
            可进「编辑」在像素地图上打点、连线成路网，并按分辨率 / 原点做像素 → 全局坐标换算。
          </Note>
          <Field label="地图名称">
            <input
              value={pkName}
              placeholder="例如 二期装置区巡检地图"
              onChange={(e) => PKN(e.target.value)}
            />
          </Field>
          <Field label="所属区域">
            <select value={pkRegion} onChange={(e) => PKR(e.target.value)}>
              {areaOptions(s).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => PKT(null)}>取消</Btn>
            <Btn
              primary
              disabled={!pkName.trim()}
              onClick={() => {
                const ok = act({
                  type: "BUILD_MAP",
                  packetId: packet.id,
                  name: pkName.trim(),
                  region: pkRegion,
                });
                if (ok) PKT(null);
              }}
            >
              构建地图
            </Btn>
          </div>
        </Modal>
      )}

      {/*
        数据包卡片「⋯」：重命名 / 构建地图 / 删除
        @description 「构建地图」把数据包转成可标定的 SLAM 地图，之后进「编辑」打点 / 连线
      */}
      {morePacket && (
        <Modal
          title={`${morePacket.name} · 更多操作`}
          onClose={() => MORED("")}
        >
          <div className="actions">
            <Btn
              onClick={() => {
                const k = morePacket;
                MORED("");
                RN({ kind: "packet", id: k.id, name: k.name });
              }}
            >
              重命名
            </Btn>
            <Btn
              onClick={() => {
                const k = morePacket;
                MORED("");
                PKT(k);
                PKN(k.name);
                PKR(areaOptions(s)[0] || "一期罐区");
              }}
            >
              构建地图
            </Btn>
            <Btn
              danger
              onClick={() => {
                const k = morePacket;
                MORED("");
                DELPKT(k);
              }}
            >
              删除
            </Btn>
          </div>
        </Modal>
      )}

      {/* 地图卡片「⋯」：详情 / 重命名 / 删除地图 */}
      {moreMap && (
        <Modal title={`${moreMap.name} · 更多操作`} onClose={() => MORED("")}>
          <div className="actions">
            <Btn
              onClick={() => {
                const mid = moreMap.id;
                MORED("");
                go("map-detail", mid);
              }}
            >
              详情
            </Btn>
            <Btn
              onClick={() => {
                const x = moreMap;
                MORED("");
                RN({ kind: "map", id: x.id, name: x.name });
              }}
            >
              重命名
            </Btn>
            <Btn
              danger
              onClick={() => {
                const x = moreMap;
                MORED("");
                DELM(x);
              }}
            >
              删除地图
            </Btn>
          </div>
        </Modal>
      )}

      {/* 重命名：地图 / 数据包共用弹窗（按 kind 走对应动作） */}
      {rename && (
        <Modal
          title={rename.kind === "packet" ? "重命名数据包" : "重命名地图"}
          onClose={() => RN(null)}
        >
          <Field label="名称">
            <input
              value={rename.name}
              onChange={(e) => RN({ ...rename, name: e.target.value })}
            />
          </Field>
          <div className="modal-actions">
            <Btn onClick={() => RN(null)}>取消</Btn>
            <Btn
              primary
              disabled={!rename.name.trim()}
              onClick={() => {
                const ok = act(
                  rename.kind === "packet"
                    ? {
                        type: "RENAME_MAP_PACKET",
                        id: rename.id,
                        name: rename.name.trim(),
                      }
                    : {
                        type: "RENAME_MAP",
                        id: rename.id,
                        name: rename.name.trim(),
                      },
                );
                if (ok) RN(null);
              }}
            >
              保存
            </Btn>
          </div>
        </Modal>
      )}

      {/* 删除地图：二次确认（图下仍有巡检点时由引擎拦截） */}
      {delMap && (
        <Modal title={`删除地图「${delMap.name}」`} onClose={() => DELM(null)}>
          <p>
            删除后该地图及其标定数据、下发记录一并移除；图下仍有巡检点时不可删除。
          </p>
          <div className="modal-actions">
            <Btn onClick={() => DELM(null)}>取消</Btn>
            <Btn
              danger
              onClick={() => {
                const ok = act({ type: "DELETE_MAP", id: delMap.id });
                if (ok) DELM(null);
              }}
            >
              确认删除
            </Btn>
          </div>
        </Modal>
      )}

      {/* 删除数据包（尚未成为地图）：二次确认 */}
      {delPacket && (
        <Modal
          title={`删除数据包「${delPacket.name}」`}
          onClose={() => DELPKT(null)}
        >
          <p>该数据包尚未成为地图，删除后不可恢复。</p>
          <div className="modal-actions">
            <Btn onClick={() => DELPKT(null)}>取消</Btn>
            <Btn
              danger
              onClick={() => {
                act({ type: "DELETE_MAP_PACKET", id: delPacket.id });
                DELPKT(null);
              }}
            >
              确认删除
            </Btn>
          </div>
        </Modal>
      )}

      {modal === "import" && (
        <Modal
          title="导入地图"
          wide
          onClose={() => M("")}
        >
          <Field label="地图名称">
            <input
              value={name}
              placeholder="例如 二期装置区巡检地图"
              onChange={(e) => N(e.target.value)}
            />
          </Field>
          <Field label="区域">
            {/* 区域取自「后台管理」的区域主数据：只允许下拉选择，不允许手填 */}
            <select value={region} onChange={(e) => RG(e.target.value)}>
              {areaOptions(s).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="地图图片（底图）">
            <input
              type="file"
              accept="image/*"
              aria-label="上传地图图片"
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </Field>
          <div className="actions">
            <Btn primary onClick={useSample}>
              使用示例点云地图
            </Btn>
            {image && (
              <Btn
                onClick={() => {
                  IMG("");
                  F("");
                }}
              >
                清除
              </Btn>
            )}
          </div>
          {importErr && (
            <p role="alert" className="muted">
              {importErr}
            </p>
          )}
          {image && (
            <>
              <img
                className="map-import-preview"
                src={image}
                alt="地图底图预览"
              />
            </>
          )}
          <div className="modal-actions">
            <Btn onClick={() => M("")}>取消</Btn>
            <Btn
              primary
              disabled={!image || !name.trim()}
              onClick={() => CI(true)}
            >
              导入地图
            </Btn>
          </div>
        </Modal>
      )}

      {modal === "import" && confirmImport && (
        <Modal title="确认导入地图" onClose={() => CI(false)}>
          <Table
            heads={["项目", "内容"]}
            rows={[
              ["地图名称", name || "—"],
              ["区域", region || "—"],
              ["底图", image ? "已上传" : "未上传"],
            ]}
          />
          <div className="modal-actions">
            <Btn onClick={() => CI(false)}>返回修改</Btn>
            <Btn primary onClick={doImport}>
              确认导入
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );

  /** 变化管理（旧深链分支）用到的登记 / 修订 / 归档弹窗 */
  function changeModals() {
    const pts = s.points.filter((p) => p.mapId === m.id);
    return modal ? (
      <Modal
        title={modal === "change" ? "登记现场变化" : "修订地图版本"}
        wide
        onClose={() => M("")}
      >
        {modal === "change" ? (
          <>
            <Field label="变化类型">
              <select value={kind} onChange={(e) => K(e.target.value)}>
                <option>仅业务属性变更</option>
                <option>目标移动/新增/移除</option>
                <option>通道/结构变化</option>
              </select>
            </Field>
            <Field label="关联点位">
              <select value={pid} onChange={(e) => P(e.target.value)}>
                {pts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="变化说明与证据">
              <textarea value={note} onChange={(e) => NO(e.target.value)} />
            </Field>
            <Btn
              primary
              onClick={() => {
                if (
                  act({
                    type: "CHANGE_ADD",
                    mapId: m.id,
                    pointId: pid,
                    kind,
                    reason: note,
                  })
                )
                  M("");
              }}
            >
              登记
            </Btn>
          </>
        ) : (
          <>
            <Field label="外部修订地图文件">
              <input
                type="file"
                onChange={(e) => F(e.target.files?.[0]?.name || "")}
              />
            </Field>
            <Btn onClick={() => F("revised-map-demo.map")}>
              使用修订地图示例
            </Btn>
            <p>{file}</p>
            <Note>
              提交后重新发布试验版本、同步验证、正式发布，再核对区域机器人完成变化关闭。
            </Note>
            <Btn
              primary
              onClick={() => {
                if (act({ type: "CHANGE_REVISION", id: pid, file })) M("");
              }}
            >
              保存修订版本
            </Btn>
          </>
        )}
      </Modal>
    ) : null;
  }
}
