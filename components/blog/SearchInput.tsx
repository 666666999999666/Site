"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Search, X } from "lucide-react"
import { useTranslations } from "next-intl"

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
}

export function SearchInput({ value, onChange }: SearchInputProps) {
  const t = useTranslations("blog")
  const [localValue, setLocalValue] = useState(value)
  const isComposingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当外部 value 变化且不在组合中时，同步到 localValue
  useEffect(() => {
    if (!isComposingRef.current) {
      setLocalValue(value)
    }
  }, [value])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const notifyParent = useCallback((newValue: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange(newValue)
    }, 300)
  }, [onChange])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => {
          const newValue = e.target.value
          setLocalValue(newValue)
          if (isComposingRef.current) {
            // IME 组合中：只更新本地状态，不触发 onChange
          } else {
            // 非组合状态：debounce 通知父组件
            notifyParent(newValue)
          }
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
          // 取消待执行的 debounce，避免组合中误触发
          if (debounceRef.current) clearTimeout(debounceRef.current)
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false
          const finalValue = (e.target as HTMLInputElement).value
          setLocalValue(finalValue)
          // 组合结束后，debounce 通知父组件更新 URL
          notifyParent(finalValue)
        }}
        placeholder={t("search")}
        className="h-10 w-full rounded-lg border border-border/50 bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
      />
      {localValue && (
        <button
          type="button"
          aria-label={t("clearSearch")}
          onClick={() => {
            setLocalValue("")
            if (debounceRef.current) clearTimeout(debounceRef.current)
            onChange("")
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
