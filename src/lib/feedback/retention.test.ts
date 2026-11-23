import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackCutoff, isCronAuthorized, purgeExpiredFeedback } from "./retention.ts";

const NOW = new Date("2026-11-24T00:00:00.000Z");

test("1년(365일) 전 시각을 기준으로 한다", () => {
  assert.equal(feedbackCutoff(NOW), "2025-11-24T00:00:00.000Z");
});

test("CRON_SECRET이 있으면 Bearer 값이 맞아야 하고, 없으면 Vercel 크론 user-agent만 본다", () => {
  assert.equal(isCronAuthorized("Bearer abc", null, "abc"), true);
  assert.equal(isCronAuthorized("Bearer xyz", "vercel-cron/1.0", "abc"), false);
  assert.equal(isCronAuthorized(null, "vercel-cron/1.0", "abc"), false);
  assert.equal(isCronAuthorized(null, "vercel-cron/1.0", undefined), true);
  assert.equal(isCronAuthorized(null, "Mozilla/5.0", undefined), false);
});

type Row = { id: string; created_at: string; attachments?: { path: string }[] };
function fakeDb(rows: Row[], opts: { removeError?: boolean; noAttachmentsColumn?: boolean } = {}) {
  const removed: string[] = [];
  const db = {
    rows,
    removed,
    from() {
      let cutoff = "";
      let mode: "select" | "delete" = "select";
      let cols = "";
      const q = {
        select(c: string) { mode = "select"; cols = c; return q; },
        lt(_col: string, v: string) { cutoff = v; return q; },
        limit(n: number) {
          if (opts.noAttachmentsColumn && cols.includes("attachments")) return Promise.resolve({ data: null, error: { message: "no column" } });
          const hit = db.rows.filter((r) => r.created_at < cutoff).slice(0, n);
          return Promise.resolve({ data: hit.map((r) => (cols.includes("attachments") ? r : { id: r.id })), error: null });
        },
        delete() { mode = "delete"; return q; },
        in(_col: string, ids: string[]) {
          if (mode === "delete") db.rows = db.rows.filter((r) => !ids.includes(r.id));
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
    storage: {
      from() {
        return { remove: (p: string[]) => { if (opts.removeError) return Promise.resolve({ error: { message: "x" } }); removed.push(...p); return Promise.resolve({ error: null }); } };
      },
    },
  };
  return db;
}

test("1년이 지난 행과 첨부 파일만 지우고 최근 것은 둔다", async () => {
  const db = fakeDb([
    { id: "old1", created_at: "2025-01-01T00:00:00.000Z", attachments: [{ path: "2025-01/a.jpg" }, { path: "2025-01/b.jpg" }] },
    { id: "old2", created_at: "2025-06-01T00:00:00.000Z" },
    { id: "new1", created_at: "2026-10-01T00:00:00.000Z", attachments: [{ path: "2026-10/c.jpg" }] },
  ]);
  const r = await purgeExpiredFeedback(db, NOW);
  assert.deepEqual(r, { deleted: 2, files: 2, stopped: false });
  assert.deepEqual(db.rows.map((x) => x.id), ["new1"]);
  assert.deepEqual(db.removed, ["2025-01/a.jpg", "2025-01/b.jpg"]);
});

test("지울 것이 없으면 아무것도 하지 않는다", async () => {
  const db = fakeDb([{ id: "new1", created_at: "2026-10-01T00:00:00.000Z" }]);
  assert.deepEqual(await purgeExpiredFeedback(db, NOW), { deleted: 0, files: 0, stopped: false });
});

test("파일을 못 지우면 행도 남겨 다음 날 다시 시도한다(파일만 남는 일 방지)", async () => {
  const db = fakeDb([{ id: "old1", created_at: "2025-01-01T00:00:00.000Z", attachments: [{ path: "p.jpg" }] }], { removeError: true });
  const r = await purgeExpiredFeedback(db, NOW);
  assert.equal(r.stopped, true);
  assert.equal(r.deleted, 0);
  assert.equal(db.rows.length, 1);
});

test("attachments 열이 아직 없어도 행은 지운다", async () => {
  const db = fakeDb([{ id: "old1", created_at: "2025-01-01T00:00:00.000Z" }], { noAttachmentsColumn: true });
  assert.deepEqual(await purgeExpiredFeedback(db, NOW), { deleted: 1, files: 0, stopped: false });
});

test("100개를 넘게 쌓여 있어도 여러 번 나눠 지운다", async () => {
  const rows: Row[] = Array.from({ length: 230 }, (_, i) => ({ id: `r${i}`, created_at: "2025-01-01T00:00:00.000Z" }));
  const db = fakeDb(rows);
  assert.equal((await purgeExpiredFeedback(db, NOW)).deleted, 230);
  assert.equal(db.rows.length, 0);
});
