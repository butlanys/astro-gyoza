import { useEffect, useRef } from 'react'

type GiscusProps = {
  repo: string
  repoId: string
  category: string
  categoryId: string
  mapping?: string
  reactionsEnabled?: string
  lang?: string
}

export function Giscus({
  repo,
  repoId,
  category,
  categoryId,
  mapping = 'pathname',
  reactionsEnabled = '1',
  lang = 'zh-CN',
}: GiscusProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light'

    const script = document.createElement('script')
    script.src = 'https://giscus.app/client.js'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.setAttribute('data-repo', repo)
    script.setAttribute('data-repo-id', repoId)
    script.setAttribute('data-category', category)
    script.setAttribute('data-category-id', categoryId)
    script.setAttribute('data-mapping', mapping)
    script.setAttribute('data-reactions-enabled', reactionsEnabled)
    script.setAttribute('data-lang', lang)
    script.setAttribute('data-theme', currentTheme)

    ref.current.innerHTML = ''
    ref.current.appendChild(script)

    return () => {
      ref.current && (ref.current.innerHTML = '')
    }
  }, [repo, repoId, category, categoryId, mapping, reactionsEnabled, lang])

  return <div ref={ref}></div>
}
