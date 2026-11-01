export default function Logo({ className = '' }) {
  return (
    <span className={`marca-contenido ${className}`.trim()}>
      <span className="marca-logo" aria-hidden="true">
        <svg viewBox="0 0 160 120" role="presentation">
          <path
            className="marca-forma-principal"
            d="M22 18h52c24 0 38 13 38 31 0 17-11 28-29 31 12 4 22 13 31 27 9 14 19 20 34 19-25 9-43 1-56-17l-26-37c24 1 36-7 36-22 0-12-9-19-24-19H48v32l-17-12V35c0-10-3-15-9-17Z"
          />
          <path className="marca-hoja-superior" d="M15 43c28 4 50 15 57 39-18-17-36-25-57-39Z" />
          <path className="marca-hoja-inferior" d="M57 72c-2 17-10 29-25 33 12-10 10-22 14-31 3-7 7-10 11-2Z" />
          <path className="marca-tallo" d="M22 43c30 7 47 21 50 48-7-22-20-35-42-42Z" />
          <path className="marca-destello" d="m125 7 3 12 12 3-12 3-3 13-3-13-12-3 12-3Z" />
          <path className="marca-destello-secundario" d="m91 98 3 9 9 3-9 2-3 10-3-10-9-2 9-3Z" />
        </svg>
      </span>
      <span className="marca-nombre">
        <span>RAÍZ DE</span>
        <strong>ORO</strong>
      </span>
      <span className="marca-ornamento" aria-hidden="true">
        <span />
        <b>✦</b>
        <span />
      </span>
    </span>
  )
}
