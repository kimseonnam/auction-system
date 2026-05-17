export interface Tournament {
  id: string
  name: string
  team_count: number
  default_points: number
  timer_seconds: number
  admin_code: string
  created_at: string
  updated_at: string
}

export interface Team {
  id: string
  tournament_id: string
  name: string
  points: number
  order_index: number
  created_at: string
}

export interface Player {
  id: string
  tournament_id: string
  team_id: string | null
  name: string
  tier: 'A' | 'B' | 'C' | 'D'
  rank_tier: string
  available_days: string[]
  available_days_text: string
  comment: string
  image_url: string | null
  bid_amount: number
  is_passed: boolean
  order_index: number
  created_at: string
  team?: Team
}

export interface AuctionState {
  id: string
  tournament_id: string
  current_player_id: string | null
  current_bid: number
  current_bidder_team_id: string | null
  timer_remaining: number
  status: 'ready' | 'running' | 'paused' | 'sold' | 'passed'
  auction_mode: 'player'
  created_at: string
  updated_at: string
  current_player?: Player
  current_bidder_team?: Team
}

export interface AuctionLog {
  id: string
  tournament_id: string
  player_id: string | null
  team_id: string | null
  action: 'bid' | 'sold' | 'passed' | 'reset'
  amount: number
  message: string | null
  created_at: string
  player?: Player
  team?: Team
}

export const TIERS = ['A', 'B', 'C', 'D'] as const
export const RANK_TIERS = ['1티어', '2티어', '3티어', '4티어', '5티어', '6티어', '7티어', '8티어', '9티어', '10티어', '물젖통'] as const
export const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const