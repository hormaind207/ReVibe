'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const PASTEL_COLORS = ['#b19cd9', '#a8d8b9', '#fdb99b', '#89cff0', '#f4a7bb', '#fce4b8']

interface Particle {
  id: number
  x: number
  y: number
  color: string
  rotation: number
  scale: number
  delay: number
}

export function ConfettiExplosion() {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    const ps: Particle[] = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 300,
      y: -(Math.random() * 400 + 100),
      color: PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)],
      rotation: Math.random() * 720 - 360,
      scale: Math.random() * 0.5 + 0.5,
      delay: Math.random() * 0.3,
    }))
    setParticles(ps)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{
            x: '50vw',
            y: '30vh',
            scale: 0,
            rotate: 0,
            opacity: 1,
          }}
          animate={{
            x: `calc(50vw + ${p.x}px)`,
            y: `calc(30vh + ${p.y}px)`,
            scale: p.scale,
            rotate: p.rotation,
            opacity: 0,
          }}
          transition={{
            duration: 1.5,
            delay: p.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          style={{ backgroundColor: p.color }}
          className="absolute h-3 w-3 rounded-sm"
        />
      ))}
    </div>
  )
}
