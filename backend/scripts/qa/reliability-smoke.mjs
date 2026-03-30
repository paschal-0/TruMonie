#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'QaReliability#123';
const currency = (process.env.QA_CURRENCY ?? 'NGN').toUpperCase();
const results = [];

const context = {
  sender: null,
  recipient: null,
  senderToken: null,
  recipientToken: null,
  senderWallet: null,
  recipientWallet: null
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
    lastName: 'REL',
    password
  };
}

async function request(method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

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

  return { ok: response.ok, status: response.status, payload };
}

function record(id, status, details) {
  results.push({ id, status, details });
  console.log(`[${status}] ${id}${details ? ` - ${details}` : ''}`);
}

async function step(id, fn) {
  try {
    const details = await fn();
    record(id, 'PASS', details ?? '');
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    record(id, 'FAIL', details);
  }
}

function getWalletByCurrency(wallets, targetCurrency) {
  return wallets.find((item) => item.currency === targetCurrency) ?? wallets[0];
}

function toMinor(value) {
  return BigInt(String(value));
}

async function getWalletBalance(token, walletId) {
  const res = await request('GET', '/wallets', { token });
  if (!res.ok || !Array.isArray(res.payload)) {
    throw new Error(`wallet fetch failed status=${res.status}`);
  }
  const wallet = res.payload.find((item) => item.id === walletId);
  if (!wallet) throw new Error(`wallet ${walletId} not found`);
  return toMinor(wallet.balanceMinor);
}

async function main() {
  console.log(`Running reliability smoke checks against ${apiBase}`);

  const senderInput = makeUser('relsender');
  const recipientInput = makeUser('relrecipient');

  await step('REL-SETUP-REGISTER-SENDER', async () => {
    const res = await request('POST', '/auth/register', { body: senderInput });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.sender = res.payload.user;
    context.senderToken = res.payload.tokens?.accessToken;
    return context.sender.email;
  });

  await step('REL-SETUP-REGISTER-RECIPIENT', async () => {
    const res = await request('POST', '/auth/register', { body: recipientInput });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    context.recipient = res.payload.user;
    context.recipientToken = res.payload.tokens?.accessToken;
    return context.recipient.email;
  });

  await step('REL-SETUP-WALLETS', async () => {
    const senderWallets = await request('GET', '/wallets', { token: context.senderToken });
    const recipientWallets = await request('GET', '/wallets', { token: context.recipientToken });
    if (!senderWallets.ok || !recipientWallets.ok) {
      throw new Error(`wallet setup failed sender=${senderWallets.status} recipient=${recipientWallets.status}`);
    }
    context.senderWallet = getWalletByCurrency(senderWallets.payload, currency);
    context.recipientWallet = getWalletByCurrency(recipientWallets.payload, currency);
    if (!context.senderWallet?.id || !context.recipientWallet?.id) {
      throw new Error('wallet ids missing');
    }
    return `sender=${context.senderWallet.id} recipient=${context.recipientWallet.id}`;
  });

  await step('REL-SETUP-FUND-SENDER', async () => {
    const res = await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: rand('rel-fund-sender-idem'),
        reference: rand('rel-fund-sender-ref'),
        userId: context.sender.id,
        amountMinor: 400000,
        currency
      }
    });
    if (!res.ok) throw new Error(JSON.stringify(res.payload));
    return `funded ${currency} 400000`;
  });

  await step('REL-IDEMPOTENCY-WEBHOOK-NO-DOUBLE-CREDIT', async () => {
    const amountMinor = 7777n;
    const key = rand('rel-dupe-webhook');
    const payload = {
      idempotencyKey: key,
      reference: key,
      userId: context.recipient.id,
      amountMinor: amountMinor.toString(),
      currency
    };

    const before = await getWalletBalance(context.recipientToken, context.recipientWallet.id);
    const first = await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: payload
    });
    const second = await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: payload
    });
    if (!first.ok || !second.ok) {
      throw new Error(`duplicate webhook failed first=${first.status} second=${second.status}`);
    }
    const after = await getWalletBalance(context.recipientToken, context.recipientWallet.id);
    const delta = after - before;
    if (delta !== amountMinor) {
      throw new Error(`expected single credit ${amountMinor} got delta=${delta}`);
    }
    return `delta=${delta}`;
  });

  await step('REL-IDEMPOTENCY-LEDGER-TRANSFER-NO-DOUBLE-DEBIT', async () => {
    const amountMinor = 3000n;
    const idempotencyKey = rand('rel-ledger-idem');
    const beforeSender = await getWalletBalance(context.senderToken, context.senderWallet.id);
    const beforeRecipient = await getWalletBalance(context.recipientToken, context.recipientWallet.id);

    const body = {
      sourceAccountId: context.senderWallet.id,
      destinationAccountId: context.recipientWallet.id,
      amountMinor: Number(amountMinor),
      currency,
      description: 'Reliability ledger idem',
      idempotencyKey
    };

    const first = await request('POST', '/ledger/transfer', {
      token: context.senderToken,
      body
    });
    const second = await request('POST', '/ledger/transfer', {
      token: context.senderToken,
      body
    });
    if (!first.ok || !second.ok) {
      throw new Error(`ledger transfer failed first=${first.status} second=${second.status}`);
    }

    const afterSender = await getWalletBalance(context.senderToken, context.senderWallet.id);
    const afterRecipient = await getWalletBalance(context.recipientToken, context.recipientWallet.id);
    const senderDelta = beforeSender - afterSender;
    const recipientDelta = afterRecipient - beforeRecipient;
    if (senderDelta !== amountMinor || recipientDelta !== amountMinor) {
      throw new Error(
        `unexpected deltas sender=${senderDelta} recipient=${recipientDelta} expected=${amountMinor}`
      );
    }
    return `senderDelta=${senderDelta} recipientDelta=${recipientDelta}`;
  });

  await step('REL-CONCURRENCY-P2P-MULTI-REQUEST', async () => {
    const transferCount = Number.parseInt(process.env.QA_REL_P2P_COUNT ?? '5', 10);
    const transferAmountMinor = Number.parseInt(process.env.QA_REL_P2P_AMOUNT_MINOR ?? '1000', 10);
    const total = BigInt(transferCount * transferAmountMinor);

    const beforeSender = await getWalletBalance(context.senderToken, context.senderWallet.id);
    const beforeRecipient = await getWalletBalance(context.recipientToken, context.recipientWallet.id);

    const tasks = Array.from({ length: transferCount }, (_, index) =>
      request('POST', '/payments/p2p', {
        token: context.senderToken,
        body: {
          recipientIdentifier: context.recipient.email,
          amountMinor: transferAmountMinor,
          currency,
          description: `Reliability p2p #${index + 1}`,
          idempotencyKey: rand(`rel-p2p-${index + 1}`)
        }
      })
    );

    const responses = await Promise.all(tasks);
    const failures = responses.filter((item) => !item.ok);
    if (failures.length > 0) {
      throw new Error(
        `p2p failures=${failures.length} first=${JSON.stringify(failures[0]?.payload ?? null)}`
      );
    }

    const afterSender = await getWalletBalance(context.senderToken, context.senderWallet.id);
    const afterRecipient = await getWalletBalance(context.recipientToken, context.recipientWallet.id);
    const senderDelta = beforeSender - afterSender;
    const recipientDelta = afterRecipient - beforeRecipient;
    if (senderDelta !== total || recipientDelta !== total) {
      throw new Error(`unexpected balance movement sender=${senderDelta} recipient=${recipientDelta} expected=${total}`);
    }

    return `count=${transferCount} total=${total}`;
  });

  await step('REL-NEG-UNSUPPORTED-PAYOUT-PROVIDER', async () => {
    const res = await request('POST', '/payments/bank-transfer', {
      token: context.senderToken,
      body: {
        amountMinor: 1000,
        currency,
        bankCode: '000',
        accountNumber: '0000000000',
        accountName: 'Reliability Check',
        provider: 'unknown-provider'
      }
    });
    if (res.status !== 400) {
      throw new Error(`expected 400 got ${res.status} payload=${JSON.stringify(res.payload)}`);
    }
    return `status=${res.status}`;
  });

  const failed = results.filter((item) => item.status === 'FAIL');
  console.log('\nReliability Summary');
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
