import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p3-'));
  const app = createApiApp({
    dbPath: path.join(tmpDir, 'test.db'),
    artifactRoot: path.join(tmpDir, 'artifacts'),
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral port');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    app.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

test('Phase 3: reproducible auto training pipeline tunes models and persists SHA-256 artifact', async () => {
  await withIsolatedServer(async (baseUrl) => {
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p3-main', days: 120, seed: 42, scenario: 'reference'}),
    });
    assert.equal(genRes.status, 201);
    const ds = (await genRes.json()) as {datasetId: string; versionHash: string};

    const trainRes = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'auto', seed: 42}),
    });
    assert.equal(trainRes.status, 201);
    const run = (await trainRes.json()) as {
      runId: string;
      algorithm: string;
      datasetVersionHash: string;
      artifactPath: string;
      artifactSha256: string;
      testMetrics: {rmse: number; r2: number};
      candidatesEvaluated: Array<{algorithm: string}>;
    };

    assert.equal(run.datasetVersionHash, ds.versionHash);
    assert.equal(run.artifactSha256.length, 64);
    assert.ok(fs.existsSync(run.artifactPath));
    assert.equal(run.candidatesEvaluated.length, 3);
    assert.ok(run.testMetrics.r2 > 0.75);

    const listRes = await fetch(`${baseUrl}/api/v1/training/runs`);
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as {runs: Array<{runId: string}>};
    assert.equal(listBody.runs.length, 1);
    assert.equal(listBody.runs[0].runId, run.runId);

    const detailRes = await fetch(`${baseUrl}/api/v1/training/runs/${run.runId}`);
    assert.equal(detailRes.status, 200);
  });
});

test('Phase 3: training pipeline blocks corrupted datasets with 422 POLICY_VIOLATION', async () => {
  await withIsolatedServer(async (baseUrl) => {
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p3-corrupt', days: 40, seed: 9, scenario: 'corrupted'}),
    });
    assert.equal(genRes.status, 201);
    const ds = (await genRes.json()) as {datasetId: string};

    const trainRes = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'random_forest'}),
    });
    assert.equal(trainRes.status, 422);
  });
});
