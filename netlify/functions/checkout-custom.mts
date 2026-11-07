// POST /.netlify/functions/checkout-custom — see netlify/lib/shop.ts (checkoutCustom).
import { shop } from '../lib/shop-instance';

export default (req: Request) => shop.checkoutCustom(req);
