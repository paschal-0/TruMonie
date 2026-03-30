#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

dotenv.config({ path: path.join(process.cwd(), '.env') });

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

async function ensureAccount(client, { label, type, currency }) {
  const existing = await client.query(
    `
    SELECT id
    FROM accounts
    WHERE user_id IS NULL
      AND type = $1
      AND currency = $2
      AND label = $3
    LIMIT 1
    `,
    [type, currency, label]
  );
  if (existing.rowCount && existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `
    INSERT INTO accounts (user_id, currency, type, status, label, balance_minor)
    VALUES (NULL, $1, $2, 'ACTIVE', $3, '0')
    RETURNING id
    `,
    [currency, type, label]
  );

  return inserted.rows[0].id;
}

async function ensureOpeningLiquidity(client, params) {
  const existing = await client.query(
    `SELECT id FROM journal_entries WHERE reference = $1 LIMIT 1`,
    [params.reference]
  );
  if (existing.rowCount) {
    return false;
  }

  const entryResult = await client.query(
    `
    INSERT INTO journal_entries (reference, idempotency_key, status, description, metadata)
    VALUES ($1, $2, 'POSTED', $3, $4::jsonb)
    RETURNING id
    `,
    [
      params.reference,
      params.reference,
      params.description,
      JSON.stringify({ bootstrap: true, currency: params.currency })
    ]
  );

  const entryId = entryResult.rows[0].id;
  await client.query(
    `
    INSERT INTO journal_lines (journal_entry_id, account_id, direction, amount_minor, currency, memo)
    VALUES
      ($1, $2, 'DEBIT', $3, $4, $5),
      ($1, $6, 'CREDIT', $3, $4, $7)
    `,
    [
      entryId,
      params.treasuryAccountId,
      params.amountMinor,
      params.currency,
      'Bootstrap treasury liquidity',
      params.feesAccountId,
      'Bootstrap offset to fees'
    ]
  );

  await client.query(
    `UPDATE accounts SET balance_minor = (balance_minor::numeric + $1::numeric)::bigint WHERE id = $2`,
    [params.amountMinor, params.treasuryAccountId]
  );
  await client.query(
    `UPDATE accounts SET balance_minor = (balance_minor::numeric + $1::numeric)::bigint WHERE id = $2`,
    [params.amountMinor, params.feesAccountId]
  );

  return true;
}

function envLine(key, value) {
  return `${key}=${value}`;
}

async function main() {
  const client = new Client(dbConfig());
  await client.connect();

  try {
    const specs = [
      { key: 'SYSTEM_TREASURY_NGN_ACCOUNT_ID', label: 'System Treasury NGN', type: 'TREASURY', currency: 'NGN' },
      { key: 'SYSTEM_TREASURY_USD_ACCOUNT_ID', label: 'System Treasury USD', type: 'TREASURY', currency: 'USD' },
      { key: 'SYSTEM_FEES_NGN_ACCOUNT_ID', label: 'System Fees NGN', type: 'FEES', currency: 'NGN' },
      { key: 'SYSTEM_FEES_USD_ACCOUNT_ID', label: 'System Fees USD', type: 'FEES', currency: 'USD' },
      { key: 'SYSTEM_SETTLEMENT_INTERNAL_NGN_ACCOUNT_ID', label: 'Settlement Internal NGN', type: 'RESERVE', currency: 'NGN' },
      { key: 'SYSTEM_SETTLEMENT_INTERNAL_USD_ACCOUNT_ID', label: 'Settlement Internal USD', type: 'RESERVE', currency: 'USD' },
      { key: 'SYSTEM_SETTLEMENT_LICENSED_NGN_ACCOUNT_ID', label: 'Settlement Licensed NGN', type: 'RESERVE', currency: 'NGN' },
      { key: 'SYSTEM_SETTLEMENT_LICENSED_USD_ACCOUNT_ID', label: 'Settlement Licensed USD', type: 'RESERVE', currency: 'USD' },
      { key: 'SYSTEM_SETTLEMENT_PAYSTACK_NGN_ACCOUNT_ID', label: 'Settlement Paystack NGN', type: 'RESERVE', currency: 'NGN' },
      { key: 'SYSTEM_SETTLEMENT_PAYSTACK_USD_ACCOUNT_ID', label: 'Settlement Paystack USD', type: 'RESERVE', currency: 'USD' },
      { key: 'SYSTEM_SETTLEMENT_FLUTTERWAVE_NGN_ACCOUNT_ID', label: 'Settlement Flutterwave NGN', type: 'RESERVE', currency: 'NGN' },
      { key: 'SYSTEM_SETTLEMENT_FLUTTERWAVE_USD_ACCOUNT_ID', label: 'Settlement Flutterwave USD', type: 'RESERVE', currency: 'USD' }
    ];

    const lines = [];
    const values = {};
    for (const spec of specs) {
      const id = await ensureAccount(client, spec);
      lines.push(envLine(spec.key, id));
      values[spec.key] = id;
      console.log(`${spec.key}=${id}`);
    }

    const openingAmountMinor = process.env.QA_BOOTSTRAP_OPENING_MINOR ?? '1000000000';
    await ensureOpeningLiquidity(client, {
      reference: 'QA-OPENING-LIQUIDITY-NGN',
      description: 'QA opening liquidity NGN',
      currency: 'NGN',
      amountMinor: openingAmountMinor,
      treasuryAccountId: values.SYSTEM_TREASURY_NGN_ACCOUNT_ID,
      feesAccountId: values.SYSTEM_FEES_NGN_ACCOUNT_ID
    });
    await ensureOpeningLiquidity(client, {
      reference: 'QA-OPENING-LIQUIDITY-USD',
      description: 'QA opening liquidity USD',
      currency: 'USD',
      amountMinor: openingAmountMinor,
      treasuryAccountId: values.SYSTEM_TREASURY_USD_ACCOUNT_ID,
      feesAccountId: values.SYSTEM_FEES_USD_ACCOUNT_ID
    });

    const outputFile = process.env.QA_SYSTEM_ACCOUNTS_OUTPUT ?? path.join(process.cwd(), '.qa-system-accounts.env');
    fs.writeFileSync(outputFile, `${lines.join('\n')}\n`, 'utf8');
    console.log(`Wrote ${outputFile}`);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
