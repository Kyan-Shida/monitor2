import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "./seed";
import { transition as run } from "./engine";
import { parse, href, parentOf, menuIdOf, pages } from "./navigation";
import {
  ensureCalibration,
  targetsOf,
  calibrationOf,
  calibrationVersionOf,
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
  const c0 = cal.version;
  s = run(s, { type: "ADD_TARGET", mapId, x: 12, y: 34, kind: "仪表" });
  const added = targetsOf(s, mapId).at(-1)!;
  assert.equal(targetsOf(s, mapId).length, before + 1);
  assert.equal(added.source, "平台新增");
  assert.equal(added.externalId, undefined);
  assert.equal(added.state, "待确认");
  // 标定只推进标定数据版本，地图空间版本与状态不受影响
  assert.equal(calibrationVersionOf(s, mapId), c0 + 1);
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
  assert.equal(s.syncs.filter((x) => x.mapId === mapId).length, 0);
  // 全部匹配：一次登记多条"传输中"
  s = run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01", "R02"] });
  const batch = s.syncs.filter((x) => x.mapId === mapId);
  assert.equal(batch.length, 2);
  assert.deepEqual(
    batch.map((x) => x.robotId).sort(),
    ["R01", "R02"],
  );
  for (const x of batch) {
    assert.equal(x.state, "传输中");
    assert.equal(x.mapVersion, s.maps[0].version);
    assert.equal(x.calibrationVersion, calibrationVersionOf(s, mapId));
  }
});

test("标定与地图版本解耦：标定不回草稿；地图修订才回草稿、下发自动定版", () => {
  let s = seed();
  const mapId = "MAP-A03";
  assert.equal(s.maps[0].state, "已发布");
  const v0 = s.maps[0].version;
  // 标定（新增带定位ID的点）只推进标定数据版本，地图保持已发布
  s = run(s, { type: "ADD_TARGET", mapId, x: 50, y: 50, kind: "仪表" });
  assert.equal(s.maps[0].state, "已发布");
  assert.equal(s.maps[0].version, v0);
  // 地图内容修订（重新采集 / 换版）才推进空间版本并回草稿
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
  assert.equal(s.maps[0].state, "草稿");
  // 下发即定版：不需要先点"发布"
  s = run(s, { type: "SYNC_BATCH", mapId, robotIds: ["R01"] });
  assert.equal(s.maps[0].state, "已发布");
  assert.ok(s.maps[0].history[0].includes("已发布"));
  assert.equal(s.syncs.filter((x) => x.mapId === mapId).length, 1);
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
  const c0 = calibrationVersionOf(s, mapId);
  // ② 导入并绑定：定位ID 作为来源绑定键写入独立标定数据；同时记录数据来源机器人
  s = run(s, {
    type: "IMPORT_POINT_CALIBRATION",
    mapId,
    file: "cal-A03.csv",
    robotId: "R01",
    points: parsed.points,
  });
  assert.equal(calibrationVersionOf(s, mapId), c0 + 1);
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
