#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const currency = (process.env.QA_CURRENCY ?? 'NGN').toUpperCase();
const password = process.env.QA_PASSWORD ?? 'TruMonie#123';
const fundingAmountMinor = Number.parseInt(process.env.QA_FUNDING_AMOUNT_MINOR ?? '500000', 10);
const transferAmountMinor = Number.parseInt(process.env.QA_TRANSFER_AMOUNT_MINOR ?? '10000', 10);
const ledgerTransferAmountMinor = Number.parseInt(
  process.env.QA_LEDGER_TRANSFER_AMOUNT_MINOR ?? '5000',
  10
);
const ajoContributionAmountMinor = Number.parseInt(
  process.env.QA_AJO_CONTRIBUTION_AMOUNT_MINOR ?? '1000',
  10
);

const results = [];
const context = {
  userA: null,
  userB: null,
  userAToken: null,
  userBToken: null,
  userAWallet: null,
  userBWallet: null,
  groupId: null
};

function record(id, status, details, optional = false) {
  results.push({ id, status, details, optional });
  const prefix = status === 'PASS' ? '[PASS]' : status === 'SKIP' ? '[SKIP]' : '[FAIL]';
  console.log(`${prefix} ${id} ${details ? `- ${details}` : ''}`.trim());
}

function requireValue(name, value) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

async function request(method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
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
    const summary =
      typeof payload === 'object' && payload !== null ? JSON.stringify(payload) : String(payload);
    const error = new Error(`${method} ${path} failed with ${response.status}: ${summary}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function randomNgPhone() {
  const operatorDigits = ['70', '80', '81', '90', '91'];
  const prefix = operatorDigits[Math.floor(Math.random() * operatorDigits.length)];
  const rest = `${Math.floor(Math.random() * 10 ** 8)}`.padStart(8, '0');
  return `+234${prefix}${rest}`;
}

function randomUser(tag) {
  const suffix = `${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  return {
    phoneNumber: randomNgPhone(),
    email: `${tag}.${suffix}@trumonie.qa`,
    username: `${tag}_${suffix}`.replace(/-/g, ''),
    firstName: tag.toUpperCase(),
    lastName: 'QA',
    password
  };
}

async function runStep(id, fn, options = {}) {
  const optional = Boolean(options.optional);
  try {
    const detail = await fn();
    record(id, 'PASS', detail ?? '', optional);
    return true;
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    record(id, optional ? 'SKIP' : 'FAIL', details, optional);
    return false;
  }
}

async function resolveAdminToken() {
  if (process.env.QA_ADMIN_TOKEN) {
    return process.env.QA_ADMIN_TOKEN;
  }
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
  console.log(`Running TruMonie P0 smoke checks against ${apiBase}`);

  const healthOk = await runStep('HEALTH-001', async () => {
    const health = await request('GET', '/health');
    if (health?.status !== 'ok') {
      throw new Error(`Unexpected health status: ${JSON.stringify(health)}`);
    }
    return 'API + dependencies healthy';
  });
  if (!healthOk) {
    process.exit(1);
  }

  const userAInput = randomUser('usera');
  const userBInput = randomUser('userb');

  const registeredA = await runStep('AUTH-001A', async () => {
    const response = await request('POST', '/auth/register', { body: userAInput });
    context.userA = response.user;
    context.userAToken = response.tokens?.accessToken ?? null;
    requireValue('userA.id', context.userA?.id);
    requireValue('userA.accessToken', context.userAToken);
    return `Registered ${userAInput.email}`;
  });
  if (!registeredA) process.exit(1);

  const registeredB = await runStep('AUTH-001B', async () => {
    const response = await request('POST', '/auth/register', { body: userBInput });
    context.userB = response.user;
    context.userBToken = response.tokens?.accessToken ?? null;
    requireValue('userB.id', context.userB?.id);
    requireValue('userB.accessToken', context.userBToken);
    return `Registered ${userBInput.email}`;
  });
  if (!registeredB) process.exit(1);

  await runStep('AUTH-002', async () => {
    const response = await request('POST', '/auth/login', {
      body: { identifier: userAInput.email, password }
    });
    const token = requireValue('login token', response?.tokens?.accessToken);
    context.userAToken = token;
    context.userARefreshToken = requireValue(
      'refresh token',
      response?.tokens?.refreshToken
    );
    return 'Login successful';
  });

  await runStep('AUTH-003', async () => {
    const response = await request('POST', '/auth/refresh', {
      body: { refreshToken: requireValue('refresh token', context.userARefreshToken) }
    });
    context.userAToken = requireValue('refreshed access token', response?.tokens?.accessToken);
    return 'Refresh token rotation successful';
  });

  await runStep('AUTH-006', async () => {
    const me = await request('GET', '/auth/me', { token: requireValue('userA token', context.userAToken) });
    if (!me?.id || me.id !== context.userA?.id) {
      throw new Error(`Unexpected /auth/me payload: ${JSON.stringify(me)}`);
    }
    return 'Authenticated profile returned';
  });

  await runStep('WALLET-001A', async () => {
    const wallets = await request('GET', '/wallets', { token: context.userAToken });
    if (!Array.isArray(wallets) || wallets.length === 0) {
      throw new Error(`No wallets returned for user A: ${JSON.stringify(wallets)}`);
    }
    context.userAWallet = wallets.find((w) => w.currency === currency) ?? wallets[0];
    requireValue('userA wallet id', context.userAWallet?.id);
    return `User A wallet ${context.userAWallet.id} (${context.userAWallet.currency})`;
  });

  await runStep('WALLET-001B', async () => {
    const wallets = await request('GET', '/wallets', { token: context.userBToken });
    if (!Array.isArray(wallets) || wallets.length === 0) {
      throw new Error(`No wallets returned for user B: ${JSON.stringify(wallets)}`);
    }
    context.userBWallet = wallets.find((w) => w.currency === currency) ?? wallets[0];
    requireValue('userB wallet id', context.userBWallet?.id);
    return `User B wallet ${context.userBWallet.id} (${context.userBWallet.currency})`;
  });

  await runStep('WALLET-002', async () => {
    const statement = await request(
      'GET',
      `/wallets/${requireValue('userA wallet id', context.userAWallet?.id)}/statement?limit=10&offset=0`,
      { token: context.userAToken }
    );
    if (typeof statement?.count !== 'number' || !Array.isArray(statement?.lines)) {
      throw new Error(`Unexpected statement payload: ${JSON.stringify(statement)}`);
    }
    return `Statement fetched (count=${statement.count})`;
  });

  await runStep('PAY-003A', async () => {
    await request('POST', '/payments/webhook/internal', {
      body: {
        idempotencyKey: `qa-fund-a-${Date.now()}`,
        reference: `QA-FUND-A-${Date.now()}`,
        userId: context.userA.id,
        amountMinor: fundingAmountMinor,
        currency
      },
      headers: { 'x-signature': 'qa-signature' }
    });
    return `Webhook funding posted for user A (${fundingAmountMinor} ${currency})`;
  });

  await runStep('PAY-003B', async () => {
    await request('POST', '/payments/webhook/internal', {
      body: {
        idempotencyKey: `qa-fund-b-${Date.now()}`,
        reference: `QA-FUND-B-${Date.now()}`,
        userId: context.userB.id,
        amountMinor: fundingAmountMinor,
        currency
      },
      headers: { 'x-signature': 'qa-signature' }
    });
    return `Webhook funding posted for user B (${fundingAmountMinor} ${currency})`;
  });

  await runStep('PAY-001', async () => {
    await request('POST', '/payments/p2p', {
      token: context.userAToken,
      body: {
        recipientIdentifier: context.userB.email,
        amountMinor: transferAmountMinor,
        currency,
        description: 'QA p2p transfer',
        idempotencyKey: `qa-p2p-${Date.now()}`
      }
    });
    return `P2P transfer sent (${transferAmountMinor} ${currency})`;
  });

  await runStep('LEDGER-001', async () => {
    await request('POST', '/ledger/transfer', {
      token: context.userAToken,
      body: {
        sourceAccountId: context.userAWallet.id,
        destinationAccountId: context.userBWallet.id,
        amountMinor: ledgerTransferAmountMinor,
        currency,
        description: 'QA ledger transfer',
        idempotencyKey: `qa-ledger-${Date.now()}`
      }
    });
    return `Ledger transfer posted (${ledgerTransferAmountMinor} ${currency})`;
  });

  await runStep('PAY-002', async () => {
    const payout = await request('POST', '/payments/bank-transfer', {
      token: context.userAToken,
      body: {
        amountMinor: transferAmountMinor,
        currency,
        bankCode: '000',
        accountNumber: '0000000000',
        accountName: 'QA Recipient',
        narration: 'QA payout',
        provider: 'internal'
      }
    });
    if (!payout?.providerReference) {
      throw new Error(`Unexpected payout response: ${JSON.stringify(payout)}`);
    }
    return `Bank transfer response ${payout.providerReference}`;
  });

  await runStep('AJO-003', async () => {
    const group = await request('POST', '/ajo/groups', {
      token: context.userAToken,
      body: {
        name: `QA Group ${Date.now()}`,
        currency,
        contributionAmountMinor: ajoContributionAmountMinor,
        memberTarget: 2
      }
    });
    context.groupId = requireValue('group id', group?.id);
    return `Created group ${context.groupId}`;
  });

  await runStep('AJO-004', async () => {
    const join = await request('POST', `/ajo/groups/${requireValue('group id', context.groupId)}/join`, {
      token: context.userBToken
    });
    requireValue('joined member id', join?.id);
    return `User B joined group ${context.groupId}`;
  });

  await runStep('AJO-005', async () => {
    const run = await request('POST', `/ajo/groups/${context.groupId}/run-cycle`, {
      token: context.userAToken
    });
    if (!run?.status) {
      throw new Error(`Unexpected run-cycle response: ${JSON.stringify(run)}`);
    }
    return `Cycle result: ${run.status}`;
  });

  await runStep('AJO-010', async () => {
    const result = await request('POST', `/ajo/groups/${context.groupId}/settle-penalties`, {
      token: context.userAToken
    });
    if (typeof result?.settled !== 'number') {
      throw new Error(`Unexpected settle response: ${JSON.stringify(result)}`);
    }
    return `Penalty settlement attempted (count=${result.settled})`;
  });

  const adminToken = await resolveAdminToken();
  if (!adminToken) {
    record(
      'PAY-005/RISK-001/RISK-002',
      'SKIP',
      'Provide QA_ADMIN_TOKEN or QA_ADMIN_IDENTIFIER/QA_ADMIN_PASSWORD to run admin checks',
      true
    );
  } else {
    await runStep(
      'PAY-005',
      async () => {
        await request('POST', '/payments/internal/fund', {
          token: adminToken,
          body: {
            userId: context.userA.id,
            amountMinor: 1000,
            currency,
            reference: `QA-ADMIN-FUND-${Date.now()}`,
            description: 'QA admin internal fund'
          }
        });
        return 'Admin internal funding successful';
      },
      { optional: true }
    );

    await runStep(
      'RISK-001',
      async () => {
        const response = await request('PATCH', `/risk/user/${context.userB.id}/freeze`, {
          token: adminToken
        });
        if (response?.status !== 'frozen') {
          throw new Error(`Unexpected freeze response: ${JSON.stringify(response)}`);
        }
        return `User ${context.userB.id} frozen`;
      },
      { optional: true }
    );

    await runStep(
      'RISK-002',
      async () => {
        const response = await request('PATCH', `/risk/user/${context.userB.id}/unfreeze`, {
          token: adminToken
        });
        if (response?.status !== 'unfrozen') {
          throw new Error(`Unexpected unfreeze response: ${JSON.stringify(response)}`);
        }
        return `User ${context.userB.id} unfrozen`;
      },
      { optional: true }
    );
  }

  const requiredFailures = results.filter((r) => r.status === 'FAIL' && !r.optional);
  const passed = results.filter((r) => r.status === 'PASS').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log('\nSummary');
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
