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
      'Architected and deployed scalable web applications across on-premise and Azure cloud environments. Delivered end-to-end solutions for enterprise clients, including infrastructure provisioning, CI/CD pipeline setup, and production monitoring.',
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
      'Built and maintained a custom CRM platform using Django and Wagtail, serving Seedstars and its subsidiaries. Engineered complex workflow systems for sales and finance operations, including multi-stage evaluation pipelines and role-based access control for managing entrepreneurs and internal teams.',
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
      'Led a development team within the Solution Development Center, delivering enterprise B2B platforms that automated critical business processes and reduced operational costs by 28%. Architected high-throughput data pipelines processing 100M+ records, enabling real-time analytics and data-driven decision-making across business units.',
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
      'Optimized the Amazon Compass platform serving 10M+ user profiles and 1M+ active users, achieving a 35% improvement in API response times through database query optimization and caching strategies. Designed and implemented real-time scheduling, dynamic availability, and predictive ETA systems for Amazon PrimeAir, enhancing the end-to-end customer delivery experience.',
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
      'Leading a cross-functional engineering team delivering high-availability web applications with a focus on scalability and performance. Architected the CRM infrastructure supporting 130M+ client profiles with sub-second query latency. Designed cloud-native microservices on AWS using TypeScript, Python, and Go. Established data governance protocols that improved conversion rates by 22%.',
    period: 'Sep 2022 – Present',
    company: 'Babbel',
    logo: '/logos/babbel.png',
    tags: ['TypeScript', 'Python', 'Golang', 'AWS', 'Leadership'],
  },
]

export const SECTION_HEIGHT_VH = 120
// Extra scroll room at the end for the portfolio section
export const TOTAL_SCROLL_HEIGHT_VH = experiences.length * SECTION_HEIGHT_VH + 200
