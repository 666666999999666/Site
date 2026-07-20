"use client"

import { Container } from "@/components/layout/Container"
import { motion } from "motion/react"

export function HeroSection({ name, tagline }: { name: string; tagline: string }) {
  return (
    <section className="py-24 md:py-32">
      <Container size="narrow">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <div className="mx-auto mb-8 h-24 w-24 rounded-full bg-accent/10 flex items-center justify-center text-accent text-3xl font-serif">
            {name.slice(0, 1)}
          </div>
          <h1 className="text-4xl md:text-5xl text-ink mb-4">{name}</h1>
          <p className="text-lg text-ink-muted">{tagline}</p>
        </motion.div>
      </Container>
    </section>
  )
}
