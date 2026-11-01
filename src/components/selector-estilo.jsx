import SelectorPersonalizado from './selector-personalizado'

const estilos = [
  { valor: 'clasico', texto: 'Clásico' },
  { valor: 'arcade', texto: 'Arcade' },
  { valor: 'android', texto: 'Expressive Cutout' },
]

export default function SelectorEstilo({ estilo, onCambiarEstilo }) {
  return (
    <label className="selector-estilo">
      <span className="selector-estilo-etiqueta">Apariencia</span>
      <SelectorPersonalizado
        ariaLabel="Seleccionar estilo visual"
        value={estilo}
        options={estilos.map((opcion) => ({ value: opcion.valor, label: opcion.texto }))}
        onChange={onCambiarEstilo}
      />
    </label>
  )
}
