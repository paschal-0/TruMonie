#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const targetBalanceMinor = Number.parseInt(
  process.env.QA_DEMO_TARGET_BALANCE_MINOR ?? '20000000',
  10
);
const seedRecipient = (process.env.QA_SEED_RECIPIENT ?? 'true').toLowerCase() !== 'false';
const outputPath =
  process.env.QA_DEMO_OUTPUT ?? path.join(process.cwd(), '.qa-demo-user.json');

function randomNgPhone() {
  const rest = `${Math.floor(Math.random() * 10 ** 7)}`.padStart(7, '0');
  return `+234803${rest}`;
}

function withSuffix(identity, suffix) {
  return {
    ...identity,
    phoneNumber: randomNgPhone(),
    email: `${identity.username}.${suffix}@trumonie.qa`,
    username: `${identity.username}${suffix}`
  };
}

const primarySeed = {
  email: process.env.QA_DEMO_EMAIL ?? 'demo.user@trumonie.qa',
  phoneNumber: process.env.QA_DEMO_PHONE ?? '+2348030000001',
  username: process.env.QA_DEMO_USERNAME ?? 'demo_user',
  firstName: process.env.QA_DEMO_FIRST_NAME ?? 'Demo',
  lastName: process.env.QA_DEMO_LAST_NAME ?? 'User',
  password: process.env.QA_DEMO_PASSWORD ?? 'TruMonie#123',
  usePhoneAsAccountNumber:
    (process.env.QA_DEMO_USE_PHONE_AS_ACCOUNT_NUMBER ?? 'false').toLowerCase() === 'true'
};

const recipientSeed = {
  email: process.env.QA_RECIPIENT_EMAIL ?? 'demo.recipient@trumonie.qa',
  phoneNumber: process.env.QA_RECIPIENT_PHONE ?? '+2348030000002',
  username: process.env.QA_RECIPIENT_USERNAME ?? 'demo_recipient',
  firstName: process.env.QA_RECIPIENT_FIRST_NAME ?? 'Demo',
  lastName: process.env.QA_RECIPIENT_LAST_NAME ?? 'Recipient',
  password: process.env.QA_RECIPIENT_PASSWORD ?? 'TruMonie#123',
  usePhoneAsAccountNumber:
    (process.env.QA_RECIPIENT_USE_PHONE_AS_ACCOUNT_NUMBER ?? 'false').toLowerCase() === 'true'
};

async function request(method, route, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  let response;
  try {
    response = await fetch(`${apiBase}${route}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    const networkError = new Error(
      `Could not reach ${apiBase}. Start backend first (npm run start:dev).`
    );
    networkError.cause = error;
    throw networkError;
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const error = new Error(`${method} ${route} failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function login(identifier, password) {
  const result = await request('POST', '/auth/login', {
    body: { identifier, password }
  });
  return {
    user: result.user,
    accessToken: result.tokens?.accessToken
  };
}

function ensureAccessToken(accessToken, context) {
  if (!accessToken) {
    throw new Error(`Missing access token for ${context}`);
  }
  return accessToken;
}

async function registerOrLogin(seed, label) {
  try {
    const result = await request('POST', '/auth/register', { body: seed });
    return {
      mode: 'registered',
      seed,
      user: result.user,
      accessToken: ensureAccessToken(result.tokens?.accessToken, `${label} register`)
    };
  } catch (error) {
    if (!(error instanceof Error) || typeof error.status !== 'number') {
      throw error;
    }
    if (error.status !== 400 && error.status !== 409) {
      throw error;
    }

    try {
      const existing = await login(seed.email, seed.password);
      return {
        mode: 'existing',
        seed,
        user: existing.user,
        accessToken: ensureAccessToken(existing.accessToken, `${label} login`)
      };
    } catch {
      const suffix = `${Date.now()}${crypto.randomInt(100, 999)}`;
      const fallbackSeed = withSuffix(seed, suffix);
      const created = await request('POST', '/auth/register', { body: fallbackSeed });
      return {
        mode: 'registered-fallback',
        seed: fallbackSeed,
        user: created.user,
        accessToken: ensureAccessToken(created.tokens?.accessToken, `${label} fallback register`)
      };
    }
  }
}

async function getNgnWallet(accessToken) {
  const wallets = await request('GET', '/wallets', { token: accessToken });
  if (!Array.isArray(wallets) || wallets.length === 0) {
    throw new Error('No wallets returned.');
  }
  const ngn = wallets.find((wallet) => wallet.currency === 'NGN');
  if (!ngn) {
    throw new Error('NGN wallet not found.');
  }
  return ngn;
}

async function fundToTarget({ userId, currentBalanceMinor }) {
  const current = Number.parseInt(String(currentBalanceMinor ?? '0'), 10);
  if (!Number.isFinite(current) || current < 0) {
    throw new Error(`Invalid current balance: ${currentBalanceMinor}`);
  }
  if (current >= targetBalanceMinor) {
    return { funded: false, amountMinor: 0, reference: null };
  }

  const amountMinor = targetBalanceMinor - current;
  const reference = `QA-SEED-DEMO-${Date.now()}`;
  await request('POST', '/payments/webhook/internal', {
    headers: { 'x-signature': 'qa-signature' },
    body: {
      idempotencyKey: reference,
      reference,
      userId,
      amountMinor,
      currency: 'NGN'
    }
  });
  return { funded: true, amountMinor, reference };
}

function asNaira(minor) {
  const value = Number.parseInt(String(minor ?? '0'), 10);
  if (!Number.isFinite(value)) return '0.00';
  return (value / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

async function main() {
  console.log(`Seeding demo user against ${apiBase}`);

  let primary = await registerOrLogin(primarySeed, 'primary');
  let primaryWalletBefore;
  try {
    primaryWalletBefore = await getNgnWallet(primary.accessToken);
  } catch {
    // Handles legacy users created before wallet bootstrap/account-number migration.
    const suffix = `${Date.now()}${crypto.randomInt(100, 999)}`;
    const fallbackSeed = withSuffix(primarySeed, suffix);
    primary = await registerOrLogin(fallbackSeed, 'primary-fallback-wallet');
    primaryWalletBefore = await getNgnWallet(primary.accessToken);
  }
  const funding = await fundToTarget({
    userId: primary.user.id,
    currentBalanceMinor: primaryWalletBefore.balanceMinor
  });
  const primaryWalletAfter = await getNgnWallet(primary.accessToken);

  let recipient = null;
  if (seedRecipient) {
    recipient = await registerOrLogin(recipientSeed, 'recipient');
  }

  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    targetBalanceMinor,
    primary: {
      mode: primary.mode,
      credentials: {
        email: primary.seed.email,
        phoneNumber: primary.seed.phoneNumber,
        username: primary.seed.username,
        password: primary.seed.password
      },
      userId: primary.user.id,
      wallet: {
        id: primaryWalletAfter.id,
        currency: primaryWalletAfter.currency,
        accountNumber: primaryWalletAfter.accountNumber,
        balanceMinor: primaryWalletAfter.balanceMinor
      },
      funding
    },
    recipient: recipient
      ? {
          mode: recipient.mode,
          credentials: {
            email: recipient.seed.email,
            phoneNumber: recipient.seed.phoneNumber,
            username: recipient.seed.username,
            password: recipient.seed.password
          },
          userId: recipient.user.id
        }
      : null
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log('\nDemo seed complete');
  console.log(`Primary login email: ${output.primary.credentials.email}`);
  console.log(`Primary login phone: ${output.primary.credentials.phoneNumber}`);
  console.log(`Primary password: ${output.primary.credentials.password}`);
  console.log(`NGN account number: ${output.primary.wallet.accountNumber ?? 'N/A'}`);
  console.log(`NGN balance: \u20A6${asNaira(output.primary.wallet.balanceMinor)}`);
  if (output.recipient) {
    console.log(`Recipient login email: ${output.recipient.credentials.email}`);
    console.log(`Recipient password: ${output.recipient.credentials.password}`);
  }
  console.log(`Wrote: ${outputPath}`);
}

void main().catch((error) => {
  const status = typeof error?.status === 'number' ? `status=${error.status}` : '';
  const payload =
    error?.payload !== undefined ? ` payload=${JSON.stringify(error.payload)}` : '';
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)} ${status}${payload}`);
  process.exit(1);
});
