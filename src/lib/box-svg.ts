import { AXIS_NAMES, BOX_SIDES, dimensionLines, project, sideOnScreen, type BoxSide, type Dims, type View } from '@honeypackers/box-core/box3d';

/**
 * The BoxBook 3D box as an SVG string (no framework), using the same geometry as the app's Box3D.
 * Colours come from CSS classes in styles/brand.css (.bx-face uses --shade for lighting).
 */
export const BOX_W = 360;
export const BOX_H = 290;
const CX = BOX_W / 2;
const CY = BOX_H / 2;
const RADIUS = 96;

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

/**
 * `art`: a picture (URL) per side, wrapped onto that side when it faces the viewer. The picture is mapped with an
 * affine transform from three corners (the projection's perspective is mild) and clipped to the side's outline.
 */
export function boxSvgInner(d: Dims, view: View, showDims = true, art: Partial<Record<BoxSide, string>> = {}): string {
  const pr = project(d, view, RADIUS, CX, CY);
  const out: string[] = [];
  out.push(`<ellipse class="bx-shadow" cx="${CX}" cy="${f1(CY + RADIUS * 0.92)}" rx="${f1(RADIUS * 1.05)}" ry="${f1(RADIUS * 0.17)}"/>`);
  for (const e of pr.edges.filter((x) => x.hidden)) {
    const a = pr.pts[e.a];
    const b = pr.pts[e.b];
    out.push(`<line class="bx-hidden" x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}"/>`);
  }
  const faces = pr.faces.filter((f) => f.visible);
  for (const f of faces) {
    const pts = f.idx.map((i) => `${f1(pr.pts[i].x)},${f1(pr.pts[i].y)}`).join(' ');
    out.push(`<polygon class="bx-face" style="--shade:${f.shade.toFixed(3)}" points="${pts}"/>`);
  }
  for (const side of BOX_SIDES) {
    const href = art[side];
    if (!href) continue;
    const o = sideOnScreen(pr, side);
    if (!o.visible) continue;
    const m = [o.tr.x - o.tl.x, o.tr.y - o.tl.y, o.bl.x - o.tl.x, o.bl.y - o.tl.y, o.tl.x, o.tl.y].map((n) => n.toFixed(2)).join(' ');
    out.push(
      `<clipPath id="bx-clip-${side}"><polygon points="${o.poly.map((p) => `${f1(p.x)},${f1(p.y)}`).join(' ')}"/></clipPath>` +
        `<g clip-path="url(#bx-clip-${side})"><image class="bx-art" href="${esc(href)}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${m})"/></g>`,
    );
  }
  // where the top / bottom flaps meet: join the midpoints of the width-wise sides
  for (const f of faces.filter((x) => x.axis === 1)) {
    const [a, b, c, dd] = f.idx.map((i) => pr.pts[i]);
    out.push(`<line class="bx-seam" x1="${f1((a.x + b.x) / 2)}" y1="${f1((a.y + b.y) / 2)}" x2="${f1((dd.x + c.x) / 2)}" y2="${f1((dd.y + c.y) / 2)}"/>`);
  }
  if (showDims) {
    const values = [d.length, d.height, d.width];
    for (const l of dimensionLines(pr, { x: CX, y: CY }, 15)) {
      if (!l) continue;
      out.push(
        `<g class="bx-dim">` +
          `<line class="ext" x1="${f1(l.p1.x)}" y1="${f1(l.p1.y)}" x2="${f1(l.q1.x)}" y2="${f1(l.q1.y)}"/>` +
          `<line class="ext" x1="${f1(l.p2.x)}" y1="${f1(l.p2.y)}" x2="${f1(l.q2.x)}" y2="${f1(l.q2.y)}"/>` +
          `<line x1="${f1(l.q1.x)}" y1="${f1(l.q1.y)}" x2="${f1(l.q2.x)}" y2="${f1(l.q2.y)}"/>` +
          `<circle cx="${f1(l.q1.x)}" cy="${f1(l.q1.y)}" r="2.2"/><circle cx="${f1(l.q2.x)}" cy="${f1(l.q2.y)}" r="2.2"/>` +
          `<text class="bx-label" x="${f1(l.label.x)}" y="${f1(l.label.y)}" text-anchor="middle" dominant-baseline="central">${AXIS_NAMES[l.axis]} ${esc(fmt(values[l.axis]))}</text>` +
          `</g>`,
      );
    }
  }
  return out.join('');
}

export const boxLabel = (d: Dims) => `3D box ${fmt(d.length)} by ${fmt(d.width)} by ${fmt(d.height)} mm. Drag or use the arrow keys to turn it.`;
