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
const password = process.env.QA_PASSWORD ?? 'QaAdmin#123';
const currency = (process.env.QA_CURRENCY ?? 'NGN').toUpperCase();
const results = [];
const context = {
  checker: null,
  maker: null,
  target: null,
  checkerToken: null,
  makerToken: null,
  targetWalletId: null,
  pendingActionId: null,
  configDraftId: null
};

function rand(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

function randomPhone() {
  const rest = `${Math.floor(Math.random() * 10 ** 7)}`.padStart(7, '0');
  return `+234809${rest}`;
}

function makeUser(tag) {
  const suffix = rand(tag);
  return {
    phoneNumber: randomPhone(),
    email: `${suffix}@trumonie.qa`,
    username: suffix.replace(/-/g, ''),
    firstName: tag.toUpperCase(),
    lastName: 'ADMIN',
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

async function dbExec(query, params = []) {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    return await client.query(query, params);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(`Running module 9 admin smoke checks against ${apiBase}`);
  const checkerUser = makeUser('adminchecker');
  const makerUser = makeUser('adminmaker');
  const targetUser = makeUser('admintarget');

  await step('M9-SETUP-REGISTER-CHECKER', async () => {
    const res = await request('POST', '/auth/register', { body: checkerUser });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.checker = res.payload.user;
    return context.checker.id;
  });

  await step('M9-SETUP-REGISTER-MAKER', async () => {
    const res = await request('POST', '/auth/register', { body: makerUser });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.maker = res.payload.user;
    return context.maker.id;
  });

  await step('M9-SETUP-REGISTER-TARGET', async () => {
    const res = await request('POST', '/auth/register', { body: targetUser });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.target = res.payload.user;
    return context.target.id;
  });

  await step('M9-SETUP-PROMOTE-ROLES', async () => {
    await dbExec(`UPDATE users SET role = 'SUPER_ADMIN', status = 'ACTIVE' WHERE id = $1`, [
      context.checker.id
    ]);
    await dbExec(`UPDATE users SET role = 'CUSTOMER_SUPPORT', status = 'ACTIVE' WHERE id = $1`, [
      context.maker.id
    ]);
    await dbExec(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [context.target.id]);
    return 'roles updated';
  });

  await step('M9-LOGIN-CHECKER', async () => {
    const res = await request('POST', '/auth/admin/login', {
      body: { identifier: checkerUser.email, password }
    });
    if (!res.ok || res.payload?.mfa_required) throw new Error(JSON.stringify(res.payload));
    context.checkerToken = res.payload.tokens?.accessToken;
    return 'checker token ok';
  });

  await step('M9-LOGIN-MAKER', async () => {
    const res = await request('POST', '/auth/login', {
      body: { identifier: makerUser.email, password }
    });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.makerToken = res.payload.tokens?.accessToken;
    return 'maker token ok';
  });

  await step('M9-SETUP-TARGET-WALLET', async () => {
    const login = await request('POST', '/auth/login', {
      body: { identifier: targetUser.email, password }
    });
    if (!login.ok) throw new Error('target login failed');
    const wallets = await request('GET', '/wallets', { token: login.payload.tokens.accessToken });
    if (!wallets.ok) throw new Error('target wallets failed');
    const wallet = wallets.payload.find((row) => row.currency === currency) ?? wallets.payload[0];
    if (!wallet?.id) throw new Error('wallet not found');
    context.targetWalletId = wallet.id;
    return context.targetWalletId;
  });

  await step('M9-ACTIONS-CREATE-FREEZE', async () => {
    const res = await request('POST', '/admin/actions', {
      token: context.makerToken,
      body: {
        action_type: 'FREEZE_WALLET',
        resource_type: 'WALLET',
        resource_id: context.targetWalletId,
        payload: { reason: 'QA suspicious behavior' },
        reason: 'QA maker-checker flow'
      }
    });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.pendingActionId = res.payload.id;
    return context.pendingActionId;
  });

  await step('M9-ACTIONS-APPROVE', async () => {
    const res = await request('POST', `/admin/actions/${context.pendingActionId}/approve`, {
      token: context.checkerToken,
      body: { reason: 'Approved in QA' }
    });
    if (!res.ok || res.payload?.status !== 'APPROVED') {
      throw new Error(JSON.stringify(res.payload));
    }
    const db = await dbExec(`SELECT frozen_at FROM accounts WHERE id = $1`, [context.targetWalletId]);
    if (!db.rowCount || !db.rows[0].frozen_at) throw new Error('wallet not frozen after approval');
    return 'approved and frozen';
  });

  await step('M9-AUDIT-LOGS-LIST', async () => {
    const res = await request('GET', '/admin/audit-logs', { token: context.checkerToken });
    if (!res.ok || !Array.isArray(res.payload?.logs)) throw new Error(JSON.stringify(res.payload));
    return `${res.payload.logs.length} logs`;
  });

  await step('M9-SYSTEM-CONFIG-CREATE-ACTIVATE', async () => {
    const create = await request('POST', '/admin/system-config', {
      token: context.checkerToken,
      body: {
        config_key: `qa_limit_${Date.now()}`,
        config_value: { value: 1234567 },
        description: 'QA config'
      }
    });
    if (!create.ok) throw new Error(JSON.stringify(create.payload));
    context.configDraftId = create.payload.id;
    const activate = await request('POST', `/admin/system-config/${context.configDraftId}/activate`, {
      token: context.checkerToken,
      body: {}
    });
    if (!activate.ok || !activate.payload?.is_active) throw new Error(JSON.stringify(activate.payload));
    return context.configDraftId;
  });

  await step('M9-ADMIN-USERS-LIST', async () => {
    const res = await request('GET', '/admin/users', { token: context.checkerToken });
    if (!res.ok || !Array.isArray(res.payload)) throw new Error(JSON.stringify(res.payload));
    return `${res.payload.length} admin users`;
  });

  await step('M9-SLSG-SUBMISSION-PERSISTS', async () => {
    const res = await request('POST', '/admin/slsg/returns/submit', {
      token: context.checkerToken,
      body: {
        report_type: 'MMFBR_300',
        period: '2026-03',
        data: { qa: true }
      }
    });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    if (!res.payload?.id || !res.payload?.status) throw new Error('invalid submission payload');
    return `${res.payload.status}`;
  });

  const failed = results.filter((item) => item.status === 'FAIL');
  console.log('\nModule 9 Admin Summary');
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length > 0) process.exit(1);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

