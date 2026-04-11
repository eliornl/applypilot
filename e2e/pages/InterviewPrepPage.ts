import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Interview Prep page object
 */
export class InterviewPrepPage extends BasePage {
  readonly url = '/dashboard/interview-prep';
  
  // Session selection
  readonly sessionSelect: Locator;
  readonly startPrepButton: Locator;
  readonly noSessionsMessage: Locator;
  
  // Question categories
  readonly categoryTabs: Locator;
  readonly technicalTab: Locator;
  readonly behavioralTab: Locator;
  readonly companyTab: Locator;
  readonly roleTab: Locator;
  
  // Questions list
  readonly questionsList: Locator;
  readonly questionCard: Locator;
  readonly questionText: Locator;
  readonly answerGuidance: Locator;
  readonly sampleAnswer: Locator;
  
  // Practice mode
  readonly startPracticeButton: Locator;
  readonly answerTextarea: Locator;
  readonly submitAnswerButton: Locator;
  readonly feedbackSection: Locator;
  readonly scoreDisplay: Locator;
  
  // Navigation
  readonly nextQuestionButton: Locator;
  readonly prevQuestionButton: Locator;
  readonly progressIndicator: Locator;
  
  // Tips section
  readonly tipsSection: Locator;
  readonly companyInsights: Locator;
  readonly interviewTips: Locator;
  
  constructor(page: Page) {
    super(page);
    
    // Session selection
    this.sessionSelect = page.locator('select[name="session"], #sessionSelect, [class*="session-select"]');
    this.startPrepButton = page.locator('button:has-text("Start"), button:has-text("Prepare"), button:has-text("Begin")');
    this.noSessionsMessage = page.locator('text=no sessions, text=no applications, text=complete a workflow');
    
    // Category tabs
    this.categoryTabs = page.locator('[data-tab], .tab, .category-tab, [role="tab"]');
    this.technicalTab = page.locator('[data-tab="technical"], button:has-text("Technical"), a:has-text("Technical")');
    this.behavioralTab = page.locator('[data-tab="behavioral"], button:has-text("Behavioral"), a:has-text("Behavioral")');
    this.companyTab = page.locator('[data-tab="company"], button:has-text("Company"), a:has-text("Company")');
    this.roleTab = page.locator('[data-tab="role"], button:has-text("Role"), a:has-text("Role")');
    
    // Questions
    this.questionsList = page.locator('.questions-list, .question-container, [class*="questions"]');
    this.questionCard = page.locator('.question-card, .question-item, [class*="question"]');
    this.questionText = page.locator('.question-text, .question-title, h3, h4');
    this.answerGuidance = page.locator('.answer-guidance, .guidance, [class*="guidance"]');
    this.sampleAnswer = page.locator('.sample-answer, .example-answer, [class*="sample"]');
    
    // Practice mode
    this.startPracticeButton = page.locator('button:has-text("Practice"), button:has-text("Try"), button:has-text("Answer")');
    this.answerTextarea = page.locator('textarea[name="answer"], #answer, textarea[placeholder*="answer"]');
    this.submitAnswerButton = page.locator('button:has-text("Submit"), button:has-text("Check"), button[type="submit"]');
    this.feedbackSection = page.locator('.feedback, .feedback-section, [class*="feedback"]');
    this.scoreDisplay = page.locator('.score, .rating, [class*="score"]');
    
    // Navigation
    this.nextQuestionButton = page.locator('button:has-text("Next"), .next-btn, [aria-label="Next"]');
    this.prevQuestionButton = page.locator('button:has-text("Previous"), button:has-text("Back"), .prev-btn');
    this.progressIndicator = page.locator('.progress, .progress-bar, [class*="progress"]');
    
    // Tips
    this.tipsSection = page.locator('.tips-section, .tips, [class*="tips"]');
    this.companyInsights = page.locator('.company-insights, [class*="company-insight"]');
    this.interviewTips = page.locator('.interview-tips, [class*="interview-tip"]');
  }
  
  /**
   * Navigate to interview prep page
   */
  async navigate() {
    await this.goto(this.url);
    await this.waitForPageLoad();
  }
  
  /**
   * Select a workflow session
   */
  async selectSession(index: number = 0) {
    if (await this.sessionSelect.isVisible({ timeout: 3000 })) {
      const options = await this.sessionSelect.locator('option').all();
      if (options.length > index + 1) { // +1 for placeholder option
        await this.sessionSelect.selectOption({ index: index + 1 });
      }
    }
  }
  
  /**
   * Start interview preparation
   */
  async startPrep() {
    await this.startPrepButton.click();
    await this.waitForLoading();
  }
  
  /**
   * Select a question category
   */
  async selectCategory(category: 'technical' | 'behavioral' | 'company' | 'role') {
    const tabs = {
      technical: this.technicalTab,
      behavioral: this.behavioralTab,
      company: this.companyTab,
      role: this.roleTab,
    };
    await tabs[category].click();
    await this.page.waitForTimeout(500);
  }
  
  /**
   * Get question count
   */
  async getQuestionCount(): Promise<number> {
    return await this.questionCard.count();
  }
  
  /**
   * Click on a question
   */
  async openQuestion(index: number = 0) {
    await this.questionCard.nth(index).click();
    await this.page.waitForTimeout(300);
  }
  
  /**
   * Start practice mode for current question
   */
  async startPractice() {
    await this.startPracticeButton.click();
    await expect(this.answerTextarea).toBeVisible({ timeout: 5000 });
  }
  
  /**
   * Submit an answer
   */
  async submitAnswer(answer: string) {
    await this.fillField(this.answerTextarea, answer);
    await this.submitAnswerButton.click();
    await this.waitForLoading();
  }
  
  /**
   * Go to next question
   */
  async nextQuestion() {
    await this.nextQuestionButton.click();
    await this.page.waitForTimeout(300);
  }
  
  /**
   * Go to previous question
   */
  async previousQuestion() {
    await this.prevQuestionButton.click();
    await this.page.waitForTimeout(300);
  }
  
  /**
   * Check if has sessions available
   */
  async hasSessions(): Promise<boolean> {
    const noSessions = await this.noSessionsMessage.isVisible({ timeout: 3000 }).catch(() => false);
    return !noSessions;
  }
  
  /**
   * Get feedback text
   */
  async getFeedback(): Promise<string> {
    return (await this.feedbackSection.textContent()) || '';
  }
}
