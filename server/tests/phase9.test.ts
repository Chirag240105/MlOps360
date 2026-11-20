import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p9-'));
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

test('Phase 9: governed promotion gates, controlled rollback, deployment sync, and SHA-256 rollback safety', async () => {
  await withIsolatedServer(async (baseUrl) => {
    // 1. Setup dataset -> train v1 (ridge) and v2 (gradient_boosting) -> deploy v1
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p9', days: 120, seed: 42, scenario: 'reference'}),
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
        modelName: 'retail-forecaster-p9',
        trainingRunId: run1.runId,
        initialStage: 'Candidate',
      }),
    });
    const v1 = (await reg1Res.json()) as {id: string; modelId: string; artifactPath: string};

    // Promote v1 cleanly via governed promote endpoint (no champion yet -> succeeds)
    const prom1Res = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v1.id}/promote`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reason: 'Initial validated baseline deployment'}),
    });
    assert.equal(prom1Res.status, 200);

    await fetch(`${baseUrl}/api/v1/deployments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId, modelVersionId: v1.id}),
    });

    // 2. Train v2 (gradient_boosting, stronger) and promote -> v2 enters Production, v1 archived
    const run2Res = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'gradient_boosting'}),
    });
    const run2 = (await run2Res.json()) as {runId: string};

    const reg2Res = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-forecaster-p9',
        trainingRunId: run2.runId,
        initialStage: 'Candidate',
      }),
    });
    const v2 = (await reg2Res.json()) as {id: string};

    const prom2Res = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v2.id}/promote`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reason: 'GBDT beat Ridge RMSE on chronological test set'}),
    });
    assert.equal(prom2Res.status, 200);

    // 3. Train weak v3 (ridge) -> governed /promote blocks promoting worse model without forceOverride
    const run3Res = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'ridge'}),
    });
    const run3 = (await run3Res.json()) as {runId: string};

    const reg3Res = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-forecaster-p9',
        trainingRunId: run3.runId,
        initialStage: 'Candidate',
      }),
    });
    const v3 = (await reg3Res.json()) as {id: string};

    const blockedPromRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v3.id}/promote`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reason: 'Attempt promotion of worse ridge model'}),
    });
    assert.equal(blockedPromRes.status, 422);

    // Reject v3 explicitly, then ensure rollback CANNOT target a Rejected version
    await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v3.id}/transition`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({targetStage: 'Rejected', reason: 'Inferior test RMSE'}),
    });
    const badRollbackRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/rollback`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({targetVersionId: v3.id, reason: 'Invalid rollback target test'}),
    });
    assert.equal(badRollbackRes.status, 422);

    // 4. Verify live prediction currently routes to v2 (gradient_boosting)
    const predBeforeRes = await fetch(`${baseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: '2026-08-01',
        store_id: 'STORE-01',
        sku_id: 'SKU-101',
        price: 3.5,
        discount_pct: 0.1,
        is_holiday: 0,
      }),
    });
    const predBefore = (await predBeforeRes.json()) as {versionNumber: number; algorithm: string};
    assert.equal(predBefore.versionNumber, 2);
    assert.equal(predBefore.algorithm, 'gradient_boosting');

    // 5. Execute controlled rollback (omitting targetVersionId auto-selects Archived v1)
    const rollbackRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/rollback`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        demoteCurrentTo: 'Staging',
        reason: 'Latency/drift incident on v2; restoring stable v1',
      }),
    });
    assert.equal(rollbackRes.status, 200);
    const rollback = (await rollbackRes.json()) as {
      rolledBackFromVersionId: string;
      demotedToStage: string;
      restoredVersion: {id: string; versionNumber: number; stage: string};
    };
    assert.equal(rollback.rolledBackFromVersionId, v2.id);
    assert.equal(rollback.demotedToStage, 'Staging');
    assert.equal(rollback.restoredVersion.id, v1.id);
    assert.equal(rollback.restoredVersion.versionNumber, 1);
    assert.equal(rollback.restoredVersion.stage, 'Production');

    // 6. Verify /predict immediately switches back to v1 and /deployments reflects v1
    const predAfterRes = await fetch(`${baseUrl}/api/v1/predict`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        date: '2026-08-02',
        store_id: 'STORE-01',
        sku_id: 'SKU-101',
        price: 3.5,
        discount_pct: 0.1,
        is_holiday: 0,
      }),
    });
    const predAfter = (await predAfterRes.json()) as {versionNumber: number; algorithm: string};
    assert.equal(predAfter.versionNumber, 1);
    assert.equal(predAfter.algorithm, 'ridge');

    const depsRes = await fetch(`${baseUrl}/api/v1/deployments`);
    const deps = (await depsRes.json()) as {deployments: Array<{modelVersionId: string; versionNumber: number}>};
    assert.equal(deps.deployments[0].modelVersionId, v1.id);
    assert.equal(deps.deployments[0].versionNumber, 1);

    // 7. Tampering target artifact (v2) blocks rollback to v2 with 422
    const run2DetailsRes = await fetch(`${baseUrl}/api/v1/training/runs/${run2.runId}`);
    const run2Details = (await run2DetailsRes.json()) as {artifactPath: string};
    fs.appendFileSync(run2Details.artifactPath, '\n# tampered', 'utf8');

    const tamperedRollbackRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/rollback`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({targetVersionId: v2.id, reason: 'Attempt rollback to tampered v2'}),
    });
    assert.equal(tamperedRollbackRes.status, 422);

    // Audit log records MODEL_ROLLBACK_EXECUTED
    const auditRes = await fetch(`${baseUrl}/api/v1/audit?action=MODEL_ROLLBACK_EXECUTED`);
    const auditPayload = (await auditRes.json()) as {logs: Array<{action: string; resourceId: string}>};
    assert.equal(auditPayload.logs.length, 1);
    assert.equal(auditPayload.logs[0].resourceId, v1.modelId);
  });
});
