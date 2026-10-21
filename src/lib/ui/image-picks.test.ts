import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeImagePicks } from "./image-picks.ts";

const img = (name: string, type = "image/jpeg") => ({ name, type, size: name.length, lastModified: 1 });

test("최대 4장까지 더하고, 넘치거나 이미지가 아니거나 같은 파일이면 뺀다", () => {
  const a = mergeImagePicks([], [img("1.jpg"), img("2.jpg"), img("memo.pdf", "application/pdf")]);
  assert.deepEqual(a.files.map((f) => f.name), ["1.jpg", "2.jpg"]);
  assert.equal(a.rejectedNonImage, 1);
  const b = mergeImagePicks(a.files, [img("2.jpg"), img("3.png", "image/png"), img("4.jpg"), img("5.jpg")]);
  assert.deepEqual(b.files.map((f) => f.name), ["1.jpg", "2.jpg", "3.png", "4.jpg"]);
  assert.equal(b.overflow, 1);
});
