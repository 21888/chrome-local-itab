# Local iTab Extension


<img width="640" height="400" alt="p1 (3)" src="https://github.com/user-attachments/assets/f072e511-7ded-45da-9cd5-4725efd4cd28" />
<img width="640" height="400" alt="p1 (1)" src="https://github.com/user-attachments/assets/74106bd6-98f8-4ac1-8328-02f2323687ec" />
<img width="640" height="400" alt="p1 (2)" src="https://github.com/user-attachments/assets/d020a9a6-6971-48f0-9abd-10da306d5731" />
<img width="640" height="400" alt="p1 (4)" src="https://github.com/user-attachments/assets/56076d9f-9d46-4fde-bff7-0f104512d889" />
<img width="640" height="400" alt="p1 (5)" src="https://github.com/user-attachments/assets/26868e31-a6f5-4811-a1d1-730755638a3d" />
Una página de nueva pestaña de Chrome privada y enfocada en lo local para búsquedas, accesos directos y contexto personal ligero. Funciona sin conexión por defecto, con mejoras en línea opcionales que deben habilitarse explícitamente.

## Nuevas Adiciones

- Renovación visual para lanzamiento público con una interfaz de utilidad moderada
- Validación de plantillas de URL de búsqueda compartidas para el tablero y la configuración
- Documentación de lanzamiento y privacidad en `docs/`
- Control en línea desactivado por defecto para la obtención de favicons
- Módulo de búsqueda con Google, Bing, DuckDuckGo y plantillas de URL personalizadas
- Tarjetas locales de clima, temas candentes y películas mantenidas por el usuario
- Menú contextual con tema personalizado con acciones de categoría y accesos directos
- Caché persistente de favicons: prioritario IndexedDB; TTL de 7 días; sin peticiones de red a menos que se habilite
- Internacionalización a través de `chrome.i18n` con `_locales/en` y `_locales/zh_CN`

## Características

- **Sin conexión por defecto**: Las nuevas instalaciones no realizan peticiones externas a menos que se habiliten las mejoras en línea
- **Tablero personalizable**: Visualización de hora, búsqueda, accesos directos, clima local, temas candentes y tarjetas de películas
- **Múltiples motores de búsqueda**: Soporte para Google, Bing, DuckDuckGo y búsquedas personalizadas
- **Personalización de fondo**: Carga de imágenes, colores sólidos o degradados
- **Importar/Exportar**: Copia de seguridad y restauración de configuración mediante JSON
- **Visibilidad de módulos**: Mostrar/ocultar diferentes componentes del tablero
- **Internacionalización**: Los elementos del menú y los diálogos están localizados mediante chrome.i18n
- **Caché de iconos**: Los favicons almacenados en caché pueden reutilizarse sin conexión
- **Sincronización de Chrome**: Sincronización de configuración opcional, omitiendo activos locales grandes cuando sea necesario

## Privacidad y Comportamiento de Red

Local iTab está diseñado priorizando la privacidad:

- Estado predeterminado: ninguna petición de favicon ni feeds remotos de clima/temas candentes/películas.
- Obtención de favicons en línea: desactivada por defecto; cuando se habilita, la extensión puede solicitar `https://www.google.com/s2/favicons`.
- Búsqueda: escribir no envía datos a ningún lugar; se realiza una petición solo después de enviar una búsqueda o abrir una URL.
- Los datos del usuario se almacenan en `chrome.storage.local`; la Sincronización de Chrome es opcional y está sujeta a la cuota de sincronización de Chrome.

## Instalación

1. Abre Chrome y navega a `chrome://extensions/`
2. Habilita el "Modo de desarrollador" en la parte superior derecha
3. Haz clic en "Cargar descomprimida" y selecciona la carpeta `local-itab`
4. La extensión sustituirá tu página de nueva pestaña

## Uso de i18n

- Añade mensajes en `_locales/<locale>/messages.json`
- En HTML, usa los atributos `data-i18n` y `data-i18n-title`; en JS usa `i18n.t('key')`

## Caché de Favicons

- API: `faviconCache.getIconDataUrl(origin)`, `faviconCache.invalidate(origin)`, `faviconCache.prefetch(origin)`, `faviconCache.setOnlineEnabled(enabled)`
- Utilizado por los accesos directos para resolver iconos en caché; la obtención por red está desactivada hasta que la configuración de privacidad la habilite

## Menú Contextual

- Se inicializa en la página de nueva pestaña; solo se activa en los encabezados/listas de categorías y elementos de acceso directo
- Acciones: `open_all` para categorías; `open`, `edit`, `delete` para tarjetas de sitios

## Desarrollo

Esta extensión está construida con:
- Manifest V3
- Vanilla JavaScript (sin dependencias externas)
- Chrome Storage API para la persistencia de datos locales
- Diseño responsivo con CSS Grid

## Dirección de Diseño

Local iTab debe sentirse como una utilidad de navegador tranquila, no como una página de marketing. El flujo de trabajo principal es la búsqueda más los accesos directos locales. Las funciones opcionales de clima, temas, películas, sincronización e imágenes en línea deben permanecer visualmente secundarias y explícitas.

Consulta `.impeccable.md` para el contexto de diseño utilizado por los agentes de implementación.

## Preparación del Lanzamiento

- `docs/privacy-summary.md` resume el comportamiento de red desactivado por defecto.
- `docs/release-checklist.md` enumera las comprobaciones de preparación para la Chrome Web Store.
- Antes de empaquetar, recarga la extensión descomprimida, verifica ambos idiomas y confirma que la instalación predeterminada no realice peticiones externas.

## Estructura de Archivos

```
local-itab/
├── manifest.json           # Manifiesto de la extensión
├── newtab.html            # Página de nueva pestaña
├── newtab.css             # Estilos de la nueva pestaña
├── newtab.js              # Lógica de la nueva pestaña
├── options.html           # Página de configuración
├── options.css            # Estilos de configuración
├── options.js             # Lógica de configuración
├── assets/                # Iconos de la extensión
└── README.md              # Este archivo
```

## Requisitos

- Navegador Chrome con soporte para Manifest V3
- No se requiere conexión a internet para el funcionamiento predeterminado

## Licencia

Este proyecto es de código abierto y está disponible bajo la Licencia MIT.
