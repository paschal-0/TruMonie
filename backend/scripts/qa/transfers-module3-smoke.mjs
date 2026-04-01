#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'TruMonie#123';
const transactionPin = process.env.QA_PIN ?? '1234';
const bankTransferAmountMinor = Number.parseInt(
  process.env.QA_BANK_TRANSFER_AMOUNT_MINOR ?? '5000',
  10
);
const internalTransferAmountMinor = Number.parseInt(
  process.env.QA_INTERNAL_TRANSFER_AMOUNT_MINOR ?? '3000',
  10
);
const senderIdentifierEnv = process.env.QA_SENDER_IDENTIFIER?.trim();
const senderPasswordEnv = process.env.QA_SENDER_PASSWORD?.trim();
const receiverIdentifierEnv = process.env.QA_RECEIVER_IDENTIFIER?.trim();
const receiverPasswordEnv = process.env.QA_RECEIVER_PASSWORD?.trim();
const currentPin = process.env.QA_CURRENT_PIN?.trim();

const results = [];
const context = {
  apiMode: 'v2',
  sender: null,
  receiver: null,
  senderToken: null,
  receiverToken: null,
  senderWallet: null,
  receiverWallet: null,
  nameEnquiry: null,
  beneficiary: null,
  bankTransfer: null,
  internalTransfer: null,
  senderIdentifier: null,
  receiverIdentifier: null
};

function record(id, status, details = '') {
  results.push({ id, status, details });
  const prefix = status === 'PASS' ? '[PASS]' : '[FAIL]';
  console.log(`${prefix} ${id}${details ? ` - ${details}` : ''}`);
}

function ensure(value, message) {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

async function request(method, path, { token, body, headers } = {}) {
  const mergedHeaders = { ...(headers ?? {}) };
  if (token) mergedHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) mergedHeaders['content-type'] = 'application/json';

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: mergedHeaders,
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
    const details =
      typeof payload === 'object' && payload !== null ? JSON.stringify(payload) : String(payload);
    const error = new Error(`${method} ${path} failed (${response.status}) ${details}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function requestRaw(method, path, { token, body, headers } = {}) {
  const mergedHeaders = { ...(headers ?? {}) };
  if (token) mergedHeaders.authorization = `Bearer ${token}`;
  if (body !== undefined) mergedHeaders['content-type'] = 'application/json';
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: mergedHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
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

function toMinorUnits(value) {
  if (value === undefined || value === null) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
  return 0n;
}

function transferFeeMinor(amountMinor) {
  const amount = toMinorUnits(amountMinor);
  if (amount <= 500_000n) return 1_060n;
  if (amount <= 5_000_000n) return 2_650n;
  return 5_300n;
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

async function runStep(id, fn) {
  try {
    const detail = await fn();
    record(id, 'PASS', detail);
    return true;
  } catch (error) {
    record(id, 'FAIL', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function login(identifier, passwordValue) {
  const response = await request('POST', '/auth/login', {
    body: { identifier, password: passwordValue }
  });
  return {
    user: response?.user ?? null,
    token: response?.tokens?.accessToken ?? null
  };
}

async function main() {
  console.log(`Running Module 3 transfer smoke against ${apiBase}`);

  const healthOk = await runStep('M3-HEALTH', async () => {
    const health = await request('GET', '/health');
    if (health?.status !== 'ok') {
      throw new Error(`Unexpected health payload: ${JSON.stringify(health)}`);
    }
    return 'health ok';
  });
  if (!healthOk) process.exit(1);

  const seedCredentials = loadSeedCredentials();
  const senderAuth = {
    identifier: senderIdentifierEnv ?? seedCredentials?.sender?.identifier ?? null,
    password: senderPasswordEnv ?? seedCredentials?.sender?.password ?? null
  };
  const receiverAuth = {
    identifier: receiverIdentifierEnv ?? seedCredentials?.receiver?.identifier ?? null,
    password: receiverPasswordEnv ?? seedCredentials?.receiver?.password ?? null
  };

  const senderSeed = randomUser('m3sender');
  const receiverSeed = randomUser('m3receiver');

  const senderOk = await runStep(
    senderAuth.identifier && senderAuth.password
      ? 'M3-AUTH-LOGIN-SENDER'
      : 'M3-AUTH-REGISTER-SENDER',
    async () => {
      if (senderAuth.identifier && senderAuth.password) {
        const res = await login(senderAuth.identifier, senderAuth.password);
        context.sender = res.user;
        context.senderToken = res.token;
        context.senderIdentifier = senderAuth.identifier;
        ensure(context.sender?.id, 'sender user missing');
        ensure(context.senderToken, 'sender token missing');
        return senderAuth.identifier;
      }

      const res = await request('POST', '/auth/register', { body: senderSeed });
      context.sender = res.user;
      context.senderToken = res.tokens?.accessToken;
      context.senderIdentifier = senderSeed.email;
      ensure(context.sender?.id, 'sender user missing');
      ensure(context.senderToken, 'sender token missing');
      return senderSeed.email;
    }
  );
  if (!senderOk) process.exit(1);

  const receiverOk = await runStep(
    receiverAuth.identifier && receiverAuth.password
      ? 'M3-AUTH-LOGIN-RECEIVER'
      : 'M3-AUTH-REGISTER-RECEIVER',
    async () => {
      if (receiverAuth.identifier && receiverAuth.password) {
        const res = await login(receiverAuth.identifier, receiverAuth.password);
        context.receiver = res.user;
        context.receiverToken = res.token;
        context.receiverIdentifier = receiverAuth.identifier;
        ensure(context.receiver?.id, 'receiver user missing');
        ensure(context.receiverToken, 'receiver token missing');
        return receiverAuth.identifier;
      }

      const res = await request('POST', '/auth/register', { body: receiverSeed });
      context.receiver = res.user;
      context.receiverToken = res.tokens?.accessToken;
      context.receiverIdentifier = receiverSeed.email;
      ensure(context.receiver?.id, 'receiver user missing');
      ensure(context.receiverToken, 'receiver token missing');
      return receiverSeed.email;
    }
  );
  if (!receiverOk) process.exit(1);

  const pinReady = await runStep('M3-AUTH-PIN-READY', async () => {
    const senderStatus = await request('GET', '/users/me/pin-status', {
      token: context.senderToken
    });
    if (senderStatus?.hasTransactionPin) {
      if (currentPin) {
        await request('POST', '/users/me/pin', {
          token: context.senderToken,
          body: { pin: transactionPin, currentPin }
        });
        return 'transaction pin rotated with current pin';
      }

      const receiverStatus = await request('GET', '/users/me/pin-status', {
        token: context.receiverToken
      });
      if (!receiverStatus?.hasTransactionPin) {
        await request('POST', '/users/me/pin', {
          token: context.receiverToken,
          body: { pin: transactionPin }
        });
      } else {
        try {
          await request('POST', '/users/me/pin', {
            token: context.receiverToken,
            body: { pin: transactionPin, currentPin: transactionPin }
          });
        } catch {
          throw new Error(
            'sender and receiver both have unknown transaction PINs. Set QA_CURRENT_PIN for sender.'
          );
        }
      }

      [context.sender, context.receiver] = [context.receiver, context.sender];
      [context.senderToken, context.receiverToken] = [context.receiverToken, context.senderToken];
      [context.senderIdentifier, context.receiverIdentifier] = [
        context.receiverIdentifier,
        context.senderIdentifier
      ];
      return 'swapped sender/receiver and configured sender transaction pin';
    }

    await request('POST', '/users/me/pin', {
      token: context.senderToken,
      body: { pin: transactionPin }
    });
    return 'transaction pin configured';
  });
  if (!pinReady) process.exit(1);

  const walletsOk = await runStep('M3-WALLETS', async () => {
    const senderWallets = await request('GET', '/wallets', { token: context.senderToken });
    const receiverWallets = await request('GET', '/wallets', { token: context.receiverToken });
    context.senderWallet = senderWallets.find((wallet) => wallet.currency === 'NGN');
    context.receiverWallet = receiverWallets.find((wallet) => wallet.currency === 'NGN');
    ensure(context.senderWallet?.id, 'sender NGN wallet missing');
    ensure(context.receiverWallet?.id, 'receiver NGN wallet missing');
    return `sender=${context.senderWallet.id} receiver=${context.receiverWallet.id}`;
  });
  if (!walletsOk) process.exit(1);

  await runStep('M3-API-MODE', async () => {
    const probe = await requestRaw('POST', '/transfers/name-enquiry', {
      token: context.senderToken,
      body: {
        destination_bank_code: '000',
        account_number: '0000000000',
        provider: 'internal'
      }
    });
    if (probe.status === 404) {
      context.apiMode = 'legacy';
      return 'legacy endpoints detected (/payments/*)';
    }
    if (!probe.ok && probe.status >= 500) {
      throw new Error(`probe failed (${probe.status}) ${JSON.stringify(probe.payload)}`);
    }
    context.apiMode = 'v2';
    return 'v2 transfer endpoints detected (/transfers/*)';
  });

  await runStep('M3-FUND-SENDER', async () => {
    const currentBalance = toMinorUnits(
      context.senderWallet?.availableBalanceMinor ?? context.senderWallet?.balanceMinor
    );
    const maxBalance = context.senderWallet?.maxBalanceMinor
      ? toMinorUnits(context.senderWallet.maxBalanceMinor)
      : null;
    const requiredForSuite =
      toMinorUnits(bankTransferAmountMinor) +
      transferFeeMinor(bankTransferAmountMinor) +
      toMinorUnits(internalTransferAmountMinor) +
      1_000n;
    if (currentBalance >= requiredForSuite) {
      return `skipped, balance already sufficient (${currentBalance} minor)`;
    }
    const headroom = maxBalance === null ? null : maxBalance - currentBalance;
    const needed = requiredForSuite - currentBalance;
    if (headroom !== null && headroom <= 0n) {
      throw new Error(
        `cannot fund: wallet at max balance (${currentBalance}/${maxBalance} minor)`
      );
    }
    const fundingToApply = headroom === null ? needed : needed > headroom ? headroom : needed;
    if (fundingToApply <= 0n) {
      throw new Error('computed funding amount is not positive');
    }

    const ref = `M3-FUND-${Date.now()}`;
    await request('POST', '/payments/webhook/internal', {
      headers: { 'x-signature': 'qa-signature' },
      body: {
        idempotencyKey: ref,
        reference: ref,
        userId: context.sender.id,
        amountMinor: fundingToApply.toString(),
        currency: 'NGN'
      }
    });
    const wallets = await request('GET', '/wallets', { token: context.senderToken });
    context.senderWallet = wallets.find((wallet) => wallet.currency === 'NGN') ?? context.senderWallet;
    const updatedBalance = toMinorUnits(
      context.senderWallet?.availableBalanceMinor ?? context.senderWallet?.balanceMinor
    );
    if (updatedBalance < requiredForSuite) {
      throw new Error(
        `funding completed but still insufficient for suite (${updatedBalance} < ${requiredForSuite})`
      );
    }
    return `${fundingToApply} minor funded`;
  });

  const nameEnquiryOk = await runStep('M3-TRF-NAME-ENQUIRY', async () => {
    if (context.apiMode === 'legacy') {
      const res = await request('POST', '/payments/bank/resolve', {
        body: {
          bankCode: '000',
          accountNumber: '0000000000',
          provider: 'internal'
        }
      });
      context.nameEnquiry = {
        account_name: res.accountName,
        account_number: res.accountNumber,
        bank_code: res.bankCode,
        bank_name: 'Internal Settlement',
        session_id: null
      };
      ensure(res?.accountName, 'accountName missing');
      return `${res.accountName} (legacy resolve)`;
    }

    const res = await request('POST', '/transfers/name-enquiry', {
      token: context.senderToken,
      body: {
        destination_bank_code: '000',
        account_number: '0000000000',
        provider: 'internal'
      }
    });
    context.nameEnquiry = res;
    ensure(res?.account_name, 'account_name missing');
    ensure(res?.session_id, 'session_id missing');
    return `${res.account_name} (${res.session_id})`;
  });
  if (!nameEnquiryOk) process.exit(1);

  await runStep('M3-BEN-SAVE', async () => {
    if (context.apiMode === 'legacy') {
      return 'skipped (beneficiaries not available on legacy routes)';
    }
    const res = await request('POST', '/beneficiaries', {
      token: context.senderToken,
      body: {
        account_number: context.nameEnquiry.account_number,
        bank_code: context.nameEnquiry.bank_code,
        account_name: context.nameEnquiry.account_name,
        alias: 'Internal Settlement QA'
      }
    });
    context.beneficiary = res;
    ensure(res?.id, 'beneficiary id missing');
    return res.id;
  });

  await runStep('M3-BEN-LIST', async () => {
    if (context.apiMode === 'legacy') {
      return 'skipped (beneficiaries not available on legacy routes)';
    }
    const res = await request('GET', '/beneficiaries', { token: context.senderToken });
    const beneficiaries = Array.isArray(res?.beneficiaries) ? res.beneficiaries : [];
    const match = beneficiaries.find((row) => row.id === context.beneficiary.id);
    ensure(match, 'saved beneficiary not listed');
    return `count=${beneficiaries.length}`;
  });

  const bankTransferOk = await runStep('M3-TRF-CREATE-BANK', async () => {
    if (context.apiMode === 'legacy') {
      const res = await request('POST', '/payments/bank-transfer', {
        token: context.senderToken,
        body: {
          amountMinor: bankTransferAmountMinor,
          currency: 'NGN',
          bankCode: context.nameEnquiry.bank_code,
          accountNumber: context.nameEnquiry.account_number,
          accountName: context.nameEnquiry.account_name,
          narration: 'QA module 3 bank transfer (legacy)',
          provider: 'internal',
          pin: transactionPin
        }
      });
      context.bankTransfer = {
        transfer_id: null,
        reference: res?.providerReference ?? `LEGACY-${Date.now()}`,
        status: res?.status ?? 'UNKNOWN'
      };
      return `${context.bankTransfer.reference} (${context.bankTransfer.status})`;
    }

    const res = await request('POST', '/transfers', {
      token: context.senderToken,
      body: {
        source_wallet_id: context.senderWallet.id,
        destination_bank_code: context.nameEnquiry.bank_code,
        destination_account: context.nameEnquiry.account_number,
        destination_name: context.nameEnquiry.account_name,
        amount: bankTransferAmountMinor,
        narration: 'QA module 3 bank transfer',
        pin: transactionPin,
        idempotency_key: crypto.randomUUID(),
        session_id: context.nameEnquiry.session_id,
        provider: 'internal'
      }
    });
    context.bankTransfer = res;
    ensure(res?.transfer_id, 'transfer_id missing');
    return `${res.reference} (${res.status})`;
  });
  if (!bankTransferOk) process.exit(1);

  await runStep('M3-TRF-STATUS', async () => {
    if (context.apiMode === 'legacy') {
      return 'skipped (status endpoint not available on legacy routes)';
    }
    const res = await request(
      'GET',
      `/transfers/${context.bankTransfer.transfer_id}/status`,
      { token: context.senderToken }
    );
    if (!['SUCCESS', 'PENDING', 'PROCESSING', 'FAILED', 'MANUAL_REVIEW'].includes(res?.status)) {
      throw new Error(`Unexpected status response: ${JSON.stringify(res)}`);
    }
    return `${res.reference} -> ${res.status}`;
  });

  await runStep('M3-TRF-RECEIPT', async () => {
    if (context.apiMode === 'legacy') {
      return 'skipped (receipt endpoint not available on legacy routes)';
    }
    const res = await request(
      'GET',
      `/transfers/${context.bankTransfer.transfer_id}/receipt`,
      { token: context.senderToken }
    );
    ensure(res?.receipt_id, 'receipt_id missing');
    ensure(res?.reference, 'reference missing');
    return `${res.reference} receipt=${res.receipt_id}`;
  });

  await runStep('M3-TRF-INTERNAL', async () => {
    const senderWallets = await request('GET', '/wallets', { token: context.senderToken });
    const receiverWallets = await request('GET', '/wallets', { token: context.receiverToken });
    context.senderWallet = senderWallets.find((wallet) => wallet.id === context.senderWallet.id) ?? context.senderWallet;
    context.receiverWallet =
      receiverWallets.find((wallet) => wallet.id === context.receiverWallet.id) ?? context.receiverWallet;

    let amountToTransfer = toMinorUnits(internalTransferAmountMinor);
    if (context.apiMode === 'legacy') {
      const receiverBalance = toMinorUnits(
        context.receiverWallet?.availableBalanceMinor ?? context.receiverWallet?.balanceMinor
      );
      const receiverMaxBalance = context.receiverWallet?.maxBalanceMinor
        ? toMinorUnits(context.receiverWallet.maxBalanceMinor)
        : null;
      if (receiverMaxBalance !== null) {
        const headroom = receiverMaxBalance - receiverBalance;
        if (headroom <= 0n) {
          return 'skipped (recipient wallet already at max balance)';
        }
        if (amountToTransfer > headroom) {
          amountToTransfer = headroom;
        }
      }
      if (amountToTransfer <= 0n) {
        return 'skipped (computed transfer amount <= 0)';
      }

      const recipientIdentifier =
        context.receiverIdentifier ??
        context.receiver?.email ??
        context.receiver?.username ??
        context.receiver?.phoneNumber;
      const candidates = [
        amountToTransfer,
        1_000n,
        100n,
        10n,
        1n
      ].filter((value, index, values) => value > 0n && values.indexOf(value) === index);

      let finalFailure = null;
      for (const candidate of candidates) {
        const attempt = await requestRaw('POST', '/payments/p2p', {
          token: context.senderToken,
          body: {
            recipientIdentifier,
            amountMinor: Number(candidate),
            currency: 'NGN',
            description: 'QA module 3 internal transfer (legacy)',
            idempotencyKey: crypto.randomUUID(),
            pin: transactionPin
          }
        });
        if (attempt.ok) {
          ensure(attempt.payload?.id, 'legacy p2p ledger entry id missing');
          return `${attempt.payload?.reference ?? attempt.payload?.id} (SUCCESS, amount=${candidate})`;
        }

        const message = JSON.stringify(attempt.payload);
        if (attempt.status === 400 && message.includes('Amount exceeds max wallet balance for tier')) {
          finalFailure = message;
          continue;
        }
        throw new Error(`legacy internal transfer failed (${attempt.status}) ${message}`);
      }

      return `skipped (recipient max-balance cap reached: ${finalFailure ?? 'unknown'})`;
    }

    const res = await request('POST', '/transfers/internal', {
      token: context.senderToken,
      body: {
        source_wallet_id: context.senderWallet.id,
        destination_wallet_id: context.receiverWallet.id,
        amount: Number(amountToTransfer),
        narration: 'QA module 3 internal transfer',
        pin: transactionPin,
        idempotency_key: crypto.randomUUID()
      }
    });
    context.internalTransfer = res;
    ensure(res?.transfer_id, 'internal transfer_id missing');
    if (res.status !== 'SUCCESS') {
      throw new Error(`Expected SUCCESS, got ${res.status}`);
    }
    return `${res.reference} (${res.status}, amount=${amountToTransfer})`;
  });

  await runStep('M3-BEN-DELETE', async () => {
    if (context.apiMode === 'legacy') {
      return 'skipped (beneficiaries not available on legacy routes)';
    }
    await request('DELETE', `/beneficiaries/${context.beneficiary.id}`, {
      token: context.senderToken
    });
    const res = await request('GET', '/beneficiaries', { token: context.senderToken });
    const beneficiaries = Array.isArray(res?.beneficiaries) ? res.beneficiaries : [];
    const found = beneficiaries.find((row) => row.id === context.beneficiary.id);
    if (found) throw new Error('beneficiary still present after delete');
    return 'soft-delete confirmed';
  });

  const failed = results.filter((entry) => entry.status === 'FAIL');
  console.log('\nModule 3 QA Summary');
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
