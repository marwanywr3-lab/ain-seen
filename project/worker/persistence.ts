import type { GameState, Question } from "../src/engine";
import type { Mode } from "../src/protocol";
export interface RoomEvent {
  revision: number;
  type: string;
  phase: string | null;
  round: number;
  at: number;
}
export interface RoomRecord {
  code: string;
  mode: Mode;
  names: [string, string];
  keys: { host: string; red: string; blue: string };
  questions: Question[];
  game: GameState | null;
  revision: number;
  paused: boolean;
  expires: number;
  createdAt?: number;
  events?: RoomEvent[];
}
export async function saveRoomToD1(
  db: D1Database,
  s: RoomRecord,
): Promise<void> {
  const now = Date.now();
  const game = s.game;
  const statements: D1PreparedStatement[] = [];
  statements.push(
    db
      .prepare(
        `INSERT INTO game_rooms(code,mode,status,revision,paused,created_at,updated_at,expires_at,winner,current_phase,current_round,current_turn,deadline,state_json,questions_snapshot_json)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET status=excluded.status,revision=excluded.revision,paused=excluded.paused,updated_at=excluded.updated_at,expires_at=excluded.expires_at,winner=excluded.winner,current_phase=excluded.current_phase,current_round=excluded.current_round,current_turn=excluded.current_turn,deadline=excluded.deadline,state_json=excluded.state_json WHERE excluded.revision>=game_rooms.revision`,
      )
      .bind(
        s.code,
        s.mode,
        !game ? "waiting" : game.phase === "FINISHED" ? "finished" : "playing",
        s.revision,
        Number(s.paused),
        s.createdAt ?? now,
        now,
        s.expires,
        game?.winner ?? null,
        game?.phase ?? null,
        game?.round ?? 0,
        game?.turn ?? null,
        game?.deadline ?? null,
        JSON.stringify(game),
        JSON.stringify(s.questions),
      ),
  );
  for (const [index, team] of (["red", "blue"] as const).entries()) {
    const t = game?.teams[team];
    statements.push(
      db
        .prepare(
          `INSERT INTO room_teams(room_code,team,name,score,double_used,inventory_json) VALUES(?,?,?,?,?,?) ON CONFLICT(room_code,team) DO UPDATE SET name=excluded.name,score=excluded.score,double_used=excluded.double_used,inventory_json=excluded.inventory_json`,
        )
        .bind(
          s.code,
          team,
          t?.name ?? s.names[index],
          t?.score ?? 0,
          Number(t?.doubleUsed ?? false),
          JSON.stringify(t?.inventory ?? ["FREEZE", "SWAP", "FIFTY_FIFTY"]),
        ),
    );
  }
  for (const role of ["host", "red", "blue"] as const) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(s.keys[role]),
    );
    const hash = Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO room_sessions(room_code,role,credential_hash) VALUES(?,?,?)",
        )
        .bind(s.code, role, hash),
    );
  }
  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO room_score_audit(room_code,sequence,round,team,delta,score_before,score_after,reason)
 SELECT ?,CAST(key AS INTEGER),json_extract(value,'$.round'),json_extract(value,'$.team'),json_extract(value,'$.delta'),json_extract(value,'$.before'),json_extract(value,'$.after'),json_extract(value,'$.reason') FROM json_each(?)`,
      )
      .bind(s.code, JSON.stringify(game?.audit ?? [])),
  );
  statements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO room_events(room_code,revision,event_type,phase,round,occurred_at)
 SELECT ?,json_extract(value,'$.revision'),json_extract(value,'$.type'),json_extract(value,'$.phase'),json_extract(value,'$.round'),json_extract(value,'$.at') FROM json_each(?)`,
      )
      .bind(s.code, JSON.stringify(s.events ?? [])),
  );
  // Eight statements per sync, independent of the number of rounds or events.
  // A single D1 batch commits the snapshot and its audit transactionally.
  await db.batch(statements);
}
export async function removeRoomFromD1(
  db: D1Database,
  code: string,
): Promise<void> {
  await db.prepare("DELETE FROM game_rooms WHERE code=?").bind(code).run();
}
