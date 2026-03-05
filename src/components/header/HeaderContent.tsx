import { useState } from 'react'
import { menus } from '@/config.json'
import { clsx } from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import {
  usePathName,
  useShouldAccessibleMenuShow,
  useShouldHeaderMenuBgShow,
  useShouldHeaderMetaShow,
} from './hooks'
import { RootPortal } from '@/components/RootPortal'

export function HeaderContent({ minimal = false }: { minimal?: boolean }) {
  return (
    <>
      <AnimatedMenu minimal={minimal} />
      <AccessibleMenu minimal={minimal} />
    </>
  )
}

function AnimatedMenu({ minimal }: { minimal: boolean }) {
  const shouldBgShow = useShouldHeaderMenuBgShow()
  const shouldHeaderMetaShow = useShouldHeaderMetaShow()

  return (
    <AnimatePresence>
      {(minimal || !shouldHeaderMetaShow) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <HeaderMenu isBgShow={minimal ? false : shouldBgShow} minimal={minimal} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AccessibleMenu({ minimal }: { minimal: boolean }) {
  if (minimal) {
    return null
  }

  const shouldShow = useShouldAccessibleMenuShow()

  return (
    <RootPortal>
      <AnimatePresence>
        {shouldShow && (
          <motion.div
            className="fixed z-50 top-12 inset-x-0 flex justify-center pointer-events-none"
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            exit={{ y: -20, opacity: 0 }}
          >
            <HeaderMenu isBgShow minimal={false} />
          </motion.div>
        )}
      </AnimatePresence>
    </RootPortal>
  )
}

function HeaderMenu({ isBgShow, minimal }: { isBgShow: boolean; minimal: boolean }) {
  const pathName = usePathName()
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)
  const [radius, setRadius] = useState(0)

  const background = `radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, rgb(var(--color-accent) / 0.12) 0%, transparent 65%)`

  const handleMouseMove = ({ clientX, clientY, currentTarget }: React.MouseEvent) => {
    if (minimal) return
    const bounds = currentTarget.getBoundingClientRect()
    setMouseX(clientX - bounds.left)
    setMouseY(clientY - bounds.top)
    setRadius(Math.sqrt(bounds.width ** 2 + bounds.height ** 2) / 2.5)
  }

  return (
    <nav
      className={clsx('relative rounded-full group pointer-events-auto duration-200', {
        'bg-gradient-to-b from-zinc-50/70 to-white/90 shadow-lg shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur-md dark:from-zinc-900/70 dark:to-zinc-800/90 dark:ring-zinc-100/10':
          isBgShow,
        'bg-transparent shadow-none ring-0 text-slate-100': minimal,
      })}
      onMouseMove={handleMouseMove}
    >
      {!minimal && (
        <div
          className="absolute -z-1 -inset-px rounded-full opacity-0 group-hover:opacity-100 duration-500"
          style={{ background }}
          aria-hidden
        ></div>
      )}
      <div className="text-sm px-4 flex">
        {menus.map((menu) => (
          <HeaderMenuItem
            key={menu.name}
            href={menu.link}
            title={menu.name}
            icon={menu.icon}
            isActive={pathName === menu.link}
            minimal={minimal}
          />
        ))}
      </div>
    </nav>
  )
}

function HeaderMenuItem({
  href,
  isActive,
  title,
  icon,
  minimal,
}: {
  href: string
  isActive: boolean
  title: string
  icon: string
  minimal: boolean
}) {
  return (
    <a
      className={clsx(
        'relative block px-4 py-1.5 transition-colors',
        minimal
          ? isActive
            ? 'text-cyan-300'
            : 'text-slate-200 hover:text-slate-50'
          : isActive
            ? 'text-accent'
            : 'hover:text-accent',
      )}
      href={href}
    >
      <div className="flex space-x-2">
        {isActive && (
          <motion.i
            className={clsx('iconfont', icon)}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
          ></motion.i>
        )}
        <span>{title}</span>
      </div>
      {isActive && (
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"></div>
      )}
    </a>
  )
}
