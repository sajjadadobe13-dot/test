// Site-wide settings. Override with environment variables at build time:
//   SITE_URL=https://www.example.com BASE_PATH=/ npm run build
export default {
  name: 'DielineForge',
  tagline: 'Free online dieline generator',
  url: (process.env.SITE_URL || 'https://dielineforge.com').replace(/\/$/, ''),
  // Use "/repo-name/" when hosting on a GitHub Pages project site.
  base: process.env.BASE_PATH || '/',
  // Optional contact address shown on the About page (leave empty to hide).
  contactEmail: process.env.CONTACT_EMAIL || '',
  themeColor: '#0b1220',
};
