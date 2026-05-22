'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { ArrowLeft, RefreshCw } from 'lucide-react'

type AuctionMode = 'player' | 'results'

type LocalTeam = {
  id: string
  name: string
  points: number
  join_code?: string | null
  is_connected?: boolean | null
  connected_at?: string | null
  connected_session_id?: string | null
}

type LocalPlayer = {
  id: string
  name: string
  tier: string
  detail_tier?: string | null
  available_days?: string | null
  bio?: string | null
  image_url?: string | null
  team_id?: string | null
  bid_amount?: number | null
  is_passed?: boolean | null
  is_captain?: boolean | null
  auction_order?: number | null
}

type PlayerAuctionState = {
  current_player_id: string | null
  current_bid: number
  current_bidder_team_id: string | null
  auction_end_time?: string | null
  timer_remaining: number
  status: 'ready' | 'running' | 'paused'
  overlay_mode?: AuctionMode | null
}

type AuctionLog = {
  id: string
  action: string
  message: string
  created_at: string
}

const DEFAULT_PLAYER_STATE: PlayerAuctionState = {
  current_player_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: 20,
  status: 'ready',
  overlay_mode: 'player',
}

const CONNECTION_TIMEOUT_MS = 5 * 1000
const PARTICIPANT_SESSION_ID_KEY = 'auction_participant_session_id'

const getRemainSeconds = (endTime?: string | null, status?: string, fallback = 20) => {
  if (status !== 'running' || !endTime) return fallback

  const end = new Date(endTime).getTime()
  if (Number.isNaN(end)) return fallback

  return Math.max(0, Math.ceil((end - Date.now()) / 1000))
}

const bidSound =
  typeof window !== 'undefined'
    ? new Audio('/sounds/bid.mp3')
    : null

const countdownSound =
  typeof window !== 'undefined'
    ? new Audio('/sounds/countdown-tick.mp3')
    : null

const getParticipantSessionId = () => {
  if (typeof window === 'undefined') return ''

  const saved = sessionStorage.getItem(PARTICIPANT_SESSION_ID_KEY)
  if (saved) return saved

  const created = crypto.randomUUID()
  sessionStorage.setItem(PARTICIPANT_SESSION_ID_KEY, created)
  return created
}

const isConnectionExpired = (connectedAt?: string | null) => {
  if (!connectedAt) return true

  const connectedTime = new Date(connectedAt).getTime()
  if (Number.isNaN(connectedTime)) return true

  return Date.now() - connectedTime > CONNECTION_TIMEOUT_MS
}

const normalizeMode = (value: unknown): AuctionMode => {
  if (value === 'results' || value === 'player') return value
  return 'player'
}

const normalizePlayerState = (value: any): PlayerAuctionState => {
  if (!value) return DEFAULT_PLAYER_STATE

  const status =
    value.status === 'running' || value.status === 'paused' || value.status === 'ready'
      ? value.status
      : 'ready'

  return {
    current_player_id: value.current_player_id ?? null,
    current_bid: Number(value.current_bid ?? 0),
    current_bidder_team_id: value.current_bidder_team_id ?? null,
    auction_end_time: value.auction_end_time ?? null,
    timer_remaining: getRemainSeconds(
      value.auction_end_time ?? null,
      status,
      DEFAULT_PLAYER_STATE.timer_remaining
    ),
    status,
    overlay_mode: normalizeMode(value.overlay_mode),
  }
}

const isMeaningfulTeamChange = (oldTeam: any, newTeam: any) => {
  if (!newTeam) return false
  if (!oldTeam) return true

  return (
    oldTeam.name !== newTeam.name ||
    Number(oldTeam.points ?? 0) !== Number(newTeam.points ?? 0) ||
    (oldTeam.join_code ?? null) !== (newTeam.join_code ?? null)
  )
}


const getTeamNumber = (teamId?: string | null) => {
  if (!teamId) return 9999
  const match = teamId.match(/team-(\d+)/)
  return match ? Number(match[1]) : 9999
}

const getTierColorClass = (tier?: string) => {
  switch (tier) {
    case 'A':
      return 'text-red-500'
    case 'B':
      return 'text-blue-400'
    case 'C':
      return 'text-yellow-400'
    case 'D':
      return 'text-gray-400'
    default:
      return 'text-white'
  }
}

const getTierBorderClass = (tier?: string) => {
  switch (tier) {
    case 'B':
      return 'border-blue-400 shadow-[0_0_24px_rgba(96,165,250,0.65)]'
    case 'C':
      return 'border-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.65)]'
    case 'D':
      return 'border-zinc-400 shadow-[0_0_24px_rgba(161,161,170,0.5)]'
    default:
      return 'border-red-500'
  }
}

const hasSameTierPlayer = (ownedPlayers: LocalPlayer[], targetPlayer?: LocalPlayer | null) => {
  if (!targetPlayer?.tier) return false
  return ownedPlayers.some((player) => player.tier === targetPlayer.tier)
}

const getTeamPlayers = (team: LocalTeam, players: LocalPlayer[]) =>
  players
    .filter((player) => player.team_id === team.id)
    .sort((a, b) => {
      if (a.is_captain && !b.is_captain) return -1
      if (!a.is_captain && b.is_captain) return 1

      const tierOrder = ['A', 'B', 'C', 'D']
      const aTier = tierOrder.indexOf(a.tier)
      const bTier = tierOrder.indexOf(b.tier)

      return (aTier === -1 ? 99 : aTier) - (bTier === -1 ? 99 : bTier)
    })

export default function ParticipantPage() {

useEffect(() => {
  const role = sessionStorage.getItem('auction_role')
  const adminAuth = sessionStorage.getItem('admin_authenticated')

  if (window.top === window.self) {
    if (role !== 'participant') {
      window.location.replace('/')
    }
  }
}, [])

  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [playerState, setPlayerState] = useState<PlayerAuctionState>(DEFAULT_PLAYER_STATE)
  const [logs, setLogs] = useState<AuctionLog[]>([])
  const [mode, setMode] = useState<AuctionMode>('player')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [bidInput, setBidInput] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isBidding, setIsBidding] = useState(false)
  const [sessionId, setSessionId] = useState('')

  const lastCountdownSecondRef = useRef<number | null>(null)
  const lastCountdownEndTimeRef = useRef<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [teamsResult, playersResult, playerStateResult, logsResult] =
      await Promise.all([
        supabase.from('teams').select('*').order('id', { ascending: true }),
        supabase
          .from('players')
          .select('*')
          .order('auction_order', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true }),
        supabase.from('auction_state').select('*').eq('id', 'main').maybeSingle(),
        supabase
          .from('auction_logs')
          .select('*')
          .in('action', ['bid', 'sold', 'passed'])
          .order('created_at', { ascending: false })
          .limit(20),
      ])

    if (teamsResult.error) console.error('participant teams load error:', teamsResult.error)
    if (playersResult.error) console.error('participant players load error:', playersResult.error)
    if (playerStateResult.error) console.error('participant auction_state load error:', playerStateResult.error)
    if (logsResult.error) console.error('participant logs load error:', logsResult.error)

    const nextTeams = ((teamsResult.data || []) as LocalTeam[]).sort(
      (a, b) => getTeamNumber(a.id) - getTeamNumber(b.id)
    )

    const nextPlayerState = normalizePlayerState(playerStateResult.data)

    setTeams(nextTeams)
    setPlayers((playersResult.data || []) as LocalPlayer[])
    setPlayerState(nextPlayerState)
    setLogs((logsResult.data || []) as AuctionLog[])
    setMode(normalizeMode(nextPlayerState.overlay_mode))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    setSessionId(getParticipantSessionId())
  }, [])

  useEffect(() => {
    const savedTeamId =
      sessionStorage.getItem('auction_participant_team_id') ||
      sessionStorage.getItem('auction_team_id') ||
      sessionStorage.getItem('team_id')

    if (savedTeamId) setTeamId(savedTeamId)

    loadData()

    const channel = supabase
      .channel('participant-page-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auction_state' },
        (payload) => {
          const nextState = normalizePlayerState(payload.new)
          setPlayerState(nextState)
          setMode(normalizeMode(nextState.overlay_mode))
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'auction_logs' },
        (payload) => {
          const eventType = payload.eventType

          if (eventType === 'INSERT') {
            const newLog = payload.new as AuctionLog
            if (!['bid', 'sold', 'passed'].includes(newLog.action)) return

            setLogs((prev) => {
              if (prev.some((log) => log.id === newLog.id)) return prev
              return [newLog, ...prev].slice(0, 20)
            })
            return
          }

          if (eventType === 'DELETE') {
            const oldLog = payload.old as Partial<AuctionLog>
            if (!oldLog.id) return

            setLogs((prev) => prev.filter((log) => log.id !== oldLog.id))
            return
          }

          if (eventType === 'UPDATE') {
            const updatedLog = payload.new as AuctionLog
            setLogs((prev) =>
              prev.map((log) => (log.id === updatedLog.id ? updatedLog : log))
            )
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        (payload) => {
          const eventType = payload.eventType

          if (eventType === 'INSERT') {
            const newPlayer = payload.new as LocalPlayer
            setPlayers((prev) => {
              if (prev.some((player) => player.id === newPlayer.id)) return prev
              return [...prev, newPlayer].sort((a, b) => {
                const orderDiff = Number(a.auction_order ?? 9999) - Number(b.auction_order ?? 9999)
                return orderDiff !== 0 ? orderDiff : a.id.localeCompare(b.id)
              })
            })
            return
          }

          if (eventType === 'DELETE') {
            const oldPlayer = payload.old as Partial<LocalPlayer>
            if (!oldPlayer.id) return

            setPlayers((prev) => prev.filter((player) => player.id !== oldPlayer.id))
            return
          }

          if (eventType === 'UPDATE') {
            const updatedPlayer = payload.new as LocalPlayer
            setPlayers((prev) =>
              prev.map((player) => (player.id === updatedPlayer.id ? updatedPlayer : player))
            )
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        (payload) => {
          const eventType = payload.eventType

          if (eventType === 'INSERT') {
            const newTeam = payload.new as LocalTeam
            setTeams((prev) => {
              if (prev.some((team) => team.id === newTeam.id)) return prev
              return [...prev, newTeam].sort((a, b) => getTeamNumber(a.id) - getTeamNumber(b.id))
            })
            return
          }

          if (eventType === 'DELETE') {
            const oldTeam = payload.old as Partial<LocalTeam>
            if (!oldTeam.id) return

            setTeams((prev) => prev.filter((team) => team.id !== oldTeam.id))
            return
          }

          if (eventType === 'UPDATE') {
            const oldTeam = payload.old as LocalTeam
            const updatedTeam = payload.new as LocalTeam

            // 참가자 접속 heartbeat는 is_connected/connected_at/session만 바뀌므로 화면 전체 갱신에서 제외합니다.
            if (!isMeaningfulTeamChange(oldTeam, updatedTeam)) return

            setTeams((prev) =>
              prev
                .map((team) => (team.id === updatedTeam.id ? updatedTeam : team))
                .sort((a, b) => getTeamNumber(a.id) - getTeamNumber(b.id))
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData])

  const joinedTeam = useMemo(
    () => (teamId ? teams.find((team) => team.id === teamId) || null : null),
    [teamId, teams]
  )

  const auctionPlayers = players.filter((player) => !player.is_captain)
  const currentPlayer = auctionPlayers.find((player) => player.id === playerState.current_player_id) || null
  const currentPlayerBidder = teams.find((team) => team.id === playerState.current_bidder_team_id) || null

  const myPlayers = joinedTeam
    ? players.filter((player) => player.team_id === joinedTeam.id && !player.is_captain)
    : []

  const canBidPlayer = Boolean(
    mode === 'player' &&
    joinedTeam &&
    currentPlayer &&
    playerState.status === 'running' &&
    playerState.timer_remaining > 0 &&
    myPlayers.length < 3 &&
    !hasSameTierPlayer(myPlayers, currentPlayer)
  )

  const availablePlayers = auctionPlayers.filter(
    (player) => !player.team_id && !player.is_passed && !player.is_captain
  )

  const orderedQueuePlayers = currentPlayer
    ? [
        currentPlayer,
        ...availablePlayers.filter((player) => player.id !== currentPlayer.id),
      ]
    : availablePlayers

  const passedPlayers = auctionPlayers.filter((player) => player.is_passed)

  const teamStatusTeams = useMemo(
    () => [...teams].sort((a, b) => getTeamNumber(a.id) - getTeamNumber(b.id)),
    [teams]
  )

  const releaseTeamConnection = useCallback(
    async (targetTeamId?: string | null) => {
      const target = targetTeamId || teamId
      const currentSessionId = sessionId || getParticipantSessionId()

      if (!target || !currentSessionId) return

      const { error } = await supabase
        .from('teams')
        .update({
          is_connected: false,
          connected_at: null,
          connected_session_id: null,
        })
        .eq('id', target)
        .eq('connected_session_id', currentSessionId)

      if (error) console.error('team connection release error:', error)
    },
    [teamId, sessionId]
  )

  useEffect(() => {
    if (!teamId || !sessionId) return

    const touchConnection = async () => {
      const { error } = await supabase
        .from('teams')
        .update({
          is_connected: true,
          connected_at: new Date().toISOString(),
          connected_session_id: sessionId,
        })
        .eq('id', teamId)
        .eq('connected_session_id', sessionId)

      if (error) console.error('team connection heartbeat error:', error)
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        const navigationEntries = performance.getEntriesByType('navigation')
        const navigation = navigationEntries[0] as PerformanceNavigationTiming | undefined

        // 새로고침(F5)은 연결 유지
        if (navigation?.type === 'reload') {
          return
        }

        // 탭 종료 / 브라우저 종료 시 연결 해제
        await releaseTeamConnection(teamId)
      }
    }

    touchConnection()

    const interval = setInterval(() => {
      touchConnection()
    }, 5000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [teamId, sessionId, releaseTeamConnection])

  const handleLogin = async () => {
    const code = codeInput.trim()
    if (!code) {
      setError('팀 코드를 입력해주세요.')
      return
    }

    const matchedTeam = teams.find((team) => (team.join_code || '').trim() === code)
    if (!matchedTeam) {
      setError('일치하는 팀 코드가 없습니다.')
      return
    }

    const currentSessionId = sessionId || getParticipantSessionId()
    if (!sessionId) setSessionId(currentSessionId)

    const { data: latestTeam, error: latestTeamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', matchedTeam.id)
      .maybeSingle()

    if (latestTeamError) {
      console.error('team connection check error:', latestTeamError)
      setError('팀 접속 상태 확인에 실패했습니다.')
      return
    }

    const teamForCheck = (latestTeam as LocalTeam | null) || matchedTeam
    const connectedSessionId = teamForCheck.connected_session_id || ''
    const connectedByOtherSession =
      Boolean(teamForCheck.is_connected) &&
      connectedSessionId !== currentSessionId &&
      !isConnectionExpired(teamForCheck.connected_at)

    if (connectedByOtherSession) {
      setError('이미 접속 중인 팀입니다.')
      return
    }

    const { error: connectError } = await supabase
      .from('teams')
      .update({
        is_connected: true,
        connected_at: new Date().toISOString(),
        connected_session_id: currentSessionId,
      })
      .eq('id', matchedTeam.id)

    if (connectError) {
      console.error('team connection save error:', connectError)
      setError('팀 접속 상태 저장에 실패했습니다.')
      return
    }

    sessionStorage.setItem('auction_participant_team_id', matchedTeam.id)
    sessionStorage.setItem('auction_team_id', matchedTeam.id)
    sessionStorage.setItem('team_id', matchedTeam.id)
    setTeamId(matchedTeam.id)
    setCodeInput('')
    setError('')
    await loadData()
  }

  const handleLogout = async () => {
    const previousTeamId = teamId
    await releaseTeamConnection(previousTeamId)

    sessionStorage.removeItem('auction_participant_team_id')
    sessionStorage.removeItem('auction_team_id')
    sessionStorage.removeItem('team_id')

    setTeamId(null)
    setCodeInput('')
    setError('')

    const newSessionId = crypto.randomUUID()
    sessionStorage.setItem(PARTICIPANT_SESSION_ID_KEY, newSessionId)
    setSessionId(newSessionId)

    await loadData()
  }

  const addLog = async (message: string) => {
    const newLog = {
      id: crypto.randomUUID(),
      action: 'bid',
      message,
      created_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('auction_logs').insert(newLog)
    if (error) console.error('participant log insert error:', error)
  }

  const handleBid = async () => {
    if (!joinedTeam) {
      alert('먼저 팀 코드를 입력해주세요.')
      return
    }

    const amount = Number(bidInput)
    if (!Number.isFinite(amount) || amount <= 0) return

    setIsBidding(true)

    try {
      if (mode !== 'player') {
        alert('현재 인원 경매 화면이 아닙니다.')
        return
      }

      if (!currentPlayer) {
        alert('현재 경매 중인 선수가 없습니다.')
        return
      }
      if (myPlayers.length >= 3) {
        alert('이미 플레이어 3명을 낙찰받은 팀은 더 이상 입찰할 수 없습니다.')
        return
      }
      if (hasSameTierPlayer(myPlayers, currentPlayer)) {
        alert('이미 같은 티어의 선수를 낙찰받은 팀은 입찰할 수 없습니다.')
        return
      }
      if (playerState.status !== 'running' || playerState.timer_remaining <= 0) {
        alert('입찰 시간이 종료되었습니다.')
        return
      }
      if (amount <= playerState.current_bid) return
      if (joinedTeam.points < amount) {
        alert('보유 포인트보다 많이 입찰할 수 없습니다.')
        return
      }

      const { error } = await supabase
        .from('auction_state')
        .upsert({
          id: 'main',
          ...playerState,
          current_bid: amount,
          current_bidder_team_id: joinedTeam.id,
          auction_end_time: new Date(Date.now() + 20000).toISOString(),
        })

      if (error) {
        console.error('player bid error:', error)
        alert('입찰 저장에 실패했습니다.')
        return
      }

      await addLog(`[${joinedTeam.name} - ${amount}포인트 입찰]`)

      if (bidSound) {
        bidSound.currentTime = 0
        bidSound.volume = 0.35
        bidSound.play().catch(() => {
          // autoplay block ignore
        })
      }

      setPlayerState((prev) => ({
        ...prev,
        current_bid: amount,
        current_bidder_team_id: joinedTeam.id,
        auction_end_time: new Date(Date.now() + 20000).toISOString(),
        timer_remaining: 20,
        status: 'running',
      }))
      setBidInput('')
    } finally {
      setIsBidding(false)
    }
  }

  const activeCurrentBid = playerState.current_bid
  const activeTimer = playerState.timer_remaining
  const activeStatus = playerState.status
  const activeBidder = currentPlayerBidder
  const activeCanBid = canBidPlayer
  const limitText = `${myPlayers.length}/3 플레이어 보유`

  useEffect(() => {
    const interval = setInterval(() => {
      if (playerState.status !== 'running' || !playerState.auction_end_time) {
        return
      }

      const remain = getRemainSeconds(
        playerState.auction_end_time,
        playerState.status,
        playerState.timer_remaining
      )

      setPlayerState((prev) =>
        prev.timer_remaining === remain ? prev : { ...prev, timer_remaining: remain }
      )
    }, 250)

    return () => clearInterval(interval)
  }, [
    playerState.status,
    playerState.auction_end_time,
    playerState.timer_remaining,
  ])

  useEffect(() => {
    if (!countdownSound) return

    const stopCountdownSound = () => {
      countdownSound.pause()
      countdownSound.currentTime = 0
    }

    const currentEndTime = playerState.auction_end_time || null

    if (lastCountdownEndTimeRef.current !== currentEndTime) {
      lastCountdownEndTimeRef.current = currentEndTime
      lastCountdownSecondRef.current = null
      stopCountdownSound()
    }

    if (activeStatus !== 'running' || activeTimer > 5 || activeTimer <= 0) {
      lastCountdownSecondRef.current = null
      stopCountdownSound()
      return
    }

    if (lastCountdownSecondRef.current === activeTimer) return

    lastCountdownSecondRef.current = activeTimer

    countdownSound.pause()
    countdownSound.currentTime = 0
    countdownSound.volume = 0.7
    countdownSound.play().catch(() => {
      // autoplay block ignore
    })
  }, [activeTimer, activeStatus, playerState.auction_end_time])

  return (
    <main className="min-h-screen bg-background p-4 text-white">
      <style jsx global>{`
        .hidden-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .hidden-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div className="mx-auto max-w-[1840px] space-y-4">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-black">참가자</h1>
              <p className="text-sm text-muted-foreground">팀 코드 1번 입력 후 인원 경매를 여기서 입찰합니다.</p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </header>

        {!joinedTeam ? (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-xl font-black">팀 코드 입력</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="password"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLogin()
                }}
                placeholder="전달받은 개별팀 코드"
                className="min-w-[280px] rounded border border-border bg-input px-4 py-3 text-base font-bold"
              />
              <Button className="h-12 px-6 font-black" onClick={handleLogin}>팀 입장</Button>
              {error && <p className="font-bold text-destructive">{error}</p>}
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">입장 완료</p>
                <h2 className="text-3xl font-black text-primary">{joinedTeam.name}</h2>
                <p className="text-lg font-bold">보유 포인트: {joinedTeam.points}P / {limitText}</p>
              </div>
              <Button variant="outline" onClick={handleLogout}>로그아웃</Button>
            </div>
          </section>
        )}

        <section className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-4 xl:col-span-9">
            <section className="grid grid-cols-12 gap-4">
              <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black">현재 경매</h2>
              <span className="rounded bg-primary px-3 py-1 text-sm font-black text-white">
                {mode === 'results' ? '결과 화면' : '인원 경매'}
              </span>
            </div>

            {currentPlayer ? (
              <CurrentPlayerCard player={currentPlayer} />
            ) : (
              <EmptyCurrent text="현재 경매 중인 선수가 없습니다." />
            )}

            <div className="mt-6 grid grid-cols-3 gap-3 text-center">
              <InfoBox label="현재 입찰" value={`${activeCurrentBid || 0}P`} />
              <InfoBox label="입찰 팀" value={activeBidder?.name || '없음'} />
              <InfoBox
                label="남은 시간"
                value={`${activeTimer || 0}초`}
                valueClassName={
                  activeStatus === 'running' && activeTimer <= 5
                    ? 'text-red-500 animate-pulse'
                    : 'text-white'
                }
              />
            </div>
          </div>

          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-4">
            <h2 className="mb-4 text-xl font-black">입찰</h2>
            <div className="space-y-3">
              <input
                type="number"
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleBid()
                }}
                placeholder={joinedTeam ? '입찰 금액 입력' : '팀 코드 입력 후 입찰 가능'}
                disabled={!joinedTeam || !activeCanBid || isBidding}
                className="w-full rounded border border-border bg-input px-4 py-4 text-xl font-black"
              />

              <Button
                className="h-14 w-full text-lg font-black"
                onClick={handleBid}
                disabled={!joinedTeam || !activeCanBid || !bidInput || isBidding}
              >
                {!joinedTeam ? '팀 코드 입력 필요' : activeCanBid ? '입찰하기' : '입찰 불가'}
              </Button>

              <div className="rounded-lg border border-border bg-background/50 p-3 text-sm font-bold text-muted-foreground">
                <p>상태: {activeStatus === 'running' ? '진행중' : activeStatus === 'paused' ? '정지' : '대기'}</p>
                <p>인원 경매는 팀당 3명, 같은 티어는 1명까지만 입찰할 수 있습니다.</p>
                {joinedTeam && currentPlayer && hasSameTierPlayer(myPlayers, currentPlayer) && (
                  <p className="mt-1 text-primary">현재 선수와 같은 티어를 이미 보유 중이라 입찰할 수 없습니다.</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-4">
            <h2 className="mb-4 text-xl font-black">내 팀 현황</h2>
            {!joinedTeam ? (
              <p className="text-muted-foreground">팀 코드를 입력하면 내 팀 현황이 표시됩니다.</p>
            ) : (
              <div>
                <h3 className="mb-2 font-black text-white">낙찰 선수 {myPlayers.length}/3</h3>
                <div className="space-y-2">
                  {myPlayers.length > 0 ? myPlayers.map((player) => (
                    <div key={player.id} className="flex items-center justify-between rounded bg-secondary px-3 py-2">
                      <span className="font-bold">{player.name}</span>
                      <span className={`font-black ${getTierColorClass(player.tier)}`}>{player.tier}</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">아직 낙찰 선수 없음</p>}
                </div>
              </div>
            )}
          </div>
            </section>

            <section className="grid grid-cols-12 gap-4">
              <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">입찰 순서</h2>
              <span className="text-lg font-black text-white">
                1 / {Math.max(orderedQueuePlayers.length, 1)}
              </span>
            </div>

            <div className="hidden-scrollbar h-[310px] overflow-y-auto pr-1">
              <div className="grid grid-cols-10 gap-2.5 content-start">
                {orderedQueuePlayers.length > 0 ? (
                  orderedQueuePlayers.map((player, index) => (
                    <PlayerQueueCard
                      key={player.id}
                      player={player}
                      isCurrent={index === 0}
                    />
                  ))
                ) : (
                  <p className="col-span-full py-10 text-center text-muted-foreground">대기 중인 선수가 없습니다.</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black">유찰자 목록</h2>
              <span className="text-sm font-bold text-muted-foreground">
                {passedPlayers.length}명
              </span>
            </div>

            <div className="hidden-scrollbar h-[310px] space-y-2 overflow-y-auto pr-1">
              {passedPlayers.length > 0 ? (
                passedPlayers.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                    <span className="truncate text-sm font-black text-white">{player.name}</span>
                    <span className={`ml-2 shrink-0 text-xs font-black ${getTierColorClass(player.tier)}`}>{player.tier}</span>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">아직 유찰자 없음</p>
              )}
            </div>
          </div>

              <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-3">
                <h2 className="mb-3 text-xl font-black">경매 로그</h2>
                <div className="max-h-[310px] space-y-1 overflow-y-auto text-sm font-bold">
                  {logs.length > 0 ? logs.map((log) => (
                    <p
                      key={log.id}
                      className={log.action === 'bid' ? 'text-yellow-400' : log.action === 'sold' ? 'text-green-400' : 'text-red-400'}
                    >
                      {log.message}
                    </p>
                  )) : <p className="text-muted-foreground">아직 입찰 기록 없음</p>}
                </div>
              </div>
            </section>
          </div>

          <aside className="col-span-12 rounded-xl border border-border bg-card p-4 xl:col-span-3">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-black text-white"></h2>
                <p className="text-xs text-muted-foreground"></p>
              </div>

        
            </div>

            <div className="hidden-scrollbar max-h-[760px] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2">
                {teamStatusTeams.map((team) => (
                  <TeamStatusCard
                    key={team.id}
                    team={team}
                    players={getTeamPlayers(team, players)}
                    isMine={team.id === joinedTeam?.id}
                    isCurrentBidder={team.id === playerState.current_bidder_team_id}
                  />
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function TeamStatusCard({
  team,
  players,
  isMine,
  isCurrentBidder,
}: {
  team: LocalTeam
  players: LocalPlayer[]
  isMine: boolean
  isCurrentBidder: boolean
}) {
  const captain = players.find((player) => player.is_captain)
  const ownedPlayers = players.filter((player) => !player.is_captain)
  const visibleTiers = ['B', 'C', 'D']

  return (
    <div
      className={`rounded-lg border bg-background/45 p-2 transition-all ${
        isCurrentBidder
          ? 'border-primary shadow-[0_0_14px_rgba(239,68,68,0.45)]'
          : isMine
          ? 'border-yellow-400/80 shadow-[0_0_12px_rgba(250,204,21,0.28)]'
          : 'border-border'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-black leading-tight text-white">
            {captain?.name || team.name}
          </p>
          <p className="mt-1 text-[11px] font-bold leading-none text-muted-foreground">
            낙찰 {ownedPlayers.length}/3
          </p>
        </div>

        <span className="shrink-0 rounded bg-primary px-2.5 py-1 text-sm font-black text-white">
          {team.points ?? 0}P
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {visibleTiers.map((tier) => {
          const tierPlayer = ownedPlayers.find((player) => player.tier === tier)

          return (
            <div
              key={tier}
              className={`min-h-[54px] rounded border bg-black/35 px-1 py-1.5 text-center ${
                tierPlayer ? getTierBorderClass(tierPlayer.tier) : 'border-border'
              }`}
              title={tierPlayer?.name || `${tier} 미보유`}
            >
              <p className={`text-sm font-black ${getTierColorClass(tier)}`}>
                {tier}
              </p>
              <p className="mt-1 break-words text-[11px] font-bold leading-tight text-white">
                {tierPlayer?.name || '-'}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CurrentPlayerCard({ player }: { player: LocalPlayer }) {
  return (
    <div className="flex gap-4">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-secondary">
        {player.image_url ? (
          <img src={player.image_url} alt={player.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground">
            {(player.name || '?')[0]}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-4xl font-black text-white">{player.name}</h3>
        <p className={`text-2xl font-black ${getTierColorClass(player.tier)}`}>티어 {player.tier || '-'}</p>
        <p className="text-lg font-bold">치지직 티어: {player.detail_tier || '-'}</p>
        <p className="text-sm text-muted-foreground">연습 가능 시간: {player.available_days || '미등록'}</p>
      </div>
    </div>
  )
}

function EmptyCurrent({ text }: { text: string }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border bg-background/40 text-muted-foreground">
      {text}
    </div>
  )
}

function InfoBox({
  label,
  value,
  valueClassName = 'text-white',
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  const isTimer = label === '남은 시간'

  return (
    <div
      className={`rounded-xl border bg-background/70 px-3 py-4 shadow-[inset_0_0_18px_rgba(255,255,255,0.03)] ${
        isTimer && valueClassName.includes('text-red-500')
          ? 'border-red-500/70 shadow-[0_0_18px_rgba(239,68,68,0.35)]'
          : 'border-border'
      }`}
    >
      <p className="mb-1 text-sm font-black text-muted-foreground">{label}</p>
      <p
        className={`truncate font-black leading-none ${
          isTimer ? 'text-4xl' : 'text-2xl'
        } ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  )
}

function PlayerQueueCard({
  player,
  isCurrent,
}: {
  player: LocalPlayer
  isCurrent: boolean
}) {
  return (
    <div
      className={`
        relative aspect-square min-h-[62px]
        overflow-visible
        rounded-md border bg-[#111]
        ${getTierBorderClass(player.tier)}
        ${isCurrent ? 'ring-2 ring-white/40' : ''}
        transition-all duration-300
      `}
    >
      {player.image_url ? (
        <img
          src={player.image_url}
          alt={player.name}
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary text-lg font-black text-muted-foreground">
          {(player.name || '?')[0]}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/90" />

      {isCurrent && (
        <span className="absolute left-1 top-1 z-10 rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
          현재
        </span>
      )}

      <div className="absolute inset-x-1 bottom-1 z-10 rounded bg-black/70 px-1 py-1 text-center">
        <p className="truncate text-[12px] font-black leading-tight text-white">
          {player.name}
        </p>

        <p className={`mt-0.5 text-[11px] font-black leading-none ${getTierColorClass(player.tier)}`}>
          {player.tier}
        </p>
      </div>
    </div>
  )
}
