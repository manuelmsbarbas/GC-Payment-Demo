import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useFilters } from '../context/FilterContext';
import { PAYMENT_METHODS } from '../data/paymentMethods';
import type { PaymentMethodId } from '../data/paymentMethods';
import type { SubscriptionFlow, BillingRequest, Subscription } from '../types/api';
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

const INITIAL_FLOW: SubscriptionFlow = {
  createBillingRequest: { status: 'idle' },
  collectCustomerDetails: { status: 'idle' },
  collectBankAccount: { status: 'idle' },
  confirmPayerDetails: { status: 'idle' },
  fulfilBillingRequest: { status: 'idle' },
  createSubscription: { status: 'idle' },
};

const STEPS: Array<{ key: keyof SubscriptionFlow; label: string }> = [
  { key: 'createBillingRequest', label: 'Create Billing Request' },
  { key: 'collectCustomerDetails', label: 'Collect Customer Details' },
  { key: 'collectBankAccount', label: 'Collect Bank Account' },
  { key: 'confirmPayerDetails', label: 'Confirm Payer Details' },
  { key: 'fulfilBillingRequest', label: 'Fulfil Billing Request' },
  { key: 'createSubscription', label: 'Create Subscription' },
];

const STATUS_ICON: Record<string, string> = {
  idle: '○',
  loading: '◌',
  success: '✓',
  error: '✗',
};

export function FlowModal({ methodId, onClose }: FlowModalProps) {
  const { filters, bankDetails } = useFilters();
  const method = PAYMENT_METHODS.find(m => m.id === methodId)!;

  const demoSupported = methodId === 'subscription' && filters.scheme === 'SEPA' && bankDetails?.iban != null;

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

  const [flow, setFlow] = useState<SubscriptionFlow>(INITIAL_FLOW);
  const [running, setRunning] = useState(false);

  function setStep<K extends keyof SubscriptionFlow>(key: K, update: Partial<SubscriptionFlow[K]>) {
    setFlow(prev => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function reset() {
    setFlow(INITIAL_FLOW);
    setRunning(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!demoSupported) return;
    setRunning(true);

    try {
      setStep('createBillingRequest', { status: 'loading' });
      const br: BillingRequest = await api.createBillingRequest();
      setStep('createBillingRequest', { status: 'success', data: br });

      setStep('collectCustomerDetails', { status: 'loading' });
      const afterCustomer: BillingRequest = await api.collectCustomerDetails(br.id, {
        given_name: customer.given_name,
        family_name: customer.family_name,
        email: customer.email,
        address_line1: customer.address_line1,
        city: customer.city,
        postal_code: customer.postal_code,
        country_code: customer.country_code,
      });
      setStep('collectCustomerDetails', { status: 'success', data: afterCustomer });

      setStep('collectBankAccount', { status: 'loading' });
      const afterBank: BillingRequest = await api.collectBankAccount(br.id, {
        account_holder_name: customer.account_holder_name,
        iban: bankValues['iban'] ?? '',
        country_code: customer.country_code,
      });
      setStep('collectBankAccount', { status: 'success', data: afterBank });

      setStep('confirmPayerDetails', { status: 'loading' });
      const afterConfirm: BillingRequest = await api.confirmPayerDetails(br.id);
      setStep('confirmPayerDetails', { status: 'success', data: afterConfirm });

      setStep('fulfilBillingRequest', { status: 'loading' });
      const fulfilled: BillingRequest = await api.fulfilBillingRequest(br.id);
      setStep('fulfilBillingRequest', { status: 'success', data: fulfilled });

      const mandateId = fulfilled.links.mandate_request_mandate;
      if (!mandateId) throw new Error('No mandate ID returned');

      setStep('createSubscription', { status: 'loading' });
      const subscription: Subscription = await api.createSubscription({ mandate_id: mandateId });
      setStep('createSubscription', { status: 'success', data: subscription });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setFlow(prev => {
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

  const allDone = flow.createSubscription.status === 'success';
  const currency = bankDetails?.currency ?? 'EUR';

  let submitLabel = 'Submit';
  if (filters.flowType === 'hosted') submitLabel = 'Open Hosted Page (demo)';
  else if (!demoSupported) submitLabel = `Coming soon for ${filters.scheme}`;

  const submitDisabled = running || !demoSupported || filters.flowType === 'hosted';

  return (
    <div className="modal-backdrop" onClick={() => !running && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{method.name} — {bankDetails?.country ?? filters.scheme}</h2>
          <button className="modal-close" onClick={() => { reset(); onClose(); }} disabled={running}>×</button>
        </div>

        {filters.flowType === 'hosted' && (
          <div className="demo-notice">
            In a hosted flow, GoCardless presents a branded payment page. This demo implements the Custom Payment Pages API only.
          </div>
        )}

        {methodId !== 'subscription' && filters.flowType !== 'hosted' && (
          <div className="demo-notice">
            Demo implementation coming soon for <strong>{method.name}</strong>. Form is pre-filled with test data for reference.
          </div>
        )}

        {filters.scheme !== 'SEPA' && methodId === 'subscription' && filters.flowType !== 'hosted' && (
          <div className="demo-notice">
            This demo currently supports SEPA subscriptions only. Form is pre-filled with <strong>{bankDetails?.country}</strong> test data for reference.
          </div>
        )}

        <div className="flow-steps">
          {STEPS.map(({ key, label }) => {
            const step = flow[key];
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
            Subscription created successfully!
            <button className="btn-secondary" onClick={reset}>Start over</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <fieldset disabled={running}>
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

            <fieldset disabled={running}>
              <legend>Bank account</legend>
              <BankAccountFields
                bankDetails={bankDetails}
                values={bankValues}
                onChange={(key, val) => setBankValues(prev => ({ ...prev, [key]: val }))}
                disabled={running}
              />
            </fieldset>

            <div className="form-footer">
              <span className="form-note">Fixed: 10.00 {currency} · Monthly · {filters.scheme}</span>
              <button type="submit" className="btn-primary" disabled={submitDisabled}>
                {running ? 'Processing…' : submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
