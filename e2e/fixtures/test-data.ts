/**
 * Test Data for E2E tests
 */

/**
 * Generate unique email for test isolation
 */
export function generateTestEmail(prefix: string = 'e2e'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}_${timestamp}_${random}@test.example.com`;
}

/**
 * Test user data
 */
export const testUsers = {
  // Main test user (created in global setup)
  primary: {
    email: generateTestEmail('primary'),
    password: 'TestPassword123!',
    name: 'Test User',
  },
  
  // Secondary user for isolation tests
  secondary: {
    email: generateTestEmail('secondary'),
    password: 'SecondPassword456!',
    name: 'Secondary User',
  },
  
  // User with weak password (for validation tests)
  weakPassword: {
    email: generateTestEmail('weak'),
    password: 'weak',
    name: 'Weak User',
  },
  
  // User with invalid email
  invalidEmail: {
    email: 'not-an-email',
    password: 'TestPassword123!',
    name: 'Invalid Email User',
  },
};

/**
 * Test profile data
 */
export const testProfile = {
  basicInfo: {
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    title: 'Senior Software Engineer',
    yearsExperience: 8,
    summary: 'Experienced software engineer with expertise in Python, TypeScript, and cloud technologies. Passionate about building scalable systems and leading engineering teams.',
  },
  
  workExperience: {
    company: 'Tech Innovations Inc',
    title: 'Senior Software Engineer',
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    isCurrent: false,
    description: 'Led development of microservices architecture, mentored junior developers, and improved system performance by 40%.',
  },
  
  skills: [
    'Python',
    'TypeScript',
    'JavaScript',
    'React',
    'Node.js',
    'PostgreSQL',
    'Redis',
    'AWS',
    'Docker',
    'Kubernetes',
  ],
  
  careerPreferences: {
    minSalary: 150000,
    maxSalary: 250000,
    remotePreference: 'remote',
  },
};

/**
 * Test job posting data
 */
export const testJobPostings = {
  // Simple job posting text
  simple: `
    Senior Software Engineer at TechCorp
    
    Location: San Francisco, CA (Remote OK)
    Salary: $180,000 - $220,000
    
    About Us:
    TechCorp is a leading technology company building innovative solutions.
    
    Requirements:
    - 5+ years of software engineering experience
    - Strong proficiency in Python and JavaScript
    - Experience with cloud platforms (AWS, GCP)
    - Experience with databases (PostgreSQL, MongoDB)
    - Excellent communication skills
    
    Nice to Have:
    - Experience with Kubernetes
    - ML/AI background
    - Open source contributions
    
    Benefits:
    - Competitive salary
    - Health insurance
    - 401k matching
    - Remote work options
  `,
  
  // Detailed job posting
  detailed: `
    Staff Software Engineer - Platform Team
    
    Company: InnovateTech Solutions
    Location: New York, NY (Hybrid - 2 days in office)
    Salary Range: $200,000 - $280,000 + equity
    
    About InnovateTech:
    We're a Series C startup ($50M raised) revolutionizing the fintech space.
    Our platform processes over $1B in transactions monthly.
    
    The Role:
    As a Staff Engineer, you'll architect and lead critical platform initiatives,
    mentor engineers, and shape our technical direction.
    
    What You'll Do:
    - Design and implement core platform services
    - Lead technical design reviews and architecture decisions
    - Mentor senior and mid-level engineers
    - Drive engineering excellence and best practices
    - Collaborate with product and design teams
    
    Requirements:
    - 8+ years of software engineering experience
    - 2+ years in a tech lead or staff role
    - Expert-level Python or Go
    - Deep experience with distributed systems
    - Strong SQL and database design skills
    - Experience with event-driven architectures (Kafka, RabbitMQ)
    
    Preferred:
    - Fintech or payments experience
    - Experience scaling systems to millions of users
    - Contributions to technical blogs or conferences
    
    Our Stack:
    - Python, Go, TypeScript
    - PostgreSQL, Redis, Elasticsearch
    - Kubernetes, Terraform
    - AWS (EKS, RDS, Lambda)
    
    Benefits:
    - Competitive equity package
    - Premium health/dental/vision
    - Unlimited PTO
    - $5,000 learning budget
    - Home office stipend
  `,
  
  // Sample job posting URL for URL-input flow testing (mock)
  jobUrl: 'https://boards.greenhouse.io/testcompany/jobs/123456789',
};

/**
 * Test career tools data
 */
export const testToolsData = {
  thankYouNote: {
    interviewerName: 'Sarah Johnson',
    interviewType: 'technical',
    companyName: 'TechCorp',
    jobTitle: 'Senior Software Engineer',
    discussionPoints: 'Discussed the microservices architecture, team culture, and the new ML initiative.',
  },
  
  rejectionEmail: `
    Dear Candidate,
    
    Thank you for taking the time to interview for the Senior Software Engineer position at TechCorp.
    
    After careful consideration, we have decided to move forward with another candidate whose experience 
    more closely aligns with our current needs.
    
    We were impressed with your technical skills and problem-solving abilities. We encourage you to 
    apply for future positions that match your qualifications.
    
    We wish you the best in your job search.
    
    Best regards,
    HR Team at TechCorp
  `,
  
  referenceRequest: {
    referenceName: 'John Smith',
    relationship: 'Former Manager',
    targetJob: 'Staff Software Engineer',
    targetCompany: 'InnovateTech',
  },
  
  salaryCoaching: {
    jobTitle: 'Senior Software Engineer',
    companyName: 'TechCorp',
    offeredSalary: '$150,000',
    yearsExperience: 8,
    currentSalary: '$130,000',
    achievements: 'Led migration to microservices saving $2M/year. Promoted twice in 3 years.',
  },
};

/**
 * Test API key (fake, for UI testing only)
 */
export const testApiKey = 'AIzaSyFakeTestKeyForE2ETesting12345';

/**
 * Test file paths
 */
export const testFiles = {
  resume: {
    pdf: './fixtures/sample-resume.pdf',
    docx: './fixtures/sample-resume.docx',
    txt: './fixtures/sample-resume.txt',
  },
  jobPosting: {
    pdf: './fixtures/sample-job.pdf',
    txt: './fixtures/sample-job.txt',
  },
};
