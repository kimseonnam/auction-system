'use client'

import { useState, useEffect, useRef } from 'react'

type LocalSettings = {
  name: string
  team_count: number
  default_points: number
  timer_seconds: number
  admin_code: string
}

type LocalTeam = {
  id: string
  name: string
  points: number
  landmarks?: string[]
  players?: string[]
  player_ids?: string[]
}

type LocalPlayer = {
  id: string
  name: string
  tier: string
  detail_tier?: string
  available_days?: string
  bio?: string
  image_url: string | null
  team_id?: string | null
  teamId?: string | null
  bid_amount: number
  bidAmount?: number
  is_passed: boolean
  isPassed?: boolean
  is_captain?: boolean
  isCaptain?: boolean
}

type LocalLandmark = {
  id: string
  name: string
  image_url?: string | null
  image?: string | null
  team_id?: string | null
  teamId?: string | null
  bid_amount?: number
  bidAmount?: number
  is_passed?: boolean
  isPassed?: boolean
  category?: string
  map?: string
}

type LocalAuctionState = {
  current_player_id: string | null
  current_bid: number
  current_bidder_team_id: string | null
  timer_remaining: number
  status: 'ready' | 'running' | 'paused'
}

type LandmarkAuctionState = {
  current_landmark_id: string | null
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

type PopupState = {
  type: 'sold' | 'passed'
  playerName: string
  teamName?: string
  amount?: string
}

type AuctionMode = 'player' | 'landmark' | 'results'

type AuctionSnapshot = {
  teams?: LocalTeam[]
  landmarks?: LocalLandmark[]
  players?: LocalPlayer[]
  auction_players?: LocalPlayer[]
}

const DEFAULT_SETTINGS: LocalSettings = {
  name: '경매 시스템',
  team_count: 16,
  default_points: 100,
  timer_seconds: 15,
  admin_code: '1234',
}

const DEFAULT_AUCTION_STATE: LocalAuctionState = {
  current_player_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: 15,
  status: 'ready',
}

const DEFAULT_LANDMARK_AUCTION_STATE: LandmarkAuctionState = {
  current_landmark_id: null,
  current_bid: 0,
  current_bidder_team_id: null,
  timer_remaining: 15,
  status: 'ready',
}

const TIERS = ['A', 'B', 'C', 'D']

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

const getTierGlowClass = (tier?: string) => {
  switch (tier) {
    case 'A':
      return 'tier-glow tier-glow-a'
    case 'B':
      return 'tier-glow tier-glow-b'
    case 'C':
      return 'tier-glow tier-glow-c'
    case 'D':
      return 'tier-glow tier-glow-d'
    default:
      return ''
  }
}

const getTierBorderClass = (tier?: string) => {
  switch (tier) {
    case 'A':
      return 'border-red-500/70'
    case 'B':
      return 'border-blue-400/70'
    case 'C':
      return 'border-yellow-400/70'
    case 'D':
      return 'border-gray-400/70'
    default:
      return 'border-[#2a2a2a]'
  }
}

const getLandmarkImage = (landmark?: LocalLandmark | null) =>
  landmark?.image_url || landmark?.image || null

const getLandmarkMapName = (landmark?: LocalLandmark | null) =>
  landmark?.category || landmark?.map || '맵'

const getLandmarkFullName = (landmark?: LocalLandmark | null) => {
  if (!landmark) return '랜드마크 선택 대기'
  const mapName = getLandmarkMapName(landmark)
  return mapName ? `${mapName} / ${landmark.name}` : landmark.name
}

const getTeamNumber = (teamId?: string | null) => {
  if (!teamId) return 9999
  const match = teamId.match(/team-(\d+)/)
  return match ? Number(match[1]) : 9999
}

const getTeamNumberFromTeam = (team: LocalTeam) => getTeamNumber(team.id)

const isSameTeamId = (playerTeamId: string | null | undefined, team: LocalTeam) => {
  if (!playerTeamId) return false

  const teamNumber = getTeamNumberFromTeam(team)
  const candidates = [
    team.id,
    team.name,
    String(teamNumber),
    `team-${teamNumber}`,
    `TEAM ${teamNumber}`,
    `팀${teamNumber}`,
    `팀장${String(teamNumber).padStart(2, '0')}`,
    `팀장${teamNumber}`,
  ]

  return candidates.includes(playerTeamId)
}

const getPlayerImageUrl = (player?: LocalPlayer | null) => {
  if (!player) return null

  const anyPlayer = player as any

  return (
    player.image_url ||
    anyPlayer.imageUrl ||
    anyPlayer.image ||
    anyPlayer.profile_image ||
    anyPlayer.profileImage ||
    anyPlayer.avatar_url ||
    anyPlayer.avatarUrl ||
    null
  )
}


const getRawTeamId = (player: LocalPlayer) => player.team_id || player.teamId || null
const getRawIsCaptain = (player: LocalPlayer) => Boolean(player.is_captain ?? player.isCaptain)

const normalizePlayer = (player: LocalPlayer): LocalPlayer => ({
  ...player,
  team_id: player.team_id || player.teamId || null,
  bid_amount: Number(player.bid_amount ?? player.bidAmount ?? 0),
  is_passed: Boolean(player.is_passed ?? player.isPassed),
  is_captain: Boolean(player.is_captain ?? player.isCaptain),
  image_url: getPlayerImageUrl(player),
})

const mergePlayers = (...playerGroups: LocalPlayer[][]) => {
  const playerMap = new Map<string, LocalPlayer>()
  const allPlayers = playerGroups.flat().filter(Boolean)

  allPlayers.forEach((rawPlayer) => {
    if (!rawPlayer?.id) return

    const player = normalizePlayer(rawPlayer)
    const sameNameWithImage = allPlayers
      .map((item) => normalizePlayer(item))
      .find((item) => item.id !== player.id && item.name === player.name && getPlayerImageUrl(item))

    const prev = playerMap.get(player.id) || sameNameWithImage

    playerMap.set(player.id, {
      ...(prev || player),
      ...player,
      name: player.name || prev?.name || '',
      tier: player.tier || prev?.tier || '',
      image_url: getPlayerImageUrl(player) || getPlayerImageUrl(prev) || null,
      team_id: player.team_id || prev?.team_id || null,
      bid_amount: Number(player.bid_amount || prev?.bid_amount || 0),
      is_passed: Boolean(player.is_passed || prev?.is_passed),
      is_captain: Boolean(player.is_captain || prev?.is_captain),
    })
  })

  return Array.from(playerMap.values())
}

const getResultTeamPlayers = (team: LocalTeam, players: LocalPlayer[]) => {
  const ids = [...(team.players || []), ...(team.player_ids || [])]

  return players
    .filter((player) => {
      const rawTeamId = getRawTeamId(player)
      return (
        isSameTeamId(rawTeamId, team) ||
        ids.includes(player.id) ||
        ids.includes(player.name)
      )
    })
    .filter((player, index, array) => array.findIndex((item) => item.id === player.id) === index)
    .sort((a, b) => {
      if (getRawIsCaptain(a) && !getRawIsCaptain(b)) return -1
      if (!getRawIsCaptain(a) && getRawIsCaptain(b)) return 1
      const tierA = TIERS.indexOf(a.tier)
      const tierB = TIERS.indexOf(b.tier)
      return (tierA === -1 ? 99 : tierA) - (tierB === -1 ? 99 : tierB)
    })
}


const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback

  try {
    const parsed = JSON.parse(value)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

const normalizeLandmarks = (value: unknown): LocalLandmark[] => {
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

const normalizeTeams = (teams: LocalTeam[]) =>
  (Array.isArray(teams) ? teams : []).map((team) => ({
    ...team,
    landmarks: Array.isArray(team.landmarks) ? team.landmarks : [],
  }))

const playPopupSound = (type: 'sold' | 'passed') => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return

    const ctx = new AudioContextClass()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)

    const notes = type === 'sold' ? [523.25, 659.25, 783.99] : [392, 329.63]
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator()
      const noteGain = ctx.createGain()

      osc.type = type === 'sold' ? 'triangle' : 'sawtooth'
      osc.frequency.setValueAtTime(freq, now + index * 0.12)

      noteGain.gain.setValueAtTime(0.0001, now + index * 0.12)
      noteGain.gain.exponentialRampToValueAtTime(0.22, now + index * 0.12 + 0.02)
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.22)

      osc.connect(noteGain)
      noteGain.connect(gain)

      osc.start(now + index * 0.12)
      osc.stop(now + index * 0.12 + 0.25)
    })

    setTimeout(() => ctx.close(), 900)
  } catch {
    // 브라우저 자동재생 제한 등으로 실패해도 화면은 정상 표시
  }
}

export default function OverlayPage() {
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_SETTINGS)
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [auctionMode, setAuctionMode] = useState<AuctionMode>('player')
  const [auctionState, setAuctionState] = useState<LocalAuctionState>(DEFAULT_AUCTION_STATE)
  const [landmarkAuctionState, setLandmarkAuctionState] = useState<LandmarkAuctionState>(DEFAULT_LANDMARK_AUCTION_STATE)
  const [logs, setLogs] = useState<LocalAuctionLog[]>([])
  const [landmarkLogs, setLandmarkLogs] = useState<LocalAuctionLog[]>([])
  const [popup, setPopup] = useState<PopupState | null>(null)

  const lastPopupLogIdRef = useRef<string | null>(null)
  const popupTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastPopupModeRef = useRef<AuctionMode | null>(null)
  const popupReadyRef = useRef(false)

  const loadLocalData = () => {
    const savedMode = localStorage.getItem('auction_mode')
    setAuctionMode(
      savedMode === 'landmark'
        ? 'landmark'
        : savedMode === 'results'
        ? 'results'
        : 'player'
    )

    const savedSettings = localStorage.getItem('auction_settings')
    setSettings(safeJsonParse<LocalSettings>(savedSettings, DEFAULT_SETTINGS))

    const snapshot =
      safeJsonParse<AuctionSnapshot>(localStorage.getItem('auction_snapshot'), {}) ||
      safeJsonParse<AuctionSnapshot>(localStorage.getItem('auctionSnapshot'), {}) ||
      {}

    const savedTeams = localStorage.getItem('auction_teams')
    const loadedTeams = normalizeTeams(safeJsonParse<LocalTeam[]>(savedTeams, []))
    const snapshotTeams = normalizeTeams(Array.isArray(snapshot.teams) ? snapshot.teams : [])
    setTeams(loadedTeams.length > 0 ? loadedTeams : snapshotTeams)

    const savedAuctionPlayers = safeJsonParse<LocalPlayer[]>(localStorage.getItem('auction_players'), [])
    const savedRegisteredPlayers = safeJsonParse<LocalPlayer[]>(localStorage.getItem('players'), [])
    const snapshotAuctionPlayers = Array.isArray(snapshot.auction_players) ? snapshot.auction_players : []
    const snapshotPlayers = Array.isArray(snapshot.players) ? snapshot.players : []

    // 플레이어 관리 페이지에 등록된 선수가 0명이면,
    // 예전 테스트/스냅샷/auction_players에 남아있는 선수가 오버레이에 다시 뜨지 않게 막습니다.
    const activePlayers =
      savedRegisteredPlayers.length > 0
        ? mergePlayers(savedRegisteredPlayers, savedAuctionPlayers, snapshotPlayers, snapshotAuctionPlayers)
        : []

    setPlayers(activePlayers)

    const savedLandmarks =
      localStorage.getItem('auction_landmarks') ||
      localStorage.getItem('landmarks') ||
      localStorage.getItem('auction_landmark_items')

    setLandmarks(
      normalizeLandmarks(
        savedLandmarks
          ? safeJsonParse<unknown>(savedLandmarks, [])
          : Array.isArray(snapshot.landmarks)
          ? snapshot.landmarks
          : []
      )
    )

    const savedAuctionState = localStorage.getItem('auction_state')
    setAuctionState(safeJsonParse<LocalAuctionState>(savedAuctionState, DEFAULT_AUCTION_STATE))

    const savedLandmarkState = localStorage.getItem('landmark_auction_state')
    setLandmarkAuctionState(
      safeJsonParse<LandmarkAuctionState>(savedLandmarkState, DEFAULT_LANDMARK_AUCTION_STATE)
    )

    const savedLogs = localStorage.getItem('auction_logs')
    setLogs(safeJsonParse<LocalAuctionLog[]>(savedLogs, []))

    const savedLandmarkLogs = localStorage.getItem('landmark_auction_logs')
    setLandmarkLogs(safeJsonParse<LocalAuctionLog[]>(savedLandmarkLogs, []))
  }

  useEffect(() => {
    loadLocalData()

    const handleStorageChange = () => loadLocalData()
    window.addEventListener('storage', handleStorageChange)

    const interval = setInterval(loadLocalData, 500)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(interval)
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const activeLogs = auctionMode === 'landmark' ? landmarkLogs : logs
    const latest = activeLogs[0]

    // 페이지 전환/모드 전환 시 남아있는 마지막 낙찰/유찰 로그로 팝업이 다시 뜨는 문제 방지
    if (lastPopupModeRef.current !== auctionMode) {
      lastPopupModeRef.current = auctionMode
      lastPopupLogIdRef.current = latest?.id || null
      popupReadyRef.current = true

      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current)
      }

      setPopup(null)
      return
    }

    // 최초 로딩 시에도 기존 로그로 팝업이 뜨지 않게 막기
    if (!popupReadyRef.current) {
      popupReadyRef.current = true
      lastPopupLogIdRef.current = latest?.id || null
      setPopup(null)
      return
    }

    if (!latest) return
    if (lastPopupLogIdRef.current === latest.id) return
    if (latest.action !== 'sold' && latest.action !== 'passed') {
      lastPopupLogIdRef.current = latest.id
      return
    }

    lastPopupLogIdRef.current = latest.id

    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current)
    }

    if (latest.action === 'sold') {
      const clean = latest.message.replace('[', '').replace(']', '')
      const parts = clean.split('-')
      const itemName = parts[0]?.trim() || ''
      const teamText = parts[1]?.trim() || ''
      const amount = teamText.match(/(\d+포인트)/)?.[1] || ''
      const teamName = teamText.replace(/\d+포인트/g, '').replace('낙찰', '').trim()

      setPopup({
        type: 'sold',
        playerName: itemName,
        teamName,
        amount,
      })

      playPopupSound('sold')
      popupTimerRef.current = setTimeout(() => setPopup(null), 2800)
    }

    if (latest.action === 'passed') {
      const playerName = latest.message.replace('[', '').replace(']', '').replace('- 유찰', '').trim()

      setPopup({
        type: 'passed',
        playerName,
      })

      playPopupSound('passed')
      popupTimerRef.current = setTimeout(() => setPopup(null), 2400)
    }
  }, [logs, landmarkLogs, auctionMode])

  const safeTeams = Array.isArray(teams) ? teams : []
  const safePlayers = Array.isArray(players) ? players : []
  const safeLandmarks = Array.isArray(landmarks) ? landmarks : []

  const auctionPlayers = safePlayers.filter((player) => !player.is_captain)
  const currentPlayer = auctionPlayers.find((player) => player.id === auctionState.current_player_id)
  const currentBidderTeam = safeTeams.find((team) => team.id === auctionState.current_bidder_team_id)

  const availablePlayers = auctionPlayers.filter((player) => !player.team_id && !player.is_passed)
  const queuePlayers = auctionPlayers
  const passedPlayers = auctionPlayers.filter((player) => player.is_passed)
  const soldPlayers = auctionPlayers.filter((player) => player.team_id)
  const totalPlayers = auctionPlayers.length
  const assignedCount = soldPlayers.length

  const nextPlayer = (() => {
    const currentIndex = currentPlayer
      ? availablePlayers.findIndex((player) => player.id === currentPlayer.id)
      : -1

    return availablePlayers[currentIndex + 1]
  })()

  const currentLandmark = safeLandmarks.find((landmark) => landmark.id === landmarkAuctionState.current_landmark_id)
  const currentLandmarkBidderTeam = safeTeams.find((team) => team.id === landmarkAuctionState.current_bidder_team_id)
  const availableLandmarks = safeLandmarks.filter((landmark) => !landmark.team_id && !landmark.is_passed)
  const nextLandmark = (() => {
    const currentIndex = currentLandmark
      ? availableLandmarks.findIndex((landmark) => landmark.id === currentLandmark.id)
      : -1

    return availableLandmarks[currentIndex + 1]
  })()

  const leftTeams = safeTeams.slice(0, 8)
  const rightTeams = safeTeams.slice(8, 16)

  if (auctionMode === 'results') {
    return (
      <>
        <ResultsOverlay
          settings={settings}
          teams={safeTeams}
          players={safePlayers}
          landmarks={safeLandmarks}

        />
        <AuctionPopup popup={popup} />
      </>
    )
  }

  if (auctionMode === 'landmark') {
    return (
      <OverlayShell settings={settings} teams={safeTeams} footerText="랜드마크 경매 진행중">
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_600px] gap-3 p-3 overflow-hidden">
          <main className="min-w-0 h-full flex flex-col gap-3 overflow-hidden">
            <section className="h-[238px] shrink-0 bg-[#101010] border border-[#333] rounded-lg px-7 py-4 overflow-hidden shadow-[inset_0_0_50px_rgba(255,255,255,0.025)]">
              <div className="w-full h-full flex items-center justify-center">
                <div className="flex items-center justify-center gap-8 max-w-[1180px] w-full">
                  <div className="w-[170px] h-[190px] bg-[#181818] border border-[#444] rounded-md overflow-hidden shrink-0">
                    {getLandmarkImage(currentLandmark) ? (
                      <img
                        src={getLandmarkImage(currentLandmark)!}
                        alt={currentLandmark?.name || '랜드마크'}
                        className="w-full h-full object-cover"
                      />
                    ) : currentLandmark ? (
                      <div className="w-full h-full flex items-center justify-center text-7xl font-black text-[#444]">
                        {(currentLandmark.name || '')[0]}
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#555] font-bold">
                        랜드마크 대기
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 w-[610px]">
                    <div className="flex items-start gap-5 mb-6">
                      <div className="min-w-0">
                        <p className="mb-2 truncate text-[28px] font-black leading-none text-primary">
                          {currentLandmark ? getLandmarkMapName(currentLandmark) : ''}
                        </p>
                        <h2 className="truncate text-[56px] font-black leading-none tracking-tight max-w-[380px]">
                          {currentLandmark?.name || '랜드마크 선택 대기'}
                        </h2>
                      </div>

                      <div className="w-[230px] bg-[#0b0b0b] border border-[#2b2b2b] rounded-md px-4 py-3 shrink-0">
                        <p className="text-[#888] text-[18px] font-bold mb-1">경매 구분</p>
                        <p className="text-[17px] font-black leading-snug text-white break-words line-clamp-2">
                          랜드마크 경매
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-7">
                      <InfoBlock label="현재 입찰" value={`${landmarkAuctionState.current_bid || 0}P`} white />
                      <InfoBlock
                        label="입찰 팀"
                        value={currentLandmarkBidderTeam?.name || '없음'}
                        valueClassName="text-red-400 text-[30px]"
                      />
                      <InfoBlock
                        label="남은 랜드마크"
                        value={`${availableLandmarks.length}개`}
                        valueClassName="text-white text-[34px]"
                      />
                    </div>
                  </div>

                  <div className="w-[250px] border-l border-[#333] pl-7 flex items-center justify-center gap-6 shrink-0">
                    <div className="text-center">
                      <p className="text-[#888] text-[18px] font-bold mb-1">남은 시간</p>
                      <p
                        className={`text-[76px] font-black leading-none ${
                          landmarkAuctionState.timer_remaining <= 5
                            ? 'text-red-500 animate-pulse'
                            : 'text-white'
                        }`}
                      >
                        {landmarkAuctionState.timer_remaining || 0}
                      </p>
                      <p className="text-[#888] text-lg mt-1">초</p>
                      <span
                        className={`inline-block mt-2 px-4 py-1.5 rounded text-sm font-black ${
                          landmarkAuctionState.status === 'running'
                            ? 'bg-green-500/20 text-green-400'
                            : landmarkAuctionState.status === 'paused'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-[#333] text-[#888]'
                        }`}
                      >
                        {landmarkAuctionState.status === 'running'
                          ? '진행중'
                          : landmarkAuctionState.status === 'paused'
                          ? '정지'
                          : '대기'}
                      </span>
                    </div>

                    {nextLandmark && (
                      <div className="w-[78px] text-center">
                        <p className="text-[#888] text-[15px] font-bold mb-2">다음 랜마</p>
                        <div className="w-[58px] h-[58px] mx-auto rounded overflow-hidden bg-[#1a1a1a] border border-[#333]">
                          {getLandmarkImage(nextLandmark) ? (
                            <img
                              src={getLandmarkImage(nextLandmark)!}
                              alt={nextLandmark.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-[#777]">
                              {(nextLandmark.name || '')[0]}
                            </div>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] font-black truncate text-primary">
                          {getLandmarkMapName(nextLandmark)}
                        </p>
                        <p className="text-[13px] font-black truncate">{nextLandmark.name}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="h-[82px] shrink-0 bg-[#101010] border border-[#333] rounded-lg px-8 py-3 flex items-center justify-center overflow-hidden">
              <p className="text-[24px] font-black text-center leading-[1.35] whitespace-pre-wrap break-words overflow-hidden max-w-[1240px]">
                랜드마크 경매 진행중
              </p>
            </section>

            <div className="flex-1 min-h-0 grid grid-cols-[0.68fr_1.32fr] gap-3 overflow-hidden">
              <section className="min-h-0 flex flex-col gap-3 overflow-hidden">
                <div className="h-[200px] shrink-0 bg-[#0c0c0c] border border-[#333] rounded-lg p-4 overflow-hidden">
                  <h3 className="text-white text-[20px] font-black mb-3">경매 로그</h3>
                  <div className="space-y-1.5 text-[16px] overflow-hidden pr-2">
                    {landmarkLogs.filter((log) => ['bid', 'sold', 'passed'].includes(log.action)).length > 0 ? (
                      landmarkLogs
                        .filter((log) => ['bid', 'sold', 'passed'].includes(log.action))
                        .slice(0, 8)
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
                    ) : null}
                  </div>
                </div>

                <div className="flex-1 min-h-0 bg-[#0c0c0c] border border-[#333] rounded-lg p-4 overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white text-[22px] font-black">유찰 랜드마크</h3>
                    <span className="text-[16px] text-white font-bold">
                      {safeLandmarks.filter((landmark) => landmark.is_passed).length}개
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-2 overflow-hidden content-start">
                    {safeLandmarks
                      .filter((landmark) => landmark.is_passed)
                      .map((landmark) => (
                        <LandmarkMiniCard
                          key={landmark.id}
                          landmark={landmark}
                          isCurrent={landmark.id === currentLandmark?.id}
                          isPassed
                          isSold={false}
                        />
                      ))}
                  </div>
                </div>
              </section>

              <section className="min-h-0 flex flex-col gap-3 overflow-hidden">
                <div className="flex-1 min-h-0 bg-[#0c0c0c] border border-[#333] rounded-lg p-4 overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white text-[22px] font-black">랜드마크 순서</h3>
                    <span className="text-[17px] text-white font-bold">
                      {safeLandmarks.filter((landmark) => landmark.team_id).length + 1} / {safeLandmarks.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-8 gap-2.5 overflow-hidden content-start">
                    {safeLandmarks.map((landmark) => (
                      <LandmarkMiniCard
                        key={landmark.id}
                        landmark={landmark}
                        isCurrent={landmark.id === currentLandmark?.id}
                        isPassed={Boolean(landmark.is_passed)}
                        isSold={Boolean(landmark.team_id)}
                      />
                    ))}
                  </div>
                </div>

                <SponsorBox title="SPONSOR" />
              </section>
            </div>
          </main>

          <aside className="h-full min-h-0 grid grid-cols-2 gap-2 overflow-hidden">
            <div className="grid grid-rows-8 gap-2 min-h-0 overflow-hidden">
              {leftTeams.map((team) => (
                <LandmarkTeamCard
                  key={team.id}
                  team={team}
                  landmarks={safeLandmarks.filter((landmark) => team.landmarks?.includes(landmark.id))}
                  isCurrentBidder={team.id === landmarkAuctionState.current_bidder_team_id}
                />
              ))}
            </div>

            <div className="grid grid-rows-8 gap-2 min-h-0 overflow-hidden">
              {rightTeams.map((team) => (
                <LandmarkTeamCard
                  key={team.id}
                  team={team}
                  landmarks={safeLandmarks.filter((landmark) => team.landmarks?.includes(landmark.id))}
                  isCurrentBidder={team.id === landmarkAuctionState.current_bidder_team_id}
                />
              ))}
            </div>
          </aside>
        </div>

        <AuctionPopup popup={popup} />
      </OverlayShell>
    )
  }

  return (
    <OverlayShell settings={settings} teams={safeTeams} footerText="플레이어 경매 진행중">
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_600px] gap-3 p-3 overflow-hidden">
        <main className="min-w-0 h-full flex flex-col gap-3 overflow-hidden">
          <section className="h-[238px] shrink-0 bg-[#101010] border border-[#333] rounded-lg px-7 py-4 overflow-hidden shadow-[inset_0_0_50px_rgba(255,255,255,0.025)]">
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex items-center justify-center gap-8 max-w-[1180px] w-full">
                <div className="w-[170px] h-[190px] bg-[#181818] border border-[#444] rounded-md overflow-hidden shrink-0">
                  {currentPlayer?.image_url ? (
                    <img
                      src={currentPlayer.image_url}
                      alt={currentPlayer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : currentPlayer ? (
                    <div className="w-full h-full flex items-center justify-center text-7xl font-black text-[#444]">
                      {currentPlayer.name[0]}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#555] font-bold">
                      대기중
                    </div>
                  )}
                </div>

                <div className="min-w-0 w-[610px]">
                  <div className="flex items-start gap-5 mb-6">
                    <h2 className="text-[56px] font-black leading-none tracking-tight truncate max-w-[350px]">
                      {currentPlayer?.name || '선수 선택 대기'}
                    </h2>

                    <div className="w-[230px] bg-[#0b0b0b] border border-[#2b2b2b] rounded-md px-4 py-3 shrink-0">
                      <p className="text-[#888] text-[18px] font-bold mb-1">연습 가능 시간</p>
                      <p className="text-[17px] font-black leading-snug text-white break-words line-clamp-2">
                        {currentPlayer?.available_days?.trim() || '미등록'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-7">
                    <InfoBlock
                      label="티어"
                      value={currentPlayer?.tier || '-'}
                      valueClassName={`text-[32px] font-black tracking-widest ${getTierColorClass(currentPlayer?.tier)} ${getTierGlowClass(currentPlayer?.tier)}`}
                    />
                    <InfoBlock label="치지직 티어" value={currentPlayer?.detail_tier || '-'} />
                    <InfoBlock label="현재 입찰" value={`${auctionState.current_bid || 0}P`} white />
                    <InfoBlock
                      label="입찰 팀"
                      value={currentBidderTeam?.name || '없음'}
                      valueClassName="text-red-400 text-[30px]"
                    />
                  </div>
                </div>

                <div className="w-[250px] border-l border-[#333] pl-7 flex items-center justify-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-[#888] text-[18px] font-bold mb-1">남은 시간</p>
                    <p
                      className={`text-[76px] font-black leading-none ${
                        auctionState.timer_remaining <= 5
                          ? 'text-red-500 animate-pulse'
                          : 'text-white'
                      }`}
                    >
                      {auctionState.timer_remaining || 0}
                    </p>
                    <p className="text-[#888] text-lg mt-1">초</p>
                    <span
                      className={`inline-block mt-2 px-4 py-1.5 rounded text-sm font-black ${
                        auctionState.status === 'running'
                          ? 'bg-green-500/20 text-green-400'
                          : auctionState.status === 'paused'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-[#333] text-[#888]'
                      }`}
                    >
                      {auctionState.status === 'running'
                        ? '진행중'
                        : auctionState.status === 'paused'
                        ? '정지'
                        : '대기'}
                    </span>
                  </div>

                  {nextPlayer && (
                    <div className="w-[78px] text-center">
                      <p className="text-[#888] text-[15px] font-bold mb-2">다음 선수</p>
                      <div className="w-[58px] h-[58px] mx-auto rounded overflow-hidden bg-[#1a1a1a] border border-[#333]">
                        {nextPlayer.image_url ? (
                          <img
                            src={nextPlayer.image_url}
                            alt={nextPlayer.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[#777]">
                            {nextPlayer.name[0]}
                          </div>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] font-black truncate">{nextPlayer.name}</p>
                      <p className={`text-[11px] font-black truncate ${getTierColorClass(nextPlayer.tier)}`}>
                        {nextPlayer.tier}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="h-[82px] shrink-0 bg-[#101010] border border-[#333] rounded-lg px-8 py-3 flex items-center justify-center overflow-hidden">
            <p className="text-[24px] font-black text-center leading-[1.35] whitespace-pre-wrap break-words overflow-hidden max-w-[1240px]">
              {(currentPlayer?.bio?.trim() || '플레이어 등록 시 작성하는 자기소개 내용이 보이는 곳').slice(0, 500)}
            </p>
          </section>

          <div className="flex-1 min-h-0 grid grid-cols-[0.68fr_1.32fr] gap-3 overflow-hidden">
            <section className="min-h-0 flex flex-col gap-3 overflow-hidden">
              <div className="h-[200px] shrink-0 bg-[#0c0c0c] border border-[#333] rounded-lg p-4 overflow-hidden">
                <h3 className="text-white text-[20px] font-black mb-3">경매 로그</h3>
                <div className="space-y-1.5 text-[16px] overflow-hidden pr-2">
                  {logs.filter((log) => ['bid', 'sold', 'passed'].includes(log.action)).length > 0 ? (
                    logs
                      .filter((log) => ['bid', 'sold', 'passed'].includes(log.action))
                      .slice(0, 7)
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
                  ) : null}
                </div>
              </div>


              <div className="flex-1 min-h-0 bg-[#0c0c0c] border border-[#333] rounded-lg p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white text-[22px] font-black">유찰 순서</h3>
                  <span className="text-[16px] text-white font-bold">
                    {passedPlayers.length}명
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 overflow-hidden content-start">
                  {passedPlayers.map((player) => (
                    <PlayerMiniCard
                      key={player.id}
                      player={player}
                      isCurrent={player.id === currentPlayer?.id}
                      isPassed
                      isSold={false}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="min-h-0 flex flex-col gap-3 overflow-hidden">
              <div className="flex-1 min-h-0 bg-[#0c0c0c] border border-[#333] rounded-lg p-4 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white text-[22px] font-black">입찰 순서</h3>
                  <span className="text-[17px] text-white font-bold">
                    {Math.min(assignedCount + passedPlayers.length + 1, totalPlayers)} / {totalPlayers}
                  </span>
                </div>

                <div className="grid grid-cols-10 gap-2.5 overflow-hidden content-start">
                  {queuePlayers.map((player) => (
                    <PlayerMiniCard
                      key={player.id}
                      player={player}
                      isCurrent={player.id === currentPlayer?.id}
                      isPassed={player.is_passed}
                      isSold={Boolean(player.team_id)}
                    />
                  ))}
                </div>
              </div>

              <SponsorBox title="SPONSOR" />
            </section>
          </div>
        </main>

        <aside className="h-full min-h-0 grid grid-cols-2 gap-2 overflow-hidden">
          <div className="grid grid-rows-8 gap-2 min-h-0 overflow-hidden">
            {leftTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                players={safePlayers.filter((player) => player.team_id === team.id)}
                landmarks={safeLandmarks.filter((landmark) => team.landmarks?.includes(landmark.id))}
                isCurrentBidder={team.id === auctionState.current_bidder_team_id}
              />
            ))}
          </div>

          <div className="grid grid-rows-8 gap-2 min-h-0 overflow-hidden">
            {rightTeams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                players={safePlayers.filter((player) => player.team_id === team.id)}
                landmarks={safeLandmarks.filter((landmark) => team.landmarks?.includes(landmark.id))}
                isCurrentBidder={team.id === auctionState.current_bidder_team_id}
              />
            ))}
          </div>
        </aside>
      </div>

      <AuctionPopup popup={popup} />
    </OverlayShell>
  )
}




function ResultsOverlay({
  settings,
  teams,
  players,
  landmarks,
}: {
  settings: LocalSettings
  teams: LocalTeam[]
  players: LocalPlayer[]
  landmarks: LocalLandmark[]
}) {
  const [page, setPage] = useState(1)

  const sortedTeams = [...teams].sort((a, b) => getTeamNumber(a.id) - getTeamNumber(b.id))
  const teamsPerPage = 8
  const maxPage = Math.max(1, Math.ceil(sortedTeams.length / teamsPerPage))
  const pageTeams = sortedTeams.slice((page - 1) * teamsPerPage, page * teamsPerPage)
  const pageStartNumber = (page - 1) * teamsPerPage + 1

  useEffect(() => {
    const readResultPage = () => {
      const savedPage = Number(
        localStorage.getItem('overlay_page') || '1'
      )

      const nextPage = Number.isFinite(savedPage)
        ? Math.min(Math.max(1, savedPage), maxPage)
        : 1

      setPage(nextPage)
    }

    readResultPage()

    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === 'overlay_page' ||
        event.key === 'auction_mode'
      ) {
        readResultPage()
      }
    }

    window.addEventListener('storage', handleStorageChange)

    // 같은 브라우저/탭에서 버튼을 눌러도 OBS 화면이 바로 따라오게 하는 확인용입니다.
    // 자동으로 페이지를 넘기지는 않고, 관리자 버튼이 저장한 페이지 번호만 읽습니다.
    const syncInterval = setInterval(readResultPage, 300)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      clearInterval(syncInterval)
    }
  }, [maxPage])

  const getTeamLandmarks = (team: LocalTeam) =>
    landmarks.filter(
      (landmark) =>
        landmark.team_id === team.id ||
        landmark.teamId === team.id ||
        team.landmarks?.includes(landmark.id)
    )

  const ResultPlayerCard = ({
    player,
  }: {
    player?: LocalPlayer
  }) => {
    const imageUrl = getPlayerImageUrl(player)

    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-md border bg-[#141414] ${
          player
            ? getRawIsCaptain(player)
              ? 'border-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.55)]'
              : getTierBorderClass(player.tier)
            : 'border-[#333]'
        }`}
        style={{ width: 180, height: 180 }}
      >
        {player && imageUrl ? (
          <img
            src={imageUrl}
            alt={player.name}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : player ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1b1b1b] text-[34px] font-black text-[#555]">
            {(player.name || '?')[0]}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#151515] text-[12px] font-black text-[#777]">
            미선택
          </div>
        )}

        {player && getRawIsCaptain(player) && (
          <div className="absolute left-1 top-1 z-20 rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
            팀장
          </div>
        )}

        {player && (
          <>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/90" />
            <div className="absolute inset-x-0 bottom-0 z-20 bg-black/72 px-1 py-1 text-center">
              <p
                className="truncate text-[30px] font-black leading-none text-white"
                style={{
                  textShadow:
                    '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000',
                }}
              >
                {player.name}
              </p>

              <p className={`mt-0.5 text-[20px] font-black leading-none ${getTierColorClass(player.tier)}`}>
                {getRawIsCaptain(player) ? '팀장' : player.tier}
              </p>
            </div>
          </>
        )}
      </div>
    )
  }

  const TeamOnlyCard = ({
    team,
    teamNumber,
  }: {
    team: LocalTeam
    teamNumber: number
  }) => {
    const teamPlayers = getResultTeamPlayers(team, players).slice(0, 4)
    const teamLandmarks = getTeamLandmarks(team)

    return (
      <article className="relative min-h-0 overflow-hidden rounded-lg border border-[#333] bg-[#101010]/95 p-3 shadow-[inset_0_0_24px_rgba(255,255,255,0.025)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.13),transparent_38%)]" />

        <div className="relative z-10 flex h-full flex-col">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="shrink-0 text-[30px] font-black leading-none">
                {teamNumber}팀
              </h3>

              
            </div>

            <span className="rounded bg-primary px-3 py-1.5 text-[15px] font-black leading-none text-white">
              {team.points ?? 0}P
            </span>
          </div>

          <div className="mb-2 flex min-h-0 flex-1 items-center justify-center gap-2 overflow-hidden">
            {[0, 1, 2, 3].map((slotIndex) => (
              <ResultPlayerCard
                key={teamPlayers[slotIndex]?.id || `result-empty-${team.id}-${slotIndex}`}
                player={teamPlayers[slotIndex]}
              />
            ))}
          </div>

          <div className="h-[32px] shrink-0 overflow-hidden rounded border border-[#2d2d2d] bg-black/45 px-2 py-1.5">
            <p className="truncate text-[20px] font-black">
              <span className="">[랜드마크]</span>{' '}
              {teamLandmarks.length > 0
              ? teamLandmarks
                .map((l: any) => `${getLandmarkMapName(l)} - ${l.name}`)
                .join(', ')
            : '-'}
            </p>
          </div>
        </div>
      </article>
    )
  }

  const BannerCard = () => (
    <section className="relative min-h-0 overflow-hidden rounded-xl border border-red-500/35 bg-black/80 shadow-[0_0_35px_rgba(239,68,68,0.18)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.26),transparent_54%),linear-gradient(135deg,rgba(255,255,255,0.07),transparent_35%,rgba(239,68,68,0.14))]" />
      <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-r from-red-900 via-red-500 to-red-900" />

      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
        <p className="text-[30px] font-black italic leading-none">
          <span className="text-white"></span>{' '}
          <span className="text-primary"></span>
        </p>
        <p
          className="mt-3 text-[34px] font-black leading-none text-white"
          style={{
            textShadow:
              '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000, 0 0 20px rgba(239,68,68,0.55)',
          }}
        >
          결과표
        </p>
        <p className="mt-3 text-[13px] font-black tracking-[0.5em] text-[#aaa]">
          
        </p>
        <p className="mt-2 text-[12px] font-bold text-[#777]">
          페이지 {page} / {maxPage}
        </p>
      </div>
    </section>
  )

  const orderedItems = [
    pageTeams[0],
    pageTeams[1],
    pageTeams[2],
    pageTeams[3],
    pageTeams[4],
    pageTeams[5],
    pageTeams[6],
    pageTeams[7],
  ]

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#020204] p-3 text-white">
      <style jsx global>{`
        .result-only-bg {
          background:
            radial-gradient(circle at top center, rgba(239, 68, 68, 0.16), transparent 28%),
            radial-gradient(circle at bottom right, rgba(239, 68, 68, 0.14), transparent 30%),
            linear-gradient(135deg, #050505 0%, #08080c 48%, #120305 100%);
        }
      `}</style>

      <div className="result-only-bg absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:42px_42px]" />

      <div className="relative z-10 grid h-full grid-cols-3 grid-rows-3 gap-3">
        {orderedItems[0] ? (
          <TeamOnlyCard team={orderedItems[0]} teamNumber={pageStartNumber} />
        ) : (
          <div />
        )}

        {orderedItems[1] ? (
          <TeamOnlyCard team={orderedItems[1]} teamNumber={pageStartNumber + 1} />
        ) : (
          <div />
        )}

        {orderedItems[2] ? (
          <TeamOnlyCard team={orderedItems[2]} teamNumber={pageStartNumber + 2} />
        ) : (
          <div />
        )}

        {orderedItems[3] ? (
          <TeamOnlyCard team={orderedItems[3]} teamNumber={pageStartNumber + 3} />
        ) : (
          <div />
        )}

        <BannerCard />

        {orderedItems[4] ? (
          <TeamOnlyCard team={orderedItems[4]} teamNumber={pageStartNumber + 4} />
        ) : (
          <div />
        )}

        {orderedItems[5] ? (
          <TeamOnlyCard team={orderedItems[5]} teamNumber={pageStartNumber + 5} />
        ) : (
          <div />
        )}

        {orderedItems[6] ? (
          <TeamOnlyCard team={orderedItems[6]} teamNumber={pageStartNumber + 6} />
        ) : (
          <div />
        )}

        {orderedItems[7] ? (
          <TeamOnlyCard team={orderedItems[7]} teamNumber={pageStartNumber + 7} />
        ) : (
          <div />
        )}

        {pageTeams.length === 0 && (
          <div className="col-span-3 row-span-3 flex items-center justify-center text-4xl font-black text-[#777]">
            표시할 팀이 없습니다.
          </div>
        )}
      </div>
    </main>
  )
}



function LandmarkMiniCard({
  landmark,
  isCurrent,
  isPassed,
  isSold,
}: {
  landmark: LocalLandmark
  isCurrent: boolean
  isPassed: boolean
  isSold: boolean
}) {
  return (
    <div
      className={`
        relative aspect-square min-h-[76px] overflow-hidden rounded-md border bg-[#111]
        ${
          isCurrent
            ? 'border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.65)]'
            : isPassed
            ? 'border-red-500/70'
            : isSold
            ? 'border-green-500/60'
            : 'border-[#333]'
        }
        ${isPassed ? 'opacity-80' : ''}
      `}
    >
      {getLandmarkImage(landmark) ? (
        <img
          src={getLandmarkImage(landmark)!}
          alt={landmark.name}
          className="absolute inset-0 h-full w-full object-cover opacity-65"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#181818] text-[26px] font-black text-[#777]">
          {(landmark.name || '?')[0]}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-black/90" />

      <div className="absolute left-1 top-1 z-10 flex items-center gap-1">
        {isPassed && (
          <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
            유찰
          </span>
        )}

        {isSold && !isPassed && (
          <span className="rounded bg-green-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
            낙찰
          </span>
        )}

        {isCurrent && (
          <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
            현재
          </span>
        )}
      </div>

      <div className="absolute inset-x-1 bottom-1 z-10 rounded bg-black/70 px-1 py-1">
        <p className="w-full truncate text-center text-[10px] font-black leading-tight text-primary">
          {getLandmarkMapName(landmark)}
        </p>
        <p className="mt-0.5 w-full truncate text-center text-[13px] font-black leading-tight text-white">
          {landmark.name}
        </p>
      </div>
    </div>
  )
}


function SponsorBox({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div
      className={`shrink-0 rounded-lg border border-[#333] bg-[#0c0c0c] px-4 ${
        compact ? 'h-[60px]' : 'h-[90px]'
      } flex items-center justify-center overflow-hidden`}
    >
      <div className="flex h-full w-full items-center justify-center gap-10 text-[#d7d7d7] opacity-80">
        <span className="text-[15px] font-black text-[#888]">{title}</span>
        <span className="text-[22px] font-black tracking-wide">SPONSOR</span>
        <span className="text-[22px] font-black tracking-wide">SPONSOR</span>
        <span className="text-[22px] font-black tracking-wide">SPONSOR</span>
      </div>
    </div>
  )
}

function PlayerMiniCard({
  player,
  isCurrent,
  isPassed,
  isSold,
}: {
  player: LocalPlayer
  isCurrent: boolean
  isPassed: boolean
  isSold: boolean
}) {
  return (
    <div
      className={`
        relative aspect-square min-h-[76px] overflow-hidden rounded-md border bg-[#111]
        ${
          isCurrent
            ? `${getTierBorderClass(player.tier)} ring-2 ring-red-500 shadow-[0_0_14px_rgba(239,68,68,0.65)]`
            : isPassed
            ? 'border-red-500/70'
            : isSold
            ? 'border-green-500/60'
            : 'border-[#333]'
        }
        ${isPassed ? 'opacity-80' : ''}
      `}
    >
      {player.image_url ? (
        <img
          src={player.image_url}
          alt={player.name}
          className="absolute inset-0 h-full w-full object-cover opacity-75"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[#181818] text-[26px] font-black text-[#777]">
          {(player.name || '?')[0]}
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/15 to-black/85" />

      <div className="absolute left-1 top-1 z-10 flex items-center gap-1">
        {isPassed && (
          <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-white">
            유찰
          </span>
        )}

        {isSold && !isPassed && (
          <span className="rounded bg-green-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
            낙찰
          </span>
        )}

        {isCurrent && (
          <span className="rounded bg-yellow-400 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
            현재
          </span>
        )}
      </div>

      <div className="absolute inset-x-1 bottom-1 z-10 rounded bg-black/70 px-1 py-1">
        <p className="w-full truncate text-center text-[13px] font-black leading-tight text-white">
          {player.name}
        </p>
        <p className={`mt-0.5 text-center text-[12px] font-black leading-none ${getTierColorClass(player.tier)}`}>
          {player.tier}
        </p>
      </div>
    </div>
  )
}

function OverlayShell({
  settings,
  teams,
  footerText,
  children,
}: {
  settings: LocalSettings
  teams: LocalTeam[]
  footerText: string
  children: React.ReactNode
}) {
  return (
    <div className="w-screen h-screen bg-[#050505] text-white overflow-hidden">
      <style jsx global>{`
        @keyframes auctionPopupIn {
          0% {
            opacity: 0;
            transform: scale(0.82);
            filter: blur(6px);
          }
          55% {
            opacity: 1;
            transform: scale(1.06);
            filter: blur(0);
          }
          100% {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }

        @keyframes auctionGlow {
          0%,
          100% {
            box-shadow: 0 0 34px rgba(250, 204, 21, 0.35),
              inset 0 0 28px rgba(255, 255, 255, 0.035);
          }
          50% {
            box-shadow: 0 0 62px rgba(250, 204, 21, 0.7),
              inset 0 0 36px rgba(255, 255, 255, 0.06);
          }
        }

        @keyframes auctionGlowRed {
          0%,
          100% {
            box-shadow: 0 0 34px rgba(239, 68, 68, 0.35),
              inset 0 0 28px rgba(255, 255, 255, 0.035);
          }
          50% {
            box-shadow: 0 0 62px rgba(239, 68, 68, 0.7),
              inset 0 0 36px rgba(255, 255, 255, 0.06);
          }
        }

        .auction-popup-in {
          animation: auctionPopupIn 0.28s ease-out both;
        }

        .auction-popup-glow-sold {
          animation: auctionPopupIn 0.28s ease-out both, auctionGlow 1.05s ease-in-out infinite;
        }

        .auction-popup-glow-passed {
          animation: auctionPopupIn 0.28s ease-out both, auctionGlowRed 1.05s ease-in-out infinite;
        }

        @keyframes tierGlowA {
          0%, 100% {
            filter: drop-shadow(0 0 6px rgba(239, 68, 68, 0.45));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 18px rgba(239, 68, 68, 0.95));
            transform: scale(1.08);
          }
        }

        @keyframes tierGlowB {
          0%, 100% {
            filter: drop-shadow(0 0 6px rgba(96, 165, 250, 0.45));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 18px rgba(96, 165, 250, 0.95));
            transform: scale(1.08);
          }
        }

        @keyframes tierGlowC {
          0%, 100% {
            filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.45));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 18px rgba(250, 204, 21, 0.95));
            transform: scale(1.08);
          }
        }

        @keyframes tierGlowD {
          0%, 100% {
            filter: drop-shadow(0 0 5px rgba(156, 163, 175, 0.35));
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 14px rgba(156, 163, 175, 0.8));
            transform: scale(1.06);
          }
        }

        .tier-glow {
          display: inline-block;
          transform-origin: center;
          will-change: transform, filter;
        }

        .tier-glow-a {
          animation: tierGlowA 1.45s ease-in-out infinite;
        }

        .tier-glow-b {
          animation: tierGlowB 1.45s ease-in-out infinite;
        }

        .tier-glow-c {
          animation: tierGlowC 1.45s ease-in-out infinite;
        }

        .tier-glow-d {
          animation: tierGlowD 1.45s ease-in-out infinite;
        }
      `}</style>

      <div className="w-full h-full bg-[#070707] border border-[#242424] flex flex-col overflow-hidden">
        <header className="h-[42px] shrink-0 border-b border-[#242424] px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.95)]" />
            <h1 className="text-[20px] font-black tracking-tight">
              {settings.name || '경매 시스템'}
            </h1>
          </div>

          <div className="text-[17px] font-black">
            <span className="text-red-500">{teams.length}</span> 팀
          </div>
        </header>

        {children}

        <footer className="h-[28px] shrink-0 border-t border-[#262626] px-5 flex items-center justify-between text-[12px] text-[#999]">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full border border-[#444] flex items-center justify-center text-white font-black">
              N
            </span>
            <span className="font-bold">{settings.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>LIVE&nbsp;&nbsp;{footerText}</span>
          </div>

          <span>치지직 김선남 많관부</span>
        </footer>
      </div>
    </div>
  )
}

function AuctionPopup({ popup }: { popup: PopupState | null }) {
  if (!popup) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        className={`auction-popup-in min-w-[580px] rounded-2xl border bg-black/90 px-14 py-9 text-center backdrop-blur-sm ${
          popup.type === 'sold'
            ? 'auction-popup-glow-sold border-yellow-300'
            : 'auction-popup-glow-passed border-red-500'
        }`}
      >
        <div className="text-[68px] leading-none font-black text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.8)]">
          {popup.playerName}
        </div>

        <div
          className={`mt-5 text-[82px] leading-none font-black ${
            popup.type === 'sold'
              ? 'text-yellow-300 drop-shadow-[0_0_18px_rgba(250,204,21,0.8)]'
              : 'text-red-500 drop-shadow-[0_0_18px_rgba(239,68,68,0.8)]'
          }`}
        >
          {popup.type === 'sold' ? '낙찰!' : '유찰'}
        </div>

        {popup.type === 'sold' && (
          <div className="mt-5 text-[42px] leading-none font-black text-white">
            {popup.teamName || '입찰 팀'}
            {popup.amount ? (
              <span className="ml-4 text-yellow-300">{popup.amount}</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function InfoBlock({
  label,
  value,
  white = false,
  valueClassName,
}: {
  label: string
  value: string
  white?: boolean
  valueClassName?: string
}) {
  return (
    <div className="min-w-0 overflow-visible">
      <span className="block text-[#aaa] text-lg font-semibold truncate">
        {label}
      </span>

      <p
        title={value}
        className={`font-black mt-3 whitespace-nowrap ${
          valueClassName || `text-4xl ${white ? 'text-white' : 'text-red-400'}`
        }`}
      >
        {value}
      </p>
    </div>
  )
}

interface TeamCardProps {
  team: LocalTeam
  players: LocalPlayer[]
  landmarks: LocalLandmark[]
  isCurrentBidder: boolean
}

function TeamCard({ team, players, landmarks, isCurrentBidder }: TeamCardProps) {
  return (
    <div
      className={`bg-[#101010] border rounded-lg p-2 min-h-0 overflow-hidden ${
        isCurrentBidder
          ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.45)]'
          : 'border-[#333]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-[18px] truncate">{team.name}</span>
        <span className="text-[18px] font-bold text-white">{team.points}P</span>
      </div>

      <div className="grid grid-cols-4 gap-1">
        {TIERS.map((tier) => {
          const tierPlayer = players.find((player) => player.team_id === team.id && player.tier === tier)

          return (
            <div
              key={tier}
              className={`aspect-square rounded border overflow-hidden bg-[#0a0a0a] ${
                tierPlayer ? getTierBorderClass(tierPlayer.tier) : 'border-[#2a2a2a]'
              }`}
            >
              {tierPlayer ? (
                <div className="relative w-full h-full">

                  {tierPlayer?.is_captain && (
                    <div className="absolute left-1 top-1 z-10 rounded bg-yellow-400 px-1 text-[10px] font-black text-black">
                      팀장
                    </div>
                  )}
                  {tierPlayer.image_url ? (
                    <img
                      src={tierPlayer.image_url}
                      alt={tierPlayer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex w-full h-full items-center justify-center text-lg font-black text-white">
                      {tierPlayer.name[0]}
                    </div>
                  )}

                  <div className="absolute top-0 left-0 right-0 bg-black/80 px-1 py-0.5">
                    <p className="truncate text-center text-[11px] font-black text-white">
                      {tierPlayer.name}
                    </p>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-1 py-0.5">
                    <p className={`truncate text-center text-[11px] font-black ${getTierColorClass(tierPlayer.tier)}`}>
                      {tierPlayer.tier}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`flex w-full h-full items-center justify-center text-[18px] font-black ${getTierColorClass(tier)}`}>
                  {tier}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {landmarks.length > 0 && (
        <div className="mt-1.5 space-y-1 overflow-hidden">
          {landmarks.slice(0, 2).map((landmark) => (
            <div
              key={landmark.id}
              className="flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-black text-white"
            >
              <span className="shrink-0 text-yellow-300">랜드마크</span>
              <span className="truncate">
                {getLandmarkFullName(landmark)}
              </span>
            </div>
          ))}

          {landmarks.length > 2 && (
            <div className="truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-black text-white">
              +{landmarks.length - 2}개 더
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface LandmarkTeamCardProps {
  team: LocalTeam
  landmarks: LocalLandmark[]
  isCurrentBidder: boolean
}

function LandmarkTeamCard({ team, landmarks, isCurrentBidder }: LandmarkTeamCardProps) {
  return (
    <div
      className={`bg-[#101010] border rounded-lg p-2 min-h-0 overflow-hidden ${
        isCurrentBidder
          ? 'border-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.5)]'
          : 'border-[#333]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-[18px] truncate">{team.name}</span>
        <span className="text-[18px] font-bold text-white">{team.points}P</span>
      </div>

      <div className="min-h-[52px] rounded border border-dashed border-[#333] bg-black/25 px-2 py-1.5">
        {landmarks.length > 0 ? (
          <div className="space-y-1">
            {landmarks.slice(0, 3).map((landmark) => (
              <div key={landmark.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[16px] font-black text-white">
                  {getLandmarkFullName(landmark)}
                </span>
                <span className="shrink-0 text-[14px] font-black text-yellow-300">
                  {landmark.bid_amount || 0}P
                </span>
              </div>
            ))}

            {landmarks.length > 3 && (
              <div className="truncate text-[12px] font-black text-[#aaa]">
                +{landmarks.length - 3}개 더
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[40px] items-center justify-center text-[12px] text-[#666]">
            아직 낙찰 없음
          </div>
        )}
      </div>
    </div>
  )
}
