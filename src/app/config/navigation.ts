import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Clock,
  CreditCard,
  FileText,
  Gauge,
  Globe,
  History,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  PhoneCall,
  Plug,
  Receipt,
  Search,
  Send,
  Settings2,
  Sparkles,
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
  badge?: string
}

const planned = (label: string, to: string, icon: LucideIcon): NavItem => ({
  label,
  to: `/app/module/${to}`,
  icon,
})

export const navigation: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/app', icon: LayoutDashboard, available: true },
      { label: 'Notifications', to: '/app/notifications', icon: Bell, available: true },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'CRM', to: '/app/crm', icon: Users, available: true },
      { label: 'Contacts', to: '/app/contacts', icon: UserCog, available: true },
      { label: 'Deals', to: '/app/deals', icon: Target, available: true },
      { label: 'Import history', to: '/app/crm/imports', icon: History, available: true },
      { label: 'CRM setup', to: '/app/crm/settings', icon: Settings2, available: true },
      { label: 'Conversations', to: '/app/conversations', icon: MessageSquare, available: true },
    ],
  },
  {
    label: 'Booking',
    items: [
      { label: 'Overview', to: '/app/booking', icon: CalendarDays, available: true },
      { label: 'Appointments', to: '/app/appointments', icon: Clock, available: true },
      { label: 'Services', to: '/app/booking/services', icon: FileText, available: true },
      { label: 'Availability', to: '/app/booking/availability', icon: CalendarDays, available: true },
      { label: 'Resources', to: '/app/booking/resources', icon: UserCog, available: true },
      { label: 'Booking page', to: '/app/booking/page', icon: Globe, available: true },
    ],
  },
  {
    label: 'Growth',
    items: [
      { label: 'Overview', to: '/app/growth', icon: BarChart3, available: true },
      { label: 'Marketing', to: '/app/growth/marketing', icon: Megaphone, available: true },
      { label: 'Campaigns', to: '/app/growth/campaigns', icon: Inbox, available: true },
      { label: 'Websites', to: '/app/growth/websites', icon: Globe, available: true },
      { label: 'Reputation', to: '/app/growth/reputation', icon: Star, available: true },
    ],
  },
  {
    label: 'Automation',
    items: [
      { label: 'AI Agents', to: '/app/ai/agents', icon: Bot, available: true },
      { label: 'AI Conversations', to: '/app/ai/conversations', icon: MessageSquare, available: true },
      { label: 'AI Call Agent', to: '/app/voice-agent', icon: PhoneCall, available: true },
      planned('Workflows', 'workflows', Workflow),
    ],
  },
  {
    label: 'AI Sales Agent',
    badge: 'NEW',
    items: [
      { label: 'Overview', to: '/app/sales-agent', icon: Sparkles, available: true },
      { label: 'Prospect discovery', to: '/app/sales-agent/discovery', icon: Search, available: true },
      { label: 'Prospects', to: '/app/sales-agent/prospects', icon: Users, available: true },
      { label: 'AI email writer', to: '/app/sales-agent/email-writer', icon: MessageSquare, available: true },
      { label: 'Campaigns', to: '/app/sales-agent/campaigns', icon: Megaphone, available: true },
      { label: 'Approvals', to: '/app/sales-agent/approvals', icon: Inbox, available: true },
      { label: 'Sending queue', to: '/app/sales-agent/sending', icon: Send, available: true },
      { label: 'Decision makers', to: '/app/sales-agent/decision-makers', icon: UserCog, available: true },
      { label: 'Replies', to: '/app/sales-agent/replies', icon: MessageSquare, available: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Tasks', to: '/app/tasks', icon: FileText, available: true },
      { label: 'Team', to: '/app/team', icon: Users, available: true },
      { label: 'Payments', to: '/app/payments', icon: Receipt, available: true },
      planned('Reports', 'reports', BarChart3),
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Business Profile', to: '/app/settings/business', icon: Gauge, available: true },
      { label: 'Profile & Security', to: '/app/settings/profile', icon: Settings2, available: true },
      { label: 'Integrations', to: '/app/settings/integrations', icon: Plug, available: true },
      planned('Subscription', 'subscription', CreditCard),
    ],
  },
]

export const moduleTitles: Record<string, { title: string; description: string; icon: LucideIcon; phase: string }> = {
  marketing: { title: 'Marketing', description: 'Save channel copy for planned campaigns. No broadcast provider.', icon: Megaphone, phase: 'Growth (local)' },
  campaigns: { title: 'Campaigns', description: 'Plan multi-channel campaigns. No sends or delivery metrics.', icon: Inbox, phase: 'Growth (local)' },
  websites: { title: 'Websites', description: 'Record pages and form leads. No hosting or custom domains.', icon: Globe, phase: 'Growth (local)' },
  reputation: { title: 'Reputation', description: 'Record reviews, responses and feedback. No provider posts.', icon: Star, phase: 'Growth (local)' },
  workflows: { title: 'Workflows', description: 'Triggers, conditions, actions and delays.', icon: Workflow, phase: 'Phase 3' },
  'sales-decision-makers': { title: 'Decision makers', description: 'Research contacts within each sales prospect.', icon: UserCog, phase: 'Phase 4' },
  'sales-email-writer': { title: 'AI email writer', description: 'Draft outreach from saved prospect context.', icon: MessageSquare, phase: 'Phase 3' },
  'sales-campaigns': { title: 'Sales campaigns', description: 'Plan and measure approved outreach.', icon: Megaphone, phase: 'Phase 3' },
  'sales-approvals': { title: 'Approvals', description: 'Review and approve messages before sending.', icon: Inbox, phase: 'Phase 3' },
  'sales-replies': { title: 'Replies', description: 'Inbound replies and interest signals.', icon: MessageSquare, phase: 'Phase 4' },
  tasks: { title: 'Tasks', description: 'Tenant-scoped assignments, owners and due dates. No reminders.', icon: FileText, phase: 'Tasks (local)' },
  subscription: { title: 'Subscription', description: 'Plans, entitlements and usage.', icon: CreditCard, phase: 'Phase 4' },
}
