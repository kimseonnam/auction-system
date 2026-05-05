'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, Settings, Monitor, Gavel, Lock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type AuctionRole = 'admin' | 'participant'

const ADMIN_CODE = 'ksn0724'
const PARTICIPANT_CODE = 'm0724'

export default function HomePage() {
  const [code, setCode] = useState('')
  const [role, setRole] = useState<AuctionRole | null>(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('경매 시스템')

  useEffect(() => {
    const savedRole = sessionStorage.getItem('auction_role') as AuctionRole | null
    if (savedRole === 'admin' || savedRole === 'participant') {
      setRole(savedRole)
    }

    const savedSettings = localStorage.getItem('auction_settings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings?.name) setTitle(settings.name)
      } catch {
        setTitle('경매 시스템')
      }
    }
  }, [])

  const handleLogin = () => {
    const trimmedCode = code.trim()

    if (trimmedCode === ADMIN_CODE) {
      sessionStorage.setItem('auction_role', 'admin')
      sessionStorage.setItem('admin_authenticated', 'true')
      setRole('admin')
      setError('')
      setCode('')
      return
    }

    if (trimmedCode === PARTICIPANT_CODE) {
      sessionStorage.setItem('auction_role', 'participant')
      sessionStorage.removeItem('admin_authenticated')
      setRole('participant')
      setError('')
      setCode('')
      return
    }

    setError('코드가 올바르지 않습니다.')
  }

  const handleLogout = () => {
    sessionStorage.removeItem('auction_role')
    sessionStorage.removeItem('admin_authenticated')
    setRole(null)
    setCode('')
    setError('')
  }

  if (!role) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-10 shadow-xl">
          <div className="text-center space-y-4 mb-8">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-10 w-10 text-primary" />
            </div>

            <div>
              <h1 className="text-5xl font-black text-primary">{title}</h1>
              <p className="mt-3 text-lg text-muted-foreground">
                관리자 코드 또는 경매 참가자 코드를 입력하세요
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="코드 입력"
              className="h-14 text-center text-xl font-bold"
            />

            {error && (
              <p className="text-center text-sm font-bold text-destructive">
                {error}
              </p>
            )}

            <Button
              onClick={handleLogin}
              disabled={!code.trim()}
              className="h-14 w-full text-lg font-black"
            >
              입장하기
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            치지직 김선남 문의
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-10">
      <div className="w-full max-w-6xl space-y-12">
        <div className="flex items-center justify-end">
          <Button variant="outline" onClick={handleLogout} className="font-bold">
            <LogOut className="mr-2 h-4 w-4" />
            로그아웃
          </Button>
        </div>

        <div className="text-center space-y-6">
          <div
            className={`inline-flex rounded-full px-5 py-2 text-xl font-black transition-all duration-200 ${
              role === 'admin'
                ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                : 'bg-red-600 text-white shadow-[0_0_15px_rgba(255,0,0,0.4)]'
            }`}
          >
            {role === 'admin' ? '관리자 모드' : '경매 참가자 모드'}
          </div>

          <h1 className="text-6xl font-black tracking-tight">
            <span className="text-primary">{title}</span>
          </h1>

          <p className="text-xl text-muted-foreground">
            {role === 'admin'
              ? '관리자, 플레이어 목록, OBS 오버레이를 확인하세요'
              : '경매 입찰, 플레이어 목록, OBS 오버레이 화면을 확인하세요'}
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-10 mt-16 ${role === 'admin' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          {role === 'admin' ? (
            <Link href="/admin" className="group">
              <div className="h-full min-h-[220px] rounded-2xl border border-border bg-card p-10 transition-all duration-200 hover:border-primary hover:shadow-xl hover:shadow-primary/20">
                <div className="mb-6 flex items-center gap-5">
                  <div className="rounded-xl bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
                    <Settings className="h-9 w-9 text-primary" />
                  </div>
                  <h2 className="text-2xl font-black">관리자</h2>
                </div>
                <p className="text-lg text-muted-foreground">
                  플레이어 등록, 팀 설정, 대회 설정을 관리하세요
                </p>
              </div>
            </Link>
          ) : (
            <Link href="/admin/auction" className="group">
              <div className="h-full min-h-[220px] rounded-2xl border border-border bg-card p-10 transition-all duration-200 hover:border-primary hover:shadow-xl hover:shadow-primary/20">
                <div className="mb-6 flex items-center gap-5">
                  <div className="rounded-xl bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
                    <Gavel className="h-9 w-9 text-primary" />
                  </div>
                  <h2 className="text-2xl font-black">경매 입찰</h2>
                </div>
                <p className="text-lg text-muted-foreground">
                  참가자는 입찰 금액 입력만 사용할 수 있습니다
                </p>
              </div>
            </Link>
          )}

          <Link href="/players" className="group">
            <div className="h-full min-h-[220px] rounded-2xl border border-border bg-card p-10 transition-all duration-200 hover:border-primary hover:shadow-xl hover:shadow-primary/20">
              <div className="mb-6 flex items-center gap-5">
                <div className="rounded-xl bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
                  <Users className="h-9 w-9 text-primary" />
                </div>
                <h2 className="text-2xl font-black">플레이어 목록</h2>
              </div>
              <p className="text-lg text-muted-foreground">
                등록된 플레이어 목록과 티어를 확인하세요
              </p>
            </div>
          </Link>

          {role === 'admin' && (
          <Link
            href="/overlay"
            target="_blank"
            rel="noopener noreferrer"
            className="group"
          >
            <div className="h-full min-h-[220px] rounded-2xl border border-border bg-card p-10 transition-all duration-200 hover:border-primary hover:shadow-xl hover:shadow-primary/20">
              <div className="mb-6 flex items-center gap-5">
                <div className="rounded-xl bg-primary/10 p-4 transition-colors group-hover:bg-primary/20">
                  <Monitor className="h-9 w-9 text-primary" />
                </div>
                <h2 className="text-2xl font-black">OBS 오버레이</h2>
              </div>
              <p className="text-lg text-muted-foreground">
                방송용 실시간 경매 화면을 새 창으로 확인하세요
              </p>
            </div>
          </Link>
          )}
        </div>

        <div className="text-center text-sm text-muted-foreground">
          <code className="rounded-lg bg-secondary px-3 py-2">
            치지직 김선남 문의
          </code>
        </div>
      </div>
    </main>
  )
}
