import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coordText,
  distanceOf,
  isRegistered,
  localToWorld,
  worldToLocal,
} from "./geo";

test("未配准地图按恒等变换处理：局部坐标即全局坐标", () => {
  const local = { x: 2, y: 4, z: 1 };
  assert.deepEqual(localToWorld(local, undefined), local);
  // 仅填了分辨率不算配准：分辨率只服务底图投影，不承担全局↔局部变换
  assert.equal(isRegistered({ resolution: 0.05 }), false);
  assert.deepEqual(localToWorld(local, { resolution: 0.05 }), local);
});

test("已配准地图：平移后的局部→全局与反向换算互为逆变换", () => {
  const f = { origin: { x: 5, y: -3, yaw: 0 }, rotateDeg: 0 };
  assert.equal(isRegistered(f), true);
  const world = localToWorld({ x: 2, y: 4, z: 1 }, f);
  assert.deepEqual(world, { x: 7, y: 1, z: 1 });
  assert.deepEqual(worldToLocal(world, f), { x: 2, y: 4, z: 1 });
});

test("带旋转的配准：90° 旋转下局部 X 轴落到全局 Y 轴", () => {
  const f = { origin: { x: 10, y: 20, yaw: 0 }, rotateDeg: 90 };
  const world = localToWorld({ x: 1, y: 0, z: 0 }, f);
  assert.deepEqual(world, { x: 10, y: 21, z: 0 });
  assert.deepEqual(worldToLocal(world, f), { x: 1, y: 0, z: 0 });
});

test("坐标辅助函数：距离与文案", () => {
  assert.equal(distanceOf({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  assert.equal(coordText({ x: 1, y: 2, z: 3 }), "X 1 / Y 2 / Z 3");
  assert.equal(coordText(undefined), "—");
});
