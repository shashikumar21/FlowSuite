import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Construction, CheckCircle2 } from 'lucide-react'
import { moduleTitles } from '@/app/config/navigation'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { titleCase } from '@/lib/format'

export function ModulePlaceholderPage() {
  const { moduleKey = '' } = useParams<{ moduleKey: string }>()
  const module = moduleTitles[moduleKey]
  const title = module?.title ?? titleCase(moduleKey)
  const Icon = module?.icon ?? Construction

  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card>
        <CardContent className="px-8 py-10 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Icon className="size-6" />
          </span>
          <Badge variant="warning" className="mt-5">{module?.phase ?? 'Planned'}</Badge>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-500">
            {module?.description ?? 'This module is part of the product roadmap.'} The foundation milestone is complete;
            this screen will be built in the next development phase.
          </p>
          <div className="mx-auto mt-7 max-w-sm rounded-xl border border-ink-200 bg-ink-50 p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Already working</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Multi-tenant isolation</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Authentication & team roles</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> Industry template defaults</li>
            </ul>
          </div>
          <Link
            to="/app"
            className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="size-4" /> Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
