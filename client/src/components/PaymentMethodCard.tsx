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
  if (flows.includes('hosted') && flows.includes('custom')) {
    return <span className="badge badge--flow-both">Both</span>;
  }
  if (flows.includes('hosted')) {
    return <span className="badge badge--flow-hosted">Hosted</span>;
  }
  return <span className="badge badge--flow-custom">Custom</span>;
}

export function PaymentMethodCard({ method, available, unavailableReason, onTryIt }: PaymentMethodCardProps) {
  const tryLabel = available ? 'Try it →' : 'Not available';

  return (
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
      </div>
    </div>
  );
}
