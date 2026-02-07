export interface Experience {
  id: string
  position: number
  title: string
  description: string
  period: string
  company?: string
  logo?: string
  link?: string
  tags?: string[]
}

export const experiences: Experience[] = [
  {
    id: 'link-datacenter',
    position: 0.1,
    title: 'Cloud-Solutions Engineer',
    description:
      'Designed and implemented multiple web solutions for numerous customers on-premise and Azure cloud for a reputable Egyptian datacenter.',
    period: 'Feb 2018 – Feb 2019',
    company: 'Link Datacenter',
    logo: '/logos/link-datacenter.png',
    tags: ['Azure', 'Cloud', 'Web Solutions'],
  },
  {
    id: 'seedstars',
    position: 0.27,
    title: 'Full-Stack Engineer',
    description:
      'Developed and maintained the main websites of Seedstars and its subsidiaries using a custom CRM built with Wagtail and Django. Worked on large projects for sales and finance teams, managing employees and entrepreneurs with complex flows and rating systems.',
    period: 'Feb 2019 – Mar 2020',
    company: 'Seedstars',
    logo: '/logos/seedstars.png',
    tags: ['Django', 'Wagtail', 'Python', 'CRM'],
  },
  {
    id: 'huawei',
    position: 0.44,
    title: 'Senior Full-Stack Engineer',
    description:
      'Led associate team within the Solution Development Center, delivering enterprise B2B solutions that automated critical business processes and reduced operational costs by 28%. Architected data processing pipelines handling 100M+ business records, generating actionable insights for strategic decisions.',
    period: 'Mar 2020 – Jul 2021',
    company: 'Huawei',
    logo: '/logos/huawei.png',
    tags: ['Full-Stack', 'B2B', 'Data Pipelines', 'Enterprise'],
  },
  {
    id: 'amazon',
    position: 0.61,
    title: 'Senior Software Engineer',
    description:
      'Optimized Amazon Compass platform serving 10M+ user profiles and 1M+ active users, improving response times by 35% through efficient database query restructuring. Enhanced Amazon PrimeAir customer experience by implementing real-time appointment scheduling, dynamic availability management, and predictive arrival time estimation.',
    period: 'Jul 2021 – Sep 2022',
    company: 'Amazon',
    logo: '/logos/amazon.png',
    tags: ['TypeScript', 'AWS', 'Microservices', 'Performance'],
  },
  {
    id: 'babbel',
    position: 0.8,
    title: 'Technical Team Lead',
    description:
      'Leading a cross-functional development team delivering enterprise-grade web applications with focus on scalability and performance. Architected the company\'s CRM infrastructure supporting 130+ million client profiles. Developed cloud-native microservices on AWS using TypeScript, Python, and Golang. Established data access protocols improving conversion rates by 22%.',
    period: 'Sep 2022 – Present',
    company: 'Babbel',
    logo: '/logos/babbel.png',
    tags: ['TypeScript', 'Python', 'Golang', 'AWS', 'Leadership'],
  },
]

export const SECTION_HEIGHT_VH = 120
// Extra scroll room at the end for the portfolio section
export const TOTAL_SCROLL_HEIGHT_VH = experiences.length * SECTION_HEIGHT_VH + 200
