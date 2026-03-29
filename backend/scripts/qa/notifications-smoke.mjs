#!/usr/bin/env node

import crypto from 'node:crypto';

const base = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const api = `${base}/api`;
const password = process.env.QA_PASSWORD ?? 'Notify#12345';
const currency = (process.env.QA_CURRENCY ?? 'NGN').toUpperCase();

const results = [];

function rand(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

function randomPhone() {
  const starts = ['70', '80', '81', '90', '91'];
  const start = starts[Math.floor(Math.random() * starts.length)];
  const rest = `${Math.floor(Math.random() * 10 ** 8)}`.padStart(8, '0');
  return `+234${start}${rest}`;
}

async function request(method, path, { token, body, headers } = {}) {
  const merged = { ...(headers ?? {}) };
  if (token) merged.Authorization = `Bearer ${token}`;
  if (body !== undefined) merged['content-type'] = 'application/json';

  const response = await fetch(`${api}${path}`, {
    method,
    headers: merged,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${path} -> ${response.status} ${
        typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
      }`
    );
  }

  return payload;
}

async function step(label, fn) {
  try {
    const detail = await fn();
    results.push({ label, status: 'PASS', detail: detail ?? '' });
    console.log(`[PASS] ${label}${detail ? ` - ${detail}` : ''}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ label, status: 'FAIL', detail });
    console.log(`[FAIL] ${label} - ${detail}`);
  }
}

async function main() {
  const creator = {
    phoneNumber: randomPhone(),
    email: `${rand('notify-creator')}.qa@trumonie.qa`,
    username: rand('notifycreator').replace(/-/g, ''),
    firstName: 'Notify',
    lastName: 'Creator',
    password
  };
  const member = {
    phoneNumber: randomPhone(),
    email: `${rand('notify-member')}.qa@trumonie.qa`,
    username: rand('notifymember').replace(/-/g, ''),
    firstName: 'Notify',
    lastName: 'Member',
    password
  };

  let creatorToken;
  let memberToken;
  let creatorId;
  let memberId;
  let groupId;

  await step('HEALTH', async () => {
    const res = await request('GET', '/health');
    if (!res?.status) throw new Error('health payload missing status');
    return `status=${res.status}`;
  });

  await step('REGISTER-CREATOR', async () => {
    const res = await request('POST', '/auth/register', { body: creator });
    creatorToken = res?.tokens?.accessToken;
    creatorId = res?.user?.id;
    if (!creatorToken || !creatorId) throw new Error('missing creator token/id');
    return creator.email;
  });

  await step('REGISTER-MEMBER', async () => {
    const res = await request('POST', '/auth/register', { body: member });
    memberToken = res?.tokens?.accessToken;
    memberId = res?.user?.id;
    if (!memberToken || !memberId) throw new Error('missing member token/id');
    return member.email;
  });

  await step('FUND-CREATOR', async () => {
    await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: rand('notify-fund-c-idem'),
        reference: rand('notify-fund-c-ref'),
        userId: creatorId,
        amountMinor: 500000,
        currency
      }
    });
    return `${currency} 500000`;
  });

  await step('FUND-MEMBER', async () => {
    await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: rand('notify-fund-m-idem'),
        reference: rand('notify-fund-m-ref'),
        userId: memberId,
        amountMinor: 500000,
        currency
      }
    });
    return `${currency} 500000`;
  });

  await step('AJO-CREATE-GROUP', async () => {
    const res = await request('POST', '/ajo/groups', {
      token: creatorToken,
      body: {
        name: rand('Notify Group').slice(0, 24),
        currency,
        contributionAmountMinor: 1000,
        memberTarget: 2
      }
    });
    groupId = res?.id;
    if (!groupId) throw new Error('missing group id');
    return groupId;
  });

  await step('AJO-JOIN-TRIGGERS-NOTIFICATION', async () => {
    const res = await request('POST', `/ajo/groups/${groupId}/join`, {
      token: memberToken
    });
    if (!res?.id) throw new Error('member join failed');
    return 'AJO_JOIN path executed';
  });

  await step('AJO-RUN-CYCLE-TRIGGERS-PAYOUT-NOTIFICATION', async () => {
    const res = await request('POST', `/ajo/groups/${groupId}/run-cycle`, {
      token: creatorToken
    });
    if (!res?.status) throw new Error('run-cycle returned no status');
    return `status=${res.status}`;
  });

  const failed = results.filter((entry) => entry.status === 'FAIL');
  console.log('\nNotification Smoke Summary');
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

void main();
