// POST /.netlify/functions/checkout-cart — see netlify/lib/shop.ts (checkoutCart).
import { shop } from '../lib/shop-instance';

export default (req: Request) => shop.checkoutCart(req);
