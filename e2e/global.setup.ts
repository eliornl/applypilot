import { test as setup, expect } from '@playwright/test';
import { RegisterPage } from './pages';
import { generateTestEmail } from './fixtures/test-data';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, 'playwright/.auth/user.json');

/**
 * Global setup - runs once before all tests
 * Creates a test user and saves authentication state
 * Skips if valid auth state already exists (for faster runs)
 */
setup('global setup', async ({ page }) => {
  // Ensure auth directory exists
  const authDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  
  // Check if auth state already exists and is recent (within 1 hour)
  const testDataFile = path.join(__dirname, 'playwright/.auth/test-user.json');
  if (fs.existsSync(AUTH_FILE) && fs.existsSync(testDataFile)) {
    const authStats = fs.statSync(AUTH_FILE);
    const ageMs = Date.now() - authStats.mtimeMs;
    const oneHourMs = 60 * 60 * 1000;
    
    if (ageMs < oneHourMs) {
      console.log(`\n⚡ Reusing existing auth state (${Math.round(ageMs / 1000 / 60)} min old)\n`);
      return; // Skip setup - auth is fresh enough
    }
  }
  
  // Generate unique test user
  const testUser = {
    email: generateTestEmail('e2e_global'),
    password: 'E2EGlobalTest123!',
    name: 'E2E Global Test User',
  };
  
  // Save test user info to a file for other tests to use
  fs.writeFileSync(testDataFile, JSON.stringify(testUser, null, 2));
  
  console.log(`\n🔐 Setting up E2E tests with user: ${testUser.email}\n`);
  
  // Navigate to register page
  const registerPage = new RegisterPage(page);
  await registerPage.navigate();
  
  // Handle cookie consent if present
  await registerPage.handleCookieConsent();
  
  // Register the test user
  await registerPage.register({
    name: testUser.name,
    email: testUser.email,
    password: testUser.password,
    acceptTerms: true,
  });
  
  // Wait for redirect
  await page.waitForURL(/profile\/setup|dashboard/, { timeout: 20000 });
  
  // Complete profile setup if needed
  if (page.url().includes('profile/setup')) {
    console.log('📝 Completing profile setup...');
    
    // Skip resume upload
    const skipButton = page.locator('button:has-text("Fill in manually"), button:has-text("Skip"), a:has-text("manual")');
    if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForLoadState('domcontentloaded');
    }
    
    // Fill minimal required fields and navigate through wizard
    const steps = [
      async () => {
        // Step 1: Basic Info
        const cityInput = page.locator('input[name="city"], #city');
        const titleInput = page.locator('input[name="professional_title"], input[name="title"], #title, #professionalTitle');
        
        if (await cityInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await cityInput.fill('San Francisco');
        }
        if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await titleInput.fill('Software Engineer');
        }
      },
      async () => {
        // Step 2-4: Can be skipped or have minimal data
      }
    ];
    
    // Execute setup steps
    for (const step of steps) {
      await step();
    }
    
    // Navigate through wizard
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")');
    const completeButton = page.locator('button:has-text("Complete"), button:has-text("Finish"), button:has-text("Save")');
    
    for (let i = 0; i < 6; i++) {
      if (await completeButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await completeButton.click();
        break;
      }
      
      if (await nextButton.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextButton.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }
    
    // Wait for dashboard
    await page.waitForURL(/dashboard/, { timeout: 15000 });
  }
  
  // Handle onboarding tutorial if present
  const onboardingSkip = page.locator('.onboarding-btn-skip, button:has-text("Skip Tour"), button:has-text("Skip")');
  if (await onboardingSkip.isVisible({ timeout: 2000 }).catch(() => false)) {
    await onboardingSkip.click();
  }
  
  // Verify we're authenticated and on dashboard
  await expect(page).toHaveURL(/dashboard/);
  console.log('✅ Successfully authenticated and on dashboard\n');
  
  // Save authentication state
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`💾 Authentication state saved to ${AUTH_FILE}\n`);
});

export { AUTH_FILE };
