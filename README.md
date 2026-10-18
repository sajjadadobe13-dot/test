# DielineForge – free online dieline generator

A fast, free, privacy-friendly website that turns dimensions into production-ready packaging dielines. Users pick a structure (box, envelope, pouch, can, tube, container or print product), enter their size, and download a layered vector file as **PDF, AI, SVG, DXF or EPS**.

Everything runs in the browser: there is no backend, no account, and no data leaves the user's device. The site is a static build that can be hosted on Netlify, Vercel, Cloudflare Pages, GitHub Pages or any static host.

## Highlights

- **35 parametric templates** in 7 categories (list below). Every panel and flap is calculated from the inputs; nothing is a scaled image.
- **Printer conventions built in**:
  - Each die element is a separate **named spot colour** (`CutContour` 100 M, `Crease` 100 C, `Perforation`, `Bleed`, `Safe Zone`, `Glue`) on its own layer, set to overprint.
  - Real PDF layers (OCGs), a TrimBox, and hairline strokes you can set to 0.25, 0.5 or 1 pt.
- **True offset bleed** (3 mm / 0.125 in by default) and per-panel **safe zones**.
- **Board-thickness compensation** for SBS paperboard, corrugated flutes (F/E/B/C/EB/BC) and rigid greyboard, with inside or outside dimensions.
- **Production details**: glue zones, Doyen-bottom seals, zipper tracks, tear notches, euro-slot hang holes, mailer lock tabs and slots, windows, eyemarks, degassing-valve marks, SOS bag creases, business-card slits and more.
- Live zoomable 2D preview, a CSS 3D preview for boxes and cylinders, size presets, mm / cm / in, layer toggles (hidden layers are also left out of downloads), shareable URLs, and stats: flat size, knife length, crease length and the smallest standard sheet it fits on.
- **SEO-ready static site**: one pre-rendered landing page per template, plus category pages, a long-form dieline guide, JSON-LD (WebApplication, BreadcrumbList, FAQPage, ItemList, Article), Open Graph images, sitemap, robots.txt and a web manifest.
- **Accessible and responsive**: WCAG 2.1 AA checked with axe, keyboard support, dark mode, and a mobile layout with a sticky download bar.

### Templates

| Category | Templates |
| --- | --- |
| **Boxes & Cartons** | Reverse Tuck End Box, Straight Tuck End Box (both with optional hang tab / euro slot and window), Seal End Carton (Cereal Box), Box Sleeve / Wrap, Mailer Box (FEFCO 0427 style), Shipping Box – RSC (FEFCO 0201 / HSC 0200), Tray with Glued Corners, Two-Piece Box (Lid & Base), Pillow Box, Gable Box with Handle |
| **Envelopes** | Invitation Envelope (A-style / square / C-series; square, pointed, rounded or wallet flap), Business Envelope (#10, DL, C5, with optional address window) |
| **Pouches & Bags** | Stand-Up Pouch (Doypack), Flat Pouch (3- / 4-side seal), Flow Wrap / Pillow Pack, Side Gusset Bag (Coffee Bag), Paper Shopping Bag (SOS bottom) |
| **Cans & Bottles** | Beverage Can Wrap Label, Jar & Food Tin Label, Bottle Label (straight or tapered) |
| **Tubes** | Cosmetic Squeeze Tube, Paper Tube / Cylinder Box Wrap, Lip Balm Tube Label |
| **Containers & Cups** | Coffee Cup Sleeve, Paper Cup Wrap (Cup Fan), Tapered Tub & Container Label, Bottle Neck Hanger |
| **Other Prints** | Hang Tag, Business Card, Sticker & Label, Presentation Folder, Table Tent, Tri-Fold Brochure (fold-in compensation), Folded Greeting Card, Door Hanger |

### File formats

| Format | Details |
| --- | --- |
| PDF | PDF 1.6, written from scratch. Separation spot colours with CMYK alternates, overprint ExtGState, optional-content layers, TrimBox, and Helvetica annotations. |
| AI | The same bytes as the PDF, saved with the `.ai` extension (PDF-compatible Illustrator file). Illustrator opens it with its layers. |
| SVG | Millimetre-accurate (`width="…mm"`), with Inkscape/Illustrator-compatible layer groups. |
| DXF | AutoCAD R12 ASCII with `CUT`, `CREASE`, `PERFORATION`, `BLEED`, `SAFE_ZONE`, `GLUE`, `GUIDES` and `ANNOTATION` layers, DASHED/DOT line types, and ACI colours. Units are mm with the y axis up. |
| EPS | EPSF-3.0 Level 2 with `%%CMYKCustomColor` comments and Separation colour spaces, set to overprint. |

> Dielines follow widely used structural conventions, but every material, machine and printer differs. Always confirm specs with the printer and approve a physical sample before a production run. The site says this to users too.

## Getting started

Requirements: Node.js 20+ (22 recommended).

```bash
npm install
npm run dev        # builds to dist/ and serves it at http://localhost:8080
npm run build      # production build → dist/
```

Configure the public URL used for canonical links, the sitemap and Open Graph tags:

```bash
SITE_URL=https://www.your-domain.com npm run build
# GitHub Pages project site (served from a sub-path):
SITE_URL=https://user.github.io BASE_PATH=/repo-name/ npm run build
```

Other settings (site name, theme colour, optional contact e-mail) live in `site.config.mjs`.

### Deploying

- **Netlify**: `netlify.toml` is included (build `npm run build`, publish `dist`). Security and cache headers come from `src/static/_headers`.
- **Vercel**: `vercel.json` is included.
- **Cloudflare Pages**: build command `npm run build`, output `dist`. `_headers` is honoured.
- **GitHub Pages**: `.github/workflows/ci.yml` runs the tests and deploys `dist/` on pushes to `main`. Enable *Settings → Pages → GitHub Actions* and set the `SITE_URL` (and, for project sites, `BASE_PATH`) repository variables.

After the first deploy, submit `https://your-domain/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

### Analytics (optional)

The app pushes events (`dieline_download`, `preset_select`, `view_3d`, `share`) to `window.dataLayer` and calls `window.plausible` when present. Add your analytics snippet to the `head()` function in `scripts/build.mjs`, and extend the CSP in `_headers` / `vercel.json` to match.

To regenerate the social preview images and app icons after changing templates or branding:

```bash
node scripts/images.mjs   # uses Playwright + Chromium; output is committed in src/assets/og and src/assets/img
```

## Project structure

```
src/assets/js/core/geometry.js        geometry engine: flap profiles, fillets, arcs, Clipper union/offset, resolve()
src/assets/js/core/templates/*.js     template definitions (params, presets, SEO copy, build())
src/assets/js/core/registry.js        template registry, materials, generate()
src/assets/js/core/export/            compose (sheet + title block), svg, pdf (AI), dxf, eps writers
src/assets/js/app/editor.js           editor UI: form, preview, zoom/pan, URL state, downloads
src/assets/js/app/preview3d.js        CSS 3D preview
src/assets/css/styles.css             all styles (light/dark, responsive)
scripts/build.mjs                     static site generator (esbuild bundle + pre-rendered pages)
scripts/content.mjs                   editorial copy: home FAQ, guide, legal pages
tests/unit/                           geometry, templates (incl. fuzzing) and exporter validation
tests/e2e/                            Playwright: pages, editor, downloads, SEO, a11y, CSP, mobile
```

### How the geometry works

A template's `build(params)` returns a `Dieline` made of solid **pieces** (panels and flaps, usually attached to an edge with `d.flap(p1, p2, profile)`). These are welded together with Clipper into the knife outline. Explicit creases, cuts, holes, perforations, guides, glue areas, labelled panels and dimension callouts are added alongside. `resolve()` then:

1. computes the outline (union, minus any notches);
2. offsets it to get the bleed;
3. insets each panel to get its safe zone.

Every exporter renders the same composed sheet, so all five formats always match.

### Adding a template

1. Write a `build(p)` function in one of the files in `src/assets/js/core/templates/` (or a new file registered in `registry.js`). Lengths are in mm, with y pointing down.
2. Describe its `params` (`length` | `number` | `bool` | `select`, with `min`/`max`, optional `auto`, `group`, `showIf`, `help`), plus `presets`, `material`, `keywords` and `description`.
3. Run `npm run test:unit`. The suite automatically builds every preset and option, fuzzes random dimensions, and validates the exports.
4. Run `npm run build`. The new landing page, thumbnail, gallery card and sitemap entry are generated automatically.

## Testing

```bash
npm run test:unit   # node:test – geometry, all templates × presets × options × materials, fuzzing, exporter validation
npm run test:e2e    # builds, then Playwright (desktop + mobile) – every editor page, downloads, SEO, axe a11y, CSP
npm test            # both
```

When the tools are installed, the unit suite also validates PDFs with `pdfinfo`/`pdftotext` (poppler), DXFs with Python `ezdxf` (audit must report 0 errors), and SVGs with `xmllint`.

## License

MIT
