# Campus · Sistema escolar

Sistema para ventas escolares en bolivianos, inventario, recibos, caja, QR y control de material prestado a profesores.

## Supabase

1. Crea un proyecto gratuito en [Supabase](https://supabase.com/).
2. Ejecuta [supabase-schema.sql](supabase-schema.sql) en el SQL Editor.
3. Copia `.env.example` como `.env.local` y coloca la URL y la clave `anon` pública del proyecto.
4. Reinicia `npm run dev`.

Sin variables de Supabase la aplicación continúa funcionando con almacenamiento local. Cuando están configuradas, sincroniza productos, ventas, materiales, préstamos, profesores, clientes, estudiantes, compras de libros registradas, pedidos, movimientos de caja, cuentas por cobrar y el saldo inicial de caja. La carga pagina los resultados completos; los guardados se envían en lotes pequeños, solo para registros que cambiaron, y nunca borran filas remotas. **Configuración** muestra cuántos productos se confirmaron en Supabase, los errores y el estado del esquema; “Sincronizar ahora” fuerza una nueva revisión.

Si el proyecto Supabase ya existía, vuelve a ejecutar [supabase-schema.sql](supabase-schema.sql) para crear/actualizar las tablas y columnas que requiere esta versión, incluidas las de estudiantes y control de libros por curso.

Si la carga encuentra productos en ventas históricas que ya no están en el catálogo, los recupera con stock cero. Verifica el stock real antes de venderlos. Los productos que no aparecen ni en el catálogo local ni en ventas históricas deben recuperarse desde una copia de seguridad o importarse desde un CSV; la aplicación no puede reconstruir datos que ya no están en ninguna fuente.

Cada aplicación vendida debe usar su propio proyecto de Supabase y sus propias credenciales. La aplicación conserva el historial y no elimina filas automáticamente; configura y prueba las copias de seguridad/restauración del proyecto Supabase y vigila el uso de almacenamiento y límites del plan para evitar interrupciones por cuota.

## Administración

- **Cuentas por cobrar** registra deudas de cualquier gestión, los datos de padres/tutores y estudiantes, contratos, compromisos, situación INFOCRED y pagos parciales o totales con su historial. Estos pagos se guardan únicamente como abonos de la deuda y **no crean ingresos ni movimientos de caja**.
- **Recordatorios** avisa desde tres días antes y hasta marcar como realizado: descuentos del personal (día 1), INFOCRED y SEDEM (día 10), Ministerio de Trabajo (día 11) y Gestora (día 21). La confirmación mensual se guarda en el dispositivo.
- En **Configuración** se puede activar el tema oscuro; la preferencia se guarda en el dispositivo.
- En **Inventario**, “Imprimir todos los QRs” prepara etiquetas pequeñas de todos los productos en hoja A4.
- En **Libros por curso**, vincula cada estudiante con su familia, asigna libros existentes del inventario a uno o más cursos e imprime la lista para las familias o el control de compras. En una venta de esos libros se debe seleccionar al estudiante; el sistema impide vender un libro de otro curso o repetir uno ya registrado. Las compras realizadas fuera del sistema se pueden marcar manualmente. Las ventas antiguas sin estudiante no se asignan automáticamente: deben registrarse manualmente para el alumno correcto. Los libros pendientes son informativos y no obligan a comprarlos.

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
