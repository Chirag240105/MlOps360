import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p2-'));
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

test('Phase 2: generate reference dataset, inspect EDA, and run chronological baselines', async () => {
  await withIsolatedServer(async (baseUrl) => {
    // 1. Generate deterministic reference dataset (60 days * 3 stores * 4 SKUs = 720 rows)
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-sales-main', days: 60, seed: 42, scenario: 'reference'}),
    });
    assert.equal(genRes.status, 201);
    const generated = (await genRes.json()) as {
      datasetId: string;
      versionNumber: number;
      versionHash: string;
      rowCount: number;
      validationPassed: boolean;
    };
    assert.equal(generated.versionNumber, 1);
    assert.equal(generated.rowCount, 720);
    assert.equal(generated.validationPassed, true);
    assert.equal(generated.versionHash.length, 64);

    // 2. Retrieve EDA profile
    const edaRes = await fetch(`${baseUrl}/api/v1/datasets/${generated.datasetId}/eda`);
    assert.equal(edaRes.status, 200);
    const edaBody = (await edaRes.json()) as {
      eda: {cardinality: {stores: string[]; skus: string[]}};
    };
    assert.deepEqual(edaBody.eda.cardinality.stores, ['STORE-01', 'STORE-02', 'STORE-03']);
    assert.equal(edaBody.eda.cardinality.skus.length, 4);

    // 3. Run chronological baselines (Naive, 7d MA, Ridge)
    const baseRes = await fetch(`${baseUrl}/api/v1/datasets/${generated.datasetId}/baseline`, {
      method: 'POST',
    });
    assert.equal(baseRes.status, 200);
    const baseBody = (await baseRes.json()) as {
      splitSummary: {
        strategy: string;
        trainDateRange: {end: string};
        valDateRange: {start: string; end: string};
        testDateRange: {start: string};
      };
      models: Array<{name: string; test: {rmse: number; mae: number; r2: number}}>;
    };
    assert.equal(baseBody.splitSummary.strategy, 'chronological_date_split');
    assert.ok(baseBody.splitSummary.trainDateRange.end < baseBody.splitSummary.valDateRange.start);
    assert.ok(baseBody.splitSummary.valDateRange.end < baseBody.splitSummary.testDateRange.start);

    const naive = baseBody.models.find((m) => m.name.includes('Naive'));
    const ridge = baseBody.models.find((m) => m.name.includes('Ridge'));
    assert.ok(naive && ridge);
    assert.ok(ridge.test.rmse < naive.test.rmse, 'Ridge baseline should outperform Naive Lag-1');
  });
});

test('Phase 2: corrupted dataset fails validation and blocks baseline training', async () => {
  await withIsolatedServer(async (baseUrl) => {
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-corrupted', days: 40, seed: 7, scenario: 'corrupted'}),
    });
    assert.equal(genRes.status, 201);
    const generated = (await genRes.json()) as {datasetId: string; validationPassed: boolean};
    assert.equal(generated.validationPassed, false);

    // Training MUST be blocked with 422 POLICY_VIOLATION
    const baseRes = await fetch(`${baseUrl}/api/v1/datasets/${generated.datasetId}/baseline`, {
      method: 'POST',
    });
    assert.equal(baseRes.status, 422);
    const errBody = (await baseRes.json()) as {error: {code: string}};
    assert.equal(errBody.error.code, 'POLICY_VIOLATION');
  });
});

test('Phase 2: CSV ingestion endpoint validates schema and computes checksum', async () => {
  await withIsolatedServer(async (baseUrl) => {
    const badCsv = 'date,store_id,price\n2026-01-01,STORE-01,3.50\n';
    const res = await fetch(`${baseUrl}/api/v1/datasets/ingest`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'bad-upload', csvContent: badCsv}),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {validationPassed: boolean; checks: Array<{rule: string; passed: boolean}>};
    assert.equal(body.validationPassed, false);
    const schemaCheck = body.checks.find((c) => c.rule === 'schema_required_columns');
    assert.equal(schemaCheck?.passed, false);
  });
});
