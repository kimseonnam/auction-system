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
  Coins,
} from 'lucide-react'

type LocalPlayer = {
  id: string
  name: string
  tier: string
  detail_tier?: string | null
  available_days?: string | null
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
  join_code?: string | null
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

const normalizeAuctionState = (value: any): LocalAuctionState => ({
  current_player_id: value?.current_player_id ?? null,
  current_bid: Number(value?.current_bid ?? 0),
  current_bidder_team_id: value?.current_bidder_team_id ?? null,
  timer_remaining: Number(value?.timer_remaining ?? DEFAULT_TIMER),
  status:
    value?.status === 'running' || value?.status === 'paused' || value?.status === 'ready'
      ? value.status
      : 'ready',
})

export default function AuctionPage() {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const auctionStateRef = useRef<LocalAuctionState>(defaultAuctionState)
  const playersRef = useRef<LocalPlayer[]>([])
  const teamsRef = useRef<LocalTeam[]>([])
  const logsRef = useRef<LocalAuctionLog[]>([])

  const [role, setRole] = useState<AuctionRole>('participant')
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [auctionState, setAuctionState] = useState<LocalAuctionState>(defaultAuctionState)
  const [logs, setLogs] = useState<LocalAuctionLog[]>([])
  const [isPointPanelOpen, setIsPointPanelOpen] = useState(false)
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({})
  const [participantTeamId, setParticipantTeamId] = useState<string | null>(null)
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [joinCodeError, setJoinCodeError] = useState('')

  const isAdmin = role === 'admin'
  const participantTeam = teams.find((team) => team.id === participantTeamId) || null

  useEffect(() => {
    auctionStateRef.current = auctionState
  }, [auctionState])

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    teamsRef.current = teams
  }, [teams])

  useEffect(() => {
    logsRef.current = logs
  }, [logs])

  const saveLocalOverlaySnapshot = useCallback(
    (
      nextPlayers: LocalPlayer[],
      nextTeams: LocalTeam[],
      nextState: LocalAuctionState,
      nextLogs: LocalAuctionLog[]
    ) => {
      const cleanPlayers = nextPlayers.map((player) => ({
        ...player,
        image_url: player.image_url || null,
      }))

      localStorage.setItem('auction_mode', 'player')
      localStorage.setItem('auction_players', JSON.stringify(cleanPlayers))
      localStorage.setItem('players', JSON.stringify(cleanPlayers))
      localStorage.setItem('auction_teams', JSON.stringify(nextTeams))
      localStorage.setItem('auction_state', JSON.stringify(nextState))
      localStorage.setItem('auction_logs', JSON.stringify(nextLogs))
      localStorage.setItem(
        'auction_snapshot',
        JSON.stringify({
          players: cleanPlayers,
          auction_players: cleanPlayers,
          teams: nextTeams,
          auctionState: nextState,
          logs: nextLogs,
        })
      )
    },
    []
  )

  const loadAuctionData = useCallback(async () => {
    const [playersResult, teamsResult, stateResult, logsResult] = await Promise.all([
      supabase.from('players').select('*').order('id', { ascending: true }),
      supabase.from('teams').select('*').order('id', { ascending: true }),
      supabase.from('auction_state').select('*').eq('id', 'main').maybeSingle(),
      supabase
        .from('auction_logs')
        .select('*')
        .in('action', ['bid', 'sold', 'passed'])
        .order('created_at', { ascending: false })
        .limit(30),
    ])


    if (playersResult.error) console.error('players load error:', playersResult.error)
    if (teamsResult.error) console.error('teams load error:', teamsResult.error)
    if (stateResult.error) console.error('auction_state load error:', stateResult.error)
    if (logsResult.error) console.error('auction_logs load error:', logsResult.error)

    const loadedPlayers = (playersResult.data || []) as LocalPlayer[]
    const loadedTeamsRaw = (teamsResult.data || []) as LocalTeam[]
    const loadedTeams = syncCaptainTeamNames(
      loadedPlayers,
      loadedTeamsRaw.length > 0 ? loadedTeamsRaw : createDefaultTeams()
    )
    const loadedState = stateResult.data
      ? normalizeAuctionState(stateResult.data)
      : defaultAuctionState
    const loadedLogs = (logsResult.data || []) as LocalAuctionLog[]

    playersRef.current = loadedPlayers
    teamsRef.current = loadedTeams
    auctionStateRef.current = loadedState
    logsRef.current = loadedLogs

    setPlayers(loadedPlayers)
    setTeams(loadedTeams)
    setAuctionState(loadedState)
    setLogs(loadedLogs)
    saveLocalOverlaySnapshot(loadedPlayers, loadedTeams, loadedState, loadedLogs)
  }, [saveLocalOverlaySnapshot])

  useEffect(() => {
    localStorage.setItem('auction_mode', 'player')

    const savedRole = sessionStorage.getItem('auction_role')
    setRole(savedRole === 'admin' || savedRole === 'participant' ? savedRole : 'participant')

    const savedTeamId = sessionStorage.getItem('auction_participant_team_id')
    if (savedTeamId) {
      setParticipantTeamId(savedTeamId)
    }

    loadAuctionData()

    const channel = supabase
      .channel('auction-page-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadAuctionData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, loadAuctionData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' }, loadAuctionData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_logs' }, loadAuctionData)
      .subscribe()

    const pollingInterval = setInterval(loadAuctionData, 500)

    return () => {
      clearInterval(pollingInterval)
      supabase.removeChannel(channel)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [loadAuctionData])

  const savePlayers = async (nextPlayers: LocalPlayer[]) => {
    playersRef.current = nextPlayers
    setPlayers(nextPlayers)
    saveLocalOverlaySnapshot(nextPlayers, teams, auctionState, logs)

    const { error } = await supabase.from('players').upsert(nextPlayers)
    if (error) console.error('players save error:', error)
  }

  const saveTeams = async (nextTeams: LocalTeam[]) => {
    const syncedTeams = syncCaptainTeamNames(playersRef.current, nextTeams)
    teamsRef.current = syncedTeams
    setTeams(syncedTeams)
    saveLocalOverlaySnapshot(players, syncedTeams, auctionState, logs)

    const { error } = await supabase.from('teams').upsert(syncedTeams)
    if (error) console.error('teams save error:', error)
  }

  const saveAuctionState = async (nextState: LocalAuctionState) => {
    auctionStateRef.current = nextState
    setAuctionState(nextState)
    saveLocalOverlaySnapshot(playersRef.current, teamsRef.current, nextState, logsRef.current)

    const { error } = await supabase
      .from('auction_state')
      .upsert({ id: 'main', ...nextState })

    if (error) console.error('auction_state save error:', error)
  }

  const clearAuctionLogs = async () => {
    setLogs([])
    saveLocalOverlaySnapshot(players, teams, auctionState, [])

    const { error } = await supabase
      .from('auction_logs')
      .delete()
      .in('action', ['bid', 'sold', 'passed'])

    if (error) console.error('auction_logs clear error:', error)
  }

  const addLog = async (action: string, message: string) => {
    if (action !== 'bid' && action !== 'sold' && action !== 'passed') return

    const newLog: LocalAuctionLog = {
      id: crypto.randomUUID(),
      action,
      message,
      created_at: new Date().toISOString(),
    }

    const nextLogs = action === 'bid' ? [newLog, ...logsRef.current].slice(0, 30) : [newLog]
    logsRef.current = nextLogs
    setLogs(nextLogs)
    saveLocalOverlaySnapshot(players, teams, auctionState, nextLogs)

    if (action !== 'bid') {
      await supabase.from('auction_logs').delete().in('action', ['bid', 'sold', 'passed'])
    }

    const { error } = await supabase.from('auction_logs').insert(newLog)
    if (error) console.error('auction_logs insert error:', error)
  }

  const handleParticipantLogin = () => {
    if (isAdmin) return

    const code = joinCodeInput.trim()
    if (!code) {
      setJoinCodeError('팀 코드를 입력해주세요.')
      return
    }

    const matchedTeam = teams.find((team) => (team.join_code || '').trim() === code)

    if (!matchedTeam) {
      setJoinCodeError('일치하는 팀 코드가 없습니다.')
      return
    }

    sessionStorage.setItem('auction_participant_team_id', matchedTeam.id)
    setParticipantTeamId(matchedTeam.id)
    setJoinCodeInput('')
    setJoinCodeError('')
  }

  const handleParticipantLogout = () => {
    sessionStorage.removeItem('auction_participant_team_id')
    setParticipantTeamId(null)
    setJoinCodeInput('')
    setJoinCodeError('')
  }

  const openLandmarkAuction = () => {
    localStorage.setItem('auction_mode', 'landmark')
    window.open('/admin/landmark-auction', '_self')
  }

  const auctionPlayers = players.filter((player) => !player.is_captain)
  const currentPlayer = auctionPlayers.find((p) => p.id === auctionState.current_player_id)
  const currentBidderTeam = teams.find((t) => t.id === auctionState.current_bidder_team_id)
  const passedPlayers = auctionPlayers.filter((p) => p.is_passed)

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

  const handleApplyTeamPoint = async (team: LocalTeam) => {
    if (!isAdmin) return

    const rawValue = pointDrafts[team.id] ?? '0'
    const parsedValue = rawValue.trim() === '' ? 0 : parseInt(rawValue)
    const safeValue = Number.isNaN(parsedValue) ? 0 : Math.max(0, parsedValue)

    const nextTeams = teams.map((t) =>
      t.id === team.id ? { ...t, points: safeValue } : t
    )

    await saveTeams(nextTeams)
    setPointDrafts((prev) => ({
      ...prev,
      [team.id]: String(safeValue),
    }))
  }

  const handleApplyAllTeamPoints = async () => {
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

    await saveTeams(nextTeams)

    setPointDrafts(
      nextTeams.reduce<Record<string, string>>((acc, team) => {
        acc[team.id] = String(team.points ?? 0)
        return acc
      }, {})
    )
  }

  const handleResetAllTeamPoints = async () => {
    if (!isAdmin) return
    if (!confirm('모든 팀 포인트를 0으로 초기화할까요?')) return

    const resetTeams = teams.map((team) => ({
      ...team,
      points: 0,
    }))

    await saveTeams(resetTeams)

    setPointDrafts(
      resetTeams.reduce<Record<string, string>>((acc, team) => {
        acc[team.id] = '0'
        return acc
      }, {})
    )
  }

  const saveSnapshot = () => {
    localStorage.setItem(
      'auction_undo',
      JSON.stringify({
        players: players.map((player) => ({
          ...player,
          image_url: null,
        })),
        teams,
        auctionState,
        logs,
      })
    )
  }

  const handleUndo = async () => {
    if (!isAdmin) return

    const saved = localStorage.getItem('auction_undo')

    if (!saved) {
      alert('되돌릴 데이터 없음')
      return
    }

    const snapshot = JSON.parse(saved)

    await savePlayers(snapshot.players)
    await saveTeams(snapshot.teams)
    await saveAuctionState(snapshot.auctionState)

    await clearAuctionLogs()
    if (Array.isArray(snapshot.logs) && snapshot.logs.length > 0) {
      await supabase.from('auction_logs').insert(snapshot.logs)
    }

    setLogs(snapshot.logs || [])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionState.current_player_id, players, getNextPlayer])

  const updateAuctionState = async (updates: Partial<LocalAuctionState>) => {
    await saveAuctionState({
      ...auctionState,
      ...updates,
    })
  }

  useEffect(() => {
    if (!isAdmin || auctionState.status !== 'running') {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    if (timerRef.current) return

    timerRef.current = setInterval(async () => {
      const prev = auctionStateRef.current

      if (prev.status !== 'running') {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        return
      }

      const nextTime = Math.max(0, prev.timer_remaining - 1)
      const nextState: LocalAuctionState = {
        ...prev,
        timer_remaining: nextTime,
        status: nextTime <= 0 ? 'paused' : 'running',
      }

      auctionStateRef.current = nextState
      setAuctionState(nextState)
      saveLocalOverlaySnapshot(playersRef.current, teamsRef.current, nextState, logsRef.current)

      const { error } = await supabase
        .from('auction_state')
        .upsert({ id: 'main', ...nextState })

      if (error) console.error('timer save error:', error)

      if (nextTime <= 0 && timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [auctionState.status, isAdmin, saveLocalOverlaySnapshot])

  const handleStart = async () => {
    if (!isAdmin) return

    if (!currentPlayer || currentPlayer.is_captain) {
      const firstPlayer = getNextPlayer()

      if (!firstPlayer) {
        alert('경매 가능한 플레이어가 없습니다.')
        return
      }

      await clearAuctionLogs()

      await saveAuctionState({
        current_player_id: firstPlayer.id,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: DEFAULT_TIMER,
        status: 'running',
      })
      return
    }

    await updateAuctionState({ status: 'running' })
  }

  const handlePause = async () => {
    if (!isAdmin) return
    await updateAuctionState({ status: 'paused' })
  }

  const handleSold = async () => {
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

    await savePlayers(nextPlayers)
    await saveTeams(nextTeams)

    await addLog('sold', `[${currentPlayer.name} - ${team.name} ${auctionState.current_bid}포인트 낙찰]`)

    const nextPlayer = nextPlayers.find(isAuctionTargetPlayer)

    await saveAuctionState({
      current_player_id: nextPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextPlayer ? 'paused' : 'ready',
    })
  }

  const handlePassed = async () => {
    if (!isAdmin) return
    if (!currentPlayer) return

    saveSnapshot()

    const nextPlayers = players.map((p) =>
      p.id === currentPlayer.id ? { ...p, is_passed: true } : p
    )

    await savePlayers(nextPlayers)
    await addLog('passed', `[${currentPlayer.name} - 유찰]`)

    const nextPlayer = nextPlayers.find(isAuctionTargetPlayer)

    await saveAuctionState({
      current_player_id: nextPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: nextPlayer ? 'paused' : 'ready',
    })
  }

  const handleBid = async (team: LocalTeam, amount: number) => {
    if (!isAdmin && participantTeamId !== team.id) {
      alert('로그인한 본인 팀만 입찰할 수 있습니다.')
      return
    }

    if (amount <= auctionState.current_bid) return
    if (team.points < amount) return

    const nextState: LocalAuctionState = {
      ...auctionState,
      current_bid: amount,
      current_bidder_team_id: team.id,
      timer_remaining: DEFAULT_TIMER,
    }

    await saveAuctionState(nextState)
    await addLog('bid', `[${team.name} - ${amount}포인트 입찰]`)
  }

  const handlePrevPlayer = async () => {
    if (!isAdmin) return

    const availablePlayers = getAvailablePlayers()
    const currentIndex = currentPlayer
      ? availablePlayers.findIndex((p) => p.id === currentPlayer.id)
      : 0

    const prevPlayer = availablePlayers[currentIndex - 1]
    if (!prevPlayer) return

    await clearAuctionLogs()

    await saveAuctionState({
      current_player_id: prevPlayer.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleNextPlayer = async () => {
    if (!isAdmin) return

    const nextPlayer = getNextPlayer()
    if (!nextPlayer) return

    await clearAuctionLogs()

    await saveAuctionState({
      current_player_id: nextPlayer.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleSelectPlayer = async (player: LocalPlayer) => {
    if (!isAdmin) return
    if (player.is_captain) return

    await clearAuctionLogs()

    await saveAuctionState({
      current_player_id: player.id,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'paused',
    })
  }

  const handleShufflePlayers = async () => {
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

    await savePlayers(nextPlayers)

    if (shuffled[0]) {
      await saveAuctionState({
        current_player_id: shuffled[0].id,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: DEFAULT_TIMER,
        status: 'paused',
      })
    }
  }

  const handleResetAll = async () => {
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

    await savePlayers(resetPlayers)
    await saveTeams(resetTeams)

    const firstPlayer = resetPlayers.find(isAuctionTargetPlayer) || null

    await saveAuctionState({
      current_player_id: firstPlayer?.id || null,
      current_bid: 0,
      current_bidder_team_id: null,
      timer_remaining: DEFAULT_TIMER,
      status: 'ready',
    })

    await clearAuctionLogs()
  }

  const handleRecoverPassed = async (player: LocalPlayer) => {
    if (!isAdmin) return

    saveSnapshot()

    const nextPlayers = players.map((p) =>
      p.id === player.id ? { ...p, is_passed: false } : p
    )

    await savePlayers(nextPlayers)
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

        {!isAdmin && (
          <section className="rounded-xl border border-border bg-card p-4">
            {participantTeam ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">현재 로그인된 팀</p>
                  <p className="text-xl font-black text-primary">{participantTeam.name}</p>
                  <p className="text-sm font-bold text-white">보유 포인트: {participantTeam.points}포인트</p>
                </div>

                <Button variant="outline" size="sm" onClick={handleParticipantLogout}>
                  팀 코드 로그아웃
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] space-y-2">
                  <label className="text-sm font-bold text-white">팀 코드 입력</label>
                  <input
                    value={joinCodeInput}
                    onChange={(e) => {
                      setJoinCodeInput(e.target.value)
                      setJoinCodeError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleParticipantLogin()
                    }}
                    placeholder="전달받은코드"
                    className="w-full rounded border border-border bg-input px-3 py-2 text-sm font-bold"
                  />
                  {joinCodeError && (
                    <p className="text-xs font-bold text-destructive">{joinCodeError}</p>
                  )}
                </div>

                <Button onClick={handleParticipantLogin}>
                  팀 입장
                </Button>

                <p className="text-sm text-muted-foreground">
                  팀 코드를 입력해야 본인 팀으로만 입찰할 수 있습니다.
                </p>
              </div>
            )}
          </section>
        )}

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
                  disabled={auctionState.status === 'ready' || (!isAdmin && participantTeamId !== team.id)}
                  canBid={isAdmin || participantTeamId === team.id}
                  isParticipantLoggedIn={isAdmin || Boolean(participantTeamId)}
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
                  disabled={auctionState.status === 'ready' || (!isAdmin && participantTeamId !== team.id)}
                  canBid={isAdmin || participantTeamId === team.id}
                  isParticipantLoggedIn={isAdmin || Boolean(participantTeamId)}
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
  canBid: boolean
  isParticipantLoggedIn: boolean
}

function TeamBidCard({
  team,
  players,
  onBid,
  currentBid,
  isCurrentBidder,
  disabled,
  canBid,
  isParticipantLoggedIn,
}: TeamBidCardProps) {
  const [bidAmount, setBidAmount] = useState('')

  const handleCustomBid = () => {
    if (!isParticipantLoggedIn) {
      alert('먼저 팀 코드를 입력해주세요.')
      return
    }

    if (!canBid) {
      alert('본인 팀만 입찰할 수 있습니다.')
      return
    }

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
          placeholder={canBid ? '입찰액' : '본인 팀만 입찰'}
          className="min-w-0 flex-1 rounded border border-border bg-input px-3 py-2 text-sm"
          disabled={disabled || !canBid}
        />

        <Button
          size="sm"
          className="h-9 shrink-0"
          onClick={handleCustomBid}
          disabled={disabled || !bidAmount || !canBid}
        >
          {canBid ? '입찰' : '잠김'}
        </Button>
      </div>
    </div>
  )
}
