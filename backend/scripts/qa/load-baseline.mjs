#!/usr/bin/env node

import crypto from 'node:crypto';
import process from 'node:process';

const baseUrl = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const apiBase = `${baseUrl}/api`;
const password = process.env.QA_PASSWORD ?? 'QaLoad#123';
const iterations = Number.parseInt(process.env.QA_LOAD_ITERATIONS ?? '30', 10);
const concurrency = Number.parseInt(process.env.QA_LOAD_CONCURRENCY ?? '6', 10);

function rand(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
}

function randomPhone() {
  const rest = `${Math.floor(Math.random() * 10 ** 7)}`.padStart(7, '0');
  return `+234803${rest}`;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function request(method, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const started = Date.now();
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const durationMs = Date.now() - started;
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
    payload,
    durationMs
  };
}

async function runPool(tasks, limit) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      results[current] = await tasks[current]();
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => worker()));
  return results;
}

function summarize(label, entries) {
  const durations = entries.map((item) => item.durationMs);
  const failed = entries.filter((item) => !item.ok);
  const avg = durations.reduce((sum, value) => sum + value, 0) / Math.max(1, durations.length);
  return {
    label,
    total: entries.length,
    failed: failed.length,
    firstFailure: failed[0]
      ? {
          status: failed[0].status,
          payload: failed[0].payload
        }
      : null,
    avgMs: Math.round(avg),
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99)
  };
}

async function main() {
  console.log(`Running load baseline against ${apiBase}`);

  const user = {
    phoneNumber: randomPhone(),
    email: `${rand('load')}.qa@trumonie.qa`,
    username: rand('loaduser').replace(/-/g, ''),
    firstName: 'Load',
    lastName: 'Baseline',
    password
  };

  const register = await request('POST', '/auth/register', { body: user });
  if (!register.ok) {
    throw new Error(`register failed ${register.status}: ${JSON.stringify(register.payload)}`);
  }

  const login = await request('POST', '/auth/login', {
    body: { identifier: user.email, password }
  });
  if (!login.ok) {
    throw new Error(`login failed ${login.status}: ${JSON.stringify(login.payload)}`);
  }
  const token = login.payload?.tokens?.accessToken;
  if (!token) throw new Error('missing token after register');

  const wallets = await request('GET', '/wallets', { token });
  if (!wallets.ok || !Array.isArray(wallets.payload) || wallets.payload.length === 0) {
    throw new Error(`wallet setup failed ${wallets.status}`);
  }
  const walletId = wallets.payload[0].id;

  const loginTasks = Array.from({ length: iterations }, () => () =>
    request('POST', '/auth/login', {
      body: { identifier: user.email, password }
    })
  );

  const walletTasks = Array.from({ length: iterations }, () => () =>
    request('GET', '/wallets', { token })
  );

  const statementTasks = Array.from({ length: iterations }, () => () =>
    request('GET', `/wallets/${walletId}/statement?limit=20&offset=0`, { token })
  );

  const loginRuns = await runPool(loginTasks, concurrency);
  const walletRuns = await runPool(walletTasks, concurrency);
  const statementRuns = await runPool(statementTasks, concurrency);

  const summaries = [
    summarize('auth/login', loginRuns),
    summarize('wallets/list', walletRuns),
    summarize('wallets/statement', statementRuns)
  ];

  console.log('\nLoad Baseline Summary');
  for (const summary of summaries) {
    console.log(
      `${summary.label}: total=${summary.total} failed=${summary.failed} avg=${summary.avgMs}ms p50=${summary.p50Ms}ms p95=${summary.p95Ms}ms p99=${summary.p99Ms}ms`
    );
    if (summary.firstFailure) {
      console.log(
        `${summary.label}: firstFailure status=${summary.firstFailure.status} payload=${JSON.stringify(
          summary.firstFailure.payload
        )}`
      );
    }
  }

  const failures = summaries.filter((item) => item.failed > 0);
  if (failures.length > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
