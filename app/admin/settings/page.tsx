'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Save, Plus, Trash2, RefreshCw, Gavel } from 'lucide-react'

type LocalSettings = {
  name: string
  team_count: number
  default_points: number | null
  timer_seconds: number
  admin_code: string
}

type LocalTeam = {
  id: string
  name: string
  points: number
}

type TeamDraft = {
  id: string
  name: string
  points: string
}

const DEFAULT_SETTINGS: LocalSettings = {
  name: '경매 시스템',
  team_count: 16,
  default_points: null,
  timer_seconds: 15,
  admin_code: '1234',
}

export default function SettingsPage() {
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [teamDrafts, setTeamDrafts] = useState<TeamDraft[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pointSavedTeamId, setPointSavedTeamId] = useState<string | null>(null)

  const [name, setName] = useState(DEFAULT_SETTINGS.name)
  const [teamCount, setTeamCount] = useState(DEFAULT_SETTINGS.team_count)
  const [defaultPoints, setDefaultPoints] = useState<number | null>(DEFAULT_SETTINGS.default_points)
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_SETTINGS.timer_seconds)
  const [adminCode, setAdminCode] = useState(DEFAULT_SETTINGS.admin_code)

  useEffect(() => {
    const savedSettings = localStorage.getItem('auction_settings')
    const settings: LocalSettings = savedSettings
      ? JSON.parse(savedSettings)
      : DEFAULT_SETTINGS

    setName(settings.name)
    setTeamCount(settings.team_count)
    setDefaultPoints(settings.default_points ?? null)
    setTimerSeconds(settings.timer_seconds)
    setAdminCode(settings.admin_code)

    const savedTeams = localStorage.getItem('auction_teams')
    const loadedTeams: LocalTeam[] = savedTeams ? JSON.parse(savedTeams) : []

    setTeams(loadedTeams)
    setTeamDrafts(
      loadedTeams.map((team) => ({
        id: team.id,
        name: team.name,
        points: String(team.points ?? 0),
      }))
    )
  }, [])

  const syncTeamDrafts = (nextTeams: LocalTeam[]) => {
    setTeamDrafts(
      nextTeams.map((team) => ({
        id: team.id,
        name: team.name,
        points: String(team.points ?? 0),
      }))
    )
  }

  const saveTeams = (nextTeams: LocalTeam[]) => {
    setTeams(nextTeams)
    localStorage.setItem('auction_teams', JSON.stringify(nextTeams))
  }

  const handleSave = () => {
    setLoading(true)

    const settings: LocalSettings = {
      name,
      team_count: teamCount,
      default_points: defaultPoints,
      timer_seconds: timerSeconds,
      admin_code: adminCode,
    }

    localStorage.setItem('auction_settings', JSON.stringify(settings))

    setSaved(true)
    setLoading(false)

    setTimeout(() => setSaved(false), 2000)
  }

  const handleGenerateTeams = () => {
    if (teams.length > 0 && !confirm('기존 팀을 모두 삭제하고 새로 생성하시겠습니까?')) {
      return
    }

    setLoading(true)

    const newTeams: LocalTeam[] = Array.from({ length: teamCount }, (_, i) => ({
      id: `team-${crypto.randomUUID()}`,
      name: `TEAM ${i + 1}`,
      points: defaultPoints ?? 0,
    }))

    saveTeams(newTeams)
    syncTeamDrafts(newTeams)

    setLoading(false)
  }

  const handleDraftTeamName = (teamId: string, newName: string) => {
    setTeamDrafts((prev) =>
      prev.map((draft) =>
        draft.id === teamId ? { ...draft, name: newName } : draft
      )
    )
  }

  const handleDraftTeamPoints = (teamId: string, newPoints: string) => {
    setTeamDrafts((prev) =>
      prev.map((draft) =>
        draft.id === teamId ? { ...draft, points: newPoints } : draft
      )
    )
  }

  const handleApplyTeam = (team: LocalTeam) => {
    const draft = teamDrafts.find((item) => item.id === team.id)
    if (!draft) return

    const nextPoints = draft.points.trim() === '' ? 0 : parseInt(draft.points)
    const safePoints = Number.isNaN(nextPoints) ? 0 : Math.max(0, nextPoints)

    const nextTeams = teams.map((t) =>
      t.id === team.id
        ? {
            ...t,
            name: draft.name.trim() || t.name,
            points: safePoints,
          }
        : t
    )

    saveTeams(nextTeams)
    syncTeamDrafts(nextTeams)

    setPointSavedTeamId(team.id)
    setTimeout(() => setPointSavedTeamId(null), 1200)
  }

  const handleDeleteTeam = (team: LocalTeam) => {
    if (!confirm(`${team.name}을(를) 삭제하시겠습니까?`)) return

    const nextTeams = teams.filter((t) => t.id !== team.id)
    saveTeams(nextTeams)
    syncTeamDrafts(nextTeams)
  }

  const handleResetTeamPoints = () => {
    if (!confirm('모든 팀의 포인트를 기본값으로 초기화하시겠습니까?')) return

    const nextTeams = teams.map((team) => ({
      ...team,
      points: defaultPoints ?? 0,
    }))

    saveTeams(nextTeams)
    syncTeamDrafts(nextTeams)
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-2xl font-bold">대회 설정</h1>
              <p className="text-muted-foreground text-sm">
                대회 정보 및 팀 관리
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/auction">
              <Button variant="outline">
                <Gavel className="w-4 h-4 mr-2" />
                경매 시스템
              </Button>
            </Link>

            <Button onClick={handleSave} disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {saved ? '저장됨!' : '저장'}
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          <h2 className="text-lg font-semibold border-b border-border pb-4">
            대회 정보
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">대회명</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="대회 이름을 입력하세요"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">관리자 코드</label>
              <Input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="관리자 인증 코드"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">팀 수</label>
              <Input
                type="number"
                value={teamCount}
                onChange={(e) => setTeamCount(parseInt(e.target.value) || 16)}
                min={2}
                max={32}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">기본 포인트</label>
              <Input
                type="number"
                value={defaultPoints ?? ''}
                placeholder="기본 포인트 없음"
                onChange={(e) => {
                  const value = e.target.value
                  setDefaultPoints(value === '' ? null : parseInt(value))
                }}
                min={0}
              />
              <p className="text-xs text-muted-foreground">
                비워두면 팀 생성/초기화 시 0포인트로 설정됩니다.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">경매 타이머 (초)</label>
              <Input
                type="number"
                value={timerSeconds}
                onChange={(e) => setTimerSeconds(parseInt(e.target.value) || 15)}
                min={5}
                max={60}
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold">팀 포인트 관리</h2>
              <p className="text-xs text-muted-foreground mt-1">
                팀 이름/포인트는 입력 후 개별 지급 버튼을 눌러야 저장됩니다.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleResetTeamPoints}>
                <RefreshCw className="w-4 h-4 mr-1" />
                포인트 초기화
              </Button>

              <Button size="sm" onClick={handleGenerateTeams}>
                <Plus className="w-4 h-4 mr-1" />
                팀 자동 생성
              </Button>
            </div>
          </div>

          {teams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {teams.map((team, index) => {
                const draft = teamDrafts.find((item) => item.id === team.id)
                const draftName = draft?.name ?? team.name
                const draftPoints = draft?.points ?? String(team.points ?? 0)
                const isChanged =
                  draftName !== team.name || Number(draftPoints || 0) !== team.points

                return (
                  <div key={team.id} className="bg-secondary rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        #{index + 1}
                      </span>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        onClick={() => handleDeleteTeam(team)}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">팀 이름</label>
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => handleDraftTeamName(team.id, e.target.value)}
                        className="w-full bg-input border border-border rounded px-2 py-1 text-sm font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">개별 포인트</label>
                      <input
                        type="number"
                        value={draftPoints}
                        onChange={(e) => handleDraftTeamPoints(team.id, e.target.value)}
                        className="w-full bg-input border border-border rounded px-2 py-1 text-sm"
                        min={0}
                      />
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      variant={isChanged ? 'default' : 'outline'}
                      onClick={() => handleApplyTeam(team)}
                    >
                      {pointSavedTeamId === team.id ? '적용됨!' : '지급'}
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">등록된 팀이 없습니다</p>

              <Button onClick={handleGenerateTeams}>
                <Plus className="w-4 h-4 mr-2" />
                {teamCount}개 팀 자동 생성
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
