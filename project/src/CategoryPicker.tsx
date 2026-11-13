import { useState, type ReactNode } from "react";
import { categories } from "./catalog";
type FavoriteGroup = { id: string; name: string; categories: string[] };
const favoritesKey = "ain-favorite-groups-v2";
function readFavorites(): FavoriteGroup[] {
  try {
    const stored = localStorage.getItem(favoritesKey);
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v): v is FavoriteGroup => typeof v?.id === "string" && typeof v?.name === "string" && Array.isArray(v?.categories) && v.categories.length === 6 && new Set(v.categories).size === 6 && v.categories.every((id: unknown) => typeof id === "string" && categories.some(c => c.id === id)));
    }
    const previous: unknown = JSON.parse(localStorage.getItem("ain-favorite-categories-v1") || "[]");
    if (Array.isArray(previous) && previous.length === 6 && new Set(previous).size === 6 && previous.every(id => typeof id === "string" && categories.some(c => c.id === id))) return [{ id: "previous", name: "المفضلة السابقة", categories: previous }];
  } catch { /* storage is optional */ }
  return [];
}
export function CategoryPicker({
  value,
  onChange,
  disabled = false,
  children,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [favorites, setFavorites] = useState<FavoriteGroup[]>(readFavorites);
  const [favoriteName, setFavoriteName] = useState("");
  const [selectedFavorite, setSelectedFavorite] = useState("");
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const saveFavorites = (next: FavoriteGroup[]) => {
    try { localStorage.setItem(favoritesKey, JSON.stringify(next)); setFavorites(next); return true; }
    catch { setFavoriteMessage("تعذر حفظ المفضلة على هذا الجهاز."); return false; }
  };
  return (
    <section id="categories" className="category-picker panel" aria-label="اختيار الفئات">
      <div className="toolbar">
        <div>
          <h2>اختاروا ساحة التحدي</h2>
          <p>٦ فئات من أصل ٣٨ · ٣٦ سؤالًا · ٢٠٠ / ٤٠٠ / ٦٠٠</p>
        </div>
        <b role="status">{value.length.toLocaleString("ar-SA")} / ٦</b>
        <button
          disabled={disabled}
          onClick={() => {
            const shuffled = categories.map((c) => c.id);
            for (let i = shuffled.length - 1; i > 0; i--) {
              let n;
              const limit = Math.floor(0x100000000 / (i + 1)) * (i + 1);
              do {
                n = crypto.getRandomValues(new Uint32Array(1))[0]!;
              } while (n >= limit);
              const j = n % (i + 1);
              [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
            }
            onChange(shuffled.slice(0, 6));
          }}
        >
          قرعة ٦ فئات
        </button>
        <button
          disabled={disabled || !value.length}
          onClick={() => onChange([])}
        >
          مسح الاختيار
        </button>
      </div>
      <div className="favorites-controls" aria-label="مجموعات الفئات المفضلة">
        <label>اسم المجموعة <input value={favoriteName} maxLength={40} placeholder="مثال: جلسة العائلة" onChange={e => setFavoriteName(e.target.value)} /></label>
        <button type="button" disabled={disabled || value.length !== 6 || !favoriteName.trim()} onClick={() => {
          const name = favoriteName.trim();
          if (favorites.some(f => f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setFavoriteMessage("يوجد اسم مطابق؛ اختر اسمًا مختلفًا."); return; }
          const group = { id: crypto.randomUUID(), name, categories: [...value] };
          if (saveFavorites([...favorites, group])) { setSelectedFavorite(group.id); setFavoriteName(""); setFavoriteMessage("حُفظت المجموعة على هذا الجهاز."); }
        }}>حفظ مجموعة المفضلة</button>
        <label>المجموعات المحفوظة <select value={selectedFavorite} onChange={e => { setSelectedFavorite(e.target.value); setFavoriteMessage(""); }}><option value="">اختر مجموعة</option>{favorites.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <button type="button" disabled={disabled || !favorites.some(f => f.id === selectedFavorite)} onClick={() => { const group = favorites.find(f => f.id === selectedFavorite); if (group) onChange([...group.categories]); }}>اختيار المجموعة</button>
        <button type="button" disabled={disabled || !favorites.some(f => f.id === selectedFavorite)} onClick={() => { if (saveFavorites(favorites.filter(f => f.id !== selectedFavorite))) { setSelectedFavorite(""); setFavoriteMessage("حُذفت المجموعة من هذا الجهاز."); } }}>حذف المجموعة</button>
        {favoriteMessage && <p role="status">{favoriteMessage}</p>}
      </div>
      <div className="category-choices">
        {categories.map((c) => {
          const checked = value.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              className={`category-choice ${checked ? "chosen" : ""}`}
              aria-pressed={checked}
              disabled={disabled || (!checked && value.length === 6)}
              onClick={() =>
                onChange(
                  checked
                    ? value.filter((id) => id !== c.id)
                    : [...value, c.id],
                )
              }
              title="٦ أسئلة في المباراة: سؤالان لكل قيمة ٢٠٠ و٤٠٠ و٦٠٠"
            >
              <img
                src={`./redesign/categories/${c.id}.webp`}
                alt=""
                loading="lazy"
                width="100"
                height="100"
              />
              <span>{c.name.split(" (")[0]}</span>
              <b aria-hidden="true">{checked ? "✓" : "+"}</b>
            </button>
          );
        })}
      </div>
      {children && <div className="category-confirm">{children}</div>}
    </section>
  );
}
