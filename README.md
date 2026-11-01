# Raiz de Oro

Aplicacion de finanzas personales con movimientos, metas de ahorro y prestamos.

## Complementos financieros

Para activar presupuestos por categoria, ejecuta una vez
`bases_de_datos/mejoras_finanzas.sql` en el SQL Editor de Supabase.
Al terminar, recarga la pagina. La migracion solicita tambien recargar el
cache del esquema de la API. Si el error persiste, vuelve a ejecutar
`NOTIFY pgrst, 'reload schema';` en el SQL Editor y espera unos segundos.

Los movimientos recurrentes usan la tabla `movimientos_fijos` y la funcion
`generar_movimientos_fijos()` del esquema principal. Para generarlos cada dia,
activa `pg_cron` en Supabase y programa esta tarea:

```sql
select cron.schedule(
  'movimientos-fijos',
  '5 0 * * *',
  'select generar_movimientos_fijos()'
);
```

La aplicacion permite consultar graficas y alertas, gestionar presupuestos y
movimientos recurrentes, ver un calendario financiero y exportar informes CSV
(compatible con Excel) o imprimirlos como PDF desde el navegador.
