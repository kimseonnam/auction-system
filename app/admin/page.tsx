'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, ArrowLeft, Users, Map, Play, Settings, LogOut } from 'lucide-react'

const ADMIN_CODE = '1234'

export default function AdminPage() {
  const [adminCode, setAdminCode] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState('')
  const [playerCount, setPlayerCount] = useState(0)
  const [teamCount, setTeamCount] = useState(0)
  const [landmarkCount, setLandmarkCount] = useState(0)

  useEffect(() => {
    const storedAuth = sessionStorage.getItem('admin_authenticated')
    const storedRole = sessionStorage.getItem('auction_role')

    if (storedAuth === 'true' && storedRole === 'admin') {
      setIsAuthenticated(true)
    }

    refreshCounts()
  }, [])

  const refreshCounts = () => {
    const savedPlayers = localStorage.getItem('auction_players')
    const players = savedPlayers ? JSON.parse(savedPlayers) : []
    setPlayerCount(players.length)

    const savedTeams = localStorage.getItem('auction_teams')
    const teams = savedTeams ? JSON.parse(savedTeams) : []
    setTeamCount(teams.length)

    const savedLandmarks = localStorage.getItem('auction_landmarks')
    const landmarks = savedLandmarks ? JSON.parse(savedLandmarks) : []
    setLandmarkCount(landmarks.length)
  }

  const handleLogin = () => {
    if (adminCode.trim() === ADMIN_CODE) {
      setIsAuthenticated(true)

      // ✅ 관리자 권한 저장
      sessionStorage.setItem('admin_authenticated', 'true')
      sessionStorage.setItem('auction_role', 'admin')

      setError('')
      refreshCounts()
    } else {
      setError('관리자 코드가 올바르지 않습니다.')
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    sessionStorage.removeItem('admin_authenticated')
    sessionStorage.removeItem('auction_role')
    setAdminCode('')
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-xl space-y-8 rounded-2xl border border-border bg-card/50 p-10 shadow-xl">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <Lock className="w-12 h-12 text-primary" />
            </div>

            <h1 className="text-4xl font-black">관리자 인증</h1>
            <p className="text-muted-foreground text-lg">
              관리자 코드를 입력하세요
            </p>
          </div>

          <div className="space-y-4">
            <Input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="관리자 코드"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="bg-input border-border text-center text-xl h-16 font-bold"
            />

            {error && (
              <p className="text-destructive text-sm text-center font-bold">
                {error}
              </p>
            )}

            <Button
              onClick={handleLogin}
              className="w-full h-16 text-xl font-black"
              disabled={!adminCode.trim()}
            >
              로그인
            </Button>
          </div>

          <div className="text-center">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← 메인으로 돌아가기
            </Link>
          </div>
        </div>
      </main>
    )
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
              <h1 className="text-4xl font-black text-white">경매 시스템</h1>
              <p className="text-muted-foreground text-base mt-1">
                관리자 대시보드
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-4 py-2 bg-success/20 text-success rounded-full text-base font-bold">
              관리자 모드
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

          <DashboardCard
            href="/admin/landmarks"
            icon={<Map className="w-8 h-8 text-primary" />}
            title="랜드마크 관리"
            description="맵 랜드마크 추가, 수정, 삭제"
          />

          <DashboardCard
            href="/admin/settings"
            icon={<Settings className="w-8 h-8 text-primary" />}
            title="대회 설정"
            description="대회명, 팀 수, 포인트 설정"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <QuickStat label="등록 플레이어" count={playerCount} />
          <QuickStat label="등록 팀" count={teamCount} />
          <QuickStat label="랜드마크" count={landmarkCount} />
          <QuickStat label="기본 포인트" count={0} />
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
