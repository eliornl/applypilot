import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Login page object
 */
export class LoginPage extends BasePage {
  readonly url = '/auth/login';
  
  // Form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly registerLink: Locator;
  readonly forgotPasswordLink: Locator;
  readonly googleSignInButton: Locator;
  
  // Error elements
  readonly errorMessage: Locator;
  readonly fieldError: Locator;
  
  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('#email, input[name="email"]');
    this.passwordInput = page.locator('#password, input[name="password"]:not([name*="confirm"])');
    this.loginButton = page.locator('#login-btn, button[type="submit"].btn-auth');
    this.registerLink = page.locator('a[href*="register"], a:has-text("Register"), a:has-text("Sign Up")');
    this.forgotPasswordLink = page.locator('a[href*="forgot"], a[href*="reset"], a:has-text("Forgot")');
    this.googleSignInButton = page.locator('#google-login-btn, .btn-google');
    this.errorMessage = page.locator('#error-message, #error-alert, .alert-danger');
    this.fieldError = page.locator('.invalid-feedback, .form-error');
  }
  
  /**
   * Navigate to login page
   */
  async navigate() {
    await this.goto(this.url);
    await expect(this.emailInput).toBeVisible();
  }
  
  /**
   * Login with email and password
   */
  async login(email: string, password: string) {
    await this.fillField(this.emailInput, email);
    await this.fillField(this.passwordInput, password);
    await this.loginButton.click();
  }
  
  /**
   * Login and wait for redirect
   */
  async loginAndWait(email: string, password: string, expectedPath: string = '/dashboard') {
    await this.login(email, password);
    await this.waitForURL(new RegExp(expectedPath));
  }
  
  /**
   * Attempt login expecting failure
   */
  async loginExpectingError(email: string, password: string, errorText?: string) {
    await this.login(email, password);
    // Use .first() to avoid strict mode violation when multiple error elements exist
    await expect(this.errorMessage.first()).toBeVisible({ timeout: 10000 });
    if (errorText) {
      await expect(this.page.getByText(errorText)).toBeVisible();
    }
  }
  
  /**
   * Go to registration page
   */
  async goToRegister() {
    await this.registerLink.click();
    await this.waitForURL(/register/);
  }
  
  /**
   * Go to forgot password page
   */
  async goToForgotPassword() {
    await this.forgotPasswordLink.click();
    await this.waitForURL(/reset|forgot/);
  }
  
  /**
   * Check if login page is displayed
   */
  async isDisplayed(): Promise<boolean> {
    return await this.isVisible(this.emailInput) && await this.isVisible(this.passwordInput);
  }
  
  /**
   * Fill form fields without submitting
   */
  async fillForm(data: { email?: string; password?: string }) {
    if (data.email) {
      await this.fillField(this.emailInput, data.email);
    }
    if (data.password) {
      await this.fillField(this.passwordInput, data.password);
    }
  }
}
