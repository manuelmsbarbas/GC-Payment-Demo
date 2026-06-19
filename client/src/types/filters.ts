export type FlowType = 'hosted' | 'custom' | 'js-drop-in';
export type SchemeId = 'Bacs' | 'SEPA' | 'BECS' | 'BecsNz' | 'Autogiro' | 'Betalingsservice' | 'PAD' | 'ACH';

export interface FilterState {
  flowType: FlowType;
  countryCode: string;
  scheme: SchemeId;
}

export interface BankField {
  key: string;
  label: string;
  value: string;
}

export interface BankDetails {
  scheme: string;
  country: string;
  countryCode: string;
  currency: string;
  iban: string | null;
  displayMode: 'iban' | 'local';
  bankFields: BankField[];
  customerDefaults: { address_line1: string; city: string; postal_code: string };
  supportsInstantBankPay: boolean;
}
