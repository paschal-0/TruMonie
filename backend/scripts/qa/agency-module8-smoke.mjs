#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'TruMonie#123';
const transactionPin = process.env.QA_PIN ?? '1234';
const principalId = process.env.QA_AGENCY_PRINCIPAL_ID ?? '00000000-0000-0000-0000-000000000001';
const superAgentId =
  process.env.QA_AGENCY_SUPER_AGENT_ID ?? '00000000-0000-0000-0000-000000000002';

const results = [];
const context = {
  adminToken: null,
  agentUser: null,
  customerUser: null,
  agentToken: null,
  customerToken: null,
  agentMainWallet: null,
  customerMainWallet: null,
  agencyProfile: null
};

function record(id, status, details = '', optional = false) {
  results.push({ id, status, details, optional });
  const prefix = status === 'PASS' ? '[PASS]' : status === 'SKIP' ? '[SKIP]' : '[FAIL]';
  console.log(`${prefix} ${id}${details ? ` - ${details}` : ''}`);
}

function ensure(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function idempotency() {
  return crypto.randomUUID();
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
    firstName: tag.toUpperCase(),
    lastName: 'QA',
    password
  };
}

async function request(method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let payload = null;
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

async function runStep(id, fn, options = {}) {
  const optional = Boolean(options.optional);
  try {
    const detail = await fn();
    record(id, 'PASS', detail ?? '', optional);
    return true;
  } catch (error) {
    const details =
      error instanceof Error
        ? `${error.message}${error.payload ? ` | ${JSON.stringify(error.payload)}` : ''}`
        : String(error);
    record(id, optional ? 'SKIP' : 'FAIL', details, optional);
    return false;
  }
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

async function registerAndLoginUser(user) {
  const registered = await request('POST', '/auth/register', { body: user });
  const accessToken = ensure(registered?.tokens?.accessToken, 'Missing access token after register');
  return {
    user: ensure(registered?.user, 'Missing user payload after register'),
    token: accessToken
  };
}

async function main() {
  console.log(`Running Module 8 agency banking smoke against ${apiBase}`);

  const healthy = await runStep('M8-HEALTH', async () => {
    const health = await request('GET', '/health');
    if (health?.status !== 'ok') throw new Error(`Unexpected health: ${JSON.stringify(health)}`);
    return 'health ok';
  });
  if (!healthy) process.exit(1);

  const agentUserInput = randomUser('m8agent');
  const customerUserInput = randomUser('m8customer');

  const agentReg = await runStep('M8-AUTH-REGISTER-AGENT', async () => {
    const result = await registerAndLoginUser(agentUserInput);
    context.agentUser = result.user;
    context.agentToken = result.token;
    return agentUserInput.email;
  });
  if (!agentReg) process.exit(1);

  const customerReg = await runStep('M8-AUTH-REGISTER-CUSTOMER', async () => {
    const result = await registerAndLoginUser(customerUserInput);
    context.customerUser = result.user;
    context.customerToken = result.token;
    return customerUserInput.email;
  });
  if (!customerReg) process.exit(1);

  await runStep('M8-SET-PINS', async () => {
    await request('POST', '/users/me/pin', {
      token: context.agentToken,
      body: { pin: transactionPin }
    });
    await request('POST', '/users/me/pin', {
      token: context.customerToken,
      body: { pin: transactionPin }
    });
    return 'agent/customer transaction pins set';
  });

  const walletStep = await runStep('M8-WALLETS', async () => {
    const [agentWallets, customerWallets] = await Promise.all([
      request('GET', '/wallets', { token: context.agentToken }),
      request('GET', '/wallets', { token: context.customerToken })
    ]);
    context.agentMainWallet = agentWallets.find((wallet) => wallet.currency === 'NGN');
    context.customerMainWallet = customerWallets.find((wallet) => wallet.currency === 'NGN');
    ensure(context.agentMainWallet?.id, 'Agent NGN wallet missing');
    ensure(context.customerMainWallet?.accountNumber, 'Customer account number missing');
    return `${context.customerMainWallet.accountNumber}`;
  });
  if (!walletStep) process.exit(1);

  context.adminToken = await resolveAdminToken();
  if (!context.adminToken) {
    record(
      'M8-ADMIN-REQUIRED',
      'SKIP',
      'Provide QA_ADMIN_TOKEN or QA_ADMIN_IDENTIFIER/QA_ADMIN_PASSWORD for full agency flow',
      true
    );
    process.exit(0);
  }

  await runStep('M8-FUND-AGENT-MAIN-WALLET', async () => {
    await request('POST', '/payments/internal/fund', {
      token: context.adminToken,
      body: {
        userId: context.agentUser.id,
        amountMinor: 3_000_000, // ₦30,000
        currency: 'NGN',
        reference: `M8-FUND-${Date.now()}`,
        description: 'Module 8 smoke funding'
      }
    });
    return 'agent main wallet funded';
  });

  const onboarded = await runStep('M8-AGENT-ONBOARD', async () => {
    const response = await request('POST', '/agents/onboard', {
      token: context.agentToken,
      body: {
        business_name: `Agency Shop ${Date.now()}`,
        agent_type: 'INDIVIDUAL',
        business_address: {
          street: '10 Broad Street',
          city: 'Lagos',
          state: 'Lagos',
          country: 'NG'
        },
        geo_location: {
          lat: 6.5244,
          lng: 3.3792
        },
        principal_id: principalId,
        super_agent_id: superAgentId,
        float_limit: 200_000_000,
        low_balance_threshold: 2_000_000
      }
    });
    context.agencyProfile = response;
    ensure(context.agencyProfile?.id, 'Agent profile ID missing');
    ensure(context.agencyProfile?.wallet_id, 'Agent wallet id missing');
    return context.agencyProfile.id;
  });
  if (!onboarded) process.exit(1);

  const activated = await runStep('M8-ADMIN-ACTIVATE-AGENT', async () => {
    const response = await request(
      'PATCH',
      `/admin/agents/${context.agencyProfile.id}/status`,
      {
        token: context.adminToken,
        body: { status: 'ACTIVE', reason: 'QA activation' }
      }
    );
    if (response?.status !== 'ACTIVE') {
      throw new Error(`Agent activation failed: ${JSON.stringify(response)}`);
    }
    return response.status;
  });
  if (!activated) process.exit(1);

  await runStep('M8-FUND-AGENT-DEDICATED-WALLET', async () => {
    await request('POST', '/transfers/internal', {
      token: context.agentToken,
      body: {
        source_wallet_id: context.agentMainWallet.id,
        destination_wallet_id: context.agencyProfile.wallet_id,
        amount: 1_000_000, // ₦10,000
        narration: 'Fund dedicated agent wallet',
        pin: transactionPin,
        idempotency_key: idempotency()
      }
    });
    return 'dedicated agent wallet funded';
  });

  await runStep('M8-CASH-IN', async () => {
    const response = await request('POST', '/agents/cash-in', {
      token: context.agentToken,
      body: {
        agent_id: context.agencyProfile.id,
        customer_account: context.customerMainWallet.accountNumber,
        amount: 200_000, // ₦2,000
        agent_pin: transactionPin,
        idempotency_key: idempotency(),
        principal_id: principalId
      }
    });
    if (response?.status !== 'SUCCESS') {
      throw new Error(`Unexpected cash-in response: ${JSON.stringify(response)}`);
    }
    return response.reference;
  });

  await runStep('M8-CASH-OUT', async () => {
    const response = await request('POST', '/agents/cash-out', {
      token: context.agentToken,
      body: {
        agent_id: context.agencyProfile.id,
        customer_account: context.customerMainWallet.accountNumber,
        amount: 100_000, // ₦1,000
        customer_pin: transactionPin,
        agent_pin: transactionPin,
        idempotency_key: idempotency(),
        principal_id: principalId
      }
    });
    if (response?.status !== 'SUCCESS') {
      throw new Error(`Unexpected cash-out response: ${JSON.stringify(response)}`);
    }
    return response.reference;
  });

  await runStep('M8-METRICS', async () => {
    const response = await request('GET', '/agents/me/metrics', { token: context.agentToken });
    if (!response?.today || !response?.this_week) {
      throw new Error(`Unexpected metrics payload: ${JSON.stringify(response)}`);
    }
    return `score=${response.performance_score}`;
  });

  await runStep('M8-TRANSACTIONS-LIST', async () => {
    const response = await request('GET', '/agents/me/transactions?limit=10', {
      token: context.agentToken
    });
    const rows = Array.isArray(response?.transactions) ? response.transactions : [];
    if (rows.length === 0) {
      throw new Error('No agent transactions found');
    }
    return `count=${rows.length}`;
  });

  await runStep('M8-COMMISSIONS-LIST', async () => {
    const response = await request('GET', '/agents/me/commissions?limit=10', {
      token: context.agentToken
    });
    const rows = Array.isArray(response?.commissions) ? response.commissions : [];
    if (rows.length === 0) {
      throw new Error('No agent commissions found');
    }
    return `count=${rows.length}`;
  });

  const requiredFailures = results.filter((row) => row.status === 'FAIL' && !row.optional);
  const passed = results.filter((row) => row.status === 'PASS').length;
  const skipped = results.filter((row) => row.status === 'SKIP').length;

  console.log('\nModule 8 QA Summary');
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

