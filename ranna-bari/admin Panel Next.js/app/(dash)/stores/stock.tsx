'use client';

import { useState } from 'react';

import { setProductStock, toggleProductActive, toggleStoreOpen } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';

/** Restock one product without leaving the alarm list. */
export function StockCell({ productId }: { productId: string }) {
  const [value, setValue] = useState('');

  return (
    <div className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        aria-label="New stock level"
        className="tnum w-16 rounded-[8px] border border-line bg-canvas px-2 py-1 text-[12px] outline-none placeholder:text-ink3 focus:border-primary-200"
      />
      <ActionButton
        action={() => setProductStock(productId, Number(value))}
        variant="ghost"
        disabled={!value.trim()}
      >
        Set
      </ActionButton>
    </div>
  );
}

/**
 * Take a product off the shelf.
 *
 * The honest alternative to restocking: a product nobody is going to make
 * again should stop being listed rather than sit at zero forever.
 */
export function DelistButton({ productId }: { productId: string }) {
  return (
    <ActionButton action={() => toggleProductActive(productId)} variant="quiet">
      Delist
    </ActionButton>
  );
}

/**
 * Open or close a shop from the stores table.
 *
 * A thin client wrapper: the table is a server component, and a server
 * component cannot hand an inline closure to a client one.
 */
export function StoreToggle({ storeId, isOpen }: { storeId: string; isOpen: boolean }) {
  return (
    <ActionButton action={() => toggleStoreOpen(storeId)} variant="quiet">
      {isOpen ? 'Close' : 'Open'}
    </ActionButton>
  );
}
