#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

const runs = [
  {
    id: 'PHASE-A-P0',
    command: 'node',
    args: ['./scripts/qa/p0-smoke.mjs']
  },
  {
    id: 'PHASE-B-DOMAIN',
    command: 'node',
    args: ['./scripts/qa/domain-batch-smoke.mjs']
  },
  {
    id: 'PHASE-C-NOTIFICATIONS',
    command: 'node',
    args: ['./scripts/qa/notifications-smoke.mjs']
  },
  {
    id: 'PHASE-D-SECURITY',
    command: 'node',
    args: ['./scripts/qa/security-rbac-smoke.mjs']
  },
  {
    id: 'PHASE-E-RELIABILITY',
    command: 'node',
    args: ['./scripts/qa/reliability-smoke.mjs']
  },
  {
    id: 'PHASE-E-LOAD-BASELINE',
    command: 'node',
    args: ['./scripts/qa/load-baseline.mjs']
  },
  {
    id: 'PHASE-F-RECONCILIATION',
    command: 'node',
    args: ['./scripts/qa/reconciliation-check.mjs']
  }
];

function runStep(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  console.log('Starting full core banking certification suite');
  const failed = [];

  for (const step of runs) {
    console.log(`\n>>> ${step.id}`);
    const code = await runStep(step);
    if (code !== 0) {
      failed.push(step.id);
      if ((process.env.QA_CONTINUE_ON_FAIL ?? 'false').toLowerCase() !== 'true') {
        break;
      }
    }
  }

  console.log('\nCertification Summary');
  if (failed.length === 0) {
    console.log('All phases passed');
    process.exit(0);
  }
  console.log(`Failed phases (${failed.length}): ${failed.join(', ')}`);
  process.exit(1);
}

void main();
