import { useMemo, useState } from 'react'
import { supabase } from '../supabase'
import SelectorPersonalizado from './selector-personalizado'

const ETIQUETAS_TIPO = { ingreso: 'Ingreso', gasto: 'Gasto' }
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const fechaLocal = (fecha) => {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

const escaparHtml = (valor) => String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[caracter])

const csvCelda = (valor) => `"${String(valor ?? '').replace(/"/g, '""')}"`

export default function FinanzasExtras({
  vista,
  usuarioId,
  movimientos,
  categorias,
  presupuestos,
  recurrentes,
  prestamos,
  metas,
  onRecargar,
  onError,
  dinero,
}) {
  const [nombreCategoria, setNombreCategoria] = useState('')
  const [tipoCategoria, setTipoCategoria] = useState('gasto')
  const [categoriaPresupuesto, setCategoriaPresupuesto] = useState('')
  const [limitePresupuesto, setLimitePresupuesto] = useState('')
  const [tipoRecurrente, setTipoRecurrente] = useState('gasto')
  const [categoriaRecurrente, setCategoriaRecurrente] = useState('')
  const [montoRecurrente, setMontoRecurrente] = useState('')
  const [periodoRecurrente, setPeriodoRecurrente] = useState('mensual')
  const [fechaRecurrente, setFechaRecurrente] = useState(fechaLocal(new Date()))
  const [notaRecurrente, setNotaRecurrente] = useState('')
  const [mesCalendario, setMesCalendario] = useState(() => {
    const ahora = new Date()
    return new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  })
  const [direccionCalendario, setDireccionCalendario] = useState('siguiente')
  const [cambioCalendario, setCambioCalendario] = useState(0)
  const [procesando, setProcesando] = useState(false)

  const gastosDelMes = useMemo(() => movimientos.filter((movimiento) => {
    const fecha = new Date(`${movimiento.fecha}T00:00:00`)
    const ahora = new Date()
    return movimiento.tipo === 'gasto' &&
      fecha.getFullYear() === ahora.getFullYear() &&
      fecha.getMonth() === ahora.getMonth()
  }), [movimientos])

  const gastosPorCategoria = useMemo(() => gastosDelMes.reduce((totales, movimiento) => {
    if (movimiento.categoria_id) {
      totales[movimiento.categoria_id] = (totales[movimiento.categoria_id] || 0) + Number(movimiento.monto)
    }
    return totales
  }, {}), [gastosDelMes])

  const alertasPresupuesto = presupuestos.flatMap((presupuesto) => {
    const gastado = gastosPorCategoria[presupuesto.categoria_id] || 0
    const porcentaje = (gastado / Number(presupuesto.limite_mensual)) * 100
    if (porcentaje < 80) return []
    const categoria = categorias.find((item) => item.id === presupuesto.categoria_id)
    return [{
      id: presupuesto.id,
      nombre: categoria?.nombre || 'Categoría',
      gastado,
      limite: Number(presupuesto.limite_mensual),
      porcentaje,
      excedido: porcentaje >= 100,
    }]
  })

  const datosGrafica = useMemo(() => {
    const ahora = new Date()
    const meses = Array.from({ length: 6 }, (_, indice) => {
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - 5 + indice, 1)
      const movimientosMes = movimientos.filter((movimiento) => {
        const fechaMovimiento = new Date(`${movimiento.fecha}T00:00:00`)
        return fechaMovimiento.getFullYear() === fecha.getFullYear() &&
          fechaMovimiento.getMonth() === fecha.getMonth()
      })
      return {
        etiqueta: new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(fecha),
        ingresos: movimientosMes
          .filter((movimiento) => ['ingreso', 'prestamo_recibido', 'abono_recibido', 'retiro_ahorro'].includes(movimiento.tipo))
          .reduce((total, movimiento) => total + Number(movimiento.monto), 0),
        gastos: movimientosMes
          .filter((movimiento) => ['gasto', 'prestamo_dado', 'abono_pagado', 'aporte_ahorro'].includes(movimiento.tipo))
          .reduce((total, movimiento) => total + Number(movimiento.monto), 0),
      }
    })
    const maximo = Math.max(...meses.flatMap((mes) => [mes.ingresos, mes.gastos]), 1)
    return meses.map((mes) => ({ ...mes, escalaIngresos: mes.ingresos / maximo, escalaGastos: mes.gastos / maximo }))
  }, [movimientos])

  async function ejecutar(operacion) {
    setProcesando(true)
    const { error } = await operacion()
    setProcesando(false)
    if (error) {
      onError(error.message)
      return false
    }
    onError('')
    await onRecargar()
    return true
  }

  async function crearCategoria(evento) {
    evento.preventDefault()
    const nombre = nombreCategoria.trim()
    if (!nombre) return
    const correcto = await ejecutar(() => supabase.from('categorias').insert({
      usuario_id: usuarioId,
      nombre,
      tipo: tipoCategoria,
    }))
    if (correcto) setNombreCategoria('')
  }

  async function guardarPresupuesto(evento) {
    evento.preventDefault()
    const limite = Number(String(limitePresupuesto).replace(/\./g, '').replace(',', '.'))
    if (!categoriaPresupuesto) return onError('Selecciona una categoría para el presupuesto.')
    if (!Number.isFinite(limite) || limite <= 0) return onError('El límite debe ser mayor a cero.')
    const correcto = await ejecutar(() => supabase.from('presupuestos').upsert({
      usuario_id: usuarioId,
      categoria_id: categoriaPresupuesto,
      limite_mensual: limite,
    }, { onConflict: 'usuario_id,categoria_id' }))
    if (correcto) {
      setCategoriaPresupuesto('')
      setLimitePresupuesto('')
    }
  }

  async function guardarRecurrente(evento) {
    evento.preventDefault()
    const monto = Number(String(montoRecurrente).replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(monto) || monto <= 0) return onError('El monto recurrente debe ser mayor a cero.')
    const correcto = await ejecutar(() => supabase.from('movimientos_fijos').insert({
      usuario_id: usuarioId,
      tipo: tipoRecurrente,
      monto,
      categoria_id: categoriaRecurrente || null,
      nota: notaRecurrente.trim() || null,
      periodo: periodoRecurrente,
      proxima_fecha: fechaRecurrente,
    }))
    if (correcto) {
      setMontoRecurrente('')
      setNotaRecurrente('')
    }
  }

  async function cambiarEstadoRecurrente(recurrente) {
    await ejecutar(() => supabase.from('movimientos_fijos')
      .update({ activo: !recurrente.activo })
      .eq('id', recurrente.id))
  }

  function descargarCsv() {
    const filas = [
      ['Fecha', 'Tipo', 'Categoría', 'Nota', 'Monto'],
      ...movimientos.map((movimiento) => [
        movimiento.fecha,
        movimiento.tipo,
        categorias.find((categoria) => categoria.id === movimiento.categoria_id)?.nombre || '',
        movimiento.nota || '',
        Number(movimiento.monto).toFixed(2),
      ]),
    ]
    const contenido = `\uFEFF${filas.map((fila) => fila.map(csvCelda).join(';')).join('\r\n')}`
    const enlace = document.createElement('a')
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
    enlace.href = url
    enlace.download = `raiz-de-oro-movimientos-${fechaLocal(new Date())}.csv`
    enlace.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function imprimirInforme() {
    const ventana = window.open('', '_blank')
    if (!ventana) {
      onError('El navegador bloqueó la ventana del informe. Permite ventanas emergentes e inténtalo de nuevo.')
      return
    }
    const filas = movimientos.map((movimiento) => `
      <tr>
        <td>${escaparHtml(movimiento.fecha)}</td>
        <td>${escaparHtml(movimiento.tipo)}</td>
        <td>${escaparHtml(categorias.find((categoria) => categoria.id === movimiento.categoria_id)?.nombre || '—')}</td>
        <td>${escaparHtml(movimiento.nota || '—')}</td>
        <td>${escaparHtml(dinero(movimiento.monto))}</td>
      </tr>`).join('')
    ventana.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe Raíz de Oro</title>
      <style>body{font:14px Arial,sans-serif;color:#25352e;padding:28px}h1{color:#315b43}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}th{background:#edf2e8}@media print{body{padding:0}}</style>
      <h1>Raíz de Oro</h1><p>Informe de movimientos · ${escaparHtml(fechaLocal(new Date()))}</p>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Nota</th><th>Monto</th></tr></thead><tbody>${filas}</tbody></table>
      <script>window.onload=()=>window.print()</script></html>`)
    ventana.document.close()
    onError('')
  }

  function eventosDelCalendario() {
    const anio = mesCalendario.getFullYear()
    const mes = mesCalendario.getMonth()
    const movimientosMes = movimientos
      .filter((movimiento) => {
        const fecha = new Date(`${movimiento.fecha}T00:00:00`)
        return fecha.getFullYear() === anio && fecha.getMonth() === mes
      })
      .map((movimiento) => ({
        fecha: movimiento.fecha,
        texto: `${movimiento.tipo === 'ingreso' ? '+' : '−'} ${dinero(movimiento.monto)}${movimiento.nota ? ` · ${movimiento.nota}` : ''}`,
        tipo: movimiento.tipo === 'ingreso' ? 'ingreso' : 'gasto',
      }))
    const fijosMes = recurrentes
      .filter((recurrente) => recurrente.activo)
      .filter((recurrente) => {
        const fecha = new Date(`${recurrente.proxima_fecha}T00:00:00`)
        return fecha.getFullYear() === anio && fecha.getMonth() === mes
      })
      .map((recurrente) => ({
        fecha: recurrente.proxima_fecha,
        texto: `Programado · ${dinero(recurrente.monto)}${recurrente.nota ? ` · ${recurrente.nota}` : ''}`,
        tipo: 'programado',
      }))
    const pagosMes = prestamos
      .filter((prestamo) => prestamo.estado === 'activo')
      .filter((prestamo) => {
        const fecha = new Date(`${prestamo.fecha_pago}T00:00:00`)
        return fecha.getFullYear() === anio && fecha.getMonth() === mes
      })
      .map((prestamo) => ({
        fecha: prestamo.fecha_pago,
        texto: `Vence préstamo · ${dinero(prestamo.pendiente)}`,
        tipo: 'prestamo',
      }))
    const metasMes = metas
      .filter((meta) => meta.fecha_limite)
      .filter((meta) => {
        const fecha = new Date(`${meta.fecha_limite}T00:00:00`)
        return fecha.getFullYear() === anio && fecha.getMonth() === mes
      })
      .map((meta) => ({ fecha: meta.fecha_limite, texto: `Meta · ${meta.nombre}`, tipo: 'meta' }))
    return [...movimientosMes, ...fijosMes, ...pagosMes, ...metasMes]
  }

  if (vista === 'presupuestos') {
    const categoriasGasto = categorias.filter((categoria) => categoria.tipo === 'gasto')
    const categoriasRecurrentes = categorias.filter((categoria) => categoria.tipo === tipoRecurrente)
    return (
      <section className="seccion" aria-labelledby="presupuestos-titulo">
        <div className="seccion-titulo">
          <div className="titulo-icono" aria-hidden="true">$</div>
          <div><h2 id="presupuestos-titulo">Presupuestos y movimientos recurrentes</h2><p>Organiza límites mensuales y programa ingresos o gastos habituales.</p></div>
        </div>
        {alertasPresupuesto.length > 0 && (
          <div className="alertas-presupuesto" aria-live="polite">
            {alertasPresupuesto.map((alerta) => (
              <p className={alerta.excedido ? 'alerta-presupuesto alerta-excedida' : 'alerta-presupuesto'} key={alerta.id}>
                <strong>{alerta.excedido ? 'Límite superado' : 'Cerca del límite'} · {alerta.nombre}</strong>
                <span> Has usado {Math.round(alerta.porcentaje)}% ({dinero(alerta.gastado)} de {dinero(alerta.limite)}).</span>
              </p>
            ))}
          </div>
        )}
        <div className="extras-dos-columnas">
          <div>
            <h3 className="extras-subtitulo">Presupuesto mensual por categoría</h3>
            <form className="formulario formulario-extra" onSubmit={guardarPresupuesto}>
              <label>Categoría de gasto
                <SelectorPersonalizado
                  ariaLabel="Categoría de gasto"
                  value={categoriaPresupuesto}
                  options={[
                    { value: '', label: 'Selecciona una categoría' },
                    ...categoriasGasto.map((categoria) => ({ value: categoria.id, label: categoria.nombre })),
                  ]}
                  onChange={setCategoriaPresupuesto}
                />
              </label>
              <label>Límite mensual
                <input type="text" inputMode="decimal" value={limitePresupuesto} onChange={(evento) => setLimitePresupuesto(evento.target.value)} placeholder="Ej. 500.000" required />
              </label>
              <button className="boton-primario" disabled={procesando}>Guardar límite</button>
            </form>
            {presupuestos.length === 0 ? <p className="extras-ayuda">Crea primero una categoría de gasto para definir un límite.</p> : (
              <div className="presupuestos-lista">
                {presupuestos.map((presupuesto) => {
                  const categoria = categorias.find((item) => item.id === presupuesto.categoria_id)
                  const gastado = gastosPorCategoria[presupuesto.categoria_id] || 0
                  const porcentaje = Math.min(gastado / Number(presupuesto.limite_mensual) * 100, 100)
                  return (
                    <article className="presupuesto-item" key={presupuesto.id}>
                      <div><strong>{categoria?.nombre || 'Categoría'}</strong><span>{dinero(gastado)} / {dinero(presupuesto.limite_mensual)}</span></div>
                      <progress value={porcentaje} max="100" aria-label={`Presupuesto de ${categoria?.nombre || 'categoría'}`} />
                      <small>{porcentaje >= 100 ? 'Límite alcanzado' : `Quedan ${dinero(Math.max(Number(presupuesto.limite_mensual) - gastado, 0))}`}</small>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
          <div>
            <h3 className="extras-subtitulo">Crear categoría</h3>
            <form className="formulario formulario-extra" onSubmit={crearCategoria}>
              <label>Nombre
                <input value={nombreCategoria} onChange={(evento) => setNombreCategoria(evento.target.value)} placeholder="Ej. Alimentación" required />
              </label>
              <label>Tipo
                <SelectorPersonalizado
                  ariaLabel="Tipo de categoría"
                  value={tipoCategoria}
                  options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }]}
                  onChange={setTipoCategoria}
                />
              </label>
              <button className="boton-secundario" disabled={procesando}>Añadir categoría</button>
            </form>
            <h3 className="extras-subtitulo extras-subtitulo-espaciado">Programar movimiento recurrente</h3>
            <form className="formulario formulario-extra" onSubmit={guardarRecurrente}>
              <label>Tipo
                <SelectorPersonalizado
                  ariaLabel="Tipo de movimiento recurrente"
                  value={tipoRecurrente}
                  options={[{ value: 'gasto', label: 'Gasto' }, { value: 'ingreso', label: 'Ingreso' }]}
                  onChange={(valor) => { setTipoRecurrente(valor); setCategoriaRecurrente('') }}
                />
              </label>
              <label>Monto
                <input type="text" inputMode="decimal" value={montoRecurrente} onChange={(evento) => setMontoRecurrente(evento.target.value)} placeholder="0,00" required />
              </label>
              <label>Categoría
                <SelectorPersonalizado
                  ariaLabel="Categoría recurrente"
                  value={categoriaRecurrente}
                  options={[
                    { value: '', label: 'Sin categoría' },
                    ...categoriasRecurrentes.map((categoria) => ({ value: categoria.id, label: categoria.nombre })),
                  ]}
                  onChange={setCategoriaRecurrente}
                />
              </label>
              <label>Frecuencia
                <SelectorPersonalizado
                  ariaLabel="Frecuencia recurrente"
                  value={periodoRecurrente}
                  options={[
                    { value: 'semanal', label: 'Semanal' },
                    { value: 'quincenal', label: 'Quincenal' },
                    { value: 'mensual', label: 'Mensual' },
                  ]}
                  onChange={setPeriodoRecurrente}
                />
              </label>
              <label>Primera fecha
                <input type="date" value={fechaRecurrente} onChange={(evento) => setFechaRecurrente(evento.target.value)} required />
              </label>
              <label>Nota <span className="opcional">· Opcional</span>
                <input value={notaRecurrente} onChange={(evento) => setNotaRecurrente(evento.target.value)} placeholder="Ej. Arriendo" />
              </label>
              <button className="boton-primario" disabled={procesando}>Programar</button>
            </form>
            <p className="extras-ayuda">La generación automática diaria requiere activar pg_cron en Supabase. Consulta el README para configurarlo.</p>
          </div>
        </div>
        <h3 className="extras-subtitulo extras-subtitulo-espaciado">Movimientos programados</h3>
        {recurrentes.length === 0 ? <p className="extras-ayuda">Aún no tienes movimientos recurrentes.</p> : (
          <div className="presupuestos-lista">
            {recurrentes.map((recurrente) => (
              <article className="recurrente-item" key={recurrente.id}>
                <div><strong>{recurrente.nota || ETIQUETAS_TIPO[recurrente.tipo]}</strong><span>{dinero(recurrente.monto)} · {recurrente.periodo} · Próximo: {recurrente.proxima_fecha}</span></div>
                <button type="button" className="boton-secundario" disabled={procesando} onClick={() => cambiarEstadoRecurrente(recurrente)}>
                  {recurrente.activo ? 'Pausar' : 'Reactivar'}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    )
  }

  if (vista === 'analisis') {
    return (
      <section className="seccion" aria-labelledby="analisis-titulo">
        <div className="seccion-titulo">
          <div className="titulo-icono" aria-hidden="true">↗</div>
          <div><h2 id="analisis-titulo">Análisis y alertas</h2><p>Compara ingresos y salidas de los últimos seis meses.</p></div>
        </div>
        <div className="alertas-presupuesto">
          {alertasPresupuesto.length === 0
            ? <p className="alerta-presupuesto alerta-informativa">No hay presupuestos cerca del límite este mes.</p>
            : alertasPresupuesto.map((alerta) => (
              <p className={alerta.excedido ? 'alerta-presupuesto alerta-excedida' : 'alerta-presupuesto'} key={alerta.id}>
                <strong>{alerta.excedido ? 'Límite superado' : 'Alerta de presupuesto'} · {alerta.nombre}</strong>
                <span> {Math.round(alerta.porcentaje)}% utilizado: {dinero(alerta.gastado)} de {dinero(alerta.limite)}.</span>
              </p>
            ))}
        </div>
        <div className="grafica-leyenda"><span><i className="grafica-ingresos" /> Ingresos</span><span><i className="grafica-gastos" /> Gastos y salidas</span></div>
        <div className="grafica-meses" role="img" aria-label="Gráfica de ingresos y gastos por mes">
          {datosGrafica.map((mes, indice) => (
            <div className="grafica-mes" key={`${mes.etiqueta}-${indice}`}>
              <div className="grafica-barras">
                <div className="grafica-barra grafica-ingresos" style={{ height: `${Math.max(mes.escalaIngresos * 100, 2)}%` }} title={`Ingresos ${mes.etiqueta}: ${dinero(mes.ingresos)}`} />
                <div className="grafica-barra grafica-gastos" style={{ height: `${Math.max(mes.escalaGastos * 100, 2)}%` }} title={`Gastos ${mes.etiqueta}: ${dinero(mes.gastos)}`} />
              </div>
              <strong>{mes.etiqueta}</strong>
              <small>+{dinero(mes.ingresos)}<br />−{dinero(mes.gastos)}</small>
            </div>
          ))}
        </div>
        <div className="extras-acciones">
          <button type="button" className="boton-secundario" onClick={descargarCsv}>Descargar Excel / CSV</button>
          <button type="button" className="boton-primario" onClick={imprimirInforme}>Imprimir o guardar como PDF</button>
        </div>
        <p className="extras-ayuda">El informe incluye hasta los últimos 1.000 movimientos cargados.</p>
      </section>
    )
  }

  if (vista === 'calendario') {
    const eventos = eventosDelCalendario()
    const desplazamientoLunes = (mesCalendario.getDay() + 6) % 7
    const diasEnMes = new Date(mesCalendario.getFullYear(), mesCalendario.getMonth() + 1, 0).getDate()
    const celdas = [...Array(desplazamientoLunes).fill(null), ...Array.from({ length: diasEnMes }, (_, indice) => indice + 1)]
    while (celdas.length % 7) celdas.push(null)
    const etiquetaMes = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(mesCalendario)
    const cambiarMes = (cantidad) => {
      setDireccionCalendario(cantidad < 0 ? 'anterior' : 'siguiente')
      setCambioCalendario((cambio) => cambio + 1)
      setMesCalendario(new Date(mesCalendario.getFullYear(), mesCalendario.getMonth() + cantidad, 1))
    }
    return (
      <section className="seccion" aria-labelledby="calendario-titulo">
        <div className="seccion-titulo">
          <div className="titulo-icono" aria-hidden="true">▦</div>
          <div><h2 id="calendario-titulo">Calendario financiero</h2><p>Movimientos, vencimientos de préstamos, metas y pagos programados.</p></div>
        </div>
        <div className="calendario-cabecera">
          <button className="boton-secundario" type="button" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}>←</button>
          <h3>{etiquetaMes}</h3>
          <button className="boton-secundario" type="button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}>→</button>
        </div>
        <div
          className={`calendario-grid calendario-cambio-${direccionCalendario}`}
          key={`${mesCalendario.getFullYear()}-${mesCalendario.getMonth()}-${cambioCalendario}`}
        >
          {DIAS_SEMANA.map((dia) => <strong className="calendario-dia-semana" key={dia}>{dia}</strong>)}
          {celdas.map((dia, indice) => {
            const fecha = dia ? fechaLocal(new Date(mesCalendario.getFullYear(), mesCalendario.getMonth(), dia)) : ''
            const delDia = eventos.filter((evento) => evento.fecha === fecha)
            return (
              <div className={`calendario-dia ${dia ? '' : 'calendario-dia-vacio'}`} key={`${fecha || 'vacio'}-${indice}`}>
                {dia && <strong>{dia}</strong>}
                {delDia.slice(0, 3).map((evento, eventoIndice) => <span className={`calendario-evento evento-${evento.tipo}`} title={evento.texto} key={`${evento.texto}-${eventoIndice}`}>{evento.texto}</span>)}
                {delDia.length > 3 && <small>+{delDia.length - 3} más</small>}
              </div>
            )
          })}
        </div>
        {eventos.length === 0 && <p className="extras-ayuda">No hay eventos financieros en este mes.</p>}
      </section>
    )
  }

  return null
}
