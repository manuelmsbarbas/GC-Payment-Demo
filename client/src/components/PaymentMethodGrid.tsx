import { useState } from 'react';
import { PAYMENT_METHODS, type PaymentMethodId } from '../data/paymentMethods';
import { useFilters } from '../context/FilterContext';
import { PaymentMethodCard } from './PaymentMethodCard';
import { FlowModal } from './FlowModal';

export function PaymentMethodGrid() {
  const { filters } = useFilters();
  const [openMethod, setOpenMethod] = useState<PaymentMethodId | null>(null);

  const visibleMethods = PAYMENT_METHODS.filter(m => m.flows.includes(filters.flowType));

  return (
    <>
      <div className="payment-grid">
        {visibleMethods.map(method => {
          const { available, reason } = method.checkAvailability(filters.scheme, filters.countryCode);
          return (
            <PaymentMethodCard
              key={method.id}
              method={method}
              available={available}
              unavailableReason={reason}
              flowType={filters.flowType}
              onTryIt={() => setOpenMethod(method.id)}
            />
          );
        })}
      </div>

      {openMethod && (
        <FlowModal methodId={openMethod} onClose={() => setOpenMethod(null)} />
      )}
    </>
  );
}
