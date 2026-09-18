# Campus · Sistema escolar

Sistema para ventas escolares en bolivianos, inventario, recibos, caja, QR y control de material prestado a profesores.

## Supabase

1. Crea un proyecto gratuito en [Supabase](https://supabase.com/).
2. Ejecuta [supabase-schema.sql](supabase-schema.sql) en el SQL Editor.
3. Copia `.env.example` como `.env.local` y coloca la URL y la clave `anon` pública del proyecto.
4. Reinicia `npm run dev`.

Sin variables de Supabase la aplicación continúa funcionando con almacenamiento local. Cuando están configuradas, sincroniza productos, ventas, materiales, préstamos, profesores y movimientos de caja entre dispositivos.

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
- Los CSV de productos (plantilla, exportación e importación) incluyen la columna `seccion`. Si viene vacía o no coincide con una sección válida, se deduce por palabras clave de la categoría (`libro`, `agenda`, `polera`, `blusa`, `camisa`, `tela`, `deport`); si no hay coincidencia el producto queda en `VARIOS`.

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
