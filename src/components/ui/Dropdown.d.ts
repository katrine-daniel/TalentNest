// Public API of Dropdown.jsx (implementation is migrated to TypeScript incrementally).
import type { ComponentType, ReactElement, ReactNode, Ref } from 'react'
import type { LucideProps } from 'lucide-react'

export interface DropdownItem {
  key?: string
  label?: ReactNode
  description?: ReactNode
  icon?: ComponentType<LucideProps>
  onSelect?: () => void
  disabled?: boolean
  disabledReason?: string
  danger?: boolean
  checked?: boolean
  divider?: boolean
  heading?: ReactNode
  keepFocusOnSelect?: boolean
}

export interface DropdownTriggerProps {
  ref: Ref<HTMLButtonElement & HTMLAnchorElement>
  onClick: () => void
  onKeyDown: (e: unknown) => void
  'aria-haspopup': 'menu' | 'dialog'
  'aria-expanded': boolean
  'aria-controls'?: string
}

export interface DropdownProps {
  renderTrigger: (props: DropdownTriggerProps, open: boolean) => ReactElement
  items?: DropdownItem[]
  children?: (close: (restoreFocus?: boolean) => void) => ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  className?: string
  menuLabel?: string
}

export default function Dropdown(props: DropdownProps): ReactElement
