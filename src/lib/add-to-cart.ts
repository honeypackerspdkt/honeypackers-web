import { addToCart, readCart, writeCart } from './products';

/** Adds packs to the cart and opens the mini cart. */
export function addPacks(productId: string, packQty: number, count = 1) {
  writeCart(addToCart(readCart(), { productId, packQty, count: Math.max(1, Math.min(1000, Math.floor(count))) }));
  window.dispatchEvent(new CustomEvent('open-cart'));
}

/** "Add" buttons on product tiles inside `container` (works for tiles re-rendered later). */
export function wireTiles(container: HTMLElement) {
  container.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-add]');
    if (!btn || btn.disabled) return;
    const tile = btn.closest<HTMLElement>('[data-product]')!;
    const qty = Number(tile.querySelector<HTMLSelectElement>('[data-pack]')?.value);
    addPacks(tile.dataset.product!, qty);
  });
}
