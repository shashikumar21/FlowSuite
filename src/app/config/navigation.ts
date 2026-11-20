import {
  BarChart3,
  Bot,
  CalendarDays,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Plug,
  Receipt,
  Settings2,
  Star,
  Target,
  UserCog,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  available?: boolean
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

const planned = (label: string, to: string, icon: LucideIcon): NavItem => ({
  label,
  to: `/app/module/${to}`,
  icon,
})

export const navigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/app', icon: LayoutDashboard, available: true }],
  },
  {
    label: 'Customers',
    items: [
      { label: 'CRM', to: '/app/crm', icon: Users, available: true },
      { label: 'Contacts', to: '/app/contacts', icon: UserCog, available: true },
      { label: 'Deals', to: '/app/deals', icon: Target, available: true },
      { label: 'Import history', to: '/app/crm/imports', icon: History, available: true },
      { label: 'CRM setup', to: '/app/crm/settings', icon: Settings2, available: true },
      planned('Conversations', 'conversations', MessageSquare),
      planned('Appointments', 'appointments', CalendarDays),
    ],
  },
  {
    label: 'Growth',
    items: [
      planned('Marketing', 'marketing', Megaphone),
      planned('Campaigns', 'campaigns', Inbox),
      planned('Websites', 'websites', Globe),
      planned('Reputation', 'reputation', Star),
    ],
  },
  {
    label: 'Automation',
    items: [planned('Workflows', 'workflows', Workflow), planned('AI Agents', 'ai-agents', Bot)],
  },
  {
    label: 'Operations',
    items: [
      planned('Tasks', 'tasks', FileText),
      { label: 'Team', to: '/app/team', icon: Users, available: true },
      planned('Payments', 'payments', Receipt),
      planned('Reports', 'reports', BarChart3),
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Business Profile', to: '/app/settings/business', icon: Gauge, available: true },
      { label: 'Profile & Security', to: '/app/settings/profile', icon: Settings2, available: true },
      planned('Integrations', 'integrations', Plug),
      planned('Subscription', 'subscription', CreditCard),
    ],
  },
]

export const moduleTitles: Record<string, { title: string; description: string; icon: LucideIcon; phase: string }> = {
  conversations: { title: 'Conversations', description: 'WhatsApp, web chat and email in one inbox.', icon: MessageSquare, phase: 'Phase 2' },
  appointments: { title: 'Appointments', description: 'Calendars, services, reminders and rescheduling.', icon: CalendarDays, phase: 'Phase 2' },
  marketing: { title: 'Marketing', description: 'Campaigns, WhatsApp broadcasts and ad creatives.', icon: Megaphone, phase: 'Phase 3' },
  campaigns: { title: 'Campaigns', description: 'Create and measure multi-channel campaigns.', icon: Inbox, phase: 'Phase 3' },
  websites: { title: 'Websites', description: 'Landing pages, forms and custom domains.', icon: Globe, phase: 'Phase 3' },
  reputation: { title: 'Reputation', description: 'Reviews, AI replies and feedback collection.', icon: Star, phase: 'Phase 3' },
  workflows: { title: 'Workflows', description: 'Triggers, conditions, actions and delays.', icon: Workflow, phase: 'Phase 3' },
  'ai-agents': { title: 'AI Agents', description: 'Chatbots, lead qualification and handover.', icon: Bot, phase: 'Phase 3' },
  tasks: { title: 'Tasks', description: 'Assignments, due dates and team activity.', icon: FileText, phase: 'Phase 2' },
  integrations: { title: 'Integrations', description: 'WhatsApp, Google, Razorpay and telephony.', icon: Plug, phase: 'Phase 3' },
  subscription: { title: 'Subscription', description: 'Plans, entitlements and usage.', icon: CreditCard, phase: 'Phase 4' },
}
