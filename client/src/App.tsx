import { useState } from 'react';
import { FilterProvider } from './context/FilterContext';
import { Sidebar, type AppView } from './components/Sidebar';
import { PaymentMethodGrid } from './components/PaymentMethodGrid';
import { WebhookEventFeed } from './components/WebhookEventFeed';
import { HostedCallbackModal } from './components/HostedCallbackModal';
import { PaymentsHistoryTable } from './components/PaymentsHistoryTable';

export function App() {
  const [view, setView] = useState<AppView>('explorer');

  const [hostedCallbackId, setHostedCallbackId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('gc_billing_request_id')
  );

  function handleCallbackClose() {
    window.history.replaceState({}, '', '/');
    setHostedCallbackId(null);
  }

  return (
    <FilterProvider>
      <div className="app">
        <header className="app-header">
          <div className="app-header-inner">
            <h1>GoCardless API Demo</h1>
            <span className="env-badge">Sandbox</span>
          </div>
        </header>
        <div className="app-body">
          <Sidebar view={view} onViewChange={setView} />
          <main className="app-main">
            {view === 'explorer' ? (
              <>
                <PaymentMethodGrid />
                <WebhookEventFeed />
              </>
            ) : (
              <PaymentsHistoryTable />
            )}
          </main>
        </div>
      </div>

      {hostedCallbackId && (
        <HostedCallbackModal
          billingRequestId={hostedCallbackId}
          onClose={handleCallbackClose}
        />
      )}
    </FilterProvider>
  );
}
