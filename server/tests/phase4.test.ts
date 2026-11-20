import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p4-'));
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

test('Phase 4: experiment tracking, 6-state governance lifecycle, comparison, and audit logs', async () => {
  await withIsolatedServer(async (baseUrl) => {
    // 1. Generate clean retail dataset
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p4', days: 120, seed: 42, scenario: 'reference'}),
    });
    assert.equal(genRes.status, 201);
    const ds = (await genRes.json()) as {datasetId: string};

    // 2. Train Ridge (v1) and Gradient Boosting (v2)
    const run1Res = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        datasetId: ds.datasetId,
        algorithm: 'ridge',
        experimentName: 'retail-demand-p4',
      }),
    });
    assert.equal(run1Res.status, 201);
    const run1 = (await run1Res.json()) as {runId: string; mlflowRunId: string; artifactPath: string};
    assert.ok(run1.mlflowRunId);

    const run2Res = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        datasetId: ds.datasetId,
        algorithm: 'gradient_boosting',
        experimentName: 'retail-demand-p4',
      }),
    });
    assert.equal(run2Res.status, 201);
    const run2 = (await run2Res.json()) as {runId: string; mlflowRunId: string};

    // Verify experiment runs were recorded
    const expRes = await fetch(`${baseUrl}/api/v1/experiments`);
    assert.equal(expRes.status, 200);
    const expBody = (await expRes.json()) as {experiments: Array<{name: string; runCount: number}>};
    assert.equal(expBody.experiments[0].name, 'retail-demand-p4');
    assert.equal(expBody.experiments[0].runCount, 2);

    // 3. Direct registration into Production must be blocked
    const badRegRes = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-demand-forecaster',
        trainingRunId: run1.runId,
        initialStage: 'Production',
      }),
    });
    assert.equal(badRegRes.status, 422);

    // 4. Register v1 cleanly in Development
    const reg1Res = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-demand-forecaster',
        trainingRunId: run1.runId,
      }),
    });
    assert.equal(reg1Res.status, 201);
    const v1 = (await reg1Res.json()) as {id: string; modelId: string; stage: string; versionNumber: number};
    assert.equal(v1.stage, 'Development');
    assert.equal(v1.versionNumber, 1);

    // 5. Illegal skip Development -> Production must fail with 422
    const skipRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v1.id}/transition`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({targetStage: 'Production'}),
    });
    assert.equal(skipRes.status, 422);

    // 6. Valid progression Development -> Candidate -> Staging -> Production
    for (const targetStage of ['Candidate', 'Staging', 'Production']) {
      const trRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v1.id}/transition`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage, actor: 'alice@modelops.io', reason: `Promote to ${targetStage}`}),
      });
      assert.equal(trRes.status, 200);
    }

    // 7. Register v2, promote to Production, and verify v1 is atomically Archived
    const reg2Res = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-demand-forecaster',
        trainingRunId: run2.runId,
        initialStage: 'Candidate',
      }),
    });
    assert.equal(reg2Res.status, 201);
    const v2 = (await reg2Res.json()) as {id: string; modelId: string; versionNumber: number};
    assert.equal(v2.versionNumber, 2);

    for (const targetStage of ['Staging', 'Production']) {
      const trRes = await fetch(`${baseUrl}/api/v1/models/${v2.modelId}/versions/${v2.id}/transition`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage, actor: 'release-bot'}),
      });
      assert.equal(trRes.status, 200);
    }

    const detailRes = await fetch(`${baseUrl}/api/v1/models/${v2.modelId}`);
    const details = (await detailRes.json()) as {
      productionVersionId: string;
      versions: Array<{id: string; stage: string}>;
    };
    assert.equal(details.productionVersionId, v2.id);
    const v1After = details.versions.find((v) => v.id === v1.id);
    const v2After = details.versions.find((v) => v.id === v2.id);
    assert.equal(v1After?.stage, 'Archived');
    assert.equal(v2After?.stage, 'Production');

    // 8. Compare v1 vs v2
    const cmpRes = await fetch(
      `${baseUrl}/api/v1/models/${v2.modelId}/compare?baseline=${v1.id}&challenger=${v2.id}`,
    );
    assert.equal(cmpRes.status, 200);
    const cmp = (await cmpRes.json()) as {comparison: {challengerBeatsBaselineOnRmse: boolean}};
    assert.equal(cmp.comparison.challengerBeatsBaselineOnRmse, true);

    // 9. Verify audit trail recorded transitions
    const auditRes = await fetch(`${baseUrl}/api/v1/audit`);
    assert.equal(auditRes.status, 200);
    const audit = (await auditRes.json()) as {logs: Array<{action: string}>};
    assert.ok(audit.logs.some((l) => l.action === 'MODEL_PROMOTED_TO_PRODUCTION'));

    // 10. Tamper with v1 artifact on disk and verify promotion back to Production is blocked!
    fs.appendFileSync(run1.artifactPath, ' ');
    const tamperedPromote = await fetch(
      `${baseUrl}/api/v1/models/${v1.modelId}/versions/${v1.id}/transition`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage: 'Production'}),
      },
    );
    assert.equal(tamperedPromote.status, 422);
  });
});
