/** One import row after spreadsheet mapping, before server validation. */
export type ProspectImportRow = {
  business_name: string
  industry: string | null
  city: string | null
  state: string | null
  country: string | null
  website: string | null
  business_size: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export type MappedImportSheet = {
  rows: ProspectImportRow[]
  unmappedHeaders: string[]
  truncated: boolean
}
