import { useEffect, useRef, useState } from "react";
import { api, apiDefault, useRoom } from "./client";
import type { Mode, Role, RoomCommand, RoomView } from "./protocol";
import { other, type JokerCard, type TeamId } from "./engine";
import { Admin } from "./admin";
const icon = new URL("../icon.png", import.meta.url).href,
  wordmark = new URL("../wordmark.png", import.meta.url).href;
const cardNames: Record<JokerCard, string> = {
  FREEZE: "عين حارة",
  SWAP: "تثبيت المخ",
  FIFTY_FIFTY: "شيل خيارين",
};
function Animation({
  kind,
  name,
  color,
  onEnd,
}: {
  kind: string;
  name?: string;
  color?: string;
  onEnd: () => void;
}) {
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    const t = setTimeout(() => endRef.current(), kind === "turn" ? 2400 : 2100);
    return () => clearTimeout(t);
  }, [kind]);
  return (
    <div className={`animation ${kind}`} aria-hidden="true">
      <img src={kind === "intro" ? icon : wordmark} alt="" />
      {kind === "turn" && (
        <div className={`turn-title ${color}`}>
          <small>الدور الآن</small>
          <h1>{name}</h1>
        </div>
      )}
    </div>
  );
}
function Share({ code, keys }: { code: string; keys: Record<string, string> }) {
  const [copied, setCopied] = useState("");
  const link = (key = "") =>
    `${location.origin}${location.pathname}#room=${code}${key ? `&key=${key}` : ""}`;
  return (
    <details className="panel sharing">
      <summary>روابط الدخول — احتفظ بروابط القادة خاصة</summary>
      {(["red", "blue", "viewer"] as const).map((role) => (
        <div key={role}>
          <b>
            {role === "red"
              ? "قائد الأحمر"
              : role === "blue"
                ? "قائد الأزرق"
                : "المشاهد وشاشة العرض"}
          </b>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link(keys[role]));
                setCopied(role);
              } catch {
                setCopied("تعذر النسخ، انسخ الرابط من الحقل");
              }
            }}
          >
            نسخ الرابط
          </button>
          <input
            aria-label={`رابط ${role}`}
            readOnly
            value={link(keys[role])}
          />
          {copied === role && <small>تم النسخ</small>}
        </div>
      ))}
    </details>
  );
}
export default function RemoteApp() {
  const [base, setBase] = useState(apiDefault);
  const [route, setRoute] = useState(location.hash);
  const [intro, setIntro] = useState(true);
  const [names, setNames] = useState<[string, string]>([
    "الفريق الأحمر",
    "الفريق الأزرق",
  ]);
  const [mode, setMode] = useState<Mode>("phones");
  const [join, setJoin] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const listen = () => setRoute(location.hash);
    window.addEventListener("hashchange", listen);
    return () => window.removeEventListener("hashchange", listen);
  }, []);
  const params = new URLSearchParams(route.slice(1));
  const code = params.get("room") || "";
  const key =
    params.get("key") || localStorage.getItem(`ain-session-${code}`) || "";
  useEffect(() => {
    if (code && params.get("key")) {
      localStorage.setItem(`ain-session-${code}`, key);
      history.replaceState(null, "", `${location.pathname}#room=${code}`);
    }
  }, [code, key]);
  const saveBase = (value: string) => {
    setBase(value);
    localStorage.setItem("ain-seen-api", value);
  };
  const create = async () => {
    try {
      setCreating(true);
      const data = await api<{ code: string; keys: Record<string, string> }>(
        base,
        "/rooms",
        { method: "POST", body: JSON.stringify({ names, mode }) },
      );
      localStorage.setItem(`ain-keys-${data.code}`, JSON.stringify(data.keys));
      location.hash = `room=${data.code}&key=${data.keys.host}`;
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };
  return (
    <>
      <header>
        <a href="#">
          <img src={wordmark} alt="عين سين" />
        </a>
        <nav>
          <a href="./admin.html">بوابة الأسئلة</a>
          <span className="pill">مسابقة • تشاور • خطف</span>
        </nav>
      </header>
      {route === "#admin" ? (
        <Admin base={base} />
      ) : code ? (
        <Room base={base} code={code} sessionKey={key} />
      ) : (
        <main className="setup">
          <section className="hero">
            <span className="pill">فريقان، مقدم واحد، والتحدي لكم</span>
            <h1>
              عين على السؤال،
              <br />
              <em>وسين على الفوز.</em>
            </h1>
            <p>
              ٣٦ فرصة تقلب النتيجة. تشاوروا، خلّوا القرار للقائد، وخلكم جاهزين
              للخطف.
            </p>
            <img className="hero-icon" src={icon} alt="أيقونة اللعبة" />
          </section>
          <section className="panel">
            <h2>جهّز القيم</h2>
            {!import.meta.env.VITE_API_URL && (
              <label>
                عنوان خدمة اللعبة
                <input
                  dir="ltr"
                  type="url"
                  placeholder="https://your-api.workers.dev"
                  value={base}
                  onChange={(e) => saveBase(e.target.value)}
                />
              </label>
            )}
            <label>
              الفريق الأحمر
              <input
                maxLength={32}
                value={names[0]}
                onChange={(e) => setNames([e.target.value, names[1]])}
              />
            </label>
            <label>
              الفريق الأزرق
              <input
                maxLength={32}
                value={names[1]}
                onChange={(e) => setNames([names[0], e.target.value])}
              />
            </label>
            <label>
              طريقة اللعب
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                <option value="phones">جوال لكل قائد + مقدم</option>
                <option value="single">شاشة واحدة مع مقدم</option>
              </select>
            </label>
            <button
              className="primary"
              disabled={!base || creating}
              onClick={() => void create()}
            >
              {creating ? "نجهز الغرفة…" : "أنشئ المباراة ←"}
            </button>
            <hr />
            <h3>ادخل للمشاهدة</h3>
            <input
              aria-label="رمز الغرفة"
              placeholder="رمز الغرفة"
              value={join}
              onChange={(e) =>
                setJoin(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 10),
                )
              }
            />
            <button
              disabled={join.length !== 10 || !base}
              onClick={() => {
                location.hash = `room=${join}`;
              }}
            >
              دخول المشاهد / الشاشة
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </main>
      )}
      <footer>عين سين · القرار للقائد، والمتعة للجميع.</footer>
      {intro && <Animation kind="intro" onEnd={() => setIntro(false)} />}
    </>
  );
}
function Room({
  base,
  code,
  sessionKey,
}: {
  base: string;
  code: string;
  sessionKey: string;
}) {
  const {
    room: r,
    connected,
    error,
    send,
    remaining,
  } = useRoom(base, code, sessionKey);
  const [selected, setSelected] = useState<number | null>(null);
  const [animation, setAnimation] = useState<string | null>(null);
  const [previous, setPrevious] = useState<{
    phase: string;
    round: number;
  } | null>(null);
  const [hideHost, setHideHost] = useState(false);
  const s = r?.game;
  const host = r?.role === "host";
  useEffect(() => {
    if (!s) return;
    setSelected(null);
    if (previous) {
      if (
        s.phase === "BOARD" &&
        (previous.phase !== "BOARD" || previous.round !== s.round)
      )
        setAnimation("turn");
      if (s.phase === "FINISHED" && previous.phase !== "FINISHED")
        setAnimation("end");
    } else if (s.phase === "BOARD") setAnimation("match");
    setPrevious({ phase: s.phase, round: s.round });
  }, [s?.phase, s?.round]);
  useEffect(() => setSelected(null), [s?.current?.id]);
  if (!r)
    return (
      <main className="panel">
        <h2>نتصل بالغرفة…</h2>
        {error && <p role="alert">{error}</p>}
        <a href="#">الرجوع</a>
      </main>
    );
  const keys = host
    ? (JSON.parse(localStorage.getItem(`ain-keys-${code}`) || "{}") as Record<
        string,
        string
      >)
    : {};
  const can = (team: TeamId) =>
    connected && !r.paused && (r.mode === "single" ? host : r.role === team);
  const command = (a: RoomCommand) => {
    if (connected) void send(a);
  };
  const visibleHost = host && !hideHost;
  return (
    <main>
      <div className="toolbar">
        <span className={`pill ${connected ? "online" : "offline"}`}>
          {connected ? "متصل" : "إعادة اتصال"} · غرفة {code}
        </span>
        <b>
          {host
            ? "المقدم"
            : r.role === "viewer"
              ? "مشاهدة فقط"
              : `قائد ${r.names[r.role === "red" ? 0 : 1]}`}
        </b>
        {host && (
          <button onClick={() => setHideHost(!hideHost)}>
            {hideHost ? "لوحة المقدم" : "إخفاء أدوات المقدم"}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!s ? (
        <section className="panel">
          <h1>التحدي على وشك يبدأ</h1>
          <p>{r.names.join(" × ")}</p>
          <div className="scores">
            {(["red", "blue"] as const).map((team, i) => (
              <div className={`score ${team}`} key={team}>
                <b>{r.names[i]}</b>
                <span>
                  {r.presence[team] ? "القائد متصل" : "بانتظار القائد"}
                </span>
              </div>
            ))}
          </div>
          {host && (
            <>
              <p>
                المقدم حاضر دائمًا. في وضع الجوالات يلزم اتصال القائدين قبل
                البداية.
              </p>
              <Share code={code} keys={keys} />
              <button
                className="primary"
                disabled={
                  !connected ||
                  (r.mode === "phones" && (!r.presence.red || !r.presence.blue))
                }
                onClick={() => command({ type: "START" })}
              >
                ابدأ المباراة
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          <div className="scores">
            {(["red", "blue"] as const).map((team) => (
              <section
                className={`score ${team} ${s.turn === team ? "current" : ""}`}
                key={team}
              >
                <span>{s.teams[team].name}</span>
                <strong key={s.teams[team].score}>
                  {s.teams[team].score.toLocaleString("ar-SA")}
                </strong>
                <small>
                  {r.mode === "phones"
                    ? r.presence[team]
                      ? "القائد متصل"
                      : "القائد غير متصل"
                    : "جلسة شاشة واحدة"}
                </small>
              </section>
            ))}
          </div>
          <div className="toolbar">
            <span>
              {s.cells.filter((c) => c.status === "exhausted").length} / ٣٦
            </span>
            <b>
              {s.phase === "BOARD"
                ? `الدور على ${s.teams[s.turn].name}`
                : s.result || "عينك على السؤال"}
            </b>
            {visibleHost && (
              <>
                <button
                  disabled={
                    !connected || !["BOARD", "RESOLUTION"].includes(s.phase)
                  }
                  onClick={() => command({ type: "PAUSE", paused: !r.paused })}
                >
                  {r.paused ? "استئناف" : "إيقاف بين الجولات"}
                </button>
                <button
                  onClick={() => {
                    if (confirm("إنهاء المباراة دون إعلان فائز؟"))
                      command({ type: "END_MATCH" });
                  }}
                >
                  إنهاء
                </button>
              </>
            )}
          </div>
          {r.paused && (
            <p className="panel">استراحة قصيرة — المقدم يستأنف القيم.</p>
          )}
          {s.phase === "BOARD" ? (
            <section className="board">
              {[...new Set(s.cells.map((c) => c.category))].map(
                (category, i) => (
                  <article className={`category tint-${i % 4}`} key={category}>
                    <h3>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {category}
                    </h3>
                    {s.cells
                      .filter((c) => c.category === category)
                      .map((cell) => (
                        <button
                          key={cell.id}
                          disabled={!can(s.turn) || cell.status !== "available"}
                          onClick={() =>
                            command({
                              type: "SELECT_CELL",
                              team: s.turn,
                              cellId: cell.id,
                            })
                          }
                        >
                          {cell.status === "exhausted"
                            ? "✓"
                            : cell.points.toLocaleString("ar-SA")}
                        </button>
                      ))}
                  </article>
                ),
              )}
            </section>
          ) : s.phase === "FINISHED" ? (
            <section className="panel finish">
              <span className="pill">ختام القيم</span>
              <h1>
                {s.winner
                  ? `الفائز: ${s.teams[s.winner].name}`
                  : "انتهت المباراة"}
              </h1>
              <p>{s.result}</p>
              {(["red", "blue"] as TeamId[])
                .sort((a, b) => s.teams[b].score - s.teams[a].score)
                .map((team) => (
                  <div className={`final-row ${team}`} key={team}>
                    <b>{s.teams[team].name}</b>
                    <strong>
                      {s.teams[team].score.toLocaleString("ar-SA")} نقطة
                    </strong>
                  </div>
                ))}
              <a href="#">جلسة جديدة</a>
            </section>
          ) : (
            <section className="question panel">
              <div className="question-top">
                <span className="pill">
                  {s.current?.category || "سؤال التحدي"}
                </span>
                <span className="pill">
                  {s.double
                    ? "عين التحدي × ٢"
                    : s.current?.points
                      ? `${s.current.points} نقطة`
                      : "قبل الكشف"}
                </span>
              </div>
              {s.phase === "PREPARE" ? (
                <div className="prepare">
                  <h1>جاهزين للتحدي؟</h1>
                  <p>قرار عين التحدي قبل ما ينكشف السؤال.</p>
                  <button
                    disabled={!can(s.turn) || s.teams[s.turn].doubleUsed}
                    onClick={() =>
                      command({ type: "TRIGGER_DOUBLE_DOWN", team: s.turn })
                    }
                  >
                    {s.double
                      ? "عين التحدي مفعّلة"
                      : s.teams[s.turn].doubleUsed
                        ? "عين التحدي مستهلكة"
                        : "فعّل عين التحدي × ٢"}
                  </button>
                  {visibleHost && (
                    <>
                      <p>انتظر قرار القائد ثم اكشف السؤال.</p>
                      <button
                        className="primary"
                        disabled={!connected || r.paused}
                        onClick={() => command({ type: "REVEAL_QUESTION" })}
                      >
                        اكشف السؤال وابدأ الوقت
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <h2>{s.current?.question}</h2>
                  {s.deadline !== null && (
                    <div
                      className={`timer ${remaining < 5000 ? "urgent" : ""}`}
                    >
                      <strong>
                        {Math.ceil(remaining / 1000).toLocaleString("ar-SA")}
                      </strong>
                      <div className="track">
                        <i
                          style={{
                            width: `${Math.min(100, (remaining / (s.phase === "MAIN" ? 20000 : s.phase === "SUDDEN_ANSWER" ? 5000 : 7000)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>
                        {s.phase === "STEAL_BUZZ"
                          ? "انتظار بزر الخطف"
                          : s.answerTeam
                            ? `إجابة ${s.teams[s.answerTeam].name}`
                            : ""}
                      </small>
                    </div>
                  )}
                  <div className="options">
                    {s.current?.options.map((option, index) => (
                      <button
                        key={index}
                        style={{
                          visibility: s.hidden.includes(index)
                            ? "hidden"
                            : "visible",
                        }}
                        className={`${selected === index ? "selected" : ""} ${["RESOLUTION", "FINISHED"].includes(s.phase) && option === s.current?.correct_answer ? "correct" : ""}`}
                        disabled={
                          !s.answerTeam ||
                          !can(s.answerTeam) ||
                          !["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(
                            s.phase,
                          ) ||
                          s.hidden.includes(index)
                        }
                        onClick={() => setSelected(index)}
                      >
                        <span>{["أ", "ب", "ج", "د"][index]}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                  {s.answerTeam &&
                    can(s.answerTeam) &&
                    ["MAIN", "STEAL_ANSWER", "SUDDEN_ANSWER"].includes(
                      s.phase,
                    ) && (
                      <button
                        className="primary"
                        disabled={selected === null}
                        onClick={() => {
                          if (selected !== null)
                            command({
                              type: "SUBMIT_ANSWER",
                              team: s.answerTeam!,
                              index: selected,
                            });
                        }}
                      >
                        اعتماد الإجابة
                      </button>
                    )}
                  {s.phase === "STEAL_BUZZ" && (
                    <div className="steal">
                      <h2>فرصة الخطف!</h2>
                      <button
                        className={`buzzer ${other(s.turn)}`}
                        disabled={!can(other(s.turn))}
                        onClick={() =>
                          command({ type: "BUZZ_STEAL", team: other(s.turn) })
                        }
                      >
                        بزر {s.teams[other(s.turn)].name}
                      </button>
                    </div>
                  )}
                  {s.phase === "SUDDEN_BUZZ" && (
                    <div className="steal">
                      <h2>مخمخ وفاصل</h2>
                      {(["red", "blue"] as const).map((team) => (
                        <button
                          key={team}
                          className={`buzzer ${team}`}
                          disabled={!can(team)}
                          onClick={() => command({ type: "BUZZ_SUDDEN", team })}
                        >
                          {s.teams[team].name}
                        </button>
                      ))}
                    </div>
                  )}
                  {s.phase === "RESOLUTION" && (
                    <div className="resolution">
                      <h2>{s.result}</h2>
                      <b>الإجابة: {s.current?.correct_answer}</b>
                      <p>{s.current?.quick_fact}</p>
                      {visibleHost && (
                        <button
                          className="primary"
                          disabled={!connected || r.paused}
                          onClick={() => command({ type: "RESOLVE_ROUND" })}
                        >
                          التالي ←
                        </button>
                      )}
                    </div>
                  )}
                  {s.phase === "MAIN" && (
                    <div className="trays">
                      {(["red", "blue"] as const).map((team) => (
                        <div className={`tray ${team}`} key={team}>
                          <b>{s.teams[team].name}</b>
                          {(["FREEZE", "SWAP", "FIFTY_FIFTY"] as const).map(
                            (card) => (
                              <button
                                key={card}
                                disabled={
                                  !can(team) ||
                                  !s.teams[team].inventory.includes(card) ||
                                  (card === "FREEZE"
                                    ? team === s.turn
                                    : team !== s.turn)
                                }
                                onClick={() =>
                                  command({ type: "USE_JOKER", team, card })
                                }
                              >
                                {cardNames[card]}
                                {!s.teams[team].inventory.includes(card) &&
                                  " ✓"}
                              </button>
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {visibleHost &&
                    s.current?.correct_answer &&
                    s.phase !== "RESOLUTION" && (
                      <details>
                        <summary>للمقدم فقط: الإجابة الصحيحة</summary>
                        {s.current.correct_answer}
                      </details>
                    )}
                </>
              )}
            </section>
          )}
          {visibleHost && (
            <>
              <details className="audit">
                <summary>سجل النقاط</summary>
                {s.audit.map((a, i) => (
                  <p key={i}>
                    الجولة {a.round} · {s.teams[a.team].name} · {a.reason} ·{" "}
                    {a.delta > 0 ? "+" : ""}
                    {a.delta} ← {a.after}
                  </p>
                ))}
              </details>
              <Share code={code} keys={keys} />
            </>
          )}
        </>
      )}
      {animation && s && (
        <Animation
          kind={animation}
          name={s.teams[s.turn].name}
          color={s.turn}
          onEnd={() => setAnimation(null)}
        />
      )}
    </main>
  );
}
