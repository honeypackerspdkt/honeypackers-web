import type { BoxSide, Dims, View } from '@honeypackers/box-core/box3d';

/**
 * The live 3D carton behind a draggable box picture (product page, custom box). three.js loads in the background;
 * until then (or without WebGL) the drawn SVG box shows. Once `on`, the SVG should draw only the size lines
 * (boxSvgInner(..., bare = true)) and every redraw passes the same dims / view / artwork to `set`.
 */
export interface LiveHandle {
  on: boolean;
  set(d: Dims, view: View, art?: Partial<Record<BoxSide, string>>): void;
}

export function liveCarton(svg: SVGSVGElement, redraw: () => void): LiveHandle {
  const h: LiveHandle = { on: false, set: () => {} };
  import('./carton3d')
    .then((m) => {
      const live = m.mountLive(svg);
      if (!live) return;
      h.set = live.set;
      h.on = true;
      redraw();
    })
    .catch((e) => console.warn('[carton] keeping the drawn box', e));
  return h;
}
