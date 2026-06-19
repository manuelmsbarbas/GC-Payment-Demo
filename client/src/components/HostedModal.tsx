import { useState, useRef } from 'react';
import { api } from '../api/client';
import { useFilters } from '../context/FilterContext';
import type { PaymentMethodId } from '../data/paymentMethods';
import type { HostedSessionConfig } from '../types/api';

const HOSTED_SESSION_KEY = 'gc_hosted_config';

interface HostedModalProps {
  methodId: PaymentMethodId;
  onClose: () => void;
}

type Phase = 'config' | 'launching' | 'error';

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
  'instant-bank-pay': 'Instant Bank Pay',
  'instant-plus-dd': 'Instant + Direct Debit',
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

function computeTotal(amounts: string[]): string {
  const total = amounts.reduce((sum, a) => {
    const n = parseFloat(a);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
  return total.toFixed(2);
}

export function HostedModal({ methodId, onClose }: HostedModalProps) {
  const { bankDetails, filters } = useFilters();
  const [phase, setPhase] = useState<Phase>('config');
  const [configStep, setConfigStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const hasLaunched = useRef(false);

  const currency = bankDetails?.currency ?? 'EUR';
  const label = METHOD_LABELS[methodId] ?? methodId;
  const isSepa = filters.scheme === 'SEPA';

  const isSubscription = methodId === 'subscription';
  const isOneOffDD = methodId === 'one-off-dd';
  const isInstalment = methodId === 'instalment';
  const isIBP = methodId === 'instant-bank-pay';
  const isInstantPlusDD = methodId === 'instant-plus-dd';

  const canLaunch = (isIBP || isInstantPlusDD) ? filters.countryCode === 'GB' : isSepa;

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
        : isIBP || isOneOffDD
        ? 'Payment Amount'
        : isInstantPlusDD
        ? 'Payment & Subscription Details'
        : 'Instalment Schedule',
      description: isSubscription
        ? 'Set the recurring amount and frequency'
        : isIBP
        ? 'Set the amount for this instant payment'
        : isOneOffDD
        ? 'Set the amount for this payment'
        : isInstantPlusDD
        ? 'Set the upfront payment amount and subscription config'
        : 'Configure your instalment schedule',
    },
    {
      id: 'review',
      title: 'Review & Confirm',
      description: (isIBP || isInstantPlusDD) ? 'Confirm before proceeding to your bank' : 'Confirm details before opening the hosted page',
    },
  ];

  const totalConfigSteps = configSteps.length;
  const currentConfigStep = configSteps[configStep];
  const isReviewStep = currentConfigStep.id === 'review';

  async function handleConfirmLaunch() {
    if (hasLaunched.current) return;
    hasLaunched.current = true;
    setPhase('launching');

    try {
      let authorisation_url: string;
      let billing_request_id: string;

      if (isIBP) {
        const amountMinorUnits = Math.round(parseFloat(amountInput) * 100);
        const result = await api.hostedIbpStart(amountMinorUnits, 'GBP');
        authorisation_url = result.authorisation_url;
        billing_request_id = result.billing_request_id;

        const config: HostedSessionConfig = {
          methodId,
          billingRequestId: billing_request_id,
          currency: 'GBP',
          amountInput,
        };
        sessionStorage.setItem(HOSTED_SESSION_KEY, JSON.stringify(config));
      } else if (isInstantPlusDD) {
        const amountMinorUnits = Math.round(parseFloat(amountInput) * 100);
        const result = await api.hostedInstantPlusDDStart(amountMinorUnits, 'GBP');
        authorisation_url = result.authorisation_url;
        billing_request_id = result.billing_request_id;

        const config: HostedSessionConfig = {
          methodId,
          billingRequestId: billing_request_id,
          currency: 'GBP',
          amountInput,
          subName,
          subAmount,
          subInterval,
          subIntervalUnit,
        };
        sessionStorage.setItem(HOSTED_SESSION_KEY, JSON.stringify(config));
      } else {
        const result = await api.hostedStart();
        authorisation_url = result.authorisation_url;
        billing_request_id = result.billing_request_id;

        // Persist payment config to sessionStorage so HostedCallbackModal can read it on return
        const config: HostedSessionConfig = {
          methodId,
          billingRequestId: billing_request_id,
          currency,
          ...(isSubscription && { subName, subAmount, subInterval, subIntervalUnit }),
          ...(isOneOffDD && { amountInput }),
          ...(isInstalment && {
            instalmentMode,
            instalmentName,
            instalmentDates,
            instalmentScheduleParams,
            instalmentAmounts,
          }),
        };
        sessionStorage.setItem(HOSTED_SESSION_KEY, JSON.stringify(config));
      }

      // Navigate to the GoCardless hosted page — app unmounts here
      window.location.href = authorisation_url;
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start hosted flow');
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{label} — Hosted Payment Pages</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={phase === 'launching'}
          >×</button>
        </div>

        {/* ── Config phase: wizard ── */}
        {phase === 'config' && (
          <>
            {!canLaunch && (
              <div className="demo-notice">
                {(isIBP || isInstantPlusDD)
                  ? `Hosted ${isInstantPlusDD ? 'Instant + DD' : 'IBP'} is only available for UK (GBP). Select United Kingdom in the sidebar.`
                  : 'Hosted Pages demo currently supports SEPA only. Select a SEPA country in the sidebar.'}
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
                  {(isOneOffDD || isIBP || isInstantPlusDD) && (
                    <fieldset>
                      <legend>{(isIBP || isInstantPlusDD) ? 'Instant Bank Pay' : 'Payment'}</legend>
                      <label>
                        Amount ({(isIBP || isInstantPlusDD) ? 'GBP' : currency})
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

                  {isInstantPlusDD && (
                    <fieldset>
                      <legend>Recurring Subscription</legend>
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
                          {(isIBP || isInstantPlusDD)
                            ? `You will be redirected to GoCardless where you'll select your bank and authorise the instant payment${isInstantPlusDD ? ' and set up the mandate' : ''}`
                            : `You will be redirected to a GoCardless-hosted page to enter your bank details and set up a mandate`}
                        </span>
                      </div>
                      {!isIBP && (
                        <div className="review-kv">
                          <span className="review-label">Step 2</span>
                          <span className="review-value">
                            {isSubscription && `On return, a ${subAmount} ${currency} subscription is created (every ${subInterval} ${subIntervalUnit})`}
                            {isOneOffDD && `On return, a ${amountInput} ${currency} one-off payment is charged against the mandate`}
                            {isInstalment && `On return, instalment schedule "${instalmentName}" is created against the mandate`}
                            {isInstantPlusDD && `On return, a ${subAmount} GBP subscription "${subName}" is created against the mandate (every ${subInterval} ${subIntervalUnit})`}
                          </span>
                        </div>
                      )}
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

                  {isIBP && (
                    <div className="review-section">
                      <div className="review-section-title">Instant Bank Pay</div>
                      <div className="review-grid">
                        <div className="review-kv">
                          <span className="review-label">Amount</span>
                          <span className="review-value">{amountInput} GBP</span>
                        </div>
                        <div className="review-kv">
                          <span className="review-label">Settlement</span>
                          <span className="review-value">Instant</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {isInstantPlusDD && (
                    <>
                      <div className="review-section">
                        <div className="review-section-title">Upfront Payment (Instant)</div>
                        <div className="review-grid">
                          <div className="review-kv">
                            <span className="review-label">Amount</span>
                            <span className="review-value">{amountInput} GBP</span>
                          </div>
                          <div className="review-kv">
                            <span className="review-label">Settlement</span>
                            <span className="review-value">Instant</span>
                          </div>
                        </div>
                      </div>
                      <div className="review-section">
                        <div className="review-section-title">Recurring Subscription</div>
                        <div className="review-grid">
                          <div className="review-kv">
                            <span className="review-label">Plan</span>
                            <span className="review-value">{subName}</span>
                          </div>
                          <div className="review-kv">
                            <span className="review-label">Amount</span>
                            <span className="review-value">{subAmount} GBP</span>
                          </div>
                          <div className="review-kv">
                            <span className="review-label">Frequency</span>
                            <span className="review-value">Every {subInterval} {subIntervalUnit}</span>
                          </div>
                        </div>
                      </div>
                    </>
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
                    disabled={!canLaunch}
                    onClick={handleConfirmLaunch}
                  >
                    {(isIBP || isInstantPlusDD) ? 'Confirm & Proceed to Bank →' : 'Confirm & Open Hosted Page →'}
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
              Setting up your GoCardless hosted page…
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
