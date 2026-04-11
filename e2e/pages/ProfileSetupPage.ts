import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Profile setup page object (multi-step wizard)
 */
export class ProfileSetupPage extends BasePage {
  readonly url = '/profile/setup';
  
  // Navigation
  readonly nextButton: Locator;
  readonly backButton: Locator;
  readonly skipButton: Locator;
  readonly progressIndicator: Locator;
  
  // Step 0: Quick Start (Resume Upload)
  readonly resumeUploadArea: Locator;
  readonly resumeFileInput: Locator;
  readonly fillManuallyButton: Locator;
  
  // Step 1: Basic Info
  readonly cityInput: Locator;
  readonly stateInput: Locator;
  readonly countryInput: Locator;
  readonly professionalTitleInput: Locator;
  readonly yearsExperienceInput: Locator;
  readonly summaryInput: Locator;
  
  // Step 2: Work Experience
  readonly addExperienceButton: Locator;
  readonly companyNameInput: Locator;
  readonly jobTitleInput: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly currentJobCheckbox: Locator;
  readonly jobDescriptionInput: Locator;
  
  // Step 3: Skills
  readonly skillsInput: Locator;
  readonly addSkillButton: Locator;
  readonly skillTag: Locator;
  
  // Step 4: Career Preferences
  readonly minSalaryInput: Locator;
  readonly maxSalaryInput: Locator;
  readonly jobTypeCheckboxes: Locator;
  readonly remotePreferenceSelect: Locator;
  
  // Completion
  readonly completeButton: Locator;
  readonly successMessage: Locator;
  
  constructor(page: Page) {
    super(page);
    
    // Navigation
    this.nextButton = page.locator('button:has-text("Next"), button:has-text("Continue"), .next-btn');
    this.backButton = page.locator('button:has-text("Back"), button:has-text("Previous"), .back-btn');
    this.skipButton = page.locator('button:has-text("Skip"), .skip-btn');
    this.progressIndicator = page.locator('.progress-indicator, .step-indicator, .wizard-progress');
    
    // Step 0
    this.resumeUploadArea = page.locator('.resume-upload, .file-drop-zone, [class*="upload"]');
    this.resumeFileInput = page.locator('input[type="file"]');
    this.fillManuallyButton = page.locator('button:has-text("Fill in manually"), button:has-text("Skip"), a:has-text("manual")');
    
    // Step 1
    this.cityInput = page.locator('input[name="city"], #city');
    this.stateInput = page.locator('input[name="state"], #state');
    this.countryInput = page.locator('input[name="country"], #country, select[name="country"]');
    this.professionalTitleInput = page.locator('input[name="professional_title"], input[name="title"], #title, #professionalTitle');
    this.yearsExperienceInput = page.locator('input[name="years_experience"], input[name="experience"], #experience, #yearsExperience');
    this.summaryInput = page.locator('textarea[name="summary"], #summary');
    
    // Step 2
    this.addExperienceButton = page.locator('button:has-text("Add Experience"), button:has-text("Add Position")');
    this.companyNameInput = page.locator('input[name="company"], input[name="company_name"], #company');
    this.jobTitleInput = page.locator('input[name="job_title"], input[name="position"], #jobTitle');
    this.startDateInput = page.locator('input[name="start_date"], #startDate');
    this.endDateInput = page.locator('input[name="end_date"], #endDate');
    this.currentJobCheckbox = page.locator('input[type="checkbox"][name*="current"], #currentJob');
    this.jobDescriptionInput = page.locator('textarea[name="description"], #jobDescription');
    
    // Step 3
    this.skillsInput = page.locator('#skills-input');
    this.addSkillButton = page.locator('#add-skill-btn, button:has-text("Add")');
    this.skillTag = page.locator('.skill-tag, .badge');
    
    // Step 4 - Career Preferences
    this.minSalaryInput = page.locator('#min-salary');
    this.maxSalaryInput = page.locator('#max-salary');
    this.jobTypeCheckboxes = page.locator('input[type="checkbox"]:near(:text("Full-time"))');
    this.remotePreferenceSelect = page.locator('input[type="checkbox"]:near(:text("Remote"))').first();
    
    // Completion
    this.completeButton = page.locator('button:has-text("Complete"), button:has-text("Finish"), button:has-text("Save")');
    this.successMessage = page.locator('.success-message, .alert-success');
  }
  
  /**
   * Navigate to profile setup
   */
  async navigate() {
    await this.goto(this.url);
    await this.waitForPageLoad();
  }
  
  /**
   * Skip resume upload step
   */
  async skipResumeUpload() {
    if (await this.isVisible(this.fillManuallyButton)) {
      await this.fillManuallyButton.click();
      await this.page.waitForTimeout(500);
    }
  }
  
  /**
   * Upload resume file
   */
  async uploadResume(filePath: string) {
    await this.resumeFileInput.setInputFiles(filePath);
    await this.waitForLoading();
  }
  
  /**
   * Fill basic info (Step 1)
   */
  async fillBasicInfo(data: {
    city?: string;
    state?: string;
    country?: string;
    title?: string;
    yearsExperience?: number;
    summary?: string;
  }) {
    if (data.city) await this.fillField(this.cityInput, data.city);
    if (data.state) await this.fillField(this.stateInput, data.state);
    if (data.country) {
      const countryField = this.countryInput;
      if (await countryField.evaluate(el => el.tagName) === 'SELECT') {
        await countryField.selectOption(data.country);
      } else {
        await this.fillField(countryField, data.country);
      }
    }
    if (data.title) await this.fillField(this.professionalTitleInput, data.title);
    if (data.yearsExperience !== undefined) {
      await this.fillField(this.yearsExperienceInput, data.yearsExperience.toString());
    }
    if (data.summary) await this.fillField(this.summaryInput, data.summary);
  }
  
  /**
   * Fill work experience (Step 2)
   */
  async fillWorkExperience(data: {
    company: string;
    title: string;
    startDate: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
  }) {
    await this.fillField(this.companyNameInput, data.company);
    await this.fillField(this.jobTitleInput, data.title);
    await this.fillField(this.startDateInput, data.startDate);
    
    if (data.isCurrent) {
      await this.currentJobCheckbox.check();
    } else if (data.endDate) {
      await this.fillField(this.endDateInput, data.endDate);
    }
    
    if (data.description) {
      await this.fillField(this.jobDescriptionInput, data.description);
    }
  }
  
  /**
   * Add skills (Step 3)
   */
  async addSkills(skills: string[]) {
    // Wait for skills input to be visible (step 3 is active)
    await expect(this.skillsInput).toBeVisible({ timeout: 10000 });
    
    for (const skill of skills) {
      await this.skillsInput.clear();
      await this.skillsInput.fill(skill);
      // Press Enter to add the skill
      await this.skillsInput.press('Enter');
      await this.page.waitForTimeout(300);
    }
  }
  
  /**
   * Fill career preferences (Step 4)
   */
  async fillCareerPreferences(data: {
    minSalary?: number;
    maxSalary?: number;
    remotePreference?: string;
  }) {
    // Wait for career preferences form to be visible
    await expect(this.minSalaryInput).toBeVisible({ timeout: 10000 });
    
    if (data.minSalary !== undefined) {
      await this.minSalaryInput.clear();
      await this.minSalaryInput.fill(data.minSalary.toString());
    }
    if (data.maxSalary !== undefined) {
      await this.maxSalaryInput.clear();
      await this.maxSalaryInput.fill(data.maxSalary.toString());
    }
    
    // Select required checkboxes using the checkbox input directly
    // Job Types - select "Full-time"
    await this.page.getByLabel('Full-time').check().catch(() => {});
    
    // Company Size - select "Medium (51-200 employees)"
    await this.page.getByLabel(/Medium \(51-200/i).check().catch(() => {});
    
    // Work Arrangement - select based on preference or default to Remote
    if (data.remotePreference) {
      await this.page.getByLabel(data.remotePreference).check().catch(() => {});
    } else {
      await this.page.getByLabel('Remote').check().catch(() => {});
    }
    
    // Travel preference - select "Minimal travel"
    await this.page.getByLabel(/Minimal travel/i).check().catch(() => {});
  }
  
  /**
   * Go to next step
   */
  async nextStep() {
    await this.nextButton.click();
    await this.page.waitForTimeout(500);
  }
  
  /**
   * Go to previous step
   */
  async previousStep() {
    await this.backButton.click();
    await this.page.waitForTimeout(500);
  }
  
  /**
   * Complete profile setup
   */
  async complete() {
    await this.completeButton.click();
    await this.waitForLoading();
  }
  
  /**
   * Wait for a specific step to become active
   */
  async waitForStep(stepNumber: number) {
    const stepForm = this.page.locator(`#step-${stepNumber}.active, .step-form[data-step="${stepNumber}"].active`);
    await expect(stepForm).toBeVisible({ timeout: 10000 }).catch(async () => {
      // Alternative: wait for step indicator to be active
      const stepIndicator = this.page.locator(`.step-indicator[data-step="${stepNumber}"].active`);
      await expect(stepIndicator).toBeVisible({ timeout: 5000 }).catch(() => {});
    });
  }

  /**
   * Complete entire profile setup with minimal data
   */
  async quickSetup(data: {
    title: string;
    yearsExperience: number;
    skills: string[];
  }) {
    // Handle cookie consent banner first
    await this.handleCookieConsent();
    
    await this.skipResumeUpload();
    
    // Step 1: Basic Info (wait for step to be active)
    await this.waitForStep(1).catch(() => {});
    await this.fillBasicInfo({
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      title: data.title,
      yearsExperience: data.yearsExperience,
      summary: 'Experienced professional seeking new opportunities.',
    });
    await this.nextStep();
    
    // Step 2: Work Experience (check the no-experience checkbox to skip)
    await this.waitForStep(2).catch(() => {});
    const noExperienceCheckbox = this.page.locator('input[type="checkbox"]:near(:text("don\'t have"))');
    if (await noExperienceCheckbox.isVisible().catch(() => false)) {
      await noExperienceCheckbox.check();
    }
    await this.nextStep();
    
    // Step 3: Skills
    await this.waitForStep(3).catch(() => {});
    await this.addSkills(data.skills);
    await this.nextStep();
    
    // Step 4: Career Preferences
    await this.waitForStep(4).catch(() => {});
    await this.fillCareerPreferences({
      minSalary: 80000,
      maxSalary: 150000,
    });
    
    // Complete
    await this.complete();
  }
  
  /**
   * Get current step number
   */
  async getCurrentStep(): Promise<number> {
    const indicator = await this.progressIndicator.textContent();
    const match = indicator?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
}
