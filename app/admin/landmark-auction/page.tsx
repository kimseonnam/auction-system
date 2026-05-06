'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Shuffle,
  Check,
  X,
} from 'lucide-react'

type LocalLandmark = {
  id: string
  name: string
  image_url?: string | null
  image?: string | null
  team_id?: string | null
  bid_amount?: number
  is_passed?: boolean
  category?: string
  map?: string
  auction_order?: number | null
}

type LocalTeam = {
  id: string
  name: string
  points: number
  join_code?: string | null
  landmarks?: string[]
}

type LandmarkAuctionState = {
  current_landmark_id: string | null
  current_bid: number
  current_bidder_team_id: string | null
  timer_remaining: number
  status: 'ready' | 'running' | 'paused'
}

type AuctionLog = {
  id: string
  action: string
  message: string
  created_at: string
}

type AuctionRole = 'admin' | 'participant'

const DEFAULT_TIMER = 20
const DEFAULT_POINTS = 0
const LANDMARK_TIMER_OWNER_KEY = 'landmark_auction_timer_owner'


const TIMER_OWNER_TTL = 3000

const claimTimerOwner = (storageKey: string, ownerId: string) => {
  try {
    const now = Date.now()
    const saved = localStorage.getItem(storageKey)
    const parsed = saved ? JSON.parse(saved) : null

    if (parsed?.id && parsed.id !== ownerId && Number(parsed.expiresAt || 0) > now) {
      return false
    }

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        id: ownerId,
        expiresAt: now + TIMER_OWNER_TTL,
      })
    )

    return true
  } catch {
    return true
  }
}

const releaseTimerOwner = (storageKey: string, ownerId: string) => {
  try {
    const saved = localStorage.getItem(storageKey)
    const parsed = saved ? JSON.parse(saved) : null

    if (!parsed?.id || parsed.id === ownerId) {
      localStorage.removeItem(storageKey)
    }
  } catch {
    localStorage.removeItem(storageKey)
  }
}


const defaultAuctionState: LandmarkAuctionState = {
  current_landmark_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: DEFAULT_TIMER,
  status: 'ready',
}

const createDefaultTeams = (): LocalTeam[] =>
  Array.from({ length: 16 }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `TEAM ${i + 1}`,
    points: DEFAULT_POINTS,
    landmarks: [],
  }))

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeTeams(value: unknown): LocalTeam[] {
  const rawTeams = asArray<any>(value)

  return rawTeams.map((team, index) => ({
    id: typeof team?.id === 'string' ? team.id : `team-${index + 1}`,
    name: typeof team?.name === 'string' ? team.name : `TEAM ${index + 1}`,
    points: Number.isFinite(Number(team?.points)) ? Number(team.points) : 0,
    join_code: typeof team?.join_code === 'string' ? team.join_code : null,
    landmarks: Array.isArray(team?.landmarks) ? team.landmarks.filter((id: unknown) => typeof id === 'string') : [],
  }))
}

function normalizeLandmarks(value: unknown): LocalLandmark[] {
  const rawValue = value as any
  const flatItems: any[] = []

  const pushChild = (child: any, category: string, childIndex: number) => {
    if (typeof child === 'string') {
      flatItems.push({
        id: `${category}-${childIndex + 1}`,
        name: child,
        category,
        map: category,
      })
      return
    }

    flatItems.push({
      ...child,
      category: child?.category || child?.map || child?.map_name || child?.mapName || category,
      map: child?.map || child?.map_name || child?.mapName || category,
      id: child?.id || `${category}-${childIndex + 1}`,
    })
  }

  if (Array.isArray(rawValue)) {
    rawValue.forEach((item, groupIndex) => {
      const children =
        item?.landmarks ||
        item?.landmarkItems ||
        item?.items ||
        item?.spots ||
        item?.areas ||
        item?.locations ||
        item?.regions ||
        item?.children ||
        item?.list ||
        item?.landmarkList

      const category =
        item?.category ||
        item?.map ||
        item?.map_name ||
        item?.mapName ||
        item?.name ||
        item?.title ||
        `맵 ${groupIndex + 1}`

      if (Array.isArray(children)) {
        children.forEach((child: any, childIndex: number) => {
          pushChild(child, String(category), childIndex)
        })
      } else {
        flatItems.push(item)
      }
    })
  }

  if (!Array.isArray(rawValue) && rawValue && typeof rawValue === 'object') {
    Object.entries(rawValue).forEach(([category, items]) => {
      if (Array.isArray(items)) {
        items.forEach((child: any, childIndex: number) => {
          pushChild(child, String(category), childIndex)
        })
      }
    })
  }

  return flatItems.map((landmark, index) => {
    const category =
      landmark?.category ||
      landmark?.map ||
      landmark?.map_name ||
      landmark?.mapName ||
      '랜드마크'

    const name =
      landmark?.landmark ||
      landmark?.landmark_name ||
      landmark?.landmarkName ||
      landmark?.landmark_title ||
      landmark?.landmarkTitle ||
      landmark?.area ||
      landmark?.area_name ||
      landmark?.areaName ||
      landmark?.region ||
      landmark?.region_name ||
      landmark?.regionName ||
      landmark?.location ||
      landmark?.location_name ||
      landmark?.locationName ||
      landmark?.place ||
      landmark?.place_name ||
      landmark?.placeName ||
      landmark?.spot ||
      landmark?.spot_name ||
      landmark?.spotName ||
      landmark?.label ||
      landmark?.name ||
      landmark?.title ||
      landmark?.value ||
      landmark?.text ||
      landmark?.content ||
      landmark?.displayName ||
      landmark?.subName ||
      landmark?.pointName ||
      landmark?.point_name ||
      `랜드마크 ${index + 1}`

    return {
      id: typeof landmark?.id === 'string' ? landmark.id : `landmark-${index + 1}`,
      name: String(name),
      image_url: landmark?.image_url || landmark?.image || landmark?.imageUrl || null,
      image: landmark?.image || landmark?.image_url || landmark?.imageUrl || null,
      team_id: landmark?.team_id || landmark?.teamId || null,
      bid_amount: Number.isFinite(Number(landmark?.bid_amount ?? landmark?.bidAmount))
        ? Number(landmark?.bid_amount ?? landmark?.bidAmount)
        : 0,
      is_passed: Boolean(landmark?.is_passed ?? landmark?.isPassed),
      category: String(category),
      map: String(category),
    }
  })
}

function normalizeState(value: unknown): LandmarkAuctionState {
  if (!value || typeof value !== 'object') return defaultAuctionState

  const state = value as Partial<LandmarkAuctionState>

  return {
    current_landmark_id:
      typeof state.current_landmark_id === 'string' ? state.current_landmark_id : null,
    current_bid: Number.isFinite(Number(state.current_bid)) ? Number(state.current_bid) : 0,
    current_bidder_team_id:
      typeof state.current_bidder_team_id === 'string' ? state.current_bidder_team_id : null,
    timer_remaining: Number.isFinite(Number(state.timer_remaining))
      ? Number(state.timer_remaining)
      : DEFAULT_TIMER,
    status:
      state.status === 'running' || state.status === 'paused' || state.status === 'ready'
        ? state.status
        : 'ready',
  }
}

const getLandmarkImage = (landmark?: LocalLandmark | null) =>
  landmark?.image_url || landmark?.image || null

const getTeamNumber = (teamId?: string | null) => {
  if (!teamId) return 9999
  const match = teamId.match(/team-(\d+)/)
  return match ? Number(match[1]) : 9999
}

const getLandmarkMapName = (landmark?: LocalLandmark | null) =>
  landmark?.category || landmark?.map || '랜드마크'

const hasSameMapLandmark = (
  ownedLandmarks: LocalLandmark[],
  targetLandmark?: LocalLandmark | null
) => {
  const targetMap = getLandmarkMapName(targetLandmark).trim()
  if (!targetMap) return false

  return ownedLandmarks.some((landmark) => getLandmarkMapName(landmark).trim() === targetMap)
}


const isAuctionTargetLandmark = (landmark: LocalLandmark) =>
  !landmark.team_id && !landmark.is_passed

const makeLandmarkPayload = (landmark: LocalLandmark) => ({
  id: landmark.id,
  name: landmark.name,
  image_url: landmark.image_url || landmark.image || null,
  team_id: landmark.team_id || null,
  bid_amount: Number(landmark.bid_amount || 0),
  is_passed: Boolean(landmark.is_passed),
  category: landmark.category || landmark.map || '랜드마크',
  map: landmark.map || landmark.category || '랜드마크',
  auction_order: Number.isFinite(Number(landmark.auction_order))
    ? Number(landmark.auction_order)
    : null,
})

const makeTeamPayload = (team: LocalTeam) => ({
  id: team.id,
  name: team.name,
  points: Number(team.points || 0),
  join_code: team.join_code || null,
})

export default function LandmarkAuctionPage() {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timerOwnerIdRef = useRef(`landmark-timer-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const isTickingRef = useRef(false)
  const auctionStateRef = useRef<LandmarkAuctionState>(defaultAuctionState)
  const landmarksRef = useRef<LocalLandmark[]>([])
  const teamsRef = useRef<LocalTeam[]>([])
  const logsRef = useRef<AuctionLog[]>([])

  const [role, setRole] = useState<AuctionRole>('participant')
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [auctionState, setAuctionState] = useState<LandmarkAuctionState>(defaultAuctionState)
  const [logs, setLogs] = useState<AuctionLog[]>([])
  const [joinedTeamId, setJoinedTeamId] = useState<string | null>(null)
  const [teamCodeInput, setTeamCodeInput] = useState('')

  const isAdmin = role === 'admin'

  useEffect(() => {
    auctionStateRef.current = auctionState
  }, [auctionState])

  useEffect(() => {
    landmarksRef.current = landmarks
  }, [landmarks])

  useEffect(() => {
    teamsRef.current = teams
  }, [teams])

  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  const saveLocalOverlaySnapshot = useCallback(
    (
      nextTeams: LocalTeam[],
      nextLandmarks: LocalLandmark[],
      nextState: LandmarkAuctionState,
      nextLogs: AuctionLog[]
    ) => {
      localStorage.setItem('auction_mode', 'landmark')
      localStorage.setItem('auction_teams', JSON.stringify(nextTeams))
      localStorage.setItem('auction_landmarks', JSON.stringify(nextLandmarks))
      localStorage.setItem('landmark_auction_state', JSON.stringify(nextState))
      localStorage.setItem('landmark_auction_logs', JSON.stringify(nextLogs))
      localStorage.setItem(
        'auction_snapshot',
        JSON.stringify({
          teams: nextTeams,
          landmarks: nextLandmarks,
          created_at: new Date().toISOString(),
        })
      )
    },
    []
  )

  const loadAuctionData = useCallback(async () => {
    localStorage.setItem('auction_mode', 'landmark')

    const [teamsResult, landmarksResult, stateResult, logsResult] = await Promise.all([
      supabase.from('teams').select('*').order('id', { ascending: true }),
      supabase
        .from('landmarks')
        .select('*')
        .order('auction_order', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true }),
      supabase.from('landmark_auction_state').select('*').eq('id', 'main').maybeSingle(),
      supabase
        .from('auction_logs')
        .select('*')
        .in('action', ['bid', 'sold', 'passed'])
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (teamsResult.error) console.error('landmark teams load error:', teamsResult.error)
    if (landmarksResult.error) console.error('landmarks load error:', landmarksResult.error)
    if (stateResult.error) console.error('landmark_auction_state load error:', stateResult.error)
    if (logsResult.error) console.error('landmark logs load error:', logsResult.error)

    const loadedTeamsRaw = normalizeTeams(teamsResult.data || [])
    const loadedLandmarks = normalizeLandmarks(landmarksResult.data || [])
    const loadedTeams = loadedTeamsRaw.length > 0 ? loadedTeamsRaw : createDefaultTeams()
    const loadedTeamsWithLandmarks = loadedTeams.map((team) => ({
      ...team,
      landmarks: loadedLandmarks.filter((landmark) => landmark.team_id === team.id).map((landmark) => landmark.id),
    }))
    const loadedState = stateResult.data ? normalizeState(stateResult.data) : defaultAuctionState
    const loadedLogs = ((logsResult.data || []) as AuctionLog[]).filter((log) =>
      ['bid', 'sold', 'passed'].includes(log.action)
    )

    teamsRef.current = loadedTeamsWithLandmarks
    landmarksRef.current = loadedLandmarks
    auctionStateRef.current = loadedState
    logsRef.current = loadedLogs

    setTeams(loadedTeamsWithLandmarks)
    setLandmarks(loadedLandmarks)
    setAuctionState(loadedState)
    setLogs(loadedLogs)
    saveLocalOverlaySnapshot(loadedTeamsWithLandmarks, loadedLandmarks, loadedState, loadedLogs)
  }, [saveLocalOverlaySnapshot])

  useEffect(() => {
    const savedRole = sessionStorage.getItem('auction_role')
    setRole(savedRole === 'admin' || savedRole === 'participant' ? savedRole : 'participant')

    const savedTeamId = sessionStorage.getItem('auction_team_id') || sessionStorage.getItem('team_id')
    setJoinedTeamId(savedTeamId || null)

    loadAuctionData()

    const channel = supabase
      .channel('landmark-auction-page-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, loadAuctionData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landmarks' }, loadAuctionData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landmark_auction_state' }, loadAuctionData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_logs' }, loadAuctionData)
      .subscribe()

    const pollingInterval = setInterval(loadAuctionData, 1200)

    return () => {
      clearInterval(pollingInterval)
      supabase.removeChannel(channel)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loadAuctionData])

  const saveTeams = async (nextTeams: LocalTeam[]) => {
    const normalized = normalizeTeams(nextTeams)
    teamsRef.current = normalized
    setTeams(normalized)
    saveLocalOverlaySnapshot(normalized, landmarksRef.current, auctionStateRef.current, logsRef.current)

    const { error } = await supabase.from('teams').upsert(normalized.map(makeTeamPayload))
    if (error) console.error('landmark teams save error:', error)
  }

  const saveLandmarks = async (nextLandmarks: LocalLandmark[]) => {
    const normalized = normalizeLandmarks(nextLandmarks)
    landmarksRef.current = normalized
    setLandmarks(normalized)
    saveLocalOverlaySnapshot(teamsRef.current, normalized, auctionStateRef.current, logsRef.current)

    const { error } = await supabase.from('landmarks').upsert(normalized.map(makeLandmarkPayload))
    if (error) console.error('landmarks save error:', error)
  }

  const saveAuctionState = async (nextState: LandmarkAuctionState) => {
    const normalized = normalizeState(nextState)
    auctionStateRef.current = normalized
    setAuctionState(normalized)
    saveLocalOverlaySnapshot(teamsRef.current, landmarksRef.current, normalized, logsRef.current)

    const { error } = await supabase
      .from('landmark_auction_state')
      .upsert({ id: 'main', ...normalized })

    if (error) console.error('landmark_auction_state save error:', error)
  }

  const clearAuctionLogs = async () => {
    logsRef.current = []
    setLogs([])
    saveLocalOverlaySnapshot(teamsRef.current, landmarksRef.current, auctionStateRef.current, [])

    const { error } = await supabase.from('auction_logs').delete().in('action', ['bid', 'sold', 'passed'])
    if (error) console.error('landmark logs clear error:', error)
  }

  const addLog = async (action: string, message: string) => {
    if (action !== 'bid' && action !== 'sold' && action !== 'passed') return

    const newLog: AuctionLog = {
      id: crypto.randomUUID(),
      action,
      message,
      created_at: new Date().toISOString(),
    }

    const nextLogs = action === 'bid' ? [newLog, ...logsRef.current].slice(0, 30) : [newLog]
    logsRef.current = nextLogs
    setLogs(nextLogs)
    saveLocalOverlaySnapshot(teamsRef.current, landmarksRef.current, auctionStateRef.current, nextLogs)

    if (action !== 'bid') {
      await supabase.from('auction_logs').delete().in('action', ['bid', 'sold', 'passed'])
    }

    const { error } = await supabase.from('auction_logs').insert(newLog)
    if (error) console.error('landmark logs insert error:', error)
  }

  const switchToPlayerAuction = async () => {
    localStorage.setItem('auction_mode', 'player')

    const { error } = await supabase
      .from('auction_state')
      .update({ overlay_mode: 'player' })
      .eq('id', 'main')

    if (error) console.error('overlay mode update error:', error)

    window.location.href = '/admin/auction'
  }


  const handleLoginTeam = () => {
    const code = teamCodeInput.trim()
    if (!code) return

    const matchedTeam = teams.find((team) => team.join_code === code)
    if (!matchedTeam) {
      alert('팀 코드가 올바르지 않습니다.')
      return
    }

    sessionStorage.setItem('auction_team_id', matchedTeam.id)
    sessionStorage.setItem('team_id', matchedTeam.id)
    setJoinedTeamId(matchedTeam.id)
    setTeamCodeInput('')
  }

  const handleLogoutTeam = () => {
    sessionStorage.removeItem('auction_team_id')
    sessionStorage.removeItem('team_id')
    setJoinedTeamId(null)
  }

  const safeTeams = Array.isArray(teams) ? teams : []
  const safeLandmarks = Array.isArray(landmarks) ? landmarks : []

  const joinedTeam = joinedTeamId ? safeTeams.find((team) => team.id === joinedTeamId) : null
  const currentLandmark = safeLandmarks.find(
    (landmark) => landmark.id === auctionState.current_landmark_id
  )
  const currentBidderTeam = safeTeams.find(
    (team) => team.id === auctionState.current_bidder_team_id
  )
  const passedLandmarks = safeLandmarks.filter((landmark) => landmark.is_passed)
  const waitingLandmarks = safeLandmarks.filter(isAuctionTargetLandmark)
  const orderedLandmarks = currentLandmark
    ? [
        currentLandmark,
        ...waitingLandmarks.filter((landmark) => landmark.id !== currentLandmark.id),
      ]
    : waitingLandmarks

  const getAvailableLandmarks = useCallback(() => {
    return landmarksRef.current.filter(isAuctionTargetLandmark)
  }, [])

  const getNextLandmark = useCallback(() => {
    const availableLandmarks = getAvailableLandmarks()
    if (availableLandmarks.length === 0) return null

    const currentId = auctionStateRef.current.current_landmark_id
    const currentIndex = currentId
      ? availableLandmarks.findIndex((landmark) => landmark.id === currentId)
      : -1

    return availableLandmarks[currentIndex + 1] || availableLandmarks[0]
  }, [getAvailableLandmarks])

  useEffect(() => {
    if (!isAdmin || auctionState.status !== 'running') {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      releaseTimerOwner(LANDMARK_TIMER_OWNER_KEY, timerOwnerIdRef.current)
      return
    }

    if (timerRef.current) return
    if (!claimTimerOwner(LANDMARK_TIMER_OWNER_KEY, timerOwnerIdRef.current)) return

    timerRef.current = setInterval(async () => {
      if (isTickingRef.current) return
      isTickingRef.current = true

      try {
        if (!claimTimerOwner(LANDMARK_TIMER_OWNER_KEY, timerOwnerIdRef.current)) {
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          return
        }

        const prev = auctionStateRef.current

        if (prev.status !== 'running') {
          if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
          }
          releaseTimerOwner(LANDMARK_TIMER_OWNER_KEY, timerOwnerIdRef.current)
          return
        }

        const nextTime = Math.max(0, prev.timer_remaining - 1)
        const nextStatus = nextTime <= 0 ? 'paused' : 'running'
        const nextState: LandmarkAuctionState = {
          ...prev,
          timer_remaining: nextTime,
          status: nextStatus,
        }

        // 중요:
        // 타이머는 timer_remaining/status만 저장합니다.
        // current_bid/current_bidder_team_id/current_landmark_id까지 같이 저장하면
        // 참가자 입찰과 0초 저장이 겹칠 때 입찰 팀 정보가 사라질 수 있습니다.
        const { data, error } = await supabase
          .from('landmark_auction_state')
          .update({
            timer_remaining: nextTime,
            status: nextStatus,
          })
          .eq('id', 'main')
          .eq('timer_remaining', prev.timer_remaining)
          .eq('status', 'running')
          .select()
          .maybeSingle()

        if (error) {
          console.error('landmark timer save error:', error)
          return
        }

        // 다른 창이 먼저 갱신했다면 여기서는 로컬 값을 강제로 내리지 않고 DB 값을 다시 읽습니다.
        if (!data) {
          await loadAuctionData()
          return
        }

        const savedState = normalizeState(data)
        auctionStateRef.current = savedState
        setAuctionState(savedState)
        saveLocalOverlaySnapshot(teamsRef.current, landmarksRef.current, savedState, logsRef.current)

        if (nextTime <= 0 && timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
          releaseTimerOwner(LANDMARK_TIMER_OWNER_KEY, timerOwnerIdRef.current)
        }
      } finally {
        isTickingRef.current = false
      }
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      releaseTimerOwner(LANDMARK_TIMER_OWNER_KEY, timerOwnerIdRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionState.status, isAdmin, loadAuctionData, saveLocalOverlaySnapshot])

  const handleStart = async () => {
    if (!isAdmin) return

    const current = landmarksRef.current.find(
      (landmark) => landmark.id === auctionStateRef.current.current_landmark_id
    )

    if (!current) {
      const firstLandmark = getNextLandmark()

      if (!firstLandmark) {
        alert('경매 가능한 랜드마크가 없습니다.')
        return
      }

      await clearAuctionLogs()

      await saveAuctionState({
        current_landmark_id: firstLandmark.id,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: DEFAULT_TIMER,
        status: 'running',
      })

      return
    }

    await saveAuctionState({
      ...auctionStateRef.current,
      status: 'running',
    })
  }

  const handlePause = async () => {
    if (!isAdmin) return
    await saveAuctionState({
      ...auctionStateRef.current,
      status: 'paused',
    })
  }

  const handleBid = async (team: LocalTeam, amount: number) => {
    const currentState = auctionStateRef.current
    const latestTeam = teamsRef.current.find((item) => item.id === team.id) || team
    const safeAmount = Number(amount)

    if (!isAdmin && joinedTeamId !== latestTeam.id) return

    const wonLandmarkCount = landmarksRef.current.filter(
      (landmark) => landmark.team_id === latestTeam.id
    ).length

    if (wonLandmarkCount >= 2) {
      alert('이미 랜드마크 2개를 가져간 팀은 더 이상 입찰할 수 없습니다.')
      return
    }

    const ownedLandmarks = landmarksRef.current.filter(
      (landmark) => landmark.team_id === latestTeam.id
    )
    const currentAuctionLandmark = landmarksRef.current.find(
      (landmark) => landmark.id === currentState.current_landmark_id
    )

    if (hasSameMapLandmark(ownedLandmarks, currentAuctionLandmark)) {
      alert('이미 같은 맵의 랜드마크를 가져간 팀은 입찰할 수 없습니다.')
      return
    }

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) return
    if (!currentState.current_landmark_id) {
      alert('현재 경매 중인 랜드마크가 없습니다.')
      return
    }
    if (currentState.status !== 'running' || currentState.timer_remaining <= 0) {
      alert('입찰 시간이 종료되었습니다.')
      return
    }
    if (safeAmount <= currentState.current_bid) return
    if (Number(latestTeam.points || 0) < safeAmount) {
      alert('보유 포인트보다 많이 입찰할 수 없습니다.')
      return
    }

    await saveAuctionState({
      ...currentState,
      current_bid: safeAmount,
      current_bidder_team_id: latestTeam.id,
      timer_remaining: DEFAULT_TIMER,
    })

    await addLog('bid', `[${latestTeam.name} - ${safeAmount}포인트 입찰]`)
  }

  const handleSold = async () => {
    if (!isAdmin) return

    const currentState = auctionStateRef.current
    const currentLandmark = landmarksRef.current.find(
      (landmark) => landmark.id === currentState.current_landmark_id
    )

    if (!currentLandmark || !currentState.current_bidder_team_id) return

    const team = teamsRef.current.find((t) => t.id === currentState.current_bidder_team_id)
    if (!team) return

    const nextLandmarks = landmarksRef.current.map((landmark) =>
      landmark.id === currentLandmark.id
        ? {
            ...landmark,
            team_id: team.id,
            bid_amount: currentState.current_bid,
            is_passed: false,
          }
        : landmark
    )

    const nextTeams = teamsRef.current.map((t) =>
      t.id === team.id
        ? {
            ...t,
            points: Math.max(0, t.points - currentState.current_bid),
            landmarks: Array.from(new Set([...(t.landmarks || []), currentLandmark.id])),
          }
        : t
    )

    await saveLandmarks(nextLandmarks)
    await saveTeams(nextTeams)
    await addLog('sold', `[${currentLandmark.name} - ${team.name} ${currentState.current_bid}포인트 낙찰]`)

    const nextLandmark = nextLandmarks.find(isAuctionTargetLandmark)

    await saveAuctionState({
      current_landmark_id: nextLandmark?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextLandmark ? 'paused' : 'ready',
    })
  }

  const handlePassed = async () => {
    if (!isAdmin) return

    const currentState = auctionStateRef.current
    const currentLandmark = landmarksRef.current.find(
      (landmark) => landmark.id === currentState.current_landmark_id
    )
    if (!currentLandmark) return

    const nextLandmarks = landmarksRef.current.map((landmark) =>
      landmark.id === currentLandmark.id
        ? {
            ...landmark,
            is_passed: true,
          }
        : landmark
    )

    await saveLandmarks(nextLandmarks)
    await addLog('passed', `[${currentLandmark.name} - 유찰]`)

    const nextLandmark = nextLandmarks.find(isAuctionTargetLandmark)

    await saveAuctionState({
      current_landmark_id: nextLandmark?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextLandmark ? 'paused' : 'ready',
    })
  }

  const handleSelectLandmark = async (landmark: LocalLandmark) => {
    if (!isAdmin) return
    if (!isAuctionTargetLandmark(landmark)) return

    await clearAuctionLogs()

    await saveAuctionState({
      current_landmark_id: landmark.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handlePrevLandmark = async () => {
    if (!isAdmin) return

    const availableLandmarks = getAvailableLandmarks()
    const currentId = auctionStateRef.current.current_landmark_id
    const currentIndex = currentId
      ? availableLandmarks.findIndex((landmark) => landmark.id === currentId)
      : 0

    const prevLandmark = availableLandmarks[currentIndex - 1]
    if (!prevLandmark) return

    await clearAuctionLogs()

    await saveAuctionState({
      current_landmark_id: prevLandmark.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleNextLandmark = async () => {
    if (!isAdmin) return

    const nextLandmark = getNextLandmark()
    if (!nextLandmark) return

    await clearAuctionLogs()

    await saveAuctionState({
      current_landmark_id: nextLandmark.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleShuffleLandmarks = async () => {
    if (!isAdmin) return

    const availableLandmarks = getAvailableLandmarks()
    const unavailableLandmarks = landmarksRef.current.filter((landmark) => !isAuctionTargetLandmark(landmark))

    if (availableLandmarks.length < 2) {
      alert('랜드마크가 2개 이상 있어야 섞을 수 있습니다.')
      return
    }

    const shuffled = [...availableLandmarks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const orderedAvailableLandmarks = shuffled.map((landmark, index) => ({
      ...landmark,
      auction_order: index + 1,
    }))

    const orderedUnavailableLandmarks = unavailableLandmarks.map((landmark, index) => ({
      ...landmark,
      auction_order: orderedAvailableLandmarks.length + index + 1,
    }))

    const nextLandmarks = [...orderedAvailableLandmarks, ...orderedUnavailableLandmarks]

    await saveLandmarks(nextLandmarks)
    await clearAuctionLogs()

    await saveAuctionState({
      current_landmark_id: shuffled[0].id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleResetLandmarkAuction = async () => {
    if (!isAdmin) return
    if (!confirm('랜드마크 경매를 전체 초기화할까요?')) return

    const resetLandmarks = landmarksRef.current.map((landmark) => ({
      ...landmark,
      team_id: null,
      bid_amount: 0,
      is_passed: false,
    }))

    await saveLandmarks(resetLandmarks)
    await clearAuctionLogs()

    const firstLandmark = resetLandmarks.find(isAuctionTargetLandmark) || null

    await saveAuctionState({
      current_landmark_id: firstLandmark?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'ready',
    })
  }

  const handleRecoverPassed = async (landmark: LocalLandmark) => {
    if (!isAdmin) return

    const nextLandmarks = landmarksRef.current.map((item) =>
      item.id === landmark.id
        ? {
            ...item,
            is_passed: false,
          }
        : item
    )

    await saveLandmarks(nextLandmarks)
  }

  const availableCount = safeLandmarks.filter(isAuctionTargetLandmark).length
  const displayTeams = [...safeTeams].sort((a, b) => getTeamNumber(a.id) - getTeamNumber(b.id))
  const leftTeams = displayTeams.slice(0, 8)
  const rightTeams = displayTeams.slice(8, 16)

  const openResultsPage = async () => {
  localStorage.setItem(
    'auction_snapshot',
    JSON.stringify({
      teams: safeTeams,
      landmarks: safeLandmarks,
      created_at: new Date().toISOString(),
    })
  )

  await supabase
    .from('auction_state')
    .update({ overlay_mode: 'results' })
    .eq('id', 'main')

  window.location.href = '/admin/results'
}

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-[1880px] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={isAdmin ? '/admin' : '/'}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-2xl font-black text-primary">랜드마크 경매</h1>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? '관리자 모드 / 랜드마크 경매 관리'
                  : '참가자 모드 / 랜드마크 입찰만 가능합니다'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={switchToPlayerAuction}>
              플레이어 경매
            </Button>

            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => window.open('/overlay', '_blank')}>
                  OBS 화면 열기
                </Button>

                <Button variant="outline" size="sm" onClick={handleShuffleLandmarks}>
                  <Shuffle className="mr-1 h-4 w-4" />
                  랜덤 랜드마크 순서
                </Button>

                <Button variant="outline" size="sm" onClick={openResultsPage}>
                  결과창
                </Button>
              </>
            )}
          </div>
        </div>


        {!isAdmin && (
          <section className="rounded-xl border border-border bg-card p-4">
            {joinedTeam ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">입장 완료</p>
                  <p className="text-xl font-black text-primary">{joinedTeam.name}만 입찰할 수 있습니다.</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogoutTeam}>
                  팀 코드 다시 입력
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px]">
                  <p className="text-sm text-muted-foreground">팀장 코드 입력</p>
                  <p className="text-lg font-black">코드를 입력해야 해당 팀으로 입찰할 수 있습니다.</p>
                </div>
                <input
                  value={teamCodeInput}
                  onChange={(e) => setTeamCodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLoginTeam()
                  }}
                  placeholder="팀 코드 입력"
                  className="min-w-[220px] rounded border border-border bg-input px-3 py-2 text-sm"
                />
                <Button onClick={handleLoginTeam}>팀 입장</Button>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-12 gap-5">
          <section className="col-span-3 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xl font-semibold text-primary">현재 랜드마크</h3>

            {currentLandmark ? (
              <div className="flex gap-4">
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {getLandmarkImage(currentLandmark) ? (
                    <img
                      src={getLandmarkImage(currentLandmark)!}
                      alt={currentLandmark.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-black text-muted-foreground">
                      {(currentLandmark.name || '')[0]}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  {currentLandmark.category && (
                    <p className="text-base font-black text-primary">
                      {currentLandmark.category}
                    </p>
                  )}
                  <p className="truncate text-base font-black text-primary">
                    {currentLandmark.category || currentLandmark.map || '랜드마크'}
                  </p>
                  <h4 className="truncate text-4xl font-black">
                    {currentLandmark.name}
                  </h4>
                  <p className="text-lg font-semibold">
                    현재 입찰: {auctionState.current_bid}포인트
                  </p>
                  <p className="text-lg font-semibold">
                    입찰 팀: {currentBidderTeam?.name || '없음'}
                  </p>
                  <p className="text-lg font-semibold">
                    상태:{' '}
                    {auctionState.status === 'running'
                      ? '진행중'
                      : auctionState.status === 'paused'
                      ? '정지'
                      : '대기'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">랜드마크를 선택하세요</p>
            )}

            <div className="mt-5 text-center">
              <p className="text-xs text-muted-foreground">남은 시간</p>
              <p className="text-6xl font-black text-white">{auctionState.timer_remaining}</p>
              <p className="text-xs text-muted-foreground">초</p>
            </div>
          </section>

          <section className="col-span-7 rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-primary">랜드마크 순서</h3>
              <span className="text-sm text-muted-foreground">
                {availableCount}개 대기
              </span>
            </div>

            <div className="grid grid-cols-10 gap-3">
              {orderedLandmarks.map((landmark, index) => (
                  <button
                    key={landmark.id}
                    type="button"
                    onClick={() => handleSelectLandmark(landmark)}
                    disabled={!isAdmin}
                    className={`relative aspect-square overflow-hidden rounded-lg border bg-secondary transition-all ${
                      index === 0
                        ? 'border-primary ring-2 ring-primary'
                        : 'border-border'
                    } ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {getLandmarkImage(landmark) ? (
                      <img
                        src={getLandmarkImage(landmark)!}
                        alt={landmark.name}
                        className="absolute inset-0 h-full w-full object-cover opacity-55"
                      />
                    ) : null}

                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-1 py-2">
                      <p className="mb-1 w-full truncate text-center text-[10px] font-black text-primary">
                        {landmark.category || landmark.map || '맵'}
                      </p>
                      <p className="w-full truncate text-center text-[15px] font-black text-white leading-tight">
                        {landmark.name}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </section>

          <section className="col-span-2 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xl font-black text-primary">유찰 랜드마크</h3>

            {passedLandmarks.length > 0 ? (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {passedLandmarks.map((landmark) => (
                  <div key={landmark.id} className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <span className="font-bold">{landmark.name}</span>

                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => handleRecoverPassed(landmark)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-md text-muted-foreground">아직 유찰 랜드마크가 없습니다.</p>
            )}
          </section>
        </div>

        {isAdmin && (
          <div className="rounded-xl border border-border bg-card/80 p-3 flex flex-wrap items-center justify-center gap-2">
            <Button
              className="h-10 px-4 text-sm font-bold bg-red-600 hover:bg-red-700"
              onClick={handleStart}
              disabled={auctionState.status === 'running'}
            >
              <Play className="mr-2 h-5 w-5" />
              시작
            </Button>

            <Button
              variant="secondary"
              className="h-10 px-4 text-sm font-bold"
              onClick={handlePause}
              disabled={auctionState.status !== 'running'}
            >
              <Pause className="mr-2 h-5 w-5" />
              정지
            </Button>

            <Button
              className="h-10 px-4 text-sm font-bold bg-green-600 hover:bg-green-700"
              onClick={handleSold}
              disabled={!auctionState.current_bidder_team_id}
            >
              <Check className="mr-2 h-5 w-5" />
              낙찰
            </Button>

            <Button
              variant="destructive"
              className="h-10 px-4 text-sm font-bold"
              onClick={handlePassed}
              disabled={!currentLandmark}
            >
              <X className="mr-2 h-5 w-5" />
              유찰
            </Button>

            <Button
              variant="outline"
              className="h-10 px-4 text-sm font-bold"
              onClick={handlePrevLandmark}
            >
              <ChevronLeft className="mr-2 h-5 w-5" />
              이전 랜드마크
            </Button>

            <Button
              variant="outline"
              className="h-10 px-4 text-sm font-bold"
              onClick={handleNextLandmark}
            >
              다음 랜드마크
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              variant="destructive"
              className="h-10 px-4 text-sm font-bold bg-red-900 hover:bg-red-800"
              onClick={handleResetLandmarkAuction}
            >
              랜드마크 초기화
            </Button>
          </div>
        )}

        <div className="grid grid-cols-[1fr_620px_1fr] gap-4">
          <section className="space-y-3">
            <h3 className="text-lg font-black text-primary">팀 입찰 1~8</h3>
            <div className="grid grid-cols-2 gap-3">
              {leftTeams.map((team) => (
                <LandmarkTeamBidCard
                  key={team.id}
                  team={team}
                  landmarks={safeLandmarks.filter((landmark) => landmark.team_id === team.id || team.landmarks?.includes(landmark.id))}
                  onBid={(amount) => handleBid(team, amount)}
                  currentBid={auctionState.current_bid}
                  isCurrentBidder={team.id === auctionState.current_bidder_team_id}
                  disabled={
                    auctionState.status === 'ready' ||
                    (!isAdmin && joinedTeamId !== team.id) ||
                    safeLandmarks.filter((landmark) => landmark.team_id === team.id || team.landmarks?.includes(landmark.id)).length >= 2 ||
                    hasSameMapLandmark(
                      safeLandmarks.filter((landmark) => landmark.team_id === team.id || team.landmarks?.includes(landmark.id)),
                      currentLandmark
                    )
                  }
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-2xl font-black text-primary">경매 로그</h3>
                <span className="text-sm font-bold text-muted-foreground">
                  최신 입찰이 위에 표시됩니다
                </span>
              </div>

              <div className="min-h-[420px] max-h-[520px] space-y-2 overflow-y-auto rounded-lg border border-border bg-background/35 p-4 text-base font-bold">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <p
                      key={log.id}
                      className={`rounded-md bg-black/25 px-3 py-2 ${
                        log.action === 'bid'
                          ? 'text-yellow-400'
                          : log.action === 'sold'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {log.message}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">아직 입찰 기록 없음</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-black text-primary">랜드마크 현황 요약</h3>
                <span className="text-xs text-muted-foreground">보유 랜드마크</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                {safeTeams.map((team) => {
                  const ownedLandmarks = safeLandmarks.filter((landmark) =>
                    landmark.team_id === team.id || team.landmarks?.includes(landmark.id)
                  )

                  return (
                    <div key={team.id} className="flex items-center justify-between gap-2 rounded bg-background/45 px-2 py-2">
                      <span className="truncate font-extrabold text-white">{team.name}</span>
                      <span className="shrink-0 max-w-[150px] truncate text-xs font-bold text-primary">
                        {ownedLandmarks.length > 0
                          ? ownedLandmarks.map((landmark) => landmark.name).join(', ')
                          : '-'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-black text-primary">팀 입찰 9~16</h3>
            <div className="grid grid-cols-2 gap-3">
              {rightTeams.map((team) => (
                <LandmarkTeamBidCard
                  key={team.id}
                  team={team}
                  landmarks={safeLandmarks.filter((landmark) => landmark.team_id === team.id || team.landmarks?.includes(landmark.id))}
                  onBid={(amount) => handleBid(team, amount)}
                  currentBid={auctionState.current_bid}
                  isCurrentBidder={team.id === auctionState.current_bidder_team_id}
                  disabled={
                    auctionState.status === 'ready' ||
                    (!isAdmin && joinedTeamId !== team.id) ||
                    safeLandmarks.filter((landmark) => landmark.team_id === team.id || team.landmarks?.includes(landmark.id)).length >= 2 ||
                    hasSameMapLandmark(
                      safeLandmarks.filter((landmark) => landmark.team_id === team.id || team.landmarks?.includes(landmark.id)),
                      currentLandmark
                    )
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

interface LandmarkTeamBidCardProps {
  team: LocalTeam
  landmarks: LocalLandmark[]
  onBid: (amount: number) => void
  currentBid: number
  isCurrentBidder: boolean
  disabled: boolean
}

function LandmarkTeamBidCard({
  team,
  landmarks,
  onBid,
  currentBid,
  isCurrentBidder,
  disabled,
}: LandmarkTeamBidCardProps) {
  const [bidAmount, setBidAmount] = useState('')

  const safeLandmarks = Array.isArray(landmarks) ? landmarks : []

  const handleCustomBid = () => {
    const amount = parseInt(bidAmount)

    if (amount > currentBid && amount <= team.points) {
      onBid(amount)
      setBidAmount('')
    }
  }

  return (
    <div
      className={`rounded-xl border bg-card p-3 transition-all ${
        isCurrentBidder ? 'border-primary shadow-[0_0_16px_rgba(239,68,68,0.35)]' : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-lg font-extrabold text-white">{team.name}</span>
        <span className="shrink-0 text-base font-extrabold text-primary">{team.points}포인트</span>
      </div>

      <div className="mb-2 min-h-[66px] rounded-lg border border-dashed border-border bg-background/40 p-2">
        {safeLandmarks.length > 0 ? (
          <div className="space-y-1.5">
            {safeLandmarks.map((landmark) => (
              <div key={landmark.id} className="flex items-center justify-between gap-2 rounded bg-secondary/60 px-2 py-1">
                <span className="truncate text-base font-bold">{landmark.name}</span>
                <span className="shrink-0 text-xs font-black text-primary">
                  {landmark.bid_amount || 0}P
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-[46px] items-center justify-center text-xs text-muted-foreground">
            아직 낙찰 없음
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={bidAmount}
          onChange={(e) => setBidAmount(e.target.value)}
          placeholder="입찰액"
          className="min-w-0 flex-1 rounded border border-border bg-input px-3 py-2 text-sm"
          disabled={disabled}
        />

        <Button
          size="sm"
          className="h-9 shrink-0"
          onClick={handleCustomBid}
          disabled={disabled || !bidAmount}
        >
          입찰
        </Button>
      </div>
    </div>
  )
}
