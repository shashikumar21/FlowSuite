import type { GrowthCampaignRow, GrowthSiteRow } from '@/types/database'

/** A read-only option for creative and submission forms. */
export type CampaignOption = Pick<GrowthCampaignRow, 'id' | 'name' | 'channel'>
export type SiteOption = Pick<GrowthSiteRow, 'id' | 'name' | 'slug'>

/**
 * Counts derived only from rows returned by tenant-scoped SELECTs. There is no
 * aggregate RPC and no placeholder number: empty tables produce real zeros.
 */
export type GrowthSummary = {
  campaigns: number
  activeCampaigns: number
  creatives: number
  websites: number
  submissions: number
  newSubmissions: number
  reviews: number
  newReviews: number
  feedback: number
}
