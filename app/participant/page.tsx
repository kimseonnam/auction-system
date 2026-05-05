'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase/client'
import { ArrowLeft, RefreshCw } from 'lucide-react'

type AuctionMode = 'player' | 'landmark' | 'results'

type LocalTeam = {
  id: string
  name: string
  points: number
  join_code?: string | null
  landmarks?: string[]
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

type LocalLandmark = {
  id: string
  name: string
  image_url?: string | null
  image?: string | null
  team_id?: string | null
  bid_amount?: number | null
  is_passed?: boolean | null
  category?: string | null
  map?: string | null
  auction_order?: number | null
}

type PlayerAuctionState = {
  current_player_id: string | null
  current_bid: number
  current_bidder_team_id: string | null
  timer_remaining: number
  status: 'ready' | 'running' | 'paused'
  overlay_mode?: AuctionMode | null
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

const DEFAULT_PLAYER_STATE: PlayerAuctionState = {
  current_player_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: 20,
  status: 'ready',
  overlay_mode: 'player',
}

const DEFAULT_LANDMARK_STATE: LandmarkAuctionState = {
  current_landmark_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: 20,
  status: 'ready',
}

const CONNECTION_TIMEOUT_MS = 5 * 60 * 1000
const PARTICIPANT_SESSION_ID_KEY = 'auction_participant_session_id'

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
  if (value === 'landmark' || value === 'results' || value === 'player') return value
  return 'player'
}

const getTeamNumber = (teamId?: string | null) => {
  if (!teamId) return 9999
  const match = teamId.match(/team-(\d+)/)
  return match ? Number(match[1]) : 9999
}

const getLandmarkImage = (landmark?: LocalLandmark | null) =>
  landmark?.image_url || landmark?.image || null

const getLandmarkMapName = (landmark?: LocalLandmark | null) =>
  landmark?.category || landmark?.map || '랜드마크'

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

export default function ParticipantPage() {
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [playerState, setPlayerState] = useState<PlayerAuctionState>(DEFAULT_PLAYER_STATE)
  const [landmarkState, setLandmarkState] = useState<LandmarkAuctionState>(DEFAULT_LANDMARK_STATE)
  const [logs, setLogs] = useState<AuctionLog[]>([])
  const [mode, setMode] = useState<AuctionMode>('player')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [bidInput, setBidInput] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isBidding, setIsBidding] = useState(false)
  const [sessionId, setSessionId] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)

    const [teamsResult, playersResult, landmarksResult, playerStateResult, landmarkStateResult, logsResult] =
      await Promise.all([
        supabase.from('teams').select('*').order('id', { ascending: true }),
        supabase
          .from('players')
          .select('*')
          .order('auction_order', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true }),
        supabase
          .from('landmarks')
          .select('*')
          .order('auction_order', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true }),
        supabase.from('auction_state').select('*').eq('id', 'main').maybeSingle(),
        supabase.from('landmark_auction_state').select('*').eq('id', 'main').maybeSingle(),
        supabase
          .from('auction_logs')
          .select('*')
          .in('action', ['bid', 'sold', 'passed'])
          .order('created_at', { ascending: false })
          .limit(20),
      ])

    if (teamsResult.error) console.error('participant teams load error:', teamsResult.error)
    if (playersResult.error) console.error('participant players load error:', playersResult.error)
    if (landmarksResult.error) console.error('participant landmarks load error:', landmarksResult.error)
    if (playerStateResult.error) console.error('participant auction_state load error:', playerStateResult.error)
    if (landmarkStateResult.error) console.error('participant landmark_state load error:', landmarkStateResult.error)
    if (logsResult.error) console.error('participant logs load error:', logsResult.error)

    const nextTeams = ((teamsResult.data || []) as LocalTeam[]).sort(
      (a, b) => getTeamNumber(a.id) - getTeamNumber(b.id)
    )
    const nextPlayerState = playerStateResult.data
      ? {
          current_player_id: playerStateResult.data.current_player_id ?? null,
          current_bid: Number(playerStateResult.data.current_bid ?? 0),
          current_bidder_team_id: playerStateResult.data.current_bidder_team_id ?? null,
          timer_remaining: Number(playerStateResult.data.timer_remaining ?? 20),
          status:
            playerStateResult.data.status === 'running' ||
            playerStateResult.data.status === 'paused' ||
            playerStateResult.data.status === 'ready'
              ? playerStateResult.data.status
              : 'ready',
          overlay_mode: normalizeMode((playerStateResult.data as any).overlay_mode),
        }
      : DEFAULT_PLAYER_STATE

    const nextLandmarkState = landmarkStateResult.data
      ? {
          current_landmark_id: landmarkStateResult.data.current_landmark_id ?? null,
          current_bid: Number(landmarkStateResult.data.current_bid ?? 0),
          current_bidder_team_id: landmarkStateResult.data.current_bidder_team_id ?? null,
          timer_remaining: Number(landmarkStateResult.data.timer_remaining ?? 20),
          status:
            landmarkStateResult.data.status === 'running' ||
            landmarkStateResult.data.status === 'paused' ||
            landmarkStateResult.data.status === 'ready'
              ? landmarkStateResult.data.status
              : 'ready',
        }
      : DEFAULT_LANDMARK_STATE

    setTeams(nextTeams)
    setPlayers((playersResult.data || []) as LocalPlayer[])
    setLandmarks((landmarksResult.data || []) as LocalLandmark[])
    setPlayerState(nextPlayerState)
    setLandmarkState(nextLandmarkState)
    setLogs((logsResult.data || []) as AuctionLog[])
    setMode(normalizeMode(nextPlayerState.overlay_mode))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    setSessionId(getParticipantSessionId())
  }, [])

  useEffect(() => {
    const savedTeamId = sessionStorage.getItem('auction_participant_team_id') || sessionStorage.getItem('auction_team_id') || sessionStorage.getItem('team_id')
    if (savedTeamId) setTeamId(savedTeamId)

    loadData()

    const channel = supabase
      .channel('participant-page-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landmarks' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_state' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landmark_auction_state' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_logs' }, loadData)
      .subscribe()

    const interval = setInterval(loadData, 1000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [loadData])

  const joinedTeam = useMemo(
    () => (teamId ? teams.find((team) => team.id === teamId) || null : null),
    [teamId, teams]
  )

  const auctionPlayers = players.filter((player) => !player.is_captain)
  const currentPlayer = auctionPlayers.find((player) => player.id === playerState.current_player_id) || null
  const currentPlayerBidder = teams.find((team) => team.id === playerState.current_bidder_team_id) || null
  const currentLandmark = landmarks.find((landmark) => landmark.id === landmarkState.current_landmark_id) || null
  const currentLandmarkBidder = teams.find((team) => team.id === landmarkState.current_bidder_team_id) || null

  const myPlayers = joinedTeam
    ? players.filter((player) => player.team_id === joinedTeam.id && !player.is_captain)
    : []
  const myLandmarks = joinedTeam
    ? landmarks.filter((landmark) => landmark.team_id === joinedTeam.id || joinedTeam.landmarks?.includes(landmark.id))
    : []

  const canBidPlayer = Boolean(
    joinedTeam &&
    currentPlayer &&
    playerState.status === 'running' &&
    playerState.timer_remaining > 0 &&
    myPlayers.length < 3
  )
  const canBidLandmark = Boolean(
    joinedTeam &&
    currentLandmark &&
    landmarkState.status === 'running' &&
    landmarkState.timer_remaining > 0 &&
    myLandmarks.length < 2
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

  const availableLandmarks = landmarks.filter(
    (landmark) => !landmark.team_id && !landmark.is_passed
  )
  const orderedQueueLandmarks = currentLandmark
    ? [
        currentLandmark,
        ...availableLandmarks.filter((landmark) => landmark.id !== currentLandmark.id),
      ]
    : availableLandmarks

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

    touchConnection()
    const interval = setInterval(touchConnection, 30000)

    const handlePageHide = () => {
      releaseTeamConnection(teamId)
    }

    window.addEventListener('pagehide', handlePageHide)

    return () => {
      clearInterval(interval)
      window.removeEventListener('pagehide', handlePageHide)
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
      if (mode === 'landmark') {
        if (!currentLandmark) {
          alert('현재 경매 중인 랜드마크가 없습니다.')
          return
        }
        if (myLandmarks.length >= 2) {
          alert('이미 랜드마크 2개를 가져간 팀은 더 이상 입찰할 수 없습니다.')
          return
        }
        if (landmarkState.status !== 'running' || landmarkState.timer_remaining <= 0) {
          alert('입찰 시간이 종료되었습니다.')
          return
        }
        if (amount <= landmarkState.current_bid) return
        if (joinedTeam.points < amount) {
          alert('보유 포인트보다 많이 입찰할 수 없습니다.')
          return
        }

        const { error } = await supabase
          .from('landmark_auction_state')
          .upsert({
            id: 'main',
            ...landmarkState,
            current_bid: amount,
            current_bidder_team_id: joinedTeam.id,
            timer_remaining: 20,
          })

        if (error) {
          console.error('landmark bid error:', error)
          alert('입찰 저장에 실패했습니다.')
          return
        }

        await addLog(`[${joinedTeam.name} - ${amount}포인트 입찰]`)
        setBidInput('')
        await loadData()
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
          timer_remaining: 20,
        })

      if (error) {
        console.error('player bid error:', error)
        alert('입찰 저장에 실패했습니다.')
        return
      }

      await addLog(`[${joinedTeam.name} - ${amount}포인트 입찰]`)
      setBidInput('')
      await loadData()
    } finally {
      setIsBidding(false)
    }
  }

  const activeCurrentBid = mode === 'landmark' ? landmarkState.current_bid : playerState.current_bid
  const activeTimer = mode === 'landmark' ? landmarkState.timer_remaining : playerState.timer_remaining
  const activeStatus = mode === 'landmark' ? landmarkState.status : playerState.status
  const activeBidder = mode === 'landmark' ? currentLandmarkBidder : currentPlayerBidder
  const activeCanBid = mode === 'landmark' ? canBidLandmark : canBidPlayer
  const limitText = mode === 'landmark'
    ? `${myLandmarks.length}/2 랜드마크 보유`
    : `${myPlayers.length}/3 플레이어 보유`

  return (
    <main className="min-h-screen bg-background p-4 text-white">
      <div className="mx-auto max-w-[1540px] space-y-4">
        <header className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-black">경매 참가자</h1>
              <p className="text-sm text-muted-foreground">팀 코드 1번 입력 후 인원/랜드마크 경매를 여기서 입찰합니다.</p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </header>

        {!joinedTeam ? (
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-xl font-black text-primary">팀 코드 입력</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
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
              <Button variant="outline" onClick={handleLogout}>팀 코드 다시 입력</Button>
            </div>
          </section>
        )}

        <section className="grid grid-cols-12 gap-4">
          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-black">현재 경매</h2>
              <span className="rounded bg-primary px-3 py-1 text-sm font-black text-white">
                {mode === 'landmark' ? '랜드마크 경매' : mode === 'results' ? '결과 화면' : '인원 경매'}
              </span>
            </div>

            {mode === 'landmark' ? (
              currentLandmark ? (
                <CurrentLandmarkCard landmark={currentLandmark} />
              ) : (
                <EmptyCurrent text="현재 경매 중인 랜드마크가 없습니다." />
              )
            ) : currentPlayer ? (
              <CurrentPlayerCard player={currentPlayer} />
            ) : (
              <EmptyCurrent text="현재 경매 중인 선수가 없습니다." />
            )}

            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <InfoBox label="현재 입찰" value={`${activeCurrentBid || 0}P`} />
              <InfoBox label="입찰 팀" value={activeBidder?.name || '없음'} />
              <InfoBox label="남은 시간" value={`${activeTimer || 0}초`} />
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
                <p>인원 경매는 팀당 3명, 랜드마크 경매는 팀당 2개까지만 입찰할 수 있습니다.</p>
              </div>
            </div>
          </div>

          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-4">
            <h2 className="mb-4 text-xl font-black">내 팀 현황</h2>
            {!joinedTeam ? (
              <p className="text-muted-foreground">팀 코드를 입력하면 내 팀 현황이 표시됩니다.</p>
            ) : (
              <div className="space-y-4">
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

                <div>
                  <h3 className="mb-2 font-black text-white">낙찰 랜드마크 {myLandmarks.length}/2</h3>
                  <div className="space-y-2">
                    {myLandmarks.length > 0 ? myLandmarks.map((landmark) => (
                      <div key={landmark.id} className="flex items-center justify-between rounded bg-secondary px-3 py-2">
                        <span className="font-bold">{landmark.name}</span>
                        <span className="text-xs font-black text-primary">{getLandmarkMapName(landmark)}</span>
                      </div>
                    )) : <p className="text-sm text-muted-foreground">아직 낙찰 랜드마크 없음</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-12 gap-4">
          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-black text-white">
                {mode === 'landmark' ? '랜드마크 순서' : '입찰 순서'}
              </h2>
              <span className="text-lg font-black text-white">
                1 / {mode === 'landmark' ? Math.max(orderedQueueLandmarks.length, 1) : Math.max(orderedQueuePlayers.length, 1)}
              </span>
            </div>

            <div className="grid grid-cols-10 gap-2.5 content-start">
              {mode === 'landmark' ? (
                orderedQueueLandmarks.length > 0 ? (
                  orderedQueueLandmarks.map((landmark, index) => (
                    <LandmarkQueueCard
                      key={landmark.id}
                      landmark={landmark}
                      isCurrent={index === 0}
                    />
                  ))
                ) : (
                  <p className="col-span-full py-10 text-center text-muted-foreground">대기 중인 랜드마크가 없습니다.</p>
                )
              ) : orderedQueuePlayers.length > 0 ? (
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

          <div className="col-span-12 rounded-xl border border-border bg-card p-5 lg:col-span-5">
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
    </main>
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

function CurrentLandmarkCard({ landmark }: { landmark: LocalLandmark }) {
  return (
    <div className="flex gap-4">
      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-secondary">
        {getLandmarkImage(landmark) ? (
          <img src={getLandmarkImage(landmark)!} alt={landmark.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground">
            {(landmark.name || '?')[0]}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-black text-primary">{getLandmarkMapName(landmark)}</p>
        <h3 className="truncate text-4xl font-black text-white">{landmark.name}</h3>
        <p className="text-sm text-muted-foreground">랜드마크 경매 진행중</p>
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="truncate text-xl font-black text-white">{value}</p>
    </div>
  )
}


function PlayerQueueCard({ player, isCurrent }: { player: LocalPlayer; isCurrent: boolean }) {
  return (
    <div
      className={`relative aspect-square min-h-[62px] overflow-hidden rounded-md border bg-[#111] ${
        isCurrent
          ? 'border-primary ring-2 ring-primary shadow-[0_0_14px_rgba(239,68,68,0.65)]'
          : 'border-border'
      }`}
    >
      {player.image_url ? (
        <img src={player.image_url} alt={player.name} className="absolute inset-0 h-full w-full object-cover opacity-70" />
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
        <p className="truncate text-[12px] font-black leading-tight text-white">{player.name}</p>
        <p className={`mt-0.5 text-[11px] font-black leading-none ${getTierColorClass(player.tier)}`}>{player.tier}</p>
      </div>
    </div>
  )
}

function LandmarkQueueCard({ landmark, isCurrent }: { landmark: LocalLandmark; isCurrent: boolean }) {
  return (
    <div
      className={`relative aspect-square min-h-[62px] overflow-hidden rounded-md border bg-[#111] ${
        isCurrent
          ? 'border-primary ring-2 ring-primary shadow-[0_0_14px_rgba(239,68,68,0.65)]'
          : 'border-border'
      }`}
    >
      {getLandmarkImage(landmark) ? (
        <img src={getLandmarkImage(landmark)!} alt={landmark.name} className="absolute inset-0 h-full w-full object-cover opacity-65" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary text-lg font-black text-muted-foreground">
          {(landmark.name || '?')[0]}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/90" />

      {isCurrent && (
        <span className="absolute left-1 top-1 z-10 rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
          현재
        </span>
      )}

      <div className="absolute inset-x-1 bottom-1 z-10 rounded bg-black/70 px-1 py-1 text-center">
        <p className="truncate text-[10px] font-black leading-tight text-primary">{getLandmarkMapName(landmark)}</p>
        <p className="mt-0.5 truncate text-[12px] font-black leading-tight text-white">{landmark.name}</p>
      </div>
    </div>
  )
}
