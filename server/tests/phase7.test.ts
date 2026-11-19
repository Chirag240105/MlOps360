import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p7-'));
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

test('Phase 7: healthy vs covariate drift vs ground-truth performance degradation & event acknowledgement', async () => {
  await withIsolatedServer(async (baseUrl) => {
    // 1. Setup reference dataset -> train ridge -> register -> promote to Production
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p7-ref', days: 120, seed: 42, scenario: 'reference'}),
    });
    assert.equal(genRes.status, 201);
    const ds = (await genRes.json()) as {datasetId: string};

    const trainRes = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'ridge'}),
    });
    assert.equal(trainRes.status, 201);
    const run = (await trainRes.json()) as {runId: string};

    const regRes = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-forecaster-p7',
        trainingRunId: run.runId,
        initialStage: 'Candidate',
      }),
    });
    assert.equal(regRes.status, 201);
    const ver = (await regRes.json()) as {id: string; modelId: string};

    for (const targetStage of ['Staging', 'Production']) {
      const trRes = await fetch(`${baseUrl}/api/v1/models/${ver.modelId}/versions/${ver.id}/transition`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage}),
      });
      assert.equal(trRes.status, 200);
    }

    // 2. Send healthy reference-like production traffic (7 days x 3 stores x 4 SKUs = 84 records)
    const skuPrices = [
      {sku: 'SKU-101', price: 3.5},
      {sku: 'SKU-102', price: 2.8},
      {sku: 'SKU-103', price: 4.2},
      {sku: 'SKU-104', price: 5.0},
    ];
    const stores = ['STORE-01', 'STORE-02', 'STORE-03'];
    const healthyDiscounts = [0.06, 0.11, 0.17, 0.23];
    const healthyRecords: Array<Record<string, unknown>> = [];
    for (let day = 0; day < 7; day++) {
      const dateStr = `2026-06-${day + 1 < 10 ? `0${day + 1}` : `${day + 1}`}`;
      for (let stIdx = 0; stIdx < stores.length; stIdx++) {
        for (let sIdx = 0; sIdx < skuPrices.length; sIdx++) {
          const idx = day * 12 + stIdx * 4 + sIdx;
          const jitter = ((idx % 5) - 2) * 0.025;
          healthyRecords.push({
            date: dateStr,
            store_id: stores[stIdx],
            sku_id: skuPrices[sIdx].sku,
            price: Number((skuPrices[sIdx].price * (1 + jitter)).toFixed(2)),
            discount_pct: idx % 5 === 0 ? healthyDiscounts[(idx / 5) % healthyDiscounts.length] : 0.0,
            is_holiday: 0,
          });
        }
      }
    }
    const healthyPredRes = await fetch(`${baseUrl}/api/v1/predict/batch`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({records: healthyRecords}),
    });
    assert.equal(healthyPredRes.status, 200);

    const monHealthyRes = await fetch(`${baseUrl}/api/v1/monitoring/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: ver.modelId, windowLimit: healthyRecords.length}),
    });
    assert.equal(monHealthyRes.status, 201);
    const monHealthy = (await monHealthyRes.json()) as {
      overallStatus: string;
      dataDriftDetected: boolean;
      performanceDegraded: boolean;
      eventsCreated: unknown[];
    };
    assert.equal(monHealthy.overallStatus, 'HEALTHY');
    assert.equal(monHealthy.dataDriftDetected, false);
    assert.equal(monHealthy.performanceDegraded, false);
    assert.equal(monHealthy.eventsCreated.length, 0);

    // 3. Send heavily drifted pricing + aggressive promotion traffic WITHOUT labels yet
    const driftedRecords = Array.from({length: 15}, (_, i) => ({
      date: `2026-07-${1 + i < 10 ? `0${1 + i}` : `${1 + i}`}`,
      store_id: 'STORE-01',
      sku_id: 'SKU-101',
      price: Number((7.5 + i * 0.1).toFixed(2)),
      discount_pct: 0.45,
      is_holiday: 0,
    }));
    const driftedPredRes = await fetch(`${baseUrl}/api/v1/predict/batch`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({records: driftedRecords}),
    });
    assert.equal(driftedPredRes.status, 200);
    const driftedPred = (await driftedPredRes.json()) as {
      predictions: Array<{predictionId: string; predictedUnits: number}>;
    };

    const monDriftRes = await fetch(`${baseUrl}/api/v1/monitoring/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: ver.modelId, windowLimit: 15}),
    });
    assert.equal(monDriftRes.status, 201);
    const monDrift = (await monDriftRes.json()) as {
      overallStatus: string;
      dataDriftDetected: boolean;
      performanceDegraded: boolean;
      driftedFeatures: string[];
      eventsCreated: Array<{id: string; driftType: string}>;
    };
    assert.equal(monDrift.overallStatus, 'COVARIATE_DRIFT_WARNING');
    assert.equal(monDrift.dataDriftDetected, true);
    assert.equal(monDrift.performanceDegraded, false);
    assert.ok(monDrift.driftedFeatures.includes('price'));
    assert.ok(monDrift.driftedFeatures.includes('discount_pct'));
    assert.ok(monDrift.eventsCreated.some((e) => e.driftType === 'DATA_DRIFT'));

    // 4. Reconcile delayed ground truth showing severe forecast error => PERFORMANCE_DEGRADED
    const gtRes = await fetch(`${baseUrl}/api/v1/predictions/ground-truth`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        updates: driftedPred.predictions.map((p) => ({
          predictionId: p.predictionId,
          actualUnits: Number((p.predictedUnits + 65).toFixed(2)),
        })),
      }),
    });
    assert.equal(gtRes.status, 200);

    const monPerfRes = await fetch(`${baseUrl}/api/v1/monitoring/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: ver.modelId, windowLimit: 15}),
    });
    assert.equal(monPerfRes.status, 201);
    const monPerf = (await monPerfRes.json()) as {
      overallStatus: string;
      performanceDegraded: boolean;
      livePerformance: {rmse: number; baselineRmse: number; degraded: boolean} | null;
      eventsCreated: Array<{id: string; driftType: string; severity: string}>;
    };
    assert.equal(monPerf.overallStatus, 'PERFORMANCE_DEGRADED');
    assert.equal(monPerf.performanceDegraded, true);
    assert.ok(monPerf.livePerformance && monPerf.livePerformance.rmse > monPerf.livePerformance.baselineRmse * 1.25);
    const criticalEvent = monPerf.eventsCreated.find((e) => e.driftType === 'PERFORMANCE_DEGRADATION');
    assert.ok(criticalEvent);
    assert.equal(criticalEvent.severity, 'CRITICAL');

    // 5. Inspect reports & unacknowledged drift events, then acknowledge one
    const reportsRes = await fetch(`${baseUrl}/api/v1/monitoring/reports?modelId=${ver.modelId}`);
    assert.equal(reportsRes.status, 200);
    const reportsPayload = (await reportsRes.json()) as {reports: Array<{reportId: string}>};
    assert.equal(reportsPayload.reports.length, 3);

    const unackBeforeRes = await fetch(
      `${baseUrl}/api/v1/monitoring/drift-events?modelId=${ver.modelId}&acknowledged=false`,
    );
    const unackBefore = (await unackBeforeRes.json()) as {events: Array<{id: string}>};
    assert.ok(unackBefore.events.length >= 2);

    const ackRes = await fetch(`${baseUrl}/api/v1/monitoring/drift-events/${criticalEvent.id}/acknowledge`, {
      method: 'POST',
    });
    assert.equal(ackRes.status, 200);
    assert.equal(((await ackRes.json()) as {acknowledged: boolean}).acknowledged, true);

    const unackAfterRes = await fetch(
      `${baseUrl}/api/v1/monitoring/drift-events?modelId=${ver.modelId}&acknowledged=false`,
    );
    const unackAfter = (await unackAfterRes.json()) as {events: Array<{id: string}>};
    assert.equal(unackAfter.events.length, unackBefore.events.length - 1);
  });
});
