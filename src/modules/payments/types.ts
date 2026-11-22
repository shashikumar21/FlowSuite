export type { InvoiceRow, InvoicePaymentRow, InvoiceStatus, InvoicePaymentMethod } from '@/types/database'
import type { LineItemValues } from './schemas'

export type InvoiceLineItem = LineItemValues

export type InvoiceContactOption = {
  id: string
  full_name: string
}
