# Campus · Sistema escolar

Sistema para ventas escolares en bolivianos, inventario, recibos, caja, QR y control de material prestado a profesores.

## Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. En **Authentication > Users**, invita o crea `rodrigoquisbert543@gmail.com` y establece la contraseña directamente en Supabase. Desactiva los registros públicos.
3. Para el informe de caja, invita también `rodrigoquisbert543+reportes@gmail.com`. Es una cuenta separada, destinada únicamente a consultar por RPC las ventas y movimientos del día actual. No puede usar la aplicación ni leer las tablas directamente.
4. Ejecuta [supabase-schema.sql](supabase-schema.sql) en el SQL Editor. Las políticas permiten acceso de la app solo a la cuenta autorizada; `anon` no tiene permisos sobre las tablas.
5. Copia `.env.example` como `.env.local` y coloca la URL y la clave `anon`/publishable pública del proyecto. Nunca coloques la clave `service_role` en la app ni en Apps Script.
6. Reinicia `npm run dev` e inicia sesión en cada dispositivo con la cuenta autorizada.

Sin variables de Supabase la aplicación continúa funcionando con almacenamiento local. Cuando están configuradas, requiere iniciar sesión con la cuenta autorizada y sincroniza productos, ventas, materiales, préstamos, profesores, clientes, estudiantes, compras de libros registradas, pedidos, movimientos de caja, cuentas por cobrar, recordatorios personales y el saldo inicial de caja. La clave pública no concede acceso a las tablas sin una sesión autenticada. La carga pagina los resultados completos; los guardados se envían en lotes pequeños, solo para registros que cambiaron, y nunca borran filas remotas. Los dispositivos vuelven a consultar Supabase cada 30 segundos y al recuperar el foco o la conexión para reflejar cambios hechos en otro dispositivo. **Configuración** muestra cuántos productos se confirmaron en Supabase, los errores y el estado del esquema; “Sincronizar ahora” fuerza una nueva revisión.

Si el proyecto Supabase ya existía, vuelve a ejecutar [supabase-schema.sql](supabase-schema.sql) para crear/actualizar las tablas y columnas que requiere esta versión, incluidas las de estudiantes y control de libros por curso.

Si la carga encuentra productos en ventas históricas que ya no están en el catálogo, los recupera con stock cero. Verifica el stock real antes de venderlos. Los productos que no aparecen ni en el catálogo local ni en ventas históricas deben recuperarse desde una copia de seguridad o importarse desde un CSV; la aplicación no puede reconstruir datos que ya no están en ninguna fuente.

Cada aplicación vendida debe usar su propio proyecto de Supabase y sus propias credenciales. La aplicación conserva el historial y no elimina filas automáticamente; configura y prueba las copias de seguridad/restauración del proyecto Supabase y vigila el uso de almacenamiento y límites del plan para evitar interrupciones por cuota.

## Administración

- **Cuentas por cobrar** registra deudas de cualquier gestión, los datos de padres/tutores y estudiantes, contratos, compromisos, situación INFOCRED y pagos parciales o totales con su historial. Estos pagos se guardan únicamente como abonos de la deuda y **no crean ingresos ni movimientos de caja**.
- La importación CSV de **Cuentas por cobrar** toma solo `NOMBRE COMPLETO` y `MONTO DEUDA`; deja gestión y seguimiento vacíos. Cada cuenta permite guardar teléfono WhatsApp, notas, próxima fecha de contacto y un mensaje personalizable que se abre en WhatsApp para revisar y enviar manualmente. La app muestra avisos de seguimientos vencidos o para hoy.
- **Recordatorios** avisa desde tres días antes y hasta marcar como realizado: descuentos del personal (día 1), INFOCRED y SEDEM (día 10), Ministerio de Trabajo (día 11) y Gestora (día 21). La confirmación mensual y los recordatorios personales se sincronizan entre dispositivos con Supabase.
- En **Configuración** se puede activar el tema oscuro; la preferencia se guarda en el dispositivo.
- En **Inventario**, “Imprimir todos los QRs” prepara etiquetas pequeñas de todos los productos en hoja A4.
- En **Libros por curso**, vincula cada estudiante con su familia, asigna libros existentes del inventario a uno o más cursos e imprime la lista para las familias o el control de compras. En una venta de esos libros se debe seleccionar al estudiante; el sistema impide vender un libro de otro curso o repetir uno ya registrado. Las compras realizadas fuera del sistema se pueden marcar manualmente. Las ventas antiguas sin estudiante no se asignan automáticamente: deben registrarse manualmente para el alumno correcto. Los libros pendientes son informativos y no obligan a comprarlos.

### Informe diario en Google Sheets

El script [scripts/daily-caja.gs](scripts/daily-caja.gs) prepara el registro del día a las 21:00 de Bolivia desde el 12 de noviembre de 2026: suma el efectivo en una fila, registra cada cobro QR por separado y agrega los egresos de Caja. Usa las pestañas mensuales del libro y actualiza sus propias filas si se ejecuta de nuevo.

Para activarlo, abre el libro de caja en Google Sheets, ve a **Extensiones > Apps Script**, copia el contenido de `scripts/daily-caja.gs` en `Code.gs` y guarda. En **Configuración del proyecto > Propiedades de secuencia de comandos**, configura `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_REPORT_EMAIL` (`rodrigoquisbert543+reportes@gmail.com`) y `SUPABASE_REPORT_PASSWORD` con la contraseña de esa cuenta. La contraseña debe guardarse solo como propiedad del proyecto Apps Script; nunca la compartas ni la incluyas en el repositorio o en la app. El script inicia sesión como la cuenta limitada y llama a una función que devuelve únicamente las ventas y movimientos del día actual. Ejecuta `installDailyReportTrigger` una vez y autoriza el acceso solicitado por Google. La ejecución diaria de Apps Script puede ocurrir unos minutos alrededor de las 21:00; el script falla explícitamente si falta una pestaña o los encabezados no coinciden, sin alterar la hoja.

### Actualización de la tabla `products`

Si tu proyecto de Supabase ya estaba creado, ejecuta esta sentencia en el SQL Editor para habilitar la sección de resumen por producto:

```sql
alter table products add column if not exists section text not null default '';
```

## Secciones del resumen

Cada producto guarda una **sección del resumen** (`section`), que es la tarjeta donde se acumulan sus ventas en las vistas *Resumen* e *Historial*: Libros, Agendas, Poleras, Blusas y camisas, Tela, Deportivos y Varios.

- Al registrar un producto (`Nuevo producto`) la sección es obligatoria: elige la que corresponde para que la venta no caiga en *Varios*.
- Al editar un producto (`Editar producto`) puedes corregir la sección; las ventas ya registradas se reacomodan automáticamente al recalcular el resumen.
- En inventario, la columna *Categoría / sección* muestra la sección asignada bajo la categoría.
- Los CSV de productos (plantilla, exportación e importación) incluyen `seccion` y `cursos`; en `cursos`, los cursos asignados se separan con `|`. Si `seccion` viene vacía o no coincide con una sección válida, se deduce por palabras clave de la categoría (`libro`, `agenda`, `polera`, `blusa`, `camisa`, `tela`, `deport`); si no hay coincidencia el producto queda en `VARIOS`.

## Desarrollo

```bash
npm install
npm run dev
```
La rama `master` es la rama de producción conectada a Vercel. Cada push a `master` genera automáticamente un despliegue de producción.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
