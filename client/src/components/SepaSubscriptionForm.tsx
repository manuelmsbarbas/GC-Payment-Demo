import { useState } from 'react';
import { api } from '../api/client';
import type { SubscriptionFlow, BillingRequest, Subscription } from '../types/api';

interface FormValues {
  given_name: string;
  family_name: string;
  email: string;
  address_line1: string;
  city: string;
  postal_code: string;
  country_code: string;
  account_holder_name: string;
  iban: string;
}

const INITIAL_FORM: FormValues = {
  given_name: 'Manuel',
  family_name: 'Barbas',
  email: 'manelbarbas1234@gmail.com',
  address_line1: 'Alameda Quinta',
  city: 'Lisbon',
  postal_code: '1550',
  country_code: 'FR',
  account_holder_name: 'Manuel Barbas',
  iban: 'FR14200410100050500013M02606',
};

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

export function SepaSubscriptionForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(INITIAL_FORM);
  const [flow, setFlow] = useState<SubscriptionFlow>(INITIAL_FLOW);
  const [running, setRunning] = useState(false);

  function setStep<K extends keyof SubscriptionFlow>(
    key: K,
    update: Partial<SubscriptionFlow[K]>
  ) {
    setFlow((prev) => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function reset() {
    setForm(INITIAL_FORM);
    setFlow(INITIAL_FLOW);
    setRunning(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);

    try {
      // Step 1 — Create billing request
      setStep('createBillingRequest', { status: 'loading' });
      const billingRequest: BillingRequest = await api.createBillingRequest();
      setStep('createBillingRequest', { status: 'success', data: billingRequest });

      // Step 2 — Collect customer details
      setStep('collectCustomerDetails', { status: 'loading' });
      const afterCustomer: BillingRequest = await api.collectCustomerDetails(billingRequest.id, {
        given_name: form.given_name,
        family_name: form.family_name,
        email: form.email,
        address_line1: form.address_line1,
        city: form.city,
        postal_code: form.postal_code,
        country_code: form.country_code,
      });
      setStep('collectCustomerDetails', { status: 'success', data: afterCustomer });

      // Step 3 — Collect bank account
      setStep('collectBankAccount', { status: 'loading' });
      const afterBank: BillingRequest = await api.collectBankAccount(billingRequest.id, {
        account_holder_name: form.account_holder_name,
        iban: form.iban,
        country_code: form.country_code,
      });
      setStep('collectBankAccount', { status: 'success', data: afterBank });

      // Step 4 — Confirm payer details
      setStep('confirmPayerDetails', { status: 'loading' });
      const afterConfirm: BillingRequest = await api.confirmPayerDetails(billingRequest.id);
      setStep('confirmPayerDetails', { status: 'success', data: afterConfirm });

      // Step 5 — Fulfil billing request → get mandate ID
      setStep('fulfilBillingRequest', { status: 'loading' });
      const fulfilled: BillingRequest = await api.fulfilBillingRequest(billingRequest.id);
      setStep('fulfilBillingRequest', { status: 'success', data: fulfilled });

      const mandateId = fulfilled.links.mandate_request_mandate;
      if (!mandateId) throw new Error('No mandate ID returned from fulfilled billing request');

      // Step 6 — Create subscription
      setStep('createSubscription', { status: 'loading' });
      const subscription: Subscription = await api.createSubscription({ mandate_id: mandateId });
      setStep('createSubscription', { status: 'success', data: subscription });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setFlow((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated) as Array<keyof SubscriptionFlow>) {
          if (updated[key].status === 'loading') {
            (updated[key] as { status: string; error: string }) = {
              status: 'error',
              error: message,
            };
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

  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        Create SEPA Subscription
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => !running && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>SEPA Direct Debit — 10 EUR / month</h2>
              <button
                className="modal-close"
                onClick={() => { reset(); setOpen(false); }}
                disabled={running}
              >
                ×
              </button>
            </div>

            {/* Progress steps */}
            <div className="flow-steps">
              {STEPS.map(({ key, label }) => {
                const step = flow[key];
                return (
                  <div key={key} className={`flow-step flow-step--${step.status}`}>
                    <span className="flow-step-icon">{STATUS_ICON[step.status]}</span>
                    <span className="flow-step-label">{label}</span>
                    {step.status === 'error' && (
                      <span className="flow-step-error">{step.error}</span>
                    )}
                    {step.status === 'success' && step.data && (
                      <span className="flow-step-id">
                        {'id' in step.data ? (step.data as { id: string }).id : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {allDone ? (
              <div className="success-banner">
                Subscription created successfully!
                <button className="btn-secondary" onClick={reset}>
                  Start over
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="form">
                <fieldset disabled={running}>
                  <legend>Customer details</legend>
                  <div className="form-row">
                    <label>
                      First name
                      <input
                        required
                        value={form.given_name}
                        onChange={(e) => setForm((f) => ({ ...f, given_name: e.target.value }))}
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        required
                        value={form.family_name}
                        onChange={(e) => setForm((f) => ({ ...f, family_name: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    Email
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                  </label>
                  <label>
                    Address line 1
                    <input
                      required
                      value={form.address_line1}
                      onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      City
                      <input
                        required
                        value={form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      />
                    </label>
                    <label>
                      Postal code
                      <input
                        required
                        value={form.postal_code}
                        onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                      />
                    </label>
                    <label>
                      Country
                      <input
                        required
                        maxLength={2}
                        value={form.country_code}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, country_code: e.target.value.toUpperCase() }))
                        }
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset disabled={running}>
                  <legend>Bank account</legend>
                  <label>
                    Account holder name
                    <input
                      required
                      value={form.account_holder_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, account_holder_name: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    IBAN
                    <input
                      required
                      placeholder="DE89370400440532013000"
                      value={form.iban}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, iban: e.target.value.replace(/\s/g, '') }))
                      }
                    />
                  </label>
                </fieldset>

                <div className="form-footer">
                  <span className="form-note">Fixed: 10.00 EUR · Monthly · SEPA Core</span>
                  <button type="submit" className="btn-primary" disabled={running}>
                    {running ? 'Processing…' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
