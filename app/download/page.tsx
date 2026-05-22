'use client'

import { useEffect } from 'react'

export default function DownloadPage() {
  useEffect(() => {
    window.location.href =
      'https://drive.google.com/uc?export=download&id=1JwhC1tw0C4lMNmsG1RePu-vq1ku4PJuT'
  }, [])

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#000',
        color: '#fff',
        fontSize: '24px',
        fontWeight: 'bold',
      }}
    >
      다운로드 중...
    </div>
  )
}