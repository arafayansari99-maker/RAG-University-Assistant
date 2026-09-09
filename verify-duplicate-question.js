const { chromium } = require('playwright');
(async()=>{
  const browser = await chromium.launch({ args: ['--headless'] });
  const page = await browser.newPage();
  page.on('requestfailed', (r) => {
    const fail = r.failure();
    if (fail) {
      console.log('failed_request', r.url(), fail.message);
    }
  });

  await page.goto('http://localhost:5173', { waituntil: 'load', timeout: 5000 });
  await page.getByPlaceholder('Ask about university policies, rules, or courses...').fill('What are the graduation requirements for Computer Science?');
  await page.getByPlaceholder('Ask about university policies, rules, or courses...').press('Enter');
  await page.waitForTimeout(2500);

  const count = await page.$$eval('div.prose.prose-sm', (els) =>
    els.map((e) => e.textContent.trim()).filter((t) => t === 'What are the graduation requirements for Computer Science?').length
  );

  console.log('question_rows_visible', count);
  await browser.close();
})();
