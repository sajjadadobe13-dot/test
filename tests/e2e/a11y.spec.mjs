import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const url of ['/', '/templates/', '/guide/', '/dieline/reverse-tuck-end-box/', '/dieline/stand-up-pouch/', '/about/']) {
  test(`accessibility: ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
  });
}
