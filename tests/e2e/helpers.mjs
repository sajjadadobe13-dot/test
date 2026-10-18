import { expect } from '@playwright/test';

/** Fail the test on any console error or uncaught exception. */
export function watchErrors(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => !/fonts\.(googleapis|gstatic)/.test(r.url()) && errors.push(`request failed: ${r.url()}`));
  return { assertClean: () => expect(errors, errors.join('\n')).toEqual([]) };
}

export async function noHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
