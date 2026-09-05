# dajarony-OCCT

Laboratorio CAD web para generar geometría real con Open CASCADE desde el navegador usando `opencascade.js` (WebAssembly).

## Primer objetivo

Un modelo paramétrico interactivo de una caja electrónica. El usuario puede cambiar largo, ancho, alto y radio del orificio; Open CASCADE regenera un sólido B-Rep y lo exporta a GLB para visualizarlo en el navegador.

## Ejecutar

```bash
npm install
npm run dev
```

Después abre la URL que muestra Vite.

## Arquitectura

`controles HTML -> opencascade.js / OCCT -> B-Rep -> mallado -> GLB -> model-viewer`

Este repositorio es un experimento independiente; no modifica el repositorio oficial de OCCT.
