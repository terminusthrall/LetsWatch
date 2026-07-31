import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { cleanupTestKeys } from '../src/modules/redis';

test.describe.configure({ mode: 'serial' });

const POLL_TIMEOUT = 30_000;

/**
 * Search the TMDB search box and add the exact-title result.
 * `context` controls the confirmation: the create form moves the item into a
 * "Selected" list, while the lobby flips the row's button to "Added".
 */
async function addMovieToPool(
  page: Page,
  query: string,
  exactTitle: string,
  context: 'create' | 'lobby'
) {
  const searchInput = page.getByPlaceholder(/Search titles/);
  await searchInput.fill(query);

  const resultRow = page
    .locator('div.flex.items-center.gap-3')
    .filter({ has: page.getByText(exactTitle, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Add', exact: true }) })
    .first();

  await expect(resultRow).toBeVisible({ timeout: POLL_TIMEOUT });

  if (context === 'create') {
    await resultRow.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/^Selected \(\d+\)$/)).toBeVisible({
      timeout: POLL_TIMEOUT,
    });
  } else {
    const addResponse = page.waitForResponse(
      (res) => res.url().includes('/media') && res.request().method() === 'POST'
    );
    await resultRow.getByRole('button', { name: 'Add', exact: true }).click();
    const response = await addResponse;
    expect(response.ok()).toBe(true);
  }

  // Clear the search so stale results don't cover the pool list.
  await searchInput.fill('');
}

/**
 * Swipe through the entire deck: LIKE the card titled `likeTitle`, PASS
 * everything else. Returns once the deck is empty or the results view shows.
 */
async function swipeThroughDeck(
  page: Page,
  likeTitle: string,
  options?: { expectMatchToast?: boolean }
) {
  const currentCardTitle = page.locator('div.z-10 h2');
  const deckDone = page
    .getByText(/swiped through the deck/)
    .or(page.getByText('Winner', { exact: true }));

  for (let i = 0; i < 25; i++) {
    await expect(currentCardTitle.or(deckDone).first()).toBeVisible({
      timeout: POLL_TIMEOUT,
    });

    if (await deckDone.first().isVisible()) return;

    const title = (await currentCardTitle.innerText()).trim();
    const isLike = title === likeTitle;

    const swipeResponse = page.waitForResponse(
      (res) => res.url().includes('/swipe') && res.request().method() === 'POST'
    );
    await page
      .getByRole('button', { name: isLike ? 'Like' : 'Pass', exact: true })
      .click();
    const response = await swipeResponse;
    expect(response.ok()).toBe(true);

    if (isLike && options?.expectMatchToast) {
      const body = (await response.json()) as { matchFound?: boolean };
      expect(body.matchFound).toBe(true);
      await expect(page.getByText("It's a match!")).toBeVisible({
        timeout: POLL_TIMEOUT,
      });
    }
  }

  await expect(deckDone.first()).toBeVisible({ timeout: POLL_TIMEOUT });
}

interface ThreeUserSession {
  sessionId: string;
  host: Page;
  guestA: Page;
  guestB: Page;
  contexts: BrowserContext[];
}

/**
 * Create a session as the host (seeded with Interstellar), join two guests
 * via the scraped join code, have each guest add a title to the pool
 * (Inception, The Matrix), and have the host start swiping. Leaves all three
 * pages parked on the SWIPING_ACTIVE deck, ready to swipe.
 */
async function setupThreeUserSession(browser: Browser): Promise<ThreeUserSession> {
  const hostContext = await browser.newContext();
  const guestAContext = await browser.newContext();
  const guestBContext = await browser.newContext();

  const host = await hostContext.newPage();
  const guestA = await guestAContext.newPage();
  const guestB = await guestBContext.newPage();

  // --- Actor 1 (Host): create a session with a custom pool ---
  await host.goto('/');
  await host.fill('#displayName', 'E2E Host');
  await host.fill('#title', 'E2E Movie Night');
  await host.getByRole('button', { name: 'Custom Search List' }).click();
  await addMovieToPool(host, 'Interstellar', 'Interstellar', 'create');
  await host.getByRole('button', { name: 'Create Watch Session' }).click();
  await host.waitForURL(/\/session\/.+/);

  const sessionId = new URL(host.url()).pathname.split('/session/')[1];
  expect(sessionId).toBeTruthy();

  // --- State capture: scrape the 6-character join code from the Lobby ---
  const joinCodeLocator = host.locator('span.font-mono', {
    hasText: /^[A-Z0-9]{6}$/,
  });
  await expect(joinCodeLocator).toBeVisible({ timeout: POLL_TIMEOUT });
  const joinCode = (await joinCodeLocator.innerText()).trim();
  expect(joinCode).toMatch(/^[A-Z0-9]{6}$/);

  // --- Actors 2 & 3 (Guests): join via the code in separate contexts ---
  for (const [guest, name] of [
    [guestA, 'E2E Guest A'],
    [guestB, 'E2E Guest B'],
  ] as const) {
    await guest.goto('/join');
    await guest.fill('#code', joinCode);
    await guest.fill('#displayName', name);
    await guest.getByRole('button', { name: 'Join Room' }).click();
    await guest.waitForURL(new RegExp(`/session/${sessionId}`));
    await expect(guest.getByText('Waiting Room')).toBeVisible({
      timeout: POLL_TIMEOUT,
    });
  }

  // --- Collaborative lobby: guests add movies to the pool ---
  await addMovieToPool(guestA, 'Inception', 'Inception', 'lobby');
  await addMovieToPool(guestB, 'The Matrix', 'The Matrix', 'lobby');

  // --- Verify: host sees both movies appear in the pool via polling ---
  const hostPool = host.locator('div.flex.items-center.gap-3', {
    hasText: /Inception|The Matrix/,
  });
  await expect(host.getByText('Pool (3)')).toBeVisible({
    timeout: POLL_TIMEOUT,
  });
  await expect(hostPool.filter({ hasText: 'Inception' }).first()).toBeVisible();
  await expect(hostPool.filter({ hasText: 'The Matrix' }).first()).toBeVisible();

  // --- Transition: host starts the session ---
  await host.getByRole('button', { name: 'Start Session' }).click();

  for (const page of [host, guestA, guestB]) {
    await expect(page.getByText('SWIPING ACTIVE')).toBeVisible({
      timeout: POLL_TIMEOUT,
    });
    await expect(
      page.getByRole('button', { name: 'Like', exact: true })
    ).toBeVisible({ timeout: POLL_TIMEOUT });
  }

  return {
    sessionId,
    host,
    guestA,
    guestB,
    contexts: [hostContext, guestAContext, guestBContext],
  };
}

/** Fetch the current session status directly from the API (bypasses UI polling delay). */
async function getSessionStatus(page: Page, sessionId: string): Promise<string> {
  const response = await page.request.get(`/api/sessions/${sessionId}`);
  expect(response.ok()).toBe(true);
  const data = (await response.json()) as { session: { status: string } };
  return data.session.status;
}

test.describe('Happy path — host and two guests find a match', () => {
  test.afterAll(async () => {
    await cleanupTestKeys();
  });

  test('three users swipe to a unanimous match and the session completes', async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const { sessionId, host, guestA, guestB, contexts } =
      await setupThreeUserSession(browser);

    try {
      // --- Swiping: LIKE Inception, PASS everything else. Guests finish
      // first so the host's LIKE on Inception completes the unanimous match
      // and surfaces the match toast. ---
      await swipeThroughDeck(guestA, 'Inception');
      await swipeThroughDeck(guestB, 'Inception');
      await swipeThroughDeck(host, 'Inception', { expectMatchToast: true });

      // --- Outcome: session COMPLETED with Inception as the winner ---
      for (const page of [host, guestA, guestB]) {
        await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({
          timeout: POLL_TIMEOUT,
        });
        await expect(page.getByText('Winner', { exact: true })).toBeVisible({
          timeout: POLL_TIMEOUT,
        });
        await expect(
          page.getByRole('heading', { name: 'Inception' })
        ).toBeVisible({ timeout: POLL_TIMEOUT });
      }

      expect(sessionId).toBeTruthy();
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.close()));
    }
  });

  test('slow swiper: the round never ends until the last participant finishes', async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const { sessionId, host, guestA, guestB, contexts } =
      await setupThreeUserSession(browser);

    try {
      // --- Two of three participants finish quickly ---
      await swipeThroughDeck(guestA, 'Inception');
      await swipeThroughDeck(guestB, 'Inception');

      // --- Regression guard: with 2/3 participants finished, the round must
      // still be SWIPING_ACTIVE. Poll the API directly (not the UI) so this
      // isn't masked by the client's 5s refresh interval. ---
      for (let i = 0; i < 3; i++) {
        const status = await getSessionStatus(host, sessionId);
        expect(status).toBe('SWIPING_ACTIVE');
        await host.waitForTimeout(1000);
      }

      // --- The slow (3rd) participant finally finishes ---
      await swipeThroughDeck(host, 'Inception', { expectMatchToast: true });

      // --- Only now may the round transition ---
      await expect
        .poll(async () => getSessionStatus(host, sessionId), {
          timeout: POLL_TIMEOUT,
        })
        .toMatch(/^(COMPLETED|HEAD_TO_HEAD_ACTIVE)$/);
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.close()));
    }
  });
});
