import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the branded application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Rumbo al 9 de Mayo<\/title>/i);
  assert.match(html, /rumbo-logo\.png/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /Preparando tu espacio de trabajo/);
  assert.match(html, /lang="es"/);
});

test("ships the multi-organization modules and brand asset", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    access(new URL("../public/rumbo-logo.png", import.meta.url)),
  ]);
  assert.match(page, /Administración/);
  assert.match(page, /organization_id/);
  assert.match(page, /Reclamos vecinales/);
  assert.match(page, /Nueva sede/);
  assert.match(css, /--navy:#2d2d49/);
  assert.match(css, /--sun:#ffad4d/);
  assert.match(css, /--sky:#78c4e8/);
});
