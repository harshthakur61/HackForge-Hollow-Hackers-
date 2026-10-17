import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const artifactDir = '/Users/harsh_thakur/.gemini/antigravity-ide/brain/cbd6aa9c-2467-4c6a-b081-0d0a979ab266';
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

async function run() {
  console.log('Launching Chrome browser...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1050']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050 });

  const consoleLogs = [];
  page.on('console', msg => {
    const text = `[${msg.type().toUpperCase()}] ${msg.text()}`;
    consoleLogs.push(text);
    console.log('BROWSER_LOG:', text);
  });

  page.on('pageerror', err => {
    const text = `[PAGE_ERROR] ${err.toString()}`;
    consoleLogs.push(text);
    console.error('BROWSER_ERROR:', text);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // Reset replay to start cleanly at beginning
  console.log('Resetting replay to ensure clean initial state...');
  await page.click('#reset-replay-btn');
  await new Promise(r => setTimeout(r, 1000));

  // 1. Idle Screenshot
  const idlePath = path.join(artifactDir, '01_idle_dashboard.png');
  await page.screenshot({ path: idlePath, fullPage: true });
  console.log('Captured (1) idle screenshot at:', idlePath);

  // Set speed to 20x
  console.log('Selecting 20x speed...');
  await page.click('#speed-20x-btn');
  await new Promise(r => setTimeout(r, 400));

  // Start Replay
  console.log('Clicking Start Replay...');
  const btnText = await page.evaluate(() => document.querySelector('#start-replay-btn')?.textContent);
  if (btnText && !btnText.includes('Pause')) {
    await page.click('#start-replay-btn');
  }

  // 2. Wait for 17:00 decision
  console.log('Waiting for 17:00 decision to be reflected in UI...');
  await page.waitForFunction(() => {
    const sweep = document.querySelector('#sweep-balance-card');
    const sweepText = sweep?.textContent || '';
    return sweepText.includes('$') && !sweepText.includes('—');
  }, { timeout: 20000 });

  await new Promise(r => setTimeout(r, 500));
  const decisionPath = path.join(artifactDir, '02_decision_1700.png');
  await page.screenshot({ path: decisionPath, fullPage: true });
  console.log('Captured (2) just after 17:00 decision screenshot at:', decisionPath);

  // 3. Mid-night or repo break
  console.log('Streaming night ticks at 20x (50ms/tick). Waiting for mid-night or repo break...');
  const startMid = Date.now();
  let reachedMidnight = false;
  while (Date.now() - startMid < 20000) {
    const info = await page.evaluate(() => {
      const clock = document.querySelector('#simulated-clock')?.textContent || '';
      const feed = document.querySelector('body')?.innerText || '';
      return {
        clock,
        hasBreak: feed.includes('Repo Break') || feed.includes('repo_break') || feed.includes('Early redemption')
      };
    });

    if (info.hasBreak) {
      console.log('Repo break event detected in feed:', info.clock);
      reachedMidnight = true;
      break;
    }

    if (info.clock.includes('23:00') || info.clock.includes('00:00') || info.clock.includes('01:00') || info.clock.includes('02:00')) {
      console.log('Mid-night hour reached:', info.clock);
      reachedMidnight = true;
      break;
    }

    await new Promise(r => setTimeout(r, 100));
  }

  await new Promise(r => setTimeout(r, 500));
  const midNightPath = path.join(artifactDir, '03_midnight_repo_break.png');
  await page.screenshot({ path: midNightPath, fullPage: true });
  console.log('Captured (3) mid-night screenshot at:', midNightPath);

  // 4. Several settlements
  console.log('Waiting for several settlements to occur (watching simulation time advance)...');
  await page.waitForFunction(() => {
    const clock = document.querySelector('#simulated-clock')?.textContent || '';
    // Let simulation advance past 2026-03-01 so 3+ nights have settled
    return clock.includes('2026-03-02') || clock.includes('2026-03-03') || clock.includes('2026-03-04');
  }, { timeout: 45000 });

  await new Promise(r => setTimeout(r, 1000));
  const settlementsPath = path.join(artifactDir, '04_multiple_settlements.png');
  await page.screenshot({ path: settlementsPath, fullPage: true });
  console.log('Captured (4) after several settlements screenshot at:', settlementsPath);

  await browser.close();

  // Save console logs
  const logReportPath = path.join(artifactDir, 'browser_console_logs.json');
  fs.writeFileSync(logReportPath, JSON.stringify(consoleLogs, null, 2));

  // Check if any errors or warnings exist in consoleLogs
  const errors = consoleLogs.filter(l => l.startsWith('[ERROR]') || l.startsWith('[PAGE_ERROR]'));
  const warnings = consoleLogs.filter(l => l.startsWith('[WARN]') || l.startsWith('[WARNING]'));
  console.log('--- BROWSER VERIFICATION SUMMARY ---');
  console.log('Total console entries:', consoleLogs.length);
  console.log('Errors count:', errors.length);
  console.log('Warnings count:', warnings.length);
  if (errors.length > 0) {
    console.error('Console Errors:', errors);
  }
  if (warnings.length > 0) {
    console.warn('Console Warnings:', warnings);
  }
}

run().catch(err => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
