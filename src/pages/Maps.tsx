/**
 * @file Maps.tsx
 * @description 地图管理（第一个模块）：**只管理纯点云地图文件**
 *              ——MAP-02 口径：**采集一趟、产出两件；存储两份、上传两处；模块两个、ID 一绑**。
 *              本模块负责其中的 ① <b>点云地图文件</b>：
 *              ① 地图列表（筛选 / 搜索 / 分页，展示空间版本、来源、状态、底图与下发情况）
 *              ② 「＋ 导入地图」：上传纯点云地图（**不含任何定位ID与巡检点**）
 *              ③ 地图下发与机器同步（抽屉，见 components/MapDispatch.tsx）
 *              另一件产出（**巡检点标定文件**）归第二个模块：「巡检点管理」
 *              （见 components/PointCalibration.tsx），两者按**定位 ID**绑定。
 * @interaction 详情页由 App.tsx 按路由 `map-detail` 渲染；本文件仅负责列表与旧深链兼容分支
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useStore } from "../data/store";
import { go, usePageSize, useViewState } from "../data/navigation";
import {
  Btn,
  Badge,
  Empty,
  Panel,
  Table,
  Field,
  Note,
  Modal,
  Drawer,
  Confirm,
  Switch,
} from "../components/UI";
import { Pager } from "../components/Business";
import { FilterPanel } from "../components/FilterPanel";
import { MapOnboarding } from "../components/MapOnboarding";
import { MapSurveyPanel } from "../components/MapSurveyPanel";
import { MapDispatch } from "../components/MapDispatch";
import { useListDelete } from "../components/ListDelete";
import { SAMPLE_MAP_FILE, SAMPLE_MAP_IMAGE } from "../data/sampleMap";
import { MAP_IMAGE_MAX_SIZE, mapNo, fmtDateTime } from "../data/types";
import { mapLifecycleOf, runningTasksOf } from "../data/robotMaps";
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

export function Maps({ tab = "list", id }: { tab?: string; id?: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === id) || s.maps[0];
  const [modal, M] = useState(""),
    [name, N] = useState("罐区补充采集地图"),
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
    /** 更新地图时的目标地图 id：非空表示「重新上传 SLAM 底图」模式（否则为新建地图） */
    const [importTarget, IT] = useState("");
  /** 「新增地图」：选中的在线机器人 / 数据包回传进度 / 是否正在回传 */
  const [scanRid, SRID] = useState("");
  const [pct, SETPCT] = useState(0);
  const [scanning, SETSCANNING] = useState(false);
  /** 「构建地图」弹窗：待转成可标定 SLAM 地图的数据包 + 目标地图名称 */
  const [packet, PKT] = useState<MapPacket | null>(null);
  const [pkName, PKN] = useState("");
  /** 卡片「⋯」：当前打开更多操作的地图 id */
  const [moreId, MORED] = useState("");
  /** 地图下发弹窗：打开时等于目标地图 id，空串则关闭 */
  const [dispatchMapId, SET_DISPATCH] = useState("");
  /** 重命名弹窗：地图或数据包（kind 区分） */
  const [rename, RN] = useState<{
    kind: "map" | "packet";
    id: string;
    name: string;
  } | null>(null);
  /** 重命名保存前的二次确认 */
  const [askRename, ASKRENAME] = useState(false);
  /** 绑定机器抽屉：非空表示打开，列出使用该地图的机器人及其版本 */
  const [bindMap, SETBIND] = useState<MapAsset | null>(null);
  /** 启停二次确认：待切换的地图（确认后才落库） */
  const [toggleMap, SETTOGGLE] = useState<MapAsset | null>(null);
  /** 启停原因：必填，随动作写入审计 */
  const [toggleReason, SETREASON] = useState("");
  /** 停用策略：图上还有在跑任务时才需要选 */
  const [toggleStrategy, SETSTRATEGY] = useState<"温和" | "立即">("温和");
  const [query, Q] = useViewState("maps.query", ""),
    [stateF, SF] = useViewState("maps.filter.state", "全部"),
    /** 启停状态筛选：启用 / 停用中 / 停用 */
    [lifeF, LF] = useViewState("maps.filter.life", "全部"),
    [pager, PG] = useViewState("maps.page", 1),
    /** 每页条数：全站统一走 usePageSize（默认 5 条） */
    [pageSize, SETPAGESIZE] = usePageSize("maps.size");
  /** 列表块筛选：展开态 + 草稿条件（点「查询」才写回生效值，与设备台账同款） */
  const [filterOpen, SETFILTEROPEN] = useState(false);
  const [draft, DRAFT] = useState({ state: stateF, life: lifeF, q: query });
  /** 已生效的筛选条件数（「筛选」按钮上的计数） */
  const filterCount =
    (stateF !== "全部" ? 1 : 0) +
    (lifeF !== "全部" ? 1 : 0) +
    (query.trim() ? 1 : 0);
  /** 展开筛选面板：用当前生效值填充草稿 */
  function toggleFilter() {
    if (!filterOpen) DRAFT({ state: stateF, life: lifeF, q: query });
    SETFILTEROPEN(!filterOpen);
  }
  /** 查询：草稿写回生效值并收起面板（列表回到第 1 页） */
  function applyFilter() {
    SF(draft.state);
    LF(draft.life);
    Q(draft.q);
    PG(1);
    SETFILTEROPEN(false);
  }
  /** 重置：清空草稿并立即生效 */
  function resetFilter() {
    DRAFT({ state: "全部", life: "全部", q: "" });
    SF("全部");
    LF("全部");
    Q("");
    PG(1);
  }

  /** 在线机器人（非离线）：只有在线机器才能扫描回传数据包 */
  const onlineRobots = s.robots.filter((r) => r.state !== "离线");
  /** 正在回传的机器人名（弹窗文案用） */
  const scanRobotName =
    s.robots.find((r) => r.id === scanRid)?.name || "所选机器人";
  /** 地图数据包（还不是地图）：与地图卡片同区展示 */
  const packets = s.mapPackets || [];
  /** 「⋯」下拉小菜单：点菜单外任意处即关闭（按钮区 / 菜单本体分别判断） */
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /**
   * 「⋯」下拉小菜单的定位
   * @description 固定定位（相对视口）：卡片区在 `.panel`（overflow:hidden）里，
   *              绝对定位的菜单会被面板底边裁掉，故按按钮的屏幕坐标算 top / left
   */
  const MENU_W = 132;
  const morePos = useRef<{ top: number; left: number }>({ top: 0, left: 0 });
  const [moreOpen, SETMOREOPEN] = useState(false);
  /** 开 / 关某张卡的菜单：开时记下按钮位置（右对齐按钮右边缘） */
  const toggleMore = (e: ReactMouseEvent<HTMLElement>, id: string) => {
    if (moreId === id) {
      MORED("");
      SETMOREOPEN(false);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    // 菜单约 180px 高：下方空间不够就向上弹
    // 边界同时看屏幕底和面板底（面板底还压着分页条，向下弹会盖住分页与翻页）
    const MENU_H = 180;
    const panel = e.currentTarget.closest(".panel");
    const limit = Math.min(
      window.innerHeight - 8,
      panel ? panel.getBoundingClientRect().bottom - 8 : Infinity,
    );
    let top = r.bottom + 6;
    if (top + MENU_H > limit) top = Math.max(8, r.top - MENU_H - 6);
    morePos.current = {
      top,
      left: Math.max(8, r.right - MENU_W),
    };
    MORED(id);
    SETMOREOPEN(true);
  };
  /** 关闭菜单（菜单项点完也走这里，避免残留监听） */
  const closeMore = () => {
    MORED("");
    SETMOREOPEN(false);
  };
  /** 小菜单用固定定位：相对视口摆放，不受面板 overflow 裁剪 */
  const menuStyle: CSSProperties = {
    top: morePos.current.top,
    left: morePos.current.left,
  };
  useEffect(() => {
    if (!moreOpen) return;
    const close = () => {
      MORED("");
      SETMOREOPEN(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // 菜单被 portal 到 body，不在触发按钮的 DOM 子树里：
      // 只有同时判断「按钮」和「菜单本体」，点菜单项才不会被这里提前关掉（否则点不动）
      if (moreRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close();
    };
    // 页面滚动 / 窗口尺寸变化后按钮位置已变，直接收起，避免菜单悬空
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [moreOpen]);

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
  /** 二次确认通过后真正执行导入 / 更新：带 importTarget 时为「重新上传 SLAM 底图」更新已有地图 */
  function doImport() {
    if (
      act({
        type: "IMPORT",
        name,
        file: file || "map-" + Date.now().toString(36) + ".map",
        image,
        cloud,
        video,
        ...(importTarget ? { id: importTarget } : {}),
      })
    ) {
      CI(false);
      M("");
      IT("");
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

  // 同步状态是派生值：未同步 = 当前版本还没下发给所有旧版本机器（新图从未下发也算）；已同步 = 已下发到位
  const states = ["全部", "未同步", "已同步"];
  /**
   * 停用影响面：绑定机器人数 / 依赖计划数 / 在跑任务数 / 该图覆盖点位数
   * @description 点位与地图无直接关系，只是没有机器人可达就走不到，所以这里算的是可达面
   */
  function impactOf(mapId: string) {
    const bound = s.robots.filter((r) => r.mapId === mapId).length;
    const plans = (s.plans || []).filter((p) =>
      (s.templates.find((t) => t.id === p.templateId)?.points || []).some(
        (pid) => s.points.find((x) => x.id === pid)?.mapId === mapId,
      ),
    ).length;
    const running = runningTasksOf(s, mapId).length;
    const points = s.points.filter((x) => x.mapId === mapId).length;
    return { bound, plans, running, points };
  }

  const kw = query.trim();
  const list = s.maps.filter(
    (x) =>
      (!kw || (x.name + x.id + mapNo(x.id) + x.source).includes(kw)) &&
      (stateF === "全部" || x.syncState === stateF) &&
      (lifeF === "全部" || mapLifecycleOf(x) === lifeF),
  );
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(pager || 1, pages);
  const rows = list.slice((cur - 1) * pageSize, cur * pageSize);
  /** 列表删除（通用组件）：工具栏「删除」→ 进入多选 → 批量删除地图与数据包（按类型分发） */
  const pageIds = [
    ...packets.map((k) => k.id),
    ...rows.map((x) => x.id),
  ];
  const del = useListDelete({
    onDelete: (ids) => {
      const mapIds = ids.filter((id) => s.maps.some((m) => m.id === id));
      const pktIds = ids.filter((id) => packets.some((p) => p.id === id));
      let ok = true;
      for (const id of mapIds)
        if (!act({ type: "DELETE_MAP", id })) ok = false;
      for (const id of pktIds)
        if (!act({ type: "DELETE_MAP_PACKET", id })) ok = false;
      return ok;
    },
    batch: {
      pageIds,
      title: (n) => `删除 ${n} 项`,
      nameOf: (id) =>
        s.maps.find((m) => m.id === id)?.name ||
        packets.find((p) => p.id === id)?.name ||
        id,
    },
  });
  const multi = del.sel !== null;

  return (
    <>
      {/* 列表块：计数 + 筛选 / 新增 / 导入 都收在面板头，条件展开在面板体内（与设备台账同款） */}
      <Panel
        className="panel-filters-wrap"
        title="地图列表"
        extra={
          <div className="actions">
            <span className="panel-count">
              {packets.length + list.length} 张
            </span>
            <Btn onClick={toggleFilter}>
              {filterOpen ? "收起筛选" : "筛选"}
              {filterCount ? `（${filterCount}）` : ""}
            </Btn>
            {/* 删除入口：点一次进入多选，勾选后回到此按钮批量删除（通用组件） */}
            {del.bar}
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
                IT("");
                ER("");
                IMG("");
                F("");
              }}
            >
              ＋ 导入已处理地图
            </Btn>
          </div>
        }
      >
        {filterOpen && (
          <FilterPanel
            fields={[
              { key: "state", label: "同步状态", options: states },
              {
                key: "life",
                label: "启停状态",
                options: ["全部", "启用", "停用中", "停用"],
              },
              {
                key: "q",
                label: "搜索地图",
                placeholder: "名称 / 编号 / 来源",
              },
            ]}
            value={draft}
            onChange={(next) => DRAFT({ ...draft, ...next })}
            onSearch={applyFilter}
            onReset={resetFilter}
          />
        )}
        {!packets.length && !rows.length ? (
          <Empty>
            还没有地图。点「＋ 新增地图」让在线机器人扫描回传数据包，或「＋ 导入地图」上传现成的纯点云地图。
          </Empty>
        ) : (
          <Table
            className={del.tableClass}
            heads={[
              ...(multi ? [del.head] : []),
              "地图编号",
              "地图名称",
              "来源",
              "版本",
              "同步状态",
              "更新时间",
              "启停",
              "绑定机器",
              "操作",
            ]}
            rows={[
              // 地图数据包（还不是地图）：同一张表里用「数据包」状态区分，编辑命名后才落为正式地图
              ...packets.map((k) => [
                // 多选：工具栏点「删除」后首列出现勾选框
                ...(multi ? [del.cell(k.id, k.name)] : []),
                // 数据包还不是正式地图：没有编号 / 启停 / 绑定机器，占位展示
                <span className="muted">—</span>,
                <b className="map-packet-name">{k.name}</b>,
                k.source,
                "—",
                <Badge>数据包</Badge>,
                fmtDateTime(k.at),
                <span className="muted">—</span>,
                <span className="muted">—</span>,
                <div className="actions">
                  <Btn
                    onClick={() => {
                      PKT(k);
                      PKN(k.name);
                    }}
                  >
                    编辑
                  </Btn>
                  <div
                    className="map-more"
                    ref={moreId === k.id ? moreRef : undefined}
                  >
                    <Btn onClick={(e) => toggleMore(e, k.id)}>⋯</Btn>
                    {/* 菜单按按钮屏幕坐标定位，portal 到 body：页面根节点带缩放 transform 时留在原位会偏位 */}
                    {moreId === k.id &&
                      createPortal(
                      <div
                        ref={menuRef}
                        className="map-more-menu"
                        role="menu"
                        style={menuStyle}
                      >
                        <button
                          role="menuitem"
                          className="map-more-item"
                          onClick={() => {
                            closeMore();
                            RN({ kind: "packet", id: k.id, name: k.name });
                          }}
                        >
                          <Pencil size={14} />
                          重命名
                        </button>
                        <button
                          role="menuitem"
                          className="map-more-item"
                          onClick={() => {
                            closeMore();
                            PKT(k);
                            PKN(k.name);
                          }}
                        >
                          <RefreshCw size={14} />
                          构建地图
                        </button>
                      </div>,
                      document.body,
                    )}
                  </div>
                </div>,
              ]),
              ...rows.map((x) => {
                const bound = s.robots.filter((r) => r.mapId === x.id);
                const outdated = bound.filter((r) => r.mapVersion < x.version);
                return [
                  // 多选：工具栏点「删除」后首列出现勾选框
                  ...(multi ? [del.cell(x.id, x.name)] : []),
                  // 地图编号：统一 MAP-XXX 格式，只读展示（与详情页「地图编号」同源）
                  mapNo(x.id),
                  <b>{x.name}</b>,
                  x.source || <span className="muted">—</span>,
                  `V${x.version}`,
                  <span className="actions">
                    <Badge>{x.syncState}</Badge>
                    {/* 启停三态：停用 / 停用中各给一个标签，避免只看开关猜当前处于哪种 */}
                    {mapLifecycleOf(x) !== "启用" && (
                      <Badge tone="amber">{mapLifecycleOf(x)}</Badge>
                    )}
                  </span>,
                  fmtDateTime(x.updatedAt),
                  // 启停开关：点一下先弹二次确认；停用中显示琥珀半程，再点即取消停用
                  <Switch
                    checked={mapLifecycleOf(x) !== "停用"}
                    stopping={mapLifecycleOf(x) === "停用中"}
                    label={`${x.name} 启停状态`}
                    onChange={() => {
                      SETREASON("");
                      SETSTRATEGY("温和");
                      SETTOGGLE(x);
                    }}
                  />,
                  // 绑定机器：可点击 → 抽屉查看使用该地图的机器人及其版本
                  bound.length ? (
                    <button
                      type="button"
                      className="link-btn"
                      title="查看使用该地图的机器人及其版本"
                      onClick={() => SETBIND(x)}
                    >
                      {bound.length} 台
                      {outdated.length ? ` · ⚠${outdated.length} 待更新` : ""}
                    </button>
                  ) : (
                    ""
                  ),
                  <div className="actions">
                    <Btn
                      small
                      title="把本地图下发给所选机器人设备，并同步到机器人端"
                      onClick={() => SET_DISPATCH(x.id)}
                    >
                      地图下发
                    </Btn>
                    {/* 详情从「⋯」里拉出来，直接作为操作列可见按钮 */}
                    <Btn small onClick={() => go("map-detail", x.id)}>
                      详情
                    </Btn>
                    <div
                      className="map-more"
                      ref={moreId === x.id ? moreRef : undefined}
                    >
                        <Btn small onClick={(e) => toggleMore(e, x.id)}>
                          ⋯
                        </Btn>
                        {moreId === x.id &&
                          createPortal(
                          <div
                            ref={menuRef}
                            className="map-more-menu"
                            role="menu"
                            style={menuStyle}
                          >
                            <button
                              role="menuitem"
                              className="map-more-item"
                              onClick={() => {
                                closeMore();
                                RN({ kind: "map", id: x.id, name: x.name });
                              }}
                            >
                              <Pencil size={14} />
                              重命名
                            </button>
                            <button
                              role="menuitem"
                              className="map-more-item"
                              onClick={() => {
                                closeMore();
                                N(x.name);
                                IMG("");
                                F("");
                                C("");
                                V("");
                                ER("");
                                CI(false);
                                IT(x.id);
                                M("import");
                              }}
                            >
                              <RefreshCw size={14} />
                              更新地图
                            </button>
                          </div>,
                          document.body,
                        )}
                    </div>
                  </div>,
                ];
              }),
            ]}
          />
        )}
        <Pager
          page={cur}
          count={list.length}
          size={pageSize}
          onChange={PG}
          onSize={(n) => {
            SETPAGESIZE(n);
            PG(1);
          }}
        />
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
            <b>回传完成的数据包还不是地图</b>，需在列表里「编辑」命名后，才成为正式地图。
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

      {/* 构建地图：把数据包转成**可标定的 SLAM 地图**（命名） */}
      {packet && (
        <Modal title="构建地图" onClose={() => PKT(null)}>
          <Note>
            数据包「{packet.name}」来自 {packet.robotId}（{fmtDateTime(packet.at)}）。
            填写地图名称后，它将作为一张<b>可标定的 SLAM 地图</b>进入列表，
            其路网与定位点由标定工作台维护（按分辨率 / 原点做像素 → 全局坐标换算）。
          </Note>
          <Field label="地图名称">
            <input
              value={pkName}
              placeholder="例如 二期装置区巡检地图"
              onChange={(e) => PKN(e.target.value)}
            />
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
                });
                if (ok) PKT(null);
              }}
            >
              构建地图
            </Btn>
          </div>
        </Modal>
      )}

      {/* 卡片「⋯」已改为就地下拉小菜单（见卡片渲染），不再用弹窗 */}
      {/* 地图下发弹窗：从卡片「地图下发」进入 */}
      {dispatchMapId &&
        (() => {
          const dm = s.maps.find((x) => x.id === dispatchMapId);
          if (!dm) return null;
          return (
            <Drawer
              title="地图下发"
              subtitle={`${dm.name} · ${mapNo(dm.id)} · 目标版本 V${dm.version}`}
              onClose={() => SET_DISPATCH("")}
            >
              <MapDispatch mapId={dm.id} />
            </Drawer>
          );
        })()}

      {/* 重命名：地图 / 数据包共用弹窗（按 kind 走对应动作） */}
      {rename && (
        <Modal
          title={rename.kind === "packet" ? "重命名数据包" : "重命名地图"}
          onClose={() => {
            ASKRENAME(false);
            RN(null);
          }}
        >
          <Field label="名称">
            <input
              value={rename.name}
              onChange={(e) => RN({ ...rename, name: e.target.value })}
            />
          </Field>
          <div className="modal-actions">
            <Btn
              onClick={() => {
                ASKRENAME(false);
                RN(null);
              }}
            >
              取消
            </Btn>
            <Btn
              primary
              disabled={!rename.name.trim()}
              onClick={() => ASKRENAME(true)}
            >
              保存
            </Btn>
          </div>
          {/* 重命名二次确认：名称是别的页面引用的展示名，改前问一次 */}
          {askRename && (
            <Confirm
              title="重命名地图"
              message={`名称将改为「${rename.name.trim()}」，保存后立即生效。`}
              confirmText="保存"
              onClose={() => ASKRENAME(false)}
              onConfirm={() => {
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
                ASKRENAME(false);
                if (ok) RN(null);
              }}
            />
          )}
        </Modal>
      )}

      {/* 批量删除地图 / 数据包：工具栏「删除」触发，二次确认（通用组件；图下仍有巡检点时引擎拦截） */}
      {del.modal}

      {/* 绑定机器：点列表「N 台」打开，列出使用该地图的机器人及其版本 */}
      {bindMap &&
        (() => {
          const bound = s.robots.filter((r) => r.mapId === bindMap.id);
          return (
            <Drawer
              title="绑定机器"
              subtitle={`${mapNo(bindMap.id)} · ${bindMap.name} · 平台 V${bindMap.version}`}
              onClose={() => SETBIND(null)}
            >
              <Note>
                以下机器人正使用该地图导航；机器人端版本低于平台版本时，
                需在「地图下发」里重新下发才能对齐。
              </Note>
              {bound.length ? (
                <Table
                  heads={[
                    "机器人编码",
                    "名称",
                    "当前状态",
                    "机器人端版本",
                    "平台版本",
                    "结果",
                  ]}
                  rows={bound.map((r) => [
                    r.id,
                    r.name,
                    <Badge>{r.state}</Badge>,
                    `V${r.mapVersion}`,
                    `V${bindMap.version}`,
                    r.mapVersion < bindMap.version ? (
                      <Badge>待更新</Badge>
                    ) : (
                      <span className="muted">已是最新</span>
                    ),
                  ])}
                />
              ) : (
                <Empty>暂无机器人使用该地图。</Empty>
              )}
            </Drawer>
          );
        })()}

      {/* 启停二次确认：停用前列影响面 + 在跑策略 + 必填原因，确认后才落库 */}
      {toggleMap &&
        (() => {
          const life = mapLifecycleOf(toggleMap);
          const off = life === "启用";
          const face = impactOf(toggleMap.id);
          return (
            <Confirm
              title={off ? "停用地图" : life === "停用中" ? "取消停用" : "启用地图"}
              confirmText={off ? "停用" : life === "停用中" ? "取消停用" : "启用"}
              danger={off}
              confirmDisabled={!toggleReason.trim()}
              onClose={() => SETTOGGLE(null)}
              onConfirm={() => {
                act({
                  type: "TOGGLE_MAP_STATUS",
                  id: toggleMap.id,
                  status: off ? "停用" : "启用",
                  strategy: off ? toggleStrategy : undefined,
                  reason: toggleReason.trim(),
                });
                SETTOGGLE(null);
              }}
            >
              {off ? (
                <>
                  <p>
                    停用「{toggleMap.name}」后，该地图不再允许用于导航 / 任务下发。
                  </p>
                  <dl className="kv">
                    <dt>绑定机器人</dt>
                    <dd>{face.bound} 台</dd>
                    <dt>依赖计划</dt>
                    <dd>{face.plans} 条</dd>
                    <dt>在跑任务</dt>
                    <dd>{face.running} 个</dd>
                    <dt>覆盖点位</dt>
                    <dd>{face.points} 个</dd>
                  </dl>
                  {face.running > 0 && (
                    <Field label="在跑任务处理">
                      <div className="radio-row">
                        <label>
                          <input
                            type="radio"
                            name="map-stop-strategy"
                            checked={toggleStrategy === "温和"}
                            onChange={() => SETSTRATEGY("温和")}
                          />
                          温和（跑完再停）
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="map-stop-strategy"
                            checked={toggleStrategy === "立即"}
                            onChange={() => SETSTRATEGY("立即")}
                          />
                          立即（中断任务）
                        </label>
                      </div>
                    </Field>
                  )}
                </>
              ) : life === "停用中" ? (
                <p>
                  取消停用后，「{toggleMap.name}」恢复接单与下发，图上任务照常执行。
                </p>
              ) : (
                <p>
                  启用「{toggleMap.name}」后，可再次用于导航与任务下发。
                  {face.plans > 0 &&
                    `依赖它的 ${face.plans} 条计划不会自动补跑。`}
                </p>
              )}
              <Field label={off ? "停用原因" : "操作原因"} required>
                <input
                  value={toggleReason}
                  placeholder="例如 地图待重建 / 现场环境变更"
                  onChange={(e) => SETREASON(e.target.value)}
                />
              </Field>
            </Confirm>
          );
        })()}

      {modal === "import" && (
        <Drawer
          title={importTarget ? `更新地图 · ${name}` : "导入地图"}
          subtitle={importTarget || undefined}
          onClose={() => {
            M("");
            IT("");
          }}
          footer={
            <>
              <Btn onClick={() => M("")}>取消</Btn>
              <Btn
                primary
                disabled={!image || !name.trim()}
                onClick={() => CI(true)}
              >
                {importTarget ? "更新地图" : "导入地图"}
              </Btn>
            </>
          }
        >
          <Field label="地图名称">
            <input
              value={name}
              placeholder="例如 二期装置区巡检地图"
              onChange={(e) => N(e.target.value)}
            />
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
        </Drawer>
      )}

      {modal === "import" && confirmImport && (
        <Modal
          title={importTarget ? "确认更新地图" : "确认导入地图"}
          onClose={() => CI(false)}
        >
          <Table
            heads={["项目", "内容"]}
            rows={[
              ...(importTarget ? [["目标地图", importTarget]] : []),
              ["地图名称", name || "—"],
              ["底图", image ? "已上传" : "未上传"],
            ]}
          />
          <div className="modal-actions">
            <Btn onClick={() => CI(false)}>返回修改</Btn>
            <Btn primary onClick={doImport}>
              {importTarget ? "确认更新" : "确认导入"}
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
      <>
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
              提交后重新发布试验版本、同步验证、正式发布，再核对已绑定该地图的机器人完成变化关闭。
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
    </>
  ) : null;
  }
}
