import type { LoomDocument } from "./types";

const HASH_PREFIX = "#doc=";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// TS's DOM lib types CompressionStream/DecompressionStream against a
// BufferSource-flavored pair that doesn't line up with ReadableStream<Uint8Array>
// despite both being valid at runtime — cast through the pair type they
// actually implement.
type BytePair = ReadableWritablePair<Uint8Array, Uint8Array>;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = toStream(bytes).pipeThrough(new CompressionStream("gzip") as unknown as BytePair);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = toStream(bytes).pipeThrough(new DecompressionStream("gzip") as unknown as BytePair);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Encodes a document entirely into the URL's fragment (the part after `#`).
 * Fragments are never sent in HTTP requests — the browser keeps them local —
 * so a shared link carries the document without any server ever seeing its
 * contents. Good enough for Loom-sized JSON (a few KB); if a document is
 * ever too large to comfortably fit in a URL, that's the signal to add a
 * server-side (ideally client-encrypted) store instead of stretching this.
 */
export async function encodeDocToShareUrl(doc: LoomDocument): Promise<string> {
  const json = JSON.stringify(doc);
  const compressed = await gzip(new TextEncoder().encode(json));
  const encoded = bytesToBase64Url(compressed);
  return `${location.origin}${location.pathname}${HASH_PREFIX}${encoded}`;
}

/** Reads a document out of the current page's URL fragment, if present. */
export async function decodeDocFromLocationHash(): Promise<LoomDocument | null> {
  if (!location.hash.startsWith(HASH_PREFIX)) return null;
  const encoded = location.hash.slice(HASH_PREFIX.length);
  if (!encoded) return null;
  const compressed = base64UrlToBytes(encoded);
  const json = new TextDecoder().decode(await gunzip(compressed));
  return JSON.parse(json) as LoomDocument;
}
