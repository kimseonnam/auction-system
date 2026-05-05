'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Search, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTier, setFilterTier] = useState<string>('')

  const loadPlayers = async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      console.error('플레이어 불러오기 실패:', error)
      return
    }

    setPlayers(data || [])
  }

  useEffect(() => {
    loadPlayers()

    const channel = supabase
      .channel('players-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
        },
        () => {
          loadPlayers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const filteredPlayers = players.filter(player => {
    const matchesSearch = player.name?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTier = !filterTier || player.tier === filterTier
    return matchesSearch && matchesTier
  })

  const tierCounts = {
    A: players.filter(p => p.tier === 'A').length,
    B: players.filter(p => p.tier === 'B').length,
    C: players.filter(p => p.tier === 'C').length,
    D: players.filter(p => p.tier === 'D').length,
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">플레이어 목록</h1>
            <p className="text-muted-foreground text-xl">
              총 {players.length}명
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-muted-foreground text-xl">전체</p>
            <p className="text-2xl font-bold">{players.length}</p>
          </div>
          {(['A', 'B', 'C', 'D'] as const).map(tier => (
            <div key={tier} className="bg-card border border-border rounded-lg p-4">
              <p className="text-muted-foreground text-xl">티어 {tier}</p>
              <p className="text-2xl font-bold">{tierCounts[tier]}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="플레이어 검색..."
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant={filterTier === '' ? 'default' : 'outline'}
              onClick={() => setFilterTier('')}
            >
              전체
            </Button>

            {['A', 'B', 'C', 'D'].map(tier => (
              <Button
                key={tier}
                variant={filterTier === tier ? 'default' : 'outline'}
                onClick={() => setFilterTier(tier)}
              >
                {tier}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredPlayers.map(player => (
            <div
              key={player.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              <div className="aspect-square bg-secondary relative">
                {player.image_url ? (
                  <img
                    src={player.image_url}
                    alt={player.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-muted-foreground">
                    {player.name?.[0] || '?'}
                  </div>
                )}

                <div className="absolute top-2 right-2 text-sm font-bold">
                  {player.tier}
                </div>
              </div>

              <div className="p-2">
                <p className="font-semibold truncate">{player.name}</p>
              </div>
            </div>
          ))}
        </div>

        {filteredPlayers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              등록된 플레이어가 없습니다
            </p>
          </div>
        )}

      </div>
    </main>
  )
}