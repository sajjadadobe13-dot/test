// Editorial content for the static pages.

const ic = (d) => `<svg viewBox="0 0 24 24" width="24" height="24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const features = [
  ['Exact, parametric geometry', 'Every panel, flap and tuck is calculated from your dimensions – not a scaled image. Change a value and the whole structure redraws in milliseconds.', ic('M4 20h16M6 16l4-8 4 6 4-10')],
  ['Named spot colours & layers', 'Cut lines use the <em>CutContour</em> spot colour, creases use <em>Crease</em>, each on its own layer with overprint on – the convention RIPs and die-makers expect.', ic('M12 3 3 8l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5')],
  ['Board-thickness compensation', 'Pick SBS paperboard, corrugated flutes or rigid greyboard. Panel sizes are compensated for caliper so a box built from inside dimensions really fits your product.', ic('M4 7h16M4 12h16M4 17h10')],
  ['Bleed and safe zone', 'A true offset bleed outline (3 mm / 0.125 in by default) and per-panel safe zones keep artwork edge-to-edge and text away from folds.', ic('M4 4h16v16H4zM8 8h8v8H8z')],
  ['Private by design', 'Dielines are generated entirely in your browser. Nothing is uploaded, there is no account to create and your dimensions never leave your device.', ic('M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z')],
  ['Production details', 'Glue zones, seal areas, tear notches, zipper tracks, hang holes, euro slots, eyemarks, lock tabs and windows are included where the structure needs them.', ic('M14 4l6 6-10 10H4v-6L14 4Z')],
];

export const formats = [
  ['PDF', 'Layered PDF 1.6 with spot colours, overprint and a trim box. The universal hand-off to printers and prepress.'],
  ['AI', 'PDF-compatible Adobe Illustrator file. Opens directly in Illustrator with the dieline layers intact.'],
  ['SVG', 'Clean, mm-accurate vector with Inkscape-style layers – great for Inkscape, Figma, Affinity, Canva and Cricut.'],
  ['DXF', 'AutoCAD R12 DXF with CUT / CREASE layers for ArtiosCAD, Esko, cutting tables, plotters and laser cutters.'],
  ['EPS', 'Encapsulated PostScript with custom-colour comments for legacy RIP and design workflows.'],
];

export const homeFaq = [
  ['What is a dieline?', 'A dieline is the flat, unfolded outline of a package. It shows where the material is <strong>cut</strong>, where it is <strong>creased</strong> (folded) and where glue goes. Designers place artwork on the dieline, and printers use it to make the cutting die.'],
  ['Is this dieline generator really free?', 'Yes. Every template and every file format is free to use for personal and commercial projects, with no sign-up and no watermark.'],
  ['Which file format should I download?', 'Send <strong>PDF</strong> or <strong>AI</strong> to your printer and use them in Illustrator. Choose <strong>SVG</strong> for Inkscape, Figma, Affinity or Canva, <strong>DXF</strong> for CAD software, cutting tables and laser cutters, and <strong>EPS</strong> for older workflows.'],
  ['Should I enter inside or outside dimensions?', 'For boxes you can choose either. Inside dimensions are measured from your product (recommended), outside dimensions are what shipping carriers and retailers care about. The generator compensates for material thickness in both cases.'],
  ['How much bleed do I need?', 'The industry standard is 3 mm (0.125 in) and that is the default. Some large-format and corrugated printers ask for 5 mm or 0.25 in – you can change bleed under Print settings.'],
  ['Are the dielines print-ready?', 'They follow common printer specifications: vector geometry at 1:1 scale, separate named spot colours for cut and crease lines on their own layers, set to overprint. Every printer has its own spec, so confirm with yours and always approve a physical sample before a production run.'],
  ['Do my designs get uploaded anywhere?', 'No. All geometry is calculated in your browser, so your dimensions and files never leave your device.'],
];

export const categoryIntro = {
  boxes: 'Folding carton and corrugated box dielines: reverse and straight tuck end, seal end cereal boxes, sleeves, mailer boxes (FEFCO 0427 style), RSC shipping boxes (FEFCO 0201), trays, two-piece gift boxes, pillow boxes and gable boxes.',
  envelopes: 'Envelope dielines for invitations, greeting cards and business mail – A7, A2, square, #10, DL and C-series sizes with square, pointed, rounded or wallet flaps and optional address window.',
  pouches: 'Flexible packaging layouts for stand-up pouches (doypacks), flat 3- and 4-side seal sachets, flow wraps, side gusset coffee bags and paper shopping bags – with seals, zipper tracks and tear notches marked.',
  cans: 'Wrap-around label templates for beverage cans, jars, food tins and bottles – circumference, overlap and front centre calculated automatically, including tapered (conical) bottle labels.',
  tubes: 'Print layouts for cosmetic squeeze tubes, paper tubes (cylinder boxes) and lip balm tubes with crimp seals, eyemarks, side seams and lid wraps.',
  containers: 'Arc-shaped coffee cup sleeves, paper cup fans, tapered tub and container labels and bottle neck hangers, unrolled with exact conical geometry.',
  prints: 'Die-cut print products: hang tags, business cards, stickers and labels, presentation folders, table tents, tri-fold brochures, greeting cards and door hangers.',
};

export function templateFaq(t, { fmtLen, MATERIALS, usesCaliper }) {
  const dims = t.params.filter((p) => p.type === 'length' && !p.group);
  const measure = dims.map((p) => `<strong>${p.label}</strong>${p.help ? ` (${p.help.replace(/\.$/, '').toLowerCase()})` : ''}`).join(', ');
  const faqs = [
    [`How do I measure for a ${t.name.toLowerCase()}?`, `Enter ${measure}. Use a ruler or calipers on your actual product${t.dimMode ? ' and add a little clearance (1–2 mm) for an easy fit when you use inside dimensions' : ''}.`],
    [`What file format should I send to my printer?`, 'Most printers prefer the layered <strong>PDF</strong> or the <strong>AI</strong> file. Keep the dieline on its own layer above your artwork; the cut and crease lines are already set as overprinting spot colours. Use DXF if your printer or die-maker works in CAD.'],
  ];
  if (usesCaliper(t)) {
    faqs.push([
      'Does the template account for material thickness?',
      `Yes. Choose your ${MATERIALS[t.material].label.toLowerCase()} caliper (default ${fmtLen(MATERIALS[t.material].default, 'mm')}) and panel sizes are compensated automatically. For a very thick or unusual board, enter a custom caliper.`,
    ]);
  }
  if (t.category === 'pouches') faqs.push(['Why are the seals marked?', 'Heat-seal areas are crushed during sealing and partly hidden, so keep text, barcodes and logos out of the yellow seal zones and inside the safe area.']);
  if (['cans', 'tubes', 'containers'].includes(t.category)) faqs.push(['How is the label width calculated?', 'Width is the circumference (π × diameter) plus the overlap. For tapered containers the label is unrolled as a cone section using the top diameter, bottom diameter and height, so it sits flat without wrinkles.']);
  faqs.push(['Can I use this dieline commercially?', 'Yes – the generated files are yours to use for any personal or commercial project, free of charge.']);
  return faqs;
}

export function guide({ u, TEMPLATES, LAYERS }) {
  const link = (id, text) => `<a href="${u(`dieline/${id}/`)}">${text}</a>`;
  return `
<section class="page-head">
  <div class="container narrow">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${u()}">Home</a><span>/</span><span aria-current="page">Dieline guide</span></nav>
    <h1>What is a dieline? The complete guide</h1>
    <p class="lede">How packaging dielines work, what every line colour means, and how to prepare files your printer will love.</p>
  </div>
</section>
<section class="section tight">
  <div class="container narrow prose guide">
    <nav class="toc" aria-label="Contents"><strong>Contents</strong><ol>
      <li><a href="#what">What is a dieline?</a></li><li><a href="#lines">Line types and colours</a></li><li><a href="#bleed">Bleed and safe zone</a></li>
      <li><a href="#dims">Inside vs outside dimensions</a></li><li><a href="#material">Material and caliper</a></li><li><a href="#styles">Standard structural styles</a></li>
      <li><a href="#formats">File formats</a></li><li><a href="#workflow">Designing on a dieline</a></li><li><a href="#checklist">Pre-press checklist</a></li></ol></nav>

    <h2 id="what">What is a dieline?</h2>
    <p>A <strong>dieline</strong> (also written <em>die line</em> or <em>die-cut line</em>) is the flat template of a package before it is folded. It defines the exact shape that a steel-rule cutting die – or a digital cutting table – will cut, the creases where the board will fold, and the areas that receive glue. Packaging designers lay their artwork over the dieline; printers use the same file to make the die and to position artwork on the press sheet.</p>
    <p>Because the dieline controls how the package goes together, a small error can ruin an entire run: panels that are too small, flaps that collide, or artwork that wraps around the wrong edge. That is why dielines should always be generated from accurate dimensions – exactly what ${link('reverse-tuck-end-box', 'our parametric templates')} do.</p>

    <h2 id="lines">Line types and colours</h2>
    <p>There is no single global standard, but printers and die-makers widely agree on these conventions, and DielineForge uses them in every export:</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Line</th><th scope="col">Meaning</th><th scope="col">How it is exported</th></tr></thead>
      <tbody>
        <tr><th scope="row"><span class="sw sw-cut"></span>Cut</th><td>The knife line – the material is cut through.</td><td>Solid line, spot colour <code>CutContour</code> (100% magenta alternate), overprint.</td></tr>
        <tr><th scope="row"><span class="sw sw-crease"></span>Crease / score</th><td>A fold line pressed into the board.</td><td>Dashed line, spot colour <code>Crease</code> (100% cyan alternate), overprint.</td></tr>
        <tr><th scope="row"><span class="sw sw-perf"></span>Perforation</th><td>Tear line (e.g. tear notches, tear strips).</td><td>Dotted line, spot colour <code>Perforation</code>.</td></tr>
        <tr><th scope="row"><span class="sw sw-bleed"></span>Bleed</th><td>How far artwork must extend past the cut.</td><td>Thin green line, non-printing <code>Bleed</code> layer.</td></tr>
        <tr><th scope="row"><span class="sw sw-safe"></span>Safe zone</th><td>Keep important text and logos inside.</td><td>Dashed orange line, non-printing <code>Safe Zone</code> layer.</td></tr>
        <tr><th scope="row"><span class="sw sw-glue"></span>Glue &amp; seal</th><td>Glue flaps, heat-seal areas – keep ink-free where required.</td><td>Tinted area on the <code>Glue</code> layer.</td></tr>
      </tbody></table></div>
    <p>Each element lives on its <strong>own layer</strong> and uses a <strong>named spot colour</strong> rather than a process colour. Spot colours let the RIP isolate the die lines (so they are never printed by accident) and overprint ensures they never knock a white hole into your artwork. Stroke weights are hairlines (0.25–1 pt); you can choose the weight before downloading.</p>

    <h2 id="bleed">Bleed and safe zone</h2>
    <p><strong>Bleed</strong> is extra artwork that extends beyond the cut line, so that tiny variations in cutting never leave a white sliver at the edge. The usual figure is <strong>3 mm (0.125 in)</strong>; some large-format and corrugated printers request 5 mm or 0.25 in. Backgrounds and images should always reach the bleed line.</p>
    <p>The <strong>safe zone</strong> is the inner margin – typically 3 mm from cuts and folds – inside which you keep text, barcodes and logos. Artwork outside the safe zone may be trimmed, hidden under a flap or distorted by a fold.</p>

    <h2 id="dims">Inside vs outside dimensions</h2>
    <p>Box sizes are written <strong>Length × Width × Depth</strong> (L × W × D). Length is the larger dimension of the opening, width the smaller one, and depth the height perpendicular to the opening. <em>Inside dimensions</em> are measured from the product and are what you need for a good fit; <em>outside dimensions</em> matter for shipping and shelf space. Our generator lets you enter either and compensates for board thickness.</p>

    <h2 id="material">Material and caliper</h2>
    <p>Every fold consumes a little material, so a dieline drawn without considering <strong>caliper</strong> (board thickness) produces a box that is too small inside. Typical calipers:</p>
    <ul>
      <li><strong>Folding cartons</strong> – SBS / FBB / CUK paperboard 0.3–0.6 mm (12–24 pt).</li>
      <li><strong>Corrugated</strong> – F-flute 0.8 mm, E-flute 1.5 mm, B-flute 3 mm, C-flute 4 mm, double-wall 4.5–6.5 mm.</li>
      <li><strong>Rigid boxes</strong> – greyboard 1–2.5 mm wrapped in printed paper.</li>
      <li><strong>Flexible packaging</strong> – laminated films where thickness is negligible for layout, but seal widths matter.</li>
    </ul>

    <h2 id="styles">Standard structural styles</h2>
    <p>The packaging industry catalogues common structures so that buyers, designers and converters speak the same language. The <strong>ECMA</strong> code (European Carton Makers Association) covers folding cartons, and the <strong>FEFCO</strong> code (European Federation of Corrugated Board Manufacturers) covers corrugated boxes. Popular styles include:</p>
    <ul>
      <li>${link('reverse-tuck-end-box', 'Reverse tuck end')} and ${link('straight-tuck-end-box', 'straight tuck end')} cartons – the workhorses of retail packaging.</li>
      <li>${link('seal-end-carton', 'Seal end cartons')} – glued closures for cereal, dry food and frozen products.</li>
      <li>${link('shipping-box-rsc', 'Regular slotted container (FEFCO 0201)')} – the standard shipping box.</li>
      <li>${link('mailer-box', 'Roll end tuck front mailer (FEFCO 0427 style)')} – the e-commerce and subscription box.</li>
      <li>${link('stand-up-pouch', 'Stand-up pouches')}, ${link('flow-wrap', 'flow wraps')} and ${link('side-gusset-bag', 'side gusset bags')} for flexible packaging.</li>
    </ul>

    <h2 id="formats">File formats explained</h2>
    <ul>
      <li><strong>PDF</strong> – the standard final format for print. Our PDFs contain optional-content layers, spot colours, overprint and a trim box.</li>
      <li><strong>AI</strong> – Adobe Illustrator opens our PDF-compatible .ai file directly with its layers.</li>
      <li><strong>SVG</strong> – web-native vector in millimetres; ideal for Inkscape, Figma, Affinity, Canva and craft cutters.</li>
      <li><strong>DXF</strong> – CAD exchange format (AutoCAD R12) for ArtiosCAD, Esko, Kongsberg / Zünd cutting tables, plotters and laser cutters.</li>
      <li><strong>EPS</strong> – PostScript for legacy design and RIP workflows.</li>
    </ul>

    <h2 id="workflow">Designing on a dieline</h2>
    <ol>
      <li>Open the PDF or AI file and <strong>lock the dieline layers</strong>.</li>
      <li>Create artwork layers below the dieline. Extend backgrounds to the bleed line.</li>
      <li>Use the panel labels to orient artwork – some panels (top closures, bottom flaps, back panels of folded pouches) are upside down in the flat.</li>
      <li>Keep text inside the safe zone and away from glue areas and seals.</li>
      <li>Leave the dieline layer in the file you send to the printer – do not merge it into the artwork.</li>
    </ol>

    <h2 id="checklist">Pre-press checklist</h2>
    <ul class="checklist">
      <li>Dimensions confirmed against the real product (or a prototype).</li>
      <li>Correct material and caliper selected.</li>
      <li>Bleed matches the printer’s spec (3 mm / 0.125 in or more).</li>
      <li>All text at least 3 mm inside folds and cuts.</li>
      <li>Dieline on its own layer, spot colours named as the printer requires, set to overprint.</li>
      <li>No artwork on glue flaps where the glue must bond board to board.</li>
      <li>Barcodes placed on flat panels, away from folds and curves.</li>
      <li>A white or digital sample folded and approved before the production run.</li>
    </ul>
    <p class="cta-inline"><a class="btn btn-primary" href="${u('templates/')}">Create a dieline now</a></p>
  </div>
</section>`;
}

export function about({ u, config, count }) {
  return `
<section class="page-head"><div class="container narrow"><h1>About ${config.name}</h1><p class="lede">A fast, free and private dieline generator built for packaging designers, printers, makers and brands.</p></div></section>
<section class="section tight"><div class="container narrow prose">
  <p>${config.name} turns dimensions into accurate packaging dielines. Instead of hunting for a template that is almost the right size and stretching it, you choose a structure, type your exact dimensions and download a clean vector file in seconds.</p>
  <h2>What makes it different</h2>
  <ul>
    <li><strong>${count} parametric templates</strong> across boxes, envelopes, pouches, cans, tubes, containers and print products.</li>
    <li><strong>Printer-friendly output</strong>: named spot colours, separate layers, overprint, bleed and safe zones.</li>
    <li><strong>Five formats</strong>: PDF, AI, SVG, DXF and EPS.</li>
    <li><strong>Runs locally</strong> in your browser – nothing to install, nothing uploaded.</li>
  </ul>
  <h2>A note on production</h2>
  <p>Our templates follow widely used structural conventions, but every material, machine and printer is different. Treat any dieline as a starting point: confirm specifications with your converter and approve a physical sample before ordering a production run.</p>
  ${config.contactEmail ? `<h2>Contact</h2><p>Questions, template requests or feedback: <a href="mailto:${config.contactEmail}">${config.contactEmail}</a></p>` : ''}
  <p><a class="btn btn-primary" href="${u('templates/')}">Browse templates</a></p>
</div></section>`;
}

export function privacy({ config, today }) {
  return `
<section class="page-head"><div class="container narrow"><h1>Privacy policy</h1><p class="muted">Last updated ${today}</p></div></section>
<section class="section tight"><div class="container narrow prose">
  <p>${config.name} is designed to work without collecting personal data.</p>
  <h2>Dielines are generated on your device</h2>
  <p>All dimensions you enter and all files you download are generated locally in your web browser. They are not sent to or stored on our servers.</p>
  <h2>Local storage</h2>
  <p>We remember a few preferences (such as your preferred unit and bleed) in your browser’s local storage so the tool opens the way you like it. You can clear this at any time in your browser settings.</p>
  <h2>Hosting and analytics</h2>
  <p>Like any website, our hosting provider may process standard server logs (such as IP address and browser type) to deliver and secure the site. If privacy-friendly, aggregate analytics are enabled, they record page views and anonymous events such as “file downloaded” without cookies or personal profiles.</p>
  <h2>Third-party resources</h2>
  <p>Web fonts are loaded from Google Fonts. Google may receive your IP address when fonts are requested.</p>
  <h2>Changes</h2>
  <p>If this policy changes we will update this page and the date above.</p>
</div></section>`;
}

export function terms({ config, today }) {
  return `
<section class="page-head"><div class="container narrow"><h1>Terms of use</h1><p class="muted">Last updated ${today}</p></div></section>
<section class="section tight"><div class="container narrow prose">
  <h2>Use of the service</h2>
  <p>${config.name} is provided free of charge. You may use the generated dielines for personal and commercial projects. You may not resell the tool itself or misrepresent it as your own product.</p>
  <h2>No warranty</h2>
  <p>The service and generated files are provided “as is”, without warranty of any kind. Dielines are generated from the values you enter; you are responsible for checking dimensions, material suitability and printer requirements, and for approving physical samples before production.</p>
  <h2>Limitation of liability</h2>
  <p>To the maximum extent permitted by law, ${config.name} is not liable for any loss arising from the use of generated files, including misprints, wasted materials or production delays.</p>
  <h2>Changes</h2>
  <p>We may update the service and these terms at any time. Continued use means you accept the current terms.</p>
</div></section>`;
}
