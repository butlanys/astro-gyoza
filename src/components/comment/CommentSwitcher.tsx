import { useState } from 'react'
import { Waline } from './Waline'
import { Giscus } from './Giscus'
import clsx from 'clsx'

type WalineConfig = {
  serverURL?: string
}

type GiscusConfig = {
  repo?: string
  repoId?: string
  category?: string
  categoryId?: string
  mapping?: string
  reactionsEnabled?: string
  lang?: string
}

export function CommentSwitcher({
  waline,
  giscus,
}: {
  waline?: WalineConfig
  giscus?: GiscusConfig
}) {
  const hasWaline = !!waline?.serverURL
  const hasGiscus = !!(giscus?.repo && giscus?.repoId && giscus?.categoryId)
  const walineProps = hasWaline ? { serverURL: waline!.serverURL! } : null
  const giscusProps = hasGiscus
    ? {
        repo: giscus!.repo!,
        repoId: giscus!.repoId!,
        category: giscus!.category!,
        categoryId: giscus!.categoryId!,
        mapping: giscus?.mapping,
        reactionsEnabled: giscus?.reactionsEnabled,
        lang: giscus?.lang,
      }
    : null
  const defaultTab = hasWaline ? 'waline' : hasGiscus ? 'giscus' : ''
  const [tab, setTab] = useState(defaultTab)

  if (!hasWaline && !hasGiscus) return null

  return (
    <div className="space-y-4">
      <div className="group relative inline-flex items-center rounded-full bg-gradient-to-b from-zinc-50/70 to-white/90 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur-md dark:from-zinc-900/70 dark:to-zinc-800/90 dark:ring-zinc-100/10">
        <div className="absolute -z-1 inset-0 rounded-full opacity-0 group-hover:opacity-100 duration-500 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent"></div>
        {hasWaline && (
          <button
            type="button"
            onClick={() => setTab('waline')}
            className={clsx(
              'relative px-4 py-1.5 text-sm font-medium rounded-full transition-colors',
              tab === 'waline'
                ? 'text-accent bg-white/80 dark:bg-zinc-800/80 shadow-sm'
                : 'text-secondary hover:text-accent',
            )}
          >
            Waline
            {tab === 'waline' && (
              <span className="pointer-events-none absolute inset-x-3 -bottom-1 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"></span>
            )}
          </button>
        )}
        {hasGiscus && (
          <button
            type="button"
            onClick={() => setTab('giscus')}
            className={clsx(
              'relative px-4 py-1.5 text-sm font-medium rounded-full transition-colors',
              tab === 'giscus'
                ? 'text-accent bg-white/80 dark:bg-zinc-800/80 shadow-sm'
                : 'text-secondary hover:text-accent',
            )}
          >
            Giscus
            {tab === 'giscus' && (
              <span className="pointer-events-none absolute inset-x-3 -bottom-1 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"></span>
            )}
          </button>
        )}
      </div>
      <div>
        {tab === 'waline' && walineProps && <Waline {...walineProps} />}
        {tab === 'giscus' && giscusProps && <Giscus {...giscusProps} />}
      </div>
    </div>
  )
}
