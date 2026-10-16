import { useMemo, useState } from "react";
import { iconUrlFor, listIconKeys } from "../graph/iconRegistry";

interface Props {
  value: string;
  onChange: (key: string) => void;
}

const GROUPS: [string, string][] = [
  ["gcp-", "Google Cloud"],
  ["aws-", "AWS"],
  ["azure-", "Azure"],
  ["", "その他"],
];

const groupOf = (key: string) => GROUPS.find(([p]) => p && key.startsWith(p))?.[0] ?? "";
const nameOf = (key: string) => key.slice(groupOf(key).length);

/** Searchable grid of the registered icons (src/assets/icons). */
export function IconPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const keys = useMemo(listIconKeys, []);
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  const shown = q ? keys.filter((k) => k.includes(q)) : keys;
  const currentUrl = iconUrlFor(value);

  return (
    <div className="icon-picker">
      <div className="icon-picker-current">
        {value ? (
          <>
            {currentUrl ? <img src={currentUrl} alt="" /> : <span className="icon-picker-missing">?</span>}
            <span>
              {value}
              {!currentUrl && "(未登録のため表示されません)"}
            </span>
            <button type="button" onClick={() => onChange("")}>
              アイコンなしにする
            </button>
          </>
        ) : (
          <span className="icon-picker-none">アイコンなし</span>
        )}
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="検索(例: run, iap, storage)" />
      <div className="icon-picker-grid">
        {GROUPS.map(([prefix, title]) => {
          const inGroup = shown.filter((k) => groupOf(k) === prefix);
          if (inGroup.length === 0) return null;
          return (
            <div key={title} className="icon-picker-group">
              <div className="icon-picker-group-title">{title}</div>
              <div className="icon-picker-items">
                {inGroup.map((k) => (
                  <button
                    type="button"
                    key={k}
                    className="icon-picker-item"
                    aria-pressed={k === value}
                    title={k}
                    onClick={() => onChange(k)}
                  >
                    <img src={iconUrlFor(k)} alt="" loading="lazy" />
                    <span>{nameOf(k)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="icon-picker-empty">該当するアイコンがありません</p>}
      </div>
    </div>
  );
}
