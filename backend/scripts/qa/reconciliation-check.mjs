#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;

dotenv.config({ path: path.join(process.cwd(), '.env') });

function parseWindow() {
  const date = process.env.QA_RECON_DATE;
  const from = process.env.QA_RECON_FROM;
  const to = process.env.QA_RECON_TO;

  if (from && to) {
    return {
      start: new Date(from),
      end: new Date(to),
      label: `${from} -> ${to}`
    };
  }

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, label: `${date} UTC` };
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, label: `${start.toISOString().slice(0, 10)} UTC` };
}

function dbConfig() {
  const sslEnabled =
    process.env.POSTGRES_SSL === 'true' || process.env.POSTGRES_SSL === '1';

  return {
    host: process.env.POSTGRES_HOST,
    port: Number.parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false
  };
}

async function main() {
  const window = parseWindow();
  const client = new Client(dbConfig());
  const report = {
    generatedAt: new Date().toISOString(),
    window: {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
      label: window.label
    },
    checks: {}
  };

  await client.connect();

  try {
    const unbalanced = await client.query(
      `
      SELECT
        je.id,
        je.reference,
        jl.currency,
        SUM(CASE WHEN jl.direction = 'DEBIT' THEN jl.amount_minor::numeric ELSE 0 END) AS total_debit,
        SUM(CASE WHEN jl.direction = 'CREDIT' THEN jl.amount_minor::numeric ELSE 0 END) AS total_credit
      FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.created_at >= $1 AND je.created_at < $2
      GROUP BY je.id, je.reference, jl.currency
      HAVING SUM(CASE WHEN jl.direction = 'DEBIT' THEN jl.amount_minor::numeric ELSE 0 END)
          <> SUM(CASE WHEN jl.direction = 'CREDIT' THEN jl.amount_minor::numeric ELSE 0 END)
      ORDER BY je.created_at ASC
      `,
      [window.start.toISOString(), window.end.toISOString()]
    );

    const entriesWithoutLines = await client.query(
      `
      SELECT je.id, je.reference
      FROM journal_entries je
      LEFT JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.created_at >= $1 AND je.created_at < $2
      GROUP BY je.id, je.reference
      HAVING COUNT(jl.id) = 0
      `,
      [window.start.toISOString(), window.end.toISOString()]
    );

    const accountMismatch = await client.query(
      `
      WITH expected AS (
        SELECT
          a.id AS account_id,
          COALESCE(
            SUM(
              CASE
                WHEN a.type IN ('TREASURY', 'RESERVE') AND jl.direction = 'DEBIT'
                  THEN jl.amount_minor::numeric
                WHEN a.type IN ('TREASURY', 'RESERVE') AND jl.direction = 'CREDIT'
                  THEN -jl.amount_minor::numeric
                WHEN a.type NOT IN ('TREASURY', 'RESERVE') AND jl.direction = 'CREDIT'
                  THEN jl.amount_minor::numeric
                ELSE -jl.amount_minor::numeric
              END
            ),
            0
          ) AS expected_balance_minor
        FROM accounts a
        LEFT JOIN journal_lines jl ON jl.account_id = a.id
        GROUP BY a.id
      )
      SELECT
        a.id,
        a.type,
        a.currency,
        a.label,
        a.balance_minor::numeric AS stored_balance_minor,
        e.expected_balance_minor
      FROM accounts a
      JOIN expected e ON e.account_id = a.id
      WHERE a.balance_minor::numeric <> e.expected_balance_minor
      ORDER BY a.type, a.currency, a.id
      LIMIT 200
      `
    );

    const fundingMissingJournals = await client.query(
      `
      SELECT ft.id, ft.reference, ft.currency, ft.amount_minor
      FROM funding_transactions ft
      LEFT JOIN journal_entries je ON je.reference = ft.reference
      WHERE ft.created_at >= $1 AND ft.created_at < $2
        AND je.id IS NULL
      `,
      [window.start.toISOString(), window.end.toISOString()]
    );

    const duplicateWebhookIdempotency = await client.query(
      `
      SELECT provider, idempotency_key, COUNT(*)::int AS duplicate_count
      FROM webhook_events
      WHERE created_at >= $1 AND created_at < $2
        AND idempotency_key IS NOT NULL
      GROUP BY provider, idempotency_key
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      `,
      [window.start.toISOString(), window.end.toISOString()]
    );

    const stalePendingPayouts = await client.query(
      `
      SELECT id, user_id, provider, provider_reference, created_at
      FROM payouts
      WHERE status = 'PENDING'
        AND created_at < (now() - interval '15 minutes')
      ORDER BY created_at ASC
      LIMIT 200
      `
    );

    const systemAccountMovements = await client.query(
      `
      SELECT
        a.id,
        a.label,
        a.type,
        a.currency,
        SUM(
          CASE
            WHEN jl.direction = 'DEBIT' THEN jl.amount_minor::numeric
            ELSE -jl.amount_minor::numeric
          END
        ) AS net_debit_view_minor
      FROM journal_lines jl
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.created_at >= $1 AND jl.created_at < $2
        AND a.user_id IS NULL
      GROUP BY a.id, a.label, a.type, a.currency
      ORDER BY a.type, a.currency, a.label
      `,
      [window.start.toISOString(), window.end.toISOString()]
    );

    report.checks = {
      unbalanced_journal_entries: {
        severity: 'critical',
        count: unbalanced.rowCount,
        rows: unbalanced.rows
      },
      journal_entries_without_lines: {
        severity: 'critical',
        count: entriesWithoutLines.rowCount,
        rows: entriesWithoutLines.rows
      },
      account_balance_mismatch: {
        severity: 'critical',
        count: accountMismatch.rowCount,
        rows: accountMismatch.rows
      },
      funding_transactions_missing_journal: {
        severity: 'critical',
        count: fundingMissingJournals.rowCount,
        rows: fundingMissingJournals.rows
      },
      duplicate_webhook_idempotency_keys: {
        severity: 'warning',
        count: duplicateWebhookIdempotency.rowCount,
        rows: duplicateWebhookIdempotency.rows
      },
      stale_pending_payouts_older_than_15m: {
        severity: 'warning',
        count: stalePendingPayouts.rowCount,
        rows: stalePendingPayouts.rows
      },
      system_account_movements: {
        severity: 'info',
        count: systemAccountMovements.rowCount,
        rows: systemAccountMovements.rows
      }
    };

    const criticalFailures = Object.values(report.checks).filter(
      (check) => check.severity === 'critical' && check.count > 0
    );

    console.log(`Reconciliation Window: ${report.window.label}`);
    console.log(
      `Critical findings: ${criticalFailures.length} checks with issues`
    );
    for (const [name, check] of Object.entries(report.checks)) {
      console.log(`${name}: ${check.count}`);
    }

    const outFile = process.env.QA_RECON_OUTPUT;
    if (outFile) {
      fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`Wrote reconciliation report to ${outFile}`);
    }

    if (criticalFailures.length > 0) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

void main();
