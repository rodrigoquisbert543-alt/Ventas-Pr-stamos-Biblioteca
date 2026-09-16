# Campus · Sistema escolar

Sistema para ventas escolares en bolivianos, inventario, recibos, caja, QR y control de material prestado a profesores.

## Supabase

1. Crea un proyecto gratuito en [Supabase](https://supabase.com/).
2. Ejecuta [supabase-schema.sql](supabase-schema.sql) en el SQL Editor.
3. Copia `.env.example` como `.env.local` y coloca la URL y la clave `anon` pública del proyecto.
4. Reinicia `npm run dev`.

Sin variables de Supabase la aplicación continúa funcionando con almacenamiento local. Cuando están configuradas, sincroniza productos, ventas, materiales, préstamos, profesores y movimientos de caja entre dispositivos.

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
