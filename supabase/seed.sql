-- Seed data for local development.
-- Contains only reference data (subscription plans). No fake businesses or contacts.
-- Illustrative launch pricing for India; not validated market prices.

insert into public.plans (name, description, price_monthly, price_yearly, limits, features, active)
values
  (
    'Starter',
    'Core CRM and booking for a single business.',
    999,
    9990,
    '{"employees": 2, "contacts": 500, "ai_credits": 0, "messages": 0, "workflow_runs": 0, "storage_mb": 100, "branches": 1}'::jsonb,
    '{"crm": true, "appointments": true, "basic_dashboard": true, "whatsapp": false, "marketing": false, "team": true, "ai_chatbot": false, "ai_agents": false, "workflows": false, "websites": false, "reputation": false, "advanced_analytics": false}'::jsonb,
    true
  ),
  (
    'Growth',
    'Marketing automation and AI-assisted lead handling.',
    2499,
    24990,
    '{"employees": 10, "contacts": 5000, "ai_credits": 500, "messages": 1000, "workflow_runs": 5000, "storage_mb": 2000, "branches": 1}'::jsonb,
    '{"crm": true, "appointments": true, "basic_dashboard": true, "whatsapp": true, "marketing": true, "team": true, "ai_chatbot": true, "ai_agents": false, "workflows": true, "websites": false, "reputation": false, "advanced_analytics": true}'::jsonb,
    true
  ),
  (
    'Professional',
    'AI agents, websites and full reputation management.',
    4999,
    49990,
    '{"employees": 25, "contacts": 25000, "ai_credits": 2500, "messages": 5000, "workflow_runs": 25000, "storage_mb": 10000, "branches": 3}'::jsonb,
    '{"crm": true, "appointments": true, "basic_dashboard": true, "whatsapp": true, "marketing": true, "team": true, "ai_chatbot": true, "ai_agents": true, "workflows": true, "websites": true, "reputation": true, "advanced_analytics": true}'::jsonb,
    true
  ),
  (
    'Enterprise',
    'Multi-branch operations with custom limits and onboarding.',
    0,
    0,
    '{"employees": -1, "contacts": -1, "ai_credits": -1, "messages": -1, "workflow_runs": -1, "storage_mb": -1, "branches": -1}'::jsonb,
    '{"crm": true, "appointments": true, "basic_dashboard": true, "whatsapp": true, "marketing": true, "team": true, "ai_chatbot": true, "ai_agents": true, "workflows": true, "websites": true, "reputation": true, "advanced_analytics": true, "multi_branch": true, "custom_integrations": true}'::jsonb,
    true
  )
on conflict (name) do nothing;
