import { test } from "node:test";
import assert from "node:assert/strict";
import { extractIconCandidates, normalizeSiteUrl } from "./favicon.js";

test("normalizeSiteUrl adds https and rejects non-web schemes", () => {
  assert.equal(normalizeSiteUrl("github.com")?.toString(), "https://github.com/");
  assert.equal(normalizeSiteUrl("http://x.test/a")?.toString(), "http://x.test/a");
  assert.equal(normalizeSiteUrl("file:///etc/passwd"), null);
  assert.equal(normalizeSiteUrl("javascript:alert(1)"), null);
  assert.equal(normalizeSiteUrl("   "), null);
  assert.equal(normalizeSiteUrl("example.com:8080")?.host, "example.com:8080");
});

test("extractIconCandidates ranks svg, then largest size, and resolves relative hrefs", () => {
  const html = `
    <link rel="stylesheet" href="/app.css">
    <link rel="icon" href="/favicon-16.png" sizes="16x16">
    <link href='/icon-192.png' rel='icon' sizes='192x192'>
    <link rel="apple-touch-icon" href="touch.png">
    <link rel="shortcut icon" href="/favicon.ico">
    <link rel="mask-icon" href="/mask.svg">
    <link rel="icon" type="image/svg+xml" href="https://cdn.test/logo.svg">`;
  const hrefs = extractIconCandidates(html, "https://site.test/docs/").map((c) => c.href);
  assert.deepEqual(hrefs, [
    "https://cdn.test/logo.svg",
    "https://site.test/icon-192.png",
    "https://site.test/docs/touch.png",
    "https://site.test/favicon-16.png",
    "https://site.test/favicon.ico",
  ]);
});

test("extractIconCandidates drops non-http hrefs", () => {
  const html = `<link rel="icon" href="data:image/png;base64,AAAA">`;
  assert.deepEqual(extractIconCandidates(html, "https://a.test/"), []);
});
