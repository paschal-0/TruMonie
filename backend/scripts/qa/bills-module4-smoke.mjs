#!/usr/bin/env node

import crypto from 'node:crypto';

const base = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const api = `${base}/api`;
const password = process.env.QA_PASSWORD ?? 'QaFlow#12345';
const pin = process.env.QA_PIN ?? '1234';

const results = [];

function randomPhone() {
  const rest = `${Math.floor(Math.random() * 10 ** 7)}`.padStart(7, '0');
  return `+234803${rest}`;
}

function randomRef(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

async function request(method, path, { token, body, headers } = {}) {
  const merged = { ...(headers ?? {}) };
  if (token) merged.authorization = `Bearer ${token}`;
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
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ label, status: 'FAIL', detail });
    console.log(`[FAIL] ${label} - ${detail}`);
    return false;
  }
}

function sampleForField(field) {
  if (field.includes('meter')) return '45012345678';
  if (field.includes('account')) return '4501234567';
  if (field.includes('smartcard')) return '1234567890';
  if (field.includes('phone')) return '08030000000';
  return '1234567890';
}

async function main() {
  console.log(`Running Module 4 bills smoke against ${api}`);

  const user = {
    phoneNumber: randomPhone(),
    email: `${randomRef('m4-bills').toLowerCase()}@trumonie.qa`,
    username: randomRef('m4user').toLowerCase().replace(/[^a-z0-9]/g, ''),
    firstName: 'Bills',
    lastName: 'Tester',
    password
  };

  let token;
  let userId;
  let ngnWalletId;
  let validationBiller;
  let directBiller;
  let validationRef;
  let beneficiaryId;

  const health = await step('M4-HEALTH', async () => {
    const payload = await request('GET', '/health');
    const dbHealthy = payload?.checks?.database === true;
    if (!dbHealthy) throw new Error(`database check failed: ${JSON.stringify(payload)}`);
    return payload?.status ?? 'unknown';
  });
  if (!health) process.exit(1);

  const registered = await step('M4-REGISTER', async () => {
    const payload = await request('POST', '/auth/register', { body: user });
    token = payload?.tokens?.accessToken;
    userId = payload?.user?.id;
    if (!token || !userId) throw new Error('register missing token/user');
    return user.email;
  });
  if (!registered) process.exit(1);

  const pinReady = await step('M4-SET-PIN', async () => {
    await request('POST', '/users/me/pin', {
      token,
      body: { pin }
    });
    return 'configured';
  });
  if (!pinReady) process.exit(1);

  const walletReady = await step('M4-WALLETS', async () => {
    const wallets = await request('GET', '/wallets', { token });
    const ngn = wallets.find((wallet) => wallet.currency === 'NGN');
    if (!ngn?.id) throw new Error('NGN wallet missing');
    ngnWalletId = ngn.id;
    return ngn.id;
  });
  if (!walletReady) process.exit(1);

  await step('M4-FUND', async () => {
    const reference = randomRef('m4-fund');
    await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: reference,
        reference,
        userId,
        amountMinor: 2_000_000,
        currency: 'NGN'
      }
    });
    return 'funded';
  });

  const categoriesReady = await step('M4-CATEGORIES', async () => {
    const payload = await request('GET', '/bills/categories');
    const categories = payload?.categories ?? [];
    validationBiller = categories
      .flatMap((entry) => entry.billers ?? [])
      .find((biller) => biller.requires_validation);
    directBiller = categories
      .flatMap((entry) => entry.billers ?? [])
      .find((biller) => !biller.requires_validation);
    if (!validationBiller || !directBiller) {
      throw new Error('missing validation/non-validation billers');
    }
    return `categories=${categories.length}`;
  });
  if (!categoriesReady) process.exit(1);

  const validationReady = await step('M4-VALIDATE', async () => {
    const fields = {};
    for (const field of validationBiller.validation_fields ?? []) {
      fields[field] = sampleForField(field);
    }
    const payload = await request('POST', '/bills/validate', {
      token,
      body: {
        biller_id: validationBiller.id,
        fields
      }
    });
    validationRef = payload?.validation_ref;
    if (!validationRef) throw new Error('validation_ref missing');
    return validationRef;
  });
  if (!validationReady) process.exit(1);

  await step('M4-SAVE-BENEFICIARY', async () => {
    const payload = await request('POST', '/bills/beneficiaries', {
      token,
      body: {
        productCode: validationBiller.id,
        destination: '45012345678',
        nickname: 'Meter Home'
      }
    });
    beneficiaryId = payload?.id;
    if (!beneficiaryId) throw new Error('beneficiary id missing');
    return beneficiaryId;
  });

  await step('M4-PAY-VALIDATED', async () => {
    const payload = await request('POST', '/bills/pay', {
      token,
      body: {
        wallet_id: ngnWalletId,
        biller_id: validationBiller.id,
        validation_ref: validationRef,
        amount: 150000,
        currency: 'NGN',
        pin,
        idempotency_key: randomRef('m4-pay-val')
      }
    });
    if (!payload?.payment_id || !payload?.reference) throw new Error('payment response incomplete');
    return `${payload.reference} (${payload.status})`;
  });

  await step('M4-PAY-DIRECT', async () => {
    const payload = await request('POST', '/bills/pay', {
      token,
      body: {
        wallet_id: ngnWalletId,
        biller_id: directBiller.id,
        customer_ref: '08030000000',
        amount: 50000,
        currency: 'NGN',
        pin,
        idempotency_key: randomRef('m4-pay-direct')
      }
    });
    if (!payload?.payment_id || !payload?.reference) throw new Error('direct payment incomplete');
    return `${payload.reference} (${payload.status})`;
  });

  await step('M4-NQR-PAY', async () => {
    const payload = await request('POST', '/bills/nqr/pay', {
      token,
      body: {
        wallet_id: ngnWalletId,
        qr_data: '00020101021129370016A000000677010111011300668010013204000053035665802NG5918CHICKEN REPUBLIC6006IKEJA6304ABCD',
        amount: 35000,
        currency: 'NGN',
        pin,
        idempotency_key: randomRef('m4-nqr')
      }
    });
    if (!payload?.payment_id) throw new Error('nqr payment_id missing');
    return `${payload.payment_id} (${payload.status})`;
  });

  await step('M4-BENEFICIARIES-LIST', async () => {
    const payload = await request('GET', '/bills/beneficiaries', { token });
    const list = payload?.beneficiaries ?? [];
    if (!Array.isArray(list) || list.length === 0) throw new Error('beneficiaries list empty');
    return `count=${list.length}`;
  });

  await step('M4-BENEFICIARIES-DELETE', async () => {
    if (!beneficiaryId) throw new Error('beneficiary id unavailable');
    await request('DELETE', `/bills/beneficiaries/${beneficiaryId}`, { token });
    return 'deleted';
  });

  const failed = results.filter((entry) => entry.status === 'FAIL');
  console.log('\nModule 4 QA Summary');
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length > 0) process.exit(1);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
