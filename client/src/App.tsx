import { FilterProvider } from './context/FilterContext';
import { Sidebar } from './components/Sidebar';
import { PaymentMethodGrid } from './components/PaymentMethodGrid';
import { WebhookEventFeed } from './components/WebhookEventFeed';

export function App() {
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
          <Sidebar />
          <main className="app-main">
            <PaymentMethodGrid />
            <WebhookEventFeed />
          </main>
        </div>
      </div>
    </FilterProvider>
  );
}
