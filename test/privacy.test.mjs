import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_RECIPE } from '../src/engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fakeEnvKey = 'apikey_ENV_SENTINEL_MUST_NOT_CONFIGURE_VISITORS';
const fakeVisitorKeyA = 'apikey_VISITOR_A_FAKE_NEVER_USE_FOR_SDK';
const fakeVisitorKeyB = 'apikey_VISITOR_B_FAKE_NEVER_USE_FOR_SDK';

async function unusedPort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()));
  return port;
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([exited, delay(2000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await Promise.race([exited, delay(2000)]);
  }
}

test('生产服务按访客隔离密钥和店铺，并保护接口与静态文件', { timeout: 20000 }, async () => {
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs', '--production'], {
    cwd: root,
    env: { ...process.env, BURGER_PORT: String(port), TYPESAFE_API_KEY: fakeEnvKey },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk.toString(); });

  async function request(path, { method = 'GET', cookie, data, origin } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(3000),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { response, text, json };
  }

  try {
    const deadline = Date.now() + 5000;
    while (true) {
      if (child.exitCode !== null) throw new Error(`服务提前退出：${output.replaceAll(fakeEnvKey, '[fake key]')}`);
      try { await request('/api/health'); break; }
      catch (error) {
        if (Date.now() > deadline) throw new Error(`服务未启动：${error.message}；${output.replaceAll(fakeEnvKey, '[fake key]')}`);
        await delay(60);
      }
    }

    const firstA = await request('/api/health');
    const firstB = await request('/api/health');
    const cookieA = firstA.response.headers.get('set-cookie')?.split(';', 1)[0];
    const cookieB = firstB.response.headers.get('set-cookie')?.split(';', 1)[0];
    for (const first of [firstA, firstB]) {
      assert.equal(first.response.status, 200);
      assert.equal(first.json?.ok, true);
      assert.equal(first.json?.configured, false, '环境变量中的假密钥不能自动配置访客');
      const setCookie = first.response.headers.get('set-cookie') ?? '';
      assert.match(setCookie, /jev_burger_session=/);
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Strict/i);
    }
    assert.ok(cookieA && cookieB);
    assert.notEqual(cookieA, cookieB);

    const configuredA = await request('/api/key', { method: 'POST', cookie: cookieA, data: { key: fakeVisitorKeyA } });
    assert.equal(configuredA.response.status, 200);
    assert.equal(configuredA.json?.configured, true);
    assert.equal(configuredA.text.includes(fakeVisitorKeyA), false, '密钥不能回显');
    assert.equal((await request('/api/health', { cookie: cookieA })).json?.configured, true);
    assert.equal((await request('/api/health', { cookie: cookieB })).json?.configured, false);

    const configuredB = await request('/api/key', { method: 'POST', cookie: cookieB, data: { key: fakeVisitorKeyB } });
    assert.equal(configuredB.response.status, 200);
    assert.equal(configuredB.text.includes(fakeVisitorKeyB), false);
    assert.equal((await request('/api/health', { cookie: cookieB })).json?.configured, true);
    assert.equal((await request('/api/health', { cookie: cookieA })).json?.configured, true);

    const shopA = await request('/api/shop', { method: 'POST', cookie: cookieA, data: {} });
    assert.equal(shopA.response.status, 201);
    const idA = shopA.json?.id;
    assert.ok(idA);
    assert.equal((await request(`/api/shop/${idA}`, { cookie: cookieA })).response.status, 200);
    assert.equal((await request(`/api/shop/${idA}`, { cookie: cookieB })).response.status, 404);
    assert.equal((await request('/api/rush', { method: 'POST', cookie: cookieB, data: { id: idA, version: 0 } })).response.status, 404);
    assert.equal((await request('/api/order', { method: 'POST', cookie: cookieB, data: { id: idA, version: 0, recipe: DEFAULT_RECIPE } })).response.status, 404);
    assert.equal((await request(`/api/shop/${idA}`, { cookie: cookieA })).json?.version, 0);

    const deletedB = await request('/api/key', { method: 'DELETE', cookie: cookieB });
    assert.equal(deletedB.response.status, 200);
    assert.equal(deletedB.json?.configured, false);
    assert.equal(deletedB.text.includes(fakeVisitorKeyB), false);
    assert.equal((await request('/api/health', { cookie: cookieB })).json?.configured, false);
    assert.equal((await request('/api/health', { cookie: cookieA })).json?.configured, true);

    const shopB = await request('/api/shop', { method: 'POST', cookie: cookieB, data: {} });
    assert.equal(shopB.response.status, 201);
    const idB = shopB.json?.id;
    assert.ok(idB);
    assert.equal((await request(`/api/shop/${idB}`, { cookie: cookieA })).response.status, 404);
    const rush = await request('/api/rush', { method: 'POST', cookie: cookieB, data: { id: idB, version: 0 } });
    assert.equal(rush.response.status, 200, '高峰演示不需要模型密钥');
    const beforeStep = await request(`/api/shop/${idB}`, { cookie: cookieB });
    const step = await request('/api/step', { method: 'POST', cookie: cookieB, data: { id: idB, version: beforeStep.json.version } });
    assert.equal(step.response.status, 401, '无密钥时必须在 SDK 调用前拒绝');
    assert.equal((await request(`/api/shop/${idB}`, { cookie: cookieB })).json?.version, beforeStep.json.version);

    const structured = await request('/api/order', { method: 'POST', cookie: cookieB, data: { id: idB, version: beforeStep.json.version, recipe: DEFAULT_RECIPE } });
    assert.equal(structured.response.status, 200, '结构化点单不需要模型密钥');
    const chinese = await request('/api/order', { method: 'POST', cookie: cookieB, data: { id: idB, version: structured.json.version, text: '一个牛肉汉堡' } });
    assert.equal(chinese.response.status, 401, '自然语言点单无密钥时不能调用 SDK');

    const hostileOrigin = 'https://other.example';
    for (const [path, method, data] of [
      ['/api/key', 'POST', { key: fakeVisitorKeyA }],
      ['/api/shop', 'POST', {}],
      ['/api/rush', 'POST', { id: idB, version: structured.json.version }],
      ['/api/key', 'DELETE', undefined],
    ]) {
      const blocked = await request(path, { method, cookie: cookieB, data, origin: hostileOrigin });
      assert.equal(blocked.response.status, 403, `${method} ${path} 应拒绝跨来源请求`);
    }
    assert.equal((await request('/api/health', { cookie: cookieB })).json?.configured, false);

    for (const path of ['/logs/server.log', '/.env', '/server.mjs', '/.git/config', '/src/engine.js', '/test/engine.test.mjs']) {
      const staticResponse = await request(path);
      assert.equal(staticResponse.response.status, 404, `${path} 不属于 dist，不能下载`);
    }
    assert.equal((await request('/')).response.status, 200, 'dist 首页应可访问');
  } finally {
    await stop(child);
  }
});
