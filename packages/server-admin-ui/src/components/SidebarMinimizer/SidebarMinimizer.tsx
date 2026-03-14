import { useCallback } from 'react'

export default function SidebarMinimizer() {
  const handleClick = useCallback(() => {
    document.body.classList.toggle('sidebar-minimized')
    document.body.classList.toggle('brand-minimized')
  }, [])

  return (
    <button className="sidebar-minimizer" type="button" onClick={handleClick} />
  )
}
