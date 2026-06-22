import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFilters } from '../context/FilterContext';
import { SCHEME_API_ID } from '../types/filters';
import { PAYMENT_METHODS } from '../data/paymentMethods';
import type { PaymentMethodId } from '../data/paymentMethods';
import type {
  SubscriptionFlow,
  OneOffDDFlow,
  InstalmentFlow,
  IBPFlow,
  InstantPlusDDFlow,
  BillingRequest,
  Subscription,
  Payment,
  InstalmentSchedule,
  CreateInstalmentScheduleBody,
  Institution,
  BankAuthorisation,
} from '../types/api';
import { BankAccountFields } from './BankAccountFields';

interface FlowModalProps {
  methodId: PaymentMethodId;
  onClose: () => void;
}

interface CustomerForm {
  given_name: string;
  family_name: string;
  email: string;
  address_line1: string;
  city: string;
  postal_code: string;
  country_code: string;
  account_holder_name: string;
}

interface InstalmentDateRow {
  amount: string;
  charge_date: string;
}

interface InstalmentScheduleParams {
  start_date: string;
  interval: string;
  interval_unit: 'weekly' | 'monthly' | 'yearly';
}

function defaultDates(): InstalmentDateRow[] {
  return [1, 2, 3].map(offset => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    d.setDate(1);
    return { amount: '10.00', charge_date: d.toISOString().slice(0, 10) };
  });
}

function defaultScheduleStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const INITIAL_SUBSCRIPTION_FLOW: SubscriptionFlow = {
  createBillingRequest: { status: 'idle' },
  collectCustomerDetails: { status: 'idle' },
  collectBankAccount: { status: 'idle' },
  confirmPayerDetails: { status: 'idle' },
  fulfilBillingRequest: { status: 'idle' },
  createSubscription: { status: 'idle' },
};

const INITIAL_ONE_OFF_FLOW: OneOffDDFlow = {
  createBillingRequest: { status: 'idle' },
  collectCustomerDetails: { status: 'idle' },
  collectBankAccount: { status: 'idle' },
  confirmPayerDetails: { status: 'idle' },
  fulfilBillingRequest: { status: 'idle' },
  createPayment: { status: 'idle' },
};

const INITIAL_INSTALMENT_FLOW: InstalmentFlow = {
  createBillingRequest: { status: 'idle' },
  collectCustomerDetails: { status: 'idle' },
  collectBankAccount: { status: 'idle' },
  confirmPayerDetails: { status: 'idle' },
  fulfilBillingRequest: { status: 'idle' },
  createInstalmentSchedule: { status: 'idle' },
};

const SUBSCRIPTION_STEPS: Array<{ key: keyof SubscriptionFlow; label: string }> = [
  { key: 'createBillingRequest', label: 'Create Billing Request' },
  { key: 'collectCustomerDetails', label: 'Collect Customer Details' },
  { key: 'collectBankAccount', label: 'Collect Bank Account' },
  { key: 'confirmPayerDetails', label: 'Confirm Payer Details' },
  { key: 'fulfilBillingRequest', label: 'Fulfil Billing Request' },
  { key: 'createSubscription', label: 'Create Subscription' },
];

const ONE_OFF_STEPS: Array<{ key: keyof OneOffDDFlow; label: string }> = [
  { key: 'createBillingRequest', label: 'Create Billing Request' },
  { key: 'collectCustomerDetails', label: 'Collect Customer Details' },
  { key: 'collectBankAccount', label: 'Collect Bank Account' },
  { key: 'confirmPayerDetails', label: 'Confirm Payer Details' },
  { key: 'fulfilBillingRequest', label: 'Fulfil Billing Request' },
  { key: 'createPayment', label: 'Create Payment' },
];

const INSTALMENT_STEPS: Array<{ key: keyof InstalmentFlow; label: string }> = [
  { key: 'createBillingRequest', label: 'Create Billing Request' },
  { key: 'collectCustomerDetails', label: 'Collect Customer Details' },
  { key: 'collectBankAccount', label: 'Collect Bank Account' },
  { key: 'confirmPayerDetails', label: 'Confirm Payer Details' },
  { key: 'fulfilBillingRequest', label: 'Fulfil Billing Request' },
  { key: 'createInstalmentSchedule', label: 'Create Instalment Schedule' },
];

const IBP_STEPS: Array<{ key: keyof IBPFlow; label: string }> = [
  { key: 'selectInstitution', label: 'Select Institution' },
  { key: 'createBankAuthorisation', label: 'Create Bank Authorisation' },
];

const INITIAL_IBP_FLOW: IBPFlow = {
  selectInstitution: { status: 'idle' },
  createBankAuthorisation: { status: 'idle' },
};

const INSTANT_PLUS_DD_STEPS: Array<{ key: keyof InstantPlusDDFlow; label: string }> = [
  { key: 'createBillingRequest', label: 'Create Billing Request' },
  { key: 'collectCustomerDetails', label: 'Collect Customer Details' },
  { key: 'selectInstitution', label: 'Select Institution' },
  { key: 'createBankAuthorisation', label: 'Create Bank Authorisation' },
  { key: 'createSubscription', label: 'Create Subscription' },
];

const INITIAL_INSTANT_PLUS_DD_FLOW: InstantPlusDDFlow = {
  createBillingRequest: { status: 'idle' },
  collectCustomerDetails: { status: 'idle' },
  selectInstitution: { status: 'idle' },
  createBankAuthorisation: { status: 'idle' },
  createSubscription: { status: 'idle' },
};

const STATUS_ICON: Record<string, string> = {
  idle: '○',
  loading: '◌',
  success: '✓',
  error: '✗',
};

type WizardPhase = 'filling' | 'submitting';

interface WizardStepDef {
  id: string;
  title: string;
  description: string;
}

export function FlowModal({ methodId, onClose }: FlowModalProps) {
  const { filters, bankDetails } = useFilters();
  const method = PAYMENT_METHODS.find(m => m.id === methodId)!;

  const isSubscription = methodId === 'subscription';
  const isOneOffDD = methodId === 'one-off-dd';
  const isInstalment = methodId === 'instalment';
  const isIBP = methodId === 'instant-bank-pay';
  const isInstantPlusDD = methodId === 'instant-plus-dd';

  const demoSupported =
    ((isSubscription || isOneOffDD || isInstalment) && bankDetails != null) ||
    (isIBP && filters.countryCode === 'GB') ||
    (isInstantPlusDD && filters.countryCode === 'GB');

  const [customer, setCustomer] = useState<CustomerForm>({
    given_name: 'Manuel',
    family_name: 'Barbas',
    email: 'mbarbas@gocardless.com',
    account_holder_name: 'Manuel Barbas',
    address_line1: bankDetails?.customerDefaults.address_line1 ?? '',
    city: bankDetails?.customerDefaults.city ?? '',
    postal_code: bankDetails?.customerDefaults.postal_code ?? '',
    country_code: filters.countryCode,
  });

  const [bankValues, setBankValues] = useState<Record<string, string>>(() => {
    if (!bankDetails) return {};
    if (bankDetails.displayMode === 'iban') return { iban: bankDetails.iban ?? '' };
    return Object.fromEntries(bankDetails.bankFields.map(f => [f.key, f.value]));
  });

  const [amountInput, setAmountInput] = useState('25.00');

  // Subscription config — used by both 'subscription' and 'instant-plus-dd' flows
  const [subName, setSubName] = useState('Monthly Subscription');
  const [subAmount, setSubAmount] = useState('10.00');
  const [subInterval, setSubInterval] = useState('1');
  const [subIntervalUnit, setSubIntervalUnit] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');

  const [instalmentMode, setInstalmentMode] = useState<'dates' | 'schedule'>('dates');
  const [instalmentName, setInstalmentName] = useState('Payment Plan 001');
  const [instalmentDates, setInstalmentDates] = useState<InstalmentDateRow[]>(defaultDates);
  const [instalmentScheduleParams, setInstalmentScheduleParams] = useState<InstalmentScheduleParams>({
    start_date: defaultScheduleStartDate(),
    interval: '1',
    interval_unit: 'monthly',
  });
  const [instalmentAmounts, setInstalmentAmounts] = useState<string[]>(['10.00', '10.00', '10.00']);

  useEffect(() => {
    if (!bankDetails) return;
    setCustomer(c => ({
      ...c,
      address_line1: bankDetails.customerDefaults.address_line1,
      city: bankDetails.customerDefaults.city,
      postal_code: bankDetails.customerDefaults.postal_code,
      country_code: bankDetails.countryCode,
    }));
    if (bankDetails.displayMode === 'iban') {
      setBankValues({ iban: bankDetails.iban ?? '' });
    } else {
      setBankValues(Object.fromEntries(bankDetails.bankFields.map(f => [f.key, f.value])));
    }
  }, [bankDetails]);

  const [subscriptionFlow, setSubscriptionFlow] = useState<SubscriptionFlow>(INITIAL_SUBSCRIPTION_FLOW);
  const [oneOffFlow, setOneOffFlow] = useState<OneOffDDFlow>(INITIAL_ONE_OFF_FLOW);
  const [instalmentFlow, setInstalmentFlow] = useState<InstalmentFlow>(INITIAL_INSTALMENT_FLOW);
  const [ibpFlow, setIbpFlow] = useState<IBPFlow>(INITIAL_IBP_FLOW);
  const [ibpPrepareState, setIbpPrepareState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ibpPrepareError, setIbpPrepareError] = useState('');
  const [ibpBillingRequestId, setIbpBillingRequestId] = useState('');
  const [instantPlusDDFlow, setInstantPlusDDFlow] = useState<InstantPlusDDFlow>(INITIAL_INSTANT_PLUS_DD_FLOW);
  const [instantPlusDDPrepareState, setInstantPlusDDPrepareState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [instantPlusDDPrepareError, setInstantPlusDDPrepareError] = useState('');
  const [instantPlusDDBillingRequestId, setInstantPlusDDBillingRequestId] = useState('');
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [running, setRunning] = useState(false);

  const [wizardPhase, setWizardPhase] = useState<WizardPhase>('filling');
  const [wizardStep, setWizardStep] = useState(0);

  const wizardSteps: WizardStepDef[] = [
    { id: 'customer', title: 'Customer Details', description: 'Enter your personal information' },
    ...(!isIBP && !isInstantPlusDD ? [{ id: 'bank', title: 'Bank Account', description: 'Enter your bank account details' }] : []),
    ...(isOneOffDD || isIBP || isInstantPlusDD ? [{ id: 'payment', title: 'Payment Amount', description: 'Set the amount for this payment' }] : []),
    ...(isInstalment ? [{ id: 'instalment', title: 'Instalment Schedule', description: 'Configure your instalment schedule' }] : []),
    ...(isInstantPlusDD ? [{ id: 'subscription', title: 'Subscription Config', description: 'Configure the recurring subscription' }] : []),
    ...(isIBP || isInstantPlusDD ? [{ id: 'institution', title: 'Select Bank', description: 'Choose your bank to authorise the payment' }] : []),
    { id: 'review', title: 'Review & Confirm', description: (isIBP || isInstantPlusDD) ? 'Check details before proceeding to your bank' : 'Check your details before submitting' },
  ];

  const totalSteps = wizardSteps.length;
  const currentStepDef = wizardSteps[wizardStep];
  const isReviewStep = currentStepDef?.id === 'review';

  function setSubStep<K extends keyof SubscriptionFlow>(key: K, update: Partial<SubscriptionFlow[K]>) {
    setSubscriptionFlow(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function setOneOffStep<K extends keyof OneOffDDFlow>(key: K, update: Partial<OneOffDDFlow[K]>) {
    setOneOffFlow(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function setInstalmentStep<K extends keyof InstalmentFlow>(key: K, update: Partial<InstalmentFlow[K]>) {
    setInstalmentFlow(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function setIbpStep<K extends keyof IBPFlow>(key: K, update: Partial<IBPFlow[K]>) {
    setIbpFlow(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function setInstantPlusDDStep<K extends keyof InstantPlusDDFlow>(key: K, update: Partial<InstantPlusDDFlow[K]>) {
    setInstantPlusDDFlow(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  async function prepareInstantPlusDD() {
    if (instantPlusDDPrepareState === 'loading') return;
    setInstantPlusDDPrepareState('loading');
    setInstantPlusDDPrepareError('');
    setInstitutions([]);
    setSelectedInstitution('');
    setInstantPlusDDBillingRequestId('');
    const amountMinorUnits = Math.round(parseFloat(amountInput) * 100);

    try {
      const br: BillingRequest = await api.createBillingRequest({
        payment_type: 'instant-plus-dd',
        amount: amountMinorUnits,
        currency: 'GBP',
      });
      setInstantPlusDDBillingRequestId(br.id);

      await api.collectCustomerDetails(br.id, {
        given_name: customer.given_name,
        family_name: customer.family_name,
        email: customer.email,
        address_line1: customer.address_line1,
        city: customer.city,
        postal_code: customer.postal_code,
        country_code: customer.country_code,
      });

      const instList = await api.getInstitutions(br.id);
      setInstitutions(instList);
      setInstantPlusDDPrepareState('success');
    } catch (err) {
      setInstantPlusDDPrepareState('error');
      setInstantPlusDDPrepareError(err instanceof Error ? err.message : 'Failed to prepare Instant + DD payment');
    }
  }

  async function prepareIBP() {
    if (ibpPrepareState === 'loading') return; // prevent double-trigger
    setIbpPrepareState('loading');
    setIbpPrepareError('');
    setInstitutions([]);
    setSelectedInstitution('');
    setIbpBillingRequestId('');
    const amountMinorUnits = Math.round(parseFloat(amountInput) * 100);

    try {
      const br: BillingRequest = await api.createBillingRequest({
        payment_type: 'payment',
        amount: amountMinorUnits,
        currency: 'GBP',
      });
      setIbpBillingRequestId(br.id);

      await api.collectCustomerDetails(br.id, {
        given_name: customer.given_name,
        family_name: customer.family_name,
        email: customer.email,
        address_line1: customer.address_line1,
        city: customer.city,
        postal_code: customer.postal_code,
        country_code: customer.country_code,
      });

      const instList = await api.getInstitutions(br.id);
      setInstitutions(instList);
      setIbpPrepareState('success');
    } catch (err) {
      setIbpPrepareState('error');
      setIbpPrepareError(err instanceof Error ? err.message : 'Failed to prepare bank payment');
    }
  }

  // Auto-trigger IBP / Instant+DD preparation when the institution step becomes active.
  // Handles the case where the user navigated here via the ‹ › nav buttons
  // instead of the Next → button on the payment step.
  useEffect(() => {
    if (isIBP && currentStepDef?.id === 'institution' && ibpPrepareState === 'idle') {
      prepareIBP();
    }
    if (isInstantPlusDD && currentStepDef?.id === 'institution' && instantPlusDDPrepareState === 'idle') {
      prepareInstantPlusDD();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep]);

  function computeTotal(amounts: string[]): string {
    const total = amounts.reduce((sum, a) => {
      const n = parseFloat(a);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    return total.toFixed(2);
  }

  function reset() {
    setSubscriptionFlow(INITIAL_SUBSCRIPTION_FLOW);
    setOneOffFlow(INITIAL_ONE_OFF_FLOW);
    setInstalmentFlow(INITIAL_INSTALMENT_FLOW);
    setIbpFlow(INITIAL_IBP_FLOW);
    setIbpPrepareState('idle');
    setIbpPrepareError('');
    setIbpBillingRequestId('');
    setInstantPlusDDFlow(INITIAL_INSTANT_PLUS_DD_FLOW);
    setInstantPlusDDPrepareState('idle');
    setInstantPlusDDPrepareError('');
    setInstantPlusDDBillingRequestId('');
    setInstitutions([]);
    setSelectedInstitution('');
    setRunning(false);
    setWizardPhase('filling');
    setWizardStep(0);
  }

  async function runSubscriptionFlow() {
    setRunning(true);
    const schemeApiId = SCHEME_API_ID[filters.scheme];
    const currency = bankDetails?.currency ?? 'EUR';
    try {
      setSubStep('createBillingRequest', { status: 'loading' });
      const br: BillingRequest = await api.createBillingRequest({ scheme: schemeApiId, currency });
      setSubStep('createBillingRequest', { status: 'success', data: br });

      setSubStep('collectCustomerDetails', { status: 'loading' });
      const afterCustomer: BillingRequest = await api.collectCustomerDetails(br.id, {
        given_name: customer.given_name,
        family_name: customer.family_name,
        email: customer.email,
        address_line1: customer.address_line1,
        city: customer.city,
        postal_code: customer.postal_code,
        country_code: customer.country_code,
      });
      setSubStep('collectCustomerDetails', { status: 'success', data: afterCustomer });

      setSubStep('collectBankAccount', { status: 'loading' });
      const afterBank: BillingRequest = await api.collectBankAccount(br.id, {
        account_holder_name: customer.account_holder_name,
        country_code: customer.country_code,
        ...bankValues,
      });
      setSubStep('collectBankAccount', { status: 'success', data: afterBank });

      setSubStep('confirmPayerDetails', { status: 'loading' });
      const afterConfirm: BillingRequest = await api.confirmPayerDetails(br.id);
      setSubStep('confirmPayerDetails', { status: 'success', data: afterConfirm });

      setSubStep('fulfilBillingRequest', { status: 'loading' });
      const fulfilled: BillingRequest = await api.fulfilBillingRequest(br.id);
      setSubStep('fulfilBillingRequest', { status: 'success', data: fulfilled });

      const mandateId = fulfilled.links.mandate_request_mandate;
      if (!mandateId) throw new Error('No mandate ID returned');

      setSubStep('createSubscription', { status: 'loading' });
      const subscription: Subscription = await api.createSubscription({ mandate_id: mandateId });
      setSubStep('createSubscription', { status: 'success', data: subscription });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSubscriptionFlow(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as Array<keyof SubscriptionFlow>) {
          if (updated[key].status === 'loading') {
            (updated[key] as { status: string; error: string }) = { status: 'error', error: message };
            break;
          }
        }
        return updated;
      });
    } finally {
      setRunning(false);
    }
  }

  async function runOneOffFlow() {
    setRunning(true);
    const amountMinorUnits = Math.round(parseFloat(amountInput) * 100);
    const schemeApiId = SCHEME_API_ID[filters.scheme];
    const currency = bankDetails?.currency ?? 'EUR';

    try {
      setOneOffStep('createBillingRequest', { status: 'loading' });
      const br: BillingRequest = await api.createBillingRequest({ scheme: schemeApiId, currency });
      setOneOffStep('createBillingRequest', { status: 'success', data: br });

      setOneOffStep('collectCustomerDetails', { status: 'loading' });
      const afterCustomer: BillingRequest = await api.collectCustomerDetails(br.id, {
        given_name: customer.given_name,
        family_name: customer.family_name,
        email: customer.email,
        address_line1: customer.address_line1,
        city: customer.city,
        postal_code: customer.postal_code,
        country_code: customer.country_code,
      });
      setOneOffStep('collectCustomerDetails', { status: 'success', data: afterCustomer });

      setOneOffStep('collectBankAccount', { status: 'loading' });
      const afterBank: BillingRequest = await api.collectBankAccount(br.id, {
        account_holder_name: customer.account_holder_name,
        country_code: customer.country_code,
        ...bankValues,
      });
      setOneOffStep('collectBankAccount', { status: 'success', data: afterBank });

      setOneOffStep('confirmPayerDetails', { status: 'loading' });
      const afterConfirm: BillingRequest = await api.confirmPayerDetails(br.id);
      setOneOffStep('confirmPayerDetails', { status: 'success', data: afterConfirm });

      setOneOffStep('fulfilBillingRequest', { status: 'loading' });
      const fulfilled: BillingRequest = await api.fulfilBillingRequest(br.id);
      setOneOffStep('fulfilBillingRequest', { status: 'success', data: fulfilled });

      const mandateId = fulfilled.links.mandate_request_mandate;
      if (!mandateId) throw new Error('No mandate ID returned');

      setOneOffStep('createPayment', { status: 'loading' });
      const payment: Payment = await api.createPayment({ mandate_id: mandateId, amount: amountMinorUnits, currency });
      setOneOffStep('createPayment', { status: 'success', data: payment });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setOneOffFlow(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as Array<keyof OneOffDDFlow>) {
          if (updated[key].status === 'loading') {
            (updated[key] as { status: string; error: string }) = { status: 'error', error: message };
            break;
          }
        }
        return updated;
      });
    } finally {
      setRunning(false);
    }
  }

  async function runInstalmentFlow() {
    setRunning(true);
    const schemeApiId = SCHEME_API_ID[filters.scheme];
    const currency = bankDetails?.currency ?? 'EUR';

    try {
      setInstalmentStep('createBillingRequest', { status: 'loading' });
      const br: BillingRequest = await api.createBillingRequest({ scheme: schemeApiId, currency });
      setInstalmentStep('createBillingRequest', { status: 'success', data: br });

      setInstalmentStep('collectCustomerDetails', { status: 'loading' });
      const afterCustomer: BillingRequest = await api.collectCustomerDetails(br.id, {
        given_name: customer.given_name,
        family_name: customer.family_name,
        email: customer.email,
        address_line1: customer.address_line1,
        city: customer.city,
        postal_code: customer.postal_code,
        country_code: customer.country_code,
      });
      setInstalmentStep('collectCustomerDetails', { status: 'success', data: afterCustomer });

      setInstalmentStep('collectBankAccount', { status: 'loading' });
      const afterBank: BillingRequest = await api.collectBankAccount(br.id, {
        account_holder_name: customer.account_holder_name,
        country_code: customer.country_code,
        ...bankValues,
      });
      setInstalmentStep('collectBankAccount', { status: 'success', data: afterBank });

      setInstalmentStep('confirmPayerDetails', { status: 'loading' });
      const afterConfirm: BillingRequest = await api.confirmPayerDetails(br.id);
      setInstalmentStep('confirmPayerDetails', { status: 'success', data: afterConfirm });

      setInstalmentStep('fulfilBillingRequest', { status: 'loading' });
      const fulfilled: BillingRequest = await api.fulfilBillingRequest(br.id);
      setInstalmentStep('fulfilBillingRequest', { status: 'success', data: fulfilled });

      const mandateId = fulfilled.links.mandate_request_mandate;
      if (!mandateId) throw new Error('No mandate ID returned');

      setInstalmentStep('createInstalmentSchedule', { status: 'loading' });

      let instalments: CreateInstalmentScheduleBody['instalments'];
      let totalAmount: number;

      if (instalmentMode === 'dates') {
        const rows = instalmentDates.map(d => ({
          amount: Math.round(parseFloat(d.amount) * 100),
          charge_date: d.charge_date,
        }));
        totalAmount = rows.reduce((sum, d) => sum + d.amount, 0);
        instalments = rows;
      } else {
        const amounts = instalmentAmounts.map(a => Math.round(parseFloat(a) * 100));
        totalAmount = amounts.reduce((sum, a) => sum + a, 0);
        instalments = {
          start_date: instalmentScheduleParams.start_date,
          interval: parseInt(instalmentScheduleParams.interval, 10),
          interval_unit: instalmentScheduleParams.interval_unit,
          amounts,
        };
      }

      const schedule: InstalmentSchedule = await api.createInstalmentSchedule({
        mandate_id: mandateId,
        name: instalmentName,
        currency,
        total_amount: totalAmount,
        instalments,
      });
      setInstalmentStep('createInstalmentSchedule', { status: 'success', data: schedule });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setInstalmentFlow(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as Array<keyof InstalmentFlow>) {
          if (updated[key].status === 'loading') {
            (updated[key] as { status: string; error: string }) = { status: 'error', error: message };
            break;
          }
        }
        return updated;
      });
    } finally {
      setRunning(false);
    }
  }

  async function runIBPFlow() {
    setRunning(true);
    try {
      setIbpStep('selectInstitution', { status: 'loading' });
      const afterSelect: BillingRequest = await api.selectInstitution(ibpBillingRequestId, selectedInstitution, 'GB');
      setIbpStep('selectInstitution', { status: 'success', data: afterSelect });

      setIbpStep('createBankAuthorisation', { status: 'loading' });
      const bankAuth: BankAuthorisation = await api.createBankAuthorisation(ibpBillingRequestId);
      setIbpStep('createBankAuthorisation', { status: 'success', data: bankAuth });

      // Save session config so callback modal knows what happened
      sessionStorage.setItem('gc_hosted_config', JSON.stringify({
        methodId: 'instant-bank-pay',
        billingRequestId: ibpBillingRequestId,
        currency: 'GBP',
        amountInput,
        flow: 'ibp-custom',
      }));

      window.location.href = bankAuth.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setIbpFlow(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as Array<keyof IBPFlow>) {
          if (updated[key].status === 'loading') {
            (updated[key] as { status: string; error: string }) = { status: 'error', error: message };
            break;
          }
        }
        return updated;
      });
    } finally {
      setRunning(false);
    }
  }

  async function runInstantPlusDDFlow() {
    setRunning(true);
    try {
      setInstantPlusDDStep('selectInstitution', { status: 'loading' });
      const afterSelect: BillingRequest = await api.selectInstitution(instantPlusDDBillingRequestId, selectedInstitution, 'GB');
      setInstantPlusDDStep('selectInstitution', { status: 'success', data: afterSelect });

      setInstantPlusDDStep('createBankAuthorisation', { status: 'loading' });
      const bankAuth: BankAuthorisation = await api.createBankAuthorisation(instantPlusDDBillingRequestId);
      setInstantPlusDDStep('createBankAuthorisation', { status: 'success', data: bankAuth });

      // Save session config so callback modal knows what happened
      sessionStorage.setItem('gc_hosted_config', JSON.stringify({
        methodId: 'instant-plus-dd',
        billingRequestId: instantPlusDDBillingRequestId,
        currency: 'GBP',
        amountInput,
        subName,
        subAmount,
        subInterval,
        subIntervalUnit,
        flow: 'instant-plus-dd-custom',
      }));

      window.location.href = bankAuth.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setInstantPlusDDFlow(prev => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as Array<keyof InstantPlusDDFlow>) {
          if (updated[key].status === 'loading') {
            (updated[key] as { status: string; error: string }) = { status: 'error', error: message };
            break;
          }
        }
        return updated;
      });
    } finally {
      setRunning(false);
    }
  }

  async function handleConfirm() {
    setWizardPhase('submitting');
    if (isOneOffDD) await runOneOffFlow();
    else if (isInstalment) await runInstalmentFlow();
    else if (isIBP) await runIBPFlow();
    else if (isInstantPlusDD) await runInstantPlusDDFlow();
    else await runSubscriptionFlow();
  }

  const currency = bankDetails?.currency ?? 'EUR';

  const activeFlow = isOneOffDD ? oneOffFlow : isInstalment ? instalmentFlow : isIBP ? ibpFlow : isInstantPlusDD ? instantPlusDDFlow : subscriptionFlow;
  const activeSteps = isOneOffDD ? ONE_OFF_STEPS : isInstalment ? INSTALMENT_STEPS : isIBP ? IBP_STEPS : isInstantPlusDD ? INSTANT_PLUS_DD_STEPS : SUBSCRIPTION_STEPS;
  const allDone = isOneOffDD
    ? oneOffFlow.createPayment.status === 'success'
    : isInstalment
      ? instalmentFlow.createInstalmentSchedule.status === 'success'
      : isIBP
        ? ibpFlow.createBankAuthorisation.status === 'success'
        : isInstantPlusDD
          ? instantPlusDDFlow.createBankAuthorisation.status === 'success'
          : subscriptionFlow.createSubscription.status === 'success';

  let confirmLabel = 'Confirm & Submit';
  if ((isIBP || isInstantPlusDD) && demoSupported) confirmLabel = 'Proceed to Bank →';
  else if (filters.flowType === 'hosted') confirmLabel = 'Open Hosted Page (demo)';
  else if (filters.flowType === 'js-drop-in') confirmLabel = 'Launch Drop-In (demo)';
  else if (!demoSupported) confirmLabel = `Coming soon for ${filters.scheme}`;
  const confirmDisabled = running || !demoSupported || filters.flowType === 'hosted' || filters.flowType === 'js-drop-in';

  return (
    <div className="modal-backdrop" onClick={() => !running && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{method.name} — {bankDetails?.country ?? filters.scheme}</h2>
          <button className="modal-close" onClick={() => { reset(); onClose(); }} disabled={running}>×</button>
        </div>

        {filters.flowType === 'hosted' && (
          <div className="demo-notice">
            In the hosted flow, GoCardless presents a branded payment page. This demo implements the Custom Payment Pages API only.
          </div>
        )}

        {filters.flowType === 'js-drop-in' && (
          <div className="demo-notice">
            In the JS Drop-In flow, GoCardless's component is embedded directly in your page. This demo implements the Custom Payment Pages API only.
          </div>
        )}

        {!isSubscription && !isOneOffDD && !isInstalment && !isIBP && !isInstantPlusDD && filters.flowType === 'custom' && (
          <div className="demo-notice">
            Demo implementation coming soon for <strong>{method.name}</strong>. Form is pre-filled with test data for reference.
          </div>
        )}

        {isIBP && filters.countryCode !== 'GB' && filters.flowType === 'custom' && (
          <div className="demo-notice">
            Instant Bank Pay is available in <strong>United Kingdom (GBP)</strong> only. Select United Kingdom in the sidebar.
          </div>
        )}

        {isInstantPlusDD && filters.countryCode !== 'GB' && filters.flowType === 'custom' && (
          <div className="demo-notice">
            Instant + Direct Debit is available in <strong>United Kingdom (GBP)</strong> only. Select United Kingdom in the sidebar.
          </div>
        )}


        {/* ── Wizard (filling phase) ── */}
        {wizardPhase === 'filling' && (
          <>
            <div className="wizard-nav">
              <div className="wizard-nav-info">
                <div className="wizard-nav-step">Step {wizardStep + 1} of {totalSteps}</div>
                <div className="wizard-nav-desc">{currentStepDef.description}</div>
              </div>
              <div className="wizard-nav-btns">
                <button
                  type="button"
                  className={`wizard-nav-btn${wizardStep > 0 ? ' wizard-nav-btn--enabled' : ''}`}
                  onClick={() => setWizardStep(s => s - 1)}
                  disabled={wizardStep === 0}
                  aria-label="Previous step"
                >‹</button>
                <button
                  type="button"
                  className={`wizard-nav-btn${!isReviewStep ? ' wizard-nav-btn--enabled' : ''}`}
                  onClick={() => setWizardStep(s => s + 1)}
                  disabled={isReviewStep}
                  aria-label="Next step"
                >›</button>
              </div>
            </div>

            <div className="form">
              {/* Step: Customer Details */}
              {currentStepDef.id === 'customer' && (
                <fieldset>
                  <legend>Customer details</legend>
                  <div className="form-row">
                    <label>
                      First name
                      <input required value={customer.given_name} onChange={e => setCustomer(c => ({ ...c, given_name: e.target.value }))} />
                    </label>
                    <label>
                      Last name
                      <input required value={customer.family_name} onChange={e => setCustomer(c => ({ ...c, family_name: e.target.value }))} />
                    </label>
                  </div>
                  <label>
                    Email
                    <input type="email" required value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} />
                  </label>
                  <label>
                    Account holder name
                    <input required value={customer.account_holder_name} onChange={e => setCustomer(c => ({ ...c, account_holder_name: e.target.value }))} />
                  </label>
                  <label>
                    Address
                    <input required value={customer.address_line1} onChange={e => setCustomer(c => ({ ...c, address_line1: e.target.value }))} />
                  </label>
                  <div className="form-row">
                    <label>
                      City
                      <input required value={customer.city} onChange={e => setCustomer(c => ({ ...c, city: e.target.value }))} />
                    </label>
                    <label>
                      Postal code
                      <input required value={customer.postal_code} onChange={e => setCustomer(c => ({ ...c, postal_code: e.target.value }))} />
                    </label>
                    <label>
                      Country
                      <input required maxLength={2} value={customer.country_code} onChange={e => setCustomer(c => ({ ...c, country_code: e.target.value.toUpperCase() }))} />
                    </label>
                  </div>
                </fieldset>
              )}

              {/* Step: Bank Account */}
              {currentStepDef.id === 'bank' && (
                <fieldset>
                  <legend>Bank account</legend>
                  <BankAccountFields
                    bankDetails={bankDetails}
                    values={bankValues}
                    onChange={(key, val) => setBankValues(prev => ({ ...prev, [key]: val }))}
                    disabled={false}
                  />
                </fieldset>
              )}

              {/* Step: Payment Amount (one-off DD only) */}
              {currentStepDef.id === 'payment' && (
                <fieldset>
                  <legend>Payment</legend>
                  <label>
                    Amount ({currency})
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={amountInput}
                      onChange={e => setAmountInput(e.target.value)}
                    />
                  </label>
                </fieldset>
              )}

              {/* Step: Subscription Config (instant-plus-dd only) */}
              {currentStepDef.id === 'subscription' && (
                <fieldset>
                  <legend>Subscription</legend>
                  <label>
                    Plan name
                    <input required value={subName} onChange={e => setSubName(e.target.value)} />
                  </label>
                  <label>
                    Amount (GBP)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={subAmount}
                      onChange={e => setSubAmount(e.target.value)}
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Interval count
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={subInterval}
                        onChange={e => setSubInterval(e.target.value)}
                      />
                    </label>
                    <label>
                      Interval unit
                      <select
                        value={subIntervalUnit}
                        onChange={e => setSubIntervalUnit(e.target.value as 'weekly' | 'monthly' | 'yearly')}
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </label>
                  </div>
                </fieldset>
              )}

              {/* Step: Institution Selection (IBP and instant-plus-dd) */}
              {currentStepDef.id === 'institution' && (
                <fieldset>
                  <legend>Select your bank</legend>
                  {(isIBP ? ibpPrepareState : instantPlusDDPrepareState) === 'loading' && (
                    <div className="flow-step flow-step--loading">
                      <span className="flow-step-icon">◌</span>
                      Setting up your payment — fetching available banks…
                    </div>
                  )}
                  {(isIBP ? ibpPrepareState : instantPlusDDPrepareState) === 'error' && (
                    <div className="flow-step flow-step--error">
                      <span className="flow-step-icon">✗</span>
                      <span>{isIBP ? ibpPrepareError : instantPlusDDPrepareError}</span>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ marginLeft: 'auto', fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => isIBP ? prepareIBP() : prepareInstantPlusDD()}
                      >Retry</button>
                    </div>
                  )}
                  {(isIBP ? ibpPrepareState : instantPlusDDPrepareState) === 'success' && (
                    <label>
                      Bank
                      <select
                        value={selectedInstitution}
                        onChange={e => setSelectedInstitution(e.target.value)}
                        required
                      >
                        <option value="">Choose a bank…</option>
                        {institutions.map(inst => (
                          <option key={inst.id} value={inst.id}>{inst.name}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </fieldset>
              )}

              {/* Step: Instalment Schedule */}
              {currentStepDef.id === 'instalment' && (
                <fieldset>
                  <legend>Instalment schedule</legend>

                  <label>
                    Schedule name
                    <input required value={instalmentName} onChange={e => setInstalmentName(e.target.value)} />
                  </label>

                  <div className="instalment-mode-label">Schedule type</div>
                  <div className="flow-toggle" style={{ marginBottom: 16 }}>
                    <button
                      type="button"
                      className={`flow-toggle-btn${instalmentMode === 'dates' ? ' flow-toggle-btn--active' : ''}`}
                      onClick={() => setInstalmentMode('dates')}
                    >
                      With Dates
                    </button>
                    <button
                      type="button"
                      className={`flow-toggle-btn${instalmentMode === 'schedule' ? ' flow-toggle-btn--active' : ''}`}
                      onClick={() => setInstalmentMode('schedule')}
                    >
                      With Schedule
                    </button>
                  </div>

                  {instalmentMode === 'dates' && (
                    <>
                      <div className="instalment-section-label">Instalments</div>
                      {instalmentDates.map((row, i) => (
                        <div key={i} className="instalment-row">
                          <label>
                            Amount ({currency})
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                              value={row.amount}
                              onChange={e => setInstalmentDates(prev =>
                                prev.map((r, j) => j === i ? { ...r, amount: e.target.value } : r)
                              )}
                            />
                          </label>
                          <label>
                            Charge date
                            <input
                              type="date"
                              required
                              value={row.charge_date}
                              onChange={e => setInstalmentDates(prev =>
                                prev.map((r, j) => j === i ? { ...r, charge_date: e.target.value } : r)
                              )}
                            />
                          </label>
                          <button
                            type="button"
                            className="instalment-remove-btn"
                            disabled={instalmentDates.length <= 1}
                            onClick={() => setInstalmentDates(prev => prev.filter((_, j) => j !== i))}
                          >
                            −
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="instalment-add-btn"
                        onClick={() => setInstalmentDates(prev => [...prev, { amount: '10.00', charge_date: '' }])}
                      >
                        + Add instalment
                      </button>
                      <div className="instalment-total">
                        Total: {computeTotal(instalmentDates.map(d => d.amount))} {currency}
                      </div>
                    </>
                  )}

                  {instalmentMode === 'schedule' && (
                    <>
                      <div className="form-row">
                        <label>
                          Start date
                          <input
                            type="date"
                            required
                            value={instalmentScheduleParams.start_date}
                            onChange={e => setInstalmentScheduleParams(p => ({ ...p, start_date: e.target.value }))}
                          />
                        </label>
                        <label>
                          Interval
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            value={instalmentScheduleParams.interval}
                            onChange={e => setInstalmentScheduleParams(p => ({ ...p, interval: e.target.value }))}
                          />
                        </label>
                        <label>
                          Frequency
                          <select
                            value={instalmentScheduleParams.interval_unit}
                            onChange={e => setInstalmentScheduleParams(p => ({
                              ...p,
                              interval_unit: e.target.value as 'weekly' | 'monthly' | 'yearly',
                            }))}
                          >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </label>
                      </div>

                      <div className="instalment-section-label">Payment amounts ({currency})</div>
                      {instalmentAmounts.map((amt, i) => (
                        <div key={i} className="instalment-row-single">
                          <label>
                            Amount {i + 1}
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              required
                              value={amt}
                              onChange={e => setInstalmentAmounts(prev =>
                                prev.map((a, j) => j === i ? e.target.value : a)
                              )}
                            />
                          </label>
                          <button
                            type="button"
                            className="instalment-remove-btn"
                            disabled={instalmentAmounts.length <= 1}
                            onClick={() => setInstalmentAmounts(prev => prev.filter((_, j) => j !== i))}
                          >
                            −
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="instalment-add-btn"
                        onClick={() => setInstalmentAmounts(prev => [...prev, '10.00'])}
                      >
                        + Add amount
                      </button>
                      <div className="instalment-total">
                        Total: {computeTotal(instalmentAmounts)} {currency}
                      </div>
                    </>
                  )}
                </fieldset>
              )}

              {/* Step: Review & Confirm */}
              {currentStepDef.id === 'review' && (
                <div className="review-panel">
                  <div className="review-section">
                    <div className="review-section-title">Customer Details</div>
                    <div className="review-grid">
                      <div className="review-kv"><span className="review-label">First name</span><span className="review-value">{customer.given_name}</span></div>
                      <div className="review-kv"><span className="review-label">Last name</span><span className="review-value">{customer.family_name}</span></div>
                      <div className="review-kv"><span className="review-label">Email</span><span className="review-value">{customer.email}</span></div>
                      <div className="review-kv"><span className="review-label">Account holder</span><span className="review-value">{customer.account_holder_name}</span></div>
                      <div className="review-kv"><span className="review-label">Address</span><span className="review-value">{customer.address_line1}</span></div>
                      <div className="review-kv"><span className="review-label">City</span><span className="review-value">{customer.city}</span></div>
                      <div className="review-kv"><span className="review-label">Postal code</span><span className="review-value">{customer.postal_code}</span></div>
                      <div className="review-kv"><span className="review-label">Country</span><span className="review-value">{customer.country_code}</span></div>
                    </div>
                  </div>

                  {!isIBP && !isInstantPlusDD && (
                    <div className="review-section">
                      <div className="review-section-title">Bank Account</div>
                      <div className="review-grid">
                        {bankDetails?.displayMode === 'iban' ? (
                          <div className="review-kv"><span className="review-label">IBAN</span><span className="review-value">{bankValues['iban']}</span></div>
                        ) : (
                          bankDetails?.bankFields.map(f => (
                            <div key={f.key} className="review-kv">
                              <span className="review-label">{f.label}</span>
                              <span className="review-value">{bankValues[f.key]}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {(isOneOffDD || isIBP || isInstantPlusDD) && (
                    <div className="review-section">
                      <div className="review-section-title">{isIBP || isInstantPlusDD ? 'Instant Bank Pay' : 'Payment'}</div>
                      <div className="review-grid">
                        <div className="review-kv"><span className="review-label">Amount</span><span className="review-value">{amountInput} {(isIBP || isInstantPlusDD) ? 'GBP' : currency}</span></div>
                        {(isIBP || isInstantPlusDD) && <div className="review-kv"><span className="review-label">Settlement</span><span className="review-value">Instant</span></div>}
                        {(isIBP || isInstantPlusDD) && selectedInstitution && (
                          <div className="review-kv">
                            <span className="review-label">Bank</span>
                            <span className="review-value">{institutions.find(i => i.id === selectedInstitution)?.name ?? selectedInstitution}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {isInstantPlusDD && (
                    <div className="review-section">
                      <div className="review-section-title">Recurring Subscription</div>
                      <div className="review-grid">
                        <div className="review-kv"><span className="review-label">Plan</span><span className="review-value">{subName}</span></div>
                        <div className="review-kv"><span className="review-label">Amount</span><span className="review-value">{subAmount} GBP</span></div>
                        <div className="review-kv"><span className="review-label">Frequency</span><span className="review-value">Every {subInterval} {subIntervalUnit}</span></div>
                      </div>
                    </div>
                  )}

                  {isInstalment && (
                    <div className="review-section">
                      <div className="review-section-title">Instalment Schedule</div>
                      <div className="review-grid">
                        <div className="review-kv"><span className="review-label">Name</span><span className="review-value">{instalmentName}</span></div>
                        <div className="review-kv"><span className="review-label">Mode</span><span className="review-value">{instalmentMode === 'dates' ? 'With Dates' : 'With Schedule'}</span></div>
                        <div className="review-kv">
                          <span className="review-label">Total</span>
                          <span className="review-value">
                            {instalmentMode === 'dates' ? computeTotal(instalmentDates.map(d => d.amount)) : computeTotal(instalmentAmounts)} {currency}
                          </span>
                        </div>
                        {instalmentMode === 'dates' && (
                          <div className="review-kv"><span className="review-label">Instalments</span><span className="review-value">{instalmentDates.length} payments</span></div>
                        )}
                        {instalmentMode === 'schedule' && (
                          <>
                            <div className="review-kv"><span className="review-label">Start date</span><span className="review-value">{instalmentScheduleParams.start_date}</span></div>
                            <div className="review-kv"><span className="review-label">Frequency</span><span className="review-value">Every {instalmentScheduleParams.interval} {instalmentScheduleParams.interval_unit}</span></div>
                            <div className="review-kv"><span className="review-label">Payments</span><span className="review-value">{instalmentAmounts.length}</span></div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {isSubscription && (
                    <div className="review-section">
                      <div className="review-section-title">Subscription</div>
                      <div className="review-grid">
                        <div className="review-kv"><span className="review-label">Amount</span><span className="review-value">10.00 {currency}</span></div>
                        <div className="review-kv"><span className="review-label">Frequency</span><span className="review-value">Monthly</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Footer navigation */}
              <div className="form-footer">
                {wizardStep > 0 ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setWizardStep(s => s - 1)}
                  >
                    ← Back
                  </button>
                ) : <span />}

                {isReviewStep ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={confirmDisabled}
                    onClick={handleConfirm}
                  >
                    {confirmLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      (isIBP && currentStepDef.id === 'institution' && (!selectedInstitution || ibpPrepareState !== 'success')) ||
                      (isIBP && currentStepDef.id === 'institution' && ibpPrepareState === 'loading') ||
                      (isInstantPlusDD && currentStepDef.id === 'institution' && (!selectedInstitution || instantPlusDDPrepareState !== 'success')) ||
                      (isInstantPlusDD && currentStepDef.id === 'institution' && instantPlusDDPrepareState === 'loading')
                    }
                    onClick={() => setWizardStep(s => s + 1)}
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Submitting phase: API flow tracker ── */}
        {wizardPhase === 'submitting' && (
          <>
            <div className="flow-steps">
              {activeSteps.map(({ key, label }) => {
                const step = (activeFlow as unknown as Record<string, { status: string; data?: { id?: string }; error?: string }>)[key];
                return (
                  <div key={key} className={`flow-step flow-step--${step.status}`}>
                    <span className="flow-step-icon">{STATUS_ICON[step.status]}</span>
                    <span className="flow-step-label">{label}</span>
                    {step.status === 'error' && <span className="flow-step-error">{step.error}</span>}
                    {step.status === 'success' && step.data && (
                      <span className="flow-step-id">{'id' in step.data ? (step.data as { id: string }).id : ''}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {allDone ? (
              <div className="success-banner">
                {isOneOffDD
                  ? 'Payment created successfully!'
                  : isInstalment
                    ? 'Instalment schedule created!'
                    : isIBP
                      ? 'Redirecting to your bank…'
                      : isInstantPlusDD
                        ? 'Redirecting to your bank…'
                        : 'Subscription created successfully!'}
                <button className="btn-secondary" onClick={reset}>Start over</button>
              </div>
            ) : running ? (
              <div className="form-footer">
                <span className="form-note">Processing API calls…</span>
              </div>
            ) : (
              <div className="form-footer">
                <span className="form-note" style={{ color: '#ef4444' }}>An error occurred — check the steps above.</span>
                <button className="btn-secondary" onClick={reset}>Start over</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
