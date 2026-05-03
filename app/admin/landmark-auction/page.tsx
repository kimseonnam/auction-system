'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
}

type LocalTeam = {
  id: string
  name: string
  points: number
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

const DEFAULT_TIMER = 15
const DEFAULT_POINTS = 0

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

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback

  try {
    const parsed = JSON.parse(value)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : []
}

function normalizeTeams(value: unknown): LocalTeam[] {
  const rawTeams = asArray<any>(value)

  return rawTeams.map((team, index) => ({
    id: typeof team?.id === 'string' ? team.id : `team-${index + 1}`,
    name: typeof team?.name === 'string' ? team.name : `TEAM ${index + 1}`,
    points: Number.isFinite(Number(team?.points)) ? Number(team.points) : 0,
    landmarks: Array.isArray(team?.landmarks) ? team.landmarks.filter((id: unknown) => typeof id === 'string') : [],
  }))
}

function normalizeLandmarks(value: unknown): LocalLandmark[] {
  const rawValue = value as any
  const flatItems: any[] = []

  const pushChild = (child: any, category: string, childIndex: number) => {
    // child가 문자열이면 그대로 지역명으로 사용
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

  // 1) [{ name: '에란겔', landmarks: [...] }] 같은 배열 구조
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
        // 이미 평평한 랜드마크 배열인 경우
        flatItems.push(item)
      }
    })
  }

  // 2) { 에란겔: [...] } 같은 객체 구조
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
      landmark?.landmark ||
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
      landmark?.value ||
      landmark?.text ||
      landmark?.content ||
      landmark?.displayName ||
      landmark?.subName ||
      landmark?.pointName ||
      landmark?.point_name ||
      `랜드마크 ${index + 1}`

    return {
      ...landmark,
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

function normalizeLogs(value: unknown): AuctionLog[] {
  return asArray<any>(value)
    .filter((log) => log?.action === 'bid' || log?.action === 'sold' || log?.action === 'passed')
    .map((log) => ({
      id: typeof log.id === 'string' ? log.id : crypto.randomUUID(),
      action: log.action,
      message: typeof log.message === 'string' ? log.message : '',
      created_at: typeof log.created_at === 'string' ? log.created_at : new Date().toISOString(),
    }))
}

const getLandmarkImage = (landmark?: LocalLandmark | null) =>
  landmark?.image_url || landmark?.image || null

const isAuctionTargetLandmark = (landmark: LocalLandmark) =>
  !landmark.team_id && !landmark.is_passed

export default function LandmarkAuctionPage() {
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [role, setRole] = useState<AuctionRole>('participant')
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [auctionState, setAuctionState] = useState<LandmarkAuctionState>(defaultAuctionState)
  const [logs, setLogs] = useState<AuctionLog[]>([])

  const isAdmin = role === 'admin'

  const safeTeams = Array.isArray(teams) ? teams : []
  const safeLandmarks = Array.isArray(landmarks) ? landmarks : []

  const currentLandmark = safeLandmarks.find(
    (landmark) => landmark.id === auctionState.current_landmark_id
  )
  const currentBidderTeam = safeTeams.find(
    (team) => team.id === auctionState.current_bidder_team_id
  )
  const passedLandmarks = safeLandmarks.filter((landmark) => landmark.is_passed)

  const loadLocalData = useCallback(() => {
    const savedRole = sessionStorage.getItem('auction_role')
    setRole(savedRole === 'admin' || savedRole === 'participant' ? savedRole : 'participant')

    localStorage.setItem('auction_mode', 'landmark')

    const loadedTeams = normalizeTeams(
      safeJsonParse<unknown>(localStorage.getItem('auction_teams'), [])
    )

    const finalTeams = loadedTeams.length > 0 ? loadedTeams : createDefaultTeams()
    setTeams(finalTeams)
    localStorage.setItem('auction_teams', JSON.stringify(finalTeams))

    const savedLandmarks =
      localStorage.getItem('auction_landmarks') ||
      localStorage.getItem('landmarks') ||
      localStorage.getItem('auction_landmark_items')

    const loadedLandmarks = normalizeLandmarks(safeJsonParse<unknown>(savedLandmarks, []))
    setLandmarks(loadedLandmarks)
    localStorage.setItem('auction_landmarks', JSON.stringify(loadedLandmarks))

    const loadedState = normalizeState(
      safeJsonParse<unknown>(localStorage.getItem('landmark_auction_state'), defaultAuctionState)
    )
    setAuctionState(loadedState)

    const loadedLogs = normalizeLogs(
      safeJsonParse<unknown>(localStorage.getItem('landmark_auction_logs'), [])
    )
    setLogs(loadedLogs)
  }, [])

  useEffect(() => {
    loadLocalData()

    const interval = setInterval(loadLocalData, 500)
    window.addEventListener('storage', loadLocalData)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', loadLocalData)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loadLocalData])

  const saveTeams = (nextTeams: LocalTeam[]) => {
    const normalized = normalizeTeams(nextTeams)
    setTeams(normalized)
    localStorage.setItem('auction_teams', JSON.stringify(normalized))
  }

  const saveLandmarks = (nextLandmarks: LocalLandmark[]) => {
    const normalized = normalizeLandmarks(nextLandmarks)
    setLandmarks(normalized)
    localStorage.setItem('auction_landmarks', JSON.stringify(normalized))
  }

  const saveAuctionState = (nextState: LandmarkAuctionState) => {
    const normalized = normalizeState(nextState)
    setAuctionState(normalized)
    localStorage.setItem('landmark_auction_state', JSON.stringify(normalized))
  }

  const clearAuctionLogs = () => {
    setLogs([])
    localStorage.setItem('landmark_auction_logs', JSON.stringify([]))
  }

  const addLog = (action: string, message: string) => {
    if (action !== 'bid' && action !== 'sold' && action !== 'passed') return

    const newLog: AuctionLog = {
      id: crypto.randomUUID(),
      action,
      message,
      created_at: new Date().toISOString(),
    }

    setLogs((prevLogs) => {
      // 입찰은 누적 표시, 낙찰/유찰은 기존 로그를 전부 지우고 결과 1개만 표시
      const nextLogs =
        action === 'bid'
          ? [newLog, ...normalizeLogs(prevLogs)].slice(0, 30)
          : [newLog]

      localStorage.setItem('landmark_auction_logs', JSON.stringify(nextLogs))
      return nextLogs
    })
  }

  const getAvailableLandmarks = useCallback(() => {
    return safeLandmarks.filter(isAuctionTargetLandmark)
  }, [safeLandmarks])

  const getNextLandmark = useCallback(() => {
    const availableLandmarks = getAvailableLandmarks()
    if (availableLandmarks.length === 0) return null

    const currentIndex = currentLandmark
      ? availableLandmarks.findIndex((landmark) => landmark.id === currentLandmark.id)
      : -1

    return availableLandmarks[currentIndex + 1] || availableLandmarks[0]
  }, [getAvailableLandmarks, currentLandmark])

  useEffect(() => {
    if (!isAdmin) return
    if (auctionState.status !== 'running') return

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setAuctionState((prev) => {
        const nextTime = prev.timer_remaining - 1

        if (nextTime <= 0) {
          clearInterval(timerRef.current!)

          const nextState: LandmarkAuctionState = {
            ...prev,
            timer_remaining: 0,
            status: 'paused',
          }

          localStorage.setItem('landmark_auction_state', JSON.stringify(nextState))
          return nextState
        }

        const nextState: LandmarkAuctionState = {
          ...prev,
          timer_remaining: nextTime,
        }

        localStorage.setItem('landmark_auction_state', JSON.stringify(nextState))
        return nextState
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [auctionState.status, isAdmin])

  const handleStart = () => {
    if (!isAdmin) return

    if (!currentLandmark) {
      const firstLandmark = getNextLandmark()

      if (!firstLandmark) {
        alert('경매 가능한 랜드마크가 없습니다.')
        return
      }

      clearAuctionLogs()

      saveAuctionState({
        current_landmark_id: firstLandmark.id,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: DEFAULT_TIMER,
        status: 'running',
      })

      return
    }

    saveAuctionState({
      ...auctionState,
      status: 'running',
    })
  }

  const handlePause = () => {
    if (!isAdmin) return
    saveAuctionState({
      ...auctionState,
      status: 'paused',
    })
  }

  const handleBid = (team: LocalTeam, amount: number) => {
    if (amount <= auctionState.current_bid) return
    if (team.points < amount) return

    saveAuctionState({
      ...auctionState,
      current_bid: amount,
      current_bidder_team_id: team.id,
      timer_remaining: DEFAULT_TIMER,
    })

    addLog('bid', `[${team.name} - ${amount}포인트 입찰]`)
  }

  const handleSold = () => {
    if (!isAdmin) return
    if (!currentLandmark || !auctionState.current_bidder_team_id) return

    const team = safeTeams.find((t) => t.id === auctionState.current_bidder_team_id)
    if (!team) return

    const nextLandmarks = safeLandmarks.map((landmark) =>
      landmark.id === currentLandmark.id
        ? {
            ...landmark,
            team_id: team.id,
            bid_amount: auctionState.current_bid,
            is_passed: false,
          }
        : landmark
    )

    const nextTeams = safeTeams.map((t) =>
      t.id === team.id
        ? {
            ...t,
            points: Math.max(0, t.points - auctionState.current_bid),
            landmarks: Array.from(new Set([...(t.landmarks || []), currentLandmark.id])),
          }
        : t
    )

    saveLandmarks(nextLandmarks)
    saveTeams(nextTeams)

    addLog('sold', `[${currentLandmark.name} - ${team.name} ${auctionState.current_bid}포인트 낙찰]`)

    const nextLandmark = nextLandmarks.find(isAuctionTargetLandmark)

    saveAuctionState({
      current_landmark_id: nextLandmark?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextLandmark ? 'paused' : 'ready',
    })
  }

  const handlePassed = () => {
    if (!isAdmin) return
    if (!currentLandmark) return

    const nextLandmarks = safeLandmarks.map((landmark) =>
      landmark.id === currentLandmark.id
        ? {
            ...landmark,
            is_passed: true,
          }
        : landmark
    )

    saveLandmarks(nextLandmarks)
    addLog('passed', `[${currentLandmark.name} - 유찰]`)

    const nextLandmark = nextLandmarks.find(isAuctionTargetLandmark)

    saveAuctionState({
      current_landmark_id: nextLandmark?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextLandmark ? 'paused' : 'ready',
    })
  }

  const handleSelectLandmark = (landmark: LocalLandmark) => {
    if (!isAdmin) return
    if (!isAuctionTargetLandmark(landmark)) return

    clearAuctionLogs()

    saveAuctionState({
      current_landmark_id: landmark.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handlePrevLandmark = () => {
    if (!isAdmin) return

    const availableLandmarks = getAvailableLandmarks()
    const currentIndex = currentLandmark
      ? availableLandmarks.findIndex((landmark) => landmark.id === currentLandmark.id)
      : 0

    const prevLandmark = availableLandmarks[currentIndex - 1]
    if (!prevLandmark) return

    clearAuctionLogs()

    saveAuctionState({
      current_landmark_id: prevLandmark.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleNextLandmark = () => {
    if (!isAdmin) return

    const nextLandmark = getNextLandmark()
    if (!nextLandmark) return

    clearAuctionLogs()

    saveAuctionState({
      current_landmark_id: nextLandmark.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleShuffleLandmarks = () => {
    if (!isAdmin) return

    const availableLandmarks = getAvailableLandmarks()
    const unavailableLandmarks = safeLandmarks.filter((landmark) => !isAuctionTargetLandmark(landmark))

    if (availableLandmarks.length < 2) {
      alert('랜드마크가 2개 이상 있어야 섞을 수 있습니다.')
      return
    }

    const shuffled = [...availableLandmarks]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const nextLandmarks = [...shuffled, ...unavailableLandmarks]

    saveLandmarks(nextLandmarks)
    clearAuctionLogs()

    saveAuctionState({
      current_landmark_id: shuffled[0].id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleResetLandmarkAuction = () => {
    if (!isAdmin) return
    if (!confirm('랜드마크 경매를 전체 초기화할까요?')) return

    const resetLandmarks = safeLandmarks.map((landmark) => ({
      ...landmark,
      team_id: null,
      bid_amount: 0,
      is_passed: false,
    }))

    const resetTeams = safeTeams.map((team) => ({
      ...team,
      landmarks: [],
    }))

    saveLandmarks(resetLandmarks)
    saveTeams(resetTeams)
    clearAuctionLogs()

    const firstLandmark = resetLandmarks.find(isAuctionTargetLandmark) || null

    saveAuctionState({
      current_landmark_id: firstLandmark?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'ready',
    })
  }

  const handleRecoverPassed = (landmark: LocalLandmark) => {
    if (!isAdmin) return

    const nextLandmarks = safeLandmarks.map((item) =>
      item.id === landmark.id
        ? {
            ...item,
            is_passed: false,
          }
        : item
    )

    saveLandmarks(nextLandmarks)
  }

  const availableCount = safeLandmarks.filter(isAuctionTargetLandmark).length
  const leftTeams = safeTeams.slice(0, 8)
  const rightTeams = safeTeams.slice(8, 16)

  const openResultsPage = () => {
    const savedAuctionPlayers = safeJsonParse<unknown>(
      localStorage.getItem('auction_players'),
      []
    )
    const savedRegisteredPlayers = safeJsonParse<unknown>(
      localStorage.getItem('players'),
      []
    )

    localStorage.setItem(
      'auction_snapshot',
      JSON.stringify({
        teams: safeTeams,
        landmarks: safeLandmarks,
        auction_players: savedAuctionPlayers,
        players: savedRegisteredPlayers,
        created_at: new Date().toISOString(),
      })
    )

    localStorage.setItem('auction_mode', 'results')
    window.location.href = '/admin/results'
  }

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="mx-auto max-w-[1880px] space-y-5">
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
            <Link
              href="/admin/auction"
              onClick={() => localStorage.setItem('auction_mode', 'player')}
            >
              <Button variant="outline" size="sm">
                플레이어 경매
              </Button>
            </Link>

            <Button variant="outline" size="sm" onClick={() => window.open('/overlay', '_blank')}>
              OBS 화면 열기
            </Button>

            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleShuffleLandmarks}>
                <Shuffle className="mr-1 h-4 w-4" />
                랜덤 랜드마크 순서
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={openResultsPage}>
              결과창
            </Button>
          </div>
        </div>

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

          <section className="col-span-6 rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-primary">랜드마크 순서</h3>
              <span className="text-sm text-muted-foreground">
                {availableCount}개 대기
              </span>
            </div>

            <div className="grid grid-cols-6 gap-3">
              {safeLandmarks
                .filter(isAuctionTargetLandmark)
                .map((landmark) => (
                  <button
                    key={landmark.id}
                    type="button"
                    onClick={() => handleSelectLandmark(landmark)}
                    disabled={!isAdmin}
                    className={`relative h-24 min-w-24 overflow-hidden rounded-lg border bg-secondary transition-all ${
                      landmark.id === currentLandmark?.id
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

          <section className="col-span-3 rounded-xl border border-border bg-card p-5">
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
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              className="h-12 px-6 text-base font-bold bg-red-600 hover:bg-red-700"
              onClick={handleStart}
              disabled={auctionState.status === 'running'}
            >
              <Play className="mr-2 h-5 w-5" />
              시작
            </Button>

            <Button
              variant="secondary"
              className="h-12 px-6 text-base font-bold"
              onClick={handlePause}
              disabled={auctionState.status !== 'running'}
            >
              <Pause className="mr-2 h-5 w-5" />
              정지
            </Button>

            <Button
              className="h-12 px-6 text-base font-bold bg-green-600 hover:bg-green-700"
              onClick={handleSold}
              disabled={!auctionState.current_bidder_team_id}
            >
              <Check className="mr-2 h-5 w-5" />
              낙찰
            </Button>

            <Button
              variant="destructive"
              className="h-12 px-6 text-base font-bold"
              onClick={handlePassed}
              disabled={!currentLandmark}
            >
              <X className="mr-2 h-5 w-5" />
              유찰
            </Button>

            <Button
              variant="outline"
              className="h-12 px-6 text-base font-bold"
              onClick={handlePrevLandmark}
            >
              <ChevronLeft className="mr-2 h-5 w-5" />
              이전 랜드마크
            </Button>

            <Button
              variant="outline"
              className="h-12 px-6 text-base font-bold"
              onClick={handleNextLandmark}
            >
              다음 랜드마크
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              variant="destructive"
              className="h-12 px-6 text-base font-bold bg-red-900 hover:bg-red-800"
              onClick={handleResetLandmarkAuction}
            >
              랜드마크 초기화
            </Button>
          </div>
        )}

        <div className="grid grid-cols-[1fr_440px_1fr] gap-5">
          <section className="space-y-3">
            <h3 className="text-lg font-black text-primary">팀 입찰 1~8</h3>
            <div className="grid grid-cols-2 gap-3">
              {leftTeams.map((team) => (
                <LandmarkTeamBidCard
                  key={team.id}
                  team={team}
                  landmarks={safeLandmarks.filter((landmark) => team.landmarks?.includes(landmark.id))}
                  onBid={(amount) => handleBid(team, amount)}
                  currentBid={auctionState.current_bid}
                  isCurrentBidder={team.id === auctionState.current_bidder_team_id}
                  disabled={auctionState.status === 'ready'}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-xl font-black text-primary">경매 로그</h3>
              <div className="space-y-1 max-h-[180px] overflow-y-auto text-sm">
                {logs.length > 0 ? (
                  logs.map((log) => (
                    <p
                      key={log.id}
                      className={
                        log.action === 'bid'
                          ? 'text-yellow-400'
                          : log.action === 'sold'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }
                    >
                      {log.message}
                    </p>
                  ))
                ) : (
                  <p className="text-muted-foreground">아직 입찰 기록 없음</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-xl font-black text-primary">랜드마크 현황</h3>
              <div className="grid grid-cols-1 gap-2 text-sm">
                {safeTeams.map((team) => {
                  const ownedLandmarks = safeLandmarks.filter((landmark) =>
                    team.landmarks?.includes(landmark.id)
                  )

                  return (
                    <div key={team.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-lg font-extrabold text-white">{team.name}</span>
                      <span className="shrink-0 text-white text-sm font-bold">
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
                  landmarks={safeLandmarks.filter((landmark) => team.landmarks?.includes(landmark.id))}
                  onBid={(amount) => handleBid(team, amount)}
                  currentBid={auctionState.current_bid}
                  isCurrentBidder={team.id === auctionState.current_bidder_team_id}
                  disabled={auctionState.status === 'ready'}
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
      className={`rounded-xl border bg-card p-4 transition-all ${
        isCurrentBidder ? 'border-primary shadow-[0_0_16px_rgba(239,68,68,0.35)]' : 'border-border'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-xl font-extrabold text-white">{team.name}</span>
        <span className="shrink-0 text-lg font-extrabold text-primary">{team.points}포인트</span>
      </div>

      <div className="mb-3 min-h-[74px] rounded-lg border border-dashed border-border bg-background/40 p-2">
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
          <div className="flex h-[54px] items-center justify-center text-xs text-muted-foreground">
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
