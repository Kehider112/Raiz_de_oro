import { useState } from 'react'
import { supabase } from '../supabase'
import SelectorEstilo from '../components/selector-estilo'
import Logo from '../components/logo'

export default function Login({ tema, onCambiarTema, estilo, onCambiarEstilo }) {
  const [modoRegistro, setModoRegistro] = useState(false)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mostrarClave, setMostrarClave] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setMensaje('')
    setCargando(true)

    const { error } = modoRegistro
      ? await supabase.auth.signUp({
          email: correo,
          password: clave,
          options: { data: { nombre } },
        })
      : await supabase.auth.signInWithPassword({ email: correo, password: clave })

    if (error) {
      setError(error.message)
    } else if (modoRegistro) {
      setMensaje('Tu cuenta fue creada. Si te pedimos confirmar el correo, revisa tu bandeja de entrada.')
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
          <h2>{modoRegistro ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
          <p className="acceso-descripcion">
            {modoRegistro
              ? 'Regístrate para empezar a organizar tus finanzas.'
              : 'Ingresa tus datos para continuar con tus finanzas.'}
          </p>

          <form onSubmit={enviar} className="form-acceso">
            {modoRegistro && (
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
            <label>
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
            </label>

            {error && <p className="error mensaje-acceso" role="alert">{error}</p>}
            {mensaje && <p className="mensaje-exito" role="status">{mensaje}</p>}

            <button className="boton-primario boton-acceso" disabled={cargando}>
              {cargando
                ? 'Un momento...'
                : modoRegistro
                  ? 'Crear mi cuenta'
                  : 'Iniciar sesión'}
              {!cargando && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="cambio-modo">
            <span>{modoRegistro ? '¿Ya tienes una cuenta?' : '¿Primera vez por aquí?'}</span>
            <button
              className="enlace"
              onClick={() => {
                setModoRegistro(!modoRegistro)
                setError('')
                setMensaje('')
              }}
            >
              {modoRegistro ? 'Inicia sesión' : 'Crea una cuenta'}
            </button>
          </div>
          <p className="acceso-seguro"><span aria-hidden="true">◇</span> Tus datos se mantienen privados y seguros</p>
        </div>
      </section>
    </main>
  )
}