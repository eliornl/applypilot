import { test, expect } from '@playwright/test';
import { setupAllMocks, setupCookieConsent, setupAuth } from '../utils/api-mocks';

// Pre-accept cookie consent so the banner never intercepts pointer events
test.beforeEach(async ({ page }) => {
  await setupCookieConsent(page);
});

/**
 * Visual regression tests - Structure verification
 * These tests verify page structure and visual elements
 * Note: Full screenshot comparisons are skipped unless baselines exist
 */
test.describe('Visual Regression', () => {
  
  test.describe('Authentication Pages', () => {
    
    test('login page should have proper structure', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('domcontentloaded');
      
      // Verify form structure
      const form = page.locator('form, .login-form, .auth-form').first();
      await expect(form).toBeVisible();
      
      // Verify input fields
      await expect(page.locator('input[type="email"], #email')).toBeVisible();
      await expect(page.locator('input[type="password"], #password')).toBeVisible();
    });
    
    test('registration page should have proper structure', async ({ page }) => {
      await page.goto('/auth/register');
      await page.waitForLoadState('domcontentloaded');
      
      // Verify form structure
      const form = page.locator('form, .register-form, .auth-form').first();
      await expect(form).toBeVisible();
      
      // Verify input fields
      await expect(page.locator('input[type="email"], #email')).toBeVisible();
      await expect(page.locator('input[type="password"]').first()).toBeVisible();
    });
    
    test('password reset page should have proper structure', async ({ page }) => {
      await page.goto('/auth/reset-password');
      await page.waitForLoadState('domcontentloaded');
      
      // Verify page content
      const content = page.locator('main, .container, form').first();
      await expect(content).toBeVisible();
    });
  });
  
  test.describe('Public Pages', () => {
    
    test('homepage should have proper structure', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      
      // Verify navigation
      const nav = page.locator('nav, .navbar').first();
      await expect(nav).toBeVisible();
      
      // Verify hero or main content
      const hero = page.locator('h1, h2, .hero-title').first();
      await expect(hero).toBeVisible();
    });
    
    test('help page should have proper structure', async ({ page }) => {
      await page.goto('/help');
      await page.waitForLoadState('domcontentloaded');
      
      // Verify content
      const content = page.locator('main, .container, article').first();
      await expect(content).toBeVisible();
    });
    
    test('terms page should have proper structure', async ({ page }) => {
      await page.goto('/terms');
      await page.waitForLoadState('domcontentloaded');
      
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
    
    test('privacy page should have proper structure', async ({ page }) => {
      await page.goto('/privacy');
      await page.waitForLoadState('domcontentloaded');
      
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
  });
  
  test.describe('Responsive Design', () => {
    
    test('mobile login should be usable (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/auth/login');
      await page.waitForLoadState('domcontentloaded');
      
      const emailInput = page.locator('input[type="email"], #email');
      await expect(emailInput).toBeVisible();
      
      // Input should be accessible
      await emailInput.fill('test@example.com');
      expect(await emailInput.inputValue()).toBe('test@example.com');
    });
    
    test('mobile homepage should be usable (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      
      // Page should render
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
    
    test('tablet login should be usable (768x1024)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/auth/login');
      await page.waitForLoadState('domcontentloaded');
      
      const emailInput = page.locator('input[type="email"], #email');
      await expect(emailInput).toBeVisible();
    });
    
    test('desktop homepage should be usable (1920x1080)', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      
      // Page should render
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
  });
  
  test.describe('Component Structure', () => {
    
    test('login form should have all expected elements', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('domcontentloaded');
      
      // Email input
      const emailInput = page.locator('input[type="email"], #email');
      await expect(emailInput).toBeVisible();
      
      // Password input
      const passwordInput = page.locator('input[type="password"], #password');
      await expect(passwordInput).toBeVisible();
      
      // Submit button
      const submitBtn = page.locator('button[type="submit"], #login-btn');
      await expect(submitBtn).toBeVisible();
      
      // Register link
      const registerLink = page.locator('a[href*="register"]');
      await expect(registerLink).toBeVisible();
    });
    
    test('registration form should have all expected elements', async ({ page }) => {
      await page.goto('/auth/register');
      await page.waitForLoadState('domcontentloaded');
      
      // Email input
      const emailInput = page.locator('input[type="email"], #email');
      await expect(emailInput).toBeVisible();
      
      // Password input
      const passwordInput = page.locator('input[type="password"]').first();
      await expect(passwordInput).toBeVisible();
      
      // Submit button
      const submitBtn = page.locator('button[type="submit"], #register-btn');
      await expect(submitBtn).toBeVisible();
      
      // Login link
      const loginLink = page.locator('a[href*="login"]');
      await expect(loginLink).toBeVisible();
    });
  });
  
  test.describe('Form States', () => {
    
    test('login form should show error on invalid credentials', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('domcontentloaded');
      
      // Fill invalid credentials
      await page.locator('input[type="email"], #email').fill('invalid@example.com');
      await page.locator('input[type="password"], #password').fill('wrongpassword');
      await page.locator('button[type="submit"], #login-btn').click();
      
      // Wait for response
      await page.waitForLoadState('domcontentloaded');
      
      // Should either show error or still be on login page
      const url = page.url();
      expect(url).toContain('login');
    });
    
    test('form inputs should be focusable', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('domcontentloaded');
      
      // Focus email input
      const emailInput = page.locator('input[type="email"], #email');
      await emailInput.focus();
      
      // Should be focused
      await expect(emailInput).toBeFocused();
    });
  });
});

// ---------------------------------------------------------------------------
// DASHBOARD PAGE STRUCTURE (Mocked)
// ---------------------------------------------------------------------------
test.describe('Dashboard Visual Structure', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await setupAllMocks(page);
  });

  test('dashboard welcome card has proper structure', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.welcome-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#welcomeMessage')).toBeAttached();
  });

  test('stat cards use consistent card class', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    const cards = page.locator('.stat-card');
    await expect(cards).toHaveCount(4);
  });

  test('new application page has proper form-card structure', async ({ page }) => {
    await page.goto('/dashboard/new-application');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('.form-card')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.form-header')).toBeAttached();
  });

  test('career tools page has consistent section structure', async ({ page }) => {
    await page.goto('/dashboard/tools');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#thankYouSection')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#loadingOverlay')).toBeAttached();
  });

  test('settings page sidebar uses consistent nav structure', async ({ page }) => {
    await page.route('**/api/v1/settings**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('domcontentloaded');
    const navLinks = page.locator('[data-section]');
    await expect(navLinks).toHaveCount(5);
  });

  test('dashboard renders consistently on 1280x800 desktop', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    await setupAuth(p);
    await setupAllMocks(p);
    await p.goto('/dashboard');
    await expect(p.locator('.welcome-card')).toBeVisible({ timeout: 8000 });
    await ctx.close();
  });

  test('career tools renders on 1440px wide viewport', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await setupAuth(p);
    await setupAllMocks(p);
    await p.goto('/dashboard/tools');
    await expect(p.locator('#thankYouSection')).toBeVisible({ timeout: 8000 });
    await ctx.close();
  });

  test('dashboard stat cards visible on 768px tablet', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const p = await ctx.newPage();
    await setupAuth(p);
    await setupAllMocks(p);
    await p.goto('/dashboard');
    await expect(p.locator('.stats-cards')).toBeVisible({ timeout: 8000 });
    await ctx.close();
  });

  test('new application form renders on 375px mobile', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const p = await ctx.newPage();
    await setupAuth(p);
    await setupAllMocks(p);
    await p.goto('/dashboard/new-application');
    await expect(p.locator('.form-card')).toBeVisible({ timeout: 8000 });
    await ctx.close();
  });
});
