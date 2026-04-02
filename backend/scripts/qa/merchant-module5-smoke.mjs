#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'TruMonie#123';

const results = [];
const context = {
  merchantUser: null,
  merchantToken: null,
  adminToken: null,
  merchantId: null,
  terminalId: null,
  merchantGeo: { lat: 6.4541, lng: 3.4084 }
};

function record(id, status, details = '', optional = false) {
  results.push({ id, status, details, optional });
  const prefix = status === 'PASS' ? '[PASS]' : status === 'SKIP' ? '[SKIP]' : '[FAIL]';
  console.log(`${prefix} ${id}${details ? ` - ${details}` : ''}`);
}

function ensure(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

async function request(method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${apiBase}${path}`, {
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

  if (!response.ok) {
    const error = new Error(`${method} ${path} failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function requestRaw(method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${apiBase}${path}`, {
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

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

async function runStep(id, fn, options = {}) {
  const optional = Boolean(options.optional);
  try {
    const detail = await fn();
    record(id, 'PASS', detail ?? '', optional);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, optional ? 'SKIP' : 'FAIL', message, optional);
    return false;
  }
}

function randomNgPhone() {
  const rest = `${Math.floor(Math.random() * 10 ** 7)}`.padStart(7, '0');
  return `+234803${rest}`;
}

function randomUser(tag) {
  const suffix = `${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  return {
    phoneNumber: randomNgPhone(),
    email: `${tag}.${suffix}@trumonie.qa`,
    username: `${tag}_${suffix}`.replace(/-/g, ''),
    firstName: 'Merchant',
    lastName: 'Tester',
    password
  };
}

async function resolveAdminToken() {
  if (process.env.QA_ADMIN_TOKEN) return process.env.QA_ADMIN_TOKEN;
  if (process.env.QA_ADMIN_IDENTIFIER && process.env.QA_ADMIN_PASSWORD) {
    const login = await request('POST', '/auth/login', {
      body: {
        identifier: process.env.QA_ADMIN_IDENTIFIER,
        password: process.env.QA_ADMIN_PASSWORD
      }
    });
    return login?.tokens?.accessToken ?? null;
  }
  return null;
}

async function main() {
  console.log(`Running Module 5 merchant/POS smoke against ${apiBase}`);

  const healthy = await runStep('M5-HEALTH', async () => {
    const health = await request('GET', '/health');
    if (health?.status !== 'ok') {
      throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
    }
    return 'health ok';
  });
  if (!healthy) process.exit(1);

  const user = randomUser('m5merchant');
  const registered = await runStep('M5-AUTH-REGISTER', async () => {
    const response = await request('POST', '/auth/register', { body: user });
    context.merchantUser = response?.user;
    context.merchantToken = response?.tokens?.accessToken;
    ensure(context.merchantUser?.id, 'merchant user id missing');
    ensure(context.merchantToken, 'merchant access token missing');
    return user.email;
  });
  if (!registered) process.exit(1);

  const createdMerchant = await runStep('M5-MERCHANT-CREATE', async () => {
    const response = await request('POST', '/merchants', {
      token: context.merchantToken,
      body: {
        business_name: `M5 Store ${Date.now()}`,
        business_type: 'SOLE_PROPRIETORSHIP',
        category_code: '5411',
        address: {
          street: '25 Broad Street',
          city: 'Lagos Island',
          state: 'Lagos',
          country: 'NG'
        },
        geo_location: context.merchantGeo,
        geo_fence_radius: 10,
        settlement_account: '0123456789',
        settlement_bank: '058',
        settlement_cycle: 'T0'
      }
    });
    context.merchantId = response?.merchant_id;
    ensure(context.merchantId, 'merchant id missing');
    if (response?.status !== 'PENDING') {
      throw new Error(`Expected PENDING merchant, got ${response?.status}`);
    }
    return `merchant=${context.merchantId}`;
  });
  if (!createdMerchant) process.exit(1);

  await runStep('M5-POS-REQUEST-BLOCKED-PENDING', async () => {
    const response = await requestRaw('POST', '/merchants/me/pos-request', {
      token: context.merchantToken,
      body: { quantity: 1 }
    });
    if (response.ok) {
      throw new Error('POS request should fail for pending merchant');
    }
    if (response.status !== 403) {
      throw new Error(`Expected 403, got ${response.status}`);
    }
    return 'pending merchant correctly blocked';
  });

  context.adminToken = await resolveAdminToken();
  if (!context.adminToken) {
    record(
      'M5-ADMIN-REQUIRED',
      'SKIP',
      'Set QA_ADMIN_TOKEN or QA_ADMIN_IDENTIFIER/QA_ADMIN_PASSWORD to run approval + settlement checks',
      true
    );
  } else {
    const approved = await runStep('M5-ADMIN-APPROVE-MERCHANT', async () => {
      const response = await request('PATCH', `/admin/merchants/${context.merchantId}/status`, {
        token: context.adminToken,
        body: {
          status: 'APPROVED',
          reason: 'QA smoke approval'
        }
      });
      if (response?.status !== 'APPROVED') {
        throw new Error(`Unexpected status after approval: ${JSON.stringify(response)}`);
      }
      return response.status;
    });
    if (!approved) process.exit(1);

    const posRequest = await runStep('M5-POS-REQUEST', async () => {
      const response = await request('POST', '/merchants/me/pos-request', {
        token: context.merchantToken,
        body: {
          quantity: 1,
          model: 'PAX A920'
        }
      });
      const terminalId = response?.terminal_ids?.[0];
      ensure(terminalId, 'terminal id missing from request response');
      context.terminalId = terminalId;
      return terminalId;
    });
    if (!posRequest) process.exit(1);

    const activated = await runStep('M5-ADMIN-TERMINAL-ACTIVATE', async () => {
      const terminals = await request('GET', '/admin/merchants/terminals?page=1&perPage=10', {
        token: context.adminToken
      });
      const row = (terminals?.items ?? []).find((item) => item.terminal_id === context.terminalId);
      ensure(row?.id, 'terminal row not found on admin list');

      const response = await request('PATCH', `/admin/merchants/terminals/${row.id}/status`, {
        token: context.adminToken,
        body: { status: 'ACTIVE' }
      });
      if (response?.status !== 'ACTIVE') {
        throw new Error(`Terminal did not become ACTIVE: ${JSON.stringify(response)}`);
      }
      return response.status;
    });
    if (!activated) process.exit(1);

    const charged = await runStep('M5-POS-CHARGE', async () => {
      const response = await request('POST', '/admin/merchants/transactions/charge', {
        token: context.adminToken,
        body: {
          terminal_id: context.terminalId,
          amount_minor: 150000,
          channel: 'CARD',
          txn_location: context.merchantGeo,
          metadata: {
            pan: '539983XXXXXX0001',
            masked_pan: '539983******0001'
          }
        }
      });

      if (!['SUCCESS', 'PENDING'].includes(response?.status)) {
        throw new Error(`Unexpected charge status: ${JSON.stringify(response)}`);
      }
      return `${response.reference} (${response.status})`;
    });
    if (!charged) process.exit(1);

    await runStep('M5-SETTLEMENT-PROCESS', async () => {
      const response = await request('POST', '/admin/merchants/settlements/process', {
        token: context.adminToken,
        body: { cycle: 'T0' }
      });
      if (typeof response?.settlements_created !== 'number') {
        throw new Error(`Unexpected settlement response: ${JSON.stringify(response)}`);
      }
      return `created=${response.settlements_created}`;
    });

    await runStep('M5-MERCHANT-SETTLEMENTS-LIST', async () => {
      const response = await request('GET', '/merchants/me/settlements?limit=20', {
        token: context.merchantToken
      });
      const settlements = Array.isArray(response?.settlements) ? response.settlements : [];
      if (settlements.length === 0) {
        throw new Error('No settlements found after processing');
      }
      return `count=${settlements.length}`;
    });
  }

  const requiredFailures = results.filter((row) => row.status === 'FAIL' && !row.optional);
  const passed = results.filter((row) => row.status === 'PASS').length;
  const skipped = results.filter((row) => row.status === 'SKIP').length;

  console.log('\nModule 5 QA Summary');
  console.log(`Passed: ${passed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${requiredFailures.length}`);

  if (requiredFailures.length > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
