import { AccountType } from './enums/account-type.enum';
import { EntryDirection } from './enums/entry-direction.enum';
import { GlAccountType, GlNormalBalance } from './entities/gl-account.entity';

export interface GlChartSeed {
  accountCode: string;
  accountName: string;
  parentCode: string | null;
  accountType: GlAccountType;
  normalBalance: GlNormalBalance;
}

export const DEFAULT_GL_CHART: GlChartSeed[] = [
  { accountCode: '1000', accountName: 'ASSETS', parentCode: null, accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1100', accountName: 'Cash & Bank Balances', parentCode: '1000', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1110', accountName: 'Vault Cash', parentCode: '1100', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1120', accountName: 'Balances with CBN', parentCode: '1100', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1130', accountName: 'Commercial Bank Accounts', parentCode: '1100', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1200', accountName: 'Customer Assets (Financing)', parentCode: '1000', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1210', accountName: 'Murabaha Receivables', parentCode: '1200', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1220', accountName: 'Musharakah Investments', parentCode: '1200', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '1300', accountName: 'Fixed Assets', parentCode: '1000', accountType: GlAccountType.ASSET, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '2000', accountName: 'LIABILITIES', parentCode: null, accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '2100', accountName: 'Customer Deposits', parentCode: '2000', accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '2110', accountName: 'Savings Accounts', parentCode: '2100', accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '2120', accountName: 'Current Accounts', parentCode: '2100', accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '2130', accountName: 'Agent Wallets', parentCode: '2100', accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '2200', accountName: 'Profit Payable to Depositors', parentCode: '2000', accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '2300', accountName: 'Regulatory Reserves', parentCode: '2000', accountType: GlAccountType.LIABILITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '3000', accountName: 'EQUITY', parentCode: null, accountType: GlAccountType.EQUITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '3100', accountName: 'Paid-up Capital', parentCode: '3000', accountType: GlAccountType.EQUITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '3200', accountName: 'Retained Earnings', parentCode: '3000', accountType: GlAccountType.EQUITY, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '4000', accountName: 'INCOME', parentCode: null, accountType: GlAccountType.INCOME, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '4100', accountName: 'Fee Income', parentCode: '4000', accountType: GlAccountType.INCOME, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '4200', accountName: 'Commission Income', parentCode: '4000', accountType: GlAccountType.INCOME, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '4300', accountName: 'Profit Share (from Mudarabah/Musharakah)', parentCode: '4000', accountType: GlAccountType.INCOME, normalBalance: GlNormalBalance.CREDIT },
  { accountCode: '5000', accountName: 'EXPENSES', parentCode: null, accountType: GlAccountType.EXPENSE, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '5100', accountName: 'Operating Expenses', parentCode: '5000', accountType: GlAccountType.EXPENSE, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '5200', accountName: 'Staff Costs', parentCode: '5000', accountType: GlAccountType.EXPENSE, normalBalance: GlNormalBalance.DEBIT },
  { accountCode: '5300', accountName: 'Profit Distributed to Investors', parentCode: '5000', accountType: GlAccountType.EXPENSE, normalBalance: GlNormalBalance.DEBIT }
];

export function resolveGlAccountCode(params: {
  accountType: AccountType;
  category?: string;
  direction: EntryDirection;
}): string {
  const category = params.category?.trim().toUpperCase();
  if (category === 'FEE') return '4100';
  if (category === 'REVERSAL' && params.accountType === AccountType.FEES) return '4100';

  if (
    params.accountType === AccountType.TREASURY ||
    params.accountType === AccountType.RESERVE ||
    params.accountType === AccountType.WALLET_ESCROW
  ) {
    return '1130';
  }
  if (
    params.accountType === AccountType.WALLET_MAIN ||
    params.accountType === AccountType.SAVINGS
  ) {
    return '2110';
  }
  if (params.accountType === AccountType.AGENT) {
    return '2130';
  }
  if (params.accountType === AccountType.FEES) {
    return params.direction === EntryDirection.DEBIT ? '5100' : '4100';
  }
  return '2300';
}
