import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import SelectorEstilo from '../components/selector-estilo'
import Logo from '../components/logo'
import { traducirErrorAuth } from '../utils/mensajes-auth'

const formatearTiempo = (milisegundos) => {
  const segundos = Math.ceil(milisegundos / 1000)
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
}

const formatearMinutos = (milisegundos) => {
  const totalMinutos = Math.ceil(milisegundos / 60000)
  const horas = Math.floor(totalMinutos / 60)
  const minutos = totalMinutos % 60
  const partes = []
  if (horas > 0) partes.push(`${horas} ${horas === 1 ? 'hora' : 'horas'}`)
  if (minutos > 0) partes.push(`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`)
  return partes.join(' y ') || 'menos de 1 minuto'
}

const tiempoRestante = (fecha) => Math.max(0, new Date(fecha || 0).getTime() - Date.now())

export default function Login({ tema, onCambiarTema, estilo, onCambiarEstilo }) {
  const [modoRegistro, setModoRegistro] = useState(false)
  const [modoRecuperacion, setModoRecuperacion] = useState(false)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)
  const [tiempoRecuperacion, setTiempoRecuperacion] = useState(0)
  const [tiempoLogin, setTiempoLogin] = useState(0)
  const [mostrarClave, setMostrarClave] = useState(false)

  useEffect(() => {
    if (!modoRecuperacion || tiempoRecuperacion <= 0) return undefined
    const intervalo = window.setInterval(() => {
      setTiempoRecuperacion((actual) => Math.max(0, actual - 1000))
    }, 1000)
    return () => window.clearInterval(intervalo)
  }, [modoRecuperacion, tiempoRecuperacion])

  useEffect(() => {
    if (modoRecuperacion || tiempoLogin <= 0) return undefined
    const intervalo = window.setInterval(() => {
      setTiempoLogin((actual) => Math.max(0, actual - 1000))
    }, 1000)
    return () => window.clearInterval(intervalo)
  }, [modoRecuperacion, tiempoLogin])

  async function solicitarRestablecimiento(e) {
    e.preventDefault()
    setError('')
    setMensaje('')

    setCargando(true)
    const { data: limite, error: errorLimite } = await supabase.rpc('solicitar_recuperacion', {
      p_correo: correo,
    })

    if (errorLimite) {
      setError(`No se pudo solicitar la recuperación: ${traducirErrorAuth(errorLimite)}`)
      setCargando(false)
      return
    }

    const restante = tiempoRestante(limite.bloqueado_hasta)
    setTiempoRecuperacion(restante)
    if (!limite.permitido) {
      setError(`Demasiados intentos. Espera ${formatearTiempo(restante)}.`)
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(correo, {
        redirectTo: `${window.location.origin}/restablecer-clave`,
      })
      if (error) {
        setError(`No se pudo enviar el correo de recuperación: ${traducirErrorAuth(error)}`)
      } else {
        setMensaje('Revisa tu correo. Te enviamos un enlace para crear una nueva contraseña.')
      }
    }
    setCargando(false)
  }

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setMensaje('')
    setCargando(true)

    if (!modoRegistro) {
      const { data: limite, error: errorLimite } = await supabase.rpc('controlar_intento_login', {
        p_correo: correo,
        p_resultado: 'consultar',
      })
      if (errorLimite) {
        setError(`No se pudo validar el acceso: ${traducirErrorAuth(errorLimite)}`)
        setCargando(false)
        return
      }

      const restante = tiempoRestante(limite.bloqueado_hasta)
      setTiempoLogin(restante)
      if (restante > 0) {
        setError('')
        setCargando(false)
        return
      }
    }

    const { error } = modoRegistro
      ? await supabase.auth.signUp({
          email: correo,
          password: clave,
          options: { data: { nombre } },
        })
      : await supabase.auth.signInWithPassword({ email: correo, password: clave })

    if (error) {
      setError(traducirErrorAuth(error))
      if (!modoRegistro) {
        const { data: limite, error: errorLimite } = await supabase.rpc('controlar_intento_login', {
          p_correo: correo,
          p_resultado: 'fallo',
        })
        if (errorLimite) {
          setError(`No se pudo registrar el intento: ${traducirErrorAuth(errorLimite)}`)
        } else {
          const restante = tiempoRestante(limite.bloqueado_hasta)
          setTiempoLogin(restante)
          if (restante > 0) {
            setError('')
          }
        }
      }
    } else if (modoRegistro) {
      setMensaje('Tu cuenta fue creada. Si te pedimos confirmar el correo, revisa tu bandeja de entrada.')
    } else {
      const { error: errorLimite } = await supabase.rpc('controlar_intento_login', {
        p_correo: correo,
        p_resultado: 'exito',
      })
      if (errorLimite) console.error('No se pudo reiniciar el límite de inicio de sesión.', errorLimite)
    }
    setCargando(false)
  }

  return (
    <main className="pantalla-acceso">
      <section className="acceso-presentacion">
        <a className="marca marca-acceso" href="/" aria-label="Raíz de Oro, inicio">
          <Logo />
        </a>
        <div className="presentacion-contenido">
          <span className="presentacion-etiqueta">ORDENA · AHORRA · AVANZA</span>
          <h1>Tu tranquilidad financiera empieza aquí.</h1>
          <p>Ten tus movimientos y metas en un solo lugar, con claridad y a tu propio ritmo.</p>
          <div className="presentacion-resumen" aria-hidden="true">
            <div className="resumen-mini-icono">↗</div>
            <div>
              <strong>Pequeños pasos, grandes metas</strong>
              <span>Haz que cada decisión cuente.</span>
            </div>
            <span className="resumen-mini-check">✓</span>
          </div>
        </div>
        <span className="presentacion-pie">Un espacio para construir tus planes.</span>
        <span className="presentacion-circulo circulo-uno" aria-hidden="true" />
        <span className="presentacion-circulo circulo-dos" aria-hidden="true" />
      </section>

      <section className="acceso-formulario">
        <button
          className="boton-tema acceso-tema"
          type="button"
          onClick={onCambiarTema}
          aria-label="Modo oscuro"
          aria-pressed={tema === 'oscuro'}
          title={tema === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'}
        >
          <span aria-hidden="true">{tema === 'claro' ? '☾' : '☀'}</span>
        </button>
        <div className="acceso-controles">
          <SelectorEstilo estilo={estilo} onCambiarEstilo={onCambiarEstilo} />
        </div>
        <div className="formulario-contenido">
          <div className="acceso-movil-marca">
            <Logo />
          </div>
          <span className="sobrelinea">{modoRegistro ? 'EMPIEZA HOY' : 'QUÉ BUENO VERTE'}</span>
          <h2>{modoRecuperacion ? 'Restablece tu contraseña' : modoRegistro ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
          <p className="acceso-descripcion">
            {modoRecuperacion
              ? 'Escribe tu correo y te enviaremos un enlace para recuperarla.'
              : modoRegistro
              ? 'Regístrate para empezar a organizar tus finanzas.'
              : 'Ingresa tus datos para continuar con tus finanzas.'}
          </p>

          <form onSubmit={modoRecuperacion ? solicitarRestablecimiento : enviar} className="form-acceso">
            {modoRegistro && !modoRecuperacion && (
              <label>
                Nombre
                <input
                  type="text"
                  autoComplete="name"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="¿Cómo te llamas?"
                  required
                />
              </label>
            )}
            <label>
              Correo electrónico
              <input
                type="email"
                autoComplete="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tu@correo.com"
                required
              />
            </label>
            {!modoRecuperacion && <label>
              Contraseña
              <span className="campo-clave">
                <input
                  type={mostrarClave ? 'text' : 'password'}
                  autoComplete={modoRegistro ? 'new-password' : 'current-password'}
                  minLength={6}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                />
                <button
                  className="ver-clave"
                  type="button"
                  onClick={() => setMostrarClave(!mostrarClave)}
                  aria-label={mostrarClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={mostrarClave}
                >
                  {mostrarClave ? 'Ocultar' : 'Mostrar'}
                </button>
              </span>
            </label>}

            {error && <p className="error mensaje-acceso" role="alert">{error}</p>}
            {mensaje && <p className="mensaje-exito" role="status">{mensaje}</p>}
            {modoRecuperacion && tiempoRecuperacion > 0 && (
              <p className="mensaje-espera" role="status">
                Puedes volver a solicitar un enlace en {formatearTiempo(tiempoRecuperacion)}.
              </p>
            )}
            {!modoRecuperacion && tiempoLogin > 0 && (
              <p className="mensaje-bloqueo-login" role="alert">
                Inicio de sesión bloqueado temporalmente. Faltan {formatearMinutos(tiempoLogin)} para volver a intentarlo.
              </p>
            )}

            <button
              className="boton-primario boton-acceso"
              disabled={cargando || (modoRecuperacion ? tiempoRecuperacion > 0 : tiempoLogin > 0)}
            >
              {cargando
                ? 'Un momento...'
                : modoRecuperacion
                  ? 'Enviar enlace'
                : modoRegistro
                  ? 'Crear mi cuenta'
                  : 'Iniciar sesión'}
              {!cargando && <span aria-hidden="true">→</span>}
            </button>
          </form>

          {!modoRegistro && !modoRecuperacion && (
            <button
              className="enlace enlace-recuperacion"
              type="button"
              onClick={() => {
                setModoRecuperacion(true)
                setError('')
                setMensaje('')
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          <div className="cambio-modo">
            <span>
              {modoRecuperacion
                ? '¿Recordaste tu contraseña?'
                : modoRegistro
                  ? '¿Ya tienes una cuenta?'
                  : '¿Primera vez por aquí?'}
            </span>
            <button
              type="button"
              className="enlace"
              onClick={() => {
                setModoRecuperacion(false)
                setModoRegistro(modoRecuperacion ? false : !modoRegistro)
                setError('')
                setMensaje('')
              }}
            >
              {modoRecuperacion ? 'Inicia sesión' : modoRegistro ? 'Inicia sesión' : 'Crea una cuenta'}
            </button>
          </div>
          <p className="acceso-seguro"><span aria-hidden="true">◇</span> Tus datos se mantienen privados y seguros</p>
        </div>
      </section>
    </main>
  )
}