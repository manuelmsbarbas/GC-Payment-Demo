import { useState, useRef } from 'react';
import { api } from '../api/client';
import { useFilters } from '../context/FilterContext';
import type { PaymentMethodId } from '../data/paymentMethods';
import type {
  Subscription,
  Payment,
  InstalmentSchedule,
  CreateInstalmentScheduleBody,
} from '../types/api';

// GoCardless Drop-In v2: create() returns { open, exit } — call .open() to show the overlay.
declare global {
  interface Window {
    GoCardlessDropin?: {
      create: (options: {
        billingRequestFlowID: string;
        environment: string;
        onSuccess: (
          billingRequest: { id: string; links: { mandate_request_mandate?: string } },
          billingRequestFlow: unknown
        ) => void;
        onExit: (error: unknown, metadata: unknown) => void;
      }) => { open: () => void; exit: () => void };
    };
  }
}

interface DropInModalProps {
  methodId: PaymentMethodId;
  onClose: () => void;
}

type Phase = 'config' | 'launching' | 'dropping' | 'completing' | 'done' | 'error';

interface InstalmentDateRow {
  amount: string;
  charge_date: string;
}

interface InstalmentScheduleParams {
  start_date: string;
  interval: string;
  interval_unit: 'weekly' | 'monthly' | 'yearly';
}

const METHOD_LABELS: Record<string, string> = {
  subscription: 'Subscription',
  'one-off-dd': 'One-off Direct Debit',
  instalment: 'Instalments',
};

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

function loadDropInScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.GoCardlessDropin) {
      resolve();
      return;
    }
    const existing = document.getElementById('gc-dropin-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.id = 'gc-dropin-script';
    script.src = 'https://pay.gocardless.com/billing/static/dropin/v2/initialise.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load GoCardless Drop-In script'));
    document.head.appendChild(script);
  });
}

function computeTotal(amounts: string[]): string {
  const total = amounts.reduce((sum, a) => {
    const n = parseFloat(a);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  return total.toFixed(2);
}

export function DropInModal({ methodId, onClose }: DropInModalProps) {
  const { bankDetails, filters } = useFilters();
  const [phase, setPhase] = useState<Phase>('config');
  const [configStep, setConfigStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<Subscription | Payment | InstalmentSchedule | null>(null);
  const hasLaunched = useRef(false);

  const currency = bankDetails?.currency ?? 'EUR';
  const label = METHOD_LABELS[methodId] ?? methodId;
  const isSepa = filters.scheme === 'SEPA';

  const isSubscription = methodId === 'subscription';
  const isOneOffDD = methodId === 'one-off-dd';
  const isInstalment = methodId === 'instalment';

  // ── One-off DD state ──────────────────────────────────────────────────────
  const [amountInput, setAmountInput] = useState('25.00');

  // ── Subscription state ────────────────────────────────────────────────────
  const [subName, setSubName] = useState('Monthly Subscription');
  const [subAmount, setSubAmount] = useState('10.00');
  const [subInterval, setSubInterval] = useState('1');
  const [subIntervalUnit, setSubIntervalUnit] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');

  // ── Instalment state ──────────────────────────────────────────────────────
  const [instalmentMode, setInstalmentMode] = useState<'dates' | 'schedule'>('dates');
  const [instalmentName, setInstalmentName] = useState('Payment Plan 001');
  const [instalmentDates, setInstalmentDates] = useState<InstalmentDateRow[]>(defaultDates);
  const [instalmentScheduleParams, setInstalmentScheduleParams] = useState<InstalmentScheduleParams>({
    start_date: defaultScheduleStartDate(),
    interval: '1',
    interval_unit: 'monthly',
  });
  const [instalmentAmounts, setInstalmentAmounts] = useState<string[]>(['10.00', '10.00', '10.00']);

  // ── Wizard config steps ───────────────────────────────────────────────────
  const configSteps = [
    {
      id: 'config',
      title: isSubscription
        ? 'Subscription Details'
        : isOneOffDD
        ? 'Payment Amount'
        : 'Instalment Schedule',
      description: isSubscription
        ? 'Set the recurring amount and frequency'
        : isOneOffDD
        ? 'Set the amount for this payment'
        : 'Configure your instalment schedule',
    },
    {
      id: 'review',
      title: 'Review & Confirm',
      description: 'Confirm details before launching the Drop-In',
    },
  ];

  const totalConfigSteps = configSteps.length;
  const currentConfigStep = configSteps[configStep];
  const isReviewStep = currentConfigStep.id === 'review';

  async function handleConfirmLaunch() {
    if (hasLaunched.current) return;
    hasLaunched.current = true;
    setPhase('launching');
    await launch();
  }

  async function launch() {
    try {
      const response = await api.dropInStart();
      const { billing_request_flow_id } = response;

      await loadDropInScript();
      setPhase('dropping');

      const dropin = window.GoCardlessDropin!.create({
        billingRequestFlowID: billing_request_flow_id,
        environment: 'sandbox',
        onSuccess: handleDropInSuccess,
        onExit: handleDropInExit,
      });
      dropin.open();
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start Drop-In');
    }
  }

  async function handleDropInSuccess(
    billingRequest: { id: string; links: { mandate_request_mandate?: string } }
  ) {
    const mandateId = billingRequest.links.mandate_request_mandate;
    if (!mandateId) {
      setPhase('error');
      setErrorMsg('Drop-In completed but no mandate ID was returned.');
      return;
    }

    setPhase('completing');
    try {
      if (isSubscription) {
        const sub = await api.createSubscription({
          mandate_id: mandateId,
          amount: Math.round(parseFloat(subAmount) * 100),
          currency,
          name: subName,
          interval: parseInt(subInterval, 10),
          interval_unit: subIntervalUnit,
        });
        setResult(sub);
      } else if (isOneOffDD) {
        const payment = await api.createPayment({
          mandate_id: mandateId,
          amount: Math.round(parseFloat(amountInput) * 100),
          currency,
        });
        setResult(payment);
      } else if (isInstalment) {
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

        const schedule = await api.createInstalmentSchedule({
          mandate_id: mandateId,
          name: instalmentName,
          currency,
          total_amount: totalAmount,
          instalments,
        });
        setResult(schedule);
      }
      setPhase('done');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to complete payment setup');
    }
  }

  function handleDropInExit(error: unknown, metadata: unknown) {
    console.log('[DropIn] onExit — error:', error, 'metadata:', metadata);
    onClose();
  }

  // While the Drop-In overlay is active, don't render any competing UI
  if (phase === 'dropping') return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{label} — JS Drop-In</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={phase === 'launching' || phase === 'completing'}
          >×</button>
        </div>

        {/* ── Config phase: wizard ── */}
        {phase === 'config' && (
          <>
            {!isSepa && (
              <div className="demo-notice">
                JS Drop-In demo currently supports SEPA only. Select a SEPA country in the sidebar.
              </div>
            )}

            <div className="wizard-nav">
              <div className="wizard-nav-info">
                <div className="wizard-nav-step">Step {configStep + 1} of {totalConfigSteps}</div>
                <div className="wizard-nav-desc">{currentConfigStep.description}</div>
              </div>
              <div className="wizard-nav-btns">
                <button
                  type="button"
                  className={`wizard-nav-btn${configStep > 0 ? ' wizard-nav-btn--enabled' : ''}`}
                  onClick={() => setConfigStep(s => s - 1)}
                  disabled={configStep === 0}
                  aria-label="Previous step"
                >‹</button>
                <button
                  type="button"
                  className={`wizard-nav-btn${!isReviewStep ? ' wizard-nav-btn--enabled' : ''}`}
                  onClick={() => setConfigStep(s => s + 1)}
                  disabled={isReviewStep}
                  aria-label="Next step"
                >›</button>
              </div>
            </div>

            <div className="form">

              {/* ── Step 1: payment-type config ── */}
              {currentConfigStep.id === 'config' && (
                <>
                  {isOneOffDD && (
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

                  {isSubscription && (
                    <fieldset>
                      <legend>Subscription</legend>
                      <label>
                        Plan name
                        <input required value={subName} onChange={e => setSubName(e.target.value)} />
                      </label>
                      <label>
                        Amount ({currency})
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
                          <span className="label-with-info">
                            Interval count
                            <span
                              className="info-tooltip"
                              data-tip="How many units between each charge. E.g. interval=2 with Monthly means the customer is charged every 2 months."
                            >ℹ</span>
                          </span>
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
                          <span className="label-with-info">
                            Interval unit
                            <span
                              className="info-tooltip"
                              data-tip="The time unit for each billing cycle. Combined with interval count — e.g. count=2, unit=Weekly means a charge every 2 weeks."
                            >ℹ</span>
                          </span>
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

                  {isInstalment && (
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
                              >−</button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="instalment-add-btn"
                            onClick={() => setInstalmentDates(prev => [
                              ...prev,
                              { amount: '10.00', charge_date: '' },
                            ])}
                          >+ Add instalment</button>
                          <div className="instalment-total">
                            Total: {computeTotal(instalmentDates.map(d => d.amount))} {currency}
                          </div>
                        </>
                      )}

                      {instalmentMode === 'schedule' && (
                        <>
                          <div className="form-row">
                            <label>
                              <span className="label-with-info">
                                Start date
                                <span
                                  className="info-tooltip"
                                  data-tip="The date the first payment will be collected."
                                >ℹ</span>
                              </span>
                              <input
                                type="date"
                                required
                                value={instalmentScheduleParams.start_date}
                                onChange={e => setInstalmentScheduleParams(p => ({ ...p, start_date: e.target.value }))}
                              />
                            </label>
                            <label>
                              <span className="label-with-info">
                                Interval
                                <span
                                  className="info-tooltip"
                                  data-tip="How many units between each payment. E.g. interval=2, unit=Monthly charges every 2 months."
                                >ℹ</span>
                              </span>
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
                              <span className="label-with-info">
                                Frequency
                                <span
                                  className="info-tooltip"
                                  data-tip="The time unit for the interval between payments — weekly, monthly, or yearly."
                                >ℹ</span>
                              </span>
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

                          <div className="instalment-section-label">
                            <span className="label-with-info">
                              Payment amounts ({currency})
                              <span
                                className="info-tooltip"
                                data-tip="Each entry is one instalment amount. The number of entries sets the total number of payments in the schedule."
                              >ℹ</span>
                            </span>
                          </div>
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
                              >−</button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="instalment-add-btn"
                            onClick={() => setInstalmentAmounts(prev => [...prev, '10.00'])}
                          >+ Add amount</button>
                          <div className="instalment-total">
                            Total: {computeTotal(instalmentAmounts)} {currency}
                          </div>
                        </>
                      )}
                    </fieldset>
                  )}
                </>
              )}

              {/* ── Step 2: Review ── */}
              {currentConfigStep.id === 'review' && (
                <div className="review-panel">
                  <div className="review-section">
                    <div className="review-section-title">What happens next</div>
                    <div className="review-grid">
                      <div className="review-kv">
                        <span className="review-label">Step 1</span>
                        <span className="review-value">
                          GoCardless Drop-In collects bank details and sets up a mandate
                        </span>
                      </div>
                      <div className="review-kv">
                        <span className="review-label">Step 2</span>
                        <span className="review-value">
                          {isSubscription && `A ${subAmount} ${currency} subscription is created (every ${subInterval} ${subIntervalUnit})`}
                          {isOneOffDD && `A ${amountInput} ${currency} one-off payment is charged against the mandate`}
                          {isInstalment && `Instalment schedule "${instalmentName}" is created against the mandate`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isSubscription && (
                    <div className="review-section">
                      <div className="review-section-title">Subscription</div>
                      <div className="review-grid">
                        <div className="review-kv">
                          <span className="review-label">Plan</span>
                          <span className="review-value">{subName}</span>
                        </div>
                        <div className="review-kv">
                          <span className="review-label">Amount</span>
                          <span className="review-value">{subAmount} {currency}</span>
                        </div>
                        <div className="review-kv">
                          <span className="review-label">Frequency</span>
                          <span className="review-value">Every {subInterval} {subIntervalUnit}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isOneOffDD && (
                    <div className="review-section">
                      <div className="review-section-title">Payment</div>
                      <div className="review-grid">
                        <div className="review-kv">
                          <span className="review-label">Amount</span>
                          <span className="review-value">{amountInput} {currency}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isInstalment && (
                    <div className="review-section">
                      <div className="review-section-title">Instalment Schedule</div>
                      <div className="review-grid">
                        <div className="review-kv">
                          <span className="review-label">Name</span>
                          <span className="review-value">{instalmentName}</span>
                        </div>
                        <div className="review-kv">
                          <span className="review-label">Mode</span>
                          <span className="review-value">{instalmentMode === 'dates' ? 'With Dates' : 'With Schedule'}</span>
                        </div>
                        {instalmentMode === 'dates' && (
                          <>
                            <div className="review-kv">
                              <span className="review-label">Payments</span>
                              <span className="review-value">{instalmentDates.length}</span>
                            </div>
                            <div className="review-kv">
                              <span className="review-label">Total</span>
                              <span className="review-value">
                                {computeTotal(instalmentDates.map(d => d.amount))} {currency}
                              </span>
                            </div>
                          </>
                        )}
                        {instalmentMode === 'schedule' && (
                          <>
                            <div className="review-kv">
                              <span className="review-label">Start date</span>
                              <span className="review-value">{instalmentScheduleParams.start_date}</span>
                            </div>
                            <div className="review-kv">
                              <span className="review-label">Frequency</span>
                              <span className="review-value">
                                Every {instalmentScheduleParams.interval} {instalmentScheduleParams.interval_unit}
                              </span>
                            </div>
                            <div className="review-kv">
                              <span className="review-label">Payments</span>
                              <span className="review-value">{instalmentAmounts.length}</span>
                            </div>
                            <div className="review-kv">
                              <span className="review-label">Total</span>
                              <span className="review-value">{computeTotal(instalmentAmounts)} {currency}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Footer navigation ── */}
              <div className="form-footer">
                {configStep > 0 ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setConfigStep(s => s - 1)}
                  >← Back</button>
                ) : <span />}

                {isReviewStep ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!isSepa}
                    onClick={handleConfirmLaunch}
                  >
                    Confirm & Launch Drop-In
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setConfigStep(s => s + 1)}
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Launching phase ── */}
        {phase === 'launching' && (
          <div className="flow-steps">
            <div className="flow-step flow-step--loading">
              <span className="step-icon">◌</span>
              Setting up secure connection with GoCardless…
            </div>
          </div>
        )}

        {/* ── Completing phase ── */}
        {phase === 'completing' && (
          <div className="flow-steps">
            <div className="flow-step flow-step--success">
              <span className="step-icon">✓</span>
              Mandate set up via Drop-In
            </div>
            <div className="flow-step flow-step--loading">
              <span className="step-icon">◌</span>
              {isSubscription && 'Creating subscription…'}
              {isOneOffDD && 'Creating payment…'}
              {isInstalment && 'Creating instalment schedule…'}
            </div>
          </div>
        )}

        {/* ── Done phase ── */}
        {phase === 'done' && result && (
          <div className="flow-steps">
            <div className="flow-step flow-step--success">
              <span className="step-icon">✓</span>
              Mandate set up via Drop-In
            </div>
            <div className="flow-step flow-step--success">
              <span className="step-icon">✓</span>
              {isSubscription && `Subscription created — ${(result as Subscription).id}`}
              {isOneOffDD && `Payment created — ${(result as Payment).id}`}
              {isInstalment && `Instalment schedule created — ${(result as InstalmentSchedule).id}`}
            </div>
            <div className="success-banner">
              All done! Check the webhook feed for live events.
            </div>
            <div style={{ padding: '0 16px 16px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        )}

        {/* ── Error phase ── */}
        {phase === 'error' && (
          <div className="flow-steps">
            <div className="flow-step flow-step--error">
              <span className="step-icon">✗</span>
              {errorMsg}
            </div>
            <div style={{ padding: '0 16px 16px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
