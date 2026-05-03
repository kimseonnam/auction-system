'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Plus, Pencil, Trash2, X, Upload } from 'lucide-react'

const TIERS = ['A', 'B', 'C', 'D'] as const
const FILTER_TIERS = ['ALL', ...TIERS] as const

type TierFilter = (typeof FILTER_TIERS)[number]

const DETAIL_TIERS = [
  '1티어',
  '2티어',
  '3티어',
  '4티어',
  '5티어',
  '6티어',
  '7티어',
  '8티어',
  '9티어',
  '10티어',
  '물젖통',
]

type LocalTeam = {
  id: string
  name: string
  points: number
}

type LocalPlayer = {
  id: string
  name: string
  tier: string
  detail_tier: string
  available_days: string
  bio: string
  image_url: string | null
  team_id?: string | null
  bid_amount: number
  is_passed: boolean
  is_captain?: boolean
}

const createDefaultTeams = (): LocalTeam[] =>
  Array.from({ length: 16 }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `TEAM ${i + 1}`,
    points: 0,
  }))

const loadTeams = (): LocalTeam[] => {
  const savedTeams = localStorage.getItem('auction_teams')

  if (savedTeams) {
    try {
      const parsedTeams = JSON.parse(savedTeams)
      if (Array.isArray(parsedTeams) && parsedTeams.length > 0) {
        return parsedTeams
      }
    } catch {
      // 기본 팀 생성으로 처리
    }
  }

  const defaultTeams = createDefaultTeams()
  localStorage.setItem('auction_teams', JSON.stringify(defaultTeams))
  return defaultTeams
}

const saveTeams = (teams: LocalTeam[]) => {
  localStorage.setItem('auction_teams', JSON.stringify(teams))
}

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

const getNextCaptainTeamId = (players: LocalPlayer[], editId?: string) => {
  const teams = sortTeamsByNumber(loadTeams())

  const usedCaptainTeamIds = players
    .filter((player) => player.is_captain && player.team_id && player.id !== editId)
    .map((player) => player.team_id)

  const emptyTeam = teams.find((team) => !usedCaptainTeamIds.includes(team.id))

  return emptyTeam?.id || null
}

const resetOldCaptainTeamNameIfNeeded = (
  teams: LocalTeam[],
  oldTeamId?: string | null,
  players: LocalPlayer[] = [],
  editId?: string
) => {
  if (!oldTeamId) return teams

  const stillUsedByOtherCaptain = players.some(
    (player) =>
      player.id !== editId &&
      player.is_captain &&
      player.team_id === oldTeamId
  )

  if (stillUsedByOtherCaptain) return teams

  const teamNumber = getTeamNumber(oldTeamId)

  return teams.map((team) =>
    team.id === oldTeamId
      ? {
          ...team,
          name: teamNumber ? `TEAM ${teamNumber}` : team.name,
        }
      : team
  )
}

const updateCaptainTeamName = ({
  teamId,
  captainName,
  oldTeamId,
  players,
  editId,
}: {
  teamId?: string | null
  captainName: string
  oldTeamId?: string | null
  players: LocalPlayer[]
  editId?: string
}) => {
  let teams = loadTeams()

  if (oldTeamId && oldTeamId !== teamId) {
    teams = resetOldCaptainTeamNameIfNeeded(teams, oldTeamId, players, editId)
  }

  if (teamId) {
    teams = teams.map((team) =>
      team.id === teamId
        ? {
            ...team,
            name: captainName,
          }
        : team
    )
  } else if (oldTeamId) {
    teams = resetOldCaptainTeamNameIfNeeded(teams, oldTeamId, players, editId)
  }

  saveTeams(teams)
}

const compressImageToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const img = new Image()

      img.onload = () => {
        const maxSize = 420
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        const width = Math.round(img.width * scale)
        const height = Math.round(img.height * scale)

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('이미지 처리에 실패했습니다.'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }

      img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
      img.src = reader.result as string
    }

    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

export default function PlayersManagePage() {
  const [players, setPlayers] = useState<LocalPlayer[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<LocalPlayer | null>(null)
  const [tierFilter, setTierFilter] = useState<TierFilter>('ALL')

  useEffect(() => {
    loadTeams()

    const saved = localStorage.getItem('auction_players')

    if (saved) {
      try {
        setPlayers(JSON.parse(saved))
      } catch (error) {
        console.error('플레이어 데이터를 불러오지 못했습니다:', error)
        setPlayers([])
      }
    }
  }, [])

  const savePlayers = (nextPlayers: LocalPlayer[]) => {
    setPlayers(nextPlayers)
    localStorage.setItem('auction_players', JSON.stringify(nextPlayers))
  }

  const filteredPlayers =
    tierFilter === 'ALL'
      ? players
      : players.filter((player) => player.tier === tierFilter)

  const handleDeleteAll = () => {
    if (players.length === 0) {
      alert('삭제할 플레이어가 없습니다.')
      return
    }

    if (!confirm('등록된 모든 플레이어를 삭제하시겠습니까?\n팀장 정보와 낙찰 기록도 모두 초기화됩니다.')) {
      return
    }

    const resetTeams = createDefaultTeams()
    saveTeams(resetTeams)
    savePlayers([])

    localStorage.setItem('auction_logs', JSON.stringify([]))
    localStorage.setItem(
      'auction_state',
      JSON.stringify({
        current_player_id: null,
        current_bid: 0,
        current_bidder_team_id: null,
        timer_remaining: 15,
        status: 'ready',
      })
    )

    setTierFilter('ALL')
  }

  const handleDelete = (player: LocalPlayer) => {
    if (!confirm(`${player.name}을(를) 삭제하시겠습니까?`)) return

    const nextPlayers = players.filter((p) => p.id !== player.id)

    if (player.is_captain && player.team_id) {
      updateCaptainTeamName({
        teamId: null,
        captainName: player.name,
        oldTeamId: player.team_id,
        players: nextPlayers,
        editId: player.id,
      })
    }

    savePlayers(nextPlayers)
  }

  const handleSavePlayer = (playerData: Omit<LocalPlayer, 'id'>, editId?: string) => {
    if (editId) {
      const oldPlayer = players.find((player) => player.id === editId)
      let updatedPlayer: LocalPlayer | null = null

      const nextPlayers = players.map((player) => {
        if (player.id !== editId) return player

        const nextTeamId = playerData.is_captain
          ? player.team_id || getNextCaptainTeamId(players, editId)
          : null

        updatedPlayer = {
          ...player,
          ...playerData,
          team_id: nextTeamId,
          bid_amount: playerData.is_captain ? 0 : playerData.bid_amount,
          is_passed: playerData.is_captain ? false : playerData.is_passed,
        }

        return updatedPlayer
      })

      if (updatedPlayer !== null) {
        const fixedPlayer: LocalPlayer = updatedPlayer

        updateCaptainTeamName({
          teamId: fixedPlayer.is_captain ? fixedPlayer.team_id : null,
          captainName: fixedPlayer.name,
          oldTeamId: oldPlayer?.team_id,
          players: nextPlayers,
          editId,
        })
      }

      savePlayers(nextPlayers)
    } else {
      const newPlayerId = crypto.randomUUID()
      const nextTeamId = playerData.is_captain ? getNextCaptainTeamId(players) : null

      const newPlayer: LocalPlayer = {
        id: newPlayerId,
        ...playerData,
        team_id: nextTeamId,
        bid_amount: playerData.is_captain ? 0 : playerData.bid_amount,
        is_passed: playerData.is_captain ? false : playerData.is_passed,
      }

      const nextPlayers = [...players, newPlayer]

      if (newPlayer.is_captain) {
        updateCaptainTeamName({
          teamId: newPlayer.team_id,
          captainName: newPlayer.name,
          players: nextPlayers,
          editId: newPlayer.id,
        })
      }

      savePlayers(nextPlayers)
    }

    setShowAddModal(false)
    setEditingPlayer(null)
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-2xl font-bold">플레이어 관리</h1>
              <p className="text-muted-foreground text-sm">
                플레이어 추가, 수정, 삭제
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={players.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              전체 삭제
            </Button>

            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              플레이어 추가
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <h3 className="text-sm font-black text-white">티어별 보기</h3>
            <p className="text-xs text-muted-foreground">
              전체 또는 A/B/C/D 티어별로 플레이어를 확인할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {FILTER_TIERS.map((tierOption) => (
              <button
                key={tierOption}
                type="button"
                onClick={() => setTierFilter(tierOption)}
                className={`min-w-14 rounded-md px-4 py-2 text-sm font-black transition-all ${
                  tierFilter === tierOption
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-white hover:bg-secondary/80'
                }`}
              >
                {tierOption === 'ALL' ? '전체' : tierOption}
                <span className="ml-1 text-xs opacity-70">
                  ({tierOption === 'ALL'
                    ? players.length
                    : players.filter((player) => player.tier === tierOption).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary">
                <tr>
                  <th className="text-left p-4 font-medium">이미지</th>
                  <th className="text-left p-4 font-medium">이름</th>
                  <th className="text-left p-4 font-medium">티어</th>
                  <th className="text-left p-4 font-medium">연습 가능 날짜</th>
                  <th className="text-left p-4 font-medium">치지직 티어</th>
                  <th className="text-left p-4 font-medium">자기소개</th>
                  <th className="text-left p-4 font-medium">낙찰가</th>
                  <th className="text-left p-4 font-medium">상태</th>
                  <th className="text-right p-4 font-medium">관리</th>
                </tr>
              </thead>

              <tbody>
                {filteredPlayers.map((player) => (
                  <tr
                    key={player.id}
                    className="border-t border-border hover:bg-secondary/50"
                  >
                    <td className="p-4">
                      <div className="w-10 h-10 bg-secondary rounded overflow-hidden">
                        {player.image_url ? (
                          <img
                            src={player.image_url}
                            alt={player.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            {player.name[0]}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="p-4 font-medium">
                      <div className="flex items-center gap-2">
                        {player.is_captain && (
                          <span className="rounded bg-yellow-400/20 px-2 py-1 text-xs font-black text-yellow-400">
                            팀장
                          </span>
                        )}
                        <span>
                          {player.is_captain ? `[팀장] ${player.name}` : player.name}
                        </span>
                      </div>
                    </td>

                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          player.tier === 'A'
                            ? 'bg-primary/20 text-primary'
                            : player.tier === 'B'
                            ? 'bg-blue-500/20 text-blue-400'
                            : player.tier === 'C'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {player.tier}
                      </span>
                    </td>

                    <td className="p-4 text-sm text-muted-foreground">
                      {player.available_days || '-'}
                    </td>

                    <td className="p-4">
                      {player.detail_tier || '-'}
                    </td>

                    <td className="p-4 text-sm text-muted-foreground max-w-[200px] truncate">
                      {player.bio || '-'}
                    </td>

                    <td className="p-4">
                      {player.is_captain
                        ? '팀장'
                        : player.bid_amount > 0
                        ? `${player.bid_amount}P`
                        : '-'}
                    </td>

                    <td className="p-4">
                      {player.is_captain ? (
                        <span className="text-yellow-400 text-sm">팀장 배치</span>
                      ) : player.is_passed ? (
                        <span className="text-destructive text-sm">유찰</span>
                      ) : player.team_id ? (
                        <span className="text-success text-sm">낙찰</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">대기</span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingPlayer(player)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(player)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredPlayers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      {tierFilter === 'ALL'
                        ? '등록된 플레이어가 없습니다'
                        : `${tierFilter} 티어 플레이어가 없습니다`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(showAddModal || editingPlayer) && (
        <PlayerModal
          player={editingPlayer}
          onClose={() => {
            setShowAddModal(false)
            setEditingPlayer(null)
          }}
          onSave={handleSavePlayer}
        />
      )}
    </main>
  )
}

interface PlayerModalProps {
  player: LocalPlayer | null
  onClose: () => void
  onSave: (playerData: Omit<LocalPlayer, 'id'>, editId?: string) => void
}

function PlayerModal({ player, onClose, onSave }: PlayerModalProps) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(player?.name || '')
  const [tier, setTier] = useState(player?.tier || 'A')
  const [detailTier, setDetailTier] = useState(player?.detail_tier || '1티어')
  const [availableDays, setAvailableDays] = useState(player?.available_days || '')
  const [imagePreview, setImagePreview] = useState<string | null>(
    player?.image_url || null
  )
  const [bio, setBio] = useState(player?.bio || '')
  const [isCaptain, setIsCaptain] = useState(player?.is_captain || false)

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const compressed = await compressImageToDataUrl(file)
      setImagePreview(compressed)
    } catch (error) {
      console.error(error)
      alert('이미지 처리 중 오류가 발생했습니다.')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return

    setLoading(true)

    const playerData: Omit<LocalPlayer, 'id'> = {
      name: name.trim(),
      tier,
      detail_tier: detailTier,
      available_days: availableDays.trim(),
      bio: bio.trim().slice(0, 200),
      image_url: imagePreview,
      team_id: player?.team_id || null,
      bid_amount: isCaptain ? 0 : player?.bid_amount || 0,
      is_passed: isCaptain ? false : player?.is_passed || false,
      is_captain: isCaptain,
    }

    try {
      onSave(playerData, player?.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">
            {player ? '플레이어 수정' : '새 플레이어 등록'}
          </h2>

          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">프로필 이미지</label>

            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-secondary rounded-lg overflow-hidden">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Upload className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="modal-image"
              />

              <label htmlFor="modal-image">
                <Button type="button" variant="outline" size="sm" asChild>
                  <span>이미지 선택</span>
                </Button>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">이름 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={isCaptain}
                onChange={(e) => setIsCaptain(e.target.checked)}
                className="h-5 w-5"
              />
              <div>
                <p className="text-sm font-bold">팀장으로 등록</p>
                <p className="text-xs text-muted-foreground">
                  체크하면 TEAM 1부터 빈 팀에 자동 배치되고 팀 이름이 팀장 이름으로 변경됩니다.
                </p>
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">티어</label>

            <div className="flex gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`flex-1 py-2 rounded font-medium transition-all ${
                    tier === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary hover:bg-secondary/80'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">연습 가능 날짜</label>
            <Input
              value={availableDays}
              onChange={(e) => setAvailableDays(e.target.value)}
              placeholder="본인이 연습 가능한 시간 적어주세요"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">치지직 티어</label>

            <select
              value={detailTier}
              onChange={(e) => setDetailTier(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2"
            >
              {DETAIL_TIERS.map((tierName) => (
                <option key={tierName} value={tierName}>
                  {tierName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">자기소개</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              placeholder="200자 넘어가면 화면에 안나옴"
              className="w-full min-h-[90px] bg-input border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {bio.length}/200
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              취소
            </Button>

            <Button type="submit" className="flex-1" disabled={loading || !name.trim()}>
              {loading ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
