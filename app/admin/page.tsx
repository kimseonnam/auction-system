'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Users, Play, Settings, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

type LocalTeam = {
  id: string
  name: string
  is_connected?: boolean | null
  connected_at?: string | null
}

export default function AdminPage() {
  useEffect(() => {
    const role = sessionStorage.getItem('auction_role')
    const adminAuth = sessionStorage.getItem('admin_authenticated')

    if (window.top === window.self) {
      if (role !== 'admin' || adminAuth !== 'true') {
        window.location.replace('/')
      }
    }
  }, [])

  const [playerCount, setPlayerCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [teams, setTeams] = useState<LocalTeam[]>([])
  const [tournamentName, setTournamentName] = useState('경매 시스템')

  const isTeamActuallyConnected = (team: LocalTeam) => {
    if (!team.is_connected || !team.connected_at) {
      return false
    }

    const connectedTime = new Date(team.connected_at).getTime()

    return Date.now() - connectedTime < 5000
  }

  const refreshCounts = useCallback(async () => {
    const [playersResult, teamsResult, teamsDataResult] = await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }),
      supabase.from('teams').select('id', { count: 'exact', head: true }),
      supabase
        .from('teams')
        .select('id, name, is_connected, connected_at')
        .order('id', { ascending: true }),
    ])

    if (playersResult.error) {
      console.error('플레이어 수 불러오기 실패:', playersResult.error)
    } else {
      setPlayerCount(playersResult.count || 0)
    }

    if (teamsResult.error) {
      console.error('팀 수 불러오기 실패:', teamsResult.error)
    } else {
      setTeamCount(teamsResult.count || 0)
    }

    if (teamsDataResult.error) {
      console.error('팀 연결 상태 불러오기 실패:', teamsDataResult.error)
    } else {
      setTeams(
        ((teamsDataResult.data || []) as LocalTeam[]).sort((a, b) => {
          const aNum = Number(a.id.replace('team-', ''))
          const bNum = Number(b.id.replace('team-', ''))
          return aNum - bNum
        })
      )
    }
  }, [])

  const loadSettings = async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('tournament_name')
      .single()

    if (error) {
      console.error('대회명 불러오기 실패:', error)
      return
    }

    if (data?.tournament_name) {
      setTournamentName(data.tournament_name)
    }
  }

  useEffect(() => {
    refreshCounts()
    loadSettings()

    const channel = supabase
      .channel('admin-dashboard-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players' },
        refreshCounts
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        refreshCounts
      )
      .subscribe()

    const interval = setInterval(() => {
      refreshCounts()
    }, 3000)

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [refreshCounts])

  const handleLogout = () => {
    sessionStorage.removeItem('admin_authenticated')
    sessionStorage.removeItem('auction_role')

    window.location.replace('/')
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link href="/">
              <Button variant="ghost" size="icon" className="h-12 w-12">
                <ArrowLeft className="w-6 h-6" />
              </Button>
            </Link>

            <div>
              <h1 className="text-4xl font-black text-white">
                {tournamentName}
              </h1>
              <p className="text-muted-foreground text-base mt-1">
                관리자 대시보드
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-4 py-2 bg-success/20 text-success rounded-full text-base font-bold">
              관리자
            </span>

            <Button
              variant="outline"
              className="h-11 px-5 font-bold"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-7">
          <DashboardCard
            href="/admin/auction"
            icon={<Play className="w-8 h-8 text-primary" />}
            title="경매 시작"
            description="실시간 경매를 시작하고 관리합니다"
          />

          <DashboardCard
            href="/admin/players"
            icon={<Users className="w-8 h-8 text-primary" />}
            title="플레이어 관리"
            description="플레이어 추가, 수정, 삭제"
          />

          <div className="opacity-60 cursor-not-allowed">
            <div className="bg-card border border-border rounded-2xl p-8 min-h-[210px] h-full">
              <div className="p-4 bg-primary/10 rounded-xl w-fit mb-6">
                <Settings className="w-8 h-8 text-primary" />
              </div>

              <h3 className="text-2xl font-black mb-3 text-white">
                랜드마크 관리
              </h3>

              <p className="text-muted-foreground text-base leading-relaxed">
                기능 추가 예정
              </p>
            </div>
          </div>

          <DashboardCard
            href="/admin/settings"
            icon={<Settings className="w-8 h-8 text-primary" />}
            title="설정"
            description="대회명, 팀 수, 포인트 설정"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <QuickStat label="등록 플레이어" count={playerCount} />
          <QuickStat label="등록 팀" count={teamCount} />
          <QuickStat label="기본 포인트" count={0} />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-2xl font-black text-white mb-5">
            참가자 연결 상태
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {teams.map((team) => (
              <div
                key={team.id}
                className="border border-border rounded-xl p-4 bg-background/50"
              >
                <div className="flex items-center justify-between">
                  <p className="font-black text-white">{team.name}</p>

                  {isTeamActuallyConnected(team) ? (
                    <span className="text-green-400 text-sm font-black">
                      ● 접속 중
                    </span>
                  ) : (
                    <span className="text-red-400 text-sm font-black">
                      ● 연결 끊김
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-2">
                  {team.connected_at
                    ? new Date(team.connected_at).toLocaleTimeString()
                    : '기록 없음'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}

function DashboardCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link href={href} className="group">
      <div className="bg-card border border-border rounded-2xl p-8 min-h-[210px] hover:border-primary transition-all duration-200 hover:shadow-xl hover:shadow-primary/10 h-full">
        <div className="p-4 bg-primary/10 rounded-xl w-fit mb-6 group-hover:bg-primary/20 transition-colors">
          {icon}
        </div>

        <h3 className="text-2xl font-black mb-3 text-white">{title}</h3>
        <p className="text-muted-foreground text-base leading-relaxed">
          {description}
        </p>
      </div>
    </Link>
  )
}

function QuickStat({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 min-h-[115px] flex flex-col justify-center">
      <p className="text-muted-foreground text-base font-medium">{label}</p>
      <p className="text-4xl font-black text-white mt-2">{count}</p>
    </div>
  )
}