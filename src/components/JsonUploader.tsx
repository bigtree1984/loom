import { useRef, useState } from "react";
import type { LoomDocument } from "../types";

interface Props {
  onLoad: (doc: LoomDocument) => void;
  onLoadSample: () => void;
}

export function JsonUploader({ onLoad, onLoadSample }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.architecture?.nodes || !parsed?.flow?.tasks) {
        throw new Error("architecture.nodes / flow.tasks が見つかりません");
      }
      onLoad(parsed as LoomDocument);
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSONの読み込みに失敗しました");
    }
  };

  return (
    <div className="uploader">
      <button onClick={onLoadSample}>サンプルを読み込む</button>
      <button onClick={() => inputRef.current?.click()}>JSONをアップロード</button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <span className="uploader-error">{error}</span>}
    </div>
  );
}
