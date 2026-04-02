import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '../api/client';

type MaybeApiError = {
  status?: number;
  message?: string;
};

type ApiShape<T> = {
  data?: T;
  merchant?: T;
  items?: T[];
  terminals?: T[];
  settlements?: T[];
  transactions?: T[];
  rows?: T[];
};

const PROFILE_PATHS = ['/merchants/me', '/merchant/me'];
const CREATE_PATHS = ['/merchants', '/merchant'];
const TERMINALS_PATHS = ['/merchants/me/terminals', '/merchant/terminals'];
const SETTLEMENTS_PATHS = ['/merchants/me/settlements', '/merchant/settlements'];
const TRANSACTIONS_PATHS = ['/merchants/me/transactions', '/merchant/transactions'];
const POS_REQUEST_PATHS = ['/merchants/me/pos-request', '/merchant/pos-request'];

export interface MerchantAddress {
  street: string;
  city: string;
  state: string;
  country?: string;
}

export interface MerchantGeoLocation {
  lat: number;
  lng: number;
}

export interface MerchantProfile {
  id: string;
  merchantCode?: string;
  businessName: string;
  businessType: string;
  categoryCode: string;
  status: string;
  walletId?: string;
  settlementAccount?: string;
  settlementBank?: string;
  address?: MerchantAddress;
  geoLocation?: MerchantGeoLocation;
  geoFenceRadius?: number;
  approvedAt?: string;
  createdAt?: string;
}

export interface CreateMerchantPayload {
  business_name: string;
  business_type: 'SOLE_PROPRIETORSHIP' | 'LLC' | 'PLC';
  category_code: string;
  tin?: string;
  rc_number?: string;
  address: MerchantAddress;
  geo_location: MerchantGeoLocation;
  geo_fence_radius?: number;
  settlement_account: string;
  settlement_bank: string;
}

export interface CreateMerchantResponse {
  merchant_id: string;
  status: string;
  wallet_id?: string;
  merchant_code?: string;
}

export interface MerchantTerminal {
  id: string;
  terminalId: string;
  serialNumber?: string;
  model?: string;
  ptsaId?: string;
  geoLocation?: MerchantGeoLocation;
  geoFenceRadius?: number;
  isOnline?: boolean;
  status: string;
  lastHeartbeat?: string;
}

export interface MerchantSettlement {
  id: string;
  cycle: string;
  settlementDate: string;
  totalAmountMinor: number;
  totalFeeMinor: number;
  netAmountMinor: number;
  transactionCount: number;
  status: string;
  reference: string;
  settledAt?: string;
}

export interface MerchantTransaction {
  id: string;
  reference: string;
  amountMinor: number;
  feeMinor: number;
  netAmountMinor: number;
  currency: string;
  status: string;
  channel: string;
  type?: string;
  customerMaskedPan?: string;
  postedAt?: string;
}

export interface PosRequestPayload {
  quantity: number;
  model?: string;
  notes?: string;
}

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

export function isMerchantEndpointUnavailable(error: unknown) {
  return isEndpointMissing(error);
}

async function getWithFallback<T>(paths: string[], token?: string) {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await apiGet<T>(path, token);
    } catch (error) {
      lastError = error;
      if (!isEndpointMissing(error)) {
        throw error;
      }
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
      if (!isEndpointMissing(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}

function toMinor(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeMerchant(raw: any): MerchantProfile {
  return {
    id: String(raw.id ?? raw.merchant_id ?? raw.merchantId ?? ''),
    merchantCode: raw.merchant_code ?? raw.merchantCode,
    businessName: raw.business_name ?? raw.businessName ?? 'Unnamed Merchant',
    businessType: raw.business_type ?? raw.businessType ?? 'SOLE_PROPRIETORSHIP',
    categoryCode: raw.category_code ?? raw.categoryCode ?? '',
    status: raw.status ?? 'PENDING',
    walletId: raw.wallet_id ?? raw.walletId,
    settlementAccount: raw.settlement_account ?? raw.settlementAccount,
    settlementBank: raw.settlement_bank ?? raw.settlementBank,
    address: raw.address,
    geoLocation: raw.geo_location ?? raw.geoLocation,
    geoFenceRadius: Number(raw.geo_fence_radius ?? raw.geoFenceRadius ?? 10),
    approvedAt: raw.approved_at ?? raw.approvedAt,
    createdAt: raw.created_at ?? raw.createdAt
  };
}

function normalizeTerminal(raw: any): MerchantTerminal {
  return {
    id: String(raw.id ?? raw.terminal_id ?? raw.terminalId ?? ''),
    terminalId: String(raw.terminal_id ?? raw.terminalId ?? ''),
    serialNumber: raw.serial_number ?? raw.serialNumber,
    model: raw.model,
    ptsaId: raw.ptsa_id ?? raw.ptsaId,
    geoLocation: raw.geo_location ?? raw.geoLocation,
    geoFenceRadius: Number(raw.geo_fence_radius ?? raw.geoFenceRadius ?? 10),
    isOnline: raw.is_online ?? raw.isOnline,
    status: raw.status ?? 'ACTIVE',
    lastHeartbeat: raw.last_heartbeat ?? raw.lastHeartbeat
  };
}

function normalizeSettlement(raw: any): MerchantSettlement {
  const totalAmountMinor = toMinor(raw.total_amount ?? raw.totalAmountMinor ?? raw.totalAmount);
  const totalFeeMinor = toMinor(raw.total_fee ?? raw.totalFeeMinor ?? raw.totalFee);
  const netAmountMinor =
    raw.net_amount !== undefined || raw.netAmountMinor !== undefined || raw.netAmount !== undefined
      ? toMinor(raw.net_amount ?? raw.netAmountMinor ?? raw.netAmount)
      : totalAmountMinor - totalFeeMinor;

  return {
    id: String(raw.id ?? raw.reference ?? ''),
    cycle: String(raw.cycle ?? 'T1'),
    settlementDate: String(raw.settlement_date ?? raw.settlementDate ?? raw.createdAt ?? ''),
    totalAmountMinor,
    totalFeeMinor,
    netAmountMinor,
    transactionCount: Number(raw.transaction_count ?? raw.transactionCount ?? 0),
    status: raw.status ?? 'PENDING',
    reference: String(raw.reference ?? raw.id ?? ''),
    settledAt: raw.settled_at ?? raw.settledAt
  };
}

function normalizeTransaction(raw: any): MerchantTransaction {
  const amountMinor = toMinor(raw.amount_minor ?? raw.amountMinor ?? raw.amount ?? 0);
  const feeMinor = toMinor(raw.fee_minor ?? raw.feeMinor ?? raw.fee ?? 0);
  return {
    id: String(raw.id ?? raw.reference ?? ''),
    reference: String(raw.reference ?? raw.id ?? ''),
    amountMinor,
    feeMinor,
    netAmountMinor:
      raw.net_amount !== undefined || raw.netAmountMinor !== undefined || raw.netAmount !== undefined
        ? toMinor(raw.net_amount ?? raw.netAmountMinor ?? raw.netAmount)
        : amountMinor - feeMinor,
    currency: String(raw.currency ?? 'NGN'),
    status: raw.status ?? 'PENDING',
    channel: raw.channel ?? 'UNKNOWN',
    type: raw.type,
    customerMaskedPan: raw.customer_masked_pan ?? raw.customerMaskedPan,
    postedAt: raw.posted_at ?? raw.postedAt ?? raw.createdAt
  };
}

function invalidateMerchantViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['merchant', 'profile'] });
  void queryClient.invalidateQueries({ queryKey: ['merchant', 'terminals'] });
  void queryClient.invalidateQueries({ queryKey: ['merchant', 'settlements'] });
  void queryClient.invalidateQueries({ queryKey: ['merchant', 'transactions'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets'] });
}

export function useMerchantProfile(token?: string) {
  return useQuery({
    queryKey: ['merchant', 'profile'],
    queryFn: async () => {
      if (!token) return null;
      try {
        const response = await getWithFallback<ApiShape<any>>(PROFILE_PATHS, token);
        const payload = response?.merchant ?? response?.data ?? response;
        if (!payload || typeof payload !== 'object') return null;
        const normalized = normalizeMerchant(payload);
        return normalized.id ? normalized : null;
      } catch (error) {
        if (isEndpointMissing(error)) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!token
  });
}

export function useCreateMerchant(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateMerchantPayload) => {
      const response = await postWithFallback<ApiShape<CreateMerchantResponse>>(CREATE_PATHS, body, token);
      return (response?.data ?? response) as CreateMerchantResponse;
    },
    onSuccess: () => invalidateMerchantViews(queryClient)
  });
}

export function useMerchantTerminals(token?: string, enabled = true) {
  return useQuery({
    queryKey: ['merchant', 'terminals'],
    queryFn: async () => {
      if (!token) return [];
      try {
        const response = await getWithFallback<ApiShape<any>>(TERMINALS_PATHS, token);
        const payload =
          response?.terminals ?? response?.items ?? response?.rows ?? response?.data ?? response;
        return asArray<any>(payload).map(normalizeTerminal);
      } catch (error) {
        if (isEndpointMissing(error)) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!token && enabled
  });
}

export function useMerchantSettlements(token?: string, limit = 30, enabled = true) {
  return useQuery({
    queryKey: ['merchant', 'settlements', limit],
    queryFn: async () => {
      if (!token) return [];
      try {
        const paths = SETTLEMENTS_PATHS.map((path) => `${path}?limit=${limit}`);
        const response = await getWithFallback<ApiShape<any>>(paths, token);
        const payload =
          response?.settlements ?? response?.items ?? response?.rows ?? response?.data ?? response;
        return asArray<any>(payload).map(normalizeSettlement);
      } catch (error) {
        if (isEndpointMissing(error)) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!token && enabled
  });
}

export function useMerchantTransactions(token?: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: ['merchant', 'transactions', limit],
    queryFn: async () => {
      if (!token) return [];
      try {
        const paths = TRANSACTIONS_PATHS.map((path) => `${path}?limit=${limit}`);
        const response = await getWithFallback<ApiShape<any>>(paths, token);
        const payload =
          response?.transactions ?? response?.items ?? response?.rows ?? response?.data ?? response;
        return asArray<any>(payload).map(normalizeTransaction);
      } catch (error) {
        if (isEndpointMissing(error)) {
          return [];
        }
        throw error;
      }
    },
    enabled: !!token && enabled
  });
}

export function useRequestPosTerminal(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PosRequestPayload) =>
      postWithFallback<{ request_id?: string; status?: string }>(POS_REQUEST_PATHS, body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['merchant', 'terminals'] });
    }
  });
}

