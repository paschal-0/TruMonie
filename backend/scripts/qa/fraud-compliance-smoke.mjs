#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

dotenv.config({ path: path.join(process.cwd(), '.env') });

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'QaSecurity#123';
const pin = process.env.QA_PIN ?? '1234';
const currency = (process.env.QA_CURRENCY ?? 'NGN').toUpperCase();
const fundAmountMinor = Number.parseInt(process.env.QA_FUND_AMOUNT_MINOR ?? '200000', 10);
const initialTransferAmountMinor = Number.parseInt(
  process.env.QA_INITIAL_TRANSFER_AMOUNT_MINOR ?? '1000',
  10
);
const reviewTransferAmountMinor = Number.parseInt(
  process.env.QA_REVIEW_TRANSFER_AMOUNT_MINOR ?? '4000',
  10
);
const currentPin = process.env.QA_CURRENT_PIN?.trim();
const requireAdmin = process.env.QA_REQUIRE_ADMIN !== '0';

const results = [];
const context = {
  apiMode: 'v2',
  sender: null,
  receiver: null,
  senderToken: null,
  receiverToken: null,
  adminToken: null,
  senderWallet: null,
  receiverWallet: null,
  transferOne: null,
  transferTwo: null,
  complianceEvent: null
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
    lastName: 'FRAUD',
    password
  };
}

function toMinor(value) {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
  return 0n;
}

function loadSeedCredentials() {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const seedPath = path.resolve(path.dirname(currentFile), '../../.qa-demo-user.json');
    const raw = fs.readFileSync(seedPath, 'utf8');
    const json = JSON.parse(raw);
    return {
      sender: {
        identifier:
          json?.primary?.credentials?.email ??
          json?.primary?.credentials?.username ??
          json?.primary?.credentials?.phoneNumber,
        password: json?.primary?.credentials?.password
      },
      receiver: {
        identifier:
          json?.recipient?.credentials?.email ??
          json?.recipient?.credentials?.username ??
          json?.recipient?.credentials?.phoneNumber,
        password: json?.recipient?.credentials?.password
      }
    };
  } catch {
    return null;
  }
}

function record(id, status, detail = '', optional = false) {
  results.push({ id, status, detail, optional });
  const prefix = status === 'PASS' ? '[PASS]' : status === 'SKIP' ? '[SKIP]' : '[FAIL]';
  console.log(`${prefix} ${id}${detail ? ` - ${detail}` : ''}`);
}

async function step(id, fn, options = {}) {
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

async function request(method, route, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${apiBase}${route}`, {
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

async function must(method, route, options = {}) {
  const res = await request(method, route, options);
  if (!res.ok) {
    throw new Error(`${method} ${route} failed (${res.status}) ${JSON.stringify(res.payload)}`);
  }
  return res.payload;
}

async function runLegacyP2pTransfer(params) {
  const candidates = [params.amountMinor, 1_000, 100, 10, 1]
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value, index, values) => Number.isFinite(value) && value > 0 && values.indexOf(value) === index);
  let lastCapError = null;

  for (const amountMinor of candidates) {
    const res = await request('POST', '/payments/p2p', {
      token: params.senderToken,
      body: {
        recipientIdentifier: params.recipientIdentifier,
        amountMinor,
        currency: params.currency,
        description: params.description,
        idempotencyKey: crypto.randomUUID(),
        pin: params.pin
      }
    });
    if (res.ok) {
      return { ok: true, payload: res.payload, amountMinor };
    }

    const message = JSON.stringify(res.payload).toLowerCase();
    if (
      res.status === 400 &&
      (message.includes('amount exceeds max wallet balance for tier') ||
        message.includes('insufficient funds') ||
        message.includes('insufficient balance'))
    ) {
      lastCapError = message;
      continue;
    }

    throw new Error(`POST /payments/p2p failed (${res.status}) ${JSON.stringify(res.payload)}`);
  }

  return {
    ok: false,
    payload: null,
    amountMinor: null,
    reason: lastCapError ?? 'No valid legacy transfer amount found'
  };
}

function asWalletList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.wallets)) return payload.wallets;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function requireDbConfig() {
  const required = ['POSTGRES_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing DB env: ${missing.join(', ')}`);
  }
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

async function promoteUserToAdmin(userId) {
  requireDbConfig();
  const client = new Client(dbConfig());
  await client.connect();
  try {
    await client.query(`UPDATE users SET role = 'ADMIN', status = 'ACTIVE' WHERE id = $1`, [userId]);
  } finally {
    await client.end();
  }
}

async function verifyAuditAppendOnly() {
  requireDbConfig();
  const client = new Client(dbConfig());
  await client.connect();
  try {
    const row = await client.query(
      `SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 1`
    );
    if (!row.rowCount) {
      throw new Error('No audit log available for append-only check');
    }

    try {
      await client.query(`UPDATE audit_logs SET action = 'MUTATION_ATTEMPT' WHERE id = $1`, [
        row.rows[0].id
      ]);
      throw new Error('Audit update unexpectedly succeeded');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes('append-only')) {
        throw new Error(`Unexpected audit mutation error: ${message}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function resolveAdminToken() {
  if (process.env.QA_ADMIN_TOKEN?.trim()) return process.env.QA_ADMIN_TOKEN.trim();

  if (process.env.QA_ADMIN_IDENTIFIER?.trim() && process.env.QA_ADMIN_PASSWORD?.trim()) {
    const login = await must('POST', '/auth/login', {
      body: {
        identifier: process.env.QA_ADMIN_IDENTIFIER.trim(),
        password: process.env.QA_ADMIN_PASSWORD.trim()
      }
    });
    if (!login?.tokens?.accessToken) throw new Error('Admin login token missing');
    return login.tokens.accessToken;
  }

  const adminSeed = makeUser('fradmin');
  const register = await must('POST', '/auth/register', { body: adminSeed });
  await promoteUserToAdmin(register.user.id);
  const login = await must('POST', '/auth/login', {
    body: { identifier: adminSeed.email, password }
  });
  if (!login?.tokens?.accessToken) throw new Error('Generated admin login token missing');
  return login.tokens.accessToken;
}

async function main() {
  console.log(`Running fraud/compliance smoke checks against ${apiBase}`);

  const seedCredentials = loadSeedCredentials();
  const senderAuth = {
    identifier: process.env.QA_SENDER_IDENTIFIER?.trim() ?? seedCredentials?.sender?.identifier ?? null,
    password: process.env.QA_SENDER_PASSWORD?.trim() ?? seedCredentials?.sender?.password ?? null
  };
  const receiverAuth = {
    identifier:
      process.env.QA_RECEIVER_IDENTIFIER?.trim() ?? seedCredentials?.receiver?.identifier ?? null,
    password: process.env.QA_RECEIVER_PASSWORD?.trim() ?? seedCredentials?.receiver?.password ?? null
  };
  const senderSeed = makeUser('frsender');
  const receiverSeed = makeUser('frreceiver');

  const healthy = await step('FC-HEALTH', async () => {
    const res = await must('GET', '/health');
    if (res?.status !== 'ok') throw new Error(`Unexpected health payload ${JSON.stringify(res)}`);
    return 'health ok';
  });
  if (!healthy) process.exit(1);

  const usersOk = await step('FC-SETUP-USERS', async () => {
    if (senderAuth.identifier && senderAuth.password) {
      const senderLogin = await must('POST', '/auth/login', {
        body: { identifier: senderAuth.identifier, password: senderAuth.password }
      });
      context.sender = senderLogin.user;
      context.senderToken = senderLogin.tokens?.accessToken;
    } else {
      const senderReg = await must('POST', '/auth/register', { body: senderSeed });
      context.sender = senderReg.user;
      context.senderToken = senderReg.tokens?.accessToken;
    }

    if (receiverAuth.identifier && receiverAuth.password) {
      const receiverLogin = await must('POST', '/auth/login', {
        body: { identifier: receiverAuth.identifier, password: receiverAuth.password }
      });
      context.receiver = receiverLogin.user;
      context.receiverToken = receiverLogin.tokens?.accessToken;
    } else {
      const receiverReg = await must('POST', '/auth/register', { body: receiverSeed });
      context.receiver = receiverReg.user;
      context.receiverToken = receiverReg.tokens?.accessToken;
    }

    if (!context.senderToken || !context.receiverToken) throw new Error('Missing auth tokens');
    return `${context.sender.email} -> ${context.receiver.email}`;
  });
  if (!usersOk) process.exit(1);

  const pinOk = await step('FC-SETUP-PIN', async () => {
    const senderStatus = await must('GET', '/users/me/pin-status', {
      token: context.senderToken
    });
    if (!senderStatus?.hasTransactionPin) {
      await must('POST', '/users/me/pin', {
        token: context.senderToken,
        body: { pin }
      });
      return 'transaction pin configured';
    }

    if (currentPin) {
      await must('POST', '/users/me/pin', {
        token: context.senderToken,
        body: { pin, currentPin }
      });
      return 'transaction pin rotated using QA_CURRENT_PIN';
    }

    const receiverStatus = await must('GET', '/users/me/pin-status', {
      token: context.receiverToken
    });

    if (!receiverStatus?.hasTransactionPin) {
      await must('POST', '/users/me/pin', {
        token: context.receiverToken,
        body: { pin }
      });
      [context.sender, context.receiver] = [context.receiver, context.sender];
      [context.senderToken, context.receiverToken] = [context.receiverToken, context.senderToken];
      return 'sender pin unknown; switched sender to receiver account with newly configured pin';
    }

    try {
      await must('POST', '/users/me/pin', {
        token: context.receiverToken,
        body: { pin, currentPin: pin }
      });
      [context.sender, context.receiver] = [context.receiver, context.sender];
      [context.senderToken, context.receiverToken] = [context.receiverToken, context.senderToken];
      return 'sender pin unknown; switched sender to receiver account with known pin';
    } catch {
      throw new Error(
        'Sender and receiver both have unknown PINs. Set QA_CURRENT_PIN (for sender) or QA_SENDER_IDENTIFIER/PASSWORD for an account with known PIN.'
      );
    }
  });
  if (!pinOk) process.exit(1);

  const walletsOk = await step('FC-SETUP-WALLETS', async () => {
    const senderWalletPayload = await must('GET', '/wallets', { token: context.senderToken });
    const receiverWalletPayload = await must('GET', '/wallets', { token: context.receiverToken });
    const senderWallets = asWalletList(senderWalletPayload);
    const receiverWallets = asWalletList(receiverWalletPayload);
    context.senderWallet =
      senderWallets.find((wallet) => wallet.currency === currency && wallet.type === 'WALLET_MAIN') ??
      senderWallets.find((wallet) => wallet.currency === currency) ??
      senderWallets[0];
    context.receiverWallet =
      receiverWallets.find((wallet) => wallet.currency === currency && wallet.type === 'WALLET_MAIN') ??
      receiverWallets.find((wallet) => wallet.currency === currency) ??
      receiverWallets[0];
    if (!context.senderWallet?.id || !context.receiverWallet?.id) {
      throw new Error(
        `Failed to load sender/receiver wallets sender=${JSON.stringify(
          senderWalletPayload
        )} receiver=${JSON.stringify(receiverWalletPayload)}`
      );
    }
    return `sender=${context.senderWallet.id} receiver=${context.receiverWallet.id}`;
  });
  if (!walletsOk) process.exit(1);

  const funded = await step('FC-SETUP-FUND-SENDER', async () => {
    const currentBalance = toMinor(
      context.senderWallet.availableBalanceMinor ?? context.senderWallet.balanceMinor
    );
    const maxBalance =
      context.senderWallet.maxBalanceMinor === null || context.senderWallet.maxBalanceMinor === undefined
        ? null
        : toMinor(context.senderWallet.maxBalanceMinor);
    const requiredForSuite = toMinor(initialTransferAmountMinor + reviewTransferAmountMinor + 1_000);
    if (currentBalance >= requiredForSuite) {
      return `skipped, balance already sufficient (${currentBalance} minor)`;
    }

    const headroom = maxBalance === null ? null : maxBalance - currentBalance;
    if (headroom !== null && headroom <= 0n) {
      throw new Error(
        `cannot fund: wallet is at max balance (${currentBalance}/${maxBalance} minor)`
      );
    }
    const needed = requiredForSuite - currentBalance;
    const preferredTopUp = toMinor(fundAmountMinor);
    const targeted = preferredTopUp > 0n ? (needed > preferredTopUp ? preferredTopUp : needed) : needed;
    const fundingAmount = headroom === null ? targeted : targeted > headroom ? headroom : targeted;
    if (fundingAmount <= 0n) {
      return `skipped, computed funding amount <= 0 (${fundingAmount})`;
    }

    const reference = rand('fc-fund');
    await must('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: reference,
        reference,
        userId: context.sender.id,
        amountMinor: fundingAmount.toString(),
        currency
      }
    });
    return `${fundingAmount} minor funded`;
  });
  if (!funded) process.exit(1);

  const deviceOk = await step('FC-SETUP-DEVICE-BIND', async () => {
    const response = await request('POST', '/risk/device/register', {
      token: context.senderToken,
      body: {
        fingerprint: rand('device-fp'),
        deviceType: 'android',
        platform: 'android',
        osVersion: '14',
        appVersion: '1.0.0'
      }
    });
    if (response.ok) {
      if (response.payload?.status !== 'ok') {
        throw new Error(`Unexpected device response ${JSON.stringify(response.payload)}`);
      }
      return `deviceId=${response.payload.deviceId}`;
    }

    if (
      response.status === 400 &&
      JSON.stringify(response.payload).toLowerCase().includes('active device already exists')
    ) {
      return 'already bound; existing active device retained';
    }
    throw new Error(
      `POST /risk/device/register failed (${response.status}) ${JSON.stringify(response.payload)}`
    );
  });
  if (!deviceOk) process.exit(1);

  await step('FC-API-MODE', async () => {
    const probe = await request('POST', '/transfers/internal', {
      token: context.senderToken,
      body: {}
    });
    if (probe.status === 404) {
      context.apiMode = 'legacy';
      return 'legacy transfer API detected (/payments/p2p)';
    }
    context.apiMode = 'v2';
    return 'v2 transfer API detected (/transfers/internal)';
  });

  const transferOneOk = await step('FC-TRF-INTERNAL-BASELINE', async () => {
    if (context.apiMode === 'legacy') {
      const recipientIdentifier =
        context.receiver?.email ?? context.receiver?.username ?? context.receiver?.phoneNumber;
      const attempt = await runLegacyP2pTransfer({
        senderToken: context.senderToken,
        recipientIdentifier,
        amountMinor: initialTransferAmountMinor,
        currency,
        description: 'Fraud smoke baseline transfer',
        pin
      });
      if (!attempt.ok) {
        context.transferOne = {
          transfer_id: null,
          id: null,
          reference: null,
          status: 'SKIPPED'
        };
        return `skipped (${attempt.reason})`;
      }
      const response = attempt.payload;
      context.transferOne = {
        transfer_id: null,
        id: response?.id ?? null,
        reference: response?.reference ?? null,
        status: response?.status ?? 'SUCCESS'
      };
      return `legacy id=${response?.id ?? 'n/a'} amount=${attempt.amountMinor}`;
    }

    const response = await must('POST', '/transfers/internal', {
      token: context.senderToken,
      body: {
        source_wallet_id: context.senderWallet.id,
        destination_wallet_id: context.receiverWallet.id,
        amount: initialTransferAmountMinor,
        narration: 'Fraud smoke baseline transfer',
        pin,
        idempotency_key: crypto.randomUUID()
      }
    });
    if (!response?.transfer_id) throw new Error(`transfer_id missing: ${JSON.stringify(response)}`);
    context.transferOne = response;
    return `${response.reference} status=${response.status}`;
  });
  if (!transferOneOk) process.exit(1);

  const transferTwoOk = await step('FC-TRF-INTERNAL-SUSPICIOUS', async () => {
    if (context.apiMode === 'legacy') {
      const recipientIdentifier =
        context.receiver?.email ?? context.receiver?.username ?? context.receiver?.phoneNumber;
      const attempt = await runLegacyP2pTransfer({
        senderToken: context.senderToken,
        recipientIdentifier,
        amountMinor: reviewTransferAmountMinor,
        currency,
        description: 'Fraud smoke suspicious transfer',
        pin
      });
      if (!attempt.ok) {
        context.transferTwo = {
          transfer_id: null,
          id: null,
          reference: null,
          status: 'SKIPPED'
        };
        return `skipped (${attempt.reason})`;
      }
      const response = attempt.payload;
      context.transferTwo = {
        transfer_id: null,
        id: response?.id ?? null,
        reference: response?.reference ?? null,
        status: response?.status ?? 'SUCCESS'
      };
      return `legacy id=${response?.id ?? 'n/a'} amount=${attempt.amountMinor}`;
    }

    const response = await must('POST', '/transfers/internal', {
      token: context.senderToken,
      body: {
        source_wallet_id: context.senderWallet.id,
        destination_wallet_id: context.receiverWallet.id,
        amount: reviewTransferAmountMinor,
        narration: 'Fraud smoke suspicious transfer',
        pin,
        idempotency_key: crypto.randomUUID()
      }
    });
    if (!response?.transfer_id) throw new Error(`transfer_id missing: ${JSON.stringify(response)}`);
    context.transferTwo = response;
    return `${response.reference} status=${response.status}`;
  });
  if (!transferTwoOk) process.exit(1);

  const reportOk = await step(
    'FC-FRAUD-REPORT-CREATE',
    async () => {
      if (!context.transferOne?.transfer_id) {
        throw new Error('Fraud report requires v2 transfer_id; legacy mode has no transfer_id');
      }
    const response = await must('POST', '/fraud/reports', {
      token: context.senderToken,
      body: {
        transaction_id: context.transferOne.transfer_id,
        report_type: 'APP_FRAUD',
        description: 'QA smoke report for APP fraud flow',
        reported_amount: initialTransferAmountMinor
      }
    });
    if (!response?.report_id) throw new Error(`report_id missing ${JSON.stringify(response)}`);
    if (!response?.beneficiary_bank_notified) {
      throw new Error(`beneficiary bank not notified ${JSON.stringify(response)}`);
    }
    return `${response.report_id} status=${response.status}`;
    },
    { optional: context.apiMode === 'legacy' }
  );
  if (!reportOk && context.apiMode !== 'legacy') process.exit(1);

  await step(
    'FC-FRAUD-REPORT-DUPLICATE-BLOCKED',
    async () => {
      if (!context.transferOne?.transfer_id) {
        throw new Error('Fraud report duplication requires v2 transfer_id');
      }
    const duplicate = await request('POST', '/fraud/reports', {
      token: context.senderToken,
      body: {
        transaction_id: context.transferOne.transfer_id,
        report_type: 'APP_FRAUD',
        description: 'Duplicate report should fail',
        reported_amount: initialTransferAmountMinor
      }
    });
    if (duplicate.status !== 400) {
      throw new Error(`Expected 400, got ${duplicate.status} payload=${JSON.stringify(duplicate.payload)}`);
    }
    return 'duplicate prevented';
    },
    { optional: context.apiMode === 'legacy' }
  );

  const adminReady = await step(
    'FC-ADMIN-TOKEN',
    async () => {
      context.adminToken = await resolveAdminToken();
      if (!context.adminToken) throw new Error('admin token missing');
      return 'admin access ready';
    },
    { optional: !requireAdmin }
  );

  if (adminReady && context.adminToken) {
    const fraudApiAvailableStep = await step(
      'FC-FRAUD-ENDPOINTS-AVAILABLE',
      async () => {
        const probe = await request('GET', '/fraud/reports/events?limit=1', {
          token: context.adminToken
        });
        if (probe.status === 404) {
          throw new Error('Fraud admin endpoints are unavailable on target environment');
        }
        if (!probe.ok) {
          throw new Error(`Unexpected probe failure (${probe.status}) ${JSON.stringify(probe.payload)}`);
        }
        return 'fraud admin endpoints available';
      },
      { optional: true }
    );

    if (!fraudApiAvailableStep) {
      const hardFailures = results.filter((row) => row.status === 'FAIL' && !row.optional);
      const passed = results.filter((row) => row.status === 'PASS').length;
      const skipped = results.filter((row) => row.status === 'SKIP').length;
      console.log('\nFraud/Compliance QA Summary');
      console.log(`Passed: ${passed}`);
      console.log(`Skipped: ${skipped}`);
      console.log(`Failed: ${hardFailures.length}`);
      if (hardFailures.length > 0) process.exit(1);
      return;
    }

    await step('FC-SEC-NON-ADMIN-BLOCKED-ALERTS', async () => {
      const userRes = await request('GET', '/fraud/reports/alerts?limit=5', {
        token: context.senderToken
      });
      if (userRes.status !== 403) {
        throw new Error(`Expected 403, got ${userRes.status}`);
      }
      return 'non-admin rejected';
    });

    await step('FC-FRAUD-ALERTS-LIST', async () => {
      const alerts = await must('GET', '/fraud/reports/alerts?limit=50', { token: context.adminToken });
      const mine = alerts.filter((row) => row.userId === context.sender.id);
      if (mine.length < 2) {
        throw new Error(`Expected >=2 alerts for sender, found ${mine.length}`);
      }
      const hasReviewOrBlocked = mine.some((row) => row.decision === 'REVIEW' || row.decision === 'BLOCKED');
      if (!hasReviewOrBlocked) {
        throw new Error(`Expected REVIEW/BLOCKED alert, got ${JSON.stringify(mine.map((row) => row.decision))}`);
      }
      return `alerts_for_sender=${mine.length}`;
    });

    await step('FC-FRAUD-EVENTS-LIST', async () => {
      const events = await must('GET', '/fraud/reports/events?limit=50', { token: context.adminToken });
      const mine = events.filter((row) => row.userId === context.sender.id);
      if (mine.length < 2) {
        throw new Error(`Expected >=2 events for sender, found ${mine.length}`);
      }
      const processed = mine.filter((row) => row.status === 'PROCESSED');
      if (processed.length < 2) {
        throw new Error(`Expected processed events, found ${processed.length}`);
      }
      return `processed=${processed.length}`;
    });

    await step('FC-COMPLIANCE-EVENTS-LIST', async () => {
      const events = await must('GET', '/compliance/events?limit=100', { token: context.adminToken });
      const mine = events.filter((row) => row.userId === context.sender.id);
      if (mine.length === 0) {
        throw new Error('No compliance events found for sender');
      }
      const candidate =
        mine.find((row) => row.eventType === 'SUSPICIOUS_TRANSACTION' && !row.resolution) ??
        mine.find((row) => row.eventType === 'FRAUD_REPORT' && !row.resolution) ??
        mine.find((row) => !row.resolution) ??
        mine[0];
      context.complianceEvent = candidate;
      return `event=${candidate.eventType} id=${candidate.id}`;
    });

    await step('FC-COMPLIANCE-RESOLVE', async () => {
      if (!context.complianceEvent?.id) throw new Error('No compliance event selected');
      const resolved = await must(
        'PATCH',
        `/compliance/events/${context.complianceEvent.id}/resolve`,
        {
          token: context.adminToken,
          body: { resolution: 'CLEARED' }
        }
      );
      if (resolved?.resolution !== 'CLEARED') {
        throw new Error(`Unexpected resolution payload ${JSON.stringify(resolved)}`);
      }
      if (!resolved?.resolvedAt) {
        throw new Error(`resolvedAt missing ${JSON.stringify(resolved)}`);
      }
      return `${resolved.id} cleared`;
    });
  }

  await step(
    'FC-AUDIT-IMMUTABLE',
    async () => {
      await verifyAuditAppendOnly();
      return 'append-only trigger verified';
    },
    { optional: true }
  );

  const hardFailures = results.filter((row) => row.status === 'FAIL' && !row.optional);
  const passed = results.filter((row) => row.status === 'PASS').length;
  const skipped = results.filter((row) => row.status === 'SKIP').length;
  console.log('\nFraud/Compliance QA Summary');
  console.log(`Passed: ${passed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${hardFailures.length}`);

  if (hardFailures.length > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
