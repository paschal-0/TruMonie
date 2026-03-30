#!/usr/bin/env node

import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

dotenv.config({ path: path.join(process.cwd(), '.env') });

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'QaSecurity#123';
const currency = (process.env.QA_CURRENCY ?? 'NGN').toUpperCase();
const results = [];
const context = {
  userA: null,
  userB: null,
  userAToken: null,
  userBToken: null,
  userAWallet: null,
  userBWallet: null,
  adminToken: null
};

function rand(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

function randomPhone() {
  const rest = `${Math.floor(Math.random() * 10 ** 7)}`.padStart(7, '0');
  return `+234803${rest}`;
}

function makeUser(tag) {
  const suffix = rand(tag);
  return {
    phoneNumber: randomPhone(),
    email: `${suffix}.qa@trumonie.qa`,
    username: suffix.replace(/-/g, ''),
    firstName: tag.toUpperCase(),
    lastName: 'SEC',
    password
  };
}

function dbConfig() {
  const sslEnabled = process.env.POSTGRES_SSL === 'true' || process.env.POSTGRES_SSL === '1';
  return {
    host: process.env.POSTGRES_HOST,
    port: Number.parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  };
}

async function request(method, pathName, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${apiBase}${pathName}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { ok: response.ok, status: response.status, payload };
}

function record(label, status, detail) {
  results.push({ label, status, detail });
  console.log(`[${status}] ${label}${detail ? ` - ${detail}` : ''}`);
}

async function step(label, fn) {
  try {
    const detail = await fn();
    record(label, 'PASS', detail ?? '');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    record(label, 'FAIL', detail);
  }
}

async function expectStatus(method, pathName, expectedStatus, options = {}) {
  const res = await request(method, pathName, options);
  if (res.status !== expectedStatus) {
    throw new Error(
      `${method} ${pathName} expected ${expectedStatus} got ${res.status} payload=${JSON.stringify(
        res.payload
      )}`
    );
  }
  return `status=${res.status}`;
}

async function promoteUserToAdmin(userId) {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    await client.query(`UPDATE users SET role = 'ADMIN', status = 'ACTIVE' WHERE id = $1`, [userId]);
  } finally {
    await client.end();
  }
}

async function assertAuditAction(action) {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    const result = await client.query(
      `SELECT id FROM audit_logs WHERE action = $1 ORDER BY created_at DESC LIMIT 1`,
      [action]
    );
    if (!result.rowCount) {
      throw new Error(`No audit log found for action ${action}`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(`Running security/RBAC smoke checks against ${apiBase}`);

  const userA = makeUser('seca');
  const userB = makeUser('secb');
  const adminUser = makeUser('secadmin');

  await step('SEC-SETUP-REGISTER-A', async () => {
    const res = await request('POST', '/auth/register', { body: userA });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.userA = res.payload.user;
    context.userAToken = res.payload.tokens?.accessToken;
    return context.userA.email;
  });

  await step('SEC-SETUP-REGISTER-B', async () => {
    const res = await request('POST', '/auth/register', { body: userB });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.userB = res.payload.user;
    context.userBToken = res.payload.tokens?.accessToken;
    return context.userB.email;
  });

  await step('SEC-SETUP-LOGIN-A', async () => {
    const res = await request('POST', '/auth/login', {
      body: { identifier: userA.email, password }
    });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.userAToken = res.payload.tokens?.accessToken;
    if (!context.userAToken) throw new Error('userA login token missing');
    return 'token refreshed';
  });

  await step('SEC-SETUP-LOGIN-B', async () => {
    const res = await request('POST', '/auth/login', {
      body: { identifier: userB.email, password }
    });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.userBToken = res.payload.tokens?.accessToken;
    if (!context.userBToken) throw new Error('userB login token missing');
    return 'token refreshed';
  });

  await step('SEC-SETUP-WALLETS', async () => {
    const a = await request('GET', '/wallets', { token: context.userAToken });
    const b = await request('GET', '/wallets', { token: context.userBToken });
    if (!a.ok || !b.ok) throw new Error('failed to fetch wallets');
    context.userAWallet = a.payload.find((w) => w.currency === currency) ?? a.payload[0];
    context.userBWallet = b.payload.find((w) => w.currency === currency) ?? b.payload[0];
    if (!context.userAWallet?.id || !context.userBWallet?.id) throw new Error('wallets missing');
    return `A=${context.userAWallet.id} B=${context.userBWallet.id}`;
  });

  await step('AUTH-NEG-UNAUTHORIZED-WALLETS', async () => {
    return expectStatus('GET', '/wallets', 401);
  });

  await step('AUTH-NEG-INVALID-TOKEN-ME', async () => {
    return expectStatus('GET', '/auth/me', 401, { token: 'bad.token.value' });
  });

  await step('USERS-POS-OWN-PROFILE', async () => {
    const res = await request('GET', `/users/${context.userA.id}`, { token: context.userAToken });
    if (!res.ok || res.payload?.id !== context.userA.id) {
      throw new Error(`unexpected response ${res.status} ${JSON.stringify(res.payload)}`);
    }
    return context.userA.id;
  });

  await step('USERS-NEG-CROSS-USER-FORBIDDEN', async () => {
    return expectStatus('GET', `/users/${context.userB.id}`, 403, { token: context.userAToken });
  });

  await step('WALLET-NEG-CROSS-ACCOUNT-STATEMENT', async () => {
    return expectStatus('GET', `/wallets/${context.userBWallet.id}/statement`, 403, {
      token: context.userAToken
    });
  });

  await step('PAY-NEG-NON-ADMIN-INTERNAL-FUND', async () => {
    return expectStatus('POST', '/payments/internal/fund', 403, {
      token: context.userAToken,
      body: {
        userId: context.userA.id,
        amountMinor: 1000,
        currency,
        reference: rand('sec-fund'),
        description: 'security test'
      }
    });
  });

  await step('RISK-NEG-NON-ADMIN-FREEZE', async () => {
    return expectStatus('PATCH', `/risk/user/${context.userB.id}/freeze`, 403, {
      token: context.userAToken
    });
  });

  await step('AJO-NEG-NON-MEMBER-GROUP-DETAILS', async () => {
    const create = await request('POST', '/ajo/groups', {
      token: context.userAToken,
      body: {
        name: rand('Security Group').slice(0, 24),
        currency,
        contributionAmountMinor: 1000,
        memberTarget: 2
      }
    });
    if (!create.ok) throw new Error(`group create failed ${JSON.stringify(create.payload)}`);
    const groupId = create.payload?.id;
    if (!groupId) throw new Error('group id missing');
    return expectStatus('GET', `/ajo/groups/${groupId}`, 403, { token: context.userBToken });
  });

  await step('RISK-POS-ADMIN-FREEZE-UNFREEZE-WITH-AUDIT', async () => {
    const reg = await request('POST', '/auth/register', { body: adminUser });
    if (!reg.ok) throw new Error(`admin register failed ${JSON.stringify(reg.payload)}`);

    await promoteUserToAdmin(reg.payload.user.id);

    const login = await request('POST', '/auth/login', {
      body: { identifier: adminUser.email, password }
    });
    if (!login.ok) throw new Error(`admin login failed ${JSON.stringify(login.payload)}`);
    context.adminToken = login.payload.tokens?.accessToken;
    if (!context.adminToken) throw new Error('admin token missing');

    const freeze = await request('PATCH', `/risk/user/${context.userB.id}/freeze`, {
      token: context.adminToken
    });
    if (!freeze.ok || freeze.payload?.status !== 'frozen') {
      throw new Error(`freeze failed ${freeze.status} ${JSON.stringify(freeze.payload)}`);
    }

    const unfreeze = await request('PATCH', `/risk/user/${context.userB.id}/unfreeze`, {
      token: context.adminToken
    });
    if (!unfreeze.ok || unfreeze.payload?.status !== 'unfrozen') {
      throw new Error(`unfreeze failed ${unfreeze.status} ${JSON.stringify(unfreeze.payload)}`);
    }

    await assertAuditAction('USER_FREEZE');
    await assertAuditAction('USER_UNFREEZE');
    return 'freeze/unfreeze audited';
  });

  await step('SEC-LOGIN-A-REFRESH', async () => {
    const login = await request('POST', '/auth/login', {
      body: { identifier: context.userA.email, password }
    });
    if (!login.ok) throw new Error(`userA login failed ${JSON.stringify(login.payload)}`);
    context.userAToken = login.payload.tokens?.accessToken;
    if (!context.userAToken) throw new Error('userA token missing after refresh');
    return 'userA token refreshed';
  });

  await step('RISK-POS-DEVICE-REGISTER-WITH-AUDIT', async () => {
    const res = await request('POST', '/risk/device/register', {
      token: context.userAToken,
      body: {
        fingerprint: rand('fp'),
        deviceType: 'android'
      }
    });
    if (!res.ok || res.payload?.status !== 'ok') {
      throw new Error(`device register failed ${res.status} ${JSON.stringify(res.payload)}`);
    }
    await assertAuditAction('DEVICE_REGISTER');
    return 'device registration audited';
  });

  const failed = results.filter((item) => item.status === 'FAIL');
  console.log('\nSecurity/RBAC Summary');
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
