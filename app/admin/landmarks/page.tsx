'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/client'
import { ArrowLeft, Plus, Pencil, Trash2, X, Map, Upload } from 'lucide-react'

const LANDMARK_IMAGE_BUCKET = 'landmark-images'

type LocalLandmark = {
  id: string
  map_name: string
  region: string
  name: string
  category: string
  map: string
  image_url?: string | null
  team_id?: string | null
  bid_amount?: number
  is_passed?: boolean
}

const normalizeLandmark = (item: any): LocalLandmark => {
  const mapName = item?.map_name || item?.category || item?.map || '랜드마크'
  const region = item?.region || item?.name || '이름 없음'

  return {
    id: String(item?.id || crypto.randomUUID()),
    map_name: String(mapName),
    region: String(region),
    name: String(region),
    category: String(mapName),
    map: String(mapName),
    image_url: item?.image_url || null,
    team_id: item?.team_id || null,
    bid_amount: Number(item?.bid_amount || 0),
    is_passed: Boolean(item?.is_passed),
  }
}

const toSupabaseLandmark = (landmark: LocalLandmark) => ({
  id: landmark.id,
  name: landmark.region,
  category: landmark.map_name,
  map: landmark.map_name,
  image_url: landmark.image_url || null,
  team_id: landmark.team_id || null,
  bid_amount: Number(landmark.bid_amount || 0),
  is_passed: Boolean(landmark.is_passed),
})

export default function LandmarksManagePage() {
  const [landmarks, setLandmarks] = useState<LocalLandmark[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLandmark, setEditingLandmark] = useState<LocalLandmark | null>(null)
  const [loading, setLoading] = useState(true)

  const syncLocalStorage = useCallback((nextLandmarks: LocalLandmark[]) => {
    const overlayLandmarks = nextLandmarks.map((landmark) => ({
      ...toSupabaseLandmark(landmark),
      map_name: landmark.map_name,
      region: landmark.region,
    }))

    localStorage.setItem('auction_landmarks', JSON.stringify(overlayLandmarks))
    localStorage.setItem('landmarks', JSON.stringify(overlayLandmarks))
  }, [])

  const loadLandmarks = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('landmarks')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.error('landmarks load error:', error)
      setLoading(false)
      return
    }

    const nextLandmarks = (data || []).map(normalizeLandmark)
    setLandmarks(nextLandmarks)
    syncLocalStorage(nextLandmarks)
    setLoading(false)
  }, [syncLocalStorage])

  useEffect(() => {
    loadLandmarks()

    const channel = supabase
      .channel('landmarks-manage-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'landmarks' }, loadLandmarks)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadLandmarks])

  const handleDeleteAll = async () => {
    if (landmarks.length === 0) return
    if (!confirm('등록된 모든 랜드마크를 삭제하시겠습니까?')) return

    const previousLandmarks = landmarks
    setLandmarks([])
    syncLocalStorage([])

    const { error } = await supabase
      .from('landmarks')
      .delete()
      .neq('id', '')

    if (error) {
      console.error('landmarks delete all error:', error)
      alert('전체 삭제 중 오류가 발생했습니다.')
      setLandmarks(previousLandmarks)
      syncLocalStorage(previousLandmarks)
      await loadLandmarks()
    }
  }

  const handleDelete = async (landmark: LocalLandmark) => {
    if (!confirm(`${landmark.map_name} - ${landmark.region}을(를) 삭제하시겠습니까?`)) return

    const nextLandmarks = landmarks.filter((item) => item.id !== landmark.id)
    setLandmarks(nextLandmarks)
    syncLocalStorage(nextLandmarks)

    const { error } = await supabase
      .from('landmarks')
      .delete()
      .eq('id', landmark.id)

    if (error) {
      console.error('landmark delete error:', error)
      alert('삭제 중 오류가 발생했습니다.')
      await loadLandmarks()
    }
  }

  const handleSaveLandmark = async (
    landmarkData: Omit<LocalLandmark, 'id' | 'name' | 'category' | 'map'>,
    editId?: string
  ) => {
    const nextLandmark: LocalLandmark = {
      id: editId || crypto.randomUUID(),
      map_name: landmarkData.map_name,
      region: landmarkData.region,
      name: landmarkData.region,
      category: landmarkData.map_name,
      map: landmarkData.map_name,
      image_url: landmarkData.image_url || null,
      team_id: editId ? editingLandmark?.team_id || null : null,
      bid_amount: editId ? Number(editingLandmark?.bid_amount || 0) : 0,
      is_passed: editId ? Boolean(editingLandmark?.is_passed) : false,
    }

    const { error } = await supabase
      .from('landmarks')
      .upsert(toSupabaseLandmark(nextLandmark))

    if (error) {
      console.error('landmark save error:', error)
      alert('저장 중 오류가 발생했습니다.')
      return
    }

    if (editId) {
      const nextLandmarks = landmarks.map((item) =>
        item.id === editId ? nextLandmark : item
      )
      setLandmarks(nextLandmarks)
      syncLocalStorage(nextLandmarks)
    } else {
      const nextLandmarks = [...landmarks, nextLandmark]
      setLandmarks(nextLandmarks)
      syncLocalStorage(nextLandmarks)
    }

    setShowAddModal(false)
    setEditingLandmark(null)
    await loadLandmarks()
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

          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={landmarks.length === 0}
              title={landmarks.length === 0 ? '삭제할 랜드마크가 없습니다.' : '등록된 랜드마크 전체 제거'}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              전체 제거
            </Button>

            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              랜드마크 추가
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">랜드마크를 불러오는 중...</p>
          </div>
        ) : Object.keys(groupedLandmarks).length > 0 ? (
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
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-secondary">
                          {landmark.image_url ? (
                            <img
                              src={landmark.image_url}
                              alt={landmark.region}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-black text-muted-foreground">
                              {landmark.region[0]}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <span className="block truncate font-bold">{landmark.region}</span>
                          {(landmark.team_id || landmark.is_passed) && (
                            <span className="text-xs text-muted-foreground">
                              {landmark.team_id ? '낙찰됨' : '유찰됨'}
                            </span>
                          )}
                        </div>
                      </div>

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
  onSave: (
    landmarkData: Omit<LocalLandmark, 'id' | 'name' | 'category' | 'map'>,
    editId?: string
  ) => void
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
  const [imageUrl, setImageUrl] = useState(landmark?.image_url || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [useExistingMap, setUseExistingMap] = useState(false)

  const uploadImageIfNeeded = async () => {
    if (!imageFile) return imageUrl || null

    const rawExt = imageFile.name.split('.').pop()?.toLowerCase() || 'png'
    const fileExt = rawExt.replace(/[^a-z0-9]/g, '') || 'png'
    const fileName = `${crypto.randomUUID()}.${fileExt}`
    const filePath = `landmarks/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(LANDMARK_IMAGE_BUCKET)
      .upload(filePath, imageFile, {
        cacheControl: '3600',
        upsert: true,
        contentType: imageFile.type || 'image/png',
      })

    if (uploadError) {
      throw new Error(`Storage 업로드 실패: ${uploadError.message}`)
    }

    const { data } = supabase.storage
      .from(LANDMARK_IMAGE_BUCKET)
      .getPublicUrl(filePath)

    if (!data.publicUrl) {
      throw new Error('Storage 공개 URL을 가져오지 못했습니다.')
    }

    return data.publicUrl
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!mapName.trim() || !region.trim()) return

    setLoading(true)

    try {
      const uploadedImageUrl = await uploadImageIfNeeded()

      await onSave(
        {
          map_name: mapName.trim(),
          region: region.trim(),
          image_url: uploadedImageUrl,
          team_id: landmark?.team_id || null,
          bid_amount: landmark?.bid_amount || 0,
          is_passed: landmark?.is_passed || false,
        },
        landmark?.id
      )
    } catch (error) {
      console.error('landmark image upload/save error:', error)
      const message = error instanceof Error ? error.message : '알 수 없는 오류'
      alert(`이미지 업로드 또는 저장 중 오류가 발생했습니다.\n\n${message}`)
    } finally {
      setLoading(false)
    }
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

          <div className="space-y-2">
            <label className="text-sm font-medium">랜드마크 이미지</label>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-secondary/40 px-4 py-6 text-sm font-bold hover:bg-secondary">
              <Upload className="h-4 w-4" />
              이미지 선택
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return

                  setImageFile(file)
                  setImageUrl(URL.createObjectURL(file))
                }}
              />
            </label>

            {imageUrl && (
              <div className="overflow-hidden rounded-md border border-border bg-secondary">
                <img
                  src={imageUrl}
                  alt="랜드마크 미리보기"
                  className="h-40 w-full object-cover"
                />
              </div>
            )}
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
