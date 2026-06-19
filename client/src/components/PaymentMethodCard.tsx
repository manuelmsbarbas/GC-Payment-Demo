import { useState, useEffect } from 'react';
import type { PaymentMethodDef } from '../data/paymentMethods';
import type { FlowType } from '../types/filters';

interface PaymentMethodCardProps {
  method: PaymentMethodDef;
  available: boolean;
  unavailableReason?: string;
  flowType: FlowType;
  onTryIt: () => void;
}

function FlowBadge({ flows }: { flows: FlowType[] }) {
  if (flows.includes('hosted') && flows.includes('custom') && flows.includes('js-drop-in')) {
    return <span className="badge badge--flow-both">All flows</span>;
  }
  if (flows.includes('hosted')) {
    return <span className="badge badge--flow-hosted">Hosted</span>;
  }
  if (flows.includes('js-drop-in')) {
    return <span className="badge badge--flow-custom">JS Drop-In</span>;
  }
  return <span className="badge badge--flow-custom">Custom</span>;
}

interface ApiDetailsModalProps {
  method: PaymentMethodDef;
  flowType: FlowType;
  onClose: () => void;
}

function ApiDetailsModal({ method, flowType, onClose }: ApiDetailsModalProps) {
  const steps = method.apiSteps[flowType];
  const flowLabel = flowType === 'custom' ? 'Custom Payment Pages' : flowType === 'js-drop-in' ? 'JS Drop-In' : 'Hosted Payment Pages';

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal api-details-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{method.name} — API Call Sequence</h2>
            <div className="api-details-flow-label">{flowLabel}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <ol className="api-details-list">
          {steps.map((step, i) => (
            <li key={i} className="api-details-step">{step}</li>
          ))}
        </ol>

        <div className="api-details-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function PaymentMethodCard({ method, available, unavailableReason, flowType, onTryIt }: PaymentMethodCardProps) {
  const [showApiDetails, setShowApiDetails] = useState(false);
  const tryLabel = available ? 'Try it →' : 'Not available';

  return (
    <>
      <div className={`payment-card${available ? '' : ' payment-card--unavailable'}`}>
        <div className="payment-card-header">
          <div className="payment-card-badges">
            <span className="badge badge--scheme">{method.schemesLabel}</span>
            <FlowBadge flows={method.flows} />
          </div>
        </div>

        <div>
          <div className="payment-card-title">{method.name}</div>
          <div className="payment-card-desc">{method.description}</div>
        </div>

        <div className="payment-card-tags">
          {method.bestFor.map(tag => (
            <span key={tag} className="payment-card-tag">{tag}</span>
          ))}
        </div>

        {!available && unavailableReason && (
          <div className="payment-card-unavailable-msg">✕ {unavailableReason}</div>
        )}

        <div className="payment-card-footer">
          <div className="payment-card-actions">
            <button
              className="btn-primary"
              style={{ fontSize: '13px', padding: '7px 14px' }}
              disabled={!available}
              onClick={available ? onTryIt : undefined}
            >
              {tryLabel}
            </button>
            <a
              href={method.docsPath}
              target="_blank"
              rel="noreferrer"
              className="btn-docs"
            >
              Docs ↗
            </a>
          </div>
          <button className="btn-api-details" onClick={() => setShowApiDetails(true)}>
            API Details
          </button>
        </div>
      </div>

      {showApiDetails && (
        <ApiDetailsModal
          method={method}
          flowType={flowType}
          onClose={() => setShowApiDetails(false)}
        />
      )}
    </>
  );
}
