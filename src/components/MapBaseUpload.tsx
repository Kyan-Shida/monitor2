/**
 * @file MapBaseUpload.tsx
 * @description 地图底图上传/替换/清除控件：上传一张图片作为该地图的底图（存 dataUrl）。
 * @interaction 被 Annotation.tsx、MapOnboarding.tsx、MapSurveyPanel.tsx 复用
 */
import { useRef, useState } from "react";
import { useStore } from "../data/store";
import { Btn } from "./UI";

/** 底图大小上限（单张）：超过则拒绝，避免撑爆 localStorage */
const MAX_SIZE = 2 * 1024 * 1024;

export function MapBaseUpload({ mapId }: { mapId: string }) {
  const { s, act } = useStore();
  const m = s.maps.find((x) => x.id === mapId)!;
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  /**
   * 读取并保存底图
   * @param file 选中的图片文件
   */
  async function pick(file?: File) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件（JPG / PNG / WebP）。");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("图片过大（建议 2 MB 以内），请压缩后再上传。");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("读取失败"));
        reader.readAsDataURL(file);
      });
      act({ type: "SET_MAP_IMAGE", mapId, image: dataUrl });
    } catch {
      setError("图片无法读取，请换一张有效图片后重试。");
    }
  }

  return (
    <div className="actions">
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="上传地图底图"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Btn primary onClick={() => input.current?.click()}>
        {m.image ? "替换底图" : "上传底图"}
      </Btn>
      {m.image && (
        <Btn onClick={() => act({ type: "SET_MAP_IMAGE", mapId, image: "" })}>清除底图</Btn>
      )}
      {error && <span className="muted">{error}</span>}
    </div>
  );
}
