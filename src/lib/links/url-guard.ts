import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

// SSRF 방어: 서버가 출처 주소로 직접 접속하는 경로(validate-sources.ts)에서, 내부망·로컬·클라우드 메타데이터 주소로는
// 접속하지 않게 한다. 주소는 모델의 검색 결과뿐 아니라 요청 본문(실행 계획의 referenceSources)으로도 들어오므로 믿지 않는다.
// 알려진 한계: 조회 시점과 실제 접속 시점 사이에 DNS 응답이 바뀌는 공격(DNS rebinding)까지는 막지 못한다.

/** 막은 주소. validate-sources는 이 오류를 "무효 출처"로 처리한다(내부 주소가 실제로 있는지 여부가 응답으로 새지 않게 항상 같은 결과). */
export class UnsafeUrlError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`안전하지 않은 주소: ${reason}`);
    this.name = "UnsafeUrlError";
    this.reason = reason;
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]); // URL.port는 기본 포트면 빈 문자열. 주소가 공인 IP로 검증되므로 내부 서비스는 포트와 무관하게 막힌다
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain", ".home.arpa", ".intranet", ".lan", ".corp"];
const MAX_REDIRECTS = 5;

function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** 사설·로컬·링크로컬·예약·멀티캐스트 대역이면 true. 공인 주소만 통과시킨다. */
export function isBlockedIPv4(parts: number[]): boolean {
  const [a, b, c] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) || // 링크로컬 + 클라우드 메타데이터(169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) || // 192.0.0.0/24
    (a === 192 && b === 0 && c === 2) || // 문서용 TEST-NET-1
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // 벤치마크용
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // 멀티캐스트·예약·브로드캐스트
  );
}

/** IPv6 문자열을 16비트 8개로 푼다. 형식이 이상하면 null. 끝의 IPv4 표기(::ffff:1.2.3.4)도 처리한다. */
function parseIPv6(host: string): number[] | null {
  let h = host.toLowerCase();
  const zone = h.indexOf("%");
  if (zone >= 0) h = h.slice(0, zone);
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (v4) {
    const p = parseIPv4(v4[1]);
    if (!p) return null;
    h = h.slice(0, v4.index) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

export function isBlockedIPv6(groups: number[]): boolean {
  const embeddedV4 = (hi: number, lo: number) => isBlockedIPv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 링크로컬
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 고유 로컬
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 사이트 로컬(폐기됐지만 일부 망에 남아 있다)
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 멀티캐스트
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // 문서용
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo: 안에 든 IPv4가 가려져 있어 판별 대신 막는다
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true; // 64:ff9b:1::/48 로컬용 NAT64
  if (g0 === 0x2002) return embeddedV4(g1, g2); // 6to4: 안에 든 IPv4를 본다
  const first5Zero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (first5Zero && (g5 === 0xffff || g5 === 0)) return embeddedV4(g6, g7); // ::ffff:a.b.c.d(IPv4 매핑), ::a.b.c.d(구식 호환)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return embeddedV4(g6, g7); // ::ffff:0:a.b.c.d(SIIT 변환 주소)
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return embeddedV4(g6, g7); // NAT64
  return false;
}

/** IP 주소 문자열(대괄호 없이)이 막아야 할 주소인지. IP가 아니면 null. */
export function ipBlockedOrNull(address: string): boolean | null {
  const kind = isIP(address);
  if (kind === 4) {
    const p = parseIPv4(address);
    return p ? isBlockedIPv4(p) : true;
  }
  if (kind === 6) {
    const g = parseIPv6(address);
    return g ? isBlockedIPv6(g) : true;
  }
  return null;
}

type SyntaxCheck = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * DNS 조회 없이 주소 문자열만으로 판단하는 1차 검사: http(s)만, 로그인 정보 없음, 80/443 포트만,
 * 로컬·내부용 호스트 이름과 사설 IP 직접 지정 금지. new URL()이 10진수·16진수 IPv4(예: http://2130706433)를 점 표기로 바꿔 주므로 그 형태도 걸러진다.
 */
export function checkPublicUrlSyntax(raw: string): SyntaxCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "주소 형식" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "http(s)가 아님" };
  if (url.username || url.password) return { ok: false, reason: "로그인 정보 포함" };
  if (!ALLOWED_PORTS.has(url.port)) return { ok: false, reason: "허용되지 않는 포트" };

  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (!host) return { ok: false, reason: "호스트 없음" };
  const ipBlocked = ipBlockedOrNull(host);
  if (ipBlocked === true) return { ok: false, reason: "사설·로컬 IP" };
  if (ipBlocked === null) {
    // 도메인 이름: 점이 없는 이름(사내 호스트)과 로컬·내부용 접미사는 공인 사이트가 아니다.
    if (!host.includes(".") || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      return { ok: false, reason: "로컬·내부 호스트" };
    }
  }
  return { ok: true, url };
}

type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * 1차 검사 + 도메인이 가리키는 주소를 모두 조회해 하나라도 사설·로컬이면 막는다(공인처럼 보이는 이름이 내부 IP를 가리키는 경우).
 * 도메인이 아예 없으면 조회 오류를 그대로 던진다(호출하는 쪽의 기존 "도메인 없음 = 무효" 분류가 유지된다).
 * 검사를 통과한 주소 목록도 함께 돌려준다 — 접속할 때 이 주소로 고정해서 검사와 접속 사이에 DNS 응답이 바뀌는 우회(DNS rebinding)를 막는다.
 */
export async function resolvePublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<{ url: URL; addresses: string[] }> {
  const checked = checkPublicUrlSyntax(raw);
  if (!checked.ok) throw new UnsafeUrlError(checked.reason);
  const host = checked.url.hostname.replace(/^[|]$/g, "");
  if (ipBlockedOrNull(host) === null) {
    const addresses = await resolve(host);
    if (addresses.length === 0 || addresses.some((a) => ipBlockedOrNull(a) !== false)) throw new UnsafeUrlError("내부 주소로 연결되는 도메인");
    return { url: checked.url, addresses };
  }
  return { url: checked.url, addresses: [host] };
}

export async function assertPublicUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  return (await resolvePublicUrl(raw, resolve)).url;
}

type FetchImpl = (input: string, init: RequestInit, addresses: string[]) => Promise<Response>;

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * 검사를 통과한 주소로만 접속하는 fetch 대용. Node 내장 fetch는 접속 주소를 고정할 수 없어서(별도 패키지 없이는) http(s).request의 lookup 훅을 쓴다.
 * 응답 압축(gzip/deflate/br)은 여기서 풀고, 리다이렉트는 따라가지 않는다(guardedFetch가 매번 다시 검사하며 따라간다).
 */
export function pinnedFetch(href: string, init: RequestInit, addresses: string[]): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const u = new URL(href);
    const method = (init.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined), "Accept-Encoding": "gzip, deflate, br" };
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      u,
      {
        method,
        headers,
        signal: init.signal ?? undefined,
        // 호스트 이름은 그대로 두고(인증서 검사·Host 헤더 유지) 접속 주소만 이미 검사한 목록으로 고정한다.
        lookup: ((_host: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          const list = addresses.map((address) => ({ address, family: isIP(address) }));
          if (opts?.all) cb(null, list);
          else cb(null, list[0].address, list[0].family);
        }) as never,
      },
      (res) => {
        const out = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach((x) => out.append(k, x));
          else if (v !== undefined) out.set(k, v);
        }
        const status = res.statusCode ?? 0;
        if (method === "HEAD" || NULL_BODY_STATUSES.has(status)) {
          res.resume();
          resolve(new Response(null, { status, statusText: res.statusMessage, headers: out }));
          return;
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const decoder = enc === "gzip" || enc === "x-gzip" ? createGunzip() : enc === "deflate" ? createInflate() : enc === "br" ? createBrotliDecompress() : null;
        if (decoder) {
          out.delete("content-encoding");
          out.delete("content-length");
        }
        const stream = decoder ? res.pipe(decoder) : res;
        // 압축이 깨진 응답은 본문 읽기 단계에서 오류로 끝난다(호출하는 쪽의 본문 확인 실패 처리).
        stream.on("error", () => res.destroy());
        resolve(new Response(Readable.toWeb(stream) as ReadableStream, { status, statusText: res.statusMessage, headers: out }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * fetch를 리다이렉트마다 주소를 다시 검사하며 따라간다(공인 사이트가 내부 주소로 돌려보내는 우회를 막는다).
 * 돌려주는 url은 리다이렉트를 모두 따라간 뒤의 최종 주소다.
 */
export async function guardedFetch(
  url: string,
  init: RequestInit,
  deps: { fetchImpl?: FetchImpl; resolve?: Resolver } = {}
): Promise<{ response: Response; url: string }> {
  const doFetch: FetchImpl = deps.fetchImpl ?? pinnedFetch;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url: safe, addresses } = await resolvePublicUrl(current, deps.resolve);
    const response = await doFetch(safe.href, { ...init, redirect: "manual" }, addresses);
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel().catch(() => {});
      try {
        current = new URL(location, safe).href;
      } catch {
        throw new UnsafeUrlError("리다이렉트 주소 형식");
      }
      continue;
    }
    return { response, url: safe.href };
  }
  throw new UnsafeUrlError("리다이렉트가 너무 많음");
}

export const MAX_BODY_BYTES = 3_000_000;

/**
 * 응답 본문을 최대 maxBytes까지만 읽어 문자열로 돌려준다(초과분은 버리고 연결을 닫는다).
 * 끝없이 큰 응답이 서버 메모리를 채우거나 5초 안에 못 끝나는 일을 막는다. 잘려도 오류·빈 페이지 판별에는 앞부분이면 충분하다.
 */
export async function readTextCapped(response: Response, maxBytes: number = MAX_BODY_BYTES): Promise<string> {
  const body = response.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = maxBytes - total;
      const piece = value.byteLength > room ? value.subarray(0, room) : value;
      chunks.push(piece);
      total += piece.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
