'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Plus, Pencil, Trash2, X, Map } from 'lucide-react'

type LocalLandmark = {
  id: string
  map_name: string
  region: string
}

export default function LandmarksManagePage() {
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLandmark, setEditingLandmark] = useState<LocalLandmark | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('auction_landmarks')
    if (saved) {
      setLandmarks(JSON.parse(saved))
    }
  }, [])

  const saveLandmarks = (nextLandmarks: LocalLandmark[]) => {
    setLandmarks(nextLandmarks)
    localStorage.setItem('auction_landmarks', JSON.stringify(nextLandmarks))
  }

  const handleDelete = (landmark: LocalLandmark) => {
    if (!confirm(`${landmark.map_name} - ${landmark.region}을(를) 삭제하시겠습니까?`)) return

    const nextLandmarks = landmarks.filter((item) => item.id !== landmark.id)
    saveLandmarks(nextLandmarks)
  }

  const handleSaveLandmark = (
    landmarkData: Omit<LocalLandmark, 'id'>,
    editId?: string
  ) => {
    if (editId) {
      const nextLandmarks = landmarks.map((item) =>
        item.id === editId ? { ...item, ...landmarkData } : item
      )
      saveLandmarks(nextLandmarks)
    } else {
      const newLandmark: LocalLandmark = {
        id: crypto.randomUUID(),
        ...landmarkData,
      }

      saveLandmarks([...landmarks, newLandmark])
    }

    setShowAddModal(false)
    setEditingLandmark(null)
  }

  const groupedLandmarks = landmarks.reduce((acc, landmark) => {
    if (!acc[landmark.map_name]) acc[landmark.map_name] = []
    acc[landmark.map_name].push(landmark)
    return acc
  }, {} as Record<string, LocalLandmark[]>)

  return (
    <main className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-2xl font-bold">랜드마크 관리</h1>
              <p className="text-muted-foreground text-sm">
                맵 랜드마크 추가, 수정, 삭제
              </p>
            </div>
          </div>

          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            랜드마크 추가
          </Button>
        </div>

        {Object.keys(groupedLandmarks).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(groupedLandmarks).map(([mapName, mapLandmarks]) => (
              <div
                key={mapName}
                className="bg-card border border-border rounded-lg overflow-hidden"
              >
                <div className="bg-secondary px-4 py-3 flex items-center gap-2">
                  <Map className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold">{mapName}</h3>
                  <span className="text-muted-foreground text-sm">
                    ({mapLandmarks.length})
                  </span>
                </div>

                <div className="divide-y divide-border">
                  {mapLandmarks.map((landmark) => (
                    <div
                      key={landmark.id}
                      className="flex items-center justify-between p-4 hover:bg-secondary/50"
                    >
                      <span>{landmark.region}</span>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingLandmark(landmark)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(landmark)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <Map className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">등록된 랜드마크가 없습니다</p>

            <Button className="mt-4" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              첫 랜드마크 추가
            </Button>
          </div>
        )}
      </div>

      {(showAddModal || editingLandmark) && (
        <LandmarkModal
          landmark={editingLandmark}
          existingMaps={Object.keys(groupedLandmarks)}
          onClose={() => {
            setShowAddModal(false)
            setEditingLandmark(null)
          }}
          onSave={handleSaveLandmark}
        />
      )}
    </main>
  )
}

interface LandmarkModalProps {
  landmark: LocalLandmark | null
  existingMaps: string[]
  onClose: () => void
  onSave: (landmarkData: Omit<LocalLandmark, 'id'>, editId?: string) => void
}

function LandmarkModal({
  landmark,
  existingMaps,
  onClose,
  onSave,
}: LandmarkModalProps) {
  const [loading, setLoading] = useState(false)
  const [mapName, setMapName] = useState(landmark?.map_name || '')
  const [region, setRegion] = useState(landmark?.region || '')
  const [useExistingMap, setUseExistingMap] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!mapName.trim() || !region.trim()) return

    setLoading(true)

    onSave(
      {
        map_name: mapName.trim(),
        region: region.trim(),
      },
      landmark?.id
    )

    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">
            {landmark ? '랜드마크 수정' : '새 랜드마크 등록'}
          </h2>

          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">맵 이름 *</label>

            {existingMaps.length > 0 && !landmark && (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={useExistingMap}
                  onChange={(e) => setUseExistingMap(e.target.checked)}
                  id="use-existing"
                  className="rounded"
                />

                <label
                  htmlFor="use-existing"
                  className="text-sm text-muted-foreground"
                >
                  기존 맵 선택
                </label>
              </div>
            )}

            {useExistingMap && existingMaps.length > 0 ? (
              <select
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                className="w-full bg-input border border-border rounded-md px-3 py-2"
                required
              >
                <option value="">맵 선택</option>
                {existingMaps.map((map) => (
                  <option key={map} value={map}>
                    {map}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={mapName}
                onChange={(e) => setMapName(e.target.value)}
                placeholder="예: 에란겔, 미라마, 론도"
                required
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">지역 *</label>

            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="예: 학파트, 서버니, 페카도"
              required
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              취소
            </Button>

            <Button
              type="submit"
              className="flex-1"
              disabled={loading || !mapName.trim() || !region.trim()}
            >
              {loading ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}