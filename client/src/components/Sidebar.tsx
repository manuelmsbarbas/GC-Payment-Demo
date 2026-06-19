import rawBankDetails from '../data/testBankDetails.json';
import type { BankDetails } from '../types/filters';
import { useFilters } from '../context/FilterContext';

const bankDetailsData = rawBankDetails as BankDetails[];

const SCHEME_ORDER = ['Bacs','SEPA','BECS','BecsNz','Autogiro','Betalingsservice','PAD','ACH'];

function groupByScheme(data: BankDetails[]) {
  const groups: Record<string, BankDetails[]> = {};
  for (const entry of data) {
    if (!groups[entry.scheme]) groups[entry.scheme] = [];
    groups[entry.scheme].push(entry);
  }
  return groups;
}

const SCHEME_LABELS: Record<string, string> = {
  Bacs: 'Direct Debit (Bacs)',
  SEPA: 'Direct Debit (SEPA)',
  BECS: 'Direct Debit (BECS)',
  BecsNz: 'Direct Debit (BECS NZ)',
  Autogiro: 'Direct Debit (Autogiro)',
  Betalingsservice: 'Direct Debit (Betalingsservice)',
  PAD: 'Direct Debit (PAD)',
  ACH: 'Direct Debit (ACH)',
};

export type AppView = 'explorer' | 'history';

interface SidebarProps {
  view: AppView;
  onViewChange: (v: AppView) => void;
}

export function Sidebar({ view, onViewChange }: SidebarProps) {
  const { filters, bankDetails, setFlowType, setCountry } = useFilters();
  const groups = groupByScheme(bankDetailsData);

  return (
    <aside className="sidebar">
      {/* View switcher */}
      <div className="sidebar-section">
        <div className="flow-toggle">
          <button
            className={`flow-toggle-btn${view === 'explorer' ? ' flow-toggle-btn--active' : ''}`}
            onClick={() => onViewChange('explorer')}
          >
            Explorer
          </button>
          <button
            className={`flow-toggle-btn${view === 'history' ? ' flow-toggle-btn--active' : ''}`}
            onClick={() => onViewChange('history')}
          >
            Payments History
          </button>
        </div>
      </div>

      {/* Filter controls — only shown in Explorer view */}
      {view === 'explorer' && (
        <>
          <div className="sidebar-section">
            <span className="sidebar-label">Payment Flow</span>
            <div className="flow-toggle">
              <button
                className={`flow-toggle-btn${filters.flowType === 'custom' ? ' flow-toggle-btn--active' : ''}`}
                onClick={() => setFlowType('custom')}
              >
                Custom
              </button>
              <button
                className={`flow-toggle-btn${filters.flowType === 'js-drop-in' ? ' flow-toggle-btn--active' : ''}`}
                onClick={() => setFlowType('js-drop-in')}
              >
                JS Drop-In
              </button>
              <button
                className={`flow-toggle-btn${filters.flowType === 'hosted' ? ' flow-toggle-btn--active' : ''}`}
                onClick={() => setFlowType('hosted')}
              >
                Hosted
              </button>
            </div>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-label">Country</span>
            <select value={filters.countryCode} onChange={e => setCountry(e.target.value)}>
              {SCHEME_ORDER.map(scheme => {
                const entries = groups[scheme];
                if (!entries?.length) return null;
                return (
                  <optgroup key={scheme} label={SCHEME_LABELS[scheme] ?? scheme}>
                    {entries.map(e => (
                      <option key={e.countryCode} value={e.countryCode}>{e.country}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="sidebar-section">
            <span className="sidebar-label">Scheme</span>
            <div className="sidebar-readonly">
              <span>{filters.scheme}</span>
              <span className="sidebar-readonly-auto">auto</span>
            </div>
          </div>

          {bankDetails && (
            <div className="sidebar-section">
              <span className="sidebar-label">Currency</span>
              <div className="sidebar-readonly">
                <span>{bankDetails.currency}</span>
              </div>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
