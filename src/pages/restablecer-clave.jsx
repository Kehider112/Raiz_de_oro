import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import SelectorEstilo from '../components/selector-estilo'
import Logo from '../components/logo'
import { traducirErrorAuth } from '../utils/mensajes-auth'

export default function RestablecerClave({ tema, onCambiarTema, estilo, onCambiarEstilo }) {
  const navigate = useNavigate()
  const [clave, setClave] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cargando, setCargando] = useState(false)

  async function actualizarClave(e) {
    e.preventDefault()
    setError('')
    setMensaje('')

    if (clave.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (clave !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setCargando(true)
    const { error: errorActualizacion } = await supabase.auth.updateUser({ password: clave })
    if (errorActualizacion) {
      setError(traducirErrorAuth(errorActualizacion))
    } else {
      setMensaje('Tu contraseña fue actualizada. Ya puedes iniciar sesión.')
      setClave('')
      setConfirmacion('')
      setTimeout(() => navigate('/login'), 1500)
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
          <span className="presentacion-etiqueta">VUELVE A ESTAR AL DÍA</span>
          <h1>Tu tranquilidad financiera empieza aquí.</h1>
          <p>Recupera el acceso a tu espacio y continúa organizando tus planes.</p>
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
          <span className="sobrelinea">NUEVA CONTRASEÑA</span>
          <h2>Crea una nueva contraseña</h2>
          <p className="acceso-descripcion">Elige una contraseña segura para proteger tu cuenta.</p>
          <form onSubmit={actualizarClave} className="form-acceso">
            <label>
              Nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </label>
            <label>
              Repite la contraseña
              <input
                type="password"
                autoComplete="new-password"
                minLength={6}
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder="Escríbela de nuevo"
                required
              />
            </label>
            {error && <p className="error mensaje-acceso" role="alert">{error}</p>}
            {mensaje && <p className="mensaje-exito" role="status">{mensaje}</p>}
            <button className="boton-primario boton-acceso" disabled={cargando}>
              {cargando ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
          <button className="enlace enlace-recuperacion" type="button" onClick={() => navigate('/login')}>
            Volver al inicio de sesión
          </button>
        </div>
      </section>
    </main>
  )
}
