import { useEffect, useRef, useState } from 'react';
import type { WebhookEvent } from '../types/api';

const RESOURCE_COLOR: Record<string, string> = {
  payments: '#0070f3',
  mandates: '#7928ca',
  subscriptions: '#ff4081',
  refunds: '#f5a623',
};

export function WebhookEventFeed() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const source = new EventSource('/api/events/stream');

    source.onopen = () => setConnected(true);

    source.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as WebhookEvent;
        setEvents((prev) => [event, ...prev].slice(0, 100));
      } catch {
        // ignore malformed frames
      }
    };

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <section className="webhook-feed">
      <div className="webhook-feed-header">
        <h3>Webhook Events</h3>
        <span className={`status-dot ${connected ? 'status-dot--connected' : ''}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        {events.length > 0 && (
          <button className="btn-ghost" onClick={() => setEvents([])}>
            Clear
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="webhook-feed-empty">
          Waiting for webhook events… trigger one via GoCardless Scenario Simulators.
        </p>
      ) : (
        <ul className="webhook-event-list">
          {events.map((ev) => (
            <li key={ev.id} className="webhook-event">
              <span
                className="webhook-event-badge"
                style={{ background: RESOURCE_COLOR[ev.resource_type] ?? '#666' }}
              >
                {ev.resource_type}
              </span>
              <span className="webhook-event-action">{ev.action}</span>
              <span className="webhook-event-id">{Object.values(ev.links)[0] ?? ev.id}</span>
              {ev.details?.cause && (
                <span className="webhook-event-cause">{ev.details.cause}</span>
              )}
              <span className="webhook-event-time">
                {new Date(ev.created_at).toLocaleTimeString()}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div ref={bottomRef} />
    </section>
  );
}
