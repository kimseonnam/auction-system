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
  Coins,
} from 'lucide-react'

type LocalPlayer = {
  id: string
  name: string
  tier: string
  detail_tier?: string
  available_days?: string
  image_url: string | null
  team_id?: string | null
  bid_amount: number
  is_passed: boolean
  is_captain?: boolean
}

type LocalTeam = {
  id: string
  name: string
  points: number
}

type LocalAuctionState = {
  current_player_id: string | null
  current_bid: number
  current_bidder_team_id: string | null
  timer_remaining: number
  status: 'ready' | 'running' | 'paused'
}

type LocalAuctionLog = {
  id: string
  action: string
  message: string
  created_at: string
}

type AuctionSnapshot = {
  players: LocalPlayer[]
  auction_players?: LocalPlayer[]
  teams: LocalTeam[]
  auctionState: LocalAuctionState
  logs: LocalAuctionLog[]
}

type AuctionRole = 'admin' | 'participant'

const DEFAULT_TIMER = 15
const DEFAULT_POINTS = 0

const createDefaultTeams = (): LocalTeam[] =>
  Array.from({ length: 16 }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `TEAM ${i + 1}`,
    points: DEFAULT_POINTS,
  }))

const defaultAuctionState: LocalAuctionState = {
  current_player_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: DEFAULT_TIMER,
  status: 'ready',
}

const isAuctionTargetPlayer = (player: LocalPlayer) =>
  !player.team_id && !player.is_passed && !player.is_captain

const getTeamNumber = (teamId?: string | null) => {
  if (!teamId) return null
  const match = teamId.match(/team-(\d+)/)
  return match ? Number(match[1]) : null
}

const sortTeamsByNumber = (teams: LocalTeam[]) => {
  return [...teams].sort((a, b) => {
    const aNumber = getTeamNumber(a.id) ?? 9999
    const bNumber = getTeamNumber(b.id) ?? 9999
    return aNumber - bNumber
  })
}

const getDefaultTeamNameByIndex = (index: number) => `TEAM ${index + 1}`

const syncCaptainTeamNames = (players: LocalPlayer[], teams: LocalTeam[]) => {
  return sortTeamsByNumber(teams).map((team, index) => {
    const captain = players.find(
      (player) => player.is_captain && player.team_id === team.id
    )

    if (captain) {
      return {
        ...team,
        name: captain.name,
      }
    }

    return {
      ...team,
      name: getDefaultTeamNameByIndex(index),
    }
  })
}

export default function AuctionPage() {
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [role, setRole] = useState<AuctionRole>('participant')
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [auctionState, setAuctionState] = useState<LocalAuctionState>(defaultAuctionState)
  const [logs, setLogs] = useState<LocalAuctionLog[]>([])
  const [isPointPanelOpen, setIsPointPanelOpen] = useState(false)
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({})

  const isAdmin = role === 'admin'

  const saveOverlaySync = (
    nextPlayers: LocalPlayer[] = players,
    nextTeams: LocalTeam[] = teams,
    nextState: LocalAuctionState = auctionState,
    nextLogs: LocalAuctionLog[] = logs
  ) => {
    const cleanPlayers = nextPlayers.map((player) => ({
      ...player,
      image_url: player.image_url || null,
    }))

    const snapshot: AuctionSnapshot = {
      players: cleanPlayers,
      auction_players: cleanPlayers,
      teams: nextTeams,
      auctionState: nextState,
      logs: nextLogs,
    }

    localStorage.setItem('auction_mode', 'player')
    localStorage.setItem('auction_players', JSON.stringify(cleanPlayers))
    localStorage.setItem('auction_teams', JSON.stringify(nextTeams))
    localStorage.setItem('auction_state', JSON.stringify(nextState))
    localStorage.setItem('auction_logs', JSON.stringify(nextLogs))
    localStorage.setItem('auction_snapshot', JSON.stringify(snapshot))

    // 오버레이가 현재 선수/입찰 순서를 안정적으로 읽도록 맞춰줍니다.
    localStorage.setItem('players', JSON.stringify(cleanPlayers))
  }

  const openLandmarkAuction = () => {
    localStorage.setItem('auction_mode', 'landmark')
    window.open('/admin/landmark-auction', '_self')
  }

  const auctionPlayers = players.filter((player) => !player.is_captain)
  const currentPlayer = auctionPlayers.find((p) => p.id === auctionState.current_player_id)
  const currentBidderTeam = teams.find((t) => t.id === auctionState.current_bidder_team_id)
  const passedPlayers = auctionPlayers.filter((p) => p.is_passed)

  useEffect(() => {
    localStorage.setItem('auction_mode', 'player')

    const savedRole = sessionStorage.getItem('auction_role')
    if (savedRole === 'admin' || savedRole === 'participant') {
      setRole(savedRole)
    } else {
      setRole('participant')
    }
  }, [])

  useEffect(() => {
    const savedPlayers = localStorage.getItem('auction_players')
    const loadedPlayers = savedPlayers ? JSON.parse(savedPlayers) : []
    setPlayers(loadedPlayers)
    if (loadedPlayers.length > 0) {
      localStorage.setItem('players', JSON.stringify(loadedPlayers))
    }
    if (loadedPlayers.length > 0) {
      localStorage.setItem('players', JSON.stringify(loadedPlayers))
    }

    const savedTeams = localStorage.getItem('auction_teams')
    if (savedTeams) {
      const loadedTeams = JSON.parse(savedTeams)
      const syncedTeams = syncCaptainTeamNames(loadedPlayers, loadedTeams)
      setTeams(syncedTeams)
      localStorage.setItem('auction_teams', JSON.stringify(syncedTeams))
    } else {
      const defaultTeams = syncCaptainTeamNames(loadedPlayers, createDefaultTeams())
      setTeams(defaultTeams)
      localStorage.setItem('auction_teams', JSON.stringify(defaultTeams))
    }

    const savedState = localStorage.getItem('auction_state')
    setAuctionState(savedState ? JSON.parse(savedState) : defaultAuctionState)

    const savedLogs = localStorage.getItem('auction_logs')
    setLogs(savedLogs ? JSON.parse(savedLogs) : [])
  }, [])

useEffect(() => {
  const syncAuctionData = () => {
    localStorage.setItem('auction_mode', 'player')

    const savedPlayers = localStorage.getItem('auction_players')
    const loadedPlayers = savedPlayers ? JSON.parse(savedPlayers) : []
    setPlayers(loadedPlayers)

    const savedTeams = localStorage.getItem('auction_teams')
    if (savedTeams) {
      const loadedTeams = JSON.parse(savedTeams)
      const syncedTeams = syncCaptainTeamNames(loadedPlayers, loadedTeams)
      setTeams(syncedTeams)
      localStorage.setItem('auction_teams', JSON.stringify(syncedTeams))
    }

    const savedState = localStorage.getItem('auction_state')
    if (savedState) {
      setAuctionState(JSON.parse(savedState))
    }

    const savedLogs = localStorage.getItem('auction_logs')
    setLogs(savedLogs ? JSON.parse(savedLogs) : [])
  }

  // 0.5초마다 동기화
  const interval = setInterval(syncAuctionData, 500)

  // 다른 탭에서 변경 감지
  window.addEventListener('storage', syncAuctionData)

  return () => {
    clearInterval(interval)
    window.removeEventListener('storage', syncAuctionData)
  }
}, [])

  const savePlayers = (nextPlayers: LocalPlayer[]) => {
    setPlayers(nextPlayers)
    saveOverlaySync(nextPlayers, teams, auctionState, logs)
  }

  const saveTeams = (nextTeams: LocalTeam[]) => {
    setTeams(nextTeams)
    saveOverlaySync(players, nextTeams, auctionState, logs)
  }

  const openPointPanel = () => {
    const drafts = teams.reduce<Record<string, string>>((acc, team) => {
      acc[team.id] = String(team.points ?? 0)
      return acc
    }, {})

    setPointDrafts(drafts)
    setIsPointPanelOpen(true)
  }

  const handlePointDraftChange = (teamId: string, value: string) => {
    setPointDrafts((prev) => ({
      ...prev,
      [teamId]: value,
    }))
  }

  const handleApplyTeamPoint = (team: LocalTeam) => {
    if (!isAdmin) return

    const rawValue = pointDrafts[team.id] ?? '0'
    const parsedValue = rawValue.trim() === '' ? 0 : parseInt(rawValue)
    const safeValue = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue)

    const nextTeams = teams.map((t) =>
      t.id === team.id ? { ...t, points: safeValue } : t
    )

    saveTeams(nextTeams)
    setPointDrafts((prev) => ({
      ...prev,
      [team.id]: String(safeValue),
    }))

    // removed log, `${team.name} 포인트 ${safeValue}P 지급`)
  }

  const handleApplyAllTeamPoints = () => {
    if (!isAdmin) return

    const nextTeams = teams.map((team) => {
      const rawValue = pointDrafts[team.id] ?? String(team.points ?? 0)
      const parsedValue = rawValue.trim() === '' ? 0 : parseInt(rawValue)
      const safeValue = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue)

      return {
        ...team,
        points: safeValue,
      }
    })

    saveTeams(nextTeams)

    setPointDrafts(
      nextTeams.reduce<Record<string, string>>((acc, team) => {
        acc[team.id] = String(team.points ?? 0)
        return acc
      }, {})
    )

    // removed log, '팀 포인트 일괄 지급 완료')
  }

useEffect(() => {
  saveOverlaySync(players, teams, auctionState, logs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [players, teams, auctionState, logs])

const handleResetAllTeamPoints = () => {
  if (!isAdmin) return
  if (!confirm('모든 팀 포인트를 0으로 초기화할까요?')) return

  const resetTeams = teams.map((team) => ({
    ...team,
    points: 0,
  }))

  saveTeams(resetTeams)

  setPointDrafts(
    resetTeams.reduce<Record<string, string>>((acc, team) => {
      acc[team.id] = '0'
      return acc
    }, {})
  )

  // removed log, '모든 팀 포인트 초기화')
}

  const saveAuctionState = (nextState: LocalAuctionState) => {
    setAuctionState(nextState)
    saveOverlaySync(players, teams, nextState, logs)
  }

  const clearAuctionLogs = () => {
    setLogs([])
    saveOverlaySync(players, teams, auctionState, [])
  }

  const addLog = (action: string, message: string) => {
    if (action !== 'bid' && action !== 'sold' && action !== 'passed') return

    const newLog: LocalAuctionLog = {
      id: crypto.randomUUID(),
      action,
      message,
      created_at: new Date().toISOString(),
    }

    setLogs((prevLogs) => {
      const nextLogs =
        action === 'bid'
          ? [newLog, ...prevLogs].slice(0, 30)
          : [newLog]

      saveOverlaySync(players, teams, auctionState, nextLogs)
      return nextLogs
    })
  }

  const saveSnapshot = () => {
    const snapshot: AuctionSnapshot = {
      // 이미지까지 되돌리기에 저장하면 localStorage 용량 초과가 날 수 있어서 이미지 제외 해야함...ㅠㅠ
      players: players.map((player) => ({
        ...player,
        image_url: null,
      })),
      teams,
      auctionState,
      logs,
    }

    localStorage.setItem('auction_undo', JSON.stringify(snapshot))
  }

  const handleUndo = () => {
    if (!isAdmin) return

    const saved = localStorage.getItem('auction_undo')

    if (!saved) {
      alert('되돌릴 데이터 없음')
      return
    }

    const snapshot: AuctionSnapshot = JSON.parse(saved)

    setPlayers(snapshot.players)
    setTeams(snapshot.teams)
    setAuctionState(snapshot.auctionState)
    setLogs(snapshot.logs)

    localStorage.setItem('auction_players', JSON.stringify(snapshot.players))
    localStorage.setItem('players', JSON.stringify(snapshot.players))
    localStorage.setItem('auction_teams', JSON.stringify(snapshot.teams))
    localStorage.setItem('auction_state', JSON.stringify(snapshot.auctionState))
    localStorage.setItem('auction_logs', JSON.stringify(snapshot.logs))
    localStorage.setItem('auction_snapshot', JSON.stringify({
      ...snapshot,
      auction_players: snapshot.players,
    }))
    localStorage.removeItem('auction_undo')
  }

  const getAvailablePlayers = useCallback(() => {
    return players.filter(isAuctionTargetPlayer)
  }, [players])

  const getNextPlayer = useCallback(() => {
    const availablePlayers = getAvailablePlayers()
    if (availablePlayers.length === 0) return null

    const currentIndex = currentPlayer
      ? availablePlayers.findIndex((p) => p.id === currentPlayer.id)
      : -1

    return availablePlayers[currentIndex + 1] || availablePlayers[0]
  }, [getAvailablePlayers, currentPlayer])

  useEffect(() => {
    if (!auctionState.current_player_id) return

    const selectedPlayer = players.find((player) => player.id === auctionState.current_player_id)
    if (!selectedPlayer?.is_captain) return

    const nextPlayer = getNextPlayer()

    saveAuctionState({
      current_player_id: nextPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextPlayer ? 'paused' : 'ready',
    })
  }, [auctionState.current_player_id, players, getNextPlayer])

  const updateAuctionState = (updates: Partial<LocalAuctionState>) => {
    saveAuctionState({
      ...auctionState,
      ...updates,
    })
  }

  useEffect(() => {
    if (!isAdmin) return
    if (auctionState.status !== 'running') return

    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setAuctionState((prev) => {
        const nextTime = prev.timer_remaining - 1

        if (nextTime <= 0) {
          clearInterval(timerRef.current!)

          const nextState: LocalAuctionState = {
            ...prev,
            timer_remaining: 0,
            status: 'paused',
          }

          localStorage.setItem('auction_state', JSON.stringify(nextState))

          setTimeout(() => {
            // removed log, '타이머 종료 - 낙찰 또는 유찰을 선택하세요')
          }, 0)

          return nextState
        }

        const nextState: LocalAuctionState = {
          ...prev,
          timer_remaining: nextTime,
        }

        localStorage.setItem('auction_state', JSON.stringify(nextState))
        return nextState
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [auctionState.status, isAdmin])

  const handleStart = () => {
    if (!isAdmin) return

    if (!currentPlayer || currentPlayer.is_captain) {
      const firstPlayer = getNextPlayer()

      if (!firstPlayer) {
        alert('경매 가능한 플레이어가 없습니다.')
        return
      }

      clearAuctionLogs()

      saveAuctionState({
        current_player_id: firstPlayer.id,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: DEFAULT_TIMER,
        status: 'running',
      })
      return
    }

    updateAuctionState({ status: 'running' })
  }

  const handlePause = () => {
    if (!isAdmin) return
    updateAuctionState({ status: 'paused' })
  }

  const handleSold = () => {
    if (!isAdmin) return
    if (!currentPlayer || !auctionState.current_bidder_team_id) return

    saveSnapshot()

    const team = teams.find((t) => t.id === auctionState.current_bidder_team_id)
    if (!team) return

    const nextPlayers = players.map((p) =>
      p.id === currentPlayer.id
        ? {
            ...p,
            team_id: team.id,
            bid_amount: auctionState.current_bid,
            is_passed: false,
          }
        : p
    )

    const nextTeams = teams.map((t) =>
      t.id === team.id
        ? {
            ...t,
            points: Math.max(0, t.points - auctionState.current_bid),
          }
        : t
    )

    savePlayers(nextPlayers)
    saveTeams(nextTeams)

    addLog('sold', `[${currentPlayer.name} - ${team.name} ${auctionState.current_bid}포인트 낙찰]`)

    const nextPlayer = nextPlayers.find(isAuctionTargetPlayer)

    saveAuctionState({
      current_player_id: nextPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextPlayer ? 'paused' : 'ready',
    })
  }

  const handlePassed = () => {
    if (!isAdmin) return
    if (!currentPlayer) return

    saveSnapshot()

    const nextPlayers = players.map((p) =>
      p.id === currentPlayer.id ? { ...p, is_passed: true } : p
    )

    savePlayers(nextPlayers)
    addLog('passed', `[${currentPlayer.name} - 유찰]`)

    const nextPlayer = nextPlayers.find(isAuctionTargetPlayer)

    saveAuctionState({
      current_player_id: nextPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextPlayer ? 'paused' : 'ready',
    })
  }

  const handleBid = (team: LocalTeam, amount: number) => {
    if (amount <= auctionState.current_bid) return
    if (team.points < amount) return

    // 입찰은 관리자/참가자 모두 가능
    saveAuctionState({
      ...auctionState,
      current_bid: amount,
      current_bidder_team_id: team.id,
      timer_remaining: DEFAULT_TIMER,
    })

    addLog('bid', `[${team.name} - ${amount}포인트 입찰]`)
  }

  const handlePrevPlayer = () => {
    if (!isAdmin) return

    const availablePlayers = getAvailablePlayers()
    const currentIndex = currentPlayer
      ? availablePlayers.findIndex((p) => p.id === currentPlayer.id)
      : 0

    const prevPlayer = availablePlayers[currentIndex - 1]
    if (!prevPlayer) return

    clearAuctionLogs()

    saveAuctionState({
      current_player_id: prevPlayer.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleNextPlayer = () => {
    if (!isAdmin) return

    const nextPlayer = getNextPlayer()
    if (!nextPlayer) return

    clearAuctionLogs()

    saveAuctionState({
      current_player_id: nextPlayer.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleSelectPlayer = (player: LocalPlayer) => {
    if (!isAdmin) return
    if (player.is_captain) return

    clearAuctionLogs()

    saveAuctionState({
      current_player_id: player.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleShufflePlayers = () => {
    if (!isAdmin) return

    const availablePlayers = getAvailablePlayers()
    const unavailablePlayers = players.filter((p) => p.team_id || p.is_passed || p.is_captain)

    if (availablePlayers.length < 2) {
      alert('플레이어가 2명 이상 있어야 돌아갑니다.')
      return
    }

    saveSnapshot()

    const shuffled = [...availablePlayers]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const nextPlayers = [...shuffled, ...unavailablePlayers]

    savePlayers(nextPlayers)
    // removed log, '경매 순서 랜덤 완료')

    if (shuffled[0]) {
      saveAuctionState({
        current_player_id: shuffled[0].id,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: DEFAULT_TIMER,
        status: 'paused',
      })
    }
  }

  const handleResetAll = () => {
    if (!isAdmin) return
    if (!confirm('경매 기록을 전체 초기화할까요?')) return

    saveSnapshot()

    const resetPlayers = players.map((p) => ({
      ...p,
      team_id: p.is_captain ? p.team_id : null,
      bid_amount: 0,
      is_passed: false,
    }))

    const resetTeams = syncCaptainTeamNames(
      resetPlayers,
      teams.map((t) => ({
        ...t,
        points: DEFAULT_POINTS,
      }))
    )

    savePlayers(resetPlayers)
    saveTeams(resetTeams)

    const firstPlayer = resetPlayers.find(isAuctionTargetPlayer) || null

    saveAuctionState({
      current_player_id: firstPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'ready',
    })

    clearAuctionLogs()
  }

  const handleRecoverPassed = (player: LocalPlayer) => {
    if (!isAdmin) return

    saveSnapshot()

    const nextPlayers = players.map((p) =>
      p.id === player.id ? { ...p, is_passed: false } : p
    )

    savePlayers(nextPlayers)
    // removed log, `${player.name} 유찰 복구`)
  }

  const leftTeams = teams.slice(0, 8)
  const rightTeams = teams.slice(8, 16)

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
              <h1 className="text-2xl font-black text-primary">경매 시스템</h1>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? '관리자 모드 / 전체 경매 관리'
                  : '참가자 모드 / 입찰만 가능합니다'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => window.open('/overlay', '_blank')}>
                OBS 화면 열기
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.setItem('auction_mode', 'landmark')
              window.location.href = '/admin/landmark-auction'
          }}
              >
               랜드마크 경매
              </Button>

            {isAdmin && (
              <Button variant="outline" size="sm" onClick={openPointPanel}>
                <Coins className="mr-1 h-4 w-4" />
                개별 포인트 지급
              </Button>
            )}

            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleShufflePlayers}>
                <Shuffle className="mr-1 h-4 w-4" />
                랜덤 경매 순서 돌리기
              </Button>
            )}
          </div>
        </div>

        {isAdmin && isPointPanelOpen && (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-black text-primary">개별 포인트 지급</h3>
                <p className="text-sm text-muted-foreground">
                  입력 후 팀별 지급 버튼을 눌러야 저장됩니다.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleApplyAllTeamPoints}>
                  지급 적용
                </Button>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleResetAllTeamPoints}
                >
                  전체 포인트 초기화
                </Button>

                <Button variant="secondary" size="sm" onClick={() => setIsPointPanelOpen(false)}>
                  닫기
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {teams.map((team) => (
                <div key={team.id} className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-black text-white">{team.name}</span>
                    <span className="shrink-0 text-xs font-bold text-primary">{team.points}포인트</span>
                  </div>

                  <input
                    type="number"
                    value={pointDrafts[team.id] ?? ''}
                    onChange={(e) => handlePointDraftChange(team.id, e.target.value)}
                    placeholder="포인트"
                    min={0}
                    className="w-full rounded border border-border bg-input px-2 py-2 text-sm font-bold"
                  />

                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleApplyTeamPoint(team)}
                  >
                    지급
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-12 gap-5">
          <section className="col-span-3 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xl font-semibold text-primary">현재 선수</h3>

            {currentPlayer ? (
              <div className="flex gap-4">
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-secondary">
                  {currentPlayer.image_url ? (
                    <img
                      src={currentPlayer.image_url}
                      alt={currentPlayer.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl font-black text-muted-foreground">
                      {currentPlayer.name[0]}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-4xl font-black">{currentPlayer.name}</h4>
                  <p className="text-lg font-semibold">티어: {currentPlayer.tier}</p>
                  <p className="text-lg font-semibold">
                    치지직 티어: {currentPlayer.detail_tier || '-'}
                  </p>
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
              <p className="text-muted-foreground">선수를 선택하세요</p>
            )}

            <div className="mt-5 text-center">
              <p className="text-xs text-muted-foreground">남은 시간</p>
              <p className="text-6xl font-black text-white">{auctionState.timer_remaining}</p>
              <p className="text-xs text-muted-foreground">초</p>
            </div>
          </section>

          <section className="col-span-6 rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-black text-primary">경매 순서</h3>
              <span className="text-sm text-muted-foreground">
                {players.filter(isAuctionTargetPlayer).length}명 대기
              </span>
            </div>

            <div className="grid grid-cols-10 gap-3">
              {players
                .filter(isAuctionTargetPlayer)
                .map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => handleSelectPlayer(player)}
                    disabled={!isAdmin}
                    className={`relative aspect-square overflow-hidden rounded-lg border bg-secondary transition-all ${
                      player.id === currentPlayer?.id
                        ? 'border-primary ring-2 ring-primary'
                        : 'border-border'
                    } ${player.is_passed ? 'opacity-40' : ''} ${
                      isAdmin ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    {player.image_url ? (
                      <img src={player.image_url} alt={player.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-black">
                        {player.name.slice(0, 2)}
                      </div>
                    )}

                    <div className="absolute left-0 right-0 top-0 bg-black/75 px-1 py-1">
                      <p className="truncate text-center text-[11px] font-black text-white">{player.name}</p>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-1 py-1">
                      <p className="truncate text-center text-[11px] font-black text-primary">
                        {player.tier}
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </section>

          <section className="col-span-3 rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 text-xl font-black text-primary">유찰자 목록</h3>

            {passedPlayers.length > 0 ? (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {passedPlayers.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-lg bg-secondary p-3">
                    <span className="font-bold">{player.name}</span>

                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => handleRecoverPassed(player)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-md text-muted-foreground">아직 유찰자가 없습니다.</p>
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
              disabled={!currentPlayer}
            >
              <X className="mr-2 h-5 w-5" />
              유찰
            </Button>

            <Button
              variant="outline"
              className="h-12 px-6 text-base font-bold"
              onClick={handlePrevPlayer}
            >
              <ChevronLeft className="mr-2 h-5 w-5" />
              이전 선수
            </Button>

            <Button
              variant="outline"
              className="h-12 px-6 text-base font-bold"
              onClick={handleNextPlayer}
            >
              다음 선수
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              className="h-12 px-6 text-base font-bold"
              onClick={handleUndo}
            >
              되돌리기
            </Button>

            <Button
              variant="destructive"
              className="h-12 px-6 text-base font-bold bg-red-900 hover:bg-red-800"
              onClick={handleResetAll}
            >
              전체 초기화
            </Button>
          </div>
        )}

        <div className="grid grid-cols-[1fr_440px_1fr] gap-5">
          <section className="space-y-3">
            <h3 className="text-lg font-black text-primary">팀 입찰 1~8</h3>
            <div className="grid grid-cols-2 gap-3">
              {leftTeams.map((team) => (
                <TeamBidCard
                  key={team.id}
                  team={team}
                  players={players.filter((p) => p.team_id === team.id).sort((a, b) => Number(b.is_captain) - Number(a.is_captain))}
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
                {logs.filter((log) => ['bid', 'sold', 'passed'].includes(log.action)).length > 0 ? (
                  logs
                    .filter((log) => ['bid', 'sold', 'passed'].includes(log.action))
                    .map((log) => (
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
              <h3 className="mb-3 text-xl font-black text-primary">팀 현황</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {teams.map((team) => (
                  <div key={team.id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-xl font-extrabold text-white">{team.name}</span>
                    <span className="shrink-0 text-white text-base font-bold">{team.points}포인트</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-black text-primary">팀 입찰 9~16</h3>
            <div className="grid grid-cols-2 gap-3">
              {rightTeams.map((team) => (
                <TeamBidCard
                  key={team.id}
                  team={team}
                  players={players.filter((p) => p.team_id === team.id).sort((a, b) => Number(b.is_captain) - Number(a.is_captain))}
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

interface TeamBidCardProps {
  team: LocalTeam
  players: LocalPlayer[]
  onBid: (amount: number) => void
  currentBid: number
  isCurrentBidder: boolean
  disabled: boolean
}

function TeamBidCard({
  team,
  players,
  onBid,
  currentBid,
  isCurrentBidder,
  disabled,
}: TeamBidCardProps) {
  const [bidAmount, setBidAmount] = useState('')

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
        {players.length > 0 ? (
          <div className="space-y-1.5">
            {players.map((player) => (
              <div key={player.id} className="flex items-center justify-between gap-2 rounded bg-secondary/60 px-2 py-1">
                <span className="truncate text-base font-bold">{player.is_captain ? `[팀장] ${player.name}` : player.name}</span>
                <span className="shrink-0 text-xs font-black text-primary">
                  {player.tier}
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
