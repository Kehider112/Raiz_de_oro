import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import Login from './pages/login'
import RestablecerClave from './pages/restablecer-clave'

const Panel = lazy(() => import('./pages/panel'))

export default function App() {
  // undefined = todavía comprobando si hay sesión; null = sin sesión
  const [sesion, setSesion] = useState(undefined)
  const [tema, setTema] = useState(() => (
    localStorage.getItem('tema-raiz-oro') === 'oscuro' ? 'oscuro' : 'claro'
  ))
  const cambiarTema = () => setTema((actual) => actual === 'claro' ? 'oscuro' : 'claro')
  const [estilo, setEstilo] = useState(() => {
    const guardado = localStorage.getItem('estilo-raiz-oro')
    if (guardado === 'liquid') return 'arcade'
    return ['clasico', 'arcade', 'android'].includes(guardado) ? guardado : 'clasico'
  })

  useEffect(() => {
    document.documentElement.dataset.tema = tema
    document.documentElement.style.colorScheme = tema
    localStorage.setItem('tema-raiz-oro', tema)
    const metaTema = document.querySelector('meta[name="theme-color"]')
    if (metaTema) metaTema.setAttribute('content', tema === 'oscuro' ? '#151b18' : '#f7f6ef')
  }, [tema])

  useEffect(() => {
    document.documentElement.dataset.estilo = estilo
    localStorage.setItem('estilo-raiz-oro', estilo)
  }, [estilo])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (sesion === undefined) return <p className="centrado">Cargando...</p>

  return (
    <BrowserRouter>
      <Suspense fallback={<p className="centrado">Cargando...</p>}>
        <Routes>
          <Route
            path="/restablecer-clave"
            element={
              <RestablecerClave
                tema={tema}
                onCambiarTema={cambiarTema}
                estilo={estilo}
                onCambiarEstilo={setEstilo}
              />
            }
          />
          <Route
            path="/login"
            element={sesion
              ? <Navigate to="/" />
              : <Login
                  tema={tema}
                  onCambiarTema={cambiarTema}
                  estilo={estilo}
                  onCambiarEstilo={setEstilo}
                />}
          />
          <Route
            path="/"
            element={sesion
              ? <Panel
                  sesion={sesion}
                  tema={tema}
                  onCambiarTema={cambiarTema}
                  estilo={estilo}
                  onCambiarEstilo={setEstilo}
                />
              : <Navigate to="/login" />}
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}