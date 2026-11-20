import { useState, type FormEvent } from 'react'
import { Bot, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Label } from '@/components/ui/Input'
import { chatEndpointUrl, statusMessage } from '../utils'
import type { PublicAiAgent } from '@/types/database'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type ChatResponse = {
  ok?: boolean
  reply?: string
  needsHandoff?: boolean
  escalatedForSafety?: boolean
  error?: { code?: string }
}

export function ChatWidget({ publicKey, agent }: { publicKey: string; agent: PublicAiAgent | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [escalated, setEscalated] = useState(false)
  const endpoint = chatEndpointUrl()

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = message.trim()
    if (!text || !publicKey || !endpoint || sending) return
    setSending(true)
    setNotice(null)
    setEscalated(false)
    const history = messages.slice(-10)
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey,
          message: text,
          name: name.trim() || null,
          phone: phone.trim() || null,
          email: null,
          consentToWhatsapp: consent,
          history,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      let payload: ChatResponse = {}
      try {
        payload = (await response.json()) as ChatResponse
      } catch {
        payload = {}
      }
      if (!response.ok || !payload.ok || typeof payload.reply !== 'string') {
        setNotice(statusMessage(payload.error?.code ?? `http_${response.status}`))
        return
      }
      setMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: payload.reply as string }])
      setMessage('')
      setEscalated(payload.escalatedForSafety === true || payload.needsHandoff === true)
    } catch {
      setNotice('Could not reach the chatbot endpoint. Check the deployment and your network connection.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-ink-200 bg-white">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{agent?.name ?? 'Website assistant'}</p>
          <p className="text-xs text-ink-500">{agent?.language?.toUpperCase() ?? 'EN'} · public widget preview</p>
        </div>
        {agent ? <Badge variant="success" className="ml-auto">Agent active</Badge> : null}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-ink-50/60 px-4 py-4" style={{ minHeight: '16rem', maxHeight: '22rem' }}>
        {messages.length === 0 ? (
          <p className="text-sm text-ink-500">
            Send a test message. Requests go to the real <code className="text-xs">ai-chat</code> endpoint and create real
            conversations in this tenant.
          </p>
        ) : (
          messages.map((item, index) => (
            <div
              key={`${index}-${item.role}`}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                item.role === 'user' ? 'ml-auto bg-brand-600 text-white' : 'bg-white text-ink-800 shadow-xs'
              }`}
            >
              {item.content}
            </div>
          ))
        )}
      </div>
      <form onSubmit={send} className="space-y-3 border-t border-ink-100 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="widget-name">Visitor name (optional)</Label>
            <Input id="widget-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="widget-phone">Phone (optional)</Label>
            <Input id="widget-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          Visitor opted in to WhatsApp follow-ups
        </label>
        {notice ? <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{notice}</p> : null}
        {escalated ? (
          <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
            A handoff was requested. Open AI Conversations to assign it to a teammate.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Input
            aria-label="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask about services, hours or booking…"
          />
          <Button type="submit" loading={sending} disabled={!endpoint || !publicKey}>
            <Send className="size-4" /> Send
          </Button>
        </div>
        {!endpoint ? <p className="text-xs text-red-600">VITE_SUPABASE_URL is missing from .env.local.</p> : null}
      </form>
    </div>
  )
}
