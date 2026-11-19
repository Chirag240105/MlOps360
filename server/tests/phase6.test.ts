import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p6-'));
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
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

test('Phase 6: dynamic Production resolution, single/batch predict, ground-truth, and metrics', async () => {
  await withIsolatedServer(async (baseUrl) => {
    // 1. Prediction fails safely when no Production model exists
    const noModelRes = await fetch(`${baseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: '2026-05-01',
        store_id: 'STORE-01',
        sku_id: 'SKU-101',
        price: 3.5,
        discount_pct: 0.1,
        is_holiday: 0,
      }),
    });
    assert.equal(noModelRes.status, 422);

    // 2. Generate dataset, train Ridge (v1) and Random Forest (v2), promote v1 -> Production
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p6', days: 120, seed: 42, scenario: 'reference'}),
    });
    const ds = (await genRes.json()) as {datasetId: string};

    const run1Res = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'ridge'}),
    });
    const run1 = (await run1Res.json()) as {runId: string};

    const reg1Res = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-forecaster-p6',
        trainingRunId: run1.runId,
        initialStage: 'Candidate',
      }),
    });
    const v1 = (await reg1Res.json()) as {id: string; modelId: string};

    for (const stage of ['Staging', 'Production']) {
      await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v1.id}/transition`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage: stage}),
      });
    }

    // Create explicit deployment
    const depRes = await fetch(`${baseUrl}/api/v1/deployments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId, modelVersionId: v1.id}),
    });
    assert.equal(depRes.status, 201);

    // 3. Invalid payload returns 400 VALIDATION_ERROR
    const badRes = await fetch(`${baseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: '2026-05-01',
        store_id: 'STORE-01',
        sku_id: 'SKU-101',
        price: -10,
        discount_pct: 0.1,
        is_holiday: 0,
      }),
    });
    assert.equal(badRes.status, 400);

    // 4. Single prediction resolves v1 dynamically
    const predRes = await fetch(`${baseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Request-ID': 'req-p6-001'},
      body: JSON.stringify({
        date: '2026-05-01',
        store_id: 'STORE-01',
        sku_id: 'SKU-101',
        price: 3.5,
        discount_pct: 0.15,
        is_holiday: 0,
      }),
    });
    assert.equal(predRes.status, 200);
    const pred = (await predRes.json()) as {
      predictionId: string;
      requestId: string;
      versionNumber: number;
      algorithm: string;
      predictedUnits: number;
      latencyMs: number;
    };
    assert.equal(pred.requestId, 'req-p6-001');
    assert.equal(pred.versionNumber, 1);
    assert.equal(pred.algorithm, 'ridge');
    assert.ok(pred.predictedUnits > 0);
    assert.ok(pred.latencyMs > 0);

    // 5. Batch prediction
    const batchRes = await fetch(`${baseUrl}/api/v1/predict/batch`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        records: [
          {date: '2026-05-02', store_id: 'STORE-01', sku_id: 'SKU-101', price: 3.5, discount_pct: 0.0, is_holiday: 0},
          {date: '2026-05-02', store_id: 'STORE-02', sku_id: 'SKU-103', price: 4.2, discount_pct: 0.2, is_holiday: 1},
        ],
      }),
    });
    assert.equal(batchRes.status, 200);
    const batch = (await batchRes.json()) as {count: number; predictions: Array<{predictionId: string}>};
    assert.equal(batch.count, 2);

    // 6. Reconcile ground truth and inspect /predictions/:id + /metrics
    const gtRes = await fetch(`${baseUrl}/api/v1/predictions/ground-truth`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({updates: [{predictionId: pred.predictionId, actualUnits: 58}]}),
    });
    assert.equal(gtRes.status, 200);
    assert.equal(((await gtRes.json()) as {updatedCount: number}).updatedCount, 1);

    const detailRes = await fetch(`${baseUrl}/api/v1/predictions/${pred.predictionId}`);
    assert.equal(detailRes.status, 200);
    const detail = (await detailRes.json()) as {actualUnits: number};
    assert.equal(detail.actualUnits, 58);

    // 7. Train & promote v2 (random_forest) -> /predict automatically switches to v2!
    const run2Res = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'random_forest'}),
    });
    const run2 = (await run2Res.json()) as {runId: string};

    const reg2Res = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-forecaster-p6',
        trainingRunId: run2.runId,
        initialStage: 'Candidate',
      }),
    });
    const v2 = (await reg2Res.json()) as {id: string; modelId: string};
    for (const stage of ['Staging', 'Production']) {
      await fetch(`${baseUrl}/api/v1/models/${v2.modelId}/versions/${v2.id}/transition`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage: stage}),
      });
    }

    const pred2Res = await fetch(`${baseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: '2026-05-03',
        store_id: 'STORE-01',
        sku_id: 'SKU-101',
        price: 3.5,
        discount_pct: 0.1,
        is_holiday: 0,
      }),
    });
    assert.equal(pred2Res.status, 200);
    const pred2 = (await pred2Res.json()) as {versionNumber: number; algorithm: string};
    assert.equal(pred2.versionNumber, 2);
    assert.equal(pred2.algorithm, 'random_forest');

    const metricsRes = await fetch(`${baseUrl}/api/v1/metrics`);
    assert.equal(metricsRes.status, 200);
    const metrics = (await metricsRes.json()) as {
      totalPredictions: number;
      labeledPredictions: number;
      failedRequests: number;
    };
    assert.equal(metrics.totalPredictions, 4);
    assert.equal(metrics.labeledPredictions, 1);
    assert.equal(metrics.failedRequests, 2); // noModelRes + badRes
  });
});
