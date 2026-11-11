/**
 * Who the site is about. Every place that shows the name, a tagline, the bio or a contact link
 * reads it from here: the hero, the header, the About dialog, the text version of the page and
 * the structured data for search engines.
 */
export const profile = {
  name: 'Ahmed Sayed',
  /** Line under the name on the landing screen. */
  headline: 'Software Engineer | AI Enthusiast | ex-Amazon | ex-Huawei',
  /** Short line under the name in the header. */
  headerTagline: 'Sr. Software Engineer',
  /** Line under the name in the About dialog. */
  role: 'Senior Software Engineer',
  bio:
    'I am a Senior Software Engineer with over 10 years of experience in full-stack development. ' +
    'I specialize in backend-heavy solutions, scalable distributed architectures, and modern web ' +
    'technologies. I enjoy tackling complex engineering challenges and building high-impact ' +
    'systems that drive real business value.',
  facts: [
    'Based in Berlin, Germany',
    'diving into Rust and exploring AI-driven systems',
    'Ask me about #TypeScript #Python #Rust #AWS #SystemDesign',
  ],
  email: 'me@asayed18.top',
  github: 'https://github.com/asayed18',
  linkedin: 'https://linkedin.com/in/a-abdelsalam',
  calendly: 'https://calendly.com/ahmed-salam/meeting',

  /** Canonical address of the site, with the trailing slash. */
  siteUrl: 'https://asayed18.top/',
  /** Image for link previews and structured data. */
  shareImage: 'https://asayed18.top/avatar.png',

  // Structured data (schema.org Person) only.
  jobTitle: 'AI Product Builder',
  worksFor: 'Forgent AI',
  location: { locality: 'Berlin', country: 'DE' },
  knowsAbout: [
    'TypeScript',
    'Python',
    'Rust',
    'Golang',
    'AWS',
    'Full-Stack Development',
    'System Design',
    'Scalable Architecture',
    'Microservices',
  ],
} as const

/** Avatar shown in the page (square crop, 320px: twice the largest size it is displayed at). */
export const AVATAR_SRC = '/avatar-320.webp'
