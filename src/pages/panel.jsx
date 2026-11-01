import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import FinanzasExtras from '../components/finanzas-extras'
import SelectorEstilo from '../components/selector-estilo'
import Logo from '../components/logo'
import SelectorPersonalizado from '../components/selector-personalizado'

// Cambia 'COP' por tu moneda si es otra (USD, MXN, etc.)
const dinero = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

const formatearMontoEntrada = (valor) => {
  const limpio = String(valor).replace(/[^\d,]/g, '')
  const separadorDecimal = limpio.indexOf(',')
  const parteEntera = (separadorDecimal === -1
    ? limpio
    : limpio.slice(0, separadorDecimal)
  ).replace(/\D/g, '')
  const parteDecimal = separadorDecimal === -1
    ? null
    : limpio.slice(separadorDecimal + 1).replace(/\D/g, '').slice(0, 2)
  const enteroAgrupado = parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return parteDecimal === null
    ? enteroAgrupado
    : `${enteroAgrupado},${parteDecimal}`
}

const parsearMontoEntrada = (valor) =>
  Number(String(valor).replace(/\./g, '').replace(',', '.'))

function reproducirSonidoGameOver() {
  const audio = new Audio('/game-over.mp3')
  audio.volume = .8
  audio.play().catch((error) => {
    console.warn('No se pudo reproducir el sonido de Game Over.', error)
  })
}

function reproducirSonidoStageClear() {
  const audio = new Audio('/stage-clear.mp3')
  audio.volume = .8
  audio.play().catch((error) => {
    console.warn('No se pudo reproducir el sonido de nivel completado.', error)
  })
}

const hoy = () => new Date().toLocaleDateString('en-CA') // AAAA-MM-DD en tu zona horaria

const ETIQUETAS = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  prestamo_dado: 'Préstamo dado',
  prestamo_recibido: 'Préstamo recibido',
  abono_recibido: 'Abono recibido',
  abono_pagado: 'Abono pagado',
  aporte_ahorro: 'Aporte a ahorro',
  retiro_ahorro: 'Retiro de ahorro',
}
const ENTRAN = ['ingreso', 'prestamo_recibido', 'abono_recibido', 'retiro_ahorro']
const ETIQUETAS_FRECUENCIA = {
  prestamo_dado: { texto: 'Préstamo', estilo: 'prestamo' },
  prestamo_recibido: { texto: 'Préstamo', estilo: 'prestamo' },
  abono_recibido: { texto: 'Abono de préstamo', estilo: 'abono' },
  abono_pagado: { texto: 'Abono de préstamo', estilo: 'abono' },
  aporte_ahorro: { texto: 'Meta de ahorro', estilo: 'ahorro' },
  retiro_ahorro: { texto: 'Meta de ahorro', estilo: 'ahorro' },
}

export default function Panel({ sesion, tema, onCambiarTema, estilo, onCambiarEstilo }) {
  const [seccionActiva, setSeccionActiva] = useState('resumen')
  const navegacionRef = useRef(null)
  const configuracionRef = useRef(null)
  const avatarInputRef = useRef(null)
  const [configuracionAbierta, setConfiguracionAbierta] = useState(false)
  const [perfilAbierto, setPerfilAbierto] = useState(false)
  const [configuracionCerrando, setConfiguracionCerrando] = useState(false)
  const [perfilCerrando, setPerfilCerrando] = useState(false)
  const [nombrePerfil, setNombrePerfil] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarArchivo, setAvatarArchivo] = useState(null)
  const [avatarVistaPrevia, setAvatarVistaPrevia] = useState('')
  const [avatarZoom, setAvatarZoom] = useState(1)
  const [guardandoAvatar, setGuardandoAvatar] = useState(false)
  const [indicadorNavegacion, setIndicadorNavegacion] = useState({ left: 6, width: 0 })
  const [horaActual, setHoraActual] = useState(() => new Date())
  const [saldo, setSaldo] = useState(0)
  const [movs, setMovs] = useState([])
  const [metas, setMetas] = useState([])
  const [prestamos, setPrestamos] = useState([])
  const [abonos, setAbonos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [recurrentes, setRecurrentes] = useState([])
  const [montosAbono, setMontosAbono] = useState({})
  const [tipo, setTipo] = useState('ingreso')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [frecuencia, setFrecuencia] = useState('variable')
  const [categoriaMovimiento, setCategoriaMovimiento] = useState('')
  const [nota, setNota] = useState('')
  const [nombreMeta, setNombreMeta] = useState('')
  const [objetivoMeta, setObjetivoMeta] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [montosAhorro, setMontosAhorro] = useState({})
  const [procesandoAhorro, setProcesandoAhorro] = useState(false)
  const [correoPrestamo, setCorreoPrestamo] = useState('')
  const [montoPrestamo, setMontoPrestamo] = useState('')
  const [interesPrestamo, setInteresPrestamo] = useState('0')
  const [fechaPagoPrestamo, setFechaPagoPrestamo] = useState('')
  const [procesandoPrestamo, setProcesandoPrestamo] = useState(false)
  const [metaCompletada, setMetaCompletada] = useState(null)
  const [gameOver, setGameOver] = useState(false)
  const saldoAnterior = useRef(null)
  const metasCompletadasIniciales = useRef(null)
  const metasProcesadas = useRef(new Set())
  const [buscarMovimiento, setBuscarMovimiento] = useState('')
  const [filtroTipoMovimiento, setFiltroTipoMovimiento] = useState('')
  const [desdeMovimiento, setDesdeMovimiento] = useState('')
  const [hastaMovimiento, setHastaMovimiento] = useState('')
  const [error, setError] = useState('')

  const cerrarConfiguracion = () => {
    setConfiguracionAbierta(false)
    setConfiguracionCerrando(true)
    window.setTimeout(() => setConfiguracionCerrando(false), 220)
  }

  const cerrarPerfil = () => {
    setPerfilAbierto(false)
    setPerfilCerrando(true)
    window.setTimeout(() => setPerfilCerrando(false), 220)
  }

  useLayoutEffect(() => {
    const actualizarIndicador = () => {
      const nav = navegacionRef.current
      const activo = nav?.querySelector('.navegacion-activa')
      if (!nav || !activo) return
      setIndicadorNavegacion({
        left: activo.offsetLeft,
        width: activo.offsetWidth,
      })
    }

    actualizarIndicador()
    window.addEventListener('resize', actualizarIndicador)
    return () => window.removeEventListener('resize', actualizarIndicador)
  }, [seccionActiva])

  useEffect(() => {
    const metasListas = new Map(
      metas
        .filter((meta) => meta.desbloqueada)
        .map((meta) => [meta.id, meta.nombre])
    )
    if (metasCompletadasIniciales.current === null) {
      metasCompletadasIniciales.current = metasListas
      return
    }
    const nuevaMeta = [...metasListas].find(([id]) => !metasCompletadasIniciales.current.has(id))
    metasCompletadasIniciales.current = metasListas
    if (nuevaMeta && estilo === 'arcade') {
      setMetaCompletada({ id: nuevaMeta[0], nombre: nuevaMeta[1] })
    }
  }, [metas, estilo])

  useEffect(() => {
    if (metaCompletada && estilo === 'arcade') reproducirSonidoStageClear()
  }, [metaCompletada, estilo])

  useEffect(() => {
    const saldoActual = Number(saldo)
    if (!Number.isFinite(saldoActual)) return
    if (saldoAnterior.current !== null &&
      saldoAnterior.current > 0 &&
      saldoActual <= 0 &&
      estilo === 'arcade') {
      setGameOver(true)
      reproducirSonidoGameOver()
    }
    saldoAnterior.current = saldoActual
  }, [saldo, estilo])

  const cargar = useCallback(async () => {
    const [s, m, a, p, b, c, pr, f] = await Promise.all([
      supabase.rpc('mi_saldo'),
      supabase
        .from('movimientos')
        .select('*')
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false })
        .limit(1000),
      supabase.from('v_metas').select('*').order('creado_en', { ascending: false }),
      supabase.from('v_prestamos').select('*').order('creado_en', { ascending: false }),
      supabase
        .from('abonos_prestamo')
        .select('id, prestamo_id, monto, fecha, confirmado, creado_en')
        .order('creado_en', { ascending: false }),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('presupuestos').select('*').order('creado_en', { ascending: false }),
      supabase.from('movimientos_fijos').select('*').order('proxima_fecha'),
    ])
    if (pr.error && (
      pr.error.code === 'PGRST205' ||
      (pr.error.message.includes('presupuestos') && pr.error.message.includes('schema cache'))
    )) {
      setError(
        'Supabase aún no encuentra la tabla de presupuestos. Ejecuta bases_de_datos/mejoras_finanzas.sql en Supabase > SQL Editor y vuelve a cargar la página.'
      )
      return
    }
    if (s.error || m.error || a.error || p.error || b.error || c.error || pr.error || f.error) {
      setError((s.error || m.error || a.error || p.error || b.error || c.error || pr.error || f.error).message)
      return
    }
    const usuariosIds = [...new Set(p.data.flatMap((prestamo) => [
      prestamo.prestamista_id,
      prestamo.deudor_id,
    ]))]
    let correosPorId = {}
    if (usuariosIds.length > 0) {
      const { data: perfiles, error: errorPerfiles } = await supabase
        .from('perfiles')
        .select('id, correo')
        .in('id', usuariosIds)
      if (errorPerfiles) {
        setError(errorPerfiles.message)
        return
      }
      correosPorId = Object.fromEntries(perfiles.map((perfil) => [perfil.id, perfil.correo]))
    }
    setSaldo(Number(s.data))
    setMovs(m.data)
    setMetas(a.data)
    setAbonos(b.data)
    setCategorias(c.data)
    setPresupuestos(pr.data)
    setRecurrentes(f.data)
    setPrestamos(p.data.map((prestamo) => ({
      ...prestamo,
      correo_prestamista: correosPorId[prestamo.prestamista_id],
      correo_deudor: correosPorId[prestamo.deudor_id],
    })))
  }, [])

  useEffect(() => {
    const pendientes = metas.filter((meta) =>
      meta.desbloqueada && !metasProcesadas.current.has(meta.id)
    )
    if (pendientes.length === 0) return
    pendientes.forEach((meta) => metasProcesadas.current.add(meta.id))
    const completarMetas = async () => {
      for (const meta of pendientes) {
        const { error } = await supabase.rpc('completar_meta_ahorro', {
          p_meta: meta.id,
          p_fecha: hoy(),
        })
        if (error) {
          pendientes.forEach((pendiente) => metasProcesadas.current.delete(pendiente.id))
          setError(error.message)
          return
        }
        if (estilo === 'arcade') setMetaCompletada({ id: meta.id, nombre: meta.nombre })
      }
      await cargar()
    }
    completarMetas()
  }, [metas, estilo, cargar])

  useEffect(() => {
    const cargarInicial = async () => {
      await cargar()
    }
    cargarInicial()
  }, [cargar])

  useEffect(() => {
    const intervalo = window.setInterval(() => setHoraActual(new Date()), 1000)
    return () => window.clearInterval(intervalo)
  }, [])

  useEffect(() => {
    if (!configuracionAbierta && !perfilAbierto) return undefined

    const cerrarAlHacerClickFuera = (evento) => {
      if (!configuracionRef.current?.contains(evento.target)) {
        if (configuracionAbierta) cerrarConfiguracion()
        if (perfilAbierto) cerrarPerfil()
      }
    }

    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape') {
        if (configuracionAbierta) cerrarConfiguracion()
        if (perfilAbierto) cerrarPerfil()
      }
    }

    document.addEventListener('pointerdown', cerrarAlHacerClickFuera)
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.removeEventListener('pointerdown', cerrarAlHacerClickFuera)
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [configuracionAbierta, perfilAbierto])

  useEffect(() => {
    const cargarAvatar = async () => {
      const { data, error: errorPerfil } = await supabase
        .from('perfiles')
        .select('nombre, avatar_url')
        .eq('id', sesion.user.id)
        .single()
      if (errorPerfil && errorPerfil.code !== 'PGRST116') {
        if (errorPerfil.code === 'PGRST204' || errorPerfil.message.includes('avatar_url')) {
          const { data: perfilBasico, error: errorPerfilBasico } = await supabase
            .from('perfiles')
            .select('nombre')
            .eq('id', sesion.user.id)
            .single()
          if (errorPerfilBasico && errorPerfilBasico.code !== 'PGRST116') {
            setError(errorPerfilBasico.message)
            return
          }
          setNombrePerfil(perfilBasico?.nombre || '')
          return
        }
        setError(errorPerfil.message)
        return
      }
      setNombrePerfil(data?.nombre || '')
      setAvatarUrl(data?.avatar_url || '')
    }
    cargarAvatar()
  }, [sesion.user.id])

  function seleccionarAvatar(evento) {
    const archivo = evento.target.files?.[0]
    if (!archivo) return
    if (!archivo.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.')
      return
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar los 5 MB.')
      return
    }
    setError('')
    setAvatarArchivo(archivo)
    setAvatarVistaPrevia(URL.createObjectURL(archivo))
    setAvatarZoom(1)
  }

  async function guardarAvatar() {
    if (!avatarArchivo) return
    setGuardandoAvatar(true)
    setError('')
    try {
      const imagen = new Image()
      imagen.src = avatarVistaPrevia
      await new Promise((resolver, rechazar) => {
        imagen.onload = resolver
        imagen.onerror = rechazar
      })
      const lado = Math.min(imagen.naturalWidth, imagen.naturalHeight) / avatarZoom
      const origenX = (imagen.naturalWidth - lado) / 2
      const origenY = (imagen.naturalHeight - lado) / 2
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const contexto = canvas.getContext('2d')
      if (!contexto) throw new Error('No se pudo preparar el recorte de la imagen.')
      contexto.imageSmoothingEnabled = true
      contexto.imageSmoothingQuality = 'high'
      contexto.drawImage(imagen, origenX, origenY, lado, lado, 0, 0, 512, 512)
      const blob = await new Promise((resolver) => canvas.toBlob(resolver, 'image/webp', .86))
      if (!blob) throw new Error('No se pudo preparar la imagen.')
      const ruta = `${sesion.user.id}/avatar.webp`
      const { error: errorSubida } = await supabase.storage
        .from('avatars')
        .upload(ruta, blob, { contentType: 'image/webp', upsert: true })
      if (errorSubida) throw errorSubida
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(ruta)
      const url = `${urlData.publicUrl}?v=${Date.now()}`
      const { error: errorPerfil } = await supabase
        .from('perfiles')
        .update({ avatar_url: url })
        .eq('id', sesion.user.id)
      if (errorPerfil) {
        if (errorPerfil.code === 'PGRST204' || errorPerfil.message.includes('avatar_url')) {
          throw new Error(
            'Falta aplicar la migración de avatar. Ejecuta bases_de_datos/mejoras_finanzas.sql en Supabase > SQL Editor.'
          )
        }
        throw errorPerfil
      }
      setAvatarUrl(url)
      setAvatarArchivo(null)
      setAvatarVistaPrevia('')
    } catch (errorAvatar) {
      setError(errorAvatar.message || 'No se pudo guardar la foto de perfil.')
    } finally {
      setGuardandoAvatar(false)
    }
  }

  async function eliminarAvatar() {
    if (!avatarUrl || !window.confirm('¿Quieres eliminar tu foto de perfil?')) return
    setGuardandoAvatar(true)
    setError('')
    try {
      const { error: errorPerfil } = await supabase
        .from('perfiles')
        .update({ avatar_url: null })
        .eq('id', sesion.user.id)
      if (errorPerfil) {
        if (errorPerfil.code === 'PGRST204' || errorPerfil.message.includes('avatar_url')) {
          throw new Error(
            'Falta aplicar la migración de avatar. Ejecuta bases_de_datos/mejoras_finanzas.sql en Supabase > SQL Editor.'
          )
        }
        throw errorPerfil
      }
      const { error: errorBorrado } = await supabase.storage
        .from('avatars')
        .remove([`${sesion.user.id}/avatar.webp`])
      if (errorBorrado) throw errorBorrado
      setAvatarUrl('')
      setAvatarArchivo(null)
      setAvatarVistaPrevia('')
    } catch (errorAvatar) {
      setError(errorAvatar.message || 'No se pudo eliminar la foto de perfil.')
    } finally {
      setGuardandoAvatar(false)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    const montoMovimiento = parsearMontoEntrada(monto)
    if (!Number.isFinite(montoMovimiento) || montoMovimiento <= 0) {
      return setError('El monto debe ser mayor a cero.')
    }
    const { error } = await supabase.from('movimientos').insert({
      usuario_id: sesion.user.id,
      tipo,
      monto: montoMovimiento,
      fecha,
      frecuencia,
      categoria_id: categoriaMovimiento || null,
      nota: nota || null,
    })
    if (error) return setError(error.message)
    setMonto('')
    setNota('')
    setCategoriaMovimiento('')
    cargar()
  }

  async function crearMeta(e) {
    e.preventDefault()
    setError('')
    const objetivo = parsearMontoEntrada(objetivoMeta)
    if (!nombreMeta.trim()) return setError('Escribe un nombre para la meta.')
    if (!Number.isFinite(objetivo) || objetivo <= 0) {
      return setError('El objetivo debe ser mayor a cero.')
    }
    const { error } = await supabase.from('metas_ahorro').insert({
      usuario_id: sesion.user.id,
      nombre: nombreMeta.trim(),
      objetivo,
      fecha_limite: fechaLimite || null,
    })
    if (error) return setError(error.message)
    setNombreMeta('')
    setObjetivoMeta('')
    setFechaLimite('')
    cargar()
  }

  function cambiarMontoAhorro(metaId, valor) {
    setMontosAhorro((actuales) => ({ ...actuales, [metaId]: valor }))
  }

  async function moverAhorro(e, meta, accion) {
    e.preventDefault()
    setError('')
    const montoAhorro = parsearMontoEntrada(montosAhorro[meta.id])
    if (!Number.isFinite(montoAhorro) || montoAhorro <= 0) {
      return setError('El monto debe ser mayor a cero.')
    }
    const completaMeta = accion === 'aportar' &&
      !meta.desbloqueada &&
      Number(meta.ahorrado) + montoAhorro >= Number(meta.objetivo)
    setProcesandoAhorro(true)
    const { error } = await supabase.rpc(
      accion === 'aportar' ? 'aportar_ahorro' : 'retirar_ahorro',
      {
        p_meta: meta.id,
        p_monto: montoAhorro,
        p_fecha: hoy(),
      }
    )
    setProcesandoAhorro(false)
    if (error) return setError(error.message)
    cambiarMontoAhorro(meta.id, '')
    if (completaMeta && estilo === 'arcade') {
      setMetaCompletada({ id: meta.id, nombre: meta.nombre })
    }
    await cargar()
  }

  async function solicitarPrestamo(e) {
    e.preventDefault()
    setError('')
    const montoSolicitado = parsearMontoEntrada(montoPrestamo)
    const interes = Number(interesPrestamo)
    if (!Number.isFinite(montoSolicitado) || montoSolicitado <= 0) {
      return setError('El monto del préstamo debe ser mayor a cero.')
    }
    if (!Number.isFinite(interes) || interes < 0) {
      return setError('El interés no puede ser negativo.')
    }
    setProcesandoPrestamo(true)
    const { error } = await supabase.rpc('solicitar_prestamo', {
      p_correo: correoPrestamo.trim(),
      p_monto: montoSolicitado,
      p_interes: interes,
      p_fecha_pago: fechaPagoPrestamo,
    })
    setProcesandoPrestamo(false)
    if (error) return setError(error.message)
    setCorreoPrestamo('')
    setMontoPrestamo('')
    setInteresPrestamo('0')
    setFechaPagoPrestamo('')
    await cargar()
  }

  async function registrarAbono(e, prestamo) {
    e.preventDefault()
    setError('')
    const montoAbono = parsearMontoEntrada(montosAbono[prestamo.id])
    if (!Number.isFinite(montoAbono) || montoAbono <= 0) {
      return setError('El monto del abono debe ser mayor a cero.')
    }
    if (montoAbono > Number(prestamo.pendiente)) {
      return setError(`El abono no puede superar el saldo pendiente de ${dinero(prestamo.pendiente)}.`)
    }
    setProcesandoPrestamo(true)
    const { error } = await supabase.rpc('registrar_abono', {
      p_prestamo: prestamo.id,
      p_monto: montoAbono,
      p_fecha: hoy(),
    })
    setProcesandoPrestamo(false)
    if (error) return setError(error.message)
    setMontosAbono((actuales) => ({ ...actuales, [prestamo.id]: '' }))
    await cargar()
  }

  async function confirmarAbono(abonoId) {
    setError('')
    setProcesandoPrestamo(true)
    const { error } = await supabase.rpc('confirmar_abono', { p_abono: abonoId })
    setProcesandoPrestamo(false)
    if (error) return setError(error.message)
    await cargar()
  }

  async function responderPrestamo(prestamo, accion) {
    setError('')
    setProcesandoPrestamo(true)
    const { error } = await supabase.rpc(
      accion === 'aceptar' ? 'aceptar_prestamo' : 'rechazar_prestamo',
      { p_prestamo: prestamo.id }
    )
    setProcesandoPrestamo(false)
    if (error) return setError(error.message)
    await cargar()
  }

  const totalAhorrado = metas.reduce((total, meta) => total + Number(meta.ahorrado), 0)
  const totalIngresos = movs
    .filter((movimiento) => movimiento.tipo === 'ingreso')
    .reduce((total, movimiento) => total + Number(movimiento.monto), 0)
  const totalGastos = movs
    .filter((movimiento) => movimiento.tipo === 'gasto')
    .reduce((total, movimiento) => total + Number(movimiento.monto), 0)
  const escalaOrganismo = Math.min(1, Math.max(.18, totalIngresos / Math.max(totalIngresos + totalGastos, 1)))
  const ramificacionesOrganismo = Math.min(5, Math.max(1, Math.ceil(totalGastos / Math.max(totalIngresos, 1) * 4)))
  const estructurasAhorro = Math.min(5, Math.max(1, metas.length))
  const metasCompletadas = metas.filter((meta) => meta.desbloqueada).length
  const fechaMinimaPrestamo = hoy()
  const movimientosFiltrados = movs.filter((movimiento) => {
    const termino = buscarMovimiento.trim().toLocaleLowerCase('es-CO')
    const textoMovimiento = [
      ETIQUETAS[movimiento.tipo],
      movimiento.nota || '',
      movimiento.fecha,
      movimiento.monto,
      dinero(movimiento.monto),
    ].join(' ').toLocaleLowerCase('es-CO')
    return (
      (!termino || textoMovimiento.includes(termino)) &&
      (!filtroTipoMovimiento || movimiento.tipo === filtroTipoMovimiento) &&
      (!desdeMovimiento || movimiento.fecha >= desdeMovimiento) &&
      (!hastaMovimiento || movimiento.fecha <= hastaMovimiento)
    )
  })
  const hayFiltrosMovimiento = Boolean(
    buscarMovimiento || filtroTipoMovimiento || desdeMovimiento || hastaMovimiento
  )
  const partesNombre = (nombrePerfil || sesion.user.email).trim().split(/\s+/).filter(Boolean)
  const nombreVisible = partesNombre.slice(0, Math.min(partesNombre.length, 2)).join(' ')

  function limpiarFiltrosMovimiento() {
    setBuscarMovimiento('')
    setFiltroTipoMovimiento('')
    setDesdeMovimiento('')
    setHastaMovimiento('')
  }

  return (
    <main className="dashboard">
      <header className="app-header">
        <a className="marca" href="/" aria-label="Raíz de Oro, inicio">
          <Logo />
        </a>
        <div className="usuario" ref={configuracionRef}>
          <div className="usuario-cabecera">
            <div className="usuario-identidad">
              <button
                className="usuario-avatar"
                type="button"
                onClick={() => {
                  if (perfilAbierto) {
                    cerrarPerfil()
                  } else {
                    setPerfilCerrando(false)
                    setPerfilAbierto(true)
                    if (configuracionAbierta) cerrarConfiguracion()
                  }
                }}
                aria-label="Abrir perfil y cambiar foto"
                aria-expanded={perfilAbierto}
              >
                {avatarUrl ? <img src={avatarUrl} alt="" /> : '🤖'}
              </button>
              <span className="usuario-email">{nombreVisible}</span>
            </div>
            <button
              className="boton-configuracion"
              type="button"
              onClick={() => {
                if (configuracionAbierta) {
                  cerrarConfiguracion()
                } else {
                  setConfiguracionCerrando(false)
                  setConfiguracionAbierta(true)
                  if (perfilAbierto) cerrarPerfil()
                }
              }}
              aria-expanded={configuracionAbierta}
              aria-controls="menu-configuracion"
              aria-label="Abrir configuración"
              title="Configuración"
            >
              <span aria-hidden="true">⚙</span>
            </button>
          </div>
          {(configuracionAbierta || configuracionCerrando) && (
            <div className={`menu-configuracion${configuracionCerrando ? ' menu-cerrando' : ''}`} id="menu-configuracion">
              <span className="menu-configuracion-titulo">Preferencias</span>
              <SelectorEstilo estilo={estilo} onCambiarEstilo={onCambiarEstilo} />
              <button
                className="boton-tema"
                type="button"
                onClick={onCambiarTema}
                aria-label="Modo oscuro"
                aria-pressed={tema === 'oscuro'}
                title={tema === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'}
              >
                <span aria-hidden="true">{tema === 'claro' ? '☾' : '☀'}</span>
                <span>{tema === 'claro' ? 'Modo oscuro' : 'Modo claro'}</span>
              </button>
              <button className="boton-salir" onClick={() => supabase.auth.signOut()}>
                Cerrar sesión
              </button>
            </div>
          )}
          {(perfilAbierto || perfilCerrando) && (
            <div className={`menu-perfil${perfilCerrando ? ' menu-cerrando' : ''}`}>
              <strong>Foto de perfil</strong>
              <div className="avatar-recorte">
                {avatarVistaPrevia || avatarUrl
                  ? <img src={avatarVistaPrevia || avatarUrl} alt="Vista previa del avatar" style={{ transform: `scale(${avatarZoom})` }} />
                  : <span aria-hidden="true">🤖</span>}
              </div>
              <button type="button" className="boton-secundario" onClick={() => avatarInputRef.current?.click()}>
                Elegir imagen
              </button>
              <input ref={avatarInputRef} className="avatar-input" type="file" accept="image/*" onChange={seleccionarAvatar} />
              {avatarArchivo && (
                <>
                  <label className="avatar-zoom">
                    Zoom
                    <input type="range" min="1" max="2.5" step=".1" value={avatarZoom} onChange={(evento) => setAvatarZoom(Number(evento.target.value))} />
                  </label>
                  <button type="button" className="boton-primario" disabled={guardandoAvatar} onClick={guardarAvatar}>
                    {guardandoAvatar ? 'Guardando...' : 'Guardar foto'}
                  </button>
                </>
              )}
              {avatarUrl && !avatarArchivo && (
                <button type="button" className="boton-eliminar" disabled={guardandoAvatar} onClick={eliminarAvatar}>
                  {guardandoAvatar ? 'Eliminando...' : 'Eliminar foto'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="bienvenida">
        <div>
          <p className="sobrelinea">TU RESUMEN FINANCIERO</p>
          <h1>Tu dinero, más claro.</h1>
          <p className="bienvenida-texto">Un paso a la vez, tus metas están más cerca.</p>
        </div>
        <div className="fecha-hoy">
          <span className="punto-activo" />
          <span>
            {new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(horaActual)}
            <time className="reloj-tiempo-real" dateTime={horaActual.toISOString()}>
              {new Intl.DateTimeFormat('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }).format(horaActual)}
            </time>
          </span>
        </div>
      </section>

      <nav ref={navegacionRef} className="navegacion-panel" aria-label="Secciones de finanzas">
        <span
          className="navegacion-indicador"
          aria-hidden="true"
          style={{
            width: `${indicadorNavegacion.width}px`,
            transform: `translateX(${indicadorNavegacion.left}px)`,
          }}
        />
        {[
          { id: 'resumen', texto: 'Resumen', icono: '⌂' },
          { id: 'movimientos', texto: 'Movimientos', icono: '＋' },
          { id: 'presupuestos', texto: 'Presupuestos', icono: '$' },
          { id: 'analisis', texto: 'Análisis', icono: '↗' },
          { id: 'calendario', texto: 'Calendario', icono: '▦' },
          { id: 'ahorro', texto: 'Ahorro', icono: '✦' },
          { id: 'prestamos', texto: 'Préstamos', icono: '↗' },
          { id: 'historial', texto: 'Historial', icono: '↕' },
        ].map((item) => (
          <button
            type="button"
            className={`navegacion-item ${seccionActiva === item.id ? 'navegacion-activa' : ''}`}
            aria-current={seccionActiva === item.id ? 'page' : undefined}
            key={item.id}
            onClick={() => setSeccionActiva(item.id)}
          >
            <span aria-hidden="true">{item.icono}</span>
          <span>{item.texto}</span>
          </button>
        ))}
      </nav>

      {seccionActiva === 'resumen' && (
        <section className="resumen" aria-label="Resumen de finanzas">
        <article className="resumen-card resumen-principal">
          <span className="resumen-etiqueta">Disponible en tu bolsa</span>
          <strong>{dinero(saldo)}</strong>
          <span className="resumen-ayuda">Saldo listo para tus movimientos</span>
          <span className="resumen-decoracion" aria-hidden="true">$</span>
        </article>
        <article className="resumen-card">
          <span className="resumen-icono icono-verde" aria-hidden="true">↗</span>
          <span className="resumen-etiqueta">Ahorro protegido</span>
          <strong>{dinero(totalAhorrado)}</strong>
          <span className="resumen-ayuda">Dinero guardado en tus metas</span>
        </article>
        <article className="resumen-card">
          <span className="resumen-icono icono-azul" aria-hidden="true">◎</span>
          <span className="resumen-etiqueta">Metas cumplidas</span>
          <strong>{metasCompletadas}<small> / {metas.length}</small></strong>
          <span className="resumen-ayuda">Objetivos que ya alcanzaste</span>
        </article>
        <article
          className="organismo-vivo"
          aria-label="Visualización viva del equilibrio entre ingresos, gastos y ahorro"
          style={{
            '--living-growth': escalaOrganismo,
            '--living-branches': ramificacionesOrganismo,
            '--living-savings': estructurasAhorro,
          }}
        >
          <div className="organismo-cabecera">
            <div>
              <span className="resumen-etiqueta">Sistema en evolución</span>
              <h2>Tu ritmo financiero</h2>
            </div>
            <span className="organismo-estado" aria-hidden="true">vivo</span>
          </div>
          <div className="organismo-canvas" aria-hidden="true">
            <span className="organismo-nucleo" />
            <span className="organismo-flujo organismo-flujo-uno" />
            <span className="organismo-flujo organismo-flujo-dos" />
            {Array.from({ length: ramificacionesOrganismo }, (_, indice) => (
              <span className={`organismo-rama organismo-rama-${indice + 1}`} key={indice} />
            ))}
            {Array.from({ length: estructurasAhorro }, (_, indice) => (
              <span className={`organismo-semilla organismo-semilla-${indice + 1}`} key={`semilla-${indice}`} />
            ))}
          </div>
          <p>Los ingresos alimentan el núcleo, los gastos se distribuyen y cada meta deja una nueva forma.</p>
        </article>
        </section>
      )}

      {error && <p className="error aviso-error" role="alert">{error}</p>}

      {seccionActiva === 'movimientos' && (
        <section className="seccion" aria-labelledby="movimiento-titulo">
        <div className="seccion-titulo">
          <div className="titulo-icono" aria-hidden="true">＋</div>
          <div>
            <h2 id="movimiento-titulo">Registrar movimiento</h2>
            <p>Agrega un ingreso o un gasto a tu bolsa.</p>
          </div>
        </div>
        <form onSubmit={guardar} className="formulario formulario-movimiento">
          <label>
            Tipo de movimiento
            <SelectorPersonalizado
              ariaLabel="Tipo de movimiento"
              value={tipo}
              options={[{ value: 'ingreso', label: 'Ingreso' }, { value: 'gasto', label: 'Gasto' }]}
              onChange={setTipo}
            />
          </label>
          <label>
            Monto
            <input
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(formatearMontoEntrada(e.target.value))}
              placeholder="0,00"
              required
            />
          </label>
          <label>
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </label>
          <label>
            Frecuencia
            <SelectorPersonalizado
              ariaLabel="Frecuencia"
              value={frecuencia}
              options={[{ value: 'variable', label: 'Variable' }, { value: 'fijo', label: 'Fijo' }]}
              onChange={setFrecuencia}
            />
          </label>
          <label>
            Categoría <span className="opcional">· Opcional</span>
            <SelectorPersonalizado
              ariaLabel="Categoría"
              value={categoriaMovimiento}
              options={[
                { value: '', label: 'Sin categoría' },
                ...categorias
                  .filter((categoria) => categoria.tipo === tipo)
                  .map((categoria) => ({ value: categoria.id, label: categoria.nombre })),
              ]}
              onChange={setCategoriaMovimiento}
            />
          </label>
          <label className="campo-nota">
            Nota <span className="opcional">· Opcional</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿De qué se trata?" />
          </label>
          <button className="boton-primario">Guardar movimiento <span aria-hidden="true">→</span></button>
        </form>
        </section>
      )}

      {seccionActiva === 'ahorro' && (
        <section className="seccion" aria-labelledby="ahorro-titulo">
        <div className="seccion-titulo seccion-ahorro-titulo">
          <div className="titulo-icono icono-ahorro" aria-hidden="true">✦</div>
          <div>
            <h2 id="ahorro-titulo">Ahorro protegido</h2>
            <p>El dinero de tus metas queda bloqueado hasta alcanzar el objetivo.</p>
          </div>
        </div>

        <form onSubmit={crearMeta} className="formulario formulario-meta">
          <label>
            Nombre de la meta
            <input
              value={nombreMeta}
              onChange={(e) => setNombreMeta(e.target.value)}
              placeholder="Ej. Viaje, computador..."
              required
            />
          </label>
          <label>
            ¿Cuánto quieres ahorrar?
            <input
              type="text"
              inputMode="decimal"
              value={objetivoMeta}
              onChange={(e) => setObjetivoMeta(formatearMontoEntrada(e.target.value))}
              placeholder="0,00"
              required
            />
          </label>
          <label>
            Fecha límite <span className="opcional">· Opcional</span>
            <input
              type="date"
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
            />
          </label>
          <button className="boton-primario">＋ Crear meta</button>
        </form>

        {metas.length === 0 ? (
          <div className="estado-vacio">
            <span className="vacio-icono" aria-hidden="true">✦</span>
            <strong>Tu próxima meta empieza aquí</strong>
            <p>Crea una meta arriba y empieza a guardar para lo que más te importa.</p>
          </div>
        ) : (
          <div className="metas">
            {metas.map((meta) => {
              const ahorrado = Number(meta.ahorrado)
              const objetivo = Number(meta.objetivo)
              const porcentaje = Math.min((ahorrado / objetivo) * 100, 100)
              const desbloqueada = meta.desbloqueada

              return (
                <article className="meta" key={meta.id}>
                  <div className="meta-cabecera">
                    <div className="meta-identidad">
                      <span className="meta-icono" aria-hidden="true">✦</span>
                      <div>
                        <h3>{meta.nombre}</h3>
                        {meta.fecha_limite && <small>Fecha límite: {meta.fecha_limite}</small>}
                      </div>
                    </div>
                    <span className={`meta-estado ${desbloqueada ? 'estado-listo' : ''}`}>
                      <span aria-hidden="true">{desbloqueada ? '✓' : '⌑'}</span>
                      {desbloqueada ? 'Meta alcanzada' : 'Ahorro bloqueado'}
                    </span>
                  </div>
                  <div className="meta-montos">
                    <strong>{dinero(ahorrado)}</strong>
                    <span>de {dinero(objetivo)}</span>
                    <span className="meta-porcentaje">{Math.round(porcentaje)}%</span>
                  </div>
                  <progress value={porcentaje} max="100" aria-label={`Progreso de ${meta.nombre}`} />
                  <p className="meta-mensaje">
                    {desbloqueada
                      ? '¡Lo lograste! Ya puedes retirar este ahorro.'
                      : `Te faltan ${dinero(Math.max(objetivo - ahorrado, 0))} para desbloquearlo.`}
                  </p>
                  <form className="formulario-meta-accion" onSubmit={(e) => moverAhorro(e, meta, 'aportar')}>
                    <label>
                      Monto para aportar
                      <input
                        type="text"
                        inputMode="decimal"
                        value={montosAhorro[meta.id] || ''}
                        onChange={(e) => cambiarMontoAhorro(meta.id, formatearMontoEntrada(e.target.value))}
                        placeholder="0,00"
                        required
                      />
                    </label>
                    <button className="boton-primario" disabled={procesandoAhorro}>
                      {procesandoAhorro ? 'Procesando...' : 'Aportar'}
                    </button>
                    {desbloqueada && (
                      <button
                        type="button"
                        className="boton-secundario"
                        disabled={procesandoAhorro}
                        onClick={(e) => moverAhorro(e, meta, 'retirar')}
                      >
                        Retirar
                      </button>
                    )}
                  </form>
                </article>
              )
            })}
          </div>
        )}
        </section>
      )}

      {seccionActiva === 'prestamos' && (
        <section className="seccion" aria-labelledby="prestamos-titulo">
        <div className="seccion-titulo seccion-ahorro-titulo">
          <div className="titulo-icono icono-prestamo" aria-hidden="true">↗</div>
          <div>
            <h2 id="prestamos-titulo">Préstamos</h2>
            <p>
              Envía una solicitud a otro usuario. El dinero solo saldrá de tu bolsa cuando
              esa persona acepte.
            </p>
          </div>
        </div>
        <form onSubmit={solicitarPrestamo} className="formulario formulario-prestamo">
          <label>
            Correo del usuario
            <input
              type="email"
              value={correoPrestamo}
              onChange={(e) => setCorreoPrestamo(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
            />
          </label>
          <label>
            Monto a prestar
            <input
              type="text"
              inputMode="decimal"
              value={montoPrestamo}
              onChange={(e) => setMontoPrestamo(formatearMontoEntrada(e.target.value))}
              placeholder="0,00"
              required
            />
          </label>
          <label>
            Interés (%)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={interesPrestamo}
              onChange={(e) => setInteresPrestamo(e.target.value)}
              required
            />
          </label>
          <label>
            Fecha de pago
            <input
              type="date"
              min={fechaMinimaPrestamo}
              value={fechaPagoPrestamo}
              onChange={(e) => setFechaPagoPrestamo(e.target.value)}
              required
            />
          </label>
          <button className="boton-primario" disabled={procesandoPrestamo}>
            {procesandoPrestamo ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>

        {prestamos.length === 0 ? (
          <div className="estado-vacio estado-prestamos-vacio">
            <strong>Aún no tienes préstamos</strong>
            <p>Las solicitudes que envíes o recibas aparecerán aquí.</p>
          </div>
        ) : (
          <div className="lista-prestamos">
            {prestamos.map((prestamo) => {
              const esPrestamista = prestamo.prestamista_id === sesion.user.id
              const esSolicitudRecibida = !esPrestamista && prestamo.estado === 'solicitado'
              const otraPersona = esPrestamista
                ? prestamo.correo_deudor
                : prestamo.correo_prestamista
              const totalDevolucion = Number(prestamo.monto) *
                (1 + Number(prestamo.interes_pct) / 100)
              const abonosPrestamo = abonos.filter((abono) => abono.prestamo_id === prestamo.id)
              const abonosPendientes = abonosPrestamo.filter((abono) => !abono.confirmado)
              const estado = {
                solicitado: 'Pendiente',
                activo: 'Aceptado',
                pagado: 'Pagado',
                rechazado: esPrestamista ? 'Cancelado' : 'Rechazado',
              }[prestamo.estado] || prestamo.estado

              return (
                <article className="prestamo" key={prestamo.id}>
                  <div className="prestamo-cabecera">
                    <div className="prestamo-persona">
                      <span className="prestamo-avatar" aria-hidden="true">
                        {(otraPersona || '?').charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{otraPersona || 'Usuario'}</strong>
                        <small>{esPrestamista ? 'Le prestas a' : 'Te presta'}</small>
                      </div>
                    </div>
                    <span className={`prestamo-estado estado-${prestamo.estado}`}>{estado}</span>
                  </div>
                  <div className="prestamo-detalles">
                    <div>
                      <small>Monto</small>
                      <strong>{dinero(prestamo.monto)}</strong>
                    </div>
                    <div>
                      <small>Interés</small>
                      <strong>{Number(prestamo.interes_pct)}%</strong>
                    </div>
                    <div>
                      <small>Total a devolver</small>
                      <strong>{dinero(prestamo.total_a_pagar || totalDevolucion)}</strong>
                    </div>
                    <div>
                      <small>Fecha de pago</small>
                      <strong>{prestamo.fecha_pago}</strong>
                    </div>
                  </div>
                  {esSolicitudRecibida ? (
                    <div className="prestamo-acciones">
                      <p>Al aceptar, el dinero se transferirá desde la bolsa del prestamista.</p>
                      <div>
                        <button
                          type="button"
                          className="boton-primario"
                          disabled={procesandoPrestamo}
                          onClick={() => responderPrestamo(prestamo, 'aceptar')}
                        >
                          Aceptar préstamo
                        </button>
                        <button
                          type="button"
                          className="boton-secundario"
                          disabled={procesandoPrestamo}
                          onClick={() => responderPrestamo(prestamo, 'rechazar')}
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ) : prestamo.estado === 'solicitado' ? (
                    <div className="prestamo-acciones">
                      <p>La solicitud aún está esperando respuesta.</p>
                      <button
                        type="button"
                        className="boton-secundario"
                        disabled={procesandoPrestamo}
                        onClick={() => responderPrestamo(prestamo, 'rechazar')}
                      >
                        Cancelar solicitud
                      </button>
                    </div>
                  ) : null}
                  {prestamo.estado === 'activo' && !esPrestamista && (
                    <div className="abono-anticipado">
                      <p>
                        Puedes pagar antes de la fecha límite. Saldo pendiente:{' '}
                        <strong>{dinero(prestamo.pendiente)}</strong>
                      </p>
                      {abonosPendientes.length > 0 ? (
                        <div className="abonos-espera">
                          {abonosPendientes.map((abono) => (
                            <span key={abono.id}>
                              Abono de {dinero(abono.monto)} enviado; espera la confirmación de quien te prestó.
                            </span>
                          ))}
                        </div>
                      ) : Number(prestamo.pendiente) > 0 ? (
                        <form className="formulario-abono" onSubmit={(e) => registrarAbono(e, prestamo)}>
                          <label>
                            Monto a abonar
                            <input
                              type="text"
                              inputMode="decimal"
                              value={montosAbono[prestamo.id] || ''}
                              onChange={(e) => setMontosAbono((actuales) => ({
                                ...actuales,
                                [prestamo.id]: formatearMontoEntrada(e.target.value),
                              }))}
                              placeholder="0,00"
                              required
                            />
                          </label>
                          <button className="boton-primario" disabled={procesandoPrestamo}>
                            Registrar pago
                          </button>
                        </form>
                      ) : (
                        <p className="abonos-espera">No hay saldo pendiente.</p>
                      )}
                    </div>
                  )}
                  {prestamo.estado === 'activo' && esPrestamista && abonosPendientes.length > 0 && (
                    <div className="abono-anticipado">
                      <p>Abonos pendientes de confirmar</p>
                      <div className="abonos-pendientes">
                        {abonosPendientes.map((abono) => (
                          <div className="abono-pendiente" key={abono.id}>
                            <span>{dinero(abono.monto)} · {abono.fecha}</span>
                            <button
                              type="button"
                              className="boton-primario"
                              disabled={procesandoPrestamo}
                              onClick={() => confirmarAbono(abono.id)}
                            >
                              Confirmar pago
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
        </section>
      )}

      {seccionActiva === 'historial' && (
        <section className="seccion seccion-historial" aria-labelledby="historial-titulo">
        <div className="seccion-titulo">
          <div className="titulo-icono icono-historial" aria-hidden="true">↕</div>
          <div>
            <h2 id="historial-titulo">Actividad reciente</h2>
            <p>Los últimos movimientos de tu bolsa.</p>
          </div>
        </div>
        {movs.length === 0 ? (
          <div className="estado-vacio estado-historial">
            <strong>Aún no hay movimientos</strong>
            <p>Cuando registres uno, aparecerá aquí.</p>
          </div>
        ) : (
          <>
            <div className="filtros-historial">
              <label className="busqueda-movimiento">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={buscarMovimiento}
                  onChange={(e) => setBuscarMovimiento(e.target.value)}
                  placeholder="Buscar por tipo, nota, fecha o monto"
                  aria-label="Buscar movimientos"
                />
              </label>
              <label>
                Tipo
                <SelectorPersonalizado
                  ariaLabel="Filtrar por tipo de movimiento"
                  value={filtroTipoMovimiento}
                  options={[
                    { value: '', label: 'Todos los tipos' },
                    ...Object.entries(ETIQUETAS).map(([valor, etiqueta]) => ({ value: valor, label: etiqueta })),
                  ]}
                  onChange={setFiltroTipoMovimiento}
                />
              </label>
              <label>
                Desde
                <input
                  type="date"
                  value={desdeMovimiento}
                  max={hastaMovimiento || undefined}
                  onChange={(e) => setDesdeMovimiento(e.target.value)}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={hastaMovimiento}
                  min={desdeMovimiento || undefined}
                  onChange={(e) => setHastaMovimiento(e.target.value)}
                />
              </label>
              {hayFiltrosMovimiento && (
                <button className="limpiar-filtros" onClick={limpiarFiltrosMovimiento}>
                  Limpiar
                </button>
              )}
            </div>
            <p className="resultado-filtros" aria-live="polite">
              {hayFiltrosMovimiento
                ? `${movimientosFiltrados.length} de ${movs.length} movimientos`
                : `${movs.length} movimientos recientes`}
            </p>
            {movimientosFiltrados.length === 0 ? (
              <div className="estado-vacio estado-historial">
                <strong>No encontramos movimientos</strong>
                <p>Prueba cambiando la búsqueda o los filtros seleccionados.</p>
                <button className="enlace limpiar-sin-resultados" onClick={limpiarFiltrosMovimiento}>
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="tabla-contenedor">
                <table>
                  <thead>
                    <tr>
                      <th>Movimiento</th>
                      <th>Fecha y hora</th>
                      <th>Frecuencia</th>
                      <th className="der">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosFiltrados.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <span className={`movimiento-punto ${ENTRAN.includes(m.tipo) ? 'punto-entra' : 'punto-sale'}`} />
                          <span className="movimiento-nombre">{ETIQUETAS[m.tipo]}</span>
                          {m.nota && <small className="movimiento-nota">{m.nota}</small>}
                        </td>
                        <td>
                          <span>{m.fecha}</span>
                          {m.creado_en && (
                            <small className="movimiento-hora">
                              {new Intl.DateTimeFormat('es-CO', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              }).format(new Date(m.creado_en))}
                            </small>
                          )}
                        </td>
                        <td>
                          {ETIQUETAS_FRECUENCIA[m.tipo] ? (
                            <span className={`frecuencia-etiqueta frecuencia-${ETIQUETAS_FRECUENCIA[m.tipo].estilo}`}>
                              {ETIQUETAS_FRECUENCIA[m.tipo].texto}
                            </span>
                          ) : m.frecuencia ? (
                            <span className={`frecuencia-etiqueta frecuencia-${m.frecuencia}`}>
                              {m.frecuencia === 'fijo' ? 'Fijo' : 'Variable'}
                            </span>
                          ) : '—'}
                        </td>
                        <td className={`der monto-movimiento ${ENTRAN.includes(m.tipo) ? 'entra' : 'sale'}`}>
                          {ENTRAN.includes(m.tipo) ? '+' : '−'} {dinero(m.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        </section>
      )}

      {['presupuestos', 'analisis', 'calendario'].includes(seccionActiva) && (
        <FinanzasExtras
          vista={seccionActiva}
          usuarioId={sesion.user.id}
          movimientos={movs}
          categorias={categorias}
          presupuestos={presupuestos}
          recurrentes={recurrentes}
          prestamos={prestamos}
          metas={metas}
          onRecargar={cargar}
          onError={setError}
          dinero={dinero}
        />
      )}

      {estilo === 'arcade' && metaCompletada && (
        <div className="arcade-level-overlay" role="dialog" aria-modal="true" aria-labelledby="arcade-level-title">
          <div className="arcade-level-panel">
            <span className="arcade-level-kicker">★ PLAYER 1 · BONUS ★</span>
            <span className="arcade-level-icon" aria-hidden="true">✓</span>
            <h2 id="arcade-level-title">LEVEL COMPLETE!</h2>
            <p>Meta desbloqueada</p>
            <strong>{metaCompletada.nombre}</strong>
            <button
              type="button"
              className="boton-primario arcade-level-button"
              onClick={() => setMetaCompletada(null)}
            >
              CONTINUAR
            </button>
          </div>
        </div>
      )}

      {estilo === 'arcade' && gameOver && (
        <div className="arcade-game-over-overlay" role="dialog" aria-modal="true" aria-labelledby="arcade-game-over-title">
          <div className="arcade-game-over-panel">
            <span className="arcade-game-over-kicker">SYSTEM ALERT · PLAYER 1</span>
            <span className="arcade-game-over-icon" aria-hidden="true">×</span>
            <h2 id="arcade-game-over-title">GAME OVER</h2>
            <p aria-live="assertive">
              {saldo < 0 ? 'Tu bolsa está en negativo.' : 'Tu bolsa está en cero.'}
            </p>
            <strong>Recarga tu saldo para continuar</strong>
            <button
              type="button"
              className="boton-primario arcade-level-button"
              onClick={() => setGameOver(false)}
            >
              CONTINUAR
            </button>
          </div>
        </div>
      )}

      <footer className="pie-pagina">Tus finanzas, a tu ritmo.</footer>
    </main>
  )
}