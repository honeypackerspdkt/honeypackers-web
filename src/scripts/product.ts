import { catalog, priceList } from '../lib/catalog';
import { addPacks } from '../lib/add-to-cart';
import { addToCart, readCart, writeCart } from '../lib/products';
import { initProductPage, productPageHtml } from '../lib/product-page';

/** Product page in the browser: loads the live product by slug, renders and wires it. */
export async function initProduct(root: HTMLElement, slug: string) {
  const { products, source } = await catalog();
  const p = products.find((x) => x.slug === slug || x.id === slug);
  if (!p) {
    root.innerHTML = `<div class="card" style="margin-top:24px"><h1 style="font-size:1.4rem">This box is not sold online right now</h1><p><a href="/shop/">See all boxes</a> or <a href="/custom-box/">price any size</a>.</p></div>`;
    return;
  }
  root.innerHTML = productPageHtml(p);
  document.title = `${p.name} | ${document.title.split(' | ').pop()}`;
  root.querySelector('[data-sample-note]')?.remove();
  if (source === 'sample') root.insertAdjacentHTML('afterbegin', '<p class="notice" style="margin-top:16px">These are <strong>sample products and prices</strong> while our shop is being set up.</p>');
  initProductPage(root, p, {
    zones: async () => ({ zones: (await priceList()).shop.zones, ready: true }),
    add: (id, packQty, count, thenCheckout) => {
      if (thenCheckout) {
        writeCart(addToCart(readCart(), { productId: id, packQty, count }));
        location.href = '/checkout/';
      } else addPacks(id, packQty, count);
    },
  });
}
