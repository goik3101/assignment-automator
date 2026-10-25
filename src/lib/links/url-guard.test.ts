import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, checkPublicUrlSyntax, guardedFetch, ipBlockedOrNull, UnsafeUrlError } from "./url-guard.ts";

const publicResolver = async () => ["93.184.216.34"];

test("공인 http(s) 주소는 통과한다", () => {
  for (const u of ["https://example.com/a?b=1", "http://www.law.go.kr/x", "https://news.naver.com:443/x", "http://example.org:80/"]) {
    assert.equal(checkPublicUrlSyntax(u).ok, true, u);
  }
});

test("http(s)가 아닌 스킴·로그인 정보·허용 밖 포트는 막는다", () => {
  for (const u of ["file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", "https://user:pw@example.com/", "http://example.com:8080/", "https://example.com:22/", "not a url", ""]) {
    assert.equal(checkPublicUrlSyntax(u).ok, false, u);
  }
});

test("localhost·내부용 이름·점 없는 호스트는 막는다", () => {
  for (const u of ["http://localhost/", "http://LOCALHOST./", "http://app.localhost/", "http://printer.local/", "http://db.internal/", "http://intranet/", "http://metadata.google.internal/computeMetadata/v1/"]) {
    assert.equal(checkPublicUrlSyntax(u).ok, false, u);
  }
});

test("사설·로컬·메타데이터 IPv4는 막는다(10진수·16진수 우회 표기 포함)", () => {
  for (const u of [
    "http://127.0.0.1/", "http://127.1/", "http://0.0.0.0/", "http://10.0.0.5/", "http://172.16.0.1/", "http://172.31.255.255/",
    "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/", "http://100.64.0.1/", "http://224.0.0.1/", "http://255.255.255.255/",
    "http://2130706433/", "http://0x7f000001/", "http://017700000001/", "http://2852039166/",
  ]) {
    assert.equal(checkPublicUrlSyntax(u).ok, false, u);
  }
});

test("공인 IPv4 경계는 막지 않는다", () => {
  for (const ip of ["8.8.8.8", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1", "192.167.1.1", "223.255.255.255"]) {
    assert.equal(ipBlockedOrNull(ip), false, ip);
  }
});

test("IPv6 로컬·링크로컬·고유 로컬·매핑된 사설 IPv4는 막는다", () => {
  for (const u of [
    "http://[::1]/", "http://[::]/", "http://[fe80::1]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[ff02::1]/",
    "http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://[::ffff:a00:1]/", "http://[64:ff9b::a00:1]/", "http://[2002:7f00:1::]/", "http://[2001:db8::1]/",
  ]) {
    assert.equal(checkPublicUrlSyntax(u).ok, false, u);
  }
  assert.equal(ipBlockedOrNull("2606:4700:4700::1111"), false);
  assert.equal(ipBlockedOrNull("::ffff:8.8.8.8"), false);
});

test("도메인이 사설 IP를 가리키면 막고, 하나라도 섞여 있어도 막는다", async () => {
  await assert.rejects(assertPublicUrl("https://evil.example.com/", async () => ["10.0.0.1"]), UnsafeUrlError);
  await assert.rejects(assertPublicUrl("https://evil.example.com/", async () => ["93.184.216.34", "127.0.0.1"]), UnsafeUrlError);
  await assert.rejects(assertPublicUrl("https://evil.example.com/", async () => ["::1"]), UnsafeUrlError);
  await assert.rejects(assertPublicUrl("https://evil.example.com/", async () => []), UnsafeUrlError);
  assert.equal((await assertPublicUrl("https://example.com/x", publicResolver)).hostname, "example.com");
});

test("도메인이 없는 경우 조회 오류를 그대로 던진다(기존 무효 분류 유지)", async () => {
  const err = Object.assign(new Error("getaddrinfo ENOTFOUND"), { cause: { code: "ENOTFOUND" } });
  await assert.rejects(assertPublicUrl("https://no-such-domain.example/", async () => { throw err; }), (e) => e === err);
});

test("guardedFetch: 내부 주소는 접속 자체를 하지 않는다", async () => {
  let called = 0;
  const fetchImpl = async () => { called++; return new Response("x"); };
  await assert.rejects(guardedFetch("http://169.254.169.254/", {}, { fetchImpl, resolve: publicResolver }), UnsafeUrlError);
  assert.equal(called, 0);
});

test("guardedFetch: 공인 사이트가 내부 주소로 리다이렉트하면 거기서 멈춘다", async () => {
  const seen: string[] = [];
  const fetchImpl = async (u: string) => {
    seen.push(u);
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/admin" } });
  };
  await assert.rejects(guardedFetch("https://example.com/r", {}, { fetchImpl, resolve: publicResolver }), UnsafeUrlError);
  assert.deepEqual(seen, ["https://example.com/r"]);
});

test("guardedFetch: 정상 리다이렉트는 따라가고 최종 주소를 돌려준다(상대 경로 포함)", async () => {
  const fetchImpl = async (u: string, init: RequestInit) => {
    assert.equal(init.redirect, "manual");
    if (u === "https://example.com/a") return new Response(null, { status: 301, headers: { location: "/b" } });
    if (u === "https://example.com/b") return new Response(null, { status: 302, headers: { location: "https://www.example.org/c" } });
    return new Response("ok", { status: 200 });
  };
  const { response, url } = await guardedFetch("https://example.com/a", { method: "GET" }, { fetchImpl, resolve: publicResolver });
  assert.equal(response.status, 200);
  assert.equal(url, "https://www.example.org/c");
});

test("guardedFetch: 리다이렉트 고리는 횟수 제한으로 끊는다", async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return new Response(null, { status: 302, headers: { location: "https://example.com/loop" } }); };
  await assert.rejects(guardedFetch("https://example.com/loop", {}, { fetchImpl, resolve: publicResolver }), UnsafeUrlError);
  assert.equal(n, 6); // 처음 요청 + 리다이렉트 5번
});

test("guardedFetch: location 없는 3xx(304 등)는 그대로 돌려준다", async () => {
  const fetchImpl = async () => new Response(null, { status: 304 });
  const { response } = await guardedFetch("https://example.com/", {}, { fetchImpl, resolve: publicResolver });
  assert.equal(response.status, 304);
});
