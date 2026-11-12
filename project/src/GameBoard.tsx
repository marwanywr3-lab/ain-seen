import type { CSSProperties } from "react";
import { categoryFor } from "./catalog";
type BoardCell = {
  id: string;
  category: string;
  points: number;
  status: string;
};
export function GameBoard({
  cells,
  enabled,
  onSelect,
}: {
  cells: BoardCell[];
  enabled: boolean;
  onSelect: (id: string) => void;
}) {
  const colors = [
    "#d9ebff",
    "#ffe6b0",
    "#d5eee0",
    "#ffe0df",
    "#e5ddff",
    "#cdece9",
  ];
  return (
    <section className="board paired-board">
      {[...new Set(cells.map((c) => c.category))].map((name, i) => {
        const rows = cells.filter((c) => c.category === name);
        const cat = categoryFor(name);
        const color = cat?.accent ?? colors[Number(cat?.id.slice(1) ?? i) % colors.length];
        return (
          <article
            className="paired-category"
            key={name}
            style={{ "--category-color": color } as CSSProperties}
          >
            <div className="question-column">
              <span>أسئلة</span>
              {[200, 400, 600].map((points) => {
                const cell = rows.filter((c) => c.points === points)[0]!;
                return (
                  <button
                    key={cell.id}
                    aria-label={`${name} ${points} السؤال الأول`}
                    disabled={!enabled || cell.status !== "available"}
                    onClick={() => onSelect(cell.id)}
                  >
                    {cell.status === "exhausted"
                      ? "✓"
                      : points.toLocaleString("ar-SA")}
                  </button>
                );
              })}
            </div>
            <div className="category-strip">
              <h3>{name}</h3>
              <img src={cat ? `./redesign/categories/${cat.id}.webp` : undefined} alt={name} width="150" height="180" />
              <div className="category-strip-bottom" />
            </div>
            <div className="question-column">
              <span>أسئلة</span>
              {[200, 400, 600].map((points) => {
                const cell = rows.filter((c) => c.points === points)[1]!;
                return (
                  <button
                    key={cell.id}
                    aria-label={`${name} ${points} السؤال الثاني`}
                    disabled={!enabled || cell.status !== "available"}
                    onClick={() => onSelect(cell.id)}
                  >
                    {cell.status === "exhausted"
                      ? "✓"
                      : points.toLocaleString("ar-SA")}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </section>
  );
}
