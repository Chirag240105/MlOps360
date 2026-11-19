import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createApiApp} from '../app.ts';
import {hashPassword, signJwt, verifyJwt, verifyPassword} from '../core/security.ts';
import {openDatabase} from '../db/sqlite.ts';

async function withServer(
  opts: {enforceAuth?: boolean; rateLimitMaxRequests?: number},
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelops360-p5-'));
  const app = createApiApp({
    dbPath: path.join(tmpDir, 'test.db'),
    artifactRoot: path.join(tmpDir, 'artifacts'),
    enforceAuth: opts.enforceAuth ?? false,
    rateLimitMaxRequests: opts.rateLimitMaxRequests ?? 300,
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

test('Phase 5: scrypt password hashing and JWT verification reject tampering', () => {
  const hash = hashPassword('SuperSecretPass123!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(verifyPassword('SuperSecretPass123!', hash), true);
  assert.equal(verifyPassword('WrongPassword', hash), false);

  const token = signJwt({sub: 'usr_1', email: 'admin@modelops.io', role: 'Admin'}, 'test-secret', 30);
  const decoded = verifyJwt(token, 'test-secret');
  assert.equal(decoded.role, 'Admin');

  assert.throws(() => verifyJwt(`${token}tampered`, 'test-secret'), /Invalid token signature/);
  assert.throws(() => verifyJwt(token, 'wrong-secret'), /Invalid token signature/);
});

test('Phase 5: full relational schema initializes all 14 domain tables', () => {
  const db = openDatabase(':memory:');
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{name: string}>;
  const names = new Set(rows.map((r) => r.name));
  for (const expected of [
    'users',
    'datasets',
    'dataset_versions',
    'training_runs',
    'experiments',
    'experiment_runs',
    'registered_models',
    'model_versions',
    'deployments',
    'predictions',
    'monitoring_reports',
    'drift_events',
    'retraining_jobs',
    'audit_logs',
  ]) {
    assert.ok(names.has(expected), `Missing table ${expected}`);
  }
  db.close();
});

test('Phase 5: JWT authentication, RBAC role blocking, and Admin access control', async () => {
  await withServer({enforceAuth: true}, async (baseUrl) => {
    // 1. Unauthenticated access to protected route returns 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/datasets`);
    assert.equal(unauthRes.status, 401);

    // 2. Register Viewer and Admin
    const vReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: 'viewer@modelops.io',
        fullName: 'Viewer User',
        password: 'ViewerPassword123',
        role: 'Viewer',
      }),
    });
    assert.equal(vReg.status, 201);

    const aReg = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: 'admin@modelops.io',
        fullName: 'Admin User',
        password: 'AdminPassword123',
        role: 'Admin',
      }),
    });
    assert.equal(aReg.status, 201);

    // 3. Login both users
    const vLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'viewer@modelops.io', password: 'ViewerPassword123'}),
    });
    const viewerToken = ((await vLogin.json()) as {accessToken: string}).accessToken;

    const aLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'admin@modelops.io', password: 'AdminPassword123'}),
    });
    const adminToken = ((await aLogin.json()) as {accessToken: string}).accessToken;

    // 4. Viewer can read /auth/me and GET /datasets, but is blocked (403) on POST /datasets/generate and GET /users
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: {Authorization: `Bearer ${viewerToken}`},
    });
    assert.equal(meRes.status, 200);

    const viewerReadDs = await fetch(`${baseUrl}/api/v1/datasets`, {
      headers: {Authorization: `Bearer ${viewerToken}`},
    });
    assert.equal(viewerReadDs.status, 200);

    const viewerMutateDs = await fetch(`${baseUrl}/api/v1/datasets/generate`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}`},
      body: JSON.stringify({name: 'blocked-by-rbac', days: 30}),
    });
    assert.equal(viewerMutateDs.status, 403);

    const viewerUsers = await fetch(`${baseUrl}/api/v1/users`, {
      headers: {Authorization: `Bearer ${viewerToken}`},
    });
    assert.equal(viewerUsers.status, 403);

    // 5. Admin can list users
    const adminUsers = await fetch(`${baseUrl}/api/v1/users`, {
      headers: {Authorization: `Bearer ${adminToken}`},
    });
    assert.equal(adminUsers.status, 200);
    const usersBody = (await adminUsers.json()) as {users: Array<{email: string}>};
    assert.equal(usersBody.users.length, 2);
  });
});

test('Phase 5: API rate limiter returns 429 when burst limit exceeded', async () => {
  await withServer({rateLimitMaxRequests: 3}, async (baseUrl) => {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(`${baseUrl}/api/v1/health`);
      assert.equal(r.status, 200);
    }
    const blocked = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(blocked.status, 429);
  });
});
