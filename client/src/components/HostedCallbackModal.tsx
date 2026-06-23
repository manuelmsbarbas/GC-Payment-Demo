import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type {
  HostedSessionConfig,
  Subscription,
  Payment,
  InstalmentSchedule,
  CreateInstalmentScheduleBody,
} from '../types/api';

const HOSTED_SESSION_KEY = 'gc_hosted_config';

const METHOD_LABELS: Record<string, string> = {
  subscription: 'Subscription',
  'one-off-dd': 'One-off Direct Debit',
  instalment: 'Instalments',
  'instant-bank-pay': 'Instant Bank Pay',
  'instant-plus-dd': 'Instant + Direct Debit',
};

type StepStatus = 'idle' | 'loading' | 'success' | 'error';

const STATUS_ICON: Record<StepStatus, string> = {
  idle: '○',
  loading: '◌',
  success: '✓',
  error: '✗',
};

interface HostedCallbackModalProps {
  billingRequestId: string;
  onClose: () => void;
}

interface StepState {
  status: StepStatus;
  resultId?: string;
  error?: string;
}

export function HostedCallbackModal({ billingRequestId, onClose }: HostedCallbackModalProps) {
  const config = useRef<HostedSessionConfig | null>(null);

  const [fulfilStep, setFulfilStep] = useState<StepState>({ status: 'idle' });
  const [resourceStep, setResourceStep] = useState<StepState>({ status: 'idle' });
  const [done, setDone] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [fatalError, setFatalError] = useState('');

  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const raw = sessionStorage.getItem(HOSTED_SESSION_KEY);
    if (!raw) {
      setFatalError('Payment session not found. The session may have expired — please start a new payment from the demo app.');
      return;
    }
    try {
      config.current = JSON.parse(raw) as HostedSessionConfig;
    } catch {
      setFatalError('Could not read payment session. Please start a new payment.');
      return;
    }

    runCompletion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCompletion() {
    const cfg = config.current!;
    const isIBP = cfg.methodId === 'instant-bank-pay';
    const isInstantPlusDD = cfg.methodId === 'instant-plus-dd';
    // Hosted Instant+DD has no cfg.flow; custom Instant+DD sets flow: 'instant-plus-dd-custom'
    const isHostedInstantPlusDD = isInstantPlusDD && !cfg.flow;

    // Step 1: Single read of the billing request — no polling
    setFulfilStep({ status: 'loading' });
    let mandateId = '';
    let ibpPaymentId = '';

    try {
      const br = await api.getBillingRequest(billingRequestId);

      if (isIBP) {
        if (!br.links.payment_request_payment) {
          setFulfilStep({ status: 'success' });
          setProcessing(true);
          sessionStorage.removeItem(HOSTED_SESSION_KEY);
          return;
        }
        ibpPaymentId = br.links.payment_request_payment;
      } else if (isInstantPlusDD) {
        if (!br.links.mandate_request_mandate) {
          setFulfilStep({ status: 'success' });
          setProcessing(true);
          sessionStorage.removeItem(HOSTED_SESSION_KEY);
          return;
        }
        mandateId = br.links.mandate_request_mandate;
        ibpPaymentId = br.links.payment_request_payment ?? '';
      } else {
        mandateId = br.links.mandate_request_mandate ?? '';
        if (!mandateId) throw new Error('No mandate ID found — the billing request may not be fulfilled yet');
      }
      setFulfilStep({ status: 'success', resultId: isInstantPlusDD ? mandateId : isIBP ? ibpPaymentId : billingRequestId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to read billing request';
      setFulfilStep({ status: 'error', error: msg });
      return;
    }

    // IBP: payment already created by GoCardless during bank authorisation
    if (isIBP) {
      setDone(true);
      sessionStorage.removeItem(HOSTED_SESSION_KEY);
      return;
    }

    // Hosted Instant+DD: subscription created by webhook worker — nothing left to do client-side
    if (isHostedInstantPlusDD) {
      setDone(true);
      sessionStorage.removeItem(HOSTED_SESSION_KEY);
      return;
    }

    // Step 2: Create subscription / payment / instalment schedule
    setResourceStep({ status: 'loading' });
    try {
      const currency = cfg.currency ?? 'EUR';

      if (cfg.methodId === 'subscription' || cfg.methodId === 'instant-plus-dd') {
        const sub: Subscription = await api.createSubscription({
          mandate_id: mandateId,
          amount: Math.round(parseFloat(cfg.subAmount ?? '10.00') * 100),
          currency,
          name: cfg.subName ?? 'Subscription',
          interval: parseInt(cfg.subInterval ?? '1', 10),
          interval_unit: cfg.subIntervalUnit ?? 'monthly',
        });
        setResourceStep({ status: 'success', resultId: sub.id });

      } else if (cfg.methodId === 'one-off-dd') {
        const payment: Payment = await api.createPayment({
          mandate_id: mandateId,
          amount: Math.round(parseFloat(cfg.amountInput ?? '25.00') * 100),
          currency,
        });
        setResourceStep({ status: 'success', resultId: payment.id });

      } else if (cfg.methodId === 'instalment') {
        let instalments: CreateInstalmentScheduleBody['instalments'];
        let totalAmount: number;

        if (cfg.instalmentMode === 'schedule' && cfg.instalmentScheduleParams && cfg.instalmentAmounts) {
          const amounts = cfg.instalmentAmounts.map(a => Math.round(parseFloat(a) * 100));
          totalAmount = amounts.reduce((s, a) => s + a, 0);
          instalments = {
            start_date: cfg.instalmentScheduleParams.start_date,
            interval: parseInt(cfg.instalmentScheduleParams.interval, 10),
            interval_unit: cfg.instalmentScheduleParams.interval_unit,
            amounts,
          };
        } else {
          const rows = (cfg.instalmentDates ?? []).map(d => ({
            amount: Math.round(parseFloat(d.amount) * 100),
            charge_date: d.charge_date,
          }));
          totalAmount = rows.reduce((s, d) => s + d.amount, 0);
          instalments = rows;
        }

        const schedule: InstalmentSchedule = await api.createInstalmentSchedule({
          mandate_id: mandateId,
          name: cfg.instalmentName ?? 'Payment Plan',
          currency,
          total_amount: totalAmount,
          instalments,
        });
        setResourceStep({ status: 'success', resultId: schedule.id });
      }

      setDone(true);
      sessionStorage.removeItem(HOSTED_SESSION_KEY);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create payment resource';
      setResourceStep({ status: 'error', error: msg });
    }
  }

  const cfg = config.current;
  const label = cfg ? (METHOD_LABELS[cfg.methodId] ?? cfg.methodId) : 'Payment';
  const resourceLabel =
    cfg?.methodId === 'subscription' ? 'Create Subscription' :
    cfg?.methodId === 'instant-plus-dd' ? 'Create Subscription' :
    cfg?.methodId === 'one-off-dd' ? 'Create Payment' :
    'Create Instalment Schedule';

  const isRunning = fulfilStep.status === 'loading' || resourceStep.status === 'loading';
  const hasError = fulfilStep.status === 'error' || resourceStep.status === 'error';

  // Summary line shown at the top so the user knows what we're completing
  function renderSummary() {
    if (!cfg) return null;
    const currency = cfg.currency ?? 'EUR';
    if (cfg.methodId === 'subscription') {
      return `${cfg.subAmount ?? '10.00'} ${currency} / ${cfg.subIntervalUnit ?? 'monthly'} — ${cfg.subName ?? 'Subscription'}`;
    }
    if (cfg.methodId === 'one-off-dd') {
      return `${cfg.amountInput ?? '25.00'} ${currency} one-off payment`;
    }
    if (cfg.methodId === 'instalment') {
      const total = cfg.instalmentMode === 'schedule'
        ? (cfg.instalmentAmounts ?? []).reduce((s, a) => s + parseFloat(a), 0).toFixed(2)
        : (cfg.instalmentDates ?? []).reduce((s, d) => s + parseFloat(d.amount), 0).toFixed(2);
      return `${cfg.instalmentName ?? 'Payment Plan'} — ${total} ${currency} total`;
    }
    if (cfg.methodId === 'instant-bank-pay') {
      return `${cfg.amountInput ?? '10.00'} ${currency} instant bank payment`;
    }
    if (cfg.methodId === 'instant-plus-dd') {
      return `${cfg.amountInput ?? '10.00'} ${currency} instant payment + ${cfg.subAmount ?? '10.00'} ${currency}/${cfg.subIntervalUnit ?? 'monthly'} subscription "${cfg.subName ?? 'Subscription'}"`;
    }
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{label} — Hosted Payment Pages</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={isRunning}
          >×</button>
        </div>

        {fatalError ? (
          <div className="flow-steps">
            <div className="flow-step flow-step--error">
              <span className="step-icon">✗</span>
              {fatalError}
            </div>
            <div style={{ padding: '0 16px 16px', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : processing ? (
          <>
            {cfg && (
              <div className="hosted-callback-summary">
                <span className="hosted-callback-summary-label">Completing:</span>
                {renderSummary()}
              </div>
            )}
            <div className="flow-steps">
              <div className="flow-step flow-step--idle" style={{ color: '#0369a1' }}>
                <span className="flow-step-icon">◌</span>
                <span className="flow-step-label">
                  Payment is processing — it will appear in Payments History once confirmed.
                </span>
              </div>
            </div>
            <div style={{ padding: '12px 0 0', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <>
            {/* Brief summary of what was configured */}
            {cfg && (
              <div className="hosted-callback-summary">
                <span className="hosted-callback-summary-label">Completing:</span>
                {renderSummary()}
              </div>
            )}

            <div className="flow-steps" style={{ flexDirection: 'column', gap: 8 }}>
              {/* Step 1: Read billing request */}
              <div className={`flow-step flow-step--${fulfilStep.status}`}>
                <span className="flow-step-icon">{STATUS_ICON[fulfilStep.status]}</span>
                <span className="flow-step-label">Read Billing Request</span>
                {fulfilStep.status === 'success' && fulfilStep.resultId && (
                  <span className="flow-step-id">{fulfilStep.resultId}</span>
                )}
                {fulfilStep.status === 'error' && (
                  <span className="flow-step-error">{fulfilStep.error}</span>
                )}
              </div>

              {/* Step 2: Create resource — hidden for IBP and hosted Instant+DD */}
              {cfg?.methodId !== 'instant-bank-pay' && !(cfg?.methodId === 'instant-plus-dd' && !cfg?.flow) && (
                <div className={`flow-step flow-step--${resourceStep.status}`}>
                  <span className="flow-step-icon">{STATUS_ICON[resourceStep.status]}</span>
                  <span className="flow-step-label">{resourceLabel}</span>
                  {resourceStep.status === 'success' && resourceStep.resultId && (
                    <span className="flow-step-id">{resourceStep.resultId}</span>
                  )}
                  {resourceStep.status === 'error' && (
                    <span className="flow-step-error">{resourceStep.error}</span>
                  )}
                </div>
              )}
            </div>

            {done && (
              <>
                <div className="success-banner">
                  All done! Check the webhook feed for live events.
                </div>
                <div style={{ padding: '12px 0 0', textAlign: 'right' }}>
                  <button className="btn-secondary" onClick={onClose}>Close</button>
                </div>
              </>
            )}

            {hasError && !isRunning && (
              <div style={{ padding: '12px 0 0', textAlign: 'right' }}>
                <button className="btn-secondary" onClick={onClose}>Close</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
