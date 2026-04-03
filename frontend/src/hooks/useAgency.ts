import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPatch, apiPost } from '../api/client';

type MaybeApiError = {
  status?: number;
  message?: string;
};

type ApiShape<T> = {
  data?: T;
  items?: T[];
  transactions?: T[];
  commissions?: T[];
};

const PROFILE_PATHS = ['/agents/me', '/agency/me'];
const METRICS_PATHS = ['/agents/me/metrics', '/agency/me/metrics'];
const TX_PATHS = ['/agents/me/transactions', '/agency/me/transactions'];
const COMMISSION_PATHS = ['/agents/me/commissions', '/agency/me/commissions'];
const ONBOARD_PATHS = ['/agents/onboard', '/agency/onboard'];
const CASH_IN_PATHS = ['/agents/cash-in', '/agency/cash-in'];
const CASH_OUT_PATHS = ['/agents/cash-out', '/agency/cash-out'];
const UPDATE_CONFIG_PATHS = ['/agents/me/wallet-config', '/agency/me/wallet-config'];

function isEndpointMissing(error: unknown) {
  const err = error as MaybeApiError | undefined;
  const status = Number(err?.status ?? 0);
  const message = String(err?.message ?? '').toLowerCase();
  return (
    status === 404 ||
    status === 501 ||
    message.includes('not found') ||
    message.includes('not implemented')
  );
}

export function isAgencyEndpointUnavailable(error: unknown) {
  return isEndpointMissing(error);
}

async function getWithFallback<T>(paths: string[], token?: string) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await apiGet<T>(path, token);
    } catch (error) {
      lastError = error;
      if (!isEndpointMissing(error)) throw error;
    }
  }
  throw lastError;
}

async function postWithFallback<T>(paths: string[], body: unknown, token?: string) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await apiPost<T>(path, body, token);
    } catch (error) {
      lastError = error;
      if (!isEndpointMissing(error)) throw error;
    }
  }
  throw lastError;
}

async function patchWithFallback<T>(paths: string[], body: unknown, token?: string) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await apiPatch<T>(path, body, token);
    } catch (error) {
      lastError = error;
      if (!isEndpointMissing(error)) throw error;
    }
  }
  throw lastError;
}

function toMinor(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export interface AgentProfile {
  id: string;
  ownerUserId: string;
  agentCode: string;
  businessName: string;
  agentType: string;
  principalId: string;
  superAgentId: string;
  walletId: string;
  status: string;
  tier: string;
  wallet?: {
    id: string;
    balanceMinor: number;
    availableBalanceMinor: number;
    lowBalanceAlert: boolean;
  };
  walletConfig?: {
    floatLimit: number;
    lowBalanceThreshold: number;
    autoFundEnabled: boolean;
    autoFundSource?: string | null;
    autoFundAmount?: number | null;
  };
}

export interface AgentMetrics {
  wallet_balance: number;
  low_balance_alert: boolean;
  today: {
    cash_in_count: number;
    cash_in_total: number;
    cash_out_count: number;
    cash_out_total: number;
    remaining_cash_out_limit: number;
    commission_earned: number;
  };
  this_week: {
    total_transactions: number;
    total_volume: number;
    total_commission: number;
  };
  performance_score: number;
  uptime_percentage: number;
  last_transaction_at?: string | null;
}

export interface AgentTransactionRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  amountMinor: number;
  commissionMinor: number;
  postedAt?: string;
}

export interface AgentCommissionRow {
  id: string;
  transactionId: string;
  transactionType: string;
  transactionAmount: number;
  commissionAmount: number;
  rate: number;
  status: string;
  settledAt?: string | null;
}

export interface CreateAgentPayload {
  business_name: string;
  agent_type: 'INDIVIDUAL' | 'CORPORATE';
  business_address: {
    street: string;
    city: string;
    state: string;
    country?: string;
  };
  geo_location: {
    lat: number;
    lng: number;
  };
  principal_id: string;
  super_agent_id: string;
  float_limit?: number;
  low_balance_threshold?: number;
  auto_fund_enabled?: boolean;
}

export interface AgentCashPayload {
  agent_id: string;
  customer_account: string;
  amount: number;
  principal_id: string;
  idempotency_key: string;
  agent_pin: string;
}

export interface AgentCashOutPayload extends AgentCashPayload {
  customer_pin: string;
}

function normalizeProfile(raw: any): AgentProfile {
  return {
    id: String(raw.id ?? ''),
    ownerUserId: String(raw.owner_user_id ?? raw.ownerUserId ?? ''),
    agentCode: String(raw.agent_code ?? raw.agentCode ?? ''),
    businessName: String(raw.business_name ?? raw.businessName ?? ''),
    agentType: String(raw.agent_type ?? raw.agentType ?? ''),
    principalId: String(raw.principal_id ?? raw.principalId ?? ''),
    superAgentId: String(raw.super_agent_id ?? raw.superAgentId ?? ''),
    walletId: String(raw.wallet_id ?? raw.walletId ?? ''),
    status: String(raw.status ?? 'PENDING'),
    tier: String(raw.tier ?? 'BASIC'),
    wallet: raw.wallet
      ? {
          id: String(raw.wallet.id ?? ''),
          balanceMinor: toMinor(raw.wallet.balance_minor ?? raw.wallet.balanceMinor),
          availableBalanceMinor: toMinor(
            raw.wallet.available_balance_minor ?? raw.wallet.availableBalanceMinor
          ),
          lowBalanceAlert: Boolean(raw.wallet.low_balance_alert ?? raw.wallet.lowBalanceAlert)
        }
      : undefined,
    walletConfig: raw.wallet_config
      ? {
          floatLimit: toMinor(raw.wallet_config.float_limit ?? raw.wallet_config.floatLimit),
          lowBalanceThreshold: toMinor(
            raw.wallet_config.low_balance_threshold ?? raw.wallet_config.lowBalanceThreshold
          ),
          autoFundEnabled: Boolean(
            raw.wallet_config.auto_fund_enabled ?? raw.wallet_config.autoFundEnabled
          ),
          autoFundSource: raw.wallet_config.auto_fund_source ?? raw.wallet_config.autoFundSource,
          autoFundAmount:
            raw.wallet_config.auto_fund_amount ?? raw.wallet_config.autoFundAmount ?? null
        }
      : undefined
  };
}

function normalizeTransaction(raw: any): AgentTransactionRow {
  return {
    id: String(raw.id ?? ''),
    reference: String(raw.reference ?? ''),
    type: String(raw.type ?? ''),
    status: String(raw.status ?? ''),
    amountMinor: toMinor(raw.amount_minor ?? raw.amountMinor),
    commissionMinor: toMinor(raw.commission_minor ?? raw.commissionMinor),
    postedAt: raw.posted_at ?? raw.postedAt
  };
}

function normalizeCommission(raw: any): AgentCommissionRow {
  return {
    id: String(raw.id ?? ''),
    transactionId: String(raw.transaction_id ?? raw.transactionId ?? ''),
    transactionType: String(raw.transaction_type ?? raw.transactionType ?? ''),
    transactionAmount: toMinor(raw.transaction_amount ?? raw.transactionAmount),
    commissionAmount: toMinor(raw.commission_amount ?? raw.commissionAmount),
    rate: Number(raw.rate ?? 0),
    status: String(raw.status ?? ''),
    settledAt: raw.settled_at ?? raw.settledAt
  };
}

function invalidateAgencyViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['agency', 'profile'] });
  void queryClient.invalidateQueries({ queryKey: ['agency', 'metrics'] });
  void queryClient.invalidateQueries({ queryKey: ['agency', 'transactions'] });
  void queryClient.invalidateQueries({ queryKey: ['agency', 'commissions'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets'] });
}

export function useAgencyProfile(token?: string) {
  return useQuery({
    queryKey: ['agency', 'profile'],
    queryFn: async () => {
      if (!token) return null;
      try {
        const response = await getWithFallback<ApiShape<any>>(PROFILE_PATHS, token);
        const payload = (response?.data ?? response) as any;
        if (!payload || typeof payload !== 'object') return null;
        return normalizeProfile(payload);
      } catch (error) {
        if (isEndpointMissing(error)) return null;
        throw error;
      }
    },
    enabled: !!token
  });
}

export function useAgencyMetrics(token?: string, enabled = true) {
  return useQuery({
    queryKey: ['agency', 'metrics'],
    queryFn: async () => {
      if (!token) return null;
      const response = await getWithFallback<ApiShape<AgentMetrics>>(METRICS_PATHS, token);
      return (response?.data ?? response) as AgentMetrics;
    },
    enabled: !!token && enabled
  });
}

export function useAgencyTransactions(token?: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['agency', 'transactions', limit],
    queryFn: async () => {
      if (!token) return [];
      const paths = TX_PATHS.map((path) => `${path}?limit=${limit}`);
      const response = await getWithFallback<ApiShape<any>>(paths, token);
      const rows = (response?.transactions ?? response?.items ?? response?.data ?? response) as any[];
      return (Array.isArray(rows) ? rows : []).map(normalizeTransaction);
    },
    enabled: !!token && enabled
  });
}

export function useAgencyCommissions(token?: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['agency', 'commissions', limit],
    queryFn: async () => {
      if (!token) return [];
      const paths = COMMISSION_PATHS.map((path) => `${path}?limit=${limit}`);
      const response = await getWithFallback<ApiShape<any>>(paths, token);
      const rows = (response?.commissions ?? response?.items ?? response?.data ?? response) as any[];
      return (Array.isArray(rows) ? rows : []).map(normalizeCommission);
    },
    enabled: !!token && enabled
  });
}

export function useCreateAgent(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAgentPayload) => postWithFallback(ONBOARD_PATHS, body, token),
    onSuccess: () => invalidateAgencyViews(queryClient)
  });
}

export function useAgencyCashIn(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentCashPayload) => postWithFallback(CASH_IN_PATHS, body, token),
    onSuccess: () => invalidateAgencyViews(queryClient)
  });
}

export function useAgencyCashOut(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AgentCashOutPayload) => postWithFallback(CASH_OUT_PATHS, body, token),
    onSuccess: () => invalidateAgencyViews(queryClient)
  });
}

export function useUpdateAgencyWalletConfig(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      float_limit?: number;
      low_balance_threshold?: number;
      auto_fund_enabled?: boolean;
      auto_fund_source?: string;
      auto_fund_amount?: number;
    }) => patchWithFallback(UPDATE_CONFIG_PATHS, body, token),
    onSuccess: () => invalidateAgencyViews(queryClient)
  });
}

