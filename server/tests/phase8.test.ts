import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';

async function withIsolatedServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p8-'));
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

test('Phase 8: retraining policy evaluation, idempotency, cooldown, Challenger win/reject, and circuit breaker', async () => {
  await withIsolatedServer(async (baseUrl) => {
    // 1. Setup dataset -> train weak baseline (ridge) -> register -> promote v1 to Production + deploy
    const genRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p8', days: 120, seed: 42, scenario: 'reference'}),
    });
    assert.equal(genRes.status, 201);
    const ds = (await genRes.json()) as {datasetId: string};

    const trainRes = await fetch(`${baseUrl}/api/v1/training/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({datasetId: ds.datasetId, algorithm: 'ridge'}),
    });
    const run1 = (await trainRes.json()) as {runId: string};

    const regRes = await fetch(`${baseUrl}/api/v1/models/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelName: 'retail-forecaster-p8',
        trainingRunId: run1.runId,
        initialStage: 'Candidate',
      }),
    });
    const v1 = (await regRes.json()) as {id: string; modelId: string};

    for (const targetStage of ['Staging', 'Production']) {
      await fetch(`${baseUrl}/api/v1/models/${v1.modelId}/versions/${v1.id}/transition`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({targetStage}),
      });
    }

    await fetch(`${baseUrl}/api/v1/deployments`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId, modelVersionId: v1.id}),
    });

    // 2. Policy denies automated trigger when no monitoring degradation exists
    const evalHealthyRes = await fetch(`${baseUrl}/api/v1/retraining/evaluate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId}),
    });
    assert.equal(evalHealthyRes.status, 200);
    const evalHealthy = (await evalHealthyRes.json()) as {eligible: boolean; blockedBy: string};
    assert.equal(evalHealthy.eligible, false);
    assert.equal(evalHealthy.blockedBy, 'NO_TRIGGER_SIGNAL');

    const blockedAutoRes = await fetch(`${baseUrl}/api/v1/retraining/trigger`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId, triggerType: 'PERFORMANCE_POLICY'}),
    });
    assert.equal(blockedAutoRes.status, 422);

    // 3. Simulate degraded production traffic + bad ground truth -> Monitoring flags PERFORMANCE_DEGRADED
    const batchRes = await fetch(`${baseUrl}/api/v1/predict/batch`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        records: Array.from({length: 10}, (_, i) => ({
          date: `2026-07-${10 + i}`,
          store_id: 'STORE-01',
          sku_id: 'SKU-101',
          price: 7.2,
          discount_pct: 0.4,
          is_holiday: 0,
        })),
      }),
    });
    const batch = (await batchRes.json()) as {predictions: Array<{predictionId: string; predictedUnits: number}>};

    await fetch(`${baseUrl}/api/v1/predictions/ground-truth`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        updates: batch.predictions.map((p) => ({
          predictionId: p.predictionId,
          actualUnits: Number((p.predictedUnits + 70).toFixed(2)),
        })),
      }),
    });

    await fetch(`${baseUrl}/api/v1/monitoring/run`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId, windowLimit: 10}),
    });

    // 4. Policy now approves PERFORMANCE_POLICY
    const evalDegRes = await fetch(`${baseUrl}/api/v1/retraining/evaluate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId}),
    });
    const evalDeg = (await evalDegRes.json()) as {eligible: boolean; recommendedTrigger: string};
    assert.equal(evalDeg.eligible, true);
    assert.equal(evalDeg.recommendedTrigger, 'PERFORMANCE_POLICY');

    // 5. Trigger retraining (auto selects gradient_boosting -> beats ridge v1 by >2% -> promotes v2!)
    const trig1Res = await fetch(`${baseUrl}/api/v1/retraining/trigger`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelId: v1.modelId,
        triggerType: 'PERFORMANCE_POLICY',
        algorithm: 'auto',
        idempotencyKey: 'idem-p8-001',
      }),
    });
    assert.equal(trig1Res.status, 201);
    const job1 = (await trig1Res.json()) as {
      id: string;
      status: string;
      decision: string;
      challengerVersionId: string;
      championVersionId: string;
      idempotentReplay: boolean;
    };
    assert.equal(job1.status, 'SUCCEEDED');
    assert.equal(job1.decision, 'PROMOTED_TO_PRODUCTION');
    assert.equal(job1.championVersionId, v1.id);
    assert.equal(job1.idempotentReplay, false);

    // Verify deployment pointer synced to challenger v2 and v1 was archived
    const modelDetailRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}`);
    const modelDetail = (await modelDetailRes.json()) as {
      productionVersionId: string;
      versions: Array<{id: string; stage: string; versionNumber: number}>;
    };
    assert.equal(modelDetail.productionVersionId, job1.challengerVersionId);
    const v1After = modelDetail.versions.find((v) => v.id === v1.id);
    assert.equal(v1After?.stage, 'Archived');

    // 6. Idempotent replay with same idempotencyKey returns HTTP 200 and same job ID
    const replayRes = await fetch(`${baseUrl}/api/v1/retraining/trigger`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelId: v1.modelId,
        triggerType: 'PERFORMANCE_POLICY',
        idempotencyKey: 'idem-p8-001',
      }),
    });
    assert.equal(replayRes.status, 200);
    const replay = (await replayRes.json()) as {id: string; idempotentReplay: boolean};
    assert.equal(replay.id, job1.id);
    assert.equal(replay.idempotentReplay, true);

    // 7. Cooldown blocks immediate second trigger without bypassCooldown
    const cooldownRes = await fetch(`${baseUrl}/api/v1/retraining/trigger`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelId: v1.modelId,
        triggerType: 'MANUAL',
        idempotencyKey: 'idem-p8-cooldown-test',
      }),
    });
    assert.equal(cooldownRes.status, 422);

    // 8. Challenger Rejection Gate: weak ridge challenger vs GBDT Champion fails improvement threshold -> REJECTED_BY_GATE
    const rejectRes = await fetch(`${baseUrl}/api/v1/retraining/trigger`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        modelId: v1.modelId,
        triggerType: 'MANUAL',
        algorithm: 'ridge',
        bypassCooldown: true,
        idempotencyKey: 'idem-p8-weak-challenger',
      }),
    });
    assert.equal(rejectRes.status, 201);
    const rejectJob = (await rejectRes.json()) as {
      status: string;
      decision: string;
      challengerVersionId: string;
    };
    assert.equal(rejectJob.status, 'REJECTED_BY_GATE');
    assert.equal(rejectJob.decision, 'REJECTED');

    const modelAfterRejectRes = await fetch(`${baseUrl}/api/v1/models/${v1.modelId}`);
    const modelAfterReject = (await modelAfterRejectRes.json()) as {
      productionVersionId: string;
      versions: Array<{id: string; stage: string}>;
    };
    // Champion stays in Production while weak Challenger is Rejected
    assert.equal(modelAfterReject.productionVersionId, job1.challengerVersionId);
    assert.equal(
      modelAfterReject.versions.find((v) => v.id === rejectJob.challengerVersionId)?.stage,
      'Rejected',
    );

    // 9. Circuit breaker opens after 3 consecutive FAILED jobs (corrupted dataset failures)
    const badDsRes = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: 'retail-p8-bad', days: 30, seed: 42, scenario: 'corrupted'}),
    });
    const badDs = (await badDsRes.json()) as {datasetId: string};

    for (let k = 1; k <= 3; k++) {
      const failRes = await fetch(`${baseUrl}/api/v1/retraining/trigger`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          modelId: v1.modelId,
          datasetId: badDs.datasetId,
          triggerType: 'MANUAL',
          bypassCooldown: true,
          idempotencyKey: `idem-fail-${k}`,
        }),
      });
      assert.equal(failRes.status, 422);
    }

    const cbEvalRes = await fetch(`${baseUrl}/api/v1/retraining/evaluate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({modelId: v1.modelId}),
    });
    const cbEval = (await cbEvalRes.json()) as {eligible: boolean; blockedBy: string; circuitBreakerOpen: boolean};
    assert.equal(cbEval.eligible, false);
    assert.equal(cbEval.blockedBy, 'CIRCUIT_BREAKER_OPEN');
    assert.equal(cbEval.circuitBreakerOpen, true);

    const jobsListRes = await fetch(`${baseUrl}/api/v1/retraining/jobs?modelId=${v1.modelId}`);
    assert.equal(jobsListRes.status, 200);
    const jobsList = (await jobsListRes.json()) as {jobs: unknown[]};
    assert.equal(jobsList.jobs.length, 5); // 1 promoted + 1 rejected + 3 failed
  });
});
