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

function MonoId({ id }: { id: string }) {
  return (
    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{id}</span>
  );
}

function formatAmount(amount: number, currency: string) {
  if (!amount) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount / 100);
}

// ── Row components ────────────────────────────────────────────────────────────

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  'ibp':               'Instant Bank Pay',
  'instant-plus-dd':   'Instant + DD',
  'subscription-cycle':'Subscription cycle',
  'instalment':        'Instalment',
  'one-off-dd':        'One-off DD',
};

function PaymentRow({ payment, flash, indent }: { payment: HistoryPayment; flash: boolean; indent: number }) {
  const typeLabel = PAYMENT_TYPE_LABEL[payment.type] ?? payment.type;
  return (
    <tr style={{ background: flash ? '#fefce8' : undefined, transition: 'background 0.5s' }}>
      <td style={{ paddingLeft: indent, paddingTop: 6, paddingBottom: 6, fontSize: 12, color: '#374151' }}>
        <span style={{ marginRight: 6, color: '#d1d5db' }}>└</span>
        Payment
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
        <MonoId id={payment.id} />
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12, color: '#6b7280' }}>{typeLabel}</td>
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
      <td style={{ paddingLeft: 56, paddingTop: 6, paddingBottom: 6, fontSize: 12, color: '#374151' }}>
        <span style={{ marginRight: 6, color: '#d1d5db' }}>└</span>
        {sub.name || 'Subscription'}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
        <MonoId id={sub.id} />
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12, color: '#6b7280' }}>Subscription</td>
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

function InstalmentScheduleRow({ schedule, flash }: { schedule: HistoryInstalmentSchedule; flash: boolean }) {
  return (
    <tr style={{ background: flash ? '#fefce8' : undefined, transition: 'background 0.5s' }}>
      <td style={{ paddingLeft: 56, paddingTop: 6, paddingBottom: 6, fontSize: 12, color: '#374151' }}>
        <span style={{ marginRight: 6, color: '#d1d5db' }}>└</span>
        {schedule.name || 'Instalment Schedule'}
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6 }}>
        <MonoId id={schedule.id} />
      </td>
      <td style={{ paddingTop: 6, paddingBottom: 6, fontSize: 12, color: '#6b7280' }}>Instalments</td>
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
  const failed =
    mandate.payments.filter((p) => p.state === 'failed' || p.state === 'charged_back').length +
    mandate.instalment_schedules.filter((s) => s.state === 'errored').length;
  const parts: string[] = [];
  if (total > 0) parts.push(`${total} resource${total !== 1 ? 's' : ''}`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(' · ');
}

function MandateSection({ mandate, flashIds }: { mandate: HistoryMandate; flashIds: Set<string> }) {
  const [open, setOpen] = useState(false);
  const flash = flashIds.has(mandate.id);

  return (
    <>
      <tr
        style={{ background: flash ? '#fefce8' : '#f9fafb', cursor: 'pointer', transition: 'background 0.5s' }}
        onClick={() => setOpen((o) => !o)}
      >
        <td style={{ paddingLeft: 28, paddingTop: 8, paddingBottom: 8, fontSize: 13, fontWeight: 500, color: '#374151' }}>
          <span style={{ marginRight: 8, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
          Mandate
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8 }}>
          <MonoId id={mandate.id} />
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8, fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>
          {mandate.scheme}
        </td>
        <td style={{ paddingTop: 8, paddingBottom: 8, fontSize: 12, color: '#9ca3af' }}>
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
            <InstalmentScheduleRow key={schedule.id} schedule={schedule} flash={flashIds.has(schedule.id)} />
          ))}
          {mandate.payments.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} flash={flashIds.has(payment.id)} indent={56} />
          ))}
          {mandate.subscriptions.length === 0 &&
            mandate.instalment_schedules.length === 0 &&
            mandate.payments.length === 0 && (
              <tr>
                <td colSpan={6} style={{ paddingLeft: 56, paddingTop: 6, paddingBottom: 6, color: '#9ca3af', fontSize: 12 }}>
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

function CustomerSection({ customer, flashIds }: { customer: HistoryCustomer; flashIds: Set<string> }) {
  const [open, setOpen] = useState(true);

  return (
    <>
      <tr
        style={{ background: '#fff', cursor: 'pointer', borderTop: '2px solid #e5e7eb' }}
        onClick={() => setOpen((o) => !o)}
      >
        <td style={{ paddingLeft: 12, paddingTop: 12, paddingBottom: 12, fontWeight: 600, fontSize: 14, color: '#111827' }}>
          <span style={{ marginRight: 8, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
          {customer.name || 'Unknown'}
        </td>
        <td style={{ paddingTop: 12, paddingBottom: 12 }}>
          <MonoId id={customer.id} />
        </td>
        <td style={{ paddingTop: 12, paddingBottom: 12, fontSize: 12, color: '#6b7280' }}>
          {customer.email}
        </td>
        <td />
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
            <PaymentRow key={payment.id} payment={payment} flash={flashIds.has(payment.id)} indent={28} />
          ))}
          {customer.mandates.length === 0 && customer.ibp_payments.length === 0 && (
            <tr>
              <td colSpan={6} style={{ paddingLeft: 28, paddingTop: 8, paddingBottom: 8, color: '#9ca3af', fontSize: 12 }}>
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  async function fetchHistory(manual = false) {
    if (manual) setRefreshing(true);
    try {
      const data = await api.getHistory();
      setCustomers(data.customers);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const es = new EventSource('https://gc-demo-test-server-production.up.railway.app/events/stream');
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
        fetchHistory(false);
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading payment history…</div>;
  }

  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>Error: {error}</div>;
  }

  if (customers.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>No payments yet</div>
        <div style={{ fontSize: 13 }}>Complete a payment flow to see records here.</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Payment History</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          <button
            onClick={() => fetchHistory(true)}
            disabled={refreshing}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: refreshing ? '#f3f4f6' : '#fff',
              color: refreshing ? '#9ca3af' : '#374151',
              cursor: refreshing ? 'not-allowed' : 'pointer',
            }}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: '18%' }}>Name</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: '26%' }}>ID</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: '18%' }}>Type</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: '12%' }}>Amount</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: '12%' }}>State</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', width: '14%' }}>Created</th>
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
