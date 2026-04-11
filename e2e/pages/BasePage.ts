import { Page, Locator, expect } from '@playwright/test';

/**
 * Base page class with common functionality for all pages.
 */
export class BasePage {
  readonly page: Page;
  
  // Common elements
  readonly notification: Locator;
  readonly loadingOverlay: Locator;
  readonly cookieConsentBanner: Locator;
  readonly cookieAcceptButton: Locator;
  
  constructor(page: Page) {
    this.page = page;
    this.notification = page.locator('.notification, .alert, .toast');
    this.loadingOverlay = page.locator('.loading-overlay, .spinner, [class*="loading"]');
    this.cookieConsentBanner = page.locator('#cookie-consent-banner');
    this.cookieAcceptButton = page.locator('.cookie-btn-accept');
  }
  
  /**
   * Navigate to a URL
   */
  async goto(path: string) {
    await this.page.goto(path);
    await this.handleCookieConsent();
  }
  
  /**
   * Handle cookie consent banner if present
   */
  async handleCookieConsent() {
    try {
      const banner = this.cookieConsentBanner;
      if (await banner.isVisible({ timeout: 2000 })) {
        await this.cookieAcceptButton.click();
        await banner.waitFor({ state: 'hidden', timeout: 3000 });
      }
    } catch {
      // Banner not present or already handled
    }
  }
  
  /**
   * Wait for page to be fully loaded
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }
  
  /**
   * Wait for loading overlay to disappear
   */
  async waitForLoading() {
    try {
      await this.loadingOverlay.waitFor({ state: 'hidden', timeout: 30000 });
    } catch {
      // No loading overlay
    }
  }
  
  /**
   * Check for notification message
   */
  async expectNotification(text: string, type?: 'success' | 'error' | 'warning' | 'info') {
    const notification = this.page.locator(`.notification, .alert, .toast`).filter({ hasText: text });
    await expect(notification).toBeVisible({ timeout: 10000 });
    if (type) {
      await expect(notification).toHaveClass(new RegExp(type, 'i'));
    }
  }
  
  /**
   * Get current URL path
   */
  getPath(): string {
    return new URL(this.page.url()).pathname;
  }
  
  /**
   * Wait for URL to match
   */
  async waitForURL(urlPattern: string | RegExp) {
    await this.page.waitForURL(urlPattern, { timeout: 15000 });
  }
  
  /**
   * Take screenshot with descriptive name
   */
  async screenshot(name: string) {
    await this.page.screenshot({ path: `./test-results/screenshots/${name}.png`, fullPage: true });
  }
  
  /**
   * Check if element is visible
   */
  async isVisible(locator: Locator): Promise<boolean> {
    try {
      return await locator.isVisible({ timeout: 3000 });
    } catch {
      return false;
    }
  }
  
  /**
   * Fill form field with clear first
   */
  async fillField(locator: Locator, value: string) {
    await locator.clear();
    await locator.fill(value);
  }
  
  /**
   * Click and wait for navigation
   */
  async clickAndWaitForNavigation(locator: Locator) {
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle' }),
      locator.click(),
    ]);
  }
  
  /**
   * Get text content safely
   */
  async getText(locator: Locator): Promise<string> {
    return (await locator.textContent()) || '';
  }
  
  /**
   * Scroll element into view
   */
  async scrollIntoView(locator: Locator) {
    await locator.scrollIntoViewIfNeeded();
  }
}
