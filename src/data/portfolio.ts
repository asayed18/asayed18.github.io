export interface PortfolioProject {
  id: string
  title: string
  description: string
  tags: string[]
  thumbnail?: string
  link?: string
  size: 'large' | 'medium' | 'small'
}

export const portfolioProjects: PortfolioProject[] = [
  {
    id: 'link-datacenter',
    title: 'Link Datacenter — Cloud Solutions',
    description:
      'Designed and delivered multiple on-premise to Azure cloud migration solutions for enterprise customers across the Middle East.',
    tags: ['Azure', 'Cloud', 'DevOps'],
    thumbnail: '/portfolio/link-datacenter.gif',
    link: 'https://linkdatacenter.net',
    size: 'large',
  },
  {
    id: 'seedstars',
    title: 'Seedstars — Community Platform',
    description:
      'Built a custom CRM with Wagtail and Django, managing complex employee and entrepreneur workflows with rating systems for a global community of 250,000+ members.',
    tags: ['Django', 'Wagtail', 'Python'],
    thumbnail: '/portfolio/seedstars.gif',
    link: 'https://www.seedstars.com',
    size: 'medium',
  },
  {
    id: 'seedspace',
    title: 'Seedspace — Co-living Platform',
    description:
      'Developed the co-living and events platform powering Seedspace locations across Africa, connecting entrepreneurs with shared workspaces.',
    tags: ['Django', 'React', 'Full-Stack'],
    thumbnail: '/portfolio/seedspace.gif',
    link: 'https://www.seedspace.co',
    size: 'medium',
  },
  {
    id: 'huawei',
    title: 'Huawei Cloud — B2B Solutions',
    description:
      'Led development of enterprise B2B solutions automating critical business processes and reducing operational costs by 28%. Built data pipelines handling 100M+ records.',
    tags: ['Full-Stack', 'Golang', 'Cloud'],
    thumbnail: '/portfolio/huawei.png',
    link: 'https://www.huaweicloud.com',
    size: 'large',
  },
  {
    id: 'amazon-compass',
    title: 'Amazon Compass — Platform Optimization',
    description:
      'Optimized platform serving 10M+ user profiles and 1M+ active users, improving response times by 35% through efficient query restructuring.',
    tags: ['TypeScript', 'AWS', 'Performance'],
    thumbnail: '/portfolio/amazon.png',
    link: 'https://www.amazon.com',
    size: 'medium',
  },
  {
    id: 'babbel',
    title: 'Babbel — CRM Infrastructure',
    description:
      'Architected CRM infrastructure supporting 130M+ client profiles. Developed cloud-native microservices and established data access protocols improving conversion rates by 22%.',
    tags: ['TypeScript', 'Python', 'AWS'],
    thumbnail: '/portfolio/babbel.gif',
    link: 'https://www.babbel.com',
    size: 'medium',
  },
  {
    id: 'vyoo',
    title: 'Vyoo — Social Lifestyle App',
    description:
      'Developed a social lifestyle mobile application with polls, community features, and media sharing for an engaged user base.',
    tags: ['React Native', 'Mobile', 'Social'],
    thumbnail: '/portfolio/vyoo.gif',
    link: 'https://www.vyoo.me',
    size: 'large',
  },
]
