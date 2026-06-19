import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import rawBankDetails from '../data/testBankDetails.json';
import type { FilterState, FlowType, SchemeId, BankDetails } from '../types/filters';

const bankDetailsData = rawBankDetails as BankDetails[];

interface FilterContextValue {
  filters: FilterState;
  bankDetails: BankDetails | null;
  setFlowType: (ft: FlowType) => void;
  setCountry: (countryCode: string) => void;
  setScheme: (scheme: SchemeId) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

const DEFAULT_COUNTRY = 'GB';
const defaultEntry = bankDetailsData.find(e => e.countryCode === DEFAULT_COUNTRY)!;

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>({
    flowType: 'custom',
    countryCode: DEFAULT_COUNTRY,
    scheme: defaultEntry.scheme as SchemeId,
  });

  const bankDetails = useMemo(
    () => bankDetailsData.find(e => e.countryCode === filters.countryCode) ?? null,
    [filters.countryCode]
  );

  function setFlowType(ft: FlowType) {
    setFilters(f => ({ ...f, flowType: ft }));
  }

  function setCountry(countryCode: string) {
    const entry = bankDetailsData.find(e => e.countryCode === countryCode);
    if (!entry) return;
    setFilters(f => ({ ...f, countryCode, scheme: entry.scheme as SchemeId }));
  }

  function setScheme(scheme: SchemeId) {
    setFilters(f => ({ ...f, scheme }));
  }

  return (
    <FilterContext.Provider value={{ filters, bankDetails, setFlowType, setCountry, setScheme }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
