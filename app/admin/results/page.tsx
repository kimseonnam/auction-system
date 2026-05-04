'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ChevronLeft, ChevronRight, Monitor } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

type LocalPlayer = {
  id: string
  name: string
  tier: string
  detail_tier?: string
  available_days?: string
  bio?: string
  image_url: string | null
  imageUrl?: string | null
  image?: string | null
  profile_image?: string | null
  profileImage?: string | null
  avatar_url?: string | null
  avatarUrl?: string | null
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
  category?: string
  map?: string
  image_url?: string | null
  image?: string | null
  team_id?: string | null
  teamId?: string | null
  bid_amount?: number
  bidAmount?: number
  is_passed?: boolean
  isPassed?: boolean
}

type LocalTeam = {
  id: string
  name: string
  points: number
  landmarks?: string[]
  players?: string[]
  player_ids?: string[]
}

type AuctionSnapshot = {
  teams?: LocalTeam[]
  landmarks?: LocalLandmark[]
  players?: LocalPlayer[]
  auction_players?: LocalPlayer[]
}

const TIER_ORDER = ['A', 'B', 'C', 'D']

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

const getTierTextClass = (tier?: string) => {
  switch (tier) {
    case 'A':
      return 'text-red-500'
    case 'B':
      return 'text-blue-400'
    case 'C':
      return 'text-yellow-400'
    case 'D':
      return 'text-gray-300'
    default:
      return 'text-white'
  }
}

const getTierBorderClass = (tier?: string) => {
  switch (tier) {
    case 'A':
      return 'border-red-500'
    case 'B':
      return 'border-blue-400'
    case 'C':
      return 'border-yellow-400'
    case 'D':
      return 'border-gray-400'
    default:
      return 'border-[#333]'
  }
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

const normalizePlayer = (player: LocalPlayer): LocalPlayer => ({
  ...player,
  team_id: player.team_id || player.teamId || null,
  image_url: getPlayerImageUrl(player),
  bid_amount: Number(player.bid_amount ?? player.bidAmount ?? 0),
  is_passed: Boolean(player.is_passed ?? player.isPassed),
  is_captain: Boolean(player.is_captain ?? player.isCaptain),
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
      landmark?.displayName ||
      `랜드마크 ${index + 1}`

    return {
      ...landmark,
      id: typeof landmark?.id === 'string' ? landmark.id : `landmark-${index + 1}`,
      name: String(name),
      category: String(category),
      map: String(category),
      image_url: landmark?.image_url || landmark?.image || landmark?.imageUrl || null,
      image: landmark?.image || landmark?.image_url || landmark?.imageUrl || null,
      team_id: landmark?.team_id || landmark?.teamId || null,
      bid_amount: Number.isFinite(Number(landmark?.bid_amount ?? landmark?.bidAmount))
        ? Number(landmark?.bid_amount ?? landmark?.bidAmount)
        : 0,
      is_passed: Boolean(landmark?.is_passed ?? landmark?.isPassed),
    }
  })
}

const getLandmarkFullName = (landmark: LocalLandmark) => {
  const mapName = landmark.category || landmark.map
  return mapName ? `${mapName} - ${landmark.name}` : landmark.name
}

const getTeamPlayers = (team: LocalTeam, players: LocalPlayer[]) => {
  const ids = [...(team.players || []), ...(team.player_ids || [])]

  const matched = players.filter((player) => {
    const rawTeamId = getRawTeamId(player)
    return (
      isSameTeamId(rawTeamId, team) ||
      ids.includes(player.id) ||
      ids.includes(player.name)
    )
  })

  return matched
    .filter((player, index, array) => array.findIndex((item) => item.id === player.id) === index)
    .sort((a, b) => {
      if (getRawIsCaptain(a) && !getRawIsCaptain(b)) return -1
      if (!getRawIsCaptain(a) && getRawIsCaptain(b)) return 1

      const tierA = TIER_ORDER.indexOf(a.tier)
      const tierB = TIER_ORDER.indexOf(b.tier)

      return (tierA === -1 ? 99 : tierA) - (tierB === -1 ? 99 : tierB)
    })
}

export default function ResultsPage() {
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [page, setPage] = useState(1)

  useEffect(() => {
    const load = () => {
      const snapshot = safeJsonParse<AuctionSnapshot>(localStorage.getItem('auction_snapshot'), {})

      const savedTeams = safeJsonParse<LocalTeam[]>(localStorage.getItem('auction_teams'), [])
      const snapshotTeams = Array.isArray(snapshot.teams) ? snapshot.teams : []

      const auctionPlayers = safeJsonParse<LocalPlayer[]>(localStorage.getItem('auction_players'), [])
      const registeredPlayers = safeJsonParse<LocalPlayer[]>(localStorage.getItem('players'), [])
      const snapshotPlayers = Array.isArray(snapshot.players) ? snapshot.players : []
      const snapshotAuctionPlayers = Array.isArray(snapshot.auction_players)
        ? snapshot.auction_players
        : []

      const savedLandmarks =
        localStorage.getItem('auction_landmarks') ||
        localStorage.getItem('landmarks') ||
        localStorage.getItem('auction_landmark_items')

      setTeams(savedTeams.length > 0 ? savedTeams : snapshotTeams)
      setPlayers(mergePlayers(registeredPlayers, auctionPlayers, snapshotPlayers, snapshotAuctionPlayers))
      setLandmarks(
        normalizeLandmarks(
          savedLandmarks
            ? safeJsonParse<unknown>(savedLandmarks, [])
            : Array.isArray(snapshot.landmarks)
            ? snapshot.landmarks
            : []
        )
      )
    }

    load()

    const interval = setInterval(load, 700)
    window.addEventListener('storage', load)

    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', load)
    }
  }, [])

  const syncResultPageToOverlay = async (nextPage: number) => {
    localStorage.setItem('auction_mode', 'results')
    localStorage.setItem('overlay_page', String(nextPage))

    const { error } = await supabase
      .from('auction_state')
      .update({ overlay_mode: 'results', result_page: nextPage } as any)
      .eq('id', 'main')

    if (error) console.error('result page sync error:', error)
  }

  useEffect(() => {
    syncResultPageToOverlay(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => getTeamNumber(a.id) - getTeamNumber(b.id)),
    [teams]
  )

  const maxPage = sortedTeams.length > 8 ? 2 : 1

  useEffect(() => {
    if (page > maxPage) {
      setPage(maxPage)
      localStorage.setItem('overlay_page', String(maxPage))
    }
  }, [page, maxPage])

  const pageTeams = page === 1 ? sortedTeams.slice(0, 8) : sortedTeams.slice(8, 16)

  const openObsResults = async () => {
    await syncResultPageToOverlay(page)
    alert('OBS 오버레이가 결과창으로 전환됩니다. OBS 브라우저 소스는 /overlay 를 사용하세요.')
  }

  return (
    <main className="h-screen overflow-hidden bg-black p-3 text-white">
      <div className="mx-auto flex h-full max-w-[1740px] flex-col gap-2">
        <header className="h-[54px] shrink-0 flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#070707] px-4 py-2">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-2xl font-black text-primary">결과창</h1>
              <p className="text-xs text-muted-foreground">
                팀원 경매 / 랜드마크 경매 최종 결과
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={openObsResults}>
              <Monitor className="mr-2 h-4 w-4" />
              OBS 결과창 열기
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.setItem('auction_mode', 'landmark')
                window.location.href = '/admin/landmark-auction'
              }}
            >
              랜드마크 경매로 돌아가기
            </Button>

            {maxPage > 1 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPage((prev) => Math.max(1, prev - 1))
                  }}
                  disabled={page === 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  이전
                </Button>

                <span className="rounded border border-[#333] px-3 py-1 text-sm font-black">
                  {page} / {maxPage}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPage((prev) => Math.min(maxPage, prev + 1))
                  }}
                  disabled={page === maxPage}
                >
                  다음
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#333] bg-[#090909] p-3 shadow-[0_0_40px_rgba(0,0,0,0.65)]">
          <div className="mb-3 h-[54px] shrink-0 rounded-lg border border-[#333] bg-gradient-to-r from-[#120000] via-[#050505] to-[#120000] py-2 text-center">
            <h2 className="text-[30px] font-black leading-none tracking-tight text-white">
              결과창
            </h2>
            <p className="mt-1 text-[12px] font-bold text-primary">
              최종 결과창 · {page} / {maxPage}
            </p>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-4 gap-3 overflow-hidden">
            {pageTeams.map((team, index) => {
              const teamNumber = page === 1 ? index + 1 : index + 9
              const teamPlayers = getTeamPlayers(team, players)
              const displayPlayers = teamPlayers.slice(0, 4)

              const teamLandmarks = landmarks.filter(
                (landmark) =>
                  landmark.team_id === team.id ||
                  landmark.teamId === team.id ||
                  team.landmarks?.includes(landmark.id)
              )

              return (
                <article
                  key={team.id}
                  className="grid min-h-0 gap-2 overflow-hidden rounded-xl border border-[#333] bg-[#101010] p-3"
                  style={{ gridTemplateRows: '28px 132px 38px' }}
                >
                  <div className="flex min-h-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-end gap-3">
                      <h3 className="shrink-0 text-[24px] font-black leading-none text-white">
                        {teamNumber}팀
                      </h3>

                      <div className="flex items-center gap-3 pb-0.5">
                        {TIER_ORDER.slice(0, 3).map((tier) => (
                          <span
                            key={tier}
                            className={`text-[23px] font-black leading-none ${getTierTextClass(tier)}`}
                          >
                            {tier}
                          </span>
                        ))}
                      </div>
                    </div>

                    <span className="shrink-0 rounded bg-primary px-2.5 py-1 text-sm font-black text-white">
                      {team.points ?? 0}P
                    </span>
                  </div>

                  <div
                    className="flex min-h-0 items-center justify-center gap-4 overflow-hidden"
                    style={{ height: 132 }}
                  >
                    {[0, 1, 2, 3].map((slotIndex) => {
                      const player = displayPlayers[slotIndex]
                      const imageUrl = getPlayerImageUrl(player)

                      return player ? (
                        <div
                          key={player.id}
                          className={`relative shrink-0 overflow-hidden rounded border-2 bg-[#181818] ${
                            getRawIsCaptain(player)
                              ? 'border-yellow-400'
                              : getTierBorderClass(player.tier)
                          }`}
                          style={{ width: 132, height: 132 }}
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={player.name}
                              className="absolute inset-0 h-full w-full object-cover object-center"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-[#555]">
                              {(player.name || '?')[0]}
                            </div>
                          )}

                          {getRawIsCaptain(player) && (
                            <div className="absolute left-1 top-1 rounded bg-yellow-400 px-1.5 py-0.5 text-[10px] font-black leading-none text-black">
                              팀장
                            </div>
                          )}

                          <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1.5 text-center">
                            <p className="truncate text-[22px] font-black leading-none text-white" style={{ textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000' }}>
                              {player.name}
                            </p>
                            <p className={`text-[14px] font-black leading-none ${getTierTextClass(player.tier)}`}>
                              {getRawIsCaptain(player) ? 'CAPTAIN' : player.tier}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={`empty-${slotIndex}`}
                          className="relative shrink-0 rounded border-2 border-dashed border-[#333] bg-black/30"
                          style={{ width: 132, height: 132 }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center text-[28px] font-black text-[#333]">
                            -
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex min-h-0 items-center overflow-hidden rounded-lg border border-[#333] bg-black/40 px-3">
                    <span className="mr-2 shrink-0 text-[16px] font-black text-primary">
                      [랜드마크]
                    </span>

                    <p className="truncate text-[18px] font-black text-white">
                      {teamLandmarks.length > 0
                        ? teamLandmarks.map((landmark) => getLandmarkFullName(landmark)).join(', ')
                        : '-'}
                    </p>
                  </div>
                </article>
              )
            })}

            {pageTeams.length === 0 && (
              <div className="col-span-2 row-span-4 flex items-center justify-center text-3xl font-black text-muted-foreground">
                표시할 팀이 없습니다.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
