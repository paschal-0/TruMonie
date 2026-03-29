#!/usr/bin/env node

import crypto from 'node:crypto';

const base = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const api = `${base}/api`;
const password = process.env.QA_PASSWORD ?? 'QaFlow#12345';

const results = [];

function id(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

function randomPhone() {
  const prefixes = ['70', '80', '81', '90', '91'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  const rest = `${Math.floor(Math.random() * 10 ** 8)}`.padStart(8, '0');
  return `+234${p}${rest}`;
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
  const user = {
    phoneNumber: randomPhone(),
    email: `${id('domain')}.qa@trumonie.qa`,
    username: id('domain').replace(/-/g, ''),
    firstName: 'Domain',
    lastName: 'Tester',
    password
  };

  let token;
  let userId;
  let wallets;
  let ngnWallet;
  let cardId;
  let vaultId;
  let quoteId;
  let billCode = 'AIRTIME_MTN';

  await step('SETUP-REGISTER', async () => {
    const response = await request('POST', '/auth/register', { body: user });
    token = response?.tokens?.accessToken;
    userId = response?.user?.id;
    if (!token || !userId) {
      throw new Error('missing token or userId from register');
    }
    return user.email;
  });

  await step('SETUP-LOGIN', async () => {
    const response = await request('POST', '/auth/login', {
      body: { identifier: user.email, password }
    });
    token = response?.tokens?.accessToken;
    if (!token) throw new Error('missing token from login');
    return 'token issued';
  });

  await step('SETUP-WALLETS', async () => {
    wallets = await request('GET', '/wallets', { token });
    const ngn = wallets.find((w) => w.currency === 'NGN');
    const usd = wallets.find((w) => w.currency === 'USD');
    if (!ngn || !usd) throw new Error('expected NGN and USD wallets');
    ngnWallet = ngn;
    return `NGN=${ngn.id} USD=${usd.id}`;
  });

  await step('SETUP-FUND-NGN', async () => {
    await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: id('fund-ngn'),
        reference: id('fund-ngn-ref'),
        userId,
        amountMinor: 800000,
        currency: 'NGN'
      }
    });
    return 'funded';
  });

  await step('CARDS-LIST', async () => {
    const response = await request('GET', '/cards', { token });
    if (!Array.isArray(response)) throw new Error('cards list is not array');
    return `count=${response.length}`;
  });

  await step('CARDS-CREATE', async () => {
    const response = await request('POST', '/cards', {
      token,
      body: {
        fundingAccountId: ngnWallet.id,
        currency: 'NGN',
        provider: 'stub'
      }
    });
    cardId = response?.id;
    if (!cardId) throw new Error('missing card id');
    return `card=${cardId}`;
  });

  await step('CARDS-BLOCK', async () => {
    const response = await request('PATCH', `/cards/${cardId}/block`, { token });
    if (response?.status !== 'BLOCKED') throw new Error(`unexpected status ${response?.status}`);
    return 'blocked';
  });

  await step('CARDS-UNBLOCK', async () => {
    const response = await request('PATCH', `/cards/${cardId}/unblock`, { token });
    if (response?.status !== 'ACTIVE') throw new Error(`unexpected status ${response?.status}`);
    return 'active';
  });

  await step('BILLS-CATALOG', async () => {
    const response = await request('GET', '/bills/catalog');
    if (!Array.isArray(response) || response.length === 0) throw new Error('catalog empty');
    billCode = response[0].code ?? billCode;
    return `items=${response.length}, first=${billCode}`;
  });

  await step('BILLS-SAVE-BENEFICIARY', async () => {
    const response = await request('POST', '/bills/beneficiaries', {
      token,
      body: {
        productCode: billCode,
        destination: '08030000000',
        nickname: id('bene').slice(0, 24)
      }
    });
    if (!response?.id) throw new Error('beneficiary not created');
    return response.id;
  });

  await step('BILLS-LIST-BENEFICIARY', async () => {
    const response = await request('GET', '/bills/beneficiaries', { token });
    if (!Array.isArray(response) || response.length === 0) throw new Error('beneficiaries empty');
    return `count=${response.length}`;
  });

  await step('BILLS-PURCHASE', async () => {
    const response = await request('POST', '/bills/purchase', {
      token,
      body: {
        productCode: billCode,
        beneficiary: '08030000000',
        amountMinor: 1500,
        currency: 'NGN',
        description: 'Domain batch bill payment'
      }
    });
    if (!response?.reference) throw new Error('missing bill reference');
    return response.reference;
  });

  await step('SAVINGS-CREATE-VAULT', async () => {
    const response = await request('POST', '/savings/vaults', {
      token,
      body: {
        name: id('vault').slice(0, 20),
        currency: 'NGN',
        targetAmountMinor: 100000
      }
    });
    vaultId = response?.id;
    if (!vaultId) throw new Error('missing vault id');
    return vaultId;
  });

  await step('SAVINGS-LIST-VAULTS', async () => {
    const response = await request('GET', '/savings/vaults', { token });
    if (!Array.isArray(response) || !response.find((vault) => vault.id === vaultId)) {
      throw new Error('created vault not listed');
    }
    return `count=${response.length}`;
  });

  await step('SAVINGS-DEPOSIT', async () => {
    const response = await request('POST', '/savings/vaults/deposit', {
      token,
      body: {
        vaultId,
        currency: 'NGN',
        amountMinor: 4000,
        reference: id('sav-dep')
      }
    });
    if (!response?.balanceMinor) throw new Error('missing updated balance after deposit');
    return `balance=${response.balanceMinor}`;
  });

  await step('SAVINGS-WITHDRAW', async () => {
    const response = await request('POST', '/savings/vaults/withdraw', {
      token,
      body: {
        vaultId,
        currency: 'NGN',
        amountMinor: 1500,
        reference: id('sav-wdr')
      }
    });
    if (!response?.balanceMinor) throw new Error('missing updated balance after withdraw');
    return `balance=${response.balanceMinor}`;
  });

  await step('FX-RATE', async () => {
    const response = await request('GET', '/fx/rate?base=NGN&quote=USD');
    if (typeof response?.rate !== 'number' || response.rate <= 0) {
      throw new Error('invalid FX rate');
    }
    return `rate=${response.rate}`;
  });

  await step('FX-QUOTE', async () => {
    const response = await request('POST', '/fx/quote', {
      token,
      body: {
        base: 'NGN',
        quote: 'USD',
        amountMinor: 10000
      }
    });
    quoteId = response?.id;
    if (!quoteId) throw new Error('missing quote id');
    return quoteId;
  });

  await step('FX-CONVERT', async () => {
    const response = await request('POST', '/fx/convert', {
      token,
      body: {
        quoteId,
        base: 'NGN',
        quote: 'USD',
        amountMinor: 10000
      }
    });
    if (!response?.id) throw new Error('missing FX ledger entry id');
    return response.id;
  });

  await step('KYC-VERIFY', async () => {
    const response = await request('POST', '/kyc/verify', {
      token,
      body: {
        bvn: '12345678901',
        nin: '12345678901',
        dateOfBirth: '1990-01-01',
        address: 'Lagos'
      }
    });
    if (response?.status !== 'verified') throw new Error('kyc status not verified');
    return response.reference ?? 'verified';
  });

  await step('REMITTANCE-OUTBOUND', async () => {
    const response = await request('POST', '/remittance/outbound', {
      token,
      body: {
        amountMinor: 2000,
        currency: 'NGN',
        destination: {
          country: 'NG',
          bankCode: '000',
          accountNumber: '0000000000',
          accountName: 'QA Beneficiary'
        },
        provider: 'internal',
        narration: 'Domain batch outbound'
      }
    });
    if (!response?.providerReference) throw new Error('missing providerReference');
    return response.providerReference;
  });

  await step('REMITTANCE-INBOUND', async () => {
    const response = await request('POST', '/remittance/inbound', {
      token,
      body: {
        amountMinor: 2500,
        currency: 'NGN',
        provider: 'internal',
        reference: id('remit-in')
      }
    });
    if (!response?.id) throw new Error('missing remittance inbound ledger id');
    return response.id;
  });

  const failed = results.filter((entry) => entry.status === 'FAIL');
  console.log('\nDomain Batch Summary');
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

void main();
