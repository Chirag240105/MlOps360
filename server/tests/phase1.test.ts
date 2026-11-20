import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';
import {loadConfig} from '../core/config.ts';
import {ValidationError} from '../core/errors.ts';

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p1-'));
  const app = createApiApp({
    dbPath: path.join(tmpDir, 'test.db'),
    artifactRoot: path.join(tmpDir, 'artifacts'),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral test port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    // Windows: explicitly close SQLite connection so WAL/SHM file handles are released
    app.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

test('loadConfig parses defaults and validates bad inputs', () => {
  const cfg = loadConfig({PORT: '4000', LOG_LEVEL: 'DEBUG', DRIFT_PSI_THRESHOLD: '0.25'});
  assert.equal(cfg.port, 4000);
  assert.equal(cfg.logLevel, 'DEBUG');
  assert.equal(cfg.driftPsiThreshold, 0.25);

  assert.throws(() => loadConfig({LOG_LEVEL: 'VERBOSE'}), /Invalid LOG_LEVEL/);
  assert.throws(() => loadConfig({PORT: '-5'}), /Invalid environment configuration for PORT/);
});

test('ValidationError carries 400 status code and structured code', () => {
  const err = new ValidationError('Invalid feature column', {column: 'price'});
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.deepEqual(err.details, {column: 'price'});
});

test('GET /api/v1/health returns healthy status and propagates X-Request-ID', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {'X-Request-ID': 'phase1-test-req-001'},
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-request-id'), 'phase1-test-req-001');

    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.status, 'healthy');
    assert.equal(body.service, 'ModelOps360');
    assert.equal(body.requestId, 'phase1-test-req-001');
  });
});

test('GET /api/v1/system/architecture exposes planes and lifecycle states', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/system/architecture`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as {
      planes: Array<{name: string}>;
      governanceDefaults: {lifecycleStates: string[]};
    };
    assert.equal(body.planes.length, 4);
    assert.deepEqual(body.governanceDefaults.lifecycleStates, [
      'Development',
      'Candidate',
      'Staging',
      'Production',
      'Archived',
      'Rejected',
    ]);
  });
});

test('Unknown /api route returns structured 404 JSON error', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/v1/nonexistent`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as {error: {code: string}};
    assert.equal(body.error.code, 'ROUTE_NOT_FOUND');
  });
});
