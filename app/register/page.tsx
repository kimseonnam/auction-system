'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Upload, Check } from 'lucide-react'

const TIERS = ['A', 'B', 'C', 'D']

const DAYS = [
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
  '일요일',
]

type LocalPlayer = {
  id: string
  name: string
  tier: string
  available_days: string[]
  image_url: string | null
  is_captain: boolean
  team_id: string | null
  bid_amount: number
  is_passed: boolean
  order_index: number
}

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState('')
  const [tier, setTier] = useState<string>('A')
  const [availableDays, setAvailableDays] = useState<string[]>([])
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isCaptain, setIsCaptain] = useState(false)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageFile(file)

    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const toggleDay = (day: string) => {
    setAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  const resetForm = () => {
    setName('')
    setIsCaptain(false)
    setTier('A')
    setAvailableDays([])
    setImageFile(null)
    setImagePreview(null)
    setSuccess(false)

    const fileInput = document.getElementById('image-upload') as HTMLInputElement | null
    if (fileInput) fileInput.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)

    try {
      const savedPlayers = localStorage.getItem('auction_players')
      const players: LocalPlayer[] = savedPlayers ? JSON.parse(savedPlayers) : []

      const imageUrl = imagePreview || null

      const newPlayer: LocalPlayer = {
        id: crypto.randomUUID(),
        name: name.trim(),
        tier,
        available_days: availableDays,
        image_url: imageUrl,
        is_captain: isCaptain,
        team_id: null,
        bid_amount: 0,
        is_passed: false,
        order_index: players.length + 1,
      }

      const updatedPlayers = [...players, newPlayer]

      localStorage.setItem('auction_players', JSON.stringify(updatedPlayers))

      setSuccess(true)

      setTimeout(() => {
        resetForm()
      }, 1500)
    } catch (error) {
      console.error('Error registering player:', error)
      alert('등록 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>

          <div>
            <h1 className="text-2xl font-bold">플레이어 등록</h1>
            <p className="text-muted-foreground text-sm">
              새로운 플레이어 정보를 입력하세요
            </p>
          </div>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-medium">프로필 이미지</label>

            <div className="flex items-center gap-4">
              <div className="w-24 h-24 bg-secondary rounded-lg overflow-hidden flex items-center justify-center border border-border">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground" />
                )}
              </div>

              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="image-upload"
                />

                <label htmlFor="image-upload">
                  <Button type="button" variant="outline" asChild>
                    <span>이미지 선택</span>
                  </Button>
                </label>

                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG 형식 지원
                </p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">이름 *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="플레이어 이름을 입력하세요"
              required
              className="bg-input border-border"
            />
          </div>

          {/* Captain */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isCaptain"
                checked={isCaptain}
                onChange={(e) => setIsCaptain(e.target.checked)}
                className="h-5 w-5"
              />

              <div>
                <label htmlFor="isCaptain" className="text-sm font-bold">
                  팀장으로 등록
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  체크하면 오버레이/경매 화면에서 팀장 표시용 데이터로 저장됩니다.
                </p>
              </div>
            </div>
          </div>

          {/* Tier Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">티어 선택</label>

            <div className="flex gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`
                    flex-1 py-3 rounded-lg font-semibold transition-all
                    ${
                      tier === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }
                  `}
                >
                  {t}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              A, B, C, D 중 하나를 선택하세요.
            </p>
          </div>

          {/* Available Days */}
          <div className="space-y-2">
            <label className="text-sm font-medium">연습가능 날짜</label>

            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`
                    px-4 py-2 rounded-lg font-medium transition-all
                    ${
                      availableDays.includes(day)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }
                  `}
                >
                  {day}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              가능한 날짜를 여러 개 선택할 수 있습니다.
            </p>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full py-6 text-lg"
            disabled={loading || !name.trim()}
          >
            {loading ? (
              '등록 중...'
            ) : success ? (
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                등록 완료!
              </span>
            ) : (
              '플레이어 등록'
            )}
          </Button>
        </form>
      </div>
    </main>
  )
}
