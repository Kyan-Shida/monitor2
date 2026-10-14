import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { parse, href, parentOf, menuIdOf, pages } from "./navigation";
import {
  ensureCalibration,
  targetsOf,
  calibrationOf,
  parsePointCalibration,
} from "./mapCalibration";

test("地图详情是内置页：路由可解析、返回与侧边栏高亮都回到地图列表", () => {
  // 不新增菜单项，只新增内置页（否则侧边栏会出现"地图详情"这一项）
  assert.ok(!pages.some((p) => p.id === "map-detail"));
  assert.equal(href("map-detail", "MAP-A03"), "#/robots/maps/detail/MAP-A03");
  const r = parse("#/robots/maps/detail/MAP-A03");
  assert.equal(r.page, "map-detail");
  assert.equal(r.id, "MAP-A03");
  // 详情页仍归属地图管理目录：返回上一级与菜单高亮都落在列表页
  assert.equal(parentOf("map-detail"), "maps");
  assert.equal(menuIdOf("map-detail"), "maps");
  // 深链带 tab：直达抽屉（地图下发）
  assert.equal(parse("#/robots/maps/detail/MAP-A03?tab=sync").tab, "sync");
  // 列表与详情不互相抢匹配（详情路径更长，优先匹配）
  assert.equal(parse("#/robots/maps/MAP-A03").page, "maps");
  assert.equal(parse("#/robots/maps").page, "maps");
});

test("标定数据区分来源：随标定文件带入的定位ID vs 平台新增；地图本身不含点位", () => {
  let s = seed();
  const mapId = "MAP-A03";
  const cal = ensureCalibration(s, mapId);
  assert.ok(cal.targets.length > 0);
  for (const t of cal.targets) {
    assert.equal(t.source, "地图导入");
    assert.ok(t.externalId, "带定位ID的标定点应带外部定位ID");
  }
  // 地图对象上不再承载任何点位（点位/定位ID 只在独立标定数据里）
  assert.equal("targets" in s.maps[0], false);
  const before = cal.targets.length;
  s = run(s, { type: "ADD_TARGET", mapId, x: 12, y: 34, kind: "仪表" });
  const added = targetsOf(s, mapId).at(-1)!;
  assert.equal(targetsOf(s, mapId).length, before + 1);
  assert.equal(added.source, "平台新增");
  assert.equal(added.externalId, undefined);
  assert.equal(added.state, "待确认");
  // 标定不改变地图空间版本与状态
  assert.equal(s.maps[0].state, "已发布");
});

test("轨迹采样点可按地图继续新增，序号按该地图递增", () => {
  let s = seed();
  const mapId = "MAP-A03";
  const before = (s.trackSamples || []).filter((x) => x.mapId === mapId);
  const maxSeq = Math.max(0, ...before.map((x) => x.seq));
  s = run(s, { type: "TRACK_RECORD", mapId, x: 40, y: 22, kind: "转弯点" });
  const after = (s.trackSamples || []).filter((x) => x.mapId === mapId);
  assert.equal(after.length, before.length + 1);
  const last = after.at(-1)!;
  assert.equal(last.seq, maxSeq + 1);
  assert.equal(last.kind, "转弯点");
});

test("地图下发支持多选设备批量下发；区域不匹配则整批不下发（不产生半截状态）", () => {
  let s = seed();
  const mapId = "MAP-A03";
  /** seed 里已有该图的历史下发记录；断言只看"本次新增" */
  const base = s.syncs.filter((x) => x.mapId === mapId).length;
  // 空选择：拒绝
  assert.throws(
    () => run(s, { type: "SYNC_BATCH", mapId, robotIds: [] }),
    /至少选择一台设备/,
  );
  // R03 属"装置区"，与地图区域不匹配 → 整批失败，且不留任何下发记录
  assert.throws(
    () => run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01", "R03"] }),
    /区域与地图不匹配/,
  );
  assert.equal(s.syncs.filter((x) => x.mapId === mapId).length, base);
  // 全部匹配：一次登记多条"传输中"
  s = run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01", "R02"] });
  const batch = s.syncs.filter(
    (x) => x.mapId === mapId && x.state === "传输中",
  );
  assert.equal(batch.length, 2);
  assert.deepEqual(
    batch.map((x) => x.robotId).sort(),
    ["R01", "R02"],
  );
  for (const x of batch) {
    assert.equal(x.mapVersion, s.maps[0].version);
  }
  assert.equal(s.syncs.filter((x) => x.mapId === mapId).length, base + 2);
});

test("标定与地图版本解耦：标定不回未发布；修订后下发给所有旧版本机器才回已发布", () => {
  let s = seed();
  const mapId = "MAP-A03";
  assert.equal(s.maps[0].state, "已发布");
  const v0 = s.maps[0].version;
  // 标定（新增带定位ID的点）只推进标定数据版本，地图保持已发布
  s = run(s, { type: "ADD_TARGET", mapId, x: 50, y: 50, kind: "仪表" });
  assert.equal(s.maps[0].state, "已发布");
  assert.equal(s.maps[0].version, v0);
  // 地图内容修订（重新采集 / 换版）才推进空间版本并回未发布
  s = run(s, {
    type: "CHANGE_ADD",
    mapId,
    pointId: s.points[0].id,
    kind: "通道/结构变化",
    reason: "新增管廊",
  });
  const cid = s.changes[0].id;
  s = run(s, { type: "CHANGE_CONFIRM", id: cid });
  s = run(s, { type: "CHANGE_REVISION", id: cid, file: "MAP-A03-m4.map" });
  assert.equal(s.maps[0].version, v0 + 1);
  assert.equal(s.maps[0].state, "未发布");
  // 只发给一部分旧版本机器（R01）→ 仍有旧版本机器没收到，保持未发布
  s = run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01"] });
  assert.equal(s.maps[0].state, "未发布");
  // 补齐剩下那台（R02）→ 当前版本已下发给所有旧版本机器 → 已发布
  s = run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R02"] });
  assert.equal(s.maps[0].state, "已发布");
  // 两次下发各登记一条"当前版本"记录（新增量，不数 seed 历史）
  assert.equal(
    s.syncs.filter((x) => x.mapId === mapId && x.mapVersion === v0 + 1).length,
    2,
  );
  // 原始资料缺失的地图定不了版，也就下发不了
  s = run(s, {
    type: "IMPORT",
    name: "缺资料地图",
    file: "bare.map",
    source: "机器人",
  });
  const bare = s.maps[0];
  s = run(s, { type: "ADD_TARGET", mapId: bare.id, x: 10, y: 10, kind: "仪表" });
  assert.throws(
    () => run(s, { type: "SYNC_BATCH", mapId: bare.id, robotIds: ["R01"] }),
    /原始点云/,
  );
});

test("地图状态派生口径：新图看「是否下发过」，更新图看「旧版本机器是否全部收到」", () => {
  let s = seed();
  /** 按 id 读当前地图状态（每次动作后重算，所以必须现读） */
  const stateOf = (id: string) => s.maps.find((m) => m.id === id)!.state;

  /* ── 新图：从未下发过 → 未发布；下发过 → 已发布 ── */
  s = run(s, {
    type: "IMPORT",
    name: "二期罐区新图",
    file: "B02.map",
    cloud: "B02.ply",
    video: "B02.mp4",
    region: "一期罐区",
  });
  const fresh = s.maps[0];
  assert.equal(fresh.version, 1);
  assert.equal(fresh.state, "未发布");
  // 内容备齐（有底图 + 一个已标注点位）也不算发布：从没有机器收到过它
  s = run(s, { type: "ADD_TARGET", mapId: fresh.id, x: 30, y: 40, kind: "仪表" });
  const target = targetsOf(s, fresh.id).at(-1)!;
  s = run(s, {
    type: "ANNOTATE",
    mapId: fresh.id,
    targetId: target.id,
    name: "新图一号点位",
    device: "DEV-V001",
    objects: ["出口压力表"],
    requirement: "可见光拍摄压力表读数",
  });
  assert.equal(stateOf(fresh.id), "未发布");
  // 只要下发过 → 已发布（登记下发记录即算，不要求对方已回激活回执）
  s = run(s, { type: "SYNC_BATCH", mapId: fresh.id, robotIds: ["R02"] });
  assert.equal(stateOf(fresh.id), "已发布");
  // 逐图派生：新图的状态不牵连老图（老图机器都还在当前版本）
  assert.equal(stateOf("MAP-A03"), "已发布");

  /* ── 更新图：还有机器停在旧版本且没收到当前版本 → 未发布；全部收到 → 已发布 ── */
  const v0 = s.maps.find((m) => m.id === "MAP-A03")!.version;
  const mapVer = (rid: string) => s.robots.find((r) => r.id === rid)!.mapVersion;
  assert.equal(mapVer("R01"), v0); // R01 已激活到当前版本
  assert.equal(mapVer("R02"), v0 - 1); // R02 停在旧版本
  // 内容变更推进空间版本 → 两台机器都成了"停在旧版本" → 未发布
  s = run(s, { type: "TRACK_RECORD", mapId: "MAP-A03", x: 40, y: 30, kind: "转弯点" });
  assert.equal(s.maps.find((m) => m.id === "MAP-A03")!.version, v0 + 1);
  assert.equal(stateOf("MAP-A03"), "未发布");
  // 只补一台（R01）→ 还有 R02 没收到当前版本 → 仍未发布
  s = run(s, { type: "SYNC_BATCH", mapId: "MAP-A03", robotIds: ["R01"] });
  assert.equal(stateOf("MAP-A03"), "未发布");
  // 补齐最后一台（R02）→ 当前版本已发到所有停在旧版本的机器 → 已发布
  s = run(s, { type: "SYNC_BATCH", mapId: "MAP-A03", robotIds: ["R02"] });
  assert.equal(stateOf("MAP-A03"), "已发布");
});

test("MAP-02：标定文件解析定位ID → 导入绑定 → 地图重传后按ID重绑 → 支持暂存", () => {
  // ① 解析：CSV 含表头与无效行
  const csv = [
    "定位ID,x,y,类型,水平角,俯仰角,变焦",
    "O901,37,34,可见光,10,-5,3",
    "O902,65,60,红外",
    "这一行没有坐标",
  ].join("\n");
  const parsed = parsePointCalibration(csv);
  assert.equal(parsed.points.length, 2);
  assert.equal(parsed.points[0].externalId, "O901");
  assert.deepEqual(parsed.points[0].ptz, { pan: 10, tilt: -5, zoom: 3 });
  // JSON 亦可解析
  const asJson = parsePointCalibration(
    JSON.stringify({ points: [{ id: "O903", x: 12, y: 22 }] }),
  );
  assert.equal(asJson.points[0].externalId, "O903");
  // 解析不出有效行时必须报错（不生成任何模拟数据）
  assert.ok(parsePointCalibration("hello\nworld").error);

  let s = seed();
  const mapId = "MAP-A03";
  // ② 导入并绑定：定位ID 作为来源绑定键写入独立标定数据；同时记录数据来源机器人
  s = run(s, {
    type: "IMPORT_POINT_CALIBRATION",
    mapId,
    file: "cal-A03.csv",
    robotId: "R01",
    points: parsed.points,
  });
  assert.equal(calibrationOf(s, mapId)!.robotId, "R01");
  assert.equal(targetsOf(s, mapId).find((t) => t.externalId === "O901")!.y, 34);
  // 定位ID 只是绑定键：导入标定文件不会自动生成平台巡检点
  const t901 = targetsOf(s, mapId).find((t) => t.externalId === "O901")!;
  assert.equal(s.points.filter((p) => p.targetId === t901.id).length, 0);
  // ③ 地图重传 / 换版后同一定位ID 坐标变化 → 覆盖坐标即完成重绑
  s = run(s, {
    type: "IMPORT_POINT_CALIBRATION",
    mapId,
    file: "cal-A03-v2.csv",
    points: [{ externalId: "O901", x: 40, y: 44 }],
  });
  const rebound = targetsOf(s, mapId).find((t) => t.externalId === "O901")!;
  assert.equal(rebound.x, 40);
  assert.equal(rebound.y, 44);
  // ④ 地图未就绪时先暂存，待地图就绪后再绑定（来源机器人随暂存一起保留）
  s = run(s, {
    type: "IMPORT_POINT_CALIBRATION",
    pending: true,
    file: "cal-B01.csv",
    robotId: "R02",
    points: parsed.points,
  });
  assert.equal(s.pendingCalibration!.points.length, 2);
  assert.equal(s.pendingCalibration!.robotId, "R02");
  s = run(s, { type: "BIND_PENDING_CALIBRATION", mapId });
  assert.equal(s.pendingCalibration, undefined);
  assert.equal(calibrationOf(s, mapId)!.robotId, "R02");
  assert.equal(targetsOf(s, mapId).find((t) => t.externalId === "O902")!.x, 65);
  // 也可放弃暂存
  s = run(s, {
    type: "IMPORT_POINT_CALIBRATION",
    pending: true,
    file: "cal-B02.csv",
    points: parsed.points,
  });
  s = run(s, { type: "DISCARD_PENDING_CALIBRATION" });
  assert.equal(s.pendingCalibration, undefined);
});

test("跨图切换点：地图拓扑可维护，两端不能是同一张地图", () => {
  let s = seed();
  // 演示数据只有一张碎片地图，第二张由导入产生——没有两张图谈不上"跨图"
  const two = run(s, {
    type: "IMPORT",
    name: "二期装置区补充地图",
    region: "二期装置区",
    file: "map-b01.map",
  });
  const [a, b] = two.maps;
  assert.ok(a && b, "跨图拓扑至少需要两张碎片地图");
  assert.deepEqual(s.mapSwitchPoints, undefined);

  const added = run(two, {
    type: "MAP_SWITCH_ADD",
    name: "罐区 → 装置区 连廊口",
    fromMapId: a.id,
    toMapId: b.id,
    fromX: 92,
    fromY: 10,
    toX: 8,
    toY: 10,
  });
  assert.equal(added.mapSwitchPoints!.length, 1);
  const sp = added.mapSwitchPoints![0];
  assert.equal(sp.state, "启用");
  assert.deepEqual(sp.from, { x: 92, y: 10 });
  assert.deepEqual(sp.to, { x: 8, y: 10 });
  assert.equal(added.logs[0].action, "MAP_SWITCH_ADD");

  // 启停切换与删除
  const off = run(added, { type: "MAP_SWITCH_STATE", id: sp.id });
  assert.equal(off.mapSwitchPoints![0].state, "停用");
  const gone = run(off, { type: "MAP_SWITCH_REMOVE", id: sp.id });
  assert.equal(gone.mapSwitchPoints!.length, 0);

  // 校验：两端同图无意义，地图不存在时不写脏数据
  assert.throws(() =>
    run(s, {
      type: "MAP_SWITCH_ADD",
      fromMapId: a.id,
      toMapId: a.id,
      fromX: 1,
      fromY: 1,
      toX: 1,
      toY: 1,
    }),
  );
  assert.throws(() =>
    run(s, {
      type: "MAP_SWITCH_ADD",
      fromMapId: a.id,
      toMapId: "MAP-404",
      fromX: 1,
      fromY: 1,
      toX: 1,
      toY: 1,
    }),
  );
  // 删除不存在的切换点必须报错，而不是静默成功
  assert.throws(() => run(added, { type: "MAP_SWITCH_REMOVE", id: "SW-404" }));
});

test("空间管理菜单已收起：页面与路由保留，深链可直达", () => {
  // 菜单项在 navigation 里被注释，故 pages 不含它；页面与路由仍保留（#/resources/space 可直达）
  assert.equal(pages.find((x) => x.id === "space"), undefined);
  assert.equal(href("space"), "#/resources/space");
  assert.equal(parse("#/resources/space").page, "space");
  // 不在菜单里时，高亮回落到自身（不会误高亮到别的叶子）
  assert.equal(menuIdOf("space"), "space");
});

test("新增地图：在线机器人扫描回传数据包（数据包还不是地图，需「编辑」后才落为地图）", () => {
  let s = seed();
  assert.equal(s.mapPackets?.length || 0, 0);
  const mapsBefore = s.maps.length;
  // 离线机器人不能扫描回传
  s.robots[0].state = "离线";
  assert.throws(
    () => run(s, { type: "ADD_MAP_PACKET", robotId: s.robots[0].id }),
    /已离线/,
  );
  s.robots[0].state = "空闲";
  // 在线机器人：登记数据包，未编辑前用占位名
  s = run(s, { type: "ADD_MAP_PACKET", robotId: "R01" });
  assert.equal(s.mapPackets!.length, 1);
  assert.equal(s.mapPackets![0].name, "地图信息-01-R01");
  assert.equal(s.mapPackets![0].robotId, "R01");
  // 数据包还不是地图：地图张数不变
  assert.equal(s.maps.length, mapsBefore);
  // 删除数据包（删除不存在的数据包必须报错）
  assert.throws(() => run(s, { type: "DELETE_MAP_PACKET", id: "PKT-404" }));
  s = run(s, { type: "DELETE_MAP_PACKET", id: s.mapPackets![0].id });
  assert.equal(s.mapPackets!.length, 0);
});

test("数据包 → 构建地图 → 重命名 / 删除；路网可保存", () => {
  let s = seed();
  s = run(s, { type: "ADD_MAP_PACKET", robotId: "R01" });
  const pktId = s.mapPackets![0].id;
  const mapsBefore = s.maps.length;
  // 重命名数据包
  s = run(s, { type: "RENAME_MAP_PACKET", id: pktId, name: "扫描-罐区-01" });
  assert.equal(s.mapPackets![0].name, "扫描-罐区-01");
  // 构建地图：数据包移除、地图 +1、状态为「未发布」
  s = run(s, {
    type: "BUILD_MAP",
    packetId: pktId,
    name: "罐区扫描地图",
    region: "一期罐区",
  });
  assert.equal(s.mapPackets!.length, 0);
  assert.equal(s.maps.length, mapsBefore + 1);
  const built = s.maps[s.maps.length - 1];
  assert.equal(built.state, "未发布");
  assert.equal(built.source, "机器人扫描构建");
  // 重命名地图
  s = run(s, { type: "RENAME_MAP", id: built.id, name: "罐区地图 V1" });
  assert.equal(s.maps.find((x) => x.id === built.id)!.name, "罐区地图 V1");
  // 保存路网：只落线 / 弧（点走定位点标定数据）
  s = run(s, {
    type: "SAVE_ROADNET",
    mapId: built.id,
    paths: [
      { id: "RL-1", name: "L_1", kind: "直线", pointIds: ["RP-1", "RP-2"] },
    ],
  });
  assert.equal(
    s.maps.find((x) => x.id === built.id)!.roadnet!.paths.length,
    1,
  );
  // 空路网拒绝保存
  assert.throws(
    () => run(s, { type: "SAVE_ROADNET", mapId: built.id, paths: [] }),
    /请先连线/,
  );
  // 图下有巡检点时不允许删除
  assert.throws(
    () => run(s, { type: "DELETE_MAP", id: s.points[0].mapId }),
    /仍有巡检点/,
  );
  // 新图下无巡检点：可删除
  s = run(s, { type: "DELETE_MAP", id: built.id });
  assert.equal(s.maps.find((x) => x.id === built.id), undefined);
});

test("标定工作台打的点就是定位点：与标定数据同源，可改点类型 / 楼层", () => {
  let s = seed();
  const mapId = s.maps[0].id;
  const before = targetsOf(s, mapId).length;
  // 打点：直接写入该图的定位点（与现场采集共用一份）
  s = run(s, { type: "ADD_TARGET", mapId, x: 42, y: 58, pointType: "充电点" });
  const list = targetsOf(s, mapId);
  assert.equal(list.length, before + 1);
  const added = list[list.length - 1];
  assert.equal(added.pointType, "充电点");
  // 改点参数：点类型 / 楼层 / 楼层连接点
  s = run(s, {
    type: "UPDATE_TARGET",
    mapId,
    targetId: added.id,
    pointType: "停靠点",
    floor: 2,
    floorLink: 3,
  });
  const up = targetsOf(s, mapId).find((t) => t.id === added.id)!;
  assert.equal(up.pointType, "停靠点");
  assert.equal(up.floor, 2);
  assert.equal(up.floorLink, 3);
});
