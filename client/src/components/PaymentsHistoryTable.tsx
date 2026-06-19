import { useState, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type {
  HistoryCustomer,
  HistoryMandate,
  HistoryPayment,
  HistorySubscription,
  HistoryInstalmentSchedule,
  WebhookEvent,
} from '../types/api';

// ── State badge ───────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, { bg: string; color: string }> = {
  active:       { bg: '#f0fdf4', color: '#16a34a' },
  paid_out:     { bg: '#f0fdf4', color: '#16a34a' },
  confirmed:    { bg: '#f0fdf4', color: '#16a34a' },
  completed:    { bg: '#f0fdf4', color: '#16a34a' },
  finished:     { bg: '#f0fdf4', color: '#16a34a' },
  created:      { bg: '#eff6ff', color: '#2563eb' },
  submitted:    { bg: '#eff6ff', color: '#2563eb' },
  pending:      { bg: '#eff6ff', color: '#2563eb' },
  failed:       { bg: '#fef2f2', color: '#dc2626' },
  cancelled:    { bg: '#fef2f2', color: '#dc2626' },
  expired:      { bg: '#fef2f2', color: '#dc2626' },
  charged_back: { bg: '#fef2f2', color: '#dc2626' },
  errored:      { bg: '#fef2f2', color: '#dc2626' },
  paused:       { bg: '#fffbeb', color: '#d97706' },
};

function StateBadge({ state, flash }: { state: string; flash: boolean }) {
  const style = STATE_COLORS[state] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 600,
        background: flash ? '#fef9c3' : style.bg,
        color: flash ? '#92400e' : style.color,
        transition: 'background 0.4s, color 0.4s',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {state}
    </span>
  );
}

// ── Amount formatting ─────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string) {
  if (!amount) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
}

// ── Row components ────────────────────────────────────────────────────────────

function PaymentRow({ payment, flash }: { payment: HistoryPayment; flash: boolean }) {
  const label =
    payment.type === 'ibp' ? 'IBP Payment'
    : payment.type === 'instant-plus-dd' ? 'Instant+DD Payment'
    : payment.type === 'subscription-cycle' ? 'Subscription Payment'
    : payment.type === 'instalment' ? 'Instalment Payment'
    : 'One-off Payment';

  return (
    <tr style={{ background: flash ? '#fefce8' : undefined, transition: 'background 0.5s' }}>
      <td style={{ paddingLeft: 72, paddingTop: 6, paddingBottom: 6, color: '#6b7280', fontSize: 12 }}>
        <span style={{ marginRight: 6 }}>└</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{payment.id}</span>
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, color: '#374151', fontSize: 12 }}>{label}</td>
      <td style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12 }}>
        {formatAmount(payment.amount, payment.currency || 'EUR')}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
        <StateBadge state={payment.state} flash={flash} />
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, color: '#9ca3af', fontSize: 11 }}>
        {new Date(payment.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

function SubscriptionRow({ sub, flash }: { sub: HistorySubscription; flash: boolean }) {
  return (
    <tr style={{ background: flash ? '#fefce8' : undefined, transition: 'background 0.5s' }}>
      <td style={{ paddingLeft: 72, paddingTop: 6, paddingBottom: 6, color: '#6b7280', fontSize: 12 }}>
        <span style={{ marginRight: 6 }}>└</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{sub.id}</span>
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, color: '#374151', fontSize: 12 }}>
        Subscription {sub.name ? `— ${sub.name}` : ''}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12 }}>
        {formatAmount(sub.amount, sub.currency)} / {sub.interval_unit}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
        <StateBadge state={sub.state} flash={flash} />
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, color: '#9ca3af', fontSize: 11 }}>
        {new Date(sub.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

function InstalmentScheduleRow({
  schedule,
  flash,
}: {
  schedule: HistoryInstalmentSchedule;
  flash: boolean;
}) {
  return (
    <tr style={{ background: flash ? '#fefce8' : undefined, transition: 'background 0.5s' }}>
      <td style={{ paddingLeft: 72, paddingTop: 6, paddingBottom: 6, color: '#6b7280', fontSize: 12 }}>
        <span style={{ marginRight: 6 }}>└</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{schedule.id}</span>
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, color: '#374151', fontSize: 12 }}>
        Instalment Schedule {schedule.name ? `— ${schedule.name}` : ''}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12 }}>
        {formatAmount(schedule.total_amount, schedule.currency)}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
        <StateBadge state={schedule.state} flash={flash} />
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, color: '#9ca3af', fontSize: 11 }}>
        {new Date(schedule.created_at).toLocaleString()}
      </td>
    </tr>
  );
}

// ── Mandate section ───────────────────────────────────────────────────────────

function mandateSummary(mandate: HistoryMandate): string {
  const total =
    mandate.payments.length +
    mandate.subscriptions.length +
    mandate.instalment_schedules.length;
  const failed = mandate.payments.filter((p) => p.state === 'failed' || p.state === 'charged_back').length;
  const errored = mandate.instalment_schedules.filter((s) => s.state === 'errored').length;
  const parts: string[] = [];
  if (total > 0) parts.push(`${total} resource${total !== 1 ? 's' : ''}`);
  if (failed + errored > 0) parts.push(`${failed + errored} failed`);
  return parts.join(' · ');
}

function MandateSection({
  mandate,
  flashIds,
}: {
  mandate: HistoryMandate;
  flashIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const flash = flashIds.has(mandate.id);

  return (
    <>
      <tr
        style={{
          background: flash ? '#fefce8' : '#f9fafb',
          cursor: 'pointer',
          transition: 'background 0.5s',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <td style={{ paddingLeft: 36, paddingTop: 8, paddingBottom: 8, fontWeight: 500, fontSize: 13 }}>
          <span style={{ marginRight: 8, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{mandate.id}</span>
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8, color: '#6b7280', fontSize: 12 }}>
          Mandate · <span style={{ textTransform: 'uppercase' }}>{mandate.scheme}</span>
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8, color: '#9ca3af', fontSize: 12 }}>
          {!open && mandateSummary(mandate)}
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8 }}>
          <StateBadge state={mandate.state} flash={flash} />
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8, color: '#9ca3af', fontSize: 11 }}>
          {new Date(mandate.created_at).toLocaleString()}
        </td>
      </tr>

      {open && (
        <>
          {mandate.subscriptions.map((sub) => (
            <SubscriptionRow key={sub.id} sub={sub} flash={flashIds.has(sub.id)} />
          ))}
          {mandate.instalment_schedules.map((schedule) => (
            <InstalmentScheduleRow
              key={schedule.id}
              schedule={schedule}
              flash={flashIds.has(schedule.id)}
            />
          ))}
          {mandate.payments.map((payment) => (
            <PaymentRow key={payment.id} flash={flashIds.has(payment.id)} payment={payment} />
          ))}
          {mandate.subscriptions.length === 0 &&
            mandate.instalment_schedules.length === 0 &&
            mandate.payments.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{ paddingLeft: 72, paddingTop: 6, paddingBottom: 6, color: '#9ca3af', fontSize: 12 }}
                >
                  No resources yet
                </td>
              </tr>
            )}
        </>
      )}
    </>
  );
}

// ── Customer section ──────────────────────────────────────────────────────────

function CustomerSection({
  customer,
  flashIds,
}: {
  customer: HistoryCustomer;
  flashIds: Set<string>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <tr
        style={{ background: '#fff', cursor: 'pointer', borderTop: '2px solid #e5e7eb' }}
        onClick={() => setOpen((o) => !o)}
      >
        <td style={{ paddingLeft: 12, paddingTop: 12, paddingBottom: 12, fontWeight: 600, fontSize: 14 }}>
          <span style={{ marginRight: 8, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
          {customer.name || 'Unknown'}
        </td>
        <td style={{ paddingTop: 12, paddingBottom: 12, color: '#6b7280', fontSize: 12 }}>
          {customer.email}
        </td>
        <td style={{ paddingTop: 12, paddingBottom: 12 }}>
          <span
            style={{ fontFamily: 'monospace', fontSize: 11, color: '#9ca3af' }}
          >
            {customer.id}
          </span>
        </td>
        <td />
        <td style={{ paddingTop: 12, paddingBottom: 12, color: '#9ca3af', fontSize: 11 }}>
          {new Date(customer.created_at).toLocaleString()}
        </td>
      </tr>

      {open && (
        <>
          {customer.mandates.map((mandate) => (
            <MandateSection key={mandate.id} mandate={mandate} flashIds={flashIds} />
          ))}
          {customer.ibp_payments.map((payment) => (
            <tr key={payment.id}>
              <td
                style={{ paddingLeft: 36, paddingTop: 8, paddingBottom: 8, fontWeight: 500, fontSize: 12 }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{payment.id}</span>
              </td>
              <td style={{ paddingTop: 8, paddingBottom: 8, color: '#6b7280', fontSize: 12 }}>
                {payment.type === 'instant-plus-dd' ? 'Instant+DD Payment' : 'IBP Payment'}
              </td>
              <td style={{ paddingTop: 8, paddingBottom: 8, fontSize: 12 }}>
                {formatAmount(payment.amount, payment.currency || 'GBP')}
              </td>
              <td style={{ paddingTop: 8, paddingBottom: 8 }}>
                <StateBadge state={payment.state} flash={flashIds.has(payment.id)} />
              </td>
              <td style={{ paddingTop: 8, paddingBottom: 8, color: '#9ca3af', fontSize: 11 }}>
                {new Date(payment.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
          {customer.mandates.length === 0 && customer.ibp_payments.length === 0 && (
            <tr>
              <td
                colSpan={5}
                style={{ paddingLeft: 36, paddingTop: 8, paddingBottom: 8, color: '#9ca3af', fontSize: 12 }}
              >
                No mandates or payments yet
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PaymentsHistoryTable() {
  const [customers, setCustomers] = useState<HistoryCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  async function fetchHistory() {
    try {
      const data = await api.getHistory();
      setCustomers(data.customers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  // Flash a row briefly when its state updates
  function flashId(id: string) {
    setFlashIds((prev) => new Set(prev).add(id));
    const existing = flashTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      flashTimers.current.delete(id);
    }, 1500);
    flashTimers.current.set(id, timer);
  }

  useEffect(() => {
    fetchHistory();
  }, []);

  // SSE — re-fetch on any webhook event and flash affected row
  useEffect(() => {
    const es = new EventSource('http://localhost:3001/events/stream');
    es.onmessage = (e) => {
      if (e.data === 'heartbeat') return;
      try {
        const event = JSON.parse(e.data) as WebhookEvent;
        const affectedId =
          event.links.mandate ??
          event.links.payment ??
          event.links.subscription ??
          event.links.instalment_schedule;
        if (affectedId) flashId(affectedId);
        fetchHistory();
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
        Loading payment history…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
        Error: {error}
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          color: '#9ca3af',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>No payments yet</div>
        <div style={{ fontSize: 13 }}>
          Complete a payment flow to see records here.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', width: '30%' }}>
              Customer / ID
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', width: '20%' }}>
              Type
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', width: '15%' }}>
              Amount
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', width: '15%' }}>
              State
            </th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', width: '20%' }}>
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <CustomerSection key={customer.id} customer={customer} flashIds={flashIds} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
