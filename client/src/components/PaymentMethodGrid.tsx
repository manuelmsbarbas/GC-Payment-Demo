import { useState } from 'react';
import { PAYMENT_METHODS, type PaymentMethodId } from '../data/paymentMethods';
import { useFilters } from '../context/FilterContext';
import { PaymentMethodCard } from './PaymentMethodCard';
import { FlowModal } from './FlowModal';
import { DropInModal } from './DropInModal';
import { HostedModal } from './HostedModal';

const DROP_IN_SUPPORTED: PaymentMethodId[] = ['subscription', 'one-off-dd', 'instalment'];
const HOSTED_SUPPORTED: PaymentMethodId[] = ['subscription', 'one-off-dd', 'instalment', 'instant-bank-pay', 'instant-plus-dd'];

export function PaymentMethodGrid() {
  const { filters } = useFilters();
  const [openMethod, setOpenMethod] = useState<PaymentMethodId | null>(null);

  const visibleMethods = PAYMENT_METHODS.filter(m => m.flows.includes(filters.flowType));

  const useDropIn =
    filters.flowType === 'js-drop-in' &&
    openMethod !== null &&
    DROP_IN_SUPPORTED.includes(openMethod);

  const useHosted =
    filters.flowType === 'hosted' &&
    openMethod !== null &&
    HOSTED_SUPPORTED.includes(openMethod);

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

      {openMethod && useDropIn && (
        <DropInModal methodId={openMethod} onClose={() => setOpenMethod(null)} />
      )}
      {openMethod && useHosted && (
        <HostedModal methodId={openMethod} onClose={() => setOpenMethod(null)} />
      )}
      {openMethod && !useDropIn && !useHosted && (
        <FlowModal methodId={openMethod} onClose={() => setOpenMethod(null)} />
      )}
    </>
  );
}
