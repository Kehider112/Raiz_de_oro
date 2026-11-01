import { useEffect, useRef, useState } from 'react'

export default function SelectorPersonalizado({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}) {
  const [abierto, setAbierto] = useState(false)
  const referencia = useRef(null)
  const opcionActual = options.find((opcion) => opcion.value === value) || options[0]

  useEffect(() => {
    const cerrarFuera = (evento) => {
      if (!referencia.current?.contains(evento.target)) setAbierto(false)
    }
    document.addEventListener('pointerdown', cerrarFuera)
    return () => document.removeEventListener('pointerdown', cerrarFuera)
  }, [])

  const seleccionar = (opcion) => {
    onChange(opcion.value)
    setAbierto(false)
  }

  const manejarTeclado = (evento) => {
    if (evento.key === 'Escape') {
      setAbierto(false)
      return
    }
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      setAbierto(true)
    }
  }

  return (
    <div className={`selector-personalizado ${className}`.trim()} ref={referencia}>
      <button
        className="selector-personalizado-boton"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        onClick={() => setAbierto((estado) => !estado)}
        onKeyDown={manejarTeclado}
      >
        <span>{opcionActual?.label || ''}</span>
        <span className="selector-personalizado-flecha" aria-hidden="true">⌄</span>
      </button>
      {abierto && (
        <div className="selector-personalizado-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((opcion) => (
            <button
              className={`selector-personalizado-opcion${opcion.value === value ? ' seleccionada' : ''}`}
              type="button"
              role="option"
              aria-selected={opcion.value === value}
              key={opcion.value}
              onClick={() => seleccionar(opcion)}
            >
              {opcion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
